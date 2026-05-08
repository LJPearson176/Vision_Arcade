import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { initializeMediaPipe, getPoseLandmarker } from "@/lib/mediapipe";
import { ClimbControlMapper, ClimbControls } from "@/lib/climbControlMapping";
import { ClimbPhysics, ClimbGameState } from "@/lib/climbGameLogic";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { initWebcam, cleanupWebcam, type WebcamError } from "@/lib/webcam";

type GameState = "MENU" | "COUNTDOWN" | "CLIMBING" | "GAME_OVER";

const MCPTowerClimb = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [gameState, setGameState] = useState<GameState>("MENU");
  const [countdown, setCountdown] = useState(3);
  const [finalScore, setFinalScore] = useState(0);
  const [finalHeight, setFinalHeight] = useState(0);
  const [nodesDodged, setNodesDodged] = useState(0);
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
  const [currentControls, setCurrentControls] = useState<ClimbControls | null>(null);
  const [climbFlash, setClimbFlash] = useState(false);
  const [cameraError, setCameraError] = useState<WebcamError | null>(null);
  
  const streamRef = useRef<MediaStream | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const controlMapperRef = useRef<ClimbControlMapper>(new ClimbControlMapper());
  const physicsRef = useRef<ClimbPhysics>(new ClimbPhysics());
  const gameDataRef = useRef<ClimbGameState>(physicsRef.current.createInitialState());

  const playerMeshRef = useRef<THREE.Group | null>(null);
  const spriteMeshRef = useRef<THREE.Sprite | null>(null);
  const leftArmTextureRef = useRef<THREE.Texture | null>(null);
  const rightArmTextureRef = useRef<THREE.Texture | null>(null);
  const towerRef = useRef<THREE.Mesh | null>(null);
  const mcpLettersRef = useRef<THREE.Group[]>([]);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  // Initialize MediaPipe
  useEffect(() => {
    initializeMediaPipe()
      .then(() => setIsMediaPipeReady(true))
      .catch(console.error);
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000508);
    scene.fog = new THREE.FogExp2(0x00c6ff, 0.008);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 25);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x111122, 0.3);
    scene.add(ambientLight);

    // MCP Tower
    const towerGeometry = new THREE.BoxGeometry(15, 1000, 5);
    const towerMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.7,
      roughness: 0.3,
    });
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.set(0, 0, -30);
    scene.add(tower);
    towerRef.current = tower;

    // MCP Letters - Start them high above player
    const letterPositions = [200, 300, 400];
    const letters = ["M", "C", "P"];

    letters.forEach((letter, i) => {
      const letterGroup = new THREE.Group();

      const boxGeo = new THREE.BoxGeometry(4, 6, 0.5);
      const letterMat = new THREE.MeshStandardMaterial({
        color: 0xff0066,
        emissive: 0xff0066,
        emissiveIntensity: 2.0,
      });
      const letterMesh = new THREE.Mesh(boxGeo, letterMat);
      letterGroup.add(letterMesh);

      const light = new THREE.PointLight(0xff0066, 2, 50);
      letterGroup.add(light);

      letterGroup.position.set(0, letterPositions[i], -27);
      scene.add(letterGroup);
      mcpLettersRef.current.push(letterGroup);
    });

    // Grid Floor
    const grid = new THREE.GridHelper(200, 50, 0x00ffff, 0x00ffff);
    grid.position.y = -5;
    scene.add(grid);
    gridRef.current = grid;

    // Load alien sprite textures
    const textureLoader = new THREE.TextureLoader();
    const leftArmTexture = textureLoader.load("/src/assets/alien_l_up.png");
    const rightArmTexture = textureLoader.load("/src/assets/alien_r_up.png");
    leftArmTextureRef.current = leftArmTexture;
    rightArmTextureRef.current = rightArmTexture;

    // Alien Sprite Avatar
    const playerGroup = new THREE.Group();

    const spriteMaterial = new THREE.SpriteMaterial({
      map: leftArmTexture,
      transparent: true,
      alphaTest: 0.1,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(4, 6, 1);
    playerGroup.add(sprite);
    spriteMeshRef.current = sprite;

    const playerLight = new THREE.PointLight(0x00ffff, 2, 12);
    playerLight.position.set(0, 0, 1);
    playerGroup.add(playerLight);

    playerGroup.position.set(0, 5, -10);
    playerGroup.rotation.y = 0;
    scene.add(playerGroup);
    playerMeshRef.current = playerGroup;

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Webcam initialization
  useEffect(() => {
    const initCamera = async () => {
      if (!videoRef.current) {
        console.warn("Video element not mounted yet");
        return;
      }

      const { stream, error } = await initWebcam(videoRef.current, "MCPTowerClimb");
      
      if (error) {
        setCameraError(error);
        return;
      }
      
      if (stream) {
        streamRef.current = stream;
        setCameraError(null);
      }
    };

    initCamera();

    return () => {
      cleanupWebcam(streamRef.current, "MCPTowerClimb");
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState !== "CLIMBING") return;

    let lastTime = performance.now();
    let videoTime = -1;

    const animate = () => {
      const currentTime = performance.now();
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      // Get controls from MediaPipe
      const poseLandmarker = getPoseLandmarker();
      const video = videoRef.current;

      if (video && poseLandmarker && video.readyState >= 2) {
        if (video.currentTime !== videoTime) {
          videoTime = video.currentTime;

          try {
            const poseResult = poseLandmarker.detectForVideo(video, currentTime);
            const controls = controlMapperRef.current.extractControls(poseResult);

            setCurrentControls(controls);

            // Animate sprite based on arm states
            if (spriteMeshRef.current && leftArmTextureRef.current && rightArmTextureRef.current) {
              if (controls.leftArmState === "UP") {
                spriteMeshRef.current.material.map = leftArmTextureRef.current;
                spriteMeshRef.current.material.needsUpdate = true;
              } else if (controls.rightArmState === "UP") {
                spriteMeshRef.current.material.map = rightArmTextureRef.current;
                spriteMeshRef.current.material.needsUpdate = true;
              }
            }

            // Update game physics
            const physics = physicsRef.current;
            const state = gameDataRef.current;

            physics.updateClimbing(state, controls.climbStepDetected, dt);

            if (controls.climbStepDetected) {
              setClimbFlash(true);
              setTimeout(() => setClimbFlash(false), 100);
            }

            // Update player position and rotation
            const playerTransform = physics.updatePlayerLane(state, controls.currentLane, dt);
            if (playerMeshRef.current) {
              playerMeshRef.current.position.x = playerTransform.x;
              playerMeshRef.current.position.y = state.playerHeight;
              playerMeshRef.current.position.z = playerTransform.z;
              playerMeshRef.current.rotation.y = playerTransform.rotationY;
            }

            // Spawn nodes
            if (physics.shouldSpawnNode(state)) {
              physics.spawnMCPNode(sceneRef.current!, state, (lane) => {
                if (mcpLettersRef.current[1]) {
                  const mat = (mcpLettersRef.current[1].children[0] as THREE.Mesh)
                    .material as THREE.MeshStandardMaterial;
                  mat.emissiveIntensity = 4.0;
                  setTimeout(() => {
                    mat.emissiveIntensity = 2.0;
                  }, 200);
                }
              });
            }

            // Update nodes
            physics.updateMCPNodes(state, dt);

            // Check collisions
            const { hit } = physics.checkCollisions(state);
            if (hit) {
              setFinalScore(state.score);
              setFinalHeight(Math.floor(state.playerHeight));
              setNodesDodged(state.nodesDodged);
              setGameState("GAME_OVER");
              return;
            }

            // Cleanup old nodes
            physics.cleanupNodes(sceneRef.current!, state);

            // Update camera to follow player
            if (cameraRef.current && playerMeshRef.current) {
              const targetY = state.playerHeight + 5;
              cameraRef.current.position.y = THREE.MathUtils.lerp(cameraRef.current.position.y, targetY, 0.1);
              cameraRef.current.lookAt(0, state.playerHeight, -25);
            }

            // Scroll grid with player
            if (gridRef.current) {
              gridRef.current.position.y = state.playerHeight - 10;
            }

            // Update MCP letters position
            mcpLettersRef.current.forEach((letter, i) => {
              const baseY = [200, 300, 400][i];
              letter.position.y = baseY + Math.floor(state.playerHeight / 100) * 100;
            });
          } catch (error) {
            console.error("Pose detection error:", error);
          }
        }
      }

      // Render
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState]);

  // Countdown
  useEffect(() => {
    if (gameState !== "COUNTDOWN") return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setGameState("CLIMBING");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState]);

  const handleStart = () => {
    gameDataRef.current = physicsRef.current.createInitialState();
    controlMapperRef.current.reset();
    setCountdown(3);
    setGameState("COUNTDOWN");

    // Try to start webcam playback on explicit user interaction
    const video = videoRef.current;
    if (video && video.paused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log("Video playing after START click"))
          .catch((err) => console.error("Video play error on START click:", err));
      }
    }
  };

  const handleRetry = () => {
    // Clean up old nodes
    gameDataRef.current.mcpNodes.forEach((node) => {
      if (sceneRef.current) {
        sceneRef.current.remove(node.mesh);
        node.mesh.geometry.dispose();
        (node.mesh.material as THREE.Material).dispose();
      }
    });

    // Reset player position
    if (playerMeshRef.current) {
      playerMeshRef.current.position.set(0, 5, -10);
      playerMeshRef.current.rotation.y = 0;
    }

    handleStart();
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Webcam Preview */}
      <div
        className={`fixed bottom-8 right-8 w-64 h-48 border-2 border-neon-cyan rounded-lg overflow-hidden bg-black shadow-lg shadow-neon-cyan/50 ${
          gameState === "CLIMBING" ? "block" : "hidden"
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full scale-x-[-1] object-cover opacity-80"
        />

        {/* Pose Detection Overlay */}
        <div className="absolute inset-0 pointer-events-none font-orbitron">
          {/* Left Arm Indicator */}
          <div className="absolute top-2 left-2 flex items-center gap-1">
            <div
              className={`w-3 h-3 rounded-full ${
                currentControls?.leftArmState === "UP"
                  ? "bg-neon-yellow animate-pulse shadow-lg shadow-neon-yellow"
                  : "bg-neon-cyan/30"
              }`}
            />
            <span className="text-xs text-neon-cyan">L</span>
          </div>

          {/* Right Arm Indicator */}
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <span className="text-xs text-neon-cyan">R</span>
            <div
              className={`w-3 h-3 rounded-full ${
                currentControls?.rightArmState === "UP"
                  ? "bg-neon-yellow animate-pulse shadow-lg shadow-neon-yellow"
                  : "bg-neon-cyan/30"
              }`}
            />
          </div>

          {/* Tower Face Indicator */}
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                currentControls?.currentLane === 0
                  ? "bg-neon-pink animate-pulse shadow-lg shadow-neon-pink"
                  : "bg-neon-cyan/20"
              }`}
            />
            <div
              className={`w-2 h-2 rounded-full ${
                currentControls?.currentLane === 1
                  ? "bg-neon-pink animate-pulse shadow-lg shadow-neon-pink"
                  : "bg-neon-cyan/20"
              }`}
            />
            <span className="text-xs text-neon-cyan">FACE</span>
            <div
              className={`w-2 h-2 rounded-full ${
                currentControls?.currentLane === 2
                  ? "bg-neon-pink animate-pulse shadow-lg shadow-neon-pink"
                  : "bg-neon-cyan/20"
              }`}
            />
            <div
              className={`w-2 h-2 rounded-full ${
                currentControls?.currentLane === 3
                  ? "bg-neon-pink animate-pulse shadow-lg shadow-neon-pink"
                  : "bg-neon-cyan/20"
              }`}
            />
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* MENU */}
      {gameState === "MENU" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-void/80 backdrop-blur-sm">
          {cameraError && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-3 rounded-lg text-sm max-w-lg z-50">
              <div className="font-bold mb-1">⚠️ Camera Error</div>
              <div className="text-xs">{cameraError.message}</div>
            </div>
          )}
          <h1 className="text-7xl font-orbitron font-black text-neon-pink mb-8 neon-glow-pink">MCP TOWER CLIMB</h1>
          <p className="text-neon-cyan text-xl mb-4 font-orbitron">Computer Vision Edition</p>
          <div className="max-w-2xl mb-12 text-center space-y-3 text-foreground/80">
            <p className="text-lg font-bold text-neon-cyan">HOW TO CLIMB:</p>
            <p className="text-lg">• Raise one arm UP overhead, then pull it DOWN</p>
            <p className="text-lg">• Alternate between LEFT and RIGHT arms</p>
            <p className="text-lg">• Lean your body LEFT or RIGHT to move around the tower</p>
            <p className="text-lg text-neon-pink">• Dodge the falling MCP energy nodes!</p>
          </div>
          <Button
            onClick={handleStart}
            disabled={!isMediaPipeReady}
            className="px-12 py-8 text-3xl font-orbitron bg-neon-pink/20 border-4 border-neon-pink text-neon-pink hover:bg-neon-pink hover:text-background"
            style={{ boxShadow: "0 0 30px hsl(330 100% 50% / 0.5)" }}
          >
            {isMediaPipeReady ? "START CLIMB" : "LOADING..."}
          </Button>
          <Button onClick={() => navigate("/")} variant="outline" className="mt-6 text-neon-cyan border-neon-cyan">
            Back to Arcade
          </Button>
        </div>
      )}

      {/* COUNTDOWN */}
      {gameState === "COUNTDOWN" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-void/70 backdrop-blur-sm">
          <div className="text-9xl font-orbitron font-black text-neon-pink animate-pulse neon-glow-pink">
            {countdown}
          </div>
          <div className="mt-12 text-center space-y-4 text-neon-cyan">
            <p className="text-2xl font-bold">GET READY!</p>
            <p className="text-xl">Raise arms overhead, then pull down</p>
            <p className="text-xl">Alternate LEFT and RIGHT arms</p>
            <p className="text-lg text-neon-pink">Lean left/right to move around tower</p>
          </div>
        </div>
      )}

      {/* Climb Step Flash Effect */}
      {climbFlash && <div className="absolute inset-0 bg-neon-cyan/20 animate-fade-out pointer-events-none" />}

      {/* HUD */}
      {gameState === "CLIMBING" && (
        <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start font-orbitron pointer-events-none">
          <div className="space-y-2">
            <div className="text-neon-cyan text-3xl">DEPTH: {Math.floor(gameDataRef.current.playerHeight)}</div>
            {gameDataRef.current.combo > 1 && (
              <div className="text-neon-pink text-xl animate-pulse">COMBO x{gameDataRef.current.combo}</div>
            )}
          </div>
          <div className="text-neon-yellow text-3xl">SCORE: {gameDataRef.current.score}</div>
        </div>
      )}

      {/* GAME OVER */}
      {gameState === "GAME_OVER" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-void/90 backdrop-blur-md">
          <h1 className="text-6xl font-orbitron font-black text-neon-pink mb-8 neon-glow-pink animate-pulse">
            DEREZZED
          </h1>
          <p className="text-2xl text-foreground/70 mb-12">TR0N hit by MCP energy</p>
          <div className="space-y-4 mb-12 text-center">
            <div className="text-3xl font-orbitron text-neon-cyan">
              Tower Depth: <span className="text-neon-yellow">{finalHeight}</span>
            </div>
            <div className="text-3xl font-orbitron text-neon-cyan">
              Final Score: <span className="text-neon-yellow">{finalScore}</span>
            </div>
            <div className="text-2xl font-orbitron text-neon-cyan">
              Nodes Dodged: <span className="text-neon-yellow">{nodesDodged}</span>
            </div>
          </div>
          <div className="flex gap-6">
            <Button
              onClick={handleRetry}
              className="px-10 py-6 text-2xl font-orbitron bg-neon-pink/20 border-4 border-neon-pink text-neon-pink hover:bg-neon-pink hover:text-background"
              style={{ boxShadow: "0 0 20px hsl(330 100% 50% / 0.5)" }}
            >
              CLIMB AGAIN
            </Button>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              className="px-10 py-6 text-2xl font-orbitron border-neon-cyan text-neon-cyan"
            >
              Back to Arcade
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCPTowerClimb;
