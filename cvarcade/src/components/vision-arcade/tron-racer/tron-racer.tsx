'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { HandState } from '@/hooks/use-hand-tracking';
import { ControlCalibrator, type CalibrationPhase, type GameControls } from './lib/control-mapping';
import { GamePhysics, GameState } from './lib/game-logic';
import { GridSystem } from './lib/grid-system';
import { CitySkyline } from './lib/city-skyline';
import ArcadeTachometer from './arcade-tachometer';
import MiniMapRadar from './mini-map-radar';
import { Button } from '@/components/ui/button';

interface TronRacerProps {
  leftHand: HandState | null;
  rightHand: HandState | null;
  poseLandmarks: any;
  onGameOver: (score: number) => void;
  onReturnToMenu: () => void;
}

type GamePhase = 'calibrating' | 'ready' | 'playing' | 'crashed';

export function TronRacer({
  leftHand,
  rightHand,
  poseLandmarks,
  onGameOver,
  onReturnToMenu,
}: TronRacerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<GamePhase>('calibrating');
  const [calibrationPhase, setCalibrationPhase] = useState<CalibrationPhase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [speed, setSpeed] = useState(0);
  
  // Refs for stable values across renders
  const phaseRef = useRef<GamePhase>('calibrating');
  const calibrationPhaseRef = useRef<CalibrationPhase>('countdown');
  const inputsRef = useRef({ leftHand, rightHand, poseLandmarks });
  const gameStateRef = useRef<GameState>({
    speed: 30, score: 0, bikeX: 0, obstacles: [], isRunning: false,
    startTime: Date.now(), rpm: 1000, gear: 1, maxRPM: 8000, canShift: false, lastSpawn: Date.now()
  });

  const calibratorRef = useRef<ControlCalibrator>(new ControlCalibrator());
  const physicsRef = useRef<GamePhysics>(new GamePhysics());
  const audioRefs = useRef<{ engine: HTMLAudioElement | null, shift: HTMLAudioElement | null, crash: HTMLAudioElement | null }>({
    engine: null, shift: null, crash: null
  });
  
  const lastTimeRef = useRef<number>(0);
  const animationIdRef = useRef<number>();
  const sceneElementsRef = useRef<{ 
    scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer,
    grid: GridSystem, city: CitySkyline, bike: THREE.Mesh 
  } | null>(null);

  // Sync state to refs
  useEffect(() => {
    phaseRef.current = phase;
    calibrationPhaseRef.current = calibrationPhase;
    inputsRef.current = { leftHand, rightHand, poseLandmarks };
  }, [phase, calibrationPhase, leftHand, rightHand, poseLandmarks]);

  // Handle Countdown (Separate from vision data to avoid restarts)
  useEffect(() => {
    if (phase !== 'calibrating' || calibrationPhase !== 'countdown') return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          calibratorRef.current.startCalibration();
          setCalibrationPhase(calibratorRef.current.getCurrentPhase());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, calibrationPhase]);

  // Handle Calibration Samples
  useEffect(() => {
    if (phase !== 'calibrating' || calibrationPhase === 'countdown' || calibrationPhase === 'complete') return;
    
    const interval = setInterval(() => {
      const { rightHand: r, leftHand: l, poseLandmarks: p } = inputsRef.current;
      calibratorRef.current.addCalibrationSample(p, r || l);
      
      if (calibratorRef.current.getProgress() >= 100) {
        calibratorRef.current.finishCurrentPhase();
        const next = calibratorRef.current.getCurrentPhase();
        setCalibrationPhase(next);
        if (next === 'complete') setPhase('ready');
      }
    }, 50); // Sample at 20fps during calibration
    
    return () => clearInterval(interval);
  }, [phase, calibrationPhase]);

  // Main Three.js Initialization
  useEffect(() => {
    if (!mountRef.current) return;

    // Only initialize once
    if (!sceneElementsRef.current) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000a1a);
      scene.fog = new THREE.FogExp2(0x000a1a, 0.0018);

      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
      camera.position.set(0, 3, 18);
      camera.lookAt(0, -1, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const grid = new GridSystem(scene);
      const city = new CitySkyline(scene);

      const textureLoader = new THREE.TextureLoader();
      const bikeTexture = textureLoader.load('/assets/images/player_view.png');
      const bikeGeometry = new THREE.PlaneGeometry(10, 12);
      const bikeMaterial = new THREE.MeshBasicMaterial({ map: bikeTexture, transparent: true, side: THREE.FrontSide, depthWrite: false });
      const bike = new THREE.Mesh(bikeGeometry, bikeMaterial);
      bike.position.set(0, -7.5, 6);
      scene.add(bike);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambientLight);
      
      sceneElementsRef.current = { scene, camera, renderer, grid, city, bike };

      // Initialize Audio
      audioRefs.current.engine = new Audio('/assets/audio/lightcycle_fx.wav');
      audioRefs.current.engine.loop = true;
      audioRefs.current.shift = new Audio('/assets/audio/retro_laser.wav');
      audioRefs.current.crash = new Audio('/assets/audio/retro_laser.wav');
    }

    const { scene, camera, renderer, grid, city, bike } = sceneElementsRef.current;
    mountRef.current.appendChild(renderer.domElement);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const animate = (now: number) => {
      const dt = Math.min((now - (lastTimeRef.current || now)) / 1000, 0.1);
      lastTimeRef.current = now;

      const currentPhase = phaseRef.current;
      const gameState = gameStateRef.current;
      const { leftHand: lInput, rightHand: rInput, poseLandmarks: pInput } = inputsRef.current;

      if (currentPhase === 'playing' && gameState) {
        const controls = calibratorRef.current.extractControls(pInput, rInput || lInput);
        physicsRef.current.updatePhysics(gameState, controls.throttle, controls.brake, controls.targetPosition, dt);
        physicsRef.current.moveObstacles(gameState, dt);
        
        if (physicsRef.current.checkCollisions(gameState)) {
          setPhase('crashed');
          if (audioRefs.current.engine) audioRefs.current.engine.pause();
          if (audioRefs.current.crash) audioRefs.current.crash.play().catch(() => {});
          onGameOver(gameState.score);
        }

        if (controls.shiftGesture && gameState.canShift) {
          physicsRef.current.shiftUp(gameState);
          if (audioRefs.current.shift) {
            audioRefs.current.shift.currentTime = 0;
            audioRefs.current.shift.play().catch(() => {});
          }
        }

        if (now - (gameState as any).lastSpawn > Math.max(800, 2500 - (gameState.speed * 4))) {
          physicsRef.current.spawnObstacle(scene, gameState);
          (gameState as any).lastSpawn = now;
        }

        setSpeed(gameState.speed);
        setScore(gameState.score);
        setDistanceMeters(prev => prev + (gameState.speed / 3.6) * dt);

        bike.position.x = gameState.bikeX;
        // bike.rotation.z = -controls.lean * 0.15; // Removed as per user request to keep bike forward-facing

        grid.update(dt, gameState.speed);
        city.update(dt);
        
        if (audioRefs.current.engine) {
          const rpmNormalized = (gameState.rpm - 1000) / 7000;
          audioRefs.current.engine.playbackRate = 0.8 + rpmNormalized * 1.2;
          audioRefs.current.engine.volume = 0.3 + (gameState.speed / 300) * 0.7;
        }
      }

      renderer.render(scene, camera);
      animationIdRef.current = requestAnimationFrame(animate);
    };

    animationIdRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (mountRef.current && renderer.domElement && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  const startGame = () => {
    gameStateRef.current.isRunning = true;
    gameStateRef.current.startTime = Date.now();
    (gameStateRef.current as any).lastSpawn = Date.now();
    setPhase('playing');
    if (audioRefs.current.engine) {
        audioRefs.current.engine.play().catch(() => {});
    }
  };

  const nesButtonStyle = "font-mono text-xl py-6 bg-[#1014a0] border-2 border-[#808080] ring-2 ring-inset ring-white rounded-sm text-white hover:bg-[#2024b0] hover:ring-[#e0e0e0] transition-all duration-200 shadow-lg active:scale-95";

  return (
    <div className="w-full h-full absolute inset-0 bg-black overflow-hidden font-mono text-cyan-400">
      <div ref={mountRef} className="w-full h-full" />

      {/* HUD */}
      <div className="absolute top-6 left-6 z-20 flex flex-col gap-3 pointer-events-none">
        <div className="text-5xl font-bold bg-[#1014a0]/80 p-4 border-2 border-white ring-2 ring-inset ring-[#808080] shadow-xl text-white">
          SCORE: {score.toLocaleString()}
        </div>
        <div className="text-3xl bg-[#1014a0]/80 p-3 border-2 border-white ring-2 ring-inset ring-[#808080] shadow-lg text-white">
          DISTANCE: {Math.floor(distanceMeters)}m
        </div>
      </div>

      <div className="absolute bottom-64 right-6 z-20 flex flex-col items-center gap-4 pointer-events-none origin-bottom-right">
        {/* Radar clustered above Tachometer */}
        <div className="scale-110">
          <MiniMapRadar 
            obstacles={gameStateRef.current.obstacles} 
            bikeX={gameStateRef.current.bikeX} 
            distanceMeters={distanceMeters} 
          />
        </div>
        
        <div className="scale-90">
          <ArcadeTachometer 
            rpm={gameStateRef.current.rpm} 
            maxRPM={8000} 
            gear={gameStateRef.current.gear} 
            canShift={gameStateRef.current.canShift} 
          />
        </div>
      </div>

      {phase === 'calibrating' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50">
          <div className="text-6xl font-bold mb-12 text-white border-b-4 border-white pb-4 uppercase tracking-tighter">Initializing System</div>
          <div className="text-4xl mb-8 text-cyan-300 tracking-[0.3em] font-mono">{calibrationPhase.toUpperCase().replace('-', ' ')}</div>
          <div className="w-96 h-8 bg-gray-900 border-4 border-[#808080] ring-4 ring-inset ring-white overflow-hidden">
            <div 
              className="h-full bg-cyan-500 transition-all duration-100" 
              style={{ width: `${calibratorRef.current.getProgress()}%` }}
            />
          </div>
          {calibrationPhase === 'countdown' && (
            <div className="text-[12rem] mt-12 font-bold text-white drop-shadow-[0_0_30px_white]">{countdown}</div>
          )}
        </div>
      )}

      {phase === 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-50 backdrop-blur-sm">
          <div className="text-8xl font-bold mb-16 text-white drop-shadow-[0_0_30px_white] tracking-tighter">DRIVE READY</div>
          <Button size="lg" onClick={startGame} className={nesButtonStyle + " px-24 py-14 text-6xl"}>
            ENGAGE
          </Button>
        </div>
      )}

      {phase === 'crashed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 z-50 backdrop-blur-md">
          <div className="text-[10rem] font-bold mb-6 text-red-500 animate-pulse">DEREZZED</div>
          <div className="text-5xl mb-12 text-white uppercase tracking-widest">Score: {score.toLocaleString()}</div>
          <div className="flex gap-8">
            <Button onClick={() => window.location.reload()} className="text-4xl px-12 py-8 bg-red-600 border-4 border-white text-white hover:bg-red-500">RETRY</Button>
            <Button onClick={onReturnToMenu} className="text-4xl px-12 py-8 bg-white text-black border-4 border-[#808080] hover:bg-gray-200">MENU</Button>
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        onClick={onReturnToMenu}
        className="absolute top-6 right-6 z-20 text-white/50 hover:text-white text-xl"
      >
        [ EXIT ]
      </Button>

      {/* Control Instruction Panel */}
      <div className="absolute bottom-6 left-6 z-20 bg-[#1014a0]/80 p-8 border-4 border-[#808080] ring-4 ring-inset ring-white text-white font-mono max-w-sm shadow-2xl">
        <h3 className="text-3xl font-bold mb-6 border-b-2 border-white pb-2 uppercase tracking-tighter">Control Log</h3>
        <div className="space-y-4 text-lg">
          <div className="flex justify-between border-b border-white/20 pb-1">
            <span>STEERING</span> <span className="text-cyan-400">LEAN L/R</span>
          </div>
          <div className="flex justify-between border-b border-white/20 pb-1">
            <span>THROTTLE</span> <span className="text-cyan-400">CLOSED FIST</span>
          </div>
          <div className="flex justify-between border-b border-white/20 pb-1">
            <span>BRAKE</span> <span className="text-cyan-400">OPEN PALM</span>
          </div>
          <div className="flex justify-between border-b border-white/20 pb-1">
            <span>UP-SHIFT</span> <span className="text-cyan-400">L-POSE ARM</span>
          </div>
        </div>
        {/* Debug Info */}
        <div className="mt-8 pt-4 border-t border-white/40 text-xs opacity-60">
          <div>RPM: {Math.floor(gameStateRef.current.rpm)}</div>
          <div>SPD: {Math.floor(gameStateRef.current.speed)}</div>
          <div>GEAR: {gameStateRef.current.gear}</div>
          <div>CAN_SHIFT: {gameStateRef.current.canShift ? 'YES' : 'NO'}</div>
        </div>
      </div>
    </div>
  );
}
