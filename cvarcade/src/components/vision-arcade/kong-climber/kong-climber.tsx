
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameState, VisionInput, HandState as KongHandState } from './types';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import { HandState as PlatformHandState } from '@/hooks/use-hand-tracking';
import { Button } from '@/components/ui/button';

interface KongClimberProps {
  leftHand: PlatformHandState | null;
  rightHand: PlatformHandState | null;
  onGameOver: (result: number) => void;
  onReturnToMenu: () => void;
}

export function KongClimber({ leftHand, rightHand, onGameOver, onReturnToMenu }: KongClimberProps) {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [stats, setStats] = useState({ score: 0, stamina: 100, height: 0, impulse: 0 });
  const [debugMode, setDebugMode] = useState(false);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  // Vision logic moved from VisionService to the component
  const lastLeftWristY = useRef<number | null>(null);
  const lastRightWristY = useRef<number | null>(null);
  const impulseBuffer = useRef<number[]>([]);
  const lastInput = useRef<VisionInput>({
    leftHand: null,
    rightHand: null,
    climbImpulse: 0,
    handsDetected: false,
    leftHandState: 'OPEN',
    rightHandState: 'OPEN'
  });

  const BUFFER_SIZE = 5;
  const MOVEMENT_THRESHOLD = 0.001;
  const AMPLIFICATION = 60;

  const processVision = useCallback((): VisionInput => {
    let handsDetected = !!(leftHand || rightHand);
    let leftImpulse = 0;
    let rightImpulse = 0;
    let bodyCenterX: number | undefined;
    let bodySlant: number | undefined;

    if (leftHand && rightHand) {
        bodyCenterX = (leftHand.position!.x + rightHand.position!.x) / 2;
        bodySlant = rightHand.position!.y - leftHand.position!.y;
    }

    if (leftHand && leftHand.position) {
        if (lastLeftWristY.current !== null) {
            const dy = leftHand.position.y - lastLeftWristY.current;
            if (dy > MOVEMENT_THRESHOLD && dy < 0.2) {
                leftImpulse = dy;
            }
        }
        lastLeftWristY.current = leftHand.position.y;
    } else {
        lastLeftWristY.current = null;
    }

    if (rightHand && rightHand.position) {
        if (lastRightWristY.current !== null) {
            const dy = rightHand.position.y - lastRightWristY.current;
            if (dy > MOVEMENT_THRESHOLD && dy < 0.2) {
                rightImpulse = dy;
            }
        }
        lastRightWristY.current = rightHand.position.y;
    } else {
        lastRightWristY.current = null;
    }

    const rawImpulse = (leftImpulse + rightImpulse) * AMPLIFICATION;
    impulseBuffer.current.push(rawImpulse);
    if (impulseBuffer.current.length > BUFFER_SIZE) {
        impulseBuffer.current.shift();
    }
    const smoothedImpulse = impulseBuffer.current.reduce((a, b) => a + b, 0) / impulseBuffer.current.length;

    const rawLandmarks = [];
    if (leftHand?.rawLandmarks) rawLandmarks.push(leftHand.rawLandmarks);
    if (rightHand?.rawLandmarks) rawLandmarks.push(rightHand.rawLandmarks);

    const result: VisionInput = {
        leftHand: leftHand?.position || null,
        rightHand: rightHand?.position || null,
        climbImpulse: Math.min(smoothedImpulse, 8.0),
        handsDetected,
        bodyCenterX,
        bodySlant,
        leftHandState: leftHand?.isClosed ? 'CLOSED' : 'OPEN',
        rightHandState: rightHand?.isClosed ? 'CLOSED' : 'OPEN',
        rawLandmarks: rawLandmarks.length > 0 ? rawLandmarks : undefined
    };

    lastInput.current = result;
    return result;
  }, [leftHand, rightHand]);

  // We need to provide a "visionService" like object to GameCanvas
  const mockVisionService = useRef({
    process: processVision,
    getVideo: () => document.querySelector('video') as HTMLVideoElement | null
  });

  const startGame = () => setGameState(GameState.PLAYING);
  const resetGame = () => setGameState(GameState.MENU);

  useEffect(() => {
    if (gameState === GameState.GAME_OVER) {
        onGameOver(stats.score);
    }
  }, [gameState, stats.score, onGameOver]);

  return (
    <div className="w-full h-full absolute inset-0 bg-slate-900 flex flex-col items-center justify-center">
      
      {/* Main Game Container */}
      <div className="relative group w-full h-full flex items-center justify-center">
        
        {/* Game Header / HUD */}
        <div className="absolute top-4 left-4 right-4 flex justify-between text-white font-arcade z-10 pointer-events-none mix-blend-difference">
          <div className="flex flex-col gap-2">
            <span className="text-yellow-400 text-xl">SCORE: {stats.score.toString().padStart(6, '0')}</span>
            <span className="text-blue-300">HEIGHT: {stats.height}m</span>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="w-48 h-6 bg-slate-800 border-2 border-slate-600 rounded">
              <div 
                className={`h-full transition-all duration-200 ${stats.stamina < 30 ? 'bg-red-500' : 'bg-green-500'}`} 
                style={{ width: `${stats.stamina}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">STAMINA</span>
          </div>
        </div>

        {/* Impulse Indicator */}
        <div className="absolute left-4 bottom-4 w-4 h-32 bg-slate-800 border border-slate-600 rounded overflow-hidden z-10">
          <div 
            className="absolute bottom-0 left-0 w-full bg-yellow-500 transition-all duration-75"
            style={{ height: `${Math.min(stats.impulse * 20, 100)}%` }}
          />
        </div>

        {/* Canvas */}
        <div className="aspect-[3/4] h-[90vh] relative">
            <GameCanvas 
                visionService={mockVisionService.current as any} 
                gameState={gameState} 
                setGameState={setGameState}
                onStatsUpdate={setStats}
                debugMode={debugMode}
                debugCanvasRef={debugCanvasRef}
            />
        </div>

        {/* Debug / MiniCam Overlay */}
        <div className={`absolute bottom-4 right-4 z-20 transition-opacity duration-300 ${debugMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
           <div className="relative rounded-lg overflow-hidden border-2 border-yellow-500/50 shadow-lg bg-black">
              <canvas 
                ref={debugCanvasRef} 
                width={320} 
                height={240} 
                className="block"
              />
              <div className="absolute top-0 left-0 bg-yellow-500 text-black text-[10px] px-1 font-bold">DEBUG VIEW</div>
           </div>
        </div>

        {/* Debug Toggle Button */}
        <button 
          onClick={() => setDebugMode(!debugMode)}
          className="absolute top-4 right-4 z-30 p-2 bg-slate-800/50 hover:bg-slate-700 text-white rounded text-xs border border-slate-600 font-mono"
        >
          {debugMode ? 'HIDE DEBUG' : 'SHOW DEBUG'}
        </button>


        {/* Overlays */}
        {gameState === GameState.MENU && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-center p-8 backdrop-blur-sm z-30">
            <h1 className="text-6xl font-headline text-yellow-400 mb-2 animate-pulse">KONG CLIMBER</h1>
            
            <div className="bg-slate-800/80 p-6 rounded-lg border border-slate-700 max-w-lg mb-8 text-left">
              <h3 className="text-white font-headline text-lg mb-4 text-center border-b border-slate-600 pb-2">HOW TO PLAY</h3>
              <ul className="space-y-3 text-slate-300">
                <li className="flex items-center gap-3">
                  <span className="bg-yellow-500 text-black font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs">1</span>
                  <span>Stand back so camera sees your arms.</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="bg-yellow-500 text-black font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs">2</span>
                  <span>Raise hands high, then <strong>PULL DOWN FAST</strong> to climb.</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="bg-yellow-500 text-black font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs">3</span>
                  <span>Use <strong>WIDE ARM</strong> motions if needed!</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="bg-yellow-500 text-black font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs">4</span>
                  <span>Close your hand (fist) to <strong>SWAT</strong> birds.</span>
                </li>
              </ul>
            </div>

            <Button 
                size="lg"
                onClick={startGame}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xl px-12 py-8"
            >
                START CLIMBING
            </Button>
            
            <div className="mt-8 text-slate-500 text-xs">
              <p>Camera required • Play in a well-lit room</p>
            </div>
          </div>
        )}

        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center text-center backdrop-blur-md z-30">
            <h2 className="text-5xl font-headline text-white mb-2">GAME OVER</h2>
            <div className="text-yellow-400 text-3xl font-headline mb-8">
              SCORE: {stats.score}
            </div>
            <div className="flex gap-4">
                <Button 
                onClick={resetGame}
                className="px-8 py-4 bg-white text-red-900 font-bold hover:bg-gray-200"
                >
                TRY AGAIN
                </Button>
                <Button 
                variant="outline"
                onClick={onReturnToMenu}
                className="px-8 py-4 border-white text-white hover:bg-white/10"
                >
                EXIT
                </Button>
            </div>
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        onClick={onReturnToMenu}
        className="absolute top-4 left-4 z-40 text-white/50 hover:text-white"
      >
        ← Arcade Menu
      </Button>
    </div>
  );
}
