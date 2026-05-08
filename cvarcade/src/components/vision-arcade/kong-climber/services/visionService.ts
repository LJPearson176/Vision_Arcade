import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
import { VisionInput, HandState } from "../types";

export class VisionService {
  private handLandmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime: number = -1;
  
  // State for frame persistence (smoothing 30fps cam to 60fps game)
  private lastInput: VisionInput = { 
    leftHand: null, 
    rightHand: null, 
    climbImpulse: 0, 
    handsDetected: false,
    leftHandState: 'OPEN',
    rightHandState: 'OPEN'
  };

  // Gesture Tracking
  private lastLeftWristY: number | null = null;
  private lastRightWristY: number | null = null;
  
  // Tuning Constants
  private readonly BUFFER_SIZE = 5; // Slightly larger buffer for smoother averages
  private impulseBuffer: number[] = [];
  
  // Sensitivity: Much lower threshold to detect "side" arm movements which have smaller vertical deltas
  private readonly MOVEMENT_THRESHOLD = 0.001; 
  // Amplification: Lowered because we now apply force continuously over frames via caching
  private readonly AMPLIFICATION = 60; 

  public async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
  }

  public setVideoElement(video: HTMLVideoElement) {
    this.video = video;
  }
  
  public getVideo(): HTMLVideoElement | null {
    return this.video;
  }

  public process(): VisionInput {
    // 1. Safety Checks
    if (!this.handLandmarker || !this.video || !this.video.currentTime || this.video.paused) {
      return { 
        leftHand: null, 
        rightHand: null, 
        climbImpulse: 0, 
        handsDetected: false,
        leftHandState: 'OPEN',
        rightHandState: 'OPEN'
      };
    }

    // 2. Frame Caching
    // If the video frame hasn't changed (Game runs 60fps, Webcam 30fps), 
    // return the PREVIOUS calculated input. This continues applying the velocity/impulse 
    // smoothly across the "gap" frames instead of dropping to 0.
    if (this.video.currentTime === this.lastVideoTime) {
       return this.lastInput;
    }
    this.lastVideoTime = this.video.currentTime;

    // 3. Detection
    const results = this.handLandmarker.detectForVideo(this.video, performance.now());
    
    let leftHand = null;
    let rightHand = null;
    let leftImpulse = 0;
    let rightImpulse = 0;
    let handsDetected = false;
    let bodyCenterX: number | undefined;
    let bodySlant: number | undefined;
    let leftHandState: HandState = 'OPEN';
    let rightHandState: HandState = 'OPEN';

    if (results.landmarks && results.landmarks.length > 0) {
      handsDetected = true;
      const landmarks = results.landmarks;
      
      // Sort detected hands by X coordinate to distinguish Left vs Right on screen.
      // 0.0 is Left edge, 1.0 is Right edge.
      const hands = landmarks.map((l, index) => ({ landmarks: l, index, x: l[0].x })).sort((a, b) => a.x - b.x);
      
      // Calculate Body Center and Slant if 2 hands are present
      if (hands.length >= 2) {
        const l = hands[0].landmarks[0];
        const r = hands[1].landmarks[0];
        bodyCenterX = (l.x + r.x) / 2;
        bodySlant = r.y - l.y;
      }

      // --- LEFT HAND PROCESSING ---
      if (hands.length > 0) {
        const lHand = hands[0].landmarks[0]; // Wrist
        leftHand = { x: lHand.x, y: lHand.y };
        leftHandState = this.detectHandState(hands[0].landmarks);
        
        // Calculate Impulse (Downward movement)
        if (this.lastLeftWristY !== null) {
          const dy = lHand.y - this.lastLeftWristY;
          // Filter out massive jumps (glitches) > 10% screen height in 1 frame
          if (dy > this.MOVEMENT_THRESHOLD && dy < 0.2) {
            leftImpulse = dy;
          }
        }
        this.lastLeftWristY = lHand.y;
      } else {
        this.lastLeftWristY = null;
      }

      // --- RIGHT HAND PROCESSING ---
      if (hands.length > 1) {
        const rHand = hands[1].landmarks[0]; // Wrist
        rightHand = { x: rHand.x, y: rHand.y };
        rightHandState = this.detectHandState(hands[1].landmarks);

        if (this.lastRightWristY !== null) {
          const dy = rHand.y - this.lastRightWristY;
          if (dy > this.MOVEMENT_THRESHOLD && dy < 0.2) {
            rightImpulse = dy;
          }
        }
        this.lastRightWristY = rHand.y;
      } else {
        this.lastRightWristY = null;
      }
    } else {
      // Lost tracking
      this.lastLeftWristY = null;
      this.lastRightWristY = null;
    }

    // 4. Signal Processing
    const rawImpulse = (leftImpulse + rightImpulse) * this.AMPLIFICATION;
    
    // Moving Average Smoothing
    this.impulseBuffer.push(rawImpulse);
    if (this.impulseBuffer.length > this.BUFFER_SIZE) {
      this.impulseBuffer.shift();
    }
    const smoothedImpulse = this.impulseBuffer.reduce((a, b) => a + b, 0) / this.impulseBuffer.length;

    const result: VisionInput = {
      leftHand,
      rightHand,
      climbImpulse: Math.min(smoothedImpulse, 8.0), // Hard cap
      handsDetected,
      bodyCenterX,
      bodySlant,
      leftHandState,
      rightHandState,
      rawLandmarks: results.landmarks,
      debug: {
          rawLeftY: leftHand?.y || 0,
          rawRightY: rightHand?.y || 0,
          deltaLeft: leftImpulse,
          deltaRight: rightImpulse
      }
    };

    this.lastInput = result;
    return result;
  }

  private detectHandState(landmarks: any[]): HandState {
    const wrist = landmarks[0];
    
    // Check if fingers are extended. 
    // Simple heuristic: distance from Tip to Wrist vs distance from MCP to Wrist.
    // If Tip is further, it's open.
    const tips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky
    const mcps = [5, 9, 13, 17];
    
    let openCount = 0;
    
    for (let i = 0; i < tips.length; i++) {
        const tip = landmarks[tips[i]];
        const mcp = landmarks[mcps[i]];
        
        const dTip = (tip.x - wrist.x)**2 + (tip.y - wrist.y)**2;
        const dMcp = (mcp.x - wrist.x)**2 + (mcp.y - wrist.y)**2;
        
        // Multiplier helps robust detection (tip should be significantly further)
        if (dTip > dMcp * 1.2) {
            openCount++;
        }
    }

    // Thumb check (optional, but good for completeness)
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3]; // IP joint
    const dThumbTip = (thumbTip.x - wrist.x)**2 + (thumbTip.y - wrist.y)**2;
    const dThumbIp = (thumbIp.x - wrist.x)**2 + (thumbIp.y - wrist.y)**2;
    if (dThumbTip > dThumbIp * 1.1) {
        openCount++;
    }

    // If most fingers are open, it's open.
    return openCount >= 3 ? 'OPEN' : 'CLOSED';
  }
}
