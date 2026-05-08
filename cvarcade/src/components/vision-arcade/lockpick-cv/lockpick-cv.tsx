
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, LockState, TutorialStep, PinState, PickTool, GameMode } from './types';
import { lockService } from './services/lockService';
import { audioService } from './services/audioService';
import GameCanvas from './components/GameCanvas';
import { DIMENSIONS, PICK_TOOLS, LEVELS } from './constants';
import { HandState as PlatformHandState } from '@/hooks/use-hand-tracking';
import { Button } from '@/components/ui/button';

interface LockPickCVProps {
  leftHand: PlatformHandState | null;
  rightHand: PlatformHandState | null;
  onGameOver: (result: 'Win') => void;
  onReturnToMenu: () => void;
}

export function LockPickCV({ leftHand, rightHand, onGameOver, onReturnToMenu }: LockPickCVProps) {
  const [gameState, setGameState] = useState<GameState>(GameState.PLAYING);
  const [lockState, setLockState] = useState<LockState>(lockService.getState());
  const [currentPick, setCurrentPick] = useState<PickTool>(PICK_TOOLS[0]); 
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.TUTORIAL);
  const [currentLevelIdx, setCurrentLevelIdx] = useState<number>(0);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(TutorialStep.WAITING_FOR_HAND);
  const [instruction, setInstruction] = useState<string>("Initializing...");
  const [progress, setProgress] = useState<number>(0); 
  const tutorialTimerRef = useRef<number>(0);

  // Smoothing
  const prevPickPos = useRef({ x: 0.5, y: 0.5 });
  const prevTorque = useRef(0);
  const SMOOTHING_FACTOR = 0.2;

  const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end;

  const processInput = useCallback(() => {
    const activeHand = rightHand || leftHand;
    if (!activeHand || !activeHand.rawLandmarks) {
        return { pickPosition: prevPickPos.current, tensionTorque: prevTorque.current, isTracking: false };
    }

    const landmarks = activeHand.rawLandmarks;
    const rawX = 1 - landmarks[8].x; 
    const rawY = landmarks[8].y;

    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const dx = indexMCP.x - wrist.x;
    const dy = indexMCP.y - wrist.y;
    const angle = Math.atan2(dy, dx); 
    let torque = (angle + 1.5) * 2.0; 
    torque = Math.max(0, Math.min(1, torque));

    const smoothX = lerp(prevPickPos.current.x, rawX, SMOOTHING_FACTOR);
    const smoothY = lerp(prevPickPos.current.y, rawY, SMOOTHING_FACTOR);
    const smoothTorque = lerp(prevTorque.current, torque, 0.1);

    prevPickPos.current = { x: smoothX, y: smoothY };
    prevTorque.current = smoothTorque;

    return {
      pickPosition: prevPickPos.current,
      tensionTorque: prevTorque.current,
      isTracking: true
    };
  }, [leftHand, rightHand]);

  useEffect(() => {
    audioService.resume();
    lockService.reset({ pinCount: 3, gravity: 0.8, springConstant: 0.1 });
    setGameMode(GameMode.TUTORIAL);
    setTutorialStep(TutorialStep.WAITING_FOR_HAND);
  }, []);

  useEffect(() => {
    if (gameState !== GameState.PLAYING) return;

    let lastTime = performance.now();
    let frameId: number;

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000; 
      lastTime = time;

      const input = processInput();
      lockService.update(input, dt, currentPick.id);
      const currentLock = lockService.getState();
      setLockState({ ...currentLock });

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
                     audioService.playClick(800);
                 }
              } else {
                  tutorialTimerRef.current = 0;
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
                      audioService.playClick(800);
                  }
              } else {
                  tutorialTimerRef.current = 0;
              }
              break;
            case TutorialStep.ENTER_LOCK:
              setInstruction("Keep tension applied. Use your index finger to insert the pick.");
              if (input.tensionTorque < 0.2) {
                 setInstruction("Keep Tension Applied!");
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
               } else {
                   setInstruction(`Locate Binding Pin #${targetPinIdx + 1}.`);
                   const pinX = 100 + 50 + (targetPinIdx * DIMENSIONS.pinSpacing) + (DIMENSIONS.pinWidth / 2);
                   if (Math.abs(currentLock.pickPosition.x - pinX) < 15) {
                       tutorialTimerRef.current += dt;
                       currentStepProgress = Math.min(100, (tutorialTimerRef.current / 0.5) * 100);
                       if (tutorialTimerRef.current > 0.5) {
                           setTutorialStep(TutorialStep.LIFT_PIN);
                           tutorialTimerRef.current = 0;
                           audioService.playClick(1000);
                       }
                   } else {
                       tutorialTimerRef.current = 0;
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

      const allSet = currentLock.pins.every(p => p.state === PinState.SET);
      if (allSet && !currentLock.isUnlocked) {
          lockService.unlock();
          audioService.playOpen();
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
  }, [gameState, tutorialStep, currentPick, gameMode, processInput]); 

  const startLevel = (levelIdx: number) => {
      const level = LEVELS[levelIdx];
      if (!level) return;
      setGameMode(GameMode.CAMPAIGN);
      setCurrentLevelIdx(levelIdx);
      lockService.reset({ pinCount: level.pinCount, ...level.configOverrides });
      setGameState(GameState.PLAYING);
  };

  return (
    <div className="w-full h-full absolute inset-0 bg-slate-900 flex flex-col items-center justify-center overflow-hidden">
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="relative w-full max-w-4xl aspect-video bg-slate-800 rounded-lg shadow-2xl border border-slate-700 overflow-hidden">
          
          {gameState === GameState.PLAYING && (
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 flex flex-col gap-2">
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
                                      px-3 py-2 text-xs font-medium border rounded transition-all text-left w-36
                                      ${currentPick.id === tool.id 
                                          ? 'bg-blue-600 border-blue-500 text-white' 
                                          : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}
                                  `}
                              >
                                  {tool.name}
                              </button>
                          ))}
                      </div>
                  </div>
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
                          <Button 
                          onClick={() => startLevel(0)}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                          >
                          Start Level 1
                          </Button>
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
                              <Button 
                              onClick={() => startLevel(currentLevelIdx + 1)}
                              className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                              >
                              Next Level
                              </Button>
                          ) : (
                              <Button 
                              onClick={() => startLevel(0)}
                              className="w-full bg-slate-700 hover:bg-slate-600 text-white"
                              >
                              Replay Campaign
                              </Button>
                          )}
                      </>
                  )}
              </div>
            </div>
          )}

          <GameCanvas gameState={lockState} currentPick={currentPick} />
          
        </div>
      </div>
      
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-500 text-sm bg-black/50 px-4 py-2 rounded-full backdrop-blur">
        <span className="font-semibold text-slate-400">Controls:</span> Index Finger to Pick  •  Wrist Rotation to Tension
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
