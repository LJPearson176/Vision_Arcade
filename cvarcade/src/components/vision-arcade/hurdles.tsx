'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { CVHurdlesState } from '@/hooks/use-pose-tracking';

interface HurdlesProps {
  hurdlesState: CVHurdlesState | null;
  isJumping: boolean;
  onGameOver: (finalTimeMs: number) => void;
  onReturnToMenu: () => void;
}

type GameStatus = 'countdown' | 'running' | 'finished';

const TRACK_LENGTH = 110;
// const HURDLE_COUNT = 10;
const HURDLE_HEIGHT = 0.8;
const HURDLE_WIDTH = 2;
const JUMP_APEX = 2;
const JUMP_DURATION = 0.6; // seconds
const HIT_PENALTY = 0.5; // seconds

// Power-Pad / Track & Field flavour
const MIN_SPEED = 2;        // world units/sec when barely moving
const MAX_SPEED = 10;       // world units/sec at max cadence
const TAKEOFF_WINDOW = 3.0; // distance before hurdle where jump can “lock on”
const LANDING_TOLERANCE = 1.0; // distance around hurdle z where landing counts as success

export function Hurdles({
  hurdlesState,
  isJumping,
  onGameOver,
  onReturnToMenu,
}: HurdlesProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const gameRef = useRef<{
    status: GameStatus;
    player: {
      position: number;
      isJumping: boolean;
      jumpTimer: number;
      speed: number;
    };
    elapsedTimeMs: number;
  }>({
    status: 'countdown',
    player: {
      position: 0,
      isJumping: false,
      jumpTimer: 0,
      speed: 0,
    },
    elapsedTimeMs: 0,
  });

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const playerAvatarRef = useRef<THREE.Mesh | null>(null);
  const hurdlesRef = useRef<THREE.Mesh[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

  const [status, setStatus] = useState<GameStatus>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [elapsedTimeMsState, setElapsedTimeMsState] = useState(0);

  // Latest CV signals
  const latestHurdlesState = useRef<CVHurdlesState | null>(hurdlesState);
  const latestIsJumping = useRef<boolean>(isJumping);

  useEffect(() => {
    latestHurdlesState.current = hurdlesState;
    latestIsJumping.current = isJumping;
  }, [hurdlesState, isJumping]);

  // Timing + penalties
  const lastFrameTimeRef = useRef<number | null>(null);
  const penaltyTimeRef = useRef<number>(0); // ms
  const activeHurdleRef = useRef<THREE.Mesh | null>(null);

  const gameLoop = useCallback(() => {
    if (gameRef.current.status !== 'running') {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      return;
    }

    const now = performance.now();
    if (lastFrameTimeRef.current == null) {
      lastFrameTimeRef.current = now;
    }
    const deltaTime = (now - lastFrameTimeRef.current) / 1000; // seconds
    lastFrameTimeRef.current = now;

    // Update pure race time
    gameRef.current.elapsedTimeMs += deltaTime * 1000;
    const displayTimeMs =
      gameRef.current.elapsedTimeMs + penaltyTimeRef.current;
    setElapsedTimeMsState(displayTimeMs);

    const player = gameRef.current.player;
    const runSpeed = latestHurdlesState.current?.runSpeed ?? 0;

    // Power Pad-style: cadence^1.5 → MIN/MAX speed
    const rawRun = Math.max(0, Math.min(1, runSpeed)); // clamp [0,1]
    const boosted = Math.pow(rawRun, 1.5);
    const targetSpeed = MIN_SPEED + boosted * (MAX_SPEED - MIN_SPEED);
    const lerpFactor = rawRun > 0.1 ? 0.15 : 0.05; // more damping when not “pressing”

    player.speed += (targetSpeed - player.speed) * lerpFactor;
    player.position += player.speed * deltaTime;

    // Finish line
    if (player.position >= TRACK_LENGTH) {
      gameRef.current.status = 'finished';
      setStatus('finished');
      onGameOver(displayTimeMs);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // JUMP START (from CV signal)
    if (latestIsJumping.current && !player.isJumping) {
      player.isJumping = true;
      player.jumpTimer = 0;

      // Lock onto the next hurdle in front within takeoff window
      const hurdleInFront = hurdlesRef.current.find(
        (h) =>
          !h.userData.cleared &&
          !h.userData.hit &&
          h.position.z > player.position &&
          h.position.z - player.position < TAKEOFF_WINDOW
      );
      activeHurdleRef.current = hurdleInFront || null;
    }

    // JUMP ARC & RESOLUTION
    let playerHeight = 0;
    if (player.isJumping) {
      player.jumpTimer += deltaTime;
      const jumpProgress = player.jumpTimer / JUMP_DURATION;
      playerHeight = JUMP_APEX * Math.sin(jumpProgress * Math.PI);

      if (jumpProgress >= 1) {
        player.isJumping = false;

        const hurdle = activeHurdleRef.current;
        if (hurdle && !hurdle.userData.cleared && !hurdle.userData.hit) {
          const dz = Math.abs(player.position - hurdle.position.z);
          const success = dz < LANDING_TOLERANCE;

          if (success) {
            hurdle.userData.cleared = true;
            (
              hurdle.material as THREE.MeshStandardMaterial
            ).color.set('lime');
          } else {
            hurdle.userData.hit = true;
            (
              hurdle.material as THREE.MeshStandardMaterial
            ).color.set('red');
            penaltyTimeRef.current += HIT_PENALTY * 1000;
            player.speed *= 0.6;
          }
        }

        activeHurdleRef.current = null;
      }
    }

    // Update 3D transforms
    if (playerAvatarRef.current) {
      playerAvatarRef.current.position.z = player.position;
      playerAvatarRef.current.position.y = 0.9 + playerHeight;
    }

    if (cameraRef.current) {
      const targetZ = player.position - 5;
      cameraRef.current.position.z +=
        (targetZ - cameraRef.current.position.z) * 0.1;
    }

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [onGameOver]);

  // Countdown → start race
  useEffect(() => {
    if (status !== 'countdown') return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Reset game state
          gameRef.current.status = 'running';
          gameRef.current.player.position = 0;
          gameRef.current.player.speed = 0;
          gameRef.current.player.isJumping = false;
          gameRef.current.player.jumpTimer = 0;
          gameRef.current.elapsedTimeMs = 0;
          penaltyTimeRef.current = 0;
          lastFrameTimeRef.current = null;
          activeHurdleRef.current = null;
          
          // Reset hurdles visual state
          hurdlesRef.current.forEach(h => {
              h.userData.cleared = false;
              h.userData.hit = false;
              (h.material as THREE.MeshStandardMaterial).color.set('white');
          });

          setStatus('running');
          animationFrameIdRef.current = requestAnimationFrame(gameLoop);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status, gameLoop]);

  // Three.js setup / teardown
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x74b4ff);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 4, -5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    // Track
    const trackMaterial = new THREE.MeshStandardMaterial({ color: '#8B4513' });
    const track = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.1, TRACK_LENGTH + 20),
      trackMaterial
    );
    track.position.z = (TRACK_LENGTH + 20) / 2 - 10;
    track.position.y = -0.05;
    scene.add(track);

    // Lane stripes (optional visual clarity)
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: '#eeeeee',
    });
    for (let i = 0; i <= TRACK_LENGTH / 10; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(4.1, 0.02, 0.2),
        stripeMaterial
      );
      const zPos = i * 10;
      stripe.position.set(0, 0.06, zPos);
      scene.add(stripe);
    }

    // Hurdles are disabled for now
    /*
    const HURDLE_COUNT = 10;
    for (let i = 1; i <= HURDLE_COUNT; i++) {
      const hurdle = new THREE.Mesh(
        new THREE.BoxGeometry(HURDLE_WIDTH, HURDLE_HEIGHT, 0.1),
        new THREE.MeshStandardMaterial({ color: 'white' })
      );
      hurdle.position.set(
        0,
        HURDLE_HEIGHT / 2,
        (TRACK_LENGTH / (HURDLE_COUNT + 1)) * i
      );
      hurdle.userData = {
        hit: false,
        cleared: false,
      };
      scene.add(hurdle);
      hurdlesRef.current.push(hurdle);
    }
    */

    // Player avatar
    const playerAvatar = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1, 4, 16),
      new THREE.MeshStandardMaterial({ color: '#FF69B4' })
    );
    playerAvatar.position.y = 0.9;
    playerAvatar.position.z = 0;
    scene.add(playerAvatar);
    playerAvatarRef.current = playerAvatar;

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current)
        return;
      const { clientWidth, clientHeight } = mountRef.current;
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(clientWidth, clientHeight);
    };

    window.addEventListener('resize', handleResize);
    // Kick off countdown
    setStatus('countdown');
    setCountdown(3);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (mount && rendererRef.current?.domElement) {
        mount.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
      hurdlesRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full h-full absolute inset-0 text-white">
      <div ref={mountRef} className="w-full h-full" />

      {/* Time HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 font-headline text-4xl text-primary drop-shadow-lg bg-black/30 px-4 py-2 rounded-md">
        TIME: {(elapsedTimeMsState / 1000).toFixed(2)}s
      </div>

      {/* Run speed meter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/50 p-2 rounded-md">
        <div className="w-64 h-4 bg-gray-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-100"
            style={{
              width: `${Math.min(
                100,
                Math.max(0, (hurdlesState?.runSpeed ?? 0) * 100)
              )}%`,
            }}
          />
        </div>
        <p className="text-center mt-1 text-sm uppercase tracking-wide">
          Run Cadence
        </p>
      </div>

      {/* Countdown overlay */}
      {status === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
          <div className="font-headline text-9xl text-accent animate-ping">
            {countdown > 0 ? countdown : ''}
          </div>
        </div>
      )}

      {/* Finished overlay */}
      {status === 'finished' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-30">
          <h2 className="font-headline text-7xl text-primary">Finished!</h2>
          <p className="text-white text-3xl mt-2">
            Final Time: {(elapsedTimeMsState / 1000).toFixed(2)}s
          </p>
        </div>
      )}

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
