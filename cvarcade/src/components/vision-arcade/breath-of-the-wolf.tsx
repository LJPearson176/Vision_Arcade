
'use client';

import { useState, useEffect, useRef, useCallback }from 'react';
import Matter from 'matter-js';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Crosshair, Wind } from 'lucide-react';
import { HandState } from '@/hooks/use-hand-tracking';
import Image from 'next/image';

interface BreathOfTheWolfProps {
  rightHand: HandState | null;
  isMouthOpen: boolean;
  mouthOpenRatio: number;
  onGameOver: (result: 'Win' | 'Lose' | 'TimeUp') => void;
  onReturnToMenu: () => void;
}

const BLOW_FORCE_MULTIPLIER = 0.05;
const TIME_LIMIT_SECONDS = 90;
const PARTICLE_COUNT = 500;

type Particle = {
    mesh: THREE.Mesh;
    life: number;
    initialLife: number;
    velocity: THREE.Vector3;
};

export function BreathOfTheWolf({
  rightHand,
  isMouthOpen,
  mouthOpenRatio,
  onGameOver,
  onReturnToMenu,
}: BreathOfTheWolfProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animationFrameIdRef = useRef<number>();
  const groundRef = useRef<Matter.Body | null>(null);

  const bodiesRef = useRef<Record<string, THREE.Mesh>>({});
  const houseBlockCount = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
  const [destroyedBlocks, setDestroyedBlocks] = useState(0);

  const latestRightHand = useRef(rightHand);
  const latestIsMouthOpen = useRef(isMouthOpen);
  const latestMouthOpenRatio = useRef(mouthOpenRatio);

  useEffect(() => {
    latestRightHand.current = rightHand;
    latestIsMouthOpen.current = isMouthOpen;
    latestMouthOpenRatio.current = mouthOpenRatio;
  }, [rightHand, isMouthOpen, mouthOpenRatio]);

  const gameLoop = useCallback(() => {
    if (!engineRef.current || !rendererRef.current || !sceneRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        return;
    };
    const engine = engineRef.current;
    
    // Animate particles
    particlesRef.current.forEach(p => {
        if (p.life > 0) {
            p.life -= 1;
            p.mesh.position.add(p.velocity);
            const lifeRatio = p.life / p.initialLife;
            const scale = lifeRatio * 0.5 + 0.1;
            p.mesh.scale.set(scale, scale, scale);
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = lifeRatio;
        } else {
            p.mesh.visible = false;
        }
    });

    if (latestIsMouthOpen.current && latestMouthOpenRatio.current > 0.1 && latestRightHand.current?.position) {
      const handPos = latestRightHand.current.position;
      const blowX = handPos.x * window.innerWidth;
      const blowY = handPos.y * window.innerHeight;

      // Emit some particles
      for (let i = 0; i < 5; i++) { // emit 5 particles per frame
        const p = particlesRef.current.find(par => par.life <= 0);
        if (p) {
            p.mesh.position.set(blowX, blowY, 1);
            const spread = 1 + latestMouthOpenRatio.current * 2;
            p.velocity.set(
                (Math.random() * 5 + 3) * (1 + latestMouthOpenRatio.current),
                (Math.random() - 0.5) * 4 * spread,
                0
            );
            p.initialLife = 40 + 40 * latestMouthOpenRatio.current; // Life depends on power
            p.life = p.initialLife;
            p.mesh.visible = true;
        }
      }


      const allBodies = Matter.Composite.allBodies(engine.world);
      for (const body of allBodies) {
        if (body.isStatic) continue;

        const distance = Matter.Vector.magnitude(
          Matter.Vector.sub(body.position, { x: blowX, y: blowY })
        );
        
        if (distance < 150) { // Blow radius
            const forceMagnitude = (1 - (distance / 150)) * BLOW_FORCE_MULTIPLIER * latestMouthOpenRatio.current;
            const force = Matter.Vector.mult(Matter.Vector.normalise(Matter.Vector.sub(body.position, {x: blowX, y: blowY})), forceMagnitude);
            Matter.Body.applyForce(body, body.position, force);
        }
      }
    }
    
    Matter.Engine.update(engine, 1000 / 60);

    let currentDestroyedCount = 0;
    const groundY = groundRef.current ? groundRef.current.position.y : window.innerHeight;

    for (const body of Matter.Composite.allBodies(engine.world)) {
      if (bodiesRef.current[body.id]) {
        const mesh = bodiesRef.current[body.id];
        mesh.position.set(body.position.x, body.position.y, 0);
        mesh.rotation.z = body.angle;

        // A block is destroyed if its Y position is greater than the ground's Y position.
        if (!body.isStatic && body.position.y > groundY) {
            if(!mesh.userData.isDestroyed) {
                mesh.userData.isDestroyed = true;
                (mesh.material as THREE.MeshStandardMaterial).color.set('#ff0000');
            }
        }
        if (mesh.userData.isDestroyed) {
            currentDestroyedCount++;
        }
      }
    }


    setDestroyedBlocks(currentDestroyedCount);
    
    if (currentDestroyedCount === houseBlockCount.current && houseBlockCount.current > 0) {
        onGameOver('Win');
        return; // Stop the loop
    }

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = scene?.getObjectByName('camera') as THREE.OrthographicCamera;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }

    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [onGameOver]);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // --- Matter.js Setup ---
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    engineRef.current = engine;
    
    const ground = Matter.Bodies.rectangle(window.innerWidth / 2, window.innerHeight, window.innerWidth, 60, { isStatic: true, friction: 1.0 });
    groundRef.current = ground;
    Matter.Composite.add(engine.world, [ground]);

    // Build the house
    const blockWidth = 40;
    const blockHeight = 40;
    const numRows = 8;
    const numCols = 10;
    const groundTop = ground.position.y - 30; // Top of the ground body
    const stackHeight = numRows * blockHeight;
    const stackX = window.innerWidth / 2 - (numCols * blockWidth) / 2;
    const stackY = groundTop - stackHeight + (blockHeight/2);
    
    const stack = Matter.Composites.stack(stackX, stackY, numCols, numRows, 0, 0, (x: number, y: number) => {
        return Matter.Bodies.rectangle(x, y, blockWidth, blockHeight, {friction: 0.9});
    });
    houseBlockCount.current = stack.bodies.length;
    Matter.Composite.add(engine.world, stack);
    
    // --- Three.js Setup ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.OrthographicCamera(0, window.innerWidth, 0, window.innerHeight, -1000, 1000);
    camera.position.z = 500;
    camera.name = 'camera';
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // Add ground mesh
    const groundMesh = new THREE.Mesh(new THREE.BoxGeometry(window.innerWidth, 60, 40), new THREE.MeshStandardMaterial({ color: 0x228B22 }));
    groundMesh.position.set(window.innerWidth / 2, ground.position.y, 0);
    scene.add(groundMesh);

    // Create meshes for the house blocks
    stack.bodies.forEach(body => {
        const material = new THREE.MeshStandardMaterial({ color: '#D2B48C' });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(blockWidth, blockHeight, 40), material);
        mesh.userData.isDestroyed = false;
        
        mesh.position.set(body.position.x, body.position.y, 0);
        
        scene.add(mesh);
        bodiesRef.current[body.id] = mesh;
    });

    // Create particle system
    const particleGeometry = new THREE.PlaneGeometry(10, 10);
    const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.NormalBlending,
    });
    particlesRef.current = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const mesh = new THREE.Mesh(particleGeometry, particleMaterial.clone());
        mesh.visible = false;
        scene.add(mesh);
        particlesRef.current.push({
            mesh: mesh,
            life: 0,
            initialLife: 0,
            velocity: new THREE.Vector3(),
        });
    }

    // Turn on gravity *after* setup
    engine.gravity.y = 1;
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);

    const timerInterval = setInterval(() => {
        setTimeLeft(prev => {
            if (prev <= 1) {
                clearInterval(timerInterval);
                if (animationFrameIdRef.current) {
                    cancelAnimationFrame(animationFrameIdRef.current);
                }
                onGameOver('TimeUp');
                return 0;
            }
            return prev - 1;
        });
    }, 1000);

    return () => {
      clearInterval(timerInterval);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if(mount && rendererRef.current?.domElement) {
        mount.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, [gameLoop, onGameOver]);

  const getAimPosition = () => {
    if (!rightHand?.position) return null;
    return {
      left: rightHand.position.x * 100 + '%',
      top: rightHand.position.y * 100 + '%',
    };
  };

  const aimPos = getAimPosition();

  return (
    <div className="w-full h-full absolute inset-0 flex flex-col items-center justify-between text-white">
      {/* Game Canvas */}
      <div ref={mountRef} className="w-full h-full absolute inset-0" />

      <Image
        src="/assets/images/wolf_blow.png"
        alt="Wolf blowing"
        width={400}
        height={400}
        className="absolute left-0 top-1/2 -translate-y-1/2 w-80 h-auto z-0 pointer-events-none"
      />
      
      {/* HUD */}
      <div className="w-full bg-black/50 p-4 flex items-center justify-between z-10 font-headline">
        <Button variant="outline" onClick={onReturnToMenu}>
          Return to Menu
        </Button>
        <div className="text-right">
             <p className="text-2xl text-primary">Time Left: {timeLeft}</p>
             <p className="text-2xl text-accent">Destroyed: {destroyedBlocks} / {houseBlockCount.current}</p>
        </div>
      </div>
      
      {/* Crosshair */}
      {aimPos && (
          <Crosshair
            className="absolute text-red-600 pointer-events-none drop-shadow-lg"
            style={{
              ...aimPos,
              transform: 'translate(-50%, -50%)',
              width: 48,
              height: 48,
              strokeWidth: 4,
            }}
          />
      )}

      {/* Wind Intensity Indicator */}
      {isMouthOpen && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
            <Wind className="w-16 h-16 text-white mb-2" />
            <div className="w-64 h-6 bg-white/30 rounded-full overflow-hidden border-2 border-white">
                <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${mouthOpenRatio * 100}%` }}></div>
            </div>
            <p className="text-white font-bold mt-2">BLOWING</p>
          </div>
      )}
    </div>
  );
}
