
import { HandInput, Vector2 } from '../types';

export class CVService {
  private handLandmarker: any = null;
  private lastVideoTime = -1;
  private video: HTMLVideoElement | null = null;
  
  // Smoothing
  private prevPickPos: Vector2 = { x: 0.5, y: 0.5 };
  private prevTorque: number = 0;
  private readonly SMOOTHING_FACTOR = 0.2; // Lower = smoother but more lag
  
  // State Persistence
  private isCurrentlyTracking = false;

  public isReady = false;

  async initialize(videoElement: HTMLVideoElement) {
    this.video = videoElement;

    console.log("Loading MediaPipe via dynamic import...");
    
    let FilesetResolver, HandLandmarker;
    try {
        // Use the specific ESM bundle
        const mp = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm");
        FilesetResolver = mp.FilesetResolver;
        HandLandmarker = mp.HandLandmarker;
    } catch (e) {
        console.error("Import failed:", e);
        throw new Error("Failed to load MediaPipe module. Please check your internet connection.");
    }

    console.log("MediaPipe loaded. Initializing vision tasks...");

    // Load WASM
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1
    });

    this.isReady = true;
    console.log("CV Service Initialized");
  }

  public processFrame(): HandInput {
    if (!this.isReady || !this.handLandmarker || !this.video) {
      return { pickPosition: { x: 0.5, y: 0.5 }, tensionTorque: 0, isTracking: false };
    }

    const nowInMs = Date.now();
    
    // Only process if video frame has advanced
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.handLandmarker.detectForVideo(this.video, nowInMs);

      if (results.landmarks && results.landmarks.length > 0) {
        this.isCurrentlyTracking = true;
        const landmarks = results.landmarks[0];
        
        // --- INPUT MAPPING ---

        // 1. Pick Position: Index Finger Tip (Landmark 8)
        // Invert X because webcam is mirrored usually, but we want natural movement
        const rawX = 1 - landmarks[8].x; 
        const rawY = landmarks[8].y;

        // 2. Torque: Angle between Wrist (0) and Index MCP (5)
        // This measures wrist rotation relative to the vertical axis
        const wrist = landmarks[0];
        const indexMCP = landmarks[5];
        
        const dx = indexMCP.x - wrist.x;
        const dy = indexMCP.y - wrist.y;
        
        // Calculate angle. 0 is vertical. Range -PI to PI.
        // We map this to 0-1 torque.
        const angle = Math.atan2(dy, dx); 
        // Heuristic: -PI/2 is straight up. Twist right increases angle.
        // Normalize roughly between -2.0 and -1.0 for comfortable range
        let torque = (angle + 1.5) * 2.0; 
        
        // Clamp 0-1
        torque = Math.max(0, Math.min(1, torque));

        // --- SMOOTHING ---
        const smoothX = this.lerp(this.prevPickPos.x, rawX, this.SMOOTHING_FACTOR);
        const smoothY = this.lerp(this.prevPickPos.y, rawY, this.SMOOTHING_FACTOR);
        const smoothTorque = this.lerp(this.prevTorque, torque, 0.1); // Torque needs to be smoother

        this.prevPickPos = { x: smoothX, y: smoothY };
        this.prevTorque = smoothTorque;

      } else {
        // No hands detected in this frame
        this.isCurrentlyTracking = false;
      }
    }

    // Return current state (smoothed) regardless of whether a new frame was processed this tick
    // This prevents isTracking from flickering false between video frames
    return {
      pickPosition: this.prevPickPos,
      tensionTorque: this.prevTorque,
      isTracking: this.isCurrentlyTracking
    };
  }

  private lerp(start: number, end: number, amt: number) {
    return (1 - amt) * start + amt * end;
  }
}

export const cvService = new CVService();
