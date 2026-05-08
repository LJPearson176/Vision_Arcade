
import React, { useEffect, useRef, useState } from 'react';
import { GameState, LockState, TutorialStep, PinState, PickTool, GameMode } from './types';
import { cvService } from './services/cvService';
import { lockService } from './services/lockService';
import { audioService } from './services/audioService';
import GameCanvas from './components/GameCanvas';
import { DIMENSIONS, PICK_TOOLS, LEVELS } from './constants';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.LOADING);
  const [lockState, setLockState] = useState<LockState>(lockService.getState());
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  // Game State
  const [currentPick, setCurrentPick] = useState<PickTool>(PICK_TOOLS[0]); 
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.TUTORIAL);
  const [currentLevelIdx, setCurrentLevelIdx] = useState<number>(0);

  // Tutorial State
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(TutorialStep.WAITING_FOR_HAND);
  const [instruction, setInstruction] = useState<string>("Initializing...");
  const [progress, setProgress] = useState<number>(0); 
  const tutorialTimerRef = useRef<number>(0);

  // Initialize CV and Permissions
  useEffect(() => {
    const init = async () => {
      try {
        if (!permissionGranted) return;
        
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          
          await cvService.initialize(videoRef.current);
          
          // Start with Tutorial config
          setGameMode(GameMode.TUTORIAL);
          lockService.reset({ pinCount: 3, gravity: 0.8, springConstant: 0.1 }); 
          
          setGameState(GameState.PLAYING);
          setTutorialStep(TutorialStep.WAITING_FOR_HAND);
          audioService.resume();
        }
      } catch (err: any) {
        console.error("Camera/Init error:", err);
        alert(`Initialization Error: ${err.message || "Unknown error"}`);
        setGameState(GameState.FAIL);
      }
    };
    init();
  }, [permissionGranted]);

  // Main Game Loop & Tutorial Logic
  useEffect(() => {
    if (gameState !== GameState.PLAYING) return;

    let lastTime = performance.now();
    let frameId: number;

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000; 
      lastTime = time;

      // 1. Get Input
      const input = cvService.processFrame();

      // 2. Update Physics
      lockService.update(input, dt, currentPick.id);
      const currentLock = lockService.getState();

      // 3. Update React State for Render
      setLockState({ ...currentLock });

      // --- TUTORIAL LOGIC ---
      if (gameMode === GameMode.TUTORIAL && !currentLock.isUnlocked) {
          let currentStepProgress = 0;
          
          switch (tutorialStep) {
            case TutorialStep.WAITING_FOR_HAND:
              setInstruction("Raise your hand to the camera to begin.");
              if (input.isTracking) {
                 tutorialTimerRef.current += dt;
                 currentStepProgress = Math.min(100, (tutorialTimerRef.current / 3.0) * 100);
                 
                 if (tutorialTimerRef.current > 3.0) {
                     setTutorialStep(TutorialStep.APPLY_TENSION);
                     tutorialTimerRef.current = 0;
                     currentStepProgress = 0;
                     audioService.playClick(800);
                 }
              } else {
                  tutorialTimerRef.current = 0;
                  currentStepProgress = 0;
              }
              break;

            case TutorialStep.APPLY_TENSION:
              setInstruction("Rotate your wrist clockwise to apply tension to the core.");
              if (input.tensionTorque > 0.3) {
                  tutorialTimerRef.current += dt;
                  currentStepProgress = Math.min(100, (tutorialTimerRef.current / 1.5) * 100);
                  if (tutorialTimerRef.current > 1.5) {
                      setTutorialStep(TutorialStep.ENTER_LOCK);
                      tutorialTimerRef.current = 0;
                      currentStepProgress = 0;
                      audioService.playClick(800);
                  }
              } else {
                  tutorialTimerRef.current = 0;
                  currentStepProgress = 0;
              }
              break;

            case TutorialStep.ENTER_LOCK:
              setInstruction("Keep tension applied. Use your index finger to insert the pick.");
              if (input.tensionTorque < 0.2) {
                 setInstruction("Keep Tension Applied!");
                 currentStepProgress = 0;
              } else {
                 if (currentLock.pickPosition.x > 110) {
                     setTutorialStep(TutorialStep.FIND_BINDING);
                     audioService.playClick(800);
                 }
              }
              break;

            case TutorialStep.FIND_BINDING:
               const targetPinIdx = currentLock.currentBindingIndex;
               if (targetPinIdx === -1) {
                   setInstruction("Apply more tension until a pin binds (feels stiff).");
                   currentStepProgress = 0;
               } else {
                   setInstruction(`Locate Binding Pin #${targetPinIdx + 1}.`);
                   const pinX = 100 + 50 + (targetPinIdx * DIMENSIONS.pinSpacing) + (DIMENSIONS.pinWidth / 2);
                   if (Math.abs(currentLock.pickPosition.x - pinX) < 15) {
                       tutorialTimerRef.current += dt;
                       currentStepProgress = Math.min(100, (tutorialTimerRef.current / 0.5) * 100);
                       if (tutorialTimerRef.current > 0.5) {
                           setTutorialStep(TutorialStep.LIFT_PIN);
                           tutorialTimerRef.current = 0;
                           currentStepProgress = 0;
                           audioService.playClick(1000);
                       }
                   } else {
                       tutorialTimerRef.current = 0;
                       currentStepProgress = 0;
                   }
               }
               break;

            case TutorialStep.LIFT_PIN:
                const target = currentLock.pins[currentLock.currentBindingIndex];
                if (!target || target.state === PinState.SET) {
                    setTutorialStep(TutorialStep.FIND_BINDING); 
                } else {
                    setInstruction("Lift gently until it clicks. Avoid lifting too high.");
                    if (target.state === PinState.OVERSET) {
                        setInstruction("Overset! Reduce tension to reset the pin.");
                    }
                }
                break;
          }
          
          setProgress(currentStepProgress);
      }

      // Check for success (Unlock)
      const allSet = currentLock.pins.every(p => p.state === PinState.SET);

      if (allSet && !currentLock.isUnlocked) {
          lockService.unlock();
          audioService.playOpen();
          // Delay showing the Success Screen to let animation play
          setTimeout(() => {
              setGameState(GameState.SUCCESS);
              if (gameMode === GameMode.TUTORIAL) {
                  setTutorialStep(TutorialStep.COMPLETED);
                  setInstruction("LOCK OPEN");
              }
          }, 1000);
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [gameState, tutorialStep, currentPick, gameMode]); 

  // --- HELPERS FOR LEVEL TRANSITION ---
  const startLevel = (levelIdx: number) => {
      const level = LEVELS[levelIdx];
      if (!level) return;

      setGameMode(GameMode.CAMPAIGN);
      setCurrentLevelIdx(levelIdx);
      lockService.reset({ 
          pinCount: level.pinCount, 
          ...level.configOverrides 
      });
      setGameState(GameState.PLAYING);
  };

  return (
    <div className="relative w-screen h-screen bg-slate-900 flex flex-col items-center justify-center overflow-hidden text-slate-200 selection:bg-blue-500/30">
      
      {/* Hidden video element for CV processing */}
      <video ref={videoRef} className="absolute top-4 left-4 w-48 opacity-0 pointer-events-none" playsInline muted style={{ transform: 'scaleX(-1)' }} />

      <div className="relative w-full max-w-4xl aspect-video bg-slate-800 rounded-lg shadow-2xl border border-slate-700 overflow-hidden">
        
        {/* TOOLKIT SIDEBAR */}
        {gameState === GameState.PLAYING && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 flex flex-col gap-2 pointer-events-auto">
                <div className="bg-slate-900/90 border border-slate-700 rounded p-2 shadow-lg">
                    <h4 className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider text-center">Select Pick</h4>
                    <div className="flex flex-col gap-1">
                        {PICK_TOOLS.map(tool => (
                            <button
                                key={tool.id}
                                onClick={() => {
                                    setCurrentPick(tool);
                                    audioService.playContact(); 
                                }}
                                className={`
                                    relative group px-3 py-2 text-xs font-medium border rounded transition-all text-left w-36
                                    ${currentPick.id === tool.id 
                                        ? 'bg-blue-600 border-blue-500 text-white' 
                                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}
                                `}
                            >
                                {tool.name}
                                {/* Tooltip */}
                                <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 w-40 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] p-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                                    {tool.description}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* --- INITIALIZATION SCREEN --- */}
        {!permissionGranted && gameState !== GameState.FAIL && (
           <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-slate-900">
             <div className="p-8 max-w-xl w-full flex flex-col items-center text-center">
                 
                 {/* Header */}
                 <div className="mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 border-2 border-slate-700 mb-6">
                        <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-4xl font-bold text-slate-100 tracking-tight mb-2">
                        Lock Pick Sim
                    </h1>
                    <p className="text-slate-400">Interactive Practice Lock</p>
                 </div>

                 {/* Description Panel */}
                 <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg w-full mb-8">
                    <p className="text-slate-300 text-sm leading-6">
                       This simulation uses your webcam to track your hand movements.
                       <br/><br/>
                       <span className="font-semibold text-white">Index Finger</span> controls the pick.<br/>
                       <span className="font-semibold text-white">Wrist Rotation</span> applies tension.
                    </p>
                 </div>

                 {/* CTA Button */}
                 <button 
                   onClick={() => setPermissionGranted(true)}
                   className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md transition-colors shadow-lg flex items-center gap-2"
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Start Simulation
                 </button>
                 
                 <div className="mt-6 text-xs text-slate-500">
                    Requires camera access. No data is sent to a server.
                 </div>
             </div>
           </div>
        )}

        {gameState === GameState.LOADING && permissionGranted && (
           <div className="absolute inset-0 flex items-center justify-center z-20 text-blue-400 font-medium animate-pulse">
             Calibrating Sensors...
           </div>
        )}

        {gameState === GameState.PLAYING && (
          <>
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
                <div className="text-slate-300 font-medium text-xs bg-slate-900/80 px-3 py-2 rounded border border-slate-700 shadow-sm backdrop-blur">
                    {lockState.currentBindingIndex !== -1 ? (
                        <span className="text-amber-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                            Binding: Pin #{lockState.currentBindingIndex + 1}
                        </span>
                    ) : (
                        <span className="text-slate-400">Searching for binding pin...</span>
                    )}
                </div>
                {gameMode === GameMode.CAMPAIGN && (
                     <div className="text-blue-300 font-medium text-xs bg-slate-900/80 px-3 py-2 rounded border border-slate-700 shadow-sm backdrop-blur">
                        Level {currentLevelIdx + 1}: {LEVELS[currentLevelIdx].name}
                     </div>
                )}
            </div>

            {gameMode === GameMode.TUTORIAL && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 w-3/4 max-w-lg pointer-events-none">
                    <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-4 shadow-xl text-center">
                        <h3 className="text-blue-400 font-bold text-xs uppercase tracking-wider mb-2">
                            Tutorial Step {tutorialStep + 1} / 6
                        </h3>
                        <p className="text-white text-lg font-medium">
                            {instruction}
                        </p>
                        {progress > 0 && (
                            <div className="mt-3 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div 
                                    className="bg-blue-500 h-full transition-all duration-100 ease-linear"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
          </>
        )}

        {gameState === GameState.SUCCESS && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-slate-900/90 backdrop-blur-sm text-white">
            <div className="bg-slate-800 p-8 rounded-lg border border-slate-700 shadow-2xl text-center max-w-md">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-3xl font-bold mb-2">Unlocked</h2>
                
                {gameMode === GameMode.TUTORIAL ? (
                    <>
                        <p className="text-slate-400 mb-6">Tutorial complete. You are ready for the campaign.</p>
                        <button 
                        onClick={() => startLevel(0)}
                        className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded hover:bg-blue-500 transition-colors"
                        >
                        Start Level 1
                        </button>
                    </>
                ) : (
                    <>
                        <p className="text-slate-400 mb-1">{LEVELS[currentLevelIdx].name} Complete</p>
                        <div className="mb-6 text-sm text-slate-500">
                            {currentLevelIdx < LEVELS.length - 1 
                                ? "Proceed to the next difficulty tier." 
                                : "Congratulations. You have beaten all levels."}
                        </div>

                        {currentLevelIdx < LEVELS.length - 1 ? (
                            <button 
                            onClick={() => startLevel(currentLevelIdx + 1)}
                            className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded hover:bg-blue-500 transition-colors"
                            >
                            Next Level
                            </button>
                        ) : (
                            <button 
                            onClick={() => startLevel(0)}
                            className="w-full px-6 py-3 bg-slate-700 text-white font-semibold rounded hover:bg-slate-600 transition-colors"
                            >
                            Replay Campaign
                            </button>
                        )}
                    </>
                )}
            </div>
          </div>
        )}

        {gameState === GameState.FAIL && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-red-900/90 backdrop-blur-sm text-white">
            <h2 className="text-2xl font-bold mb-4">Initialization Failed</h2>
            <p className="mb-4 text-center px-4 text-red-100">Camera access was denied or the vision library failed to load.</p>
            <button 
              onClick={() => {
                window.location.reload();
              }}
              className="px-6 py-2 bg-white text-red-900 font-bold rounded hover:bg-red-50"
            >
              Reload Page
            </button>
          </div>
        )}

        {/* Main Canvas */}
        <GameCanvas gameState={lockState} currentPick={currentPick} />
        
      </div>
      
      <div className="mt-4 text-slate-500 text-sm">
        <span className="font-semibold text-slate-400">Controls:</span> Index Finger to Pick  •  Wrist Rotation to Tension
      </div>
    </div>
  );
};

export default App;
