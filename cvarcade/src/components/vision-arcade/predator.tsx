
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { CVClimbState, HeadState } from '@/hooks/use-pose-tracking';

interface PredatorProps {
  climbState: CVClimbState | null;
  headState: HeadState | null;
  mouthOpenness: number;
  onGameOver: (result: 'Win' | 'Lose') => void;
  onReturnToMenu: () => void;
}

// Game Constants
const BASE_SPEED = 2.0;
const CLIMB_SPEED_MULTIPLIER = 4.0;
const CAMERA_BOB_AMOUNT = 0.15;
const CAMERA_BOB_SPEED = 10.0;
const RETICLE_MOVE_RANGE_X = 2;
const RETICLE_MOVE_RANGE_Y = 1.5;
const BASE_RETICLE_SCALE = 0.5;
const MAX_EXTRA_RETICLE_SCALE = 1.5;
const ARM_BOB_AMOUNT = 0.8;
const ARM_LERP_SPEED = 0.15; // Smoothing factor for arm movement

type GameStatus = 'countdown' | 'running' | 'gameOver';

export function Predator({
  climbState,
  headState,
  mouthOpenness,
  onGameOver,
  onReturnToMenu,
}: PredatorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const game = useRef({
    status: 'countdown' as GameStatus,
    player: {
      position: 0, // z-position in the tunnel
      speed: 0,
      lane: 0, // 0: floor, 1: right, 2: ceiling, 3: left
    },
    cameraBob: 0,
    stepsPerSecond: 0,
    lastTime: 0,
  });

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const tunnelGroupRef = useRef<THREE.Group | null>(null);
  const jawsReticleRef = useRef<THREE.Sprite | null>(null);
  const leftArmRef = useRef<THREE.Sprite | null>(null);
  const rightArmRef = useRef<THREE.Sprite | null>(null);
  const animationFrameId = useRef<number>();

  const [status, setStatus] = useState<GameStatus>('countdown');
  const [countdown, setCountdown] = useState(3);

  const latestClimbState = useRef(climbState);
  const latestHeadState = useRef(headState);
  const latestMouthOpenness = useRef(mouthOpenness);

  useEffect(() => {
    latestClimbState.current = climbState;
    latestHeadState.current = headState;
    latestMouthOpenness.current = mouthOpenness;
  }, [climbState, headState, mouthOpenness]);
  
  const stepHistory = useRef<number[]>([]);

  const gameLoop = useCallback(() => {
    if (game.current.status !== 'running') {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      return;
    }

    const now = performance.now();
    const deltaTime = (now - game.current.lastTime) / 1000;
    game.current.lastTime = now;
    
    // --- CV Input Processing ---
    const currentClimb = latestClimbState.current;
    
    if (currentClimb?.stepsThisFrame > 0) {
      stepHistory.current.push(now);
    }
    stepHistory.current = stepHistory.current.filter(t => now - t < 1000);
    game.current.stepsPerSecond = stepHistory.current.length;

    // --- Movement Logic ---
    game.current.player.speed = BASE_SPEED + game.current.stepsPerSecond * CLIMB_SPEED_MULTIPLIER;
    game.current.player.position -= game.current.player.speed * deltaTime; // Move "backwards" through the scene

    if (currentClimb) {
        switch(currentClimb.leanSide) {
            case 'LEFT': game.current.player.lane = 3; break;
            case 'RIGHT': game.current.player.lane = 1; break;
            default: // Handle transition to floor/ceiling based on current lane
                if (game.current.player.lane === 1 || game.current.player.lane === 3) {
                   // For now, just go to floor if centered from a wall
                   game.current.player.lane = 0; 
                }
                break;
        }
    }

    // --- Visual Updates ---
    const camera = cameraRef.current;
    const tunnel = tunnelGroupRef.current;
    const jaws = jawsReticleRef.current;
    const leftArm = leftArmRef.current;
    const rightArm = rightArmRef.current;

    if (camera && tunnel && jaws && leftArm && rightArm) {
      // Camera Position & Bob
      game.current.cameraBob += game.current.stepsPerSecond * CAMERA_BOB_SPEED * deltaTime;
      const bobOffset = Math.sin(game.current.cameraBob) * CAMERA_BOB_AMOUNT;
      
      camera.position.y = 1 + bobOffset;
      camera.position.z = game.current.player.position; // Camera follows the player's z-position

      // Arm animation
      const leftArmUp = currentClimb?.leftArmState === 'UP';
      const rightArmUp = currentClimb?.rightArmState === 'UP';

      // Base position for arms, attached to camera's FOV.
      const armBaseY = -1.6;

      // Calculate target positions
      const leftArmTargetY = armBaseY + bobOffset + (leftArmUp ? ARM_BOB_AMOUNT : -ARM_BOB_AMOUNT);
      const rightArmTargetY = armBaseY + bobOffset + (rightArmUp ? ARM_BOB_AMOUNT : -ARM_BOB_AMOUNT);
      const leftArmTargetZ = -2.5 + (leftArmUp ? -0.2 : 0.2);
      const rightArmTargetZ = -2.5 + (rightArmUp ? -0.2 : 0.2);

      // Smoothly interpolate (lerp) to target positions
      leftArm.position.y += (leftArmTargetY - leftArm.position.y) * ARM_LERP_SPEED;
      leftArm.position.z += (leftArmTargetZ - leftArm.position.z) * ARM_LERP_SPEED;

      rightArm.position.y += (rightArmTargetY - rightArm.position.y) * ARM_LERP_SPEED;
      rightArm.position.z += (rightArmTargetZ - rightArm.position.z) * ARM_LERP_SPEED;

      // Tunnel Wrapping Logic
      const tunnelLength = 40;
      tunnel.children.forEach(ring => {
          if ((ring as THREE.Mesh).position.z > camera.position.z + 2) {
             (ring as THREE.Mesh).position.z -= tunnelLength;
          }
      });


      // Jaws Reticle
      const headX = latestHeadState.current?.x ?? 0;
      const headY = latestHeadState.current?.y ?? 0;
      jaws.position.x = -headX * RETICLE_MOVE_RANGE_X;
      jaws.position.y = -headY * RETICLE_MOVE_RANGE_Y;
      
      const openness = latestMouthOpenness.current ?? 0;
      const scale = BASE_RETICLE_SCALE + openness * MAX_EXTRA_RETICLE_SCALE;
      jaws.scale.set(scale, scale, 1);
    }
    
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    animationFrameId.current = requestAnimationFrame(gameLoop);
  }, []);

  // Countdown -> Running state machine
  useEffect(() => {
    if (status !== 'countdown') return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          game.current.status = 'running';
          game.current.lastTime = performance.now();
          setStatus('running');
          animationFrameId.current = requestAnimationFrame(gameLoop);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status, gameLoop]);


  // Three.js Scene Setup
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // --- Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100010);
    scene.fog = new THREE.Fog(0x100010, 10, 30);
    sceneRef.current = scene;
    
    // --- Camera ---
    const camera = new THREE.PerspectiveCamera(90, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 1, 0);
    cameraRef.current = camera;
    
    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);
    
    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xff00ff, 1, 15);
    camera.add(pointLight); // Light is attached to camera
    scene.add(camera);

    // --- Tunnel ---
    const tunnelGroup = new THREE.Group();
    tunnelGroupRef.current = tunnelGroup;
    scene.add(tunnelGroup);
    const ringGeometry = new THREE.RingGeometry(5, 5.2, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: '#7DF9FF',
        emissive: '#7DF9FF',
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide
    });

    for(let i = 0; i < 20; i++) {
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.z = -i * 2;
        ring.rotation.x = Math.PI / 2;
        tunnelGroup.add(ring);
    }
    
    const textureLoader = new THREE.TextureLoader();

    // --- Jaws Reticle ---
    const jawsTexture = textureLoader.load('/assets/images/jaws_reticle.png');
    const jawsMaterial = new THREE.SpriteMaterial({ map: jawsTexture, color: 0x00ff00, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
    const jawsReticle = new THREE.Sprite(jawsMaterial);
    jawsReticle.position.z = -3;
    camera.add(jawsReticle); // Attach to camera
    jawsReticleRef.current = jawsReticle;

    // --- Arm Sprites ---
    const leftArmTexture = textureLoader.load('/assets/images/predator_l_arm.png');
    const leftArmMaterial = new THREE.SpriteMaterial({ map: leftArmTexture, transparent: true, depthTest: false });
    const leftArm = new THREE.Sprite(leftArmMaterial);
    leftArm.scale.set(4, 4, 1);
    leftArm.position.set(-2.2, -1.8, -2.5);
    camera.add(leftArm);
    leftArmRef.current = leftArm;

    const rightArmTexture = textureLoader.load('/assets/images/predator_r_arm.png');
    const rightArmMaterial = new THREE.SpriteMaterial({ map: rightArmTexture, transparent: true, depthTest: false });
    const rightArm = new THREE.Sprite(rightArmMaterial);
    rightArm.scale.set(4, 4, 1);
    rightArm.position.set(2.2, -1.8, -2.5);
    camera.add(rightArm);
    rightArmRef.current = rightArm;


    // --- Start Countdown ---
    setStatus('countdown');

    // --- Handlers & Cleanup ---
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const { clientWidth, clientHeight } = mountRef.current;
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(clientWidth, clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (mount && renderer.domElement) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);


  return (
    <div className="w-full h-full absolute inset-0 text-white">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* HUD */}
      <div className="absolute top-4 left-4 z-20 font-mono text-xl">
        <div>SPEED: <span className="font-bold text-primary">{game.current.player.speed.toFixed(1)}</span></div>
        <div>CLIMB CADENCE: <span className="font-bold text-primary">{game.current.stepsPerSecond}</span></div>
      </div>

      {status === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
          <div className="font-headline text-9xl text-accent animate-ping">
            {countdown > 0 ? countdown : ''}
          </div>
        </div>
      )}

      <Button
        variant="outline"
        onClick={onReturnToMenu}
        className="absolute top-4 right-4 z-20"
      >
        Return to Menu
      </Button>

      <div className="absolute bottom-4 left-4 z-20 bg-black/50 p-2 rounded-md max-w-sm">
        <h3 className="font-bold font-headline">PREDATOR CONTROLS:</h3>
        <p><span className="text-primary font-bold">CLIMB:</span> Alternate raising arms up and down.</p>
        <p><span className="text-primary font-bold">STEER:</span> Lean your upper body left or right.</p>
        <p><span className="text-primary font-bold">AIM:</span> Move your head to position the jaws.</p>
        <p><span className="text-primary font-bold">BITE:</span> Open your mouth to increase bite size.</p>
      </div>
    </div>
  );
}
