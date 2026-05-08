interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface GameControls {
  steer: number;
  throttle: number;
  brake: boolean;
  lean: number;
  targetPosition: number;
  shoulderDiff: number;
  shiftGesture: boolean;
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
    if (!poseResult?.[0]) return; // Mediapipe result format in our platform is landmarks directly

    const phase = this.state.phase;
    if (phase === 'countdown' || phase === 'complete') return;

    if (phase === 'neutral' || phase === 'lean-left' || phase === 'lean-right') {
      const landmarks = poseResult[0];
      const metrics = this.calculateShoulderMetrics(landmarks);
      if (metrics) {
        this.state.samples.push(metrics.center);
        if (this.state.samples.length > this.sampleCount) this.state.samples.shift();
      }
    }
    
    if ((phase === 'hand-open' || phase === 'hand-closed') && handResult) {
      // Expecting handResult to be the right hand landmarks or HandState
      const landmarks = handResult.rawLandmarks || handResult;
      if (landmarks) {
        const openness = this.calculateHandOpenness(landmarks);
        this.state.samples.push(openness);
        if (this.state.samples.length > this.sampleCount) this.state.samples.shift();
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
    this.state = {
      phase: 'neutral',
      samples: [],
      neutralLean: null,
      leftLeanSample: null,
      rightLeanSample: null,
      openHandSample: null,
      closedHandSample: null
    };
  }

  setDefaultCalibration() {
    this.state.neutralLean = 0.5;
    this.state.leftLeanSample = 0.42;
    this.state.rightLeanSample = 0.58;
    this.state.openHandSample = 0.8;
    this.state.closedHandSample = 0.2;
    this.state.phase = 'complete';
  }

  private calculateShoulderMetrics(landmarks: PoseLandmark[]): { center: number; diff: number } | null {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    if (!leftShoulder || !rightShoulder) return null;
    const shoulderCenter = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderDiff = rightShoulder.x - leftShoulder.x;
    return { center: shoulderCenter, diff: shoulderDiff };
  }

  extractControls(poseLandmarks: any, rightHand: any): GameControls {
    const controls: GameControls = {
      steer: 0,
      throttle: 0,
      brake: false,
      lean: 0,
      targetPosition: 0.5,
      shoulderDiff: 0,
      shiftGesture: false
    };

    if (poseLandmarks?.[0]) {
      const landmarks = poseLandmarks[0];
      const metrics = this.calculateShoulderMetrics(landmarks);
      if (metrics) {
        // Use calibrated neutral point or default to 0.5
        const neutralPoint = this.state.neutralLean ?? 0.5;
        const centerOffset = metrics.center - neutralPoint;
        
        // Calculate sensitivity based on calibrated ranges or default
        const leftRange = this.state.leftLeanSample !== null ? Math.abs(this.state.leftLeanSample - neutralPoint) : 0.15;
        const rightRange = this.state.rightLeanSample !== null ? Math.abs(this.state.rightLeanSample - neutralPoint) : 0.15;
        
        // Use a more aggressive multiplier (1.8x) to ensure reachability
        const sensitivity = 1.8;
        
        // Normalize based on lean direction to handle asymmetrical ranges
        let normalizedOffset;
        if (centerOffset > 0) {
          // Leaning Left (camera x increases)
          normalizedOffset = centerOffset / (rightRange || 0.1);
        } else {
          // Leaning Right (camera x decreases)
          normalizedOffset = centerOffset / (leftRange || 0.1);
        }
        
        const amplifiedTarget = 0.5 - (centerOffset * sensitivity);
        controls.targetPosition = Math.max(0, Math.min(1, amplifiedTarget));
        
        controls.shoulderDiff = metrics.diff;
        const normalizedDiff = metrics.diff * 8;
        controls.lean = Math.sign(normalizedDiff) * Math.pow(Math.abs(normalizedDiff), 1.2);
        controls.steer = (neutralPoint - metrics.center) * (1 / (leftRange || 0.1));
      }
      controls.shiftGesture = this.detectShiftGesture(landmarks);
    }

    if (rightHand?.rawLandmarks) {
      const openness = this.calculateHandOpenness(rightHand.rawLandmarks);
      if (openness < 0.4) {
        controls.throttle = 1.0;
        controls.brake = false;
      } else if (openness > 0.6) {
        controls.throttle = 0.0;
        controls.brake = true;
      } else {
        controls.throttle = 0.5;
        controls.brake = false;
      }
    }

    return controls;
  }

  private detectShiftGesture(landmarks: PoseLandmark[]): boolean {
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    if (!leftShoulder || !leftElbow || !leftWrist) return false;
    const wristAboveElbow = leftWrist.y < leftElbow.y - 0.03;
    const elbowExtended = Math.abs(leftElbow.x - leftShoulder.x) > 0.12;
    const elbowAtHeight = Math.abs(leftElbow.y - leftShoulder.y) < 0.15;
    const upperArmVec = { x: leftElbow.x - leftShoulder.x, y: leftElbow.y - leftShoulder.y };
    const forearmVec = { x: leftWrist.x - leftElbow.x, y: leftWrist.y - leftElbow.y };
    const dotProduct = upperArmVec.x * forearmVec.x + upperArmVec.y * forearmVec.y;
    const isRightAngle = Math.abs(dotProduct) < 0.4;
    return wristAboveElbow && elbowExtended && elbowAtHeight && isRightAngle;
  }

  private calculateHandOpenness(landmarks: HandLandmark[]): number {
    const wrist = landmarks[0];
    const fingertips = [4, 8, 12, 16, 20];
    let totalDistance = 0;
    for (const tip of fingertips) {
      const fingertip = landmarks[tip];
      const dx = fingertip.x - wrist.x;
      const dy = fingertip.y - wrist.y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    const avgDistance = totalDistance / fingertips.length;
    return Math.min(1, Math.max(0, (avgDistance - 0.1) / 0.15));
  }

  isCalibrated(): boolean {
    return this.state.phase === 'complete' && this.state.neutralLean !== null;
  }
}
