
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { HandState } from '@/hooks/use-hand-tracking';
import Image from 'next/image';

interface DuckHuntProps {
  leftHand: HandState | null;
  rightHand: HandState | null;
  onGameOver: (result: 'Lose') => void;
  onReturnToMenu: () => void;
}

type Duck = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'flying' | 'shot' | 'falling' | 'gone';
  animationFrame: number;
};

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const DUCK_SIZE = 60;
const HITBOX_PADDING = 10;
const AIM_SENSITIVITY = 1.15;
const HUD_HEIGHT = 96;
const FOREGROUND_GRASS_HEIGHT = 96;

const SPRITES = {
  mallard_l_up: '/assets/images/mallard_l_up.png',
  mallard_l_down: '/assets/images/mallard_l_down.png',
  mallard_r_up: '/assets/images/mallard_r_up.png',
  mallard_r_down: '/assets/images/mallard_r_down.png',
};
const FLAP_RATE = 15;

export function DuckHunt({ leftHand, rightHand, onReturnToMenu }: DuckHuntProps) {
  const [isShooting, setIsShooting] = useState(false);
  const [lastShotCoords, setLastShotCoords] = useState<{ x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);

  const gameRef = useRef<{
    ducks: Duck[];
    score: number;
    isReadyToPull: boolean;
    lastFireTime: number;
    wasRightHandOpen: boolean;
    lastPullTime: number;
    wasLeftHandUp: boolean;
  }>({
    ducks: [],
    score: 0,
    isReadyToPull: true, // Start ready to accept a pull
    lastFireTime: 0,
    wasRightHandOpen: true,
    lastPullTime: 0,
    wasLeftHandUp: false,
  });

  const latestLeftHand = useRef(leftHand);
  const latestRightHand = useRef(rightHand);

  useEffect(() => {
    latestLeftHand.current = leftHand;
    latestRightHand.current = rightHand;
  }, [leftHand, rightHand]);

  useEffect(() => {
    let shotTimeout: NodeJS.Timeout;
    if (isShooting) {
      shotTimeout = setTimeout(() => {
        setIsShooting(false);
        setLastShotCoords(null);
      }, 200);
    }
    return () => clearTimeout(shotTimeout);
  }, [isShooting]);
  
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes hit-marker {
        from { transform: scale(0); opacity: 1; }
        to { transform: scale(2); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);


  const gameLoop = useCallback(() => {
    const lHand = latestLeftHand.current;
    const rHand = latestRightHand.current;
    const game = gameRef.current;
    const now = Date.now();

    // --- PULL LOGIC (Simplified: Open Palm Above Head = Pull) ---
    const isLeftHandUp = lHand && lHand.isAboveHead;
    const isLeftHandOpen = lHand && !lHand.isClosed && !lHand.isThumbUp;

    // We only pull if the hand is UP and OPEN, and we weren't already pulling
    if (isLeftHandUp && isLeftHandOpen) {
        if (game.isReadyToPull && (now - game.lastPullTime > 1500)) {
            game.isReadyToPull = false; // Need to "re-arm" by lowering hand or closing it
            game.lastPullTime = now;
            
            // Spawn ducks (up to 3)
            if (game.ducks.length < 3) {
                const count = Math.random() > 0.5 ? 2 : 1;
                for (let i = 0; i < count; i++) {
                    if (game.ducks.length >= 3) break;
                    const fromLeft = Math.random() > 0.5;
                    const newDuck: Duck = {
                        id: Date.now() + Math.random(),
                        x: fromLeft ? -DUCK_SIZE : GAME_WIDTH,
                        y: GAME_HEIGHT - HUD_HEIGHT - FOREGROUND_GRASS_HEIGHT - DUCK_SIZE - 50,
                        vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 2),
                        vy: -2.5 - Math.random() * 1.5,
                        state: 'flying',
                        animationFrame: 0,
                    };
                    game.ducks.push(newDuck);
                }
            }
        }
    } else if (!isLeftHandUp || !isLeftHandOpen) {
        // Re-arm the pull mechanism when hand is lowered or closed
        game.isReadyToPull = true;
    }

    // --- FIRE LOGIC ---
    if (rHand) {
      const isFireGesture = rHand.isClosed || rHand.isThumbUp;
      if (game.wasRightHandOpen && isFireGesture && (now - game.lastFireTime > 250)) {
        game.lastFireTime = now;
        if (rHand.position) {
          const crosshairX = rHand.position.x * GAME_WIDTH;
          const crosshairY = rHand.position.y * GAME_HEIGHT;
          
          setLastShotCoords({ x: crosshairX, y: crosshairY });
          setIsShooting(true);

          let hit = false;
          game.ducks.forEach(duck => {
            if (duck.state !== 'flying') return;
            const hitbox = {
              left: duck.x - HITBOX_PADDING, 
              right: duck.x + DUCK_SIZE + HITBOX_PADDING,
              top: duck.y - HITBOX_PADDING, 
              bottom: duck.y + DUCK_SIZE + HITBOX_PADDING,
            };
            if (
              crosshairX >= hitbox.left && crosshairX <= hitbox.right &&
              crosshairY >= hitbox.top && crosshairY <= hitbox.bottom
            ) {
              hit = true;
              duck.state = 'shot';
              duck.animationFrame = 0;
            }
          });
          if (hit) {
            game.score += 100;
          }
        }
      }
      game.wasRightHandOpen = !isFireGesture;
    }


    // --- DUCK MOVEMENT & STATE UPDATE ---
    game.ducks = game.ducks
      .map(duck => {
        let { x, y, vx, vy, state, animationFrame } = duck;
        animationFrame++;

        if (state === 'flying') {
          x += vx;
          y += vy;
          
          if (Math.random() < 0.015) vx *= -1;
          if (Math.random() < 0.02) vy = -vy + (Math.random() - 0.5) * 0.5;
          
          if (y < 40) vy = Math.abs(vy);
          const bottomBoundary = GAME_HEIGHT - HUD_HEIGHT - FOREGROUND_GRASS_HEIGHT - DUCK_SIZE;
          if (y > bottomBoundary) {
            y = bottomBoundary;
            vy = -Math.abs(vy) * 0.8;
          }

          if ((x < -DUCK_SIZE && vx < 0) || (x > GAME_WIDTH && vx > 0)) {
              return null; // Duck escaped
          }

          return { ...duck, x, y, vx, vy, animationFrame };
        } else if (state === 'shot') {
          if (animationFrame > 20) return { ...duck, state: 'falling', animationFrame: 0 };
          return { ...duck, animationFrame };
        } else if (state === 'falling') {
          y += 6; 
          if (y > GAME_HEIGHT) return null;
          return { ...duck, y, animationFrame };
        }
        return duck;
      })
      .filter(Boolean) as Duck[];
      
      setTick(t => t + 1);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(function loop() {
      gameLoop();
      requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [gameLoop]);

  const renderDuck = (duck: Duck) => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: duck.x,
      top: duck.y,
      width: DUCK_SIZE,
      height: DUCK_SIZE,
      zIndex: 10,
    };

    let spriteSrc = '';
    if (duck.state === 'flying') {
        const isUp = Math.floor(duck.animationFrame / FLAP_RATE) % 2 === 0;
        if (duck.vx > 0) {
            spriteSrc = isUp ? SPRITES.mallard_r_up : SPRITES.mallard_r_down;
        } else {
            spriteSrc = isUp ? SPRITES.mallard_l_up : SPRITES.mallard_l_down;
        }
        return <Image src={spriteSrc} alt="duck" width={DUCK_SIZE} height={DUCK_SIZE} style={baseStyle} unoptimized />;
    }

    if (duck.state === 'shot') {
      return (
        <div style={baseStyle} className="flex items-center justify-center">
          <Crosshair className="text-red-500 w-full h-full" strokeWidth={4} />
        </div>
      );
    }
    
    if (duck.state === 'falling') {
        const fallSprite = duck.vx > 0 ? SPRITES.mallard_r_down : SPRITES.mallard_l_down;
        return <Image src={fallSprite} alt="falling duck" width={DUCK_SIZE} height={DUCK_SIZE} style={{...baseStyle, transform: `rotate(${duck.animationFrame * 15}deg)`}} unoptimized />;
    }

    return null;
  };

  const getAimPosition = () => {
    if (!rightHand?.position) return null;
    let x = (rightHand.position.x - 0.5) * AIM_SENSITIVITY + 0.5;
    let y = (rightHand.position.y - 0.5) * AIM_SENSITIVITY + 0.5;
    return {
      left: x * GAME_WIDTH - 16,
      top: y * GAME_HEIGHT - 16,
    }
  }
  const aimPos = getAimPosition();

  const isPulling = latestLeftHand.current?.isAboveHead && !latestLeftHand.current?.isClosed;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div
        className="relative bg-[#74b4ff] overflow-hidden border-8 border-black"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-100 z-50 ${
            isShooting ? 'bg-white opacity-70' : 'opacity-0'
          }`}
        />

        {/* Ducks Container */}
        <div className="absolute inset-0 z-10">
          {gameRef.current.ducks.map(duck => (
            <div key={duck.id}>
              {renderDuck(duck)}
            </div>
          ))}
        </div>


        {aimPos && (
          <Crosshair
            className="absolute text-red-600 pointer-events-none drop-shadow-lg z-50"
            style={{
              ...aimPos,
              width: 32,
              height: 32,
              strokeWidth: 4,
            }}
          />
        )}

        {lastShotCoords && isShooting && (
          <div
            className="absolute w-20 h-20 bg-red-500/60 rounded-full pointer-events-none z-30"
            style={{
              left: lastShotCoords.x - 40,
              top: lastShotCoords.y - 40,
              animation: 'hit-marker 0.3s ease-out forwards',
            }}
          />
        )}

        {/* Scenery */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-green-800 z-0" />
        <div className="absolute bottom-[96px] left-0 w-full h-24 bg-green-600 z-0 border-t-8 border-black" />

        {/* HUD */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-yellow-800 z-40 flex items-center justify-around px-8 font-mono text-black text-2xl">
          <div className={`px-4 py-2 rounded-md transition-all ${isPulling ? 'bg-green-400 scale-105 shadow-[0_0_15px_rgba(74,222,128,0.5)]' : 'bg-yellow-600'}`}>
             PULL: {isPulling ? 'DUCK OUT!' : 'Raise Open Hand'}
          </div>
          <div className="bg-black/20 px-4 py-1 rounded">Score: {gameRef.current.score}</div>
          <div className="bg-black/20 px-4 py-1 rounded">Ducks: {gameRef.current.ducks.length}</div>
        </div>
      </div>

      <Button
        variant="outline"
        onClick={onReturnToMenu}
        className="absolute top-4 left-4 z-50"
      >
        Return to Menu
      </Button>
    </div>
  );
}
