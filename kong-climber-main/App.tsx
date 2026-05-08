
import React, { useEffect, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { VisionService } from './services/visionService';
import { GameState } from './types';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [stats, setStats] = useState({ score: 0, stamina: 100, height: 0, impulse: 0 });
  const [visionLoaded, setVisionLoaded] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const visionServiceRef = useRef<VisionService>(new VisionService());
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const initVision = async () => {
      await visionServiceRef.current.initialize();
      setVisionLoaded(true);
      
      // Start Camera
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && videoRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480 } 
          });
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          visionServiceRef.current.setVideoElement(videoRef.current);
        } catch (err) {
          console.error("Camera error:", err);
          alert("Camera permission is required to play!");
        }
      }
    };
    initVision();
  }, []);

  const startGame = () => setGameState(GameState.PLAYING);
  const resetGame = () => setGameState(GameState.MENU);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      
      {/* Hidden Video Input for CV */}
      <video 
        ref={videoRef} 
        className="hidden" // Processed in background
        playsInline 
        muted 
      />

      {/* Main Game Container */}
      <div className="relative group">
        
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
        <GameCanvas 
          visionService={visionServiceRef.current} 
          gameState={gameState} 
          setGameState={setGameState}
          onStatsUpdate={setStats}
          debugMode={debugMode}
          debugCanvasRef={debugCanvasRef}
        />

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
            <h1 className="text-6xl font-arcade text-yellow-400 mb-2 animate-pulse">KONG CLIMBER</h1>
            
            <div className="bg-slate-800/80 p-6 rounded-lg border border-slate-700 max-w-lg mb-8 text-left">
              <h3 className="text-white font-arcade text-lg mb-4 text-center border-b border-slate-600 pb-2">HOW TO PLAY</h3>
              <ul className="space-y-3 text-slate-300 font-roboto">
                <li className="flex items-center gap-3">
                  <span className="bg-yellow-500 text-black font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs">1</span>
                  <span>Stand back (2-3 meters) so camera sees your arms.</span>
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
                  <span>Lean body left/right to dodge birds.</span>
                </li>
              </ul>
            </div>

            {!visionLoaded ? (
              <div className="text-blue-400 text-xl animate-bounce">Initializing Vision AI...</div>
            ) : (
              <button 
                onClick={startGame}
                className="px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-arcade text-xl rounded shadow-[0_0_20px_rgba(250,204,21,0.5)] transition-all transform hover:scale-105 active:scale-95"
              >
                START CLIMBING
              </button>
            )}
            <div className="mt-8 text-slate-500 text-xs">
              <p>Camera required • Play in a well-lit room</p>
            </div>
          </div>
        )}

        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center text-center backdrop-blur-md z-30">
            <h2 className="text-5xl font-arcade text-white mb-2">GAME OVER</h2>
            <div className="text-yellow-400 text-3xl font-arcade mb-8">
              SCORE: {stats.score}
            </div>
            <button 
              onClick={resetGame}
              className="px-6 py-3 bg-white text-red-900 font-bold rounded font-arcade hover:bg-gray-200"
            >
              TRY AGAIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
