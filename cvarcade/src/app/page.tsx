

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { HandPong } from '@/components/vision-arcade/hand-pong';
import { CupPong } from '@/components/vision-arcade/cup-pong';
import { DuckHunt } from '@/components/vision-arcade/duck-hunt';
import { Hurdles } from '@/components/vision-arcade/hurdles';
import { BreathOfTheWolf } from '@/components/vision-arcade/breath-of-the-wolf';
import { Predator } from '@/components/vision-arcade/predator';
import { MudrasMeditation } from '@/components/vision-arcade/mudras-meditation';
import { KongClimber } from '@/components/vision-arcade/kong-climber/kong-climber';
import { LockPickCV } from '@/components/vision-arcade/lockpick-cv/lockpick-cv';
import { TronRacer } from '@/components/vision-arcade/tron-racer/tron-racer';
import { MenuScreen } from '@/components/vision-arcade/menu-screen';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { usePoseTracking, CVClimbState, CVHurdlesState, HeadState } from '@/hooks/use-pose-tracking';
import { WebcamPreview } from '@/components/vision-arcade/webcam-preview';
import { Button } from '@/components/ui/button';
import { Loader, AlertTriangle, Gamepad2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DrawingUtils } from '@mediapipe/tasks-vision';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type AppState = 'idle' | 'loading' | 'ready' | 'error';
type GameId = 'hand-pong' | 'cup-pong' | 'duck-hunt' | 'hurdles' | 'breath-of-the-wolf' | 'predator' | 'mudras-meditation' | 'kong-climber' | 'lockpick-cv' | 'tron-racer';
type GameType = 'hand' | 'pose' | 'hybrid';
type GameState = 'menu' | GameId;

const GAME_TYPES: Record<GameId, GameType> = {
    'hand-pong': 'hand',
    'cup-pong': 'hand',
    'duck-hunt': 'hand',
    'breath-of-the-wolf': 'hybrid',
    'predator': 'pose',
    'hurdles': 'pose',
    'mudras-meditation': 'hybrid',
    'kong-climber': 'hand',
    'lockpick-cv': 'hand',
    'tron-racer': 'hybrid',
}

export default function VisionArcadePage() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [gameState, setGameState] = useState<GameState>('menu');
  const [activeGameType, setActiveGameType] = useState<GameType | null>(null);
  const { toast } = useToast();

  const [sequenceLog, setSequenceLog] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  const [showColorKey, setShowColorKey] = useState(true);
  
  const addLog = useCallback((log: string) => {
    setSequenceLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${log}`]);
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderLoopRef = useRef<number>();

  const { isJumping, climbState, hurdlesState, lean, poseLandmarks, isLeftEyeClosed, isRightEyeClosed, isMouthOpen, mouthOpenRatio, headPosition, isLeftFootGrounded, isRightFootGrounded, isLeftKneeAboveWaist, isRightKneeAboveWaist, start: startPoseTracking, stop: stopPoseTracking, isModelReady: isPoseModelReady, getPoseDrawData } = usePoseTracking({
    videoRef,
  });

  const { 
    leftHand, rightHand,
    start: startHandTracking, stop: stopHandTracking, isModelReady: isHandModelReady, getHandDrawData 
  } = useHandTracking({
    videoRef,
    poseLandmarks,
  });
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || appState !== 'ready') {
      if(renderLoopRef.current) cancelAnimationFrame(renderLoopRef.current);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const poseDrawingUtils = new DrawingUtils(ctx);
    const handDrawingUtils = new DrawingUtils(ctx);
    
    const renderLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const poseDrawData = getPoseDrawData();
      if (poseDrawData) {
        poseDrawingUtils.drawConnectors(poseDrawData.landmarks, poseDrawData.connections, { color: '#7DF9FF', lineWidth: 2 });
        poseDrawingUtils.drawLandmarks(poseDrawData.landmarks, { color: '#7DF9FF', radius: 3 });
        if (poseDrawData.faceLandmarks) {
          // You could add face drawing here if desired
        }
      }
      
      const handDrawData = getHandDrawData();
      if (handDrawData) {
        handDrawData.forEach(hand => {
           handDrawingUtils.drawConnectors(hand.landmarks, hand.connections, { color: hand.color, lineWidth: 2 });
           handDrawingUtils.drawLandmarks(hand.landmarks, { color: hand.color, radius: 3 });
        });
      }
      
      renderLoopRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoopRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (renderLoopRef.current) {
        cancelAnimationFrame(renderLoopRef.current);
      }
      if(ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [appState, getHandDrawData, getPoseDrawData]);

  const stopVision = useCallback(() => {
    addLog('Stopping all vision models.');
    stopHandTracking();
    stopPoseTracking();
  }, [stopHandTracking, stopPoseTracking, addLog]);
  
  const handleStartCamera = useCallback(async () => {
    if (appState === 'loading' || appState === 'ready') return;
    addLog('Start Camera clicked.');
    setAppState('loading');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({video: true});
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
            if(videoRef.current) videoRef.current.onloadedmetadata = resolve
        });
      }
      
      await Promise.all([startPoseTracking(), startHandTracking()]);

      addLog('All models ready.');
      setActiveGameType('hybrid');
      setAppState('ready');
      setGameState('menu');
    } catch (err) {
      addLog(`Error starting camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('Camera or model error:', err);
      setAppState('error');
      toast({
        variant: 'destructive',
        title: 'Initialization Error',
        description:
          err instanceof Error && err.message.includes('Permission denied')
            ? 'Please allow camera access to play.'
            : 'Could not access camera or load AI model.',
      });
    }
  }, [startPoseTracking, startHandTracking, toast, appState, addLog]);

  useEffect(() => {
    return () => {
      stopVision();
    };
  }, [stopVision]);

  const handleReturnToMenu = useCallback(async () => {
    addLog('handleReturnToMenu called.');
    setAppState('loading');
    stopVision();
    await new Promise(resolve => setTimeout(resolve, 100)); 
    try {
      addLog('Restarting pose and hand tracking for menu.');
      await startPoseTracking();
      await startHandTracking();
      addLog('Tracking for menu restarted.');
      setActiveGameType('hybrid');
      setGameState('menu');
      setAppState('ready');
    } catch (err) {
      addLog(`Error returning to menu: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('Error returning to menu:', err);
      setAppState('error');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not restart tracking for the menu.',
      });
    }
  }, [stopVision, startHandTracking, startPoseTracking, toast, addLog]);

  const handlePlayGame = async (game: GameId) => {
    addLog(`Play button clicked for game: ${game}`);
    const gameType = GAME_TYPES[game];

    if (activeGameType === gameType) {
      addLog(`Game type '${gameType}' is already active. Starting game directly.`);
      setGameState(game);
      setAppState('ready');
      return;
    }

    addLog(`Switching vision model to: ${gameType}`);
    setAppState('loading');
    stopVision();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      if (gameType === 'pose') {
        addLog('Starting pose tracking...');
        await startPoseTracking();
        addLog('Pose tracking started.');
      } else if (gameType === 'hand') {
        addLog('Starting hand tracking...');
        await startHandTracking();
        addLog('Hand tracking started.');
      } else if (gameType === 'hybrid') {
        addLog('Starting pose tracking for hybrid...');
        await startPoseTracking();
        addLog('Pose tracking started. Now starting hand tracking...');
        await startHandTracking();
        addLog('Both models started for hybrid game.');
      }

      addLog(`Model ready. Setting active game type to '${gameType}'.`);
      setActiveGameType(gameType);
      addLog(`Setting game state to '${game}'.`);
      setGameState(game);
      addLog("Setting app state to 'ready'.");
      setAppState('ready');
    } catch(err) {
       addLog(`Error switching game: ${err instanceof Error ? err.message : 'Unknown error'}`);
       console.error('Error switching game:', err);
       setAppState('error');
       toast({
         variant: 'destructive',
         title: 'Error starting game',
         description: 'Could not switch the vision model. Please try again.'
       })
    }
  };

  const handleGameOver = useCallback((winner?: 'Player' | 'AI' | 'Win' | 'Lose' | 'TimeUp' | number) => {
    addLog(`Game over. Winner: ${winner || 'N/A'}`);

    let title = 'Game Over';
    let description = '';

    if (typeof winner === 'number') {
        title = 'Race Finished!';
        description = `Your time: ${(winner / 1000).toFixed(2)}s`;
    } else {
      switch(winner) {
        case 'Player':
          title = 'You Win!';
          description = 'You defeated the AI!';
          break;
        case 'AI':
          title = 'Game Over';
          description = 'The AI has bested you.';
          break;
        case 'Win':
          title = 'You Win!';
          description = 'Congratulations!';
          break;
        case 'Lose':
          title = 'Game Over';
          description = 'Better luck next time!';
          break;
        case 'TimeUp':
            title = "Time's Up!";
            description = 'You ran out of time.';
            break;
      }
    }
    toast({ title, description });
    setTimeout(() => {
      handleReturnToMenu();
    }, 2500);
  }, [toast, handleReturnToMenu, addLog]);
  

  const renderContent = () => {
    if (appState !== 'ready') {
       switch (appState) {
          case 'idle':
            return (
              <div className="text-center">
                <h1 className="font-headline text-5xl md:text-7xl text-primary mb-4">Vision Arcade</h1>
                <p className="mb-8 text-lg text-muted-foreground">Control the game with your body.</p>
                <Button size="lg" onClick={handleStartCamera}>
                  <Gamepad2 className="mr-2" /> Start Camera
                </Button>
              </div>
            );
          case 'loading':
            return (
              <div className="text-center">
                <Loader className="mx-auto h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Initializing camera and AI models...</p>
              </div>
            );
          case 'error':
            return (
              <div className="text-center p-4 border-2 border-destructive/50 rounded-lg bg-destructive/10">
                <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
                <h2 className="font-headline text-2xl text-destructive-foreground mb-2">An Error Occurred</h2>
                <p className="text-destructive-foreground/80 mb-6">Could not access camera or load model.</p>
                <Button variant="destructive" onClick={handleStartCamera}>Try Again</Button>
              </div>
            );
        }
    }
    
    switch (gameState) {
        case 'menu':
            return <MenuScreen onPlay={handlePlayGame} />;
        case 'hand-pong':
            return <HandPong handPosition={rightHand?.position || null} onGameOver={handleGameOver} onReturnToMenu={handleReturnToMenu} />;
        case 'cup-pong':
            return <CupPong handPosition={rightHand?.position || null} isPinching={rightHand?.isPinching || false} onGameOver={handleGameOver} onReturnToMenu={handleReturnToMenu} />;
        case 'duck-hunt':
            return <DuckHunt leftHand={leftHand} rightHand={rightHand} onGameOver={handleGameOver} onReturnToMenu={handleReturnToMenu} />;
        case 'hurdles':
            return <Hurdles hurdlesState={hurdlesState} isJumping={isJumping} onGameOver={handleGameOver} onReturnToMenu={handleReturnToMenu} />;
        case 'breath-of-the-wolf':
            return <BreathOfTheWolf rightHand={rightHand} isMouthOpen={isMouthOpen} mouthOpenRatio={mouthOpenRatio} onGameOver={handleGameOver} onReturnToMenu={handleReturnToMenu} />;
        case 'predator':
            return <Predator climbState={climbState} headState={headPosition} mouthOpenness={mouthOpenRatio} onGameOver={handleGameOver} onReturnToMenu={handleReturnToMenu} />;
        case 'mudras-meditation':
            return <MudrasMeditation leftHand={leftHand} rightHand={rightHand} poseLandmarks={poseLandmarks} onGameOver={handleGameOver} onReturnToMenu={handleReturnToMenu} />;
        case 'kong-climber':
            return <KongClimber leftHand={leftHand} rightHand={rightHand} onGameOver={handleGameOver} onReturnToMenu={handleReturnToMenu} />;
        case 'lockpick-cv':
            return <LockPickCV leftHand={leftHand} rightHand={rightHand} onGameOver={() => handleGameOver('Win')} onReturnToMenu={handleReturnToMenu} />;
        case 'tron-racer':
            return <TronRacer leftHand={leftHand} rightHand={rightHand} poseLandmarks={poseLandmarks} onGameOver={(score) => handleGameOver(score)} onReturnToMenu={handleReturnToMenu} />;
        default:
            handleReturnToMenu();
            return <MenuScreen onPlay={handlePlayGame} />;
    }
  };
  
  const showWebcam = appState === 'ready' || appState === 'loading';

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-background text-foreground p-4 overflow-hidden relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-10" style={{
          '--grid-color': 'hsl(var(--primary))',
          '--grid-size': '40px',
          '--grid-weight': '1px',
          backgroundImage: 'linear-gradient(to right, var(--grid-color) var(--grid-weight), transparent var(--grid-weight)), linear-gradient(to bottom, var(--grid-color) var(--grid-weight), transparent var(--grid-weight))',
          backgroundSize: 'var(--grid-size) var(--grid-size)'
        }}></div>
      <div className="z-10 w-full h-full flex items-center justify-center">
        {renderContent()}
      </div>

      {showDebugPanel && <div className="absolute top-2 left-2 z-50 bg-black/70 p-2 rounded-lg text-white font-mono text-xs max-h-[90vh] overflow-y-auto w-96">
        <p className="font-bold">Sequence Log:</p>
        <ul className="max-h-24 overflow-y-auto">
          {sequenceLog.slice(-10).map((log, i) => <li key={i}>{log}</li>)}
        </ul>
        <p className="mt-2 font-bold">Current State:</p>
        <p>App: {appState}</p>
        <p>Game: {gameState}</p>
        <p>Active Model: {activeGameType}</p>
        
        {activeGameType && ['hand', 'hybrid'].includes(activeGameType) && (
            <div className="mt-2 pt-2 border-t border-gray-500">
                <p className="font-bold">Hand State:</p>
                <p>Left Hand: {leftHand ? (leftHand.isClosed ? 'Closed' : (leftHand.isThumbUp ? 'ThumbUp' : 'Open')) : 'N/A'}</p>
                <p>...Above Head: {leftHand ? (leftHand.isAboveHead ? 'Yes' : 'No') : 'N/A'}</p>
                <p>Right Hand: {rightHand ? (rightHand.isClosed ? 'Closed' : (rightHand.isThumbUp ? 'ThumbUp' : 'Open')) : 'N/A'}</p>
                <p>...Above Head: {rightHand ? (rightHand.isAboveHead ? 'Yes' : 'No') : 'N/A'}</p>
            </div>
        )}
        {activeGameType && ['pose', 'hybrid'].includes(activeGameType) && (
            <div className="mt-2 pt-2 border-t border-gray-500">
                <p className="font-bold">Pose State:</p>
                <p>Left Foot Grounded: {isLeftFootGrounded ? 'Yes' : 'No'}</p>
                <p>Right Foot Grounded: {isRightFootGrounded ? 'Yes' : 'No'}</p>
                <p>Left Knee Above Waist: {isLeftKneeAboveWaist ? 'Yes' : 'No'}</p>
                <p>Right Knee Above Waist: {isRightKneeAboveWaist ? 'Yes' : 'No'}</p>
                <p>Left Eye Closed: {isLeftEyeClosed ? 'Yes' : 'No'}</p>
                <p>Right Eye Closed: {isRightEyeClosed ? 'Yes' : 'No'}</p>
                <p>Mouth Open: {isMouthOpen ? 'Yes' : 'No'} (Ratio: {mouthOpenRatio.toFixed(2)})</p>
                {headPosition && <p>Head: x: {headPosition.x.toFixed(2)} y: {headPosition.y.toFixed(2)}</p>}
            </div>
        )}
      </div>}

      <div className="absolute top-2 right-2 z-50 bg-black/70 p-3 rounded-lg text-white font-mono text-xs space-y-2">
        <div className="flex items-center space-x-2">
          <Switch id="debug-panel-toggle" checked={showDebugPanel} onCheckedChange={setShowDebugPanel} />
          <Label htmlFor="debug-panel-toggle">Show Debug Panel</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch id="color-key-toggle" checked={showColorKey} onCheckedChange={setShowColorKey} />
          <Label htmlFor="color-key-toggle">Show Color Key</Label>
        </div>
      </div>

      {showWebcam && showColorKey && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl">
            <div className="bg-black/70 p-3 rounded-lg text-white font-mono text-xs text-center">
                <p className="font-bold mb-2 text-primary">Hand Color Key</p>
                <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                    <li className="flex items-center"><span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#7DF9FF' }}></span>Right Hand Open</li>
                    <li className="flex items-center"><span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#FF69B4' }}></span>Left Hand Open</li>
                    <li className="flex items-center"><span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#FFFF00' }}></span>Right Hand Closed</li>
                    <li className="flex items-center"><span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#FFA500' }}></span>Left Hand Closed</li>
                    <li className="flex items-center"><span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#00FF7F' }}></span>Right Thumbs Up</li>
                    <li className="flex items-center"><span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#32CD32' }}></span>Left Thumbs Up</li>
                </ul>
            </div>
        </div>
      )}

      <WebcamPreview 
        videoRef={videoRef} 
        canvasRef={canvasRef} 
        isVisible={showWebcam} 
      />
    </main>
  );
}
