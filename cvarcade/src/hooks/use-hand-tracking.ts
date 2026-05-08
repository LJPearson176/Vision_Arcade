
'use client';

import { useState, useCallback, useRef, RefObject, useEffect } from 'react';
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
  HandLandmarkerResult,
  PoseLandmarkerResult,
  NormalizedLandmark,
  Landmarker,
} from '@mediapipe/tasks-vision';

interface UseHandTrackingProps {
  videoRef: RefObject<HTMLVideoElement>;
  poseLandmarks: PoseLandmarkerResult['landmarks'] | null;
}

export interface HandState {
    handedness: 'Left' | 'Right';
    position: { x: number; y: number } | null; // Wrist
    isPinching: boolean;
    isClosed: boolean;
    isThumbUp: boolean;
    isGyanMudra: boolean; // New state for Gyan Mudra
    isNearHead: boolean;
    isAboveHead: boolean;
    swipe: 'left' | 'right' | 'none';
    rawLandmarks: NormalizedLandmark[];
}

export interface HandTrackingResult {
    leftHand: HandState | null;
    rightHand: HandState | null;
}

type HandDrawData = {
    landmarks: NormalizedLandmark[];
    connections: {start: number, end: number}[];
    color: string;
}

const PINCH_THRESHOLD = 0.05;
const GYAN_MUDRA_THRESHOLD = 0.04;
const NEAR_HEAD_THRESHOLD = 0.15; // Vertical distance to be considered "near head"
const ABOVE_HEAD_THRESHOLD = 0.05; // Must be this much higher than headY

// Swipe detection constants
const SWIPE_VELOCITY_START_THRESHOLD = 0.02; // Velocity to initiate a swipe
const SWIPE_VELOCITY_END_THRESHOLD = 0.01;   // Velocity to complete a swipe
const SWIPE_COOLDOWN = 500; // ms between swipes


function isHandClosed(landmarks: NormalizedLandmark[]): boolean {
    if (!landmarks || landmarks.length < 21) return false;

    // A simple check: if finger tips are lower than the PIP joints, the hand is likely closed.
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    return (
        indexTip.y > indexPip.y &&
        middleTip.y > middlePip.y &&
        ringTip.y > ringPip.y &&
        pinkyTip.y > pinkyPip.y
    );
}


function isThumbUp(landmarks: NormalizedLandmark[]): boolean {
    if (!landmarks || landmarks.length < 21) return false;
    
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const thumbMcp = landmarks[2];

    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    // Thumb is up if its tip is above the IP joint, and the IP is above the MCP
    const thumbIsUp = thumbTip.y < thumbIp.y && thumbIp.y < thumbMcp.y;

    // Fingers are curled if their tips are below their PIP joints
    const indexCurled = indexTip.y > indexPip.y;
    const middleCurled = middleTip.y > middlePip.y;
    const ringCurled = ringTip.y > ringPip.y;
    const pinkyCurled = pinkyTip.y > pinkyPip.y;


    return thumbIsUp && indexCurled && middleCurled && ringCurled && pinkyCurled;
}

// New function for Gyan Mudra detection
function isGyanMudra(landmarks: NormalizedLandmark[]): boolean {
    if (!landmarks || landmarks.length < 21) return false;

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const middlePip = landmarks[10];
    const ringPip = landmarks[14];
    const pinkyPip = landmarks[18];

    // 1. Thumb and index finger tips are touching
    const tipDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y, thumbTip.z - indexTip.z);
    if (tipDistance > GYAN_MUDRA_THRESHOLD) {
        return false;
    }

    // 2. Other three fingers are relatively straight (tip is above PIP joint)
    const middleStraight = middleTip.y < middlePip.y;
    const ringStraight = ringTip.y < ringPip.y;
    const pinkyStraight = pinkyTip.y < pinkyPip.y;

    return middleStraight && ringStraight && pinkyStraight;
}


const COLORS = {
  RIGHT_OPEN: '#7DF9FF', // Teal
  LEFT_OPEN: '#FF69B4', // Pink
  RIGHT_CLOSED: '#FFFF00', // Yellow
  LEFT_CLOSED: '#FFA500', // Orange
  RIGHT_THUMB_UP: '#00FF7F', // Spring Green
  LEFT_THUMB_UP: '#32CD32', // Lime Green
};


function getColorForHand(handState: HandState): string {
    if (handState.isGyanMudra) {
        return handState.handedness === 'Right' ? COLORS.RIGHT_OPEN : COLORS.LEFT_OPEN;
    }
    if (handState.isThumbUp) {
        return handState.handedness === 'Right' ? COLORS.RIGHT_THUMB_UP : COLORS.LEFT_THUMB_UP;
    }
    if (handState.isClosed) {
        return handState.handedness === 'Right' ? COLORS.RIGHT_CLOSED : COLORS.LEFT_CLOSED;
    }
    return handState.handedness === 'Right' ? COLORS.RIGHT_OPEN : COLORS.LEFT_OPEN;
}


export function useHandTracking({ videoRef, poseLandmarks }: UseHandTrackingProps) {
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModelReady, setIsModelReady] = useState(false);
  
  const [trackingResult, setTrackingResult] = useState<HandTrackingResult>({
      leftHand: null,
      rightHand: null,
  });
  const handDrawDataRef = useRef<HandDrawData[] | null>(null);

  const requestRef = useRef<number>();
  const lastVideoTimeRef = useRef(-1);
  const isRunning = useRef(false);

  const latestPoseLandmarks = useRef(poseLandmarks);
  useEffect(() => {
    latestPoseLandmarks.current = poseLandmarks;
  }, [poseLandmarks]);

  type SwipeState = 'idle' | 'swiping' | 'cooldown';
  
  const handStates = useRef<{
      left: { lastX: number | null, velocityX: number, swipeState: SwipeState, swipeDirection: 'left' | 'right' | null, lastSwipeTime: number },
      right: { lastX: number | null, velocityX: number, swipeState: SwipeState, swipeDirection: 'left' | 'right' | null, lastSwipeTime: number }
  }>({
      left: { lastX: null, velocityX: 0, swipeState: 'idle', swipeDirection: null, lastSwipeTime: 0 },
      right: { lastX: null, velocityX: 0, swipeState: 'idle', swipeDirection: null, lastSwipeTime: 0 },
  });


  useEffect(() => {
    const createHandLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
        handLandmarkerRef.current = landmarker;
        setIsModelReady(true);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to load HandLandmarker model.';
        setError(message);
        console.error(e);
      }
    };
    if (!handLandmarkerRef.current) {
        createHandLandmarker();
    }
  }, []);

  const processHand = useCallback((landmarks: NormalizedLandmark[], handedness: 'Left' | 'Right', timestamp: number): HandState => {
      const wrist = landmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];

      const position = { x: 1 - wrist.x, y: wrist.y }; // Mirrored

      const pinchDistance = Math.sqrt(
          Math.pow(thumbTip.x - indexTip.x, 2) +
          Math.pow(thumbTip.y - indexTip.y, 2) +
          Math.pow(thumbTip.z - indexTip.z, 2)
      );
      const isPinching = pinchDistance < PINCH_THRESHOLD;

      // Check for Gyan Mudra first
      const gyanMudra = isGyanMudra(landmarks);

      // Prioritize thumbs-up detection if not in Gyan Mudra
      const thumbUp = !gyanMudra && isThumbUp(landmarks);
      
      // Only detect a closed fist if it's not a thumbs-up or Gyan Mudra
      const closed = !thumbUp && !gyanMudra && isHandClosed(landmarks);
      
      let isNearHead = false;
      let isAboveHead = false;
      const currentPoseLandmarks = latestPoseLandmarks.current;
      
      if (currentPoseLandmarks && currentPoseLandmarks[0] && position) {
          const nose = currentPoseLandmarks[0][0]; // landmark 0 is the nose
          if (nose) {
            const headY = nose.y;
            isNearHead = Math.abs(position.y - headY) < NEAR_HEAD_THRESHOLD;
            isAboveHead = position.y < headY - ABOVE_HEAD_THRESHOLD;
          }
      }
      
      let swipe: 'left' | 'right' | 'none' = 'none';
      const state = handedness === 'Left' ? handStates.current.left : handStates.current.right;
      
      if (state.lastX !== null) {
          const currentVelocity = position.x - state.lastX;
          state.velocityX = state.velocityX * 0.5 + currentVelocity * 0.5; // Smoothing
      }
      state.lastX = position.x;

      switch (state.swipeState) {
          case 'idle':
              if (Math.abs(state.velocityX) > SWIPE_VELOCITY_START_THRESHOLD) {
                  state.swipeState = 'swiping';
                  state.swipeDirection = state.velocityX > 0 ? 'right' : 'left';
              }
              break;
          case 'swiping':
              // Check if swipe is complete (velocity drops)
              if (Math.abs(state.velocityX) < SWIPE_VELOCITY_END_THRESHOLD) {
                  swipe = state.swipeDirection; // Register the swipe
                  state.swipeState = 'cooldown';
                  state.lastSwipeTime = timestamp;
              }
              break;
          case 'cooldown':
              if (timestamp - state.lastSwipeTime > SWIPE_COOLDOWN) {
                  state.swipeState = 'idle';
              }
              break;
      }

      return {
          handedness,
          position,
          isPinching,
          isClosed: closed,
          isThumbUp: thumbUp,
          isGyanMudra: gyanMudra,
          isNearHead,
          isAboveHead,
          swipe,
          rawLandmarks: landmarks,
      };
  }, []);


  const predictWebcam = useCallback(() => {
    if (!isRunning.current || !handLandmarkerRef.current) return;

    const video = videoRef.current;
    
    if (!video || video.readyState < 2) {
        requestRef.current = requestAnimationFrame(predictWebcam);
        return;
    };

    if (video.currentTime !== lastVideoTimeRef.current) {
      const timestamp = performance.now();
      lastVideoTimeRef.current = video.currentTime;
      const results = handLandmarkerRef.current.detectForVideo(video, timestamp);
        
      let newResult: HandTrackingResult = { leftHand: null, rightHand: null };
      const newDrawData: HandDrawData[] = [];

      if (results.landmarks && results.landmarks.length > 0) {
        for(let i=0; i < results.landmarks.length; i++) {
            const landmarks = results.landmarks[i];
            const handedness = results.handedness[i][0].categoryName as 'Left' | 'Right';
            
            const handState = processHand(landmarks, handedness, timestamp);
            if (handedness === 'Left') {
                newResult.leftHand = handState;
            } else {
                newResult.rightHand = handState;
            }

            const color = getColorForHand(handState);
            newDrawData.push({
                landmarks,
                connections: HandLandmarker.HAND_CONNECTIONS,
                color
            });
        }
      }
      
      setTrackingResult(newResult);
      handDrawDataRef.current = newDrawData;
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  }, [videoRef, processHand]);

  const start = useCallback(async () => {
    if (isRunning.current) return;
    if (!isModelReady) {
        await new Promise<void>(resolve => {
            const interval = setInterval(() => {
                if (handLandmarkerRef.current) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }

    setError(null);
    
    // Reset swipe states on start
    handStates.current.left.swipeState = 'idle';
    handStates.current.right.swipeState = 'idle';
    handStates.current.left.lastX = null;
    handStates.current.right.lastX = null;

    isRunning.current = true;
    lastVideoTimeRef.current = -1;
    if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
    }
    requestRef.current = requestAnimationFrame(predictWebcam);

  }, [isModelReady, predictWebcam]);


  const stop = useCallback(() => {
    isRunning.current = false;
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
  }, []);

  const getHandDrawData = useCallback(() => {
    if (!isRunning.current) return null;
    return handDrawDataRef.current;
  }, []);

  return { ...trackingResult, start, stop, isModelReady, error, getHandDrawData };
}
