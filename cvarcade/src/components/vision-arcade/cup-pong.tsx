
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { HandState } from '@/hooks/use-hand-tracking';


interface CupPongProps {
  handPosition: { x: number; y: number } | null;
  isPinching: boolean;
  onGameOver: (result: 'Win') => void;
  onReturnToMenu: () => void;
}

const TABLE_WIDTH = 6;
const TABLE_HEIGHT = 0.2;
const TABLE_DEPTH = 12;
const CUP_RADIUS = 0.3125 * 1.25;
const CUP_HEIGHT = 0.625 * 1.25;
const CUP_ROWS = 4;
const BALL_RADIUS = 0.1;
const TRAJECTORY_POINTS = 50;

// --- Tuned Physics Constants ---
const THROW_STRENGTH_MULTIPLIER = 12; 
const FORWARD_VELOCITY = -7; 
const BOUNCE_DAMPING = 0.7; // 70% of vertical velocity is retained on bounce

type BallState = 'held' | 'flying' | 'landed';

export function CupPong({ handPosition, isPinching, onGameOver, onReturnToMenu }: CupPongProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const animationFrameIdRef = useRef<number>(0);
  
  const initialCupCount = (CUP_ROWS * (CUP_ROWS + 1)) / 2;
  const [activeCupCount, setActiveCupCount] = useState<number>(initialCupCount);

  // Use refs for Three.js objects and game state to avoid re-renders and stale closures.
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const ballRef = useRef<THREE.Mesh>();
  const cupsRef = useRef<THREE.Mesh[]>([]);
  const trajectoryLineRef = useRef<THREE.Line>();
  
  const gameStateRef = useRef({
    ball: {
      position: new THREE.Vector3(0, 1, TABLE_DEPTH / 2 - 1),
      velocity: new THREE.Vector3(0, 0, 0),
      state: 'held' as BallState,
    },
    throwStartPosition: null as { x: number, y: number } | null,
    throwStartTime: 0,
    prevPinching: false,
  });

  const latestHandPosition = useRef(handPosition);
  const latestIsPinching = useRef(isPinching);
  
  useEffect(() => {
    latestHandPosition.current = handPosition;
    latestIsPinching.current = isPinching;
  }, [handPosition, isPinching]);


  useEffect(() => {
    if (!mountRef.current) {
        return;
    }
    const mount = mountRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111118);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(0, 4, 8); 
    camera.lookAt(0, 0, 0); 
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true }); 
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2, 5, 3);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Game Objects
    const tableMaterial = new THREE.MeshStandardMaterial({ color: '#8B4513' });
    const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH, TABLE_HEIGHT, TABLE_DEPTH), tableMaterial);
    table.position.y = -TABLE_HEIGHT / 2;
    table.receiveShadow = true;
    scene.add(table);
    
    const cupMaterial = new THREE.MeshStandardMaterial({ color: 'red', emissive: 'darkred', emissiveIntensity: 0.5 });
    cupsRef.current = [];
    for (let row = 0; row < CUP_ROWS; row++) {
        for (let i = 0; i <= row; i++) {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(CUP_RADIUS, CUP_RADIUS * 0.8, CUP_HEIGHT, 16), cupMaterial.clone());
            cup.position.set(
                (i - row / 2) * (CUP_RADIUS * 2.2),
                CUP_HEIGHT / 2,
                -TABLE_DEPTH / 2 + 1.5 + row * CUP_RADIUS * 2
            );
            cup.castShadow = true;
            cup.userData.isActive = true;
            cup.userData.originalColor = (cup.material as THREE.MeshStandardMaterial).color.clone();
            scene.add(cup);
            cupsRef.current.push(cup);
        }
    }
    setActiveCupCount(cupsRef.current.length);
    
    const ballMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#dddddd', emissiveIntensity: 0.5 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 16, 16), ballMaterial);
    ball.castShadow = true;
    ball.position.copy(gameStateRef.current.ball.position);
    scene.add(ball);
    ballRef.current = ball;
    
    const trajectoryMaterial = new THREE.LineBasicMaterial({ color: 'hsl(var(--primary))', linewidth: 2 });
    const trajectoryGeometry = new THREE.BufferGeometry();
    const trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
    trajectoryLine.visible = false;
    scene.add(trajectoryLine);
    trajectoryLineRef.current = trajectoryLine;

    // Animation Loop
    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      const state = gameStateRef.current;
      const currentHandPosition = latestHandPosition.current;
      const currentIsPinching = latestIsPinching.current;
      
      const ballMesh = ballRef.current;
      const trajLine = trajectoryLineRef.current;

      if(!ballMesh || !trajLine) return;

      const timeStep = 0.016; // Fixed timestep

      if (state.ball.state === 'held') {
        if (currentIsPinching && currentHandPosition) {
          if (!state.prevPinching) {
            state.throwStartPosition = { x: currentHandPosition.x, y: currentHandPosition.y };
            state.throwStartTime = performance.now();
          }

          const x = (currentHandPosition.x - 0.5) * TABLE_WIDTH * 0.8;
          const y = (1 - currentHandPosition.y) * 4 + 1;
          state.ball.position.set(x, y, TABLE_DEPTH / 2 - 1);

          if(state.throwStartPosition) {
              const timeSincePinchStart = Math.max((performance.now() - state.throwStartTime) / 1000, 0.1);
              const deltaX = (currentHandPosition.x - state.throwStartPosition.x);
              const deltaY = (state.throwStartPosition.y - currentHandPosition.y);
              
              const velocityX = (deltaX / timeSincePinchStart) * THROW_STRENGTH_MULTIPLIER;
              const velocityY = (deltaY / timeSincePinchStart) * THROW_STRENGTH_MULTIPLIER;
              const velocityZ = FORWARD_VELOCITY;
              const predictedVelocity = new THREE.Vector3(velocityX, velocityY, velocityZ);

              const tempPos = state.ball.position.clone();
              const tempVel = predictedVelocity.clone();
              const gravity = -9.8;
              const trajectoryPoints = [];

              for (let i = 0; i < TRAJECTORY_POINTS; i++) {
                  tempVel.y += gravity * timeStep;
                  tempPos.add(tempVel.clone().multiplyScalar(timeStep));

                  // Bounce prediction
                  if (tempPos.y - BALL_RADIUS <= 0 && tempVel.y < 0) {
                      tempPos.y = BALL_RADIUS;
                      tempVel.y *= -BOUNCE_DAMPING;
                  }

                  trajectoryPoints.push(tempPos.clone());
                  if (tempPos.y < -1) break;
              }
              trajLine.geometry.setFromPoints(trajectoryPoints);
              trajLine.geometry.attributes.position.needsUpdate = true;
              trajLine.visible = true;
          }

        } else {
            if (state.prevPinching && state.throwStartPosition && currentHandPosition) {
              const throwEndTime = performance.now();
              const throwDuration = Math.max((throwEndTime - state.throwStartTime) / 1000, 0.1);

              state.ball.state = 'flying';
              
              const deltaX = (currentHandPosition.x - state.throwStartPosition.x);
              const deltaY = (state.throwStartPosition.y - currentHandPosition.y); 
              
              const velocityX = (deltaX / throwDuration) * THROW_STRENGTH_MULTIPLIER;
              const velocityY = (deltaY / throwDuration) * THROW_STRENGTH_MULTIPLIER;
              const velocityZ = FORWARD_VELOCITY;

              state.ball.velocity.set(velocityX, velocityY, velocityZ);
              
              state.throwStartPosition = null;
          }
          trajLine.visible = false;
        }
      }

      if (state.ball.state === 'flying') {
          state.ball.velocity.y -= 9.8 * timeStep;
          state.ball.position.add(state.ball.velocity.clone().multiplyScalar(timeStep));

          // Bounce off the table
          if (state.ball.position.y - BALL_RADIUS <= 0 && state.ball.velocity.y < 0) {
              state.ball.position.y = BALL_RADIUS;
              state.ball.velocity.y *= -BOUNCE_DAMPING;
          }

          let landedCup = null;
          for (const cup of cupsRef.current) {
              if (cup.userData.isActive) {
                  const cupTopY = cup.position.y + CUP_HEIGHT / 2;
                  const distToCupCenter2D = Math.hypot(state.ball.position.x - cup.position.x, state.ball.position.z - cup.position.z);
                  
                  if (distToCupCenter2D < CUP_RADIUS && state.ball.velocity.y < 0) { // Check for downward velocity
                      const prevBallY = state.ball.position.y - state.ball.velocity.y * timeStep;
                      if (prevBallY > cupTopY && state.ball.position.y <= cupTopY) {
                          landedCup = cup;
                          break;
                      }
                  }
              }
          }
          
          if(landedCup) {
             state.ball.state = 'landed';
             landedCup.userData.isActive = false;
             
             state.ball.position.set(landedCup.position.x, landedCup.position.y, landedCup.position.z);
             const cupMaterial = landedCup.material as THREE.MeshStandardMaterial;
             cupMaterial.color.set('lime');
             cupMaterial.emissive.set('green');
             
             setTimeout(() => {
                landedCup!.visible = false;
                setActiveCupCount(prev => prev - 1);
                
                const remainingCups = cupsRef.current.filter(c => c.visible);
                cupsRef.current = remainingCups;
                
                if (remainingCups.length === 0) { 
                    onGameOver('Win');
                } else {
                    state.ball.state = 'held';
                    state.ball.position.set(0, 1, TABLE_DEPTH / 2 - 1);
                    state.ball.velocity.set(0, 0, 0);
                }
             }, 1000);
          } else if (state.ball.position.y < -5 || Math.abs(state.ball.position.x) > TABLE_WIDTH || Math.abs(state.ball.position.z) > TABLE_DEPTH / 2 + 2) {
              state.ball.state = 'landed'; 
              setTimeout(() => {
                state.ball.state = 'held';
                state.ball.position.set(0, 1, TABLE_DEPTH / 2 - 1);
                state.ball.velocity.set(0, 0, 0);
              }, 500);
          }
      }
      
      if (state.ball.state !== 'landed') {
        ballMesh.position.copy(state.ball.position);
      }
      ballMesh.visible = state.ball.state !== 'landed';

      state.prevPinching = currentIsPinching;
      
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
        if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
        cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      if(mount && rendererRef.current?.domElement){
        mount.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, [onGameOver]); 

  useEffect(() => {
     if (initialCupCount > 0 && activeCupCount === 0) {
        onGameOver('Win');
      }
  }, [activeCupCount, onGameOver, initialCupCount]);

  return (
    <div className="w-full h-full absolute inset-0">
       <div className="absolute top-4 right-4 z-20 bg-black/50 p-4 rounded-lg text-white font-headline text-2xl">
        Cups Remaining: {activeCupCount}
      </div>
      {latestIsPinching.current && (
        <div className="absolute bottom-4 right-1/2 translate-x-1/2 z-20 bg-black/50 p-2 px-4 rounded-lg font-mono text-lg transition-colors duration-200 text-primary border-2 border-primary">
            PINCHING
        </div>
       )}
      <div ref={mountRef} className="w-full h-full" />
      <Button
        variant="outline"
        onClick={onReturnToMenu}
        className="absolute top-4 left-4 z-20"
      >
        Return to Menu
      </Button>
    </div>
  );
}
