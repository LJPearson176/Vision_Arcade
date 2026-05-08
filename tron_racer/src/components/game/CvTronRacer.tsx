import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { initializeMediaPipe, getPoseLandmarker, getHandLandmarker, getFaceLandmarker } from "@/lib/mediapipe";
import { ControlCalibrator, type CalibrationPhase } from "@/lib/controlMapping";
import { GamePhysics, GameState } from "@/lib/gameLogic";
import { GridSystem } from "@/lib/game/GridSystem";
import { CitySkyline } from "@/lib/game/CitySkyline";
import redRepeaterImage from "@/assets/red_repeater.png";
import lightcycleImage from "@/assets/player_view.png";
import lightcycleFxAudio from "@/assets/lightcycle_fx.wav";
import retroLaserAudio from "@/assets/retro_laser.wav";
import ArcadeTachometer from "./ArcadeTachometer";
import MiniMapRadar from "./MiniMapRadar";
import { initWebcam, cleanupWebcam, type WebcamError } from "@/lib/webcam";

const AUDIO_TRACKS = [
  { name: "Lightcycle", src: lightcycleFxAudio },
  { name: "Retro Laser", src: retroLaserAudio }
];

type GamePhase = "loading" | "calibrating" | "ready" | "playing" | "paused" | "crashed";

export default function CvTronRacer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const calibratorRef = useRef<ControlCalibrator | null>(null);
  const phaseRef = useRef<GamePhase>("loading"); // Ref to track phase for animation loop
  const [showArcadeMenu, setShowArcadeMenu] = useState(true);
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationPhase, setCalibrationPhase] = useState<CalibrationPhase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [speed, setSpeed] = useState(0);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lean, setLean] = useState(0);
  const [controlStatus, setControlStatus] = useState("");
  const [shoulderPosition, setShoulderPosition] = useState(0.5); // 0 to 1, where 0.5 is center
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(0.4); // Volume state (0-1)
  const [rpm, setRpm] = useState(1000);
  const [gear, setGear] = useState(1);
  const [canShift, setCanShift] = useState(false);
  const [shiftGestureDetected, setShiftGestureDetected] = useState(false);
  const [autoDownshiftWarning, setAutoDownshiftWarning] = useState(false);
  const lastShiftTimeRef = useRef(0); // Debounce shifting
  const lastGearRef = useRef(1); // Track gear changes for UI feedback
  
  // Eye blink detection states
  const [eyesClosedDuration, setEyesClosedDuration] = useState(0);
  const [startCountdown, setStartCountdown] = useState(0);
  const eyesClosedStartRef = useRef<number | null>(null);
  
  // Pause screen states
  const [isPausedByBlink, setIsPausedByBlink] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [lastSwipeX, setLastSwipeX] = useState<number | null>(null);
  const lastPinchDistance = useRef<number | null>(null);
  const missedHandFramesRef = useRef<number>(0);
  const pauseEyeClosedStartRef = useRef<number | null>(null);
  const lastVolumeFeedbackRef = useRef<number>(0);
  const lastVolumeValueRef = useRef<number>(0.4);
  const [showVolumeBar, setShowVolumeBar] = useState(false);
  const volumeBarTimeoutRef = useRef<number | null>(null);
  
  const [cameraError, setCameraError] = useState<WebcamError | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(true);
  
  // Start background music on component mount
  useEffect(() => {
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio(AUDIO_TRACKS[currentTrackIndex].src);
      bgMusicRef.current.loop = true;
      bgMusicRef.current.volume = volume;
      
      // Auto-play with user interaction handling
      const playBgMusic = () => {
        bgMusicRef.current?.play().catch(err => {
          console.log('Background music autoplay prevented, waiting for user interaction:', err);
        });
      };
      
      // Try to play immediately
      playBgMusic();
      
      // Also try on first click anywhere
      const handleFirstClick = () => {
        playBgMusic();
        document.removeEventListener('click', handleFirstClick);
      };
      document.addEventListener('click', handleFirstClick);
      
      return () => {
        document.removeEventListener('click', handleFirstClick);
      };
    }
    
    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
        bgMusicRef.current = null;
      }
      if (volumeBarTimeoutRef.current) {
        clearTimeout(volumeBarTimeoutRef.current);
      }
    };
  }, []);
  
  // Update background music when track changes
  useEffect(() => {
    if (bgMusicRef.current) {
      const wasPlaying = !bgMusicRef.current.paused;
      const currentTime = bgMusicRef.current.currentTime;
      
      bgMusicRef.current.pause();
      bgMusicRef.current.src = AUDIO_TRACKS[currentTrackIndex].src;
      bgMusicRef.current.volume = volume;
      bgMusicRef.current.loop = true;
      
      if (wasPlaying) {
        bgMusicRef.current.play().catch(err => console.log('Error playing new track:', err));
      }
    }
  }, [currentTrackIndex]);

  // Keep phaseRef in sync with phase state
  useEffect(() => {
    phaseRef.current = phase;
    console.log('📍 Phase updated:', phase);
  }, [phase]);

  // Audio management - play looping sound during gameplay
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(lightcycleFxAudio);
      audioRef.current.loop = true;
      audioRef.current.volume = volume;
    }

    if (phase === "playing") {
      console.log('🔊 Starting lightcycle audio loop');
      audioRef.current.play().catch(err => console.error('Audio play error:', err));
    } else {
      console.log('🔇 Stopping lightcycle audio');
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Cleanup on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [phase]);

  // Update audio volume when volume state changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    if (bgMusicRef.current) {
      bgMusicRef.current.volume = volume;
    }
  }, [volume]);
  
  // Function to play volume feedback beep
  const playVolumeBeep = (volumeLevel: number) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      // Frequency correlates with volume (200Hz to 800Hz)
      oscillator.frequency.value = 200 + (volumeLevel * 600);
      oscillator.type = 'sine';
      
      // Short beep
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
      
      // Clean up
      setTimeout(() => {
        audioContext.close();
      }, 200);
    } catch (error) {
      console.error('Error playing volume beep:', error);
    }
  };

  // Function to play eye detection chime (two-tone notification)
  const playEyeDetectionChime = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // First tone (higher pitch)
      const osc1 = audioContext.createOscillator();
      const gain1 = audioContext.createGain();
      osc1.frequency.value = 800; // High C
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(0.2, audioContext.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(audioContext.destination);
      osc1.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.15);
      
      // Second tone (lower pitch, slightly delayed)
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.frequency.value = 600; // E
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.2, audioContext.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.start(audioContext.currentTime + 0.1);
      osc2.stop(audioContext.currentTime + 0.25);
      
      // Clean up
      setTimeout(() => {
        audioContext.close();
      }, 400);
    } catch (error) {
      console.error('Error playing eye detection chime:', error);
    }
  };

  useEffect(() => {
    if (showArcadeMenu) return;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let animationId: number;
    let lastTime = 0;
    let calibrator: ControlCalibrator;
    let physics: GamePhysics;
    let gameState: GameState;
    let bikeMesh: THREE.Mesh;
    let bikeLight: THREE.PointLight;
    let obstacleTexture: THREE.Texture;
    let lastObstacleSpawn = 0;
    let lastMediaPipeTimestamp = 0;
    let phaseStartTime = 0;
    let countdownInterval: number | null = null;
    let gridSystem: GridSystem;
    let citySkyline: CitySkyline;
    let fog: THREE.Fog;

    const init = async () => {
      if (!mountRef.current) return;

      // Initialize Three.js
      scene = new THREE.Scene();
      sceneRef.current = scene; // Store reference for restart cleanup
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      mountRef.current.appendChild(renderer.domElement);

      // Add exponential fog for dramatic atmospheric depth
      fog = new THREE.FogExp2(0x000a1a, 0.0018);
      scene.fog = fog;
      console.log('🌫️ Enhanced exponential fog initialized for atmospheric depth');

      // Create advanced grid system with shaders and walls
      gridSystem = new GridSystem(scene);
      console.log('🌐 Advanced Grid System initialized with shader materials');

      // Create distant city skyline
      citySkyline = new CitySkyline(scene);
      console.log('🏙️ City skyline initialized');

      // Create bike with lightcycle texture
      const textureLoader = new THREE.TextureLoader();
      const lightcycleTexture = textureLoader.load(lightcycleImage);
      
      // LARGER sprite for better visibility
      const bikeGeometry = new THREE.PlaneGeometry(5, 6);
      const bikeMaterial = new THREE.MeshBasicMaterial({
        map: lightcycleTexture,
        transparent: true,
        opacity: 1.0,
        blending: THREE.NormalBlending,
        depthWrite: false,
        side: THREE.FrontSide
      });
      bikeMesh = new THREE.Mesh(bikeGeometry, bikeMaterial);
      bikeMesh.renderOrder = 999; // Render on top
      // Position bike lower at bottom of screen, facing forward
      bikeMesh.position.set(0, -6.5, 8); // Moved lower on screen
      bikeMesh.rotation.y = 0; // No rotation - facing camera/forward
      scene.add(bikeMesh);
      
      // Debug box removed - no longer needed
      
      // Add bright point light on bike for visibility
      bikeLight = new THREE.PointLight(0x00ffff, 6, 30); // Increased intensity
      bikeLight.position.set(0, -6.5, 8); // Match bike position
      scene.add(bikeLight);
      
      console.log('🏍️ BIKE SETUP:');
      console.log('   Position:', bikeMesh.position);
      console.log('   Size: 5x6');
      console.log('   Rotation Y:', bikeMesh.rotation.y, 'radians (should be π for forward)');

      // Add lights
      const ambientLight = new THREE.AmbientLight(0x202020);
      scene.add(ambientLight);
      
      // Add directional light for better scene visibility
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(0, 10, 10);
      scene.add(directionalLight);

      // Position camera - adjusted for better bike visibility
      camera.position.set(0, 3, 18);
      camera.lookAt(0, -1, 0);
      
      console.log('📷 CAMERA SETUP:');
      console.log('   Position:', camera.position);
      console.log('   Looking at: (0, -1, 0)');
      console.log('   FOV:', camera.fov, 'degrees');
      
      // All debug visualizations removed
      
      // Load obstacle texture
      obstacleTexture = textureLoader.load(redRepeaterImage);

      // Initialize game objects
      calibrator = new ControlCalibrator();
      calibratorRef.current = calibrator;
      physics = new GamePhysics();
      gameState = {
        speed: 30,
        score: 0,
        bikeX: 0,  // Always start centered
        obstacles: [],
        isRunning: false,
        startTime: Date.now(),
        rpm: 1000,        // Start at idle RPM
        gear: 1,          // Start in first gear
        maxRPM: 8000,     // Redline
        canShift: false   // Can't shift until RPM builds up
      };
      gameStateRef.current = gameState;

      // Initialize webcam
      const webcamResult = await initWebcam(videoRef.current!, "CvTronRacer");
      
      if (webcamResult.error) {
        setCameraError(webcamResult.error);
        return;
      }
      
      if (webcamResult.stream) {
        streamRef.current = webcamResult.stream;
        setCameraError(null);
      }

      // Initialize MediaPipe
      try {
        await initializeMediaPipe();
        setPhase("calibrating");
        setCountdown(3);
        phaseStartTime = Date.now();
        
        // Start countdown
        countdownInterval = window.setInterval(() => {
          const elapsed = Date.now() - phaseStartTime;
          const remaining = 3 - Math.floor(elapsed / 1000);
          
          if (remaining >= 1) {
            setCountdown(remaining);
            console.log('Countdown:', remaining);
          } else {
            if (countdownInterval) {
              window.clearInterval(countdownInterval);
              countdownInterval = null;
            }
            console.log('=== COUNTDOWN COMPLETE ===');
            console.log('Calling startCalibration()...');
            calibrator.startCalibration();
            const newPhase = calibrator.getCurrentPhase();
            console.log('New calibrator phase:', newPhase);
            setCalibrationPhase(newPhase);
            phaseStartTime = Date.now();
            console.log('Phase start time reset');
          }
        }, 100);
      } catch (error) {
        console.error("Failed to initialize MediaPipe:", error);
        return;
      }

      // Handle resize
      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", handleResize);

      // Function to draw landmarks on canvas (only during calibration/paused, not gameplay)
      const drawLandmarks = (poseResult: any, handResult: any) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to match video
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Don't draw overlays during gameplay - only during calibration or paused
        const currentPhase = phaseRef.current;
        if (currentPhase === "playing") {
          return;
        }

        // Draw pose landmarks
        if (poseResult?.landmarks?.[0]) {
          const landmarks = poseResult.landmarks[0];
          
          // Draw shoulders (11, 12) and elbows (13, 14)
          const leftShoulder = landmarks[11];
          const rightShoulder = landmarks[12];
          const leftElbow = landmarks[13];
          const rightElbow = landmarks[14];

          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 3;
          ctx.fillStyle = '#00ffff';

          // Draw connections
          if (leftShoulder && rightShoulder) {
            ctx.beginPath();
            ctx.moveTo(leftShoulder.x * canvas.width, leftShoulder.y * canvas.height);
            ctx.lineTo(rightShoulder.x * canvas.width, rightShoulder.y * canvas.height);
            ctx.stroke();
          }

          if (leftShoulder && leftElbow) {
            ctx.beginPath();
            ctx.moveTo(leftShoulder.x * canvas.width, leftShoulder.y * canvas.height);
            ctx.lineTo(leftElbow.x * canvas.width, leftElbow.y * canvas.height);
            ctx.stroke();
          }

          if (rightShoulder && rightElbow) {
            ctx.beginPath();
            ctx.moveTo(rightShoulder.x * canvas.width, rightShoulder.y * canvas.height);
            ctx.lineTo(rightElbow.x * canvas.width, rightElbow.y * canvas.height);
            ctx.stroke();
          }

          // Draw points
          [leftShoulder, rightShoulder, leftElbow, rightElbow].forEach(point => {
            if (point) {
              ctx.beginPath();
              ctx.arc(point.x * canvas.width, point.y * canvas.height, 6, 0, 2 * Math.PI);
              ctx.fill();
            }
          });
        }

        // Draw hand landmarks
        if (handResult?.landmarks) {
          for (let i = 0; i < handResult.landmarks.length; i++) {
            const hand = handResult.landmarks[i];
            const handedness = handResult.handedness[i]?.[0]?.categoryName;
            
            // Use different color for right hand
            ctx.fillStyle = handedness === "Right" ? '#ffff00' : '#ff00ff';
            ctx.strokeStyle = handedness === "Right" ? '#ffff00' : '#ff00ff';
            ctx.lineWidth = 2;

            // Draw hand skeleton
            const connections = [
              [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
              [0, 5], [5, 6], [6, 7], [7, 8], // Index
              [0, 9], [9, 10], [10, 11], [11, 12], // Middle
              [0, 13], [13, 14], [14, 15], [15, 16], // Ring
              [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
              [5, 9], [9, 13], [13, 17] // Palm
            ];

            connections.forEach(([start, end]) => {
              const startPoint = hand[start];
              const endPoint = hand[end];
              if (startPoint && endPoint) {
                ctx.beginPath();
                ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
                ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
                ctx.stroke();
              }
            });

            // Draw points
            hand.forEach((point: any) => {
              if (point) {
                ctx.beginPath();
                ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 2 * Math.PI);
                ctx.fill();
              }
            });

            // Label the hand
            if (hand[0]) {
              ctx.font = '14px monospace';
              ctx.fillText(
                handedness || 'Unknown',
                hand[0].x * canvas.width + 10,
                hand[0].y * canvas.height - 10
              );
            }
            
            // During pause, highlight thumb and index finger for pinch detection
            if (phaseRef.current === "paused") {
              const thumbTip = hand[4];
              const indexTip = hand[8];
              
              if (thumbTip && indexTip) {
                // Highlight thumb tip
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(thumbTip.x * canvas.width, thumbTip.y * canvas.height, 8, 0, 2 * Math.PI);
                ctx.stroke();
                
                // Highlight index tip
                ctx.strokeStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(indexTip.x * canvas.width, indexTip.y * canvas.height, 8, 0, 2 * Math.PI);
                ctx.stroke();
                
                // Draw line between thumb and index
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(thumbTip.x * canvas.width, thumbTip.y * canvas.height);
                ctx.lineTo(indexTip.x * canvas.width, indexTip.y * canvas.height);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Calculate and display pinch distance
                const pinchDistance = Math.sqrt(
                  Math.pow(thumbTip.x - indexTip.x, 2) + 
                  Math.pow(thumbTip.y - indexTip.y, 2) +
                  Math.pow(thumbTip.z - indexTip.z, 2)
                );
                
                const midX = (thumbTip.x + indexTip.x) / 2 * canvas.width;
                const midY = (thumbTip.y + indexTip.y) / 2 * canvas.height;
                
                ctx.fillStyle = '#ff0000';
                ctx.font = 'bold 16px monospace';
                ctx.fillText(
                  `Pinch: ${pinchDistance.toFixed(3)}`,
                  midX + 10,
                  midY
                );
              }
            }
          }
        }
      };

      // Animation loop
      const animate = (now: number) => {
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        
        const currentPhase = phaseRef.current; // Get current phase from ref
        
        // Update grid system (animate and update colors)
        if (gridSystem) {
          gridSystem.update(dt, gameState?.speed || 0);
          
          // Update color zones and distance (only when playing)
          if (currentPhase === "playing" && gameState) {
            // Calculate distance traveled (speed in km/h, convert to m/s, then meters)
            const distanceThisFrame = (gameState.speed / 3.6) * dt;
            const newDistance = distanceMeters + distanceThisFrame;
            setDistanceMeters(newDistance);
            
            // Update color zones (cycles every 1000m)
            const zoneIndex = Math.floor(newDistance / 1000) % 3;
            gridSystem.updateColorZone(Math.floor(newDistance));
            
            // Update city skyline color to match
            if (citySkyline) {
              citySkyline.updateColorZone(Math.floor(newDistance));
            }
            
            // Update fog color to match current zone
            if (fog) {
              const fogColors = [
                0x000814, // Dark blue-black (cyan zone)
                0x0a0014, // Dark purple-black (purple zone)
                0x141000  // Dark yellow-black (yellow zone)
              ];
              fog.color.setHex(fogColors[zoneIndex]);
            }
          }
        }
        
        // Update city skyline animation
        if (citySkyline) {
          citySkyline.update(dt);
        }

        // Debug animation loop state during calibration
        if (currentPhase === "calibrating" && Math.random() < 0.02) {
          console.log('🔄 Animation Loop [CALIBRATING MODE]:');
          console.log('   Phase:', currentPhase);
          console.log('   Delta time:', dt.toFixed(4));
          console.log('   Timestamp:', now);
        }

        // MediaPipe inference
        const video = videoRef.current;
        const poseLandmarker = getPoseLandmarker();
        const handLandmarker = getHandLandmarker();
        const faceLandmarker = getFaceLandmarker();

        // Debug: Check MediaPipe readiness during calibration
        if (currentPhase === "calibrating" && Math.random() < 0.05) {
          console.log('📹 MediaPipe Status Check:');
          console.log('   Video exists:', !!video);
          console.log('   Video ready state:', video?.readyState);
          console.log('   Pose landmarker:', !!poseLandmarker);
          console.log('   Hand landmarker:', !!handLandmarker);
        }

        if (video && video.readyState >= 2 && poseLandmarker && handLandmarker && faceLandmarker) {
          try {
            // Always increment timestamp to ensure strict monotonic increase
            lastMediaPipeTimestamp++;
            const currentTimestamp = lastMediaPipeTimestamp;
            
            const poseResult = poseLandmarker.detectForVideo(video, currentTimestamp);
            const handResult = handLandmarker.detectForVideo(video, currentTimestamp);
            const faceResult = faceLandmarker.detectForVideo(video, currentTimestamp);

            // Always draw landmarks for visual feedback
            drawLandmarks(poseResult, handResult);
            
            // Eye blink detection for game start (only in "ready" phase)
            if (currentPhase === "ready" && faceResult?.faceBlendshapes?.[0]) {
              const blendshapes = faceResult.faceBlendshapes[0].categories;
              const leftEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
              const rightEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
              
              // Both eyes are closed if blink score > 0.5
              const bothEyesClosed = leftEyeBlink > 0.5 && rightEyeBlink > 0.5;
              
              if (bothEyesClosed) {
                if (eyesClosedStartRef.current === null) {
                  eyesClosedStartRef.current = now;
                  console.log('👁️ Eyes closed detected, starting timer...');
                }
                const duration = (now - eyesClosedStartRef.current) / 1000;
                setEyesClosedDuration(duration);
                
                // If eyes closed for 1+ seconds, trigger countdown
                if (duration >= 1.0 && startCountdown === 0) {
                  console.log('🚀 Eyes closed for 1+ second! Starting countdown...');
                  playEyeDetectionChime(); // Audio feedback for eye detection
                  setStartCountdown(3);
                  eyesClosedStartRef.current = null;
                  setEyesClosedDuration(0);
                  
                  // Start the countdown timer
                  let count = 3;
                  const countdownInterval = setInterval(() => {
                    count--;
                    setStartCountdown(count);
                    if (count === 0) {
                      clearInterval(countdownInterval);
                      startGame();
                    }
                  }, 1000);
                }
              } else {
                // Reset if eyes open
                eyesClosedStartRef.current = null;
                setEyesClosedDuration(0);
              }
            }
            
            // Eye blink detection for pause/resume (only during "playing" or "paused" phase)
            if ((currentPhase === "playing" || currentPhase === "paused") && faceResult?.faceBlendshapes?.[0]) {
              const blendshapes = faceResult.faceBlendshapes[0].categories;
              const leftEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
              const rightEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
              
              const bothEyesClosed = leftEyeBlink > 0.5 && rightEyeBlink > 0.5;
              
              if (bothEyesClosed) {
                if (pauseEyeClosedStartRef.current === null) {
                  pauseEyeClosedStartRef.current = now;
                }
                const duration = (now - pauseEyeClosedStartRef.current) / 1000;
                
                // If eyes closed for 1+ seconds, toggle pause
                if (duration >= 1.0) {
                  console.log('⏸️ Eyes closed for 1+ second! Toggling pause...');
                  playEyeDetectionChime(); // Audio feedback for eye detection
                  pauseEyeClosedStartRef.current = null;
                  
                  if (currentPhase === "playing") {
                    setPhase("paused");
                    setIsPausedByBlink(true);
                    if (gameState) gameState.isRunning = false;
                  } else if (currentPhase === "paused") {
                    setPhase("playing");
                    setIsPausedByBlink(false);
                    if (gameState) gameState.isRunning = true;
                  }
                }
              } else {
                pauseEyeClosedStartRef.current = null;
              }
            }
            
            // Hand gesture detection during pause screen
            if (currentPhase === "paused") {
              if (handResult?.landmarks?.[0]) {
                const hand = handResult.landmarks[0];
                missedHandFramesRef.current = 0; // Reset missed frames counter
                
                // Pinch detection for volume control (thumb tip to index tip)
                const thumbTip = hand[4];  // Thumb tip
                const indexTip = hand[8];  // Index finger tip
                
                // Calculate 3D distance between thumb and index finger
                const pinchDistance = Math.sqrt(
                  Math.pow(thumbTip.x - indexTip.x, 2) + 
                  Math.pow(thumbTip.y - indexTip.y, 2) +
                  Math.pow(thumbTip.z - indexTip.z, 2)
                );
                
                // Debug logging every few frames
                if (Math.random() < 0.1) {
                  console.log('🤏 PINCH DEBUG:');
                  console.log('   Hand detected:', !!hand);
                  console.log('   Pinch distance:', pinchDistance.toFixed(4));
                  console.log('   Last distance:', lastPinchDistance.current?.toFixed(4) || 'null');
                  console.log('   Current volume:', volume.toFixed(2));
                }
                
                // Map pinch distance to volume (0-1) - works on first frame!
                // EXPANDING gesture (fingers spread apart) = INCREASE volume
                // CONTRACTING gesture (fingers pinch together) = DECREASE volume
                const minDist = 0.02;  // Fingers together = quiet (0% volume)
                const maxDist = 0.20;  // Fingers spread = loud (100% volume)
                const normalizedDistance = (pinchDistance - minDist) / (maxDist - minDist);
                const newVolume = Math.max(0, Math.min(1, normalizedDistance));
                
                // Show volume bar when pinch gesture is active
                setShowVolumeBar(true);
                if (volumeBarTimeoutRef.current) {
                  clearTimeout(volumeBarTimeoutRef.current);
                }
                volumeBarTimeoutRef.current = window.setTimeout(() => {
                  setShowVolumeBar(false);
                }, 1500);
                
                // Always update volume to ensure UI reflects pinch changes
                setVolume(newVolume);
                
                // Play audio feedback if volume changed significantly (debounced)
                const volumeChange = Math.abs(newVolume - lastVolumeValueRef.current);
                const timeSinceLastFeedback = now - lastVolumeFeedbackRef.current;
                
                if (volumeChange > 0.02 && timeSinceLastFeedback > 100) {
                  console.log('🔊 Volume changed:', newVolume.toFixed(2), 'from distance:', pinchDistance.toFixed(4));
                  playVolumeBeep(newVolume);
                  lastVolumeFeedbackRef.current = now;
                  lastVolumeValueRef.current = newVolume;
                }
                
                lastPinchDistance.current = pinchDistance;
                
                // Swipe detection for track switching (wrist movement)
                const wrist = hand[0];
                const currentX = wrist.x;
                
                if (lastSwipeX !== null) {
                  const swipeDistance = currentX - lastSwipeX;
                  
                  // Swipe right (increase track index)
                  if (swipeDistance > 0.15) {
                    setCurrentTrackIndex((prev) => (prev + 1) % AUDIO_TRACKS.length);
                    setLastSwipeX(null);
                    console.log('👉 Swipe right - next track');
                  }
                  // Swipe left (decrease track index)
                  else if (swipeDistance < -0.15) {
                    setCurrentTrackIndex((prev) => (prev - 1 + AUDIO_TRACKS.length) % AUDIO_TRACKS.length);
                    setLastSwipeX(null);
                    console.log('👈 Swipe left - previous track');
                  }
                } else {
                  setLastSwipeX(currentX);
                }
              } else {
                // No hand detected during pause - allow 3 frames of tolerance before resetting
                missedHandFramesRef.current++;
                if (missedHandFramesRef.current > 3) {
                  if (Math.random() < 0.05) {
                    console.log('⚠️ PAUSE MENU: No hand detected for 3+ frames');
                  }
                  lastPinchDistance.current = null;
                  setLastSwipeX(null);
                }
              }
            } else {
              lastPinchDistance.current = null;
              missedHandFramesRef.current = 0;
              setLastSwipeX(null);
            }
            if (currentPhase === "playing" && Math.random() < 0.02) {
              console.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
              console.log('┃ MEDIAPIPE DETECTION STATUS                      ┃');
              console.log('┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫');
              console.log('┃ Pose Landmarks:', poseResult?.landmarks?.[0] ? '✓ DETECTED' : '✗ MISSING');
              if (poseResult?.landmarks?.[0]) {
                const landmarks = poseResult.landmarks[0];
                console.log('┃   Shoulders: L[11]', landmarks[11] ? '✓' : '✗', 
                           'R[12]', landmarks[12] ? '✓' : '✗');
                console.log('┃   Elbows: L[13]', landmarks[13] ? '✓' : '✗', 
                           'R[14]', landmarks[14] ? '✓' : '✗');
              }
              console.log('┃ Hand Landmarks:', handResult?.landmarks ? '✓ DETECTED' : '✗ MISSING');
              if (handResult?.landmarks) {
                console.log('┃   Hands Count:', handResult.landmarks.length);
                if (handResult.handedness) {
                  handResult.handedness.forEach((h: any, i: number) => {
                    console.log('┃   Hand', i + ':', h[0]?.categoryName || 'Unknown');
                  });
                }
              }
              console.log('┃ Calibration:', calibrator.isCalibrated() ? '✓ READY' : '✗ NOT CALIBRATED');
              console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
            }

            if (currentPhase === "calibrating") {
              const calPhase = calibrator.getCurrentPhase();
              setCalibrationPhase(calPhase);
              
              // Log every 10 frames during calibration
              if (Math.random() < 0.1) {
                console.log('🎯 Calibration phase:', calPhase, 'Progress:', calibrator.getProgress().toFixed(0) + '%');
                console.log('   Pose detected:', !!poseResult?.landmarks?.[0]);
                console.log('   Hand detected:', !!handResult?.landmarks);
              }
              
              // Automatic phase management
              if (calPhase !== 'countdown' && calPhase !== 'complete') {
                calibrator.addCalibrationSample(poseResult, handResult);
                const progress = calibrator.getProgress();
                setCalibrationProgress(progress);
                
                // After 2 seconds of sampling, move to next phase
                const elapsed = Date.now() - phaseStartTime;
                if (elapsed >= 2000) {
                  calibrator.finishCurrentPhase();
                  phaseStartTime = Date.now();
                  setCalibrationProgress(0);
                  
                  // Check if we completed all calibration
                  if (calibrator.getCurrentPhase() === 'complete') {
                    setPhase("ready");
                  }
                }
              }
            } else if (currentPhase === "playing") {
            const controls = calibrator.extractControls(poseResult, handResult);
            
            // Handle shift gesture with debouncing
            if (controls.shiftGesture && gameState.canShift) {
              const now = Date.now();
              if (now - lastShiftTimeRef.current > 200) { // 200ms debounce for faster response
                physics.shiftUp(gameState);
                lastShiftTimeRef.current = now;
              }
            }
            setShiftGestureDetected(controls.shiftGesture);
            
            // High-level gameplay logging every second
            if (Math.floor(now / 1000) % 1 === 0 && Math.floor(now) % 1000 < 20) {
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('⚡ GAMEPLAY STATE @ ' + (Date.now() - gameState.startTime)/1000 + 's');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('RPM:', gameState.rpm.toFixed(0), '/', gameState.maxRPM);
              console.log('Gear:', gameState.gear);
              console.log('Speed:', gameState.speed.toFixed(1));
              console.log('Score:', gameState.score);
              console.log('Bike X:', gameState.bikeX.toFixed(2));
              console.log('Active Obstacles:', gameState.obstacles.length);
              console.log('Controls → Position:', controls.targetPosition.toFixed(2), 
                          'Throttle:', controls.throttle.toFixed(2), 
                          'Brake:', controls.brake,
                          'Lean:', controls.lean.toFixed(2),
                          'Shift Gesture:', controls.shiftGesture ? '✓' : '✗');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            }
            
            // Update physics with target position
            physics.updatePhysics(gameState, controls.throttle, controls.brake, controls.targetPosition, dt);
            physics.moveObstacles(gameState, dt);

            // Update bike position - only X axis (left-right movement)
            // Y and Z remain fixed at bottom of screen
            const prevBikeX = bikeMesh.position.x;
            bikeMesh.position.x = gameState.bikeX;
            bikeLight.position.x = gameState.bikeX;
            
            // Keep bike pinned - no rotation, always upright and facing forward
            bikeMesh.rotation.y = 0; // Face forward (toward camera)
            bikeMesh.rotation.z = 0; // Stay upright, no lean
            bikeMesh.rotation.x = 0; // No pitch
            
            // Enhanced movement logging every 30 frames (~0.5 seconds)
            if (Math.random() < 0.03) {
              console.log('🏍️ BIKE POSITION UPDATE:');
              console.log('   Position X: ' + bikeMesh.position.x.toFixed(2) + ' (Δ' + (bikeMesh.position.x - prevBikeX).toFixed(3) + ')');
              console.log('   Position Y: ' + bikeMesh.position.y.toFixed(2) + ' (FIXED)');
              console.log('   Position Z: ' + bikeMesh.position.z.toFixed(2) + ' (FIXED)');
              console.log('   Rotation Z (lean): ' + THREE.MathUtils.radToDeg(bikeMesh.rotation.z).toFixed(1) + '°');
              console.log('   Controls Target: ' + controls.targetPosition.toFixed(3));
              console.log('   GameState bikeX: ' + gameState.bikeX.toFixed(3));
              console.log('   Track Bounds: -15 to +15');
              console.log('   Camera can see X: ~' + (camera.position.x - 20) + ' to ' + (camera.position.x + 20));
            }

            // Spawn obstacles at regular intervals (slower spawn rate)
            if (now - lastObstacleSpawn > 3500) {
              physics.spawnObstacle(scene, gameState, obstacleTexture);
              lastObstacleSpawn = now;
            }

            // Check collisions
            if (physics.checkCollisions(gameState)) {
              setPhase("crashed");
              gameState.isRunning = false;
              if (gameState.score > highScore) {
                setHighScore(gameState.score);
              }
            }

            // Update UI
            setSpeed(gameState.speed);
            setScore(gameState.score);
            setLean(controls.lean);
            setShoulderPosition(controls.targetPosition || 0.5);
            setRpm(gameState.rpm);
            setGear(gameState.gear);
            setCanShift(gameState.canShift);
            
            // Detect auto-downshift for UI feedback
            if (gameState.gear < lastGearRef.current) {
              setAutoDownshiftWarning(true);
              setTimeout(() => setAutoDownshiftWarning(false), 1500);
            }
            lastGearRef.current = gameState.gear;
            setControlStatus(
              controls.throttle > 0.5 ? "ACCELERATING" :
              controls.brake ? "BRAKING" :
              "COASTING"
            );
          }
          } catch (error) {
            console.error("❌ MediaPipe inference error:", error);
            console.error("   Phase:", currentPhase);
            console.error("   Video ready:", video?.readyState);
            console.error("   Full error:", error);
          }
        } else if (currentPhase === "calibrating") {
          // Log when MediaPipe components aren't ready during calibration
          console.warn('⚠️ MediaPipe not ready during calibration:');
          console.warn('   Video:', !!video, 'ReadyState:', video?.readyState);
          console.warn('   Pose Landmarker:', !!poseLandmarker);
          console.warn('   Hand Landmarker:', !!handLandmarker);
        }

        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };

      animationId = requestAnimationFrame(animate);

      return () => {
        console.log('[CvTronRacer] 🧹 Cleaning up game...');
        window.removeEventListener("resize", handleResize);
        if (countdownInterval) {
          window.clearInterval(countdownInterval);
        }
        cancelAnimationFrame(animationId);
        
        // Clean up grid system
        if (gridSystem) {
          gridSystem.dispose();
        }
        
        // Clean up city skyline
        if (citySkyline) {
          citySkyline.dispose();
        }
        
        // Clean up webcam
        cleanupWebcam(streamRef.current, "CvTronRacer");
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        
        renderer.dispose();
        if (mountRef.current) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    };

    init();
  }, [showArcadeMenu]);

  const clearObstaclesFromScene = () => {
    if (gameStateRef.current && sceneRef.current) {
      const scene = sceneRef.current;
      for (const obstacle of gameStateRef.current.obstacles) {
        // Remove mesh from scene
        scene.remove(obstacle.mesh);
        obstacle.mesh.geometry.dispose();
        (obstacle.mesh.material as THREE.Material).dispose();
        
        // Remove warning indicator if exists
        if (obstacle.warning) {
          scene.remove(obstacle.warning);
          obstacle.warning.geometry.dispose();
          (obstacle.warning.material as THREE.Material).dispose();
        }
      }
      gameStateRef.current.obstacles = [];
      console.log('🧹 Cleared all obstacles from scene');
    }
  };

  const startGame = () => {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║ 🎮 GAME STARTING                                       ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log('║ Initial Speed:', 30);
    console.log('║ Calibration Status:', calibratorRef.current?.isCalibrated() ? 'READY' : 'NOT READY');
    console.log('║ Timestamp:', Date.now());
    console.log('╚════════════════════════════════════════════════════════╝');
    
    // Clear any existing obstacles from previous run
    clearObstaclesFromScene();
    
    // Reset eye blink and pause states
    setEyesClosedDuration(0);
    setStartCountdown(0);
    eyesClosedStartRef.current = null;
    pauseEyeClosedStartRef.current = null;
    setIsPausedByBlink(false);
    
    // Reset distance counter
    setDistanceMeters(0);
    
    if (gameStateRef.current) {
      gameStateRef.current.isRunning = true;
      gameStateRef.current.startTime = Date.now();
      gameStateRef.current.score = 0;
      gameStateRef.current.speed = 30;
      gameStateRef.current.bikeX = 0;  // Reset bike to center
      gameStateRef.current.rpm = 1000;  // Start at idle RPM
      gameStateRef.current.gear = 1;    // Start in first gear
      gameStateRef.current.canShift = false;
    }
    
    // Recalibrate neutral position right before starting
    if (calibratorRef.current) {
      console.log('📍 Recalibrating neutral position for game start...');
      calibratorRef.current.recalibrateNeutral();
    }
    
    setPhase("playing");
    setScore(0);
    
    // Explicitly try to play video on user gesture
    const video = videoRef.current;
    if (video && video.paused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log("[CvTronRacer] ▶️  Video playing after START click"))
          .catch((err) => console.error("[CvTronRacer] Video play error on START click:", err));
      }
    }
  };

  const restart = () => {
    console.log('🔄 RESTARTING GAME - Going back to calibration...');
    
    // Clear obstacles from scene before resetting state
    clearObstaclesFromScene();
    
    if (gameStateRef.current) {
      gameStateRef.current.isRunning = false;
      gameStateRef.current.score = 0;
      gameStateRef.current.bikeX = 0;
      gameStateRef.current.rpm = 1000;
      gameStateRef.current.gear = 1;
      gameStateRef.current.canShift = false;
    }
    setPhase("calibrating");
    setCalibrationProgress(0);
    setCountdown(3);
  };

  const skipCalibration = () => {
    if (calibratorRef.current) {
      calibratorRef.current.setDefaultCalibration();
    }
    setPhase("ready");
  };

  if (showArcadeMenu) {
    return (
      <div className="relative w-full h-screen bg-void overflow-hidden flex items-center justify-center crt-scanlines crt-flicker">
        {cameraError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-3 rounded-lg text-sm max-w-lg z-50">
            <div className="font-bold mb-1">⚠️ Camera Error</div>
            <div className="text-xs">{cameraError.message}</div>
          </div>
        )}
        {/* Animated retro grid background */}
        <div className="absolute inset-0 retro-grid opacity-30" />
        
        {/* Radial gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-void/50 to-void" />
        
        {/* Corner decorative elements */}
        <div className="absolute top-8 left-8 w-32 h-32 border-l-4 border-t-4 border-neon-cyan neon-border-animated" />
        <div className="absolute top-8 right-8 w-32 h-32 border-r-4 border-t-4 border-neon-cyan neon-border-animated" />
        <div className="absolute bottom-8 left-8 w-32 h-32 border-l-4 border-b-4 border-neon-yellow neon-border-animated" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-8 right-8 w-32 h-32 border-r-4 border-b-4 border-neon-yellow neon-border-animated" style={{ animationDelay: '1s' }} />
        
        <div className="relative z-10 text-center space-y-12 px-4">
          <div className="space-y-6">
            <h1 className="text-8xl font-black text-neon-cyan font-orbitron retro-glow tracking-wider" 
                style={{ 
                  textShadow: "0 0 30px hsl(var(--neon-cyan)), 0 0 60px hsl(var(--neon-cyan)), 0 0 90px hsl(var(--neon-cyan))",
                  letterSpacing: '0.15em'
                }}>
              CV ARCADE
            </h1>
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-gradient-to-r from-neon-cyan/20 via-neon-yellow/20 to-neon-cyan/20 blur-xl" />
              <p className="relative text-2xl text-neon-yellow font-orbitron font-bold tracking-wide"
                 style={{ textShadow: "0 0 20px hsl(var(--neon-yellow))" }}>
                Computer Vision Games Collection
              </p>
            </div>
          </div>

          <div className="mt-20 flex flex-col items-center gap-16">
            {/* SELECT YOUR GAME - Top Section */}
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-neon-cyan/10 blur-2xl" />
              <h2 className="relative text-5xl text-foreground font-orbitron font-bold tracking-widest"
                  style={{ textShadow: "0 0 15px hsl(var(--neon-cyan))" }}>
                SELECT YOUR GAME
              </h2>
            </div>
            
            {/* TR0N RIDE Button - Middle Section */}
            <button
              onClick={() => {
                console.log('🎮 ENTER ARCADE clicked');
                setShowArcadeMenu(false);
                
                // Explicitly try to start camera preview on user gesture
                const video = videoRef.current;
                if (video && video.paused) {
                  const playPromise = video.play();
                  if (playPromise !== undefined) {
                    playPromise
                      .then(() => console.log("[CvTronRacer] ▶️  Video playing after ENTER ARCADE click"))
                      .catch((err) => console.error("[CvTronRacer] Video play error on ENTER ARCADE click:", err));
                  }
                }
              }}
              className="group relative px-20 py-10 bg-gradient-to-r from-neon-cyan/20 via-neon-purple/20 to-neon-cyan/20 border-4 border-neon-cyan text-neon-cyan text-4xl font-black font-orbitron rounded-xl hover:bg-neon-cyan/30 hover:border-neon-yellow hover:text-neon-yellow transition-all duration-300 transform hover:scale-105 neon-border-animated"
              style={{ 
                boxShadow: "0 0 30px hsl(var(--neon-cyan) / 0.5), inset 0 0 20px hsl(var(--neon-cyan) / 0.1)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
              <div className="relative flex items-center gap-6">
                <svg className="w-16 h-16 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M8 12h8M12 8v8" />
                </svg>
                <div className="text-left">
                  <div className="tracking-wider">TR0N RIDE</div>
                  <div className="text-sm text-neon-yellow mt-2 font-normal font-orbitron tracking-wide"
                       style={{ textShadow: "0 0 10px hsl(var(--neon-yellow))" }}>
                    Lean to Steer • Gesture to Accelerate
                  </div>
                </div>
              </div>
            </button>

            {/* MCP TOWER CLIMB Button */}
            <button
              onClick={() => window.location.href = '/mcp-tower-climb'}
              className="group relative px-20 py-10 bg-gradient-to-r from-neon-purple/20 via-neon-pink/20 to-neon-purple/20 border-4 border-neon-pink text-neon-pink text-4xl font-black font-orbitron rounded-xl hover:bg-neon-pink/30 hover:border-neon-yellow hover:text-neon-yellow transition-all duration-300 transform hover:scale-105 neon-border-animated"
              style={{ 
                boxShadow: "0 0 30px hsl(330 100% 50% / 0.5), inset 0 0 20px hsl(330 100% 50% / 0.1)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
              <div className="relative flex items-center gap-6">
                <svg className="w-16 h-16 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2 L12 22 M8 6 L12 2 L16 6" />
                </svg>
                <div className="text-left">
                  <div className="tracking-wider">MCP TOWER CLIMB</div>
                  <div className="text-sm text-neon-yellow mt-2 font-normal font-orbitron tracking-wide"
                       style={{ textShadow: "0 0 10px hsl(var(--neon-yellow))" }}>
                    Alternate Arm Reaches • Lean to Dodge
                  </div>
                </div>
              </div>
            </button>

            {/* More Games - Bottom Section */}
            <div className="text-muted-foreground text-sm font-arcade tracking-wider animate-pulse"
                 style={{ textShadow: "0 0 5px hsl(var(--muted-foreground))" }}>
              More games coming soon...
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getCalibrationInstruction = (calPhase: string) => {
    const getStepInfo = () => {
      switch (calPhase) {
        case 'countdown': return { current: 0, total: 6 };
        case 'neutral': return { current: 1, total: 6 };
        case 'lean-left': return { current: 2, total: 6 };
        case 'lean-right': return { current: 3, total: 6 };
        case 'hand-open': return { current: 4, total: 6 };
        case 'hand-closed': return { current: 5, total: 6 };
        case 'complete': return { current: 6, total: 6 };
        default: return { current: 0, total: 6 };
      }
    };

    const stepInfo = getStepInfo();

    switch (calPhase) {
      case 'countdown':
        return {
          title: 'GET READY',
          instruction: 'Position yourself so your upper body and arms are fully visible',
          detail: `Starting in ${countdown}...`,
          stepInfo,
          diagram: (
            <svg viewBox="0 0 200 200" className="w-32 h-32 mx-auto">
              {/* Head */}
              <circle cx="100" cy="40" r="20" fill="none" stroke="currentColor" strokeWidth="3"/>
              {/* Body */}
              <line x1="100" y1="60" x2="100" y2="120" stroke="currentColor" strokeWidth="3"/>
              {/* Arms extended forward */}
              <line x1="100" y1="80" x2="60" y2="90" stroke="currentColor" strokeWidth="3"/>
              <line x1="100" y1="80" x2="140" y2="90" stroke="currentColor" strokeWidth="3"/>
              {/* Hands */}
              <circle cx="60" cy="90" r="5" fill="currentColor"/>
              <circle cx="140" cy="90" r="5" fill="currentColor"/>
              {/* Legs */}
              <line x1="100" y1="120" x2="80" y2="160" stroke="currentColor" strokeWidth="3"/>
              <line x1="100" y1="120" x2="120" y2="160" stroke="currentColor" strokeWidth="3"/>
            </svg>
          )
        };
      case 'neutral':
        return {
          title: 'NEUTRAL POSITION',
          instruction: 'Sit upright with arms extended forward like holding handlebars',
          detail: 'Stay still in this riding position...',
          stepInfo,
          diagram: (
            <svg viewBox="0 0 200 200" className="w-32 h-32 mx-auto">
              {/* Head */}
              <circle cx="100" cy="40" r="20" fill="none" stroke="#00ffff" strokeWidth="3"/>
              {/* Body */}
              <line x1="100" y1="60" x2="100" y2="120" stroke="#00ffff" strokeWidth="3"/>
              {/* Arms extended forward - highlighted */}
              <line x1="100" y1="80" x2="60" y2="90" stroke="#00ffff" strokeWidth="4"/>
              <line x1="100" y1="80" x2="140" y2="90" stroke="#00ffff" strokeWidth="4"/>
              {/* Hands */}
              <circle cx="60" cy="90" r="6" fill="#00ffff"/>
              <circle cx="140" cy="90" r="6" fill="#00ffff"/>
              {/* Legs */}
              <line x1="100" y1="120" x2="80" y2="160" stroke="#00ffff" strokeWidth="3"/>
              <line x1="100" y1="120" x2="120" y2="160" stroke="#00ffff" strokeWidth="3"/>
            </svg>
          )
        };
      case 'lean-left':
        return {
          title: 'LEAN LEFT',
          instruction: 'Keep arms forward, lean your upper body to the LEFT',
          detail: 'Hold the lean...',
          stepInfo,
          diagram: (
            <svg viewBox="0 0 200 200" className="w-32 h-32 mx-auto">
              {/* Head - leaning left */}
              <circle cx="85" cy="40" r="20" fill="none" stroke="#00ffff" strokeWidth="3"/>
              {/* Body - angled left */}
              <line x1="90" y1="60" x2="100" y2="120" stroke="#00ffff" strokeWidth="4"/>
              {/* Arms extended forward */}
              <line x1="90" y1="80" x2="50" y2="85" stroke="#00ffff" strokeWidth="3"/>
              <line x1="90" y1="80" x2="130" y2="95" stroke="#00ffff" strokeWidth="3"/>
              {/* Hands */}
              <circle cx="50" cy="85" r="5" fill="#00ffff"/>
              <circle cx="130" cy="95" r="5" fill="#00ffff"/>
              {/* Legs */}
              <line x1="100" y1="120" x2="80" y2="160" stroke="#00ffff" strokeWidth="3"/>
              <line x1="100" y1="120" x2="120" y2="160" stroke="#00ffff" strokeWidth="3"/>
              {/* Arrow indicating lean direction */}
              <path d="M 120 50 L 60 50 L 70 40 M 60 50 L 70 60" stroke="#ffff00" strokeWidth="2" fill="none"/>
            </svg>
          )
        };
      case 'lean-right':
        return {
          title: 'LEAN RIGHT',
          instruction: 'Keep arms forward, lean your upper body to the RIGHT',
          detail: 'Hold the lean...',
          stepInfo,
          diagram: (
            <svg viewBox="0 0 200 200" className="w-32 h-32 mx-auto">
              {/* Head - leaning right */}
              <circle cx="115" cy="40" r="20" fill="none" stroke="#00ffff" strokeWidth="3"/>
              {/* Body - angled right */}
              <line x1="110" y1="60" x2="100" y2="120" stroke="#00ffff" strokeWidth="4"/>
              {/* Arms extended forward */}
              <line x1="110" y1="80" x2="70" y2="95" stroke="#00ffff" strokeWidth="3"/>
              <line x1="110" y1="80" x2="150" y2="85" stroke="#00ffff" strokeWidth="3"/>
              {/* Hands */}
              <circle cx="70" cy="95" r="5" fill="#00ffff"/>
              <circle cx="150" cy="85" r="5" fill="#00ffff"/>
              {/* Legs */}
              <line x1="100" y1="120" x2="80" y2="160" stroke="#00ffff" strokeWidth="3"/>
              <line x1="100" y1="120" x2="120" y2="160" stroke="#00ffff" strokeWidth="3"/>
              {/* Arrow indicating lean direction */}
              <path d="M 80 50 L 140 50 L 130 40 M 140 50 L 130 60" stroke="#ffff00" strokeWidth="2" fill="none"/>
            </svg>
          )
        };
      case 'hand-open':
        return {
          title: 'OPEN HAND',
          instruction: 'Show your RIGHT hand with palm open and fingers spread',
          detail: 'Hold your hand open...',
          stepInfo,
          diagram: (
            <svg viewBox="0 0 200 200" className="w-40 h-40 mx-auto">
              {/* Palm */}
              <rect x="80" y="100" width="40" height="50" rx="5" fill="none" stroke="#ffff00" strokeWidth="3"/>
              {/* Fingers - spread open */}
              <rect x="70" y="70" width="8" height="35" rx="4" fill="#ffff00"/>
              <rect x="83" y="60" width="8" height="45" rx="4" fill="#ffff00"/>
              <rect x="96" y="60" width="8" height="45" rx="4" fill="#ffff00"/>
              <rect x="109" y="65" width="8" height="40" rx="4" fill="#ffff00"/>
              {/* Thumb */}
              <rect x="115" y="100" width="20" height="8" rx="4" fill="#ffff00" transform="rotate(-30 125 104)"/>
              {/* Label */}
              <text x="100" y="180" textAnchor="middle" fill="#ffff00" fontSize="16" fontWeight="bold">OPEN</text>
            </svg>
          )
        };
      case 'hand-closed':
        return {
          title: 'MAKE A FIST',
          instruction: 'Close your RIGHT hand into a tight fist',
          detail: 'Hold the fist...',
          stepInfo,
          diagram: (
            <svg viewBox="0 0 200 200" className="w-40 h-40 mx-auto">
              {/* Fist - closed hand */}
              <ellipse cx="100" cy="110" rx="30" ry="35" fill="none" stroke="#ffff00" strokeWidth="4"/>
              {/* Knuckles */}
              <line x1="75" y1="95" x2="75" y2="110" stroke="#ffff00" strokeWidth="2"/>
              <line x1="90" y1="90" x2="90" y2="105" stroke="#ffff00" strokeWidth="2"/>
              <line x1="105" y1="90" x2="105" y2="105" stroke="#ffff00" strokeWidth="2"/>
              <line x1="120" y1="95" x2="120" y2="110" stroke="#ffff00" strokeWidth="2"/>
              {/* Thumb wrapped around */}
              <path d="M 70 120 Q 70 135 85 140" fill="none" stroke="#ffff00" strokeWidth="3"/>
              {/* Label */}
              <text x="100" y="180" textAnchor="middle" fill="#ffff00" fontSize="16" fontWeight="bold">FIST</text>
            </svg>
          )
        };
      default:
        return {
          title: 'CALIBRATION',
          instruction: 'Follow the instructions',
          detail: '',
          stepInfo,
          diagram: null
        };
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-void">
      <div ref={mountRef} className="absolute inset-0" />
      
      {/* Refresh/Back to Menu Button - visible when not on arcade menu */}
      {!showArcadeMenu && (
        <button
          onClick={() => {
            console.log('🔄 Returning to arcade menu...');
            // Reset game state
            if (gameStateRef.current) {
              gameStateRef.current.isRunning = false;
              gameStateRef.current.score = 0;
              gameStateRef.current.bikeX = 0;
              gameStateRef.current.speed = 30;
              gameStateRef.current.obstacles = [];
            }
            setShowArcadeMenu(true);
            setPhase("loading");
            setScore(0);
            setSpeed(0);
            setLean(0);
          }}
          className="absolute top-4 left-4 z-50 px-4 py-2 bg-void/80 border-2 border-neon-cyan text-neon-cyan text-sm font-mono rounded hover:bg-neon-cyan hover:text-void transition-all flex items-center gap-2"
          title="Back to Menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          MENU
        </button>
      )}
      
      {/* Retro Arcade Speedometer - Left Side Above Engine Status */}
      {!showArcadeMenu && phase === "playing" && (
        <div className="absolute bottom-[28rem] left-8 z-50">
          <div className="relative">
            {/* Outer glow container */}
            <div className="absolute inset-0 bg-gradient-to-b from-neon-cyan/30 to-transparent blur-xl rounded-lg" />
            
            {/* Main speedometer box */}
            <div className="relative bg-void/95 border-4 border-neon-cyan rounded-lg px-8 py-4 shadow-2xl"
                 style={{ 
                   boxShadow: '0 0 30px hsl(var(--neon-cyan)), inset 0 0 20px rgba(0,0,0,0.8)',
                   borderImage: 'linear-gradient(135deg, hsl(var(--neon-cyan)), hsl(var(--neon-purple))) 1'
                 }}>
              {/* Label */}
              <div className="text-center text-neon-purple text-xs font-bold tracking-[0.3em] mb-1"
                   style={{ textShadow: '0 0 10px hsl(var(--neon-purple))' }}>
                VELOCITY
              </div>
              
              {/* Speed display */}
              <div className="flex items-center justify-center gap-2">
                <div className="text-6xl font-bold font-mono text-neon-cyan tabular-nums leading-none"
                     style={{ 
                       textShadow: '0 0 20px hsl(var(--neon-cyan)), 0 0 40px hsl(var(--neon-cyan))',
                       fontVariantNumeric: 'tabular-nums'
                     }}>
                  {Math.round(speed * 0.621371).toString().padStart(3, '0')}
                </div>
                <div className="text-neon-yellow text-xl font-bold self-end pb-2"
                     style={{ textShadow: '0 0 10px hsl(var(--neon-yellow))' }}>
                  mph
                </div>
              </div>
              
              {/* Speed bar indicator */}
              <div className="mt-3 w-full h-2 bg-void border border-neon-cyan/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-yellow transition-all duration-300 rounded-full"
                  style={{ 
                    width: `${Math.min(((speed * 0.621371) / 93) * 100, 100)}%`,
                    boxShadow: '0 0 10px hsl(var(--neon-cyan))'
                  }}
                />
              </div>
              
              {/* Corner decorations */}
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-neon-yellow -translate-x-1 -translate-y-1" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-neon-yellow translate-x-1 -translate-y-1" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-neon-yellow -translate-x-1 translate-y-1" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-neon-yellow translate-x-1 translate-y-1" />
            </div>
          </div>
        </div>
      )}
      
      {/* Shoulder Position Indicator - shows where user's shoulders are mapped */}
      {!showArcadeMenu && phase === "playing" && (
        <div 
          className="absolute top-0 bottom-0 w-1 bg-neon-cyan/60 transition-all duration-100 pointer-events-none z-10"
          style={{ 
            left: `${shoulderPosition * 100}%`,
            boxShadow: '0 0 20px hsl(var(--neon-cyan))'
          }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-neon-cyan rounded-full w-4 h-4 shadow-lg shadow-neon-cyan/50" />
          <div className="absolute top-8 left-1/2 -translate-x-1/2 text-neon-cyan text-xs font-mono whitespace-nowrap bg-void/80 px-2 py-1 rounded">
            SHOULDER
          </div>
        </div>
      )}

      {/* Video preview - larger during pause, bottom right during play */}
      {!showArcadeMenu && (
        <div className={`absolute border-2 border-neon-cyan rounded-lg overflow-hidden transition-all duration-300 ${
          phase === "paused" 
            ? "top-1/2 left-8 -translate-y-1/2 w-96 h-72 z-[60]" 
            : "bottom-8 right-8 w-48 h-36"
        }`}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
          {phase === "paused" && (
            <div className="absolute bottom-2 left-2 right-2 text-center">
              <div className="bg-void/90 border border-neon-yellow rounded px-3 py-2">
                <div className="text-neon-yellow text-sm font-mono font-bold">
                  HAND TRACKING
                </div>
                <div className="text-foreground text-xs mt-1">
                  Yellow = Hand Detected
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Distance Counter - Left Side Below Menu */}
      {!showArcadeMenu && phase === "playing" && (
        <div className="absolute top-20 left-8 z-20">
          <div className="bg-black/70 border-2 border-neon-cyan rounded-lg px-8 py-4 backdrop-blur-sm"
               style={{ boxShadow: "0 0 20px hsl(var(--neon-cyan) / 0.3)" }}>
            <div className="text-xs text-neon-yellow font-orbitron mb-1 tracking-widest text-center"
                 style={{ textShadow: "0 0 10px hsl(var(--neon-yellow))" }}>
              DISTANCE
            </div>
            <div className="text-5xl font-black text-neon-cyan font-orbitron tracking-wider text-center"
                 style={{ textShadow: "0 0 20px hsl(var(--neon-cyan))" }}>
              {Math.floor(distanceMeters)}
              <span className="text-2xl ml-2">m</span>
            </div>
          </div>
        </div>
      )}

      {/* Mini Map Radar - Top Right (only during playing) */}
      {!showArcadeMenu && phase === "playing" && gameStateRef.current && (
        <MiniMapRadar
          obstacles={gameStateRef.current.obstacles}
          bikeX={gameStateRef.current.bikeX}
          distanceMeters={distanceMeters}
        />
      )}

      {/* HUD - only show when not on arcade menu */}
      {!showArcadeMenu && showDebugInfo && (
        <div className="absolute top-8 left-20 space-y-4 font-mono">
          <div className="text-foreground text-2xl">
            Speed: <span className="text-neon-cyan font-bold">{speed.toFixed(1)}</span>
          </div>
          <div className="text-foreground text-2xl">
            Score: <span className="text-neon-yellow font-bold">{score}</span>
          </div>
          <div className="text-foreground text-2xl">
            High Score: <span className="text-neon-yellow font-bold">{highScore}</span>
          </div>
          <div className="text-foreground text-xl">
            Lean: <span className="text-neon-cyan">{lean.toFixed(2)}</span>
          </div>
          <div className="text-neon-cyan text-lg font-bold">{controlStatus}</div>
          
          {/* Volume Control */}
          {phase === "playing" && (
            <div className="mt-4 pt-4 border-t border-neon-cyan/30 space-y-2">
              <div className="flex items-center gap-3">
                <svg 
                  className="w-5 h-5 text-neon-yellow" 
                  fill="currentColor" 
                  viewBox="0 0 20 20"
                  style={{ textShadow: '0 0 10px hsl(var(--neon-yellow))' }}
                >
                  {volume === 0 ? (
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  ) : volume < 0.5 ? (
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L15.414 10l1.293 1.293a1 1 0 01-1.414 1.414L13 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L11.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                  )}
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume * 100}
                  onChange={(e) => setVolume(parseInt(e.target.value) / 100)}
                  className="flex-1 h-2 bg-void border border-neon-cyan/50 rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                  style={{
                    background: `linear-gradient(to right, hsl(var(--neon-cyan)) 0%, hsl(var(--neon-cyan)) ${volume * 100}%, hsl(var(--void)) ${volume * 100}%, hsl(var(--void)) 100%)`
                  }}
                />
                <span className="text-neon-yellow text-sm font-bold w-12 text-right">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <div className="text-xs text-neon-purple">ENGINE VOLUME</div>
            </div>
          )}
          
          {phase === "playing" && (
            <>
              {/* Shift Gesture Indicator */}
              <div className="mt-4 space-y-1">
                <div className="text-xs text-neon-purple">SHIFT GESTURE (Raise Left Arm in "L")</div>
                <div className={`px-3 py-2 rounded border ${shiftGestureDetected ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-neon-cyan/30 text-foreground/40'}`}>
                  {shiftGestureDetected ? '✓ L-POSE DETECTED' : '✗ No gesture'}
                </div>
              </div>
              
              {/* Auto-Downshift Info */}
              <div className="mt-4 space-y-1 pt-2 border-t border-neon-cyan/20">
                <div className="text-xs text-neon-purple">AUTO-DOWNSHIFT</div>
                <div className="text-xs text-foreground/60">
                  {rpm < 2000 && gear > 1 ? (
                    <span className="text-orange-400">⚠️ RPM LOW - Will downshift</span>
                  ) : (
                    <span>Engaged when RPM &lt; 2000</span>
                  )}
                </div>
              </div>
              
              {/* DEBUG INFO */}
              <div className="mt-6 pt-4 border-t border-neon-cyan/30 space-y-2 text-sm opacity-80">
                <div className="text-neon-purple font-bold">DEBUG INFO:</div>
                <div className="text-foreground">
                  Shoulder: <span className="text-neon-yellow">{(shoulderPosition * 100).toFixed(1)}%</span>
                </div>
                <div className="text-foreground">
                  Bike X: <span className="text-neon-cyan">{gameStateRef.current?.bikeX.toFixed(2) || '0.00'}</span>
                </div>
                <div className="text-foreground">
                  Track: <span className="text-red-400">-15</span> to <span className="text-red-400">+15</span>
                </div>
              </div>
              
              {/* VISUAL TRACK POSITION INDICATOR */}
              <div className="mt-4 space-y-2">
                <div className="text-xs text-neon-purple">POSITION MAP:</div>
                <div className="relative w-64 h-8 bg-void border border-neon-cyan/50 rounded">
                  {/* Track bounds markers */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-400/50" />
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-red-400/50" />
                  <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-green-400/30" />
                  
                  {/* Target position (shoulder) */}
                  <div 
                    className="absolute top-0 bottom-0 w-1 bg-neon-yellow/70 transition-all duration-100"
                    style={{ left: `${shoulderPosition * 100}%` }}
                    title="Target (Shoulder Position)"
                  />
                  
                  {/* Actual bike position */}
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-neon-cyan rounded-full shadow-lg shadow-neon-cyan/50 transition-all duration-100"
                    style={{ 
                      left: `${((gameStateRef.current?.bikeX || 0) + 15) / 30 * 100}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                    title="Actual Bike Position"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>LEFT</span>
                  <span>CENTER</span>
                  <span>RIGHT</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      
      {/* Always visible: ARCADE TACHOMETER (RPM Meter) */}
      {!showArcadeMenu && phase === "playing" && (
        <div className="absolute bottom-8 left-8 z-30">
          <div className="space-y-2">
            <div className="text-neon-yellow text-lg font-bold text-center font-mono">ENGINE STATUS</div>
            <ArcadeTachometer 
              rpm={rpm}
              maxRPM={8000}
              gear={gear}
              canShift={canShift}
            />
            {autoDownshiftWarning && (
              <div className="text-orange-400 text-sm font-bold animate-pulse text-center">
                🔽 AUTO-DOWNSHIFT
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Debug Toggle Button - Bottom Center */}
      {!showArcadeMenu && phase === "playing" && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => setShowDebugInfo(!showDebugInfo)}
            className="px-4 py-2 bg-void/80 border-2 border-neon-cyan text-neon-cyan font-mono text-sm rounded hover:bg-neon-cyan/20 hover:shadow-[0_0_20px_hsl(var(--neon-cyan))] transition-all"
          >
            {showDebugInfo ? '🔍 HIDE DEBUG' : '🔍 SHOW DEBUG'}
          </button>
        </div>
      )}

      {/* Phase overlays */}
      {phase === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/90">
          <div className="text-neon-cyan text-4xl font-bold animate-pulse">
            INITIALIZING...
          </div>
        </div>
      )}

      {phase === "calibrating" && (() => {
        const instruction = getCalibrationInstruction(calibrationPhase);
        
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-void/90">
            <div className="flex items-center gap-12 max-w-5xl px-8">
              {/* Diagram on the left */}
              {instruction.diagram && (
                <div className="flex-shrink-0">
                  {instruction.diagram}
                </div>
              )}
              
              {/* Instructions on the right */}
              <div className="text-center space-y-8 flex-1">
                {/* Step Counter */}
                {instruction.stepInfo.current > 0 && (
                  <div className="text-neon-yellow text-xl font-mono">
                    Step {instruction.stepInfo.current} of {instruction.stepInfo.total}
                  </div>
                )}
                
                <div className="text-neon-cyan text-6xl font-bold animate-pulse">
                  {instruction.title}
                </div>
                <div className="text-foreground text-3xl font-semibold">
                  {instruction.instruction}
                </div>
                <div className="text-neon-yellow text-2xl">
                  {instruction.detail}
                </div>
                
                {/* Progress Bar */}
                {calibrationPhase !== 'countdown' && calibrationPhase !== 'complete' && (
                  <div className="space-y-3">
                    <div className="w-96 h-6 bg-muted rounded-full overflow-hidden mx-auto">
                      <div
                        className="h-full bg-neon-cyan transition-all duration-300"
                        style={{ width: `${calibrationProgress}%` }}
                      />
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Capturing pose... {Math.floor(calibrationProgress)}%
                    </div>
                  </div>
                )}
                
                <div className="text-muted-foreground text-sm mt-8">
                  Stay still and follow each instruction carefully
                </div>
                
                {/* Skip Button */}
                <button
                  onClick={skipCalibration}
                  className="mt-6 px-8 py-2 bg-muted/50 text-muted-foreground text-sm font-mono rounded border border-muted-foreground/30 hover:bg-muted hover:border-neon-yellow hover:text-neon-yellow transition-all"
                >
                  SKIP CALIBRATION
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {phase === "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/90">
          <div className="text-center space-y-6">
            {startCountdown > 0 ? (
              <div className="text-neon-yellow text-9xl font-bold animate-pulse">
                {startCountdown}
              </div>
            ) : (
              <>
                <div className="text-neon-cyan text-6xl font-bold">
                  READY
                </div>
                <div className="text-foreground text-xl space-y-2">
                  <div>Lean left/right to steer</div>
                  <div>Close right fist to accelerate</div>
                  <div>Open right palm to brake</div>
                </div>
                
                {/* Eye blink progress indicator */}
                {eyesClosedDuration > 0 && (
                  <div className="mt-6 space-y-3">
                    <div className="text-neon-yellow text-2xl font-bold animate-pulse">
                      👁️ Eyes Detected Closed...
                    </div>
                    <div className="w-64 mx-auto h-4 bg-void border-2 border-neon-yellow rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-neon-yellow transition-all duration-100"
                        style={{ width: `${Math.min(eyesClosedDuration * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                
                <div className="mt-8 space-y-4">
                  <div className="text-neon-purple text-lg font-bold">
                    Close both eyes for 1 second to start
                  </div>
                  <div className="text-muted text-sm">or</div>
                  <button
                    onClick={startGame}
                    className="px-12 py-4 bg-neon-cyan text-void text-2xl font-bold rounded hover:shadow-[0_0_20px_hsl(var(--neon-cyan))] transition-all"
                  >
                    START
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {phase === "paused" && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/95">
          <div className="text-center space-y-8 max-w-2xl px-8">
            <div className="text-neon-cyan text-7xl font-bold animate-pulse font-mono">
              PAUSED
            </div>
            
            {/* Floating Volume Bar - appears during pinch gestures */}
            {showVolumeBar && (
              <div className="fixed top-1/2 right-12 -translate-y-1/2 z-[70] animate-scale-in">
                <div className="bg-void/95 border-4 border-neon-cyan rounded-2xl p-6 shadow-[0_0_30px_rgba(0,255,255,0.5)]">
                  <div className="text-neon-cyan text-2xl font-bold font-mono mb-4">
                    VOLUME
                  </div>
                  
                  {/* Vertical volume bar */}
                  <div className="relative h-64 w-16 bg-muted/50 rounded-full overflow-hidden border-2 border-neon-yellow/30">
                    <div 
                      className="absolute bottom-0 w-full bg-gradient-to-t from-neon-yellow via-neon-cyan to-neon-purple transition-all duration-100"
                      style={{ 
                        height: `${volume * 100}%`,
                        boxShadow: `0 0 20px hsl(var(--neon-cyan))`
                      }}
                    />
                    {/* Percentage markers */}
                    <div className="absolute inset-0 flex flex-col justify-between py-2">
                      {[100, 75, 50, 25, 0].map(mark => (
                        <div key={mark} className="w-full h-px bg-foreground/20" />
                      ))}
                    </div>
                  </div>
                  
                  {/* Large percentage display */}
                  <div className="text-neon-yellow text-5xl font-bold font-mono mt-4 animate-pulse">
                    {Math.round(volume * 100)}%
                  </div>
                  
                  <div className="text-foreground/60 text-xs mt-2 font-mono">
                    PINCH ACTIVE
                  </div>
                </div>
              </div>
            )}
            
            {/* Close eyes instruction */}
            <div className="text-neon-yellow text-2xl font-mono">
              Close both eyes for 1 second to resume
            </div>
            
            {/* Vintage Radio Station Display */}
            <div className="mt-8 p-8 bg-gradient-to-b from-amber-900/30 to-amber-950/50 border-4 border-amber-700/50 rounded-3xl shadow-[0_0_40px_rgba(217,119,6,0.3)] relative overflow-hidden">
              {/* Radio grill texture */}
              <div className="absolute inset-0 opacity-10">
                <div className="h-full w-full" style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 4px)',
                }}>
                </div>
              </div>
              
              <div className="relative z-10">
                <div className="text-amber-500 text-sm font-bold mb-4 tracking-widest">STATION SELECTOR</div>
                
                {/* Radio dial */}
                <div className="relative mb-6">
                  <div className="flex justify-center items-center gap-8">
                    {AUDIO_TRACKS.map((track, index) => (
                      <div
                        key={index}
                        className={`transition-all duration-300 ${
                          index === currentTrackIndex 
                            ? 'scale-110' 
                            : 'scale-90 opacity-40'
                        }`}
                      >
                        <div className={`
                          w-24 h-24 rounded-full border-4 flex items-center justify-center
                          ${index === currentTrackIndex 
                            ? 'border-amber-400 bg-gradient-to-br from-amber-500/30 to-amber-700/30 shadow-[0_0_30px_rgba(251,191,36,0.6)]' 
                            : 'border-amber-800/50 bg-amber-950/30'
                          }
                        `}>
                          <div className="text-center">
                            <div className={`text-2xl font-bold font-mono ${
                              index === currentTrackIndex ? 'text-amber-300' : 'text-amber-700'
                            }`}>
                              {index + 1}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Tuning indicator */}
                  <div className="mt-4 flex justify-center">
                    <div className="w-1 h-8 bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] animate-pulse"></div>
                  </div>
                </div>
                
                {/* Now playing display */}
                <div className="bg-black/60 border-2 border-amber-600/50 rounded-lg p-4 mb-4">
                  <div className="text-amber-400/70 text-xs font-mono mb-1">NOW PLAYING</div>
                  <div className="text-amber-300 text-3xl font-bold font-mono tracking-wide animate-pulse">
                    {AUDIO_TRACKS[currentTrackIndex].name}
                  </div>
                  <div className="mt-2 flex justify-center gap-1">
                    {AUDIO_TRACKS.map((_, index) => (
                      <div
                        key={index}
                        className={`w-2 h-2 rounded-full ${
                          index === currentTrackIndex 
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' 
                            : 'bg-amber-900/50'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Swipe instruction */}
                <div className="flex items-center justify-center gap-4 text-amber-500/70 text-sm">
                  <div className="animate-pulse">👈</div>
                  <span className="font-mono">SWIPE HAND LEFT/RIGHT</span>
                  <div className="animate-pulse">👉</div>
                </div>
              </div>
            </div>
            
            {/* Volume control */}
            <div className="mt-6 p-6 bg-void border-2 border-neon-yellow rounded-lg">
              <div className="text-foreground text-xl mb-4">VOLUME</div>
              <div className="flex items-center justify-center gap-4">
                <div className="text-neon-yellow text-2xl">🔉</div>
                <div className="flex-1 max-w-xs">
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-neon-yellow transition-all duration-100"
                      style={{ width: `${volume * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-neon-yellow text-2xl">🔊</div>
              </div>
              <div className="text-neon-yellow text-4xl font-bold font-mono mt-2">
                {Math.round(volume * 100)}%
              </div>
              <div className="text-muted-foreground text-sm mt-2">
                Pinch fingers to adjust volume
              </div>
            </div>
            
            {/* Current stats */}
            <div className="mt-6 grid grid-cols-2 gap-4 text-foreground">
              <div className="p-4 bg-void border border-border rounded-lg">
                <div className="text-sm text-muted-foreground">SCORE</div>
                <div className="text-3xl font-bold text-neon-cyan font-mono">{score}</div>
              </div>
              <div className="p-4 bg-void border border-border rounded-lg">
                <div className="text-sm text-muted-foreground">SPEED (mph)</div>
                <div className="text-3xl font-bold text-neon-yellow font-mono">{Math.round(speed * 0.621371)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "crashed" && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/90">
          <div className="text-center space-y-6">
            <div className="text-neon-yellow text-6xl font-bold animate-pulse">
              CRASHED!
            </div>
            <div className="text-foreground text-3xl">
              Score: <span className="text-neon-cyan">{score}</span>
            </div>
            {score === highScore && score > 0 && (
              <div className="text-neon-yellow text-2xl">NEW HIGH SCORE!</div>
            )}
            <button
              onClick={restart}
              className="mt-8 px-12 py-4 bg-neon-yellow text-void text-2xl font-bold rounded hover:shadow-[0_0_20px_hsl(var(--neon-yellow))] transition-all"
            >
              RESTART
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
