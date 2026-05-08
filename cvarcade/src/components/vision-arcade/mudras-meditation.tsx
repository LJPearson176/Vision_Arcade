
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { HandState } from '@/hooks/use-hand-tracking';
import { Clock, Eye, EyeOff, Hand, Annoyed } from 'lucide-react';
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';

interface MudrasMeditationProps {
  leftHand: HandState | null;
  rightHand: HandState | null;
  poseLandmarks: PoseLandmarkerResult['landmarks'] | null;
  onGameOver: (result: 'Win') => void;
  onReturnToMenu: () => void;
}

type BreathPhase = 'INHALE' | 'HOLD' | 'EXHALE';

const SESSION_DURATION_SECONDS = 60 * 5; // 5 minutes
const BREATH_CYCLE = {
    INHALE: 4000,
    HOLD: 7000,
    EXHALE: 8000,
    TOTAL: 19000,
};

const AUDIO_FILES = {
    CLOSE_YOUR_EYES: '/audio/closes_your_eyes.mp3',
    GOOD: '/audio/good.mp3',
    INHALE: '/audio/inhale.mp3',
    HOLD: '/audio/hold.mp3',
    EXHALE: '/audio/exhale.mp3',
    RESUME_PROPER_HANDS: '/audio/resume_proper_hands.mp3',
    RESUME_PROPER_POSTURE: '/audio/resume_proper_posture.mp3',
};

type AudioKeys = keyof typeof AUDIO_FILES;

export function MudrasMeditation({
  leftHand,
  rightHand,
  poseLandmarks,
  onReturnToMenu,
}: MudrasMeditationProps) {
  const audioRef = useRef<Record<string, HTMLAudioElement | null>>({});
  const animationFrameIdRef = useRef<number>();
  const audioQueueRef = useRef<AudioKeys[]>([]);
  const isPlayingAudioRef = useRef(false);

  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION_SECONDS);
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('EXHALE');
  const [isReady, setIsReady] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isBothEyesClosed, setIsBothEyesClosed] = useState(false);
  const [isPostureGood, setIsPostureGood] = useState(true);


  const gameTimeRef = useRef({
      cycleTime: 0,
      lastTimestamp: 0,
  });

  const stateRef = useRef({
      wasReady: false,
      wasSessionActive: false,
      wasPostureGood: true,
      wereHandsGood: true,
  });

  const playInstruction = useCallback(async (key: AudioKeys) => {
    const audio = audioRef.current[key];
    if (!audio) return;
    
    isPlayingAudioRef.current = true;
    return new Promise<void>((resolve) => {
      const onEnded = () => {
        audio.removeEventListener('ended', onEnded);
        isPlayingAudioRef.current = false;
        resolve();
      };
      audio.addEventListener('ended', onEnded);
      audio.currentTime = 0;
      audio.play().catch(() => {
        // If play fails, release the lock and resolve
        isPlayingAudioRef.current = false;
        resolve();
      });
    });
  }, []);

  const pushToAudioQueue = useCallback((key: AudioKeys) => {
    if (audioQueueRef.current.slice(-1)[0] === key) return; // Don't add if it's the last in queue
    audioQueueRef.current.push(key);
  }, []);

  const processAudioQueue = useCallback(async () => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) {
      return;
    }
    const audioKey = audioQueueRef.current.shift();
    if (audioKey) {
      await playInstruction(audioKey);
    }
  }, [playInstruction]);
  
  const gameLoop = useCallback(() => {
    // --- Posture & Mudra Evaluation ---
    let currentPoseIsGood = true;
    if (poseLandmarks && poseLandmarks[0]) {
      const shoulderLeft = poseLandmarks[0][11];
      const shoulderRight = poseLandmarks[0][12];
      const hipLeft = poseLandmarks[0][23];
      const hipRight = poseLandmarks[0][24];

      if (shoulderLeft && shoulderRight && hipLeft && hipRight) {
        const shoulderZ = (shoulderLeft.z + shoulderRight.z) / 2;
        const hipZ = (hipLeft.z + hipRight.z) / 2;
        const leanDifference = shoulderZ - hipZ;
        if (leanDifference < -0.08 || leanDifference > 0.08) {
            currentPoseIsGood = false;
        }
      }
    }
    setIsPostureGood(currentPoseIsGood);

    const areHandsGood = (leftHand?.isGyanMudra ?? false) && (rightHand?.isGyanMudra ?? false);
    const isUserReady = areHandsGood && currentPoseIsGood;
    setIsReady(isUserReady);

    const currentIsBothEyesClosed = (leftHand?.isNearHead && rightHand?.isNearHead) ?? false;
    setIsBothEyesClosed(currentIsBothEyesClosed);

    const isSessionRunning = isUserReady && currentIsBothEyesClosed;
    setIsSessionActive(isSessionRunning);

    // --- State Change Audio Logic ---
    if (isUserReady && !stateRef.current.wasReady) {
        pushToAudioQueue('GOOD');
        setTimeout(() => pushToAudioQueue('CLOSE_YOUR_EYES'), 500); 
    }
    
    if (!isSessionRunning && stateRef.current.wasSessionActive) { // Session just paused
      if (!currentPoseIsGood && stateRef.current.wasPostureGood) {
        pushToAudioQueue('RESUME_PROPER_POSTURE');
      } else if (!areHandsGood && stateRef.current.wereHandsGood) {
        pushToAudioQueue('RESUME_PROPER_HANDS');
      }
    }
    
    // Update previous states for next frame
    stateRef.current.wasReady = isUserReady;
    stateRef.current.wasSessionActive = isSessionRunning;
    stateRef.current.wasPostureGood = currentPoseIsGood;
    stateRef.current.wereHandsGood = areHandsGood;

    // --- Breathing Cycle Logic ---
    const now = performance.now();
    if (gameTimeRef.current.lastTimestamp === 0) gameTimeRef.current.lastTimestamp = now;
    const deltaTime = now - gameTimeRef.current.lastTimestamp;
    gameTimeRef.current.lastTimestamp = now;

    if (isSessionRunning) {
        gameTimeRef.current.cycleTime = (gameTimeRef.current.cycleTime + deltaTime) % BREATH_CYCLE.TOTAL;
    }

    const cycleTime = gameTimeRef.current.cycleTime;
    let currentPhase: BreathPhase = 'EXHALE';
    
    if (cycleTime < BREATH_CYCLE.INHALE) {
        currentPhase = 'INHALE';
    } else if (cycleTime < BREATH_CYCLE.INHALE + BREATH_CYCLE.HOLD) {
        currentPhase = 'HOLD';
    } else {
        currentPhase = 'EXHALE';
    }

    if (breathPhase !== currentPhase && isSessionRunning) {
        setBreathPhase(currentPhase);
        pushToAudioQueue(currentPhase);
    }
    
    // --- Trigger audio processing (non-blocking) ---
    processAudioQueue();

    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [leftHand, poseLandmarks, rightHand, pushToAudioQueue, breathPhase, processAudioQueue]);

  // Main setup effect
  useEffect(() => {
    Object.keys(AUDIO_FILES).forEach(key => {
        const audio = new Audio(AUDIO_FILES[key as keyof typeof AUDIO_FILES]);
        audio.preload = 'auto';
        audioRef.current[key] = audio;
    });

    gameTimeRef.current.lastTimestamp = performance.now();
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    
    const timerInterval = setInterval(() => {
        if(isSessionActive) {
            setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
        }
    }, 1000);

    return () => {
        clearInterval(timerInterval);
        if (animationFrameIdRef.current) {
            cancelAnimationFrame(animationFrameIdRef.current);
        }
        Object.values(audioRef.current).forEach(audio => {
            if (audio) {
                audio.pause();
                audio.src = '';
            }
        });
    };
  }, [gameLoop, isSessionActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPostureText = () => {
    if (!isReady && !isPostureGood) return { text: "Straighten Your Back", Icon: Annoyed, color: 'text-yellow-400' };
    return { text: "Posture Good", Icon: Hand, color: 'text-green-400' };
  };

  const getHandsText = () => {
    const handsGood = (leftHand?.isGyanMudra ?? false) && (rightHand?.isGyanMudra ?? false);
    if (!isReady && !handsGood) return { text: "Form Gyan Mudra", Icon: Annoyed, color: 'text-yellow-400' };
    return { text: "Hands Correct", Icon: Hand, color: 'text-green-400' };
  };

  const getEyesText = () => {
    if (!isReady) return { text: "First, Correct Your Form", Icon: Eye, color: 'text-muted-foreground' };
    if (isSessionActive) return { text: "Session in Progress", Icon: EyeOff, color: 'text-primary' };
    return { text: "Close Your Eyes to Begin", Icon: Eye, color: 'text-green-400 animate-pulse' };
  };

  const PostureItem = ({ item }: { item: { text: string, Icon: React.ElementType, color: string } }) => (
    <div className={`flex items-center gap-3 text-xl ${item.color}`}>
      <item.Icon className="h-6 w-6" />
      <span>{item.text}</span>
    </div>
  );

  return (
    <div className="w-full h-full absolute inset-0 flex flex-col items-center justify-between text-white bg-gradient-to-br from-[#1a1a2e] to-[#16213e]">
      {/* Top HUD */}
      <div className="w-full bg-black/30 p-4 flex justify-between items-center z-10 font-headline">
        <Button variant="outline" onClick={onReturnToMenu}>
          End Session
        </Button>
        <div className="flex items-center gap-2 text-2xl">
          <Clock />
          <span>{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center text-center">
        {!isSessionActive ? (
            <div className="p-10 bg-black/30 backdrop-blur-sm rounded-lg border border-primary/20 space-y-6">
                <h2 className="text-4xl font-headline text-primary">Meditation Prep</h2>
                <PostureItem item={getPostureText()} />
                <PostureItem item={getHandsText()} />
                <PostureItem item={getEyesText()} />
            </div>
        ) : (
             <div className="flex flex-col items-center gap-4">
                <div className="text-7xl font-headline text-primary animate-pulse tracking-widest">
                    {breathPhase}
                </div>
                <div className="text-xl text-muted-foreground">Listen and follow the instructions</div>
             </div>
        )}
      </div>

      {/* Footer Area */}
      <div className="w-full bg-black/30 p-4 flex justify-center items-center z-10">
        <p className="text-muted-foreground">Vision Arcade Meditation</p>
      </div>
    </div>
  );
}
