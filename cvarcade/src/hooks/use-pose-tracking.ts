

'use client';

import { useState, useCallback, useRef, RefObject, useEffect } from 'react';
import {
  PoseLandmarker,
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils,
  PoseLandmarkerResult,
  FaceLandmarkerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';

interface UsePoseTrackingProps {
  videoRef: RefObject<HTMLVideoElement>;
}

export interface CVClimbState {
  leftArmState: 'UP' | 'DOWN';
  rightArmState: 'UP' | 'DOWN';
  leanSide: 'LEFT' | 'RIGHT' | 'CENTER';
  stepsThisFrame: number;
}

export interface CVHurdlesState {
    runSpeed: number; // A value from 0 to 1 representing running intensity
}

export interface HeadState {
  x: number; // -1 to 1 (left to right)
  y: number; // -1 to 1 (bottom to top)
}


type PoseDrawData = {
    landmarks: NormalizedLandmark[];
    connections: {start: number, end: number}[];
    faceLandmarks: NormalizedLandmark[] | null;
}

// --- JUMP DETECTION ---
const GROUND_Y_THRESHOLD = 0.05; // How close to the bottom of the pose a foot must be to be "grounded"

// --- LEAN DETECTION ---
const LEAN_SMOOTHING = 0.4;
const LEAN_DEADZONE = 0.05;

// --- CLIMB DETECTION ---
const ARM_UP_THRESHOLD = 0.1;
const ARM_DOWN_THRESHOLD = 0.05;
const ARM_STATE_SMOOTHING = 0.7;

// --- HURDLES DETECTION ---
const RUN_POWER_DECAY = 0.92;
const KNEE_VELOCITY_SMOOTHING = 0.5;
const KNEE_UP_CONTRIBUTION = 0.1;

// --- FACIAL STATE DETECTION (with Hysteresis) ---
const EYE_CLOSE_THRESHOLD_ON = 0.45;
const EYE_CLOSE_THRESHOLD_OFF = 0.35;
const MOUTH_OPEN_RATIO_THRESHOLD_ON = 0.5;
const MOUTH_OPEN_RATIO_THRESHOLD_OFF = 0.4;
const BLENDSHAPE_SMOOTHING = 0.7;


export function usePoseTracking({ videoRef }: UsePoseTrackingProps) {
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModelReady, setIsModelReady] = useState(false);
  
  // --- Exposed States ---
  const [isJumping, setIsJumping] = useState(false); // Kept for Jump game compatibility
  const [isLeftFootGrounded, setIsLeftFootGrounded] = useState(true);
  const [isRightFootGrounded, setIsRightFootGrounded] = useState(true);
  const [isLeftKneeAboveWaist, setIsLeftKneeAboveWaist] = useState(false);
  const [isRightKneeAboveWaist, setIsRightKneeAboveWaist] = useState(false);
  const [lean, setLean] = useState(0); // -1 (left) to 1 (right)
  const [climbState, setClimbState] = useState<CVClimbState | null>(null);
  const [hurdlesState, setHurdlesState] = useState<CVHurdlesState | null>(null);
  const [poseLandmarks, setPoseLandmarks] = useState<PoseLandmarkerResult['landmarks'] | null>(null);
  const [isLeftEyeClosed, setIsLeftEyeClosed] = useState(false);
  const [isRightEyeClosed, setIsRightEyeClosed] = useState(false);
  const [isMouthOpen, setIsMouthOpen] = useState(false);
  const [mouthOpenRatio, setMouthOpenRatio] = useState(0);
  const [headPosition, setHeadPosition] = useState<HeadState | null>(null);


  // --- Internal Refs ---
  const requestRef = useRef<number>();
  const lastVideoTimeRef = useRef(-1);
  const isRunning = useRef(false);
  const poseDrawDataRef = useRef<PoseDrawData | null>(null);
  
  const internalState = useRef({
      // Body pose
      lastY: null as number | null,
      velocityY: 0,
      lean: 0,
      leftArm: 0,
      rightArm: 0,
      lastArmStep: null as 'LEFT' | 'RIGHT' | null,
      runPower: 0,
      lastLeftKneeY: null as number | null,
      lastRightKneeY: null as number | null,
      leftKneeVy: 0,
      rightKneeVy: 0,
      // Facial states
      leftEyeClosedScore: 0,
      rightEyeClosedScore: 0,
      mouthOpenRatio: 0,
      isLeftEyeClosed: false,
      isRightEyeClosed: false,
      isMouthOpen: false,
      headX: 0,
      headY: 0,
  });

  // Effect to initialize models
  useEffect(() => {
    const createLandmarkers = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        const pose = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
        });
        const face = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: 'GPU',
            },
            outputFaceBlendshapes: true,
            runningMode: 'VIDEO', outputFacialTransformationMatrixes: false,
        });
        
        poseLandmarkerRef.current = pose;
        faceLandmarkerRef.current = face;
        setIsModelReady(true);
        console.log('Pose and Face Landmarker models loaded.');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to load a Landmarker model.';
        setError(message);
        console.error(e);
      }
    };
    createLandmarkers();
  }, []);

  const resetTrackingStates = () => {
    internalState.current = {
      lastY: null, velocityY: 0, lean: 0, leftArm: 0, rightArm: 0, lastArmStep: null,
      runPower: 0, lastLeftKneeY: null, lastRightKneeY: null, leftKneeVy: 0, rightKneeVy: 0,
      leftEyeClosedScore: 0, rightEyeClosedScore: 0, mouthOpenRatio: 0,
      isLeftEyeClosed: false, isRightEyeClosed: false, isMouthOpen: false,
      headX: 0, headY: 0,
    };
    setIsJumping(false); 
    setIsLeftFootGrounded(true);
    setIsRightFootGrounded(true);
    setIsLeftKneeAboveWaist(false);
    setIsRightKneeAboveWaist(false);
    setLean(0); setClimbState(null); setHurdlesState(null);
    setPoseLandmarks(null); setIsLeftEyeClosed(false); setIsRightEyeClosed(false); setIsMouthOpen(false);
    setMouthOpenRatio(0); setHeadPosition(null);
    poseDrawDataRef.current = null;
  }

  const processPoseResults = (poseResult: PoseLandmarkerResult | null, faceResult: FaceLandmarkerResult | null) => {
    const pState = internalState.current;

    // --- Face Processing (Eyes, Mouth, Head Position) ---
    const faceLandmarks = faceResult?.faceLandmarks?.[0];
    if (faceLandmarks) {
        const nose = faceLandmarks[1]; // A good center point for the face
        if(nose) {
            // Invert X because video is mirrored
            const currentHeadX = (1 - nose.x - 0.5) * 2; 
            const currentHeadY = (0.5 - nose.y) * 2;
            
            pState.headX = (pState.headX * LEAN_SMOOTHING) + (currentHeadX * (1 - LEAN_SMOOTHING));
            pState.headY = (pState.headY * LEAN_SMOOTHING) + (currentHeadY * (1 - LEAN_SMOOTHING));
            
            setHeadPosition({x: pState.headX, y: pState.headY});
        }
    }
    
    if (faceResult?.faceBlendshapes?.[0]?.categories && faceLandmarks) {
        const blendshapes = faceResult.faceBlendshapes[0].categories;
        const leftBlinkScore = blendshapes.find(c => c.categoryName === 'eyeBlinkLeft')?.score || 0;
        const rightBlinkScore = blendshapes.find(c => c.categoryName === 'eyeBlinkRight')?.score || 0;
        
        // Smooth scores
        pState.leftEyeClosedScore = (pState.leftEyeClosedScore * BLENDSHAPE_SMOOTHING) + (leftBlinkScore * (1 - BLENDSHAPE_SMOOTHING));
        pState.rightEyeClosedScore = (pState.rightEyeClosedScore * BLENDSHAPE_SMOOTHING) + (rightBlinkScore * (1 - BLENDSHAPE_SMOOTHING));
        
        // Apply Hysteresis for left eye
        if (!pState.isLeftEyeClosed && pState.leftEyeClosedScore > EYE_CLOSE_THRESHOLD_ON) pState.isLeftEyeClosed = true;
        else if (pState.isLeftEyeClosed && pState.leftEyeClosedScore < EYE_CLOSE_THRESHOLD_OFF) pState.isLeftEyeClosed = false;

        // Apply Hysteresis for right eye
        if (!pState.isRightEyeClosed && pState.rightEyeClosedScore > EYE_CLOSE_THRESHOLD_ON) pState.isRightEyeClosed = true;
        else if (pState.isRightEyeClosed && pState.rightEyeClosedScore < EYE_CLOSE_THRESHOLD_OFF) pState.isRightEyeClosed = false;
        
        // Mouth Ratio Calculation
        const upperLip = faceLandmarks[13];
        const lowerLip = faceLandmarks[14];
        const leftEyeInner = faceLandmarks[133];
        const rightEyeInner = faceLandmarks[362];

        if (upperLip && lowerLip && leftEyeInner && rightEyeInner) {
            const lipDistance = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
            const eyeDistance = Math.hypot(leftEyeInner.x - rightEyeInner.x, leftEyeInner.y - rightEyeInner.y);
            const ratio = eyeDistance > 0 ? lipDistance / eyeDistance : 0;
            
            // For Predator, let's map this to a more usable 0-1 'openness' range.
            // This is a rough estimation without calibration.
            const MOUTH_RATIO_MIN = 0.05; // Closed mouth ratio
            const MOUTH_RATIO_MAX = 0.6; // Wide open mouth ratio
            const openness = Math.max(0, Math.min(1, (ratio - MOUTH_RATIO_MIN) / (MOUTH_RATIO_MAX - MOUTH_RATIO_MIN)));

            pState.mouthOpenRatio = (pState.mouthOpenRatio * BLENDSHAPE_SMOOTHING) + (openness * (1 - BLENDSHAPE_SMOOTHING));

            if (!pState.isMouthOpen && pState.mouthOpenRatio > MOUTH_OPEN_RATIO_THRESHOLD_ON) pState.isMouthOpen = true;
            else if (pState.isMouthOpen && pState.mouthOpenRatio < MOUTH_OPEN_RATIO_THRESHOLD_OFF) pState.isMouthOpen = false;
        }

        // Update public state
        setIsLeftEyeClosed(pState.isLeftEyeClosed);
        setIsRightEyeClosed(pState.isRightEyeClosed);
        setIsMouthOpen(pState.isMouthOpen);
        setMouthOpenRatio(pState.mouthOpenRatio);
    }
    
    // --- Body Pose Processing ---
    if (!poseResult?.landmarks?.[0]) {
        setIsJumping(false);
        setPoseLandmarks(null);
        poseDrawDataRef.current = null;
        return;
    }
    
    const landmarks = poseResult.landmarks;
    setPoseLandmarks(landmarks);
    const poseLandmarks = landmarks[0];

    poseDrawDataRef.current = {
        landmarks: poseLandmarks,
        connections: PoseLandmarker.POSE_CONNECTIONS,
        faceLandmarks: faceLandmarks || null,
    };

    const l_shoulder = poseLandmarks[11];
    const r_shoulder = poseLandmarks[12];
    const l_wrist = poseLandmarks[15];
    const r_wrist = poseLandmarks[16];
    const l_hip = poseLandmarks[23];
    const r_hip = poseLandmarks[24];
    const l_knee = poseLandmarks[25];
    const r_knee = poseLandmarks[26];
    const l_foot = poseLandmarks[31];
    const r_foot = poseLandmarks[32];
    const nose = poseLandmarks[0];
    
    let climbStepsThisFrame = 0;

    // --- FOOT GROUNDED DETECTION ---
    if (l_foot && r_foot) {
        // Find the lowest point of the detected pose
        let lowestY = 0;
        poseLandmarks.forEach(point => {
            if (point.y > lowestY && point.visibility > 0.5) {
                lowestY = point.y;
            }
        });

        const isLeftGrounded = (lowestY - l_foot.y) < GROUND_Y_THRESHOLD;
        const isRightGrounded = (lowestY - r_foot.y) < GROUND_Y_THRESHOLD;
        setIsLeftFootGrounded(isLeftGrounded);
        setIsRightFootGrounded(isRightGrounded);

        // Keep old jump logic for compatibility with the Jump game
        setIsJumping(!isLeftGrounded && !isRightGrounded);
    }

    // --- HIGH KNEE DETECTION ---
    if (l_knee && r_knee && l_hip && r_hip) {
      const waistY = (l_hip.y + r_hip.y) / 2;
      setIsLeftKneeAboveWaist(l_knee.y < waistY);
      setIsRightKneeAboveWaist(r_knee.y < waistY);
    }

    // LEAN & CLIMB DETECTION
    if (l_shoulder && r_shoulder && l_wrist && r_wrist && nose) {
        const torsoCenterX = (l_shoulder.x + r_shoulder.x) / 2;
        const currentLean = (0.5 - torsoCenterX) * 2; // Inverted for correct mapping
        const smoothedLean = (pState.lean * (1 - LEAN_SMOOTHING)) + (currentLean * LEAN_SMOOTHING);
        pState.lean = smoothedLean;
        setLean(smoothedLean);
        
        let leanSide: CVClimbState['leanSide'] = 'CENTER';
        if (smoothedLean < -LEAN_DEADZONE) leanSide = 'LEFT';
        else if (smoothedLean > LEAN_DEADZONE) leanSide = 'RIGHT';

        const wasLeftArmDown = pState.leftArm < 0.5;
        const wasRightArmDown = pState.rightArm < 0.5;

        const isLeftArmUp = l_wrist.y < l_shoulder.y - ARM_UP_THRESHOLD;
        const isLeftArmDown = Math.abs(l_wrist.y - l_shoulder.y) < ARM_DOWN_THRESHOLD;
        const isRightArmUp = r_wrist.y < r_shoulder.y - ARM_UP_THRESHOLD;
        const isRightArmDown = Math.abs(r_wrist.y - r_shoulder.y) < ARM_DOWN_THRESHOLD;
        
        let leftArmTarget = pState.leftArm;
        if (isLeftArmUp) leftArmTarget = 1; else if (isLeftArmDown) leftArmTarget = 0;
        let rightArmTarget = pState.rightArm;
        if (isRightArmUp) rightArmTarget = 1; else if (isRightArmDown) rightArmTarget = 0;

        pState.leftArm += (leftArmTarget - pState.leftArm) * (1 - ARM_STATE_SMOOTHING);
        pState.rightArm += (rightArmTarget - pState.rightArm) * (1 - ARM_STATE_SMOOTHING);

        const isLeftArmUpNow = pState.leftArm > 0.5;
        const isRightArmUpNow = pState.rightArm > 0.5;

        if (wasLeftArmDown && isLeftArmUpNow && pState.lastArmStep !== 'LEFT') {
            climbStepsThisFrame++;
            pState.lastArmStep = 'LEFT';
        }
        if (wasRightArmDown && isRightArmUpNow && pState.lastArmStep !== 'RIGHT') {
            climbStepsThisFrame++;
            pState.lastArmStep = 'RIGHT';
        }

        setClimbState({
            leftArmState: isLeftArmUpNow ? 'UP' : 'DOWN',
            rightArmState: isRightArmUpNow ? 'UP' : 'DOWN',
            leanSide: leanSide,
            stepsThisFrame: climbStepsThisFrame,
        });
    }

    // HURDLES RUNNING DETECTION
    if (l_knee && r_knee) {
      pState.runPower *= RUN_POWER_DECAY;

      if (pState.lastLeftKneeY !== null) {
        const leftVy = pState.lastLeftKneeY - l_knee.y;
        pState.leftKneeVy = (pState.leftKneeVy * (1 - KNEE_VELOCITY_SMOOTHING)) + (leftVy * KNEE_VELOCITY_SMOOTHING);
        if (pState.leftKneeVy > 0) pState.runPower += pState.leftKneeVy * KNEE_UP_CONTRIBUTION;
      }
      pState.lastLeftKneeY = l_knee.y;
      
      if (pState.lastRightKneeY !== null) {
          const rightVy = pState.lastRightKneeY - r_knee.y;
          pState.rightKneeVy = (pState.rightKneeVy * (1 - KNEE_VELOCITY_SMOOTHING)) + (rightVy * KNEE_VELOCITY_SMOOTHING);
          if (pState.rightKneeVy > 0) pState.runPower += pState.rightKneeVy * KNEE_UP_CONTRIBUTION;
      }
      pState.lastRightKneeY = r_knee.y;

      pState.runPower = Math.max(0, Math.min(pState.runPower, 1));
      setHurdlesState({ runSpeed: pState.runPower });
    }
  }

  const predictWebcam = useCallback(() => {
    if (!isRunning.current) return;

    const video = videoRef.current;
    
    if (!video || video.readyState < 2 || !poseLandmarkerRef.current || !faceLandmarkerRef.current ) {
        requestRef.current = requestAnimationFrame(predictWebcam);
        return;
    };

    if (video.currentTime !== lastVideoTimeRef.current) {
      const timestamp = performance.now();
      lastVideoTimeRef.current = video.currentTime;
      const poseResults = poseLandmarkerRef.current.detectForVideo(video, timestamp);
      const faceResults = faceLandmarkerRef.current.detectForVideo(video, timestamp);

      processPoseResults(poseResults, faceResults);
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  }, [videoRef]);

  const start = useCallback(async () => {
    if (isRunning.current || !isModelReady) return;
    
    setError(null);
    resetTrackingStates();

    isRunning.current = true;
    lastVideoTimeRef.current = -1;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = requestAnimationFrame(predictWebcam);
  }, [isModelReady, predictWebcam]);


  const stop = useCallback(() => {
    if(!isRunning.current) return;
    isRunning.current = false;
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
    resetTrackingStates();
  }, []);

  const getPoseDrawData = useCallback(() => {
    if (!isRunning.current) return null;
    return poseDrawDataRef.current;
  }, []);

  return { isJumping, climbState, hurdlesState, lean, poseLandmarks, isLeftEyeClosed, isRightEyeClosed, isMouthOpen, mouthOpenRatio, headPosition, isLeftFootGrounded, isRightFootGrounded, isLeftKneeAboveWaist, isRightKneeAboveWaist, start, stop, isModelReady, error, getPoseDrawData };
}
