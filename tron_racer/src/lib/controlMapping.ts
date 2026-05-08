interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number; // Optional visibility score
}

interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface GameControls {
  steer: number; // -1 to 1 (deprecated, use targetPosition)
  throttle: number; // 0 to 1
  brake: boolean;
  lean: number; // visual lean angle for display
  targetPosition: number; // 0 to 1, direct position mapping
  shoulderDiff: number; // for calculating lean angle
  shiftGesture: boolean; // True when L-pose detected
}

export type CalibrationPhase = 
  | 'countdown'
  | 'neutral'
  | 'lean-left'
  | 'lean-right'
  | 'hand-open'
  | 'hand-closed'
  | 'complete';

export interface CalibrationState {
  phase: CalibrationPhase;
  samples: number[];
  neutralLean: number | null;
  leftLeanSample: number | null;
  rightLeanSample: number | null;
  openHandSample: number | null;
  closedHandSample: number | null;
}

export class ControlCalibrator {
  private state: CalibrationState = {
    phase: 'countdown',
    samples: [],
    neutralLean: null,
    leftLeanSample: null,
    rightLeanSample: null,
    openHandSample: null,
    closedHandSample: null
  };
  private readonly sampleCount = 30;

  getCurrentPhase(): CalibrationPhase {
    return this.state.phase;
  }

  getProgress(): number {
    return (this.state.samples.length / this.sampleCount) * 100;
  }

  addCalibrationSample(poseResult: any, handResult: any) {
    if (!poseResult?.landmarks?.[0]) return;

    const phase = this.state.phase;
    
    if (phase === 'countdown' || phase === 'complete') return;

    // For pose-based calibration
    if (phase === 'neutral' || phase === 'lean-left' || phase === 'lean-right') {
      const landmarks = poseResult.landmarks[0];
      const metrics = this.calculateShoulderMetrics(landmarks);
      
      if (metrics) {
        this.state.samples.push(metrics.center);
        if (this.state.samples.length > this.sampleCount) {
          this.state.samples.shift();
        }
      }
    }
    
    // For hand-based calibration
    if ((phase === 'hand-open' || phase === 'hand-closed') && handResult?.landmarks) {
      for (let i = 0; i < handResult.landmarks.length; i++) {
        const handedness = handResult.handedness[i]?.[0]?.categoryName;
        if (handedness === "Right") {
          const landmarks = handResult.landmarks[i];
          const openness = this.calculateHandOpenness(landmarks);
          
          this.state.samples.push(openness);
          if (this.state.samples.length > this.sampleCount) {
            this.state.samples.shift();
          }
          break;
        }
      }
    }
  }

  finishCurrentPhase() {
    if (this.state.samples.length === 0) return;

    const average = this.state.samples.reduce((a, b) => a + b, 0) / this.state.samples.length;
    
    switch (this.state.phase) {
      case 'neutral':
        this.state.neutralLean = average;
        this.state.phase = 'lean-left';
        break;
      case 'lean-left':
        this.state.leftLeanSample = average;
        this.state.phase = 'lean-right';
        break;
      case 'lean-right':
        this.state.rightLeanSample = average;
        this.state.phase = 'hand-open';
        break;
      case 'hand-open':
        this.state.openHandSample = average;
        this.state.phase = 'hand-closed';
        break;
      case 'hand-closed':
        this.state.closedHandSample = average;
        this.state.phase = 'complete';
        break;
    }
    
    this.state.samples = [];
  }

  startCalibration() {
    this.state.phase = 'neutral';
  }

  recalibrateNeutral() {
    // Quickly recalibrate neutral position using current pose
    // This is called right before game starts to ensure accurate neutral
    this.state.neutralLean = null; // Reset neutral
    console.log('🔄 Neutral lean reset, will use first detected pose as neutral');
  }

  setDefaultCalibration() {
    // Set reasonable default values for testing
    this.state.neutralLean = 0;
    this.state.leftLeanSample = -0.08;  // Negative for left tilt
    this.state.rightLeanSample = 0.08;  // Positive for right tilt
    this.state.openHandSample = 0.8;    // High value for open hand
    this.state.closedHandSample = 0.2;  // Low value for closed hand
    this.state.phase = 'complete';
  }

  private calculateShoulderMetrics(landmarks: PoseLandmark[]): { center: number; diff: number } | null {
    // Using shoulders (11, 12) for position control
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    if (!leftShoulder || !rightShoulder) return null;
    
    // Check visibility if available
    if (leftShoulder.visibility !== undefined && rightShoulder.visibility !== undefined) {
      if (leftShoulder.visibility < 0.5 || rightShoulder.visibility < 0.5) {
        return null;
      }
    }

    // Calculate shoulder center (horizontal average, 0 to 1)
    const shoulderCenter = (leftShoulder.x + rightShoulder.x) / 2;
    
    // Calculate shoulder width difference (for lean angle visualization)
    const shoulderDiff = rightShoulder.x - leftShoulder.x;
    
    return { center: shoulderCenter, diff: shoulderDiff };
  }

  extractControls(poseResult: any, handResult: any): GameControls {
    const controls: GameControls = {
      steer: 0,
      throttle: 0,
      brake: false,
      lean: 0,
      targetPosition: 0.5, // Default to center
      shoulderDiff: 0,
      shiftGesture: false
    };

    // LOGGING: Detection state
    const debugLog = Math.random() < 0.03; // Log 3% of frames
    if (debugLog) {
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║ KINEMATIC MAPPING DEBUG                                   ║');
      console.log('╠═══════════════════════════════════════════════════════════╣');
    }

    // Extract position and lean from pose
    if (poseResult?.landmarks?.[0]) {
      const landmarks = poseResult.landmarks[0];
      const metrics = this.calculateShoulderMetrics(landmarks);
      
      if (metrics) {
        // Direct position mapping from shoulder center (0 to 1)
        // INVERTED: So user's left = bike left (mirror the camera view)
        controls.targetPosition = 1 - metrics.center;
        controls.shoulderDiff = metrics.diff;
        
        // Calculate visual lean angle based on shoulder difference
        // Scaled up for more pronounced effect
        const normalizedDiff = metrics.diff * 8;
        controls.lean = Math.sign(normalizedDiff) * Math.pow(Math.abs(normalizedDiff), 1.2);
        
        // Deprecated steer value for backward compatibility
        // Map position to -1 to 1 range (also inverted)
        controls.steer = (0.5 - metrics.center) * 2;
        
        if (debugLog) {
          console.log('║ POSE DETECTION:');
          console.log('║   Shoulder Center:', metrics.center.toFixed(4));
          console.log('║   Shoulder Diff:', metrics.diff.toFixed(4));
          console.log('║   Target Position:', controls.targetPosition.toFixed(4));
          console.log('║   Lean Angle:', controls.lean.toFixed(4));
          console.log('║   Steer (legacy):', controls.steer.toFixed(4));
        }
      } else {
        if (debugLog) {
          console.log('║ POSE DETECTION: Shoulders not visible');
        }
      }
    } else {
      if (debugLog) {
        console.log('║ POSE DETECTION: No landmarks detected');
      }
    }

    // Extract throttle/brake from right hand
    if (handResult?.landmarks && handResult?.handedness) {
      for (let i = 0; i < handResult.landmarks.length; i++) {
        const handedness = handResult.handedness[i]?.[0]?.categoryName;
        
        if (handedness === "Right") {
          const landmarks = handResult.landmarks[i];
          const openness = this.calculateHandOpenness(landmarks);
          
          if (debugLog) {
            console.log('║ HAND DETECTION:');
            console.log('║   Handedness: Right');
            console.log('║   Openness:', openness.toFixed(4));
            console.log('║   Open Cal:', this.state.openHandSample?.toFixed(4));
            console.log('║   Closed Cal:', this.state.closedHandSample?.toFixed(4));
          }
          
          // Closed hand (fist) = throttle
          // Open hand = brake
          if (openness < 0.4) {
            controls.throttle = 1.0;
            controls.brake = false;
            if (debugLog) console.log('║   ACTION: THROTTLE (fist detected)');
          } else if (openness > 0.6) {
            controls.throttle = 0.0;
            controls.brake = true;
            if (debugLog) console.log('║   ACTION: BRAKE (open palm detected)');
          } else {
            // In between - maintain current state
            controls.throttle = 0.5;
            controls.brake = false;
            if (debugLog) console.log('║   ACTION: COAST (neutral hand)');
          }
          break;
        }
      }
    } else {
      if (debugLog) {
        console.log('║ HAND DETECTION: FAILED');
        console.log('║   Has Landmarks:', !!handResult?.landmarks);
        console.log('║   Has Handedness:', !!handResult?.handedness);
      }
    }

    // Detect shift gesture (L-pose with left arm)
    if (poseResult?.landmarks?.[0]) {
      const landmarks = poseResult.landmarks[0];
      controls.shiftGesture = this.detectShiftGesture(landmarks);
      
      if (debugLog && controls.shiftGesture) {
        console.log('║ SHIFT GESTURE: ✓ L-POSE DETECTED!');
      }
    }

    if (debugLog) {
      console.log('╠═══════════════════════════════════════════════════════════╣');
      console.log('║ FINAL CONTROLS OUTPUT:');
      console.log('║   Steer:', controls.steer.toFixed(3), '(-1=left, +1=right)');
      console.log('║   Throttle:', controls.throttle.toFixed(3));
      console.log('║   Brake:', controls.brake);
      console.log('║   Lean (display):', controls.lean.toFixed(3));
      console.log('║   Shift Gesture:', controls.shiftGesture ? '✓ READY TO SHIFT' : '✗');
      console.log('╚═══════════════════════════════════════════════════════════╝');
    }

    return controls;
  }

  private detectShiftGesture(landmarks: PoseLandmark[]): boolean {
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    
    if (!leftShoulder || !leftElbow || !leftWrist) return false;
    
    // More lenient visibility check for faster detection
    if (leftShoulder.visibility !== undefined && 
        leftElbow.visibility !== undefined && 
        leftWrist.visibility !== undefined) {
      if (leftShoulder.visibility < 0.4 || 
          leftElbow.visibility < 0.4 || 
          leftWrist.visibility < 0.4) {
        return false;
      }
    }
    
    // Condition 1: Wrist above elbow (raised forearm) - more lenient
    const wristAboveElbow = leftWrist.y < leftElbow.y - 0.03;
    
    // Condition 2: Elbow extended sideways from shoulder - more lenient
    const elbowExtended = Math.abs(leftElbow.x - leftShoulder.x) > 0.12;
    
    // Condition 3: Elbow roughly at shoulder height - more lenient range
    const elbowAtHeight = Math.abs(leftElbow.y - leftShoulder.y) < 0.15;
    
    // Condition 4: Form an L shape (90 degree angle check) - more lenient
    const upperArmVec = {
      x: leftElbow.x - leftShoulder.x,
      y: leftElbow.y - leftShoulder.y
    };
    const forearmVec = {
      x: leftWrist.x - leftElbow.x,
      y: leftWrist.y - leftElbow.y
    };
    
    // Dot product for angle check - more lenient angle tolerance
    const dotProduct = upperArmVec.x * forearmVec.x + upperArmVec.y * forearmVec.y;
    const isRightAngle = Math.abs(dotProduct) < 0.4;
    
    return wristAboveElbow && elbowExtended && elbowAtHeight && isRightAngle;
  }

  private calculateHandOpenness(landmarks: HandLandmark[]): number {
    // Calculate average distance of fingertips from palm
    const wrist = landmarks[0];
    const fingertips = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky tips
    
    let totalDistance = 0;
    for (const tip of fingertips) {
      const fingertip = landmarks[tip];
      const dx = fingertip.x - wrist.x;
      const dy = fingertip.y - wrist.y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    
    const avgDistance = totalDistance / fingertips.length;
    
    // Normalize (these values are empirical)
    return Math.min(1, Math.max(0, (avgDistance - 0.1) / 0.15));
  }

  isCalibrated(): boolean {
    return this.state.phase === 'complete' && this.state.neutralLean !== null;
  }
}
