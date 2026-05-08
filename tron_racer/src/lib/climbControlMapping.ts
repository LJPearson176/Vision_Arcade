interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface ClimbControls {
  leftArmState: 'UP' | 'DOWN';
  rightArmState: 'UP' | 'DOWN';
  leanDirection: 'LEFT' | 'RIGHT' | 'CENTER';
  climbStepDetected: boolean;
  steppedArm: 'LEFT' | 'RIGHT' | null;
  currentLane: 0 | 1 | 2 | 3;
}

interface ArmHistory {
  states: ('UP' | 'DOWN')[];
  timestamps: number[];
}

export class ClimbControlMapper {
  private leftArmHistory: ArmHistory = { states: [], timestamps: [] };
  private rightArmHistory: ArmHistory = { states: [], timestamps: [] };
  private leanHistory: ('LEFT' | 'RIGHT' | 'CENTER')[] = [];
  private lastSteppedArm: 'LEFT' | 'RIGHT' | null = null;
  private lastStepTime: number = 0;
  private currentLane: 0 | 1 | 2 | 3 = 0;
  private lastLeanDirection: 'LEFT' | 'RIGHT' | 'CENTER' = 'CENTER';
  
  private readonly SMOOTHING_FRAMES = 5;
  private readonly LEAN_SMOOTHING_FRAMES = 3;
  private readonly UP_THRESHOLD = -0.20;
  private readonly DOWN_THRESHOLD = 0.15;
  private readonly ELBOW_ANGLE_UP = 130;
  private readonly ELBOW_ANGLE_DOWN = 120;
  private readonly LEAN_DEADZONE = 0.12;
  private readonly STEP_COOLDOWN = 300;

  extractControls(poseResult: any): ClimbControls {
    if (!poseResult?.landmarks?.[0]) {
      return this.getDefaultControls();
    }

    const landmarks = poseResult.landmarks[0];
    
    const leftArmState = this.detectArmState(
      landmarks[11],
      landmarks[13],
      landmarks[15],
      this.leftArmHistory
    );
    
    const rightArmState = this.detectArmState(
      landmarks[12],
      landmarks[14],
      landmarks[16],
      this.rightArmHistory
    );

    const { stepped, arm } = this.detectClimbStep(leftArmState, rightArmState);

    if (Math.random() < 0.05) {
      console.log('Arms:', leftArmState, rightArmState, '| Face:', this.currentLane);
    }

    const leanDirection = this.detectLean(landmarks[11], landmarks[12]);

    if (leanDirection === 'LEFT' && this.lastLeanDirection !== 'LEFT') {
      this.currentLane = ((this.currentLane - 1 + 4) % 4) as 0 | 1 | 2 | 3;
      console.log('Lean LEFT - Moving to face:', this.currentLane);
    } else if (leanDirection === 'RIGHT' && this.lastLeanDirection !== 'RIGHT') {
      this.currentLane = ((this.currentLane + 1) % 4) as 0 | 1 | 2 | 3;
      console.log('Lean RIGHT - Moving to face:', this.currentLane);
    }
    
    this.lastLeanDirection = leanDirection;

    return {
      leftArmState,
      rightArmState,
      leanDirection,
      climbStepDetected: stepped,
      steppedArm: arm,
      currentLane: this.currentLane
    };
  }

  private detectArmState(
    shoulder: PoseLandmark,
    elbow: PoseLandmark,
    wrist: PoseLandmark,
    history: ArmHistory
  ): 'UP' | 'DOWN' {
    const shoulderToWrist = wrist.y - shoulder.y;
    const elbowAngle = this.calculateElbowAngle(shoulder, elbow, wrist);

    let currentState: 'UP' | 'DOWN';

    if (shoulderToWrist < this.UP_THRESHOLD && elbowAngle > this.ELBOW_ANGLE_UP) {
      currentState = 'UP';
    }
    else if (Math.abs(shoulderToWrist) < this.DOWN_THRESHOLD && elbowAngle < this.ELBOW_ANGLE_DOWN) {
      currentState = 'DOWN';
    }
    else {
      currentState = history.states.length > 0 
        ? history.states[history.states.length - 1] 
        : 'DOWN';
    }

    history.states.push(currentState);
    history.timestamps.push(Date.now());

    if (history.states.length > this.SMOOTHING_FRAMES) {
      history.states.shift();
      history.timestamps.shift();
    }

    return this.getMostCommonState(history.states);
  }

  private calculateElbowAngle(
    shoulder: PoseLandmark,
    elbow: PoseLandmark,
    wrist: PoseLandmark
  ): number {
    const v1 = {
      x: shoulder.x - elbow.x,
      y: shoulder.y - elbow.y
    };
    const v2 = {
      x: wrist.x - elbow.x,
      y: wrist.y - elbow.y
    };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    const angle = Math.acos(dot / (mag1 * mag2)) * (180 / Math.PI);
    return angle;
  }

  private getMostCommonState(states: ('UP' | 'DOWN')[]): 'UP' | 'DOWN' {
    const upCount = states.filter(s => s === 'UP').length;
    const downCount = states.length - upCount;
    return upCount > downCount ? 'UP' : 'DOWN';
  }

  private detectClimbStep(leftArmState: 'UP' | 'DOWN', rightArmState: 'UP' | 'DOWN'): {
    stepped: boolean;
    arm: 'LEFT' | 'RIGHT' | null;
  } {
    const now = Date.now();
    
    if (now - this.lastStepTime < this.STEP_COOLDOWN) {
      return { stepped: false, arm: null };
    }

    const leftHistory = this.leftArmHistory.states;
    const rightHistory = this.rightArmHistory.states;

    if (leftHistory.length < 2 || rightHistory.length < 2) {
      return { stepped: false, arm: null };
    }

    const leftWasUp = leftHistory[leftHistory.length - 2] === 'UP';
    const rightWasUp = rightHistory[rightHistory.length - 2] === 'UP';

    if (leftWasUp && leftArmState === 'DOWN' && !rightWasUp && this.lastSteppedArm !== 'LEFT') {
      console.log('LEFT arm step detected!');
      this.lastSteppedArm = 'LEFT';
      this.lastStepTime = now;
      return { stepped: true, arm: 'LEFT' };
    }

    if (rightWasUp && rightArmState === 'DOWN' && !leftWasUp && this.lastSteppedArm !== 'RIGHT') {
      console.log('RIGHT arm step detected!');
      this.lastSteppedArm = 'RIGHT';
      this.lastStepTime = now;
      return { stepped: true, arm: 'RIGHT' };
    }

    return { stepped: false, arm: null };
  }

  private detectLean(leftShoulder: PoseLandmark, rightShoulder: PoseLandmark): 'LEFT' | 'RIGHT' | 'CENTER' {
    const shoulderTilt = leftShoulder.y - rightShoulder.y;
    
    let currentLean: 'LEFT' | 'RIGHT' | 'CENTER';
    
    if (shoulderTilt > this.LEAN_DEADZONE) {
      currentLean = 'LEFT';
    } else if (shoulderTilt < -this.LEAN_DEADZONE) {
      currentLean = 'RIGHT';
    } else {
      currentLean = 'CENTER';
    }

    this.leanHistory.push(currentLean);
    if (this.leanHistory.length > this.LEAN_SMOOTHING_FRAMES) {
      this.leanHistory.shift();
    }

    const leftCount = this.leanHistory.filter(l => l === 'LEFT').length;
    const rightCount = this.leanHistory.filter(l => l === 'RIGHT').length;
    
    if (leftCount > this.LEAN_SMOOTHING_FRAMES / 2) return 'LEFT';
    if (rightCount > this.LEAN_SMOOTHING_FRAMES / 2) return 'RIGHT';
    return 'CENTER';
  }

  private getDefaultControls(): ClimbControls {
    return {
      leftArmState: 'DOWN',
      rightArmState: 'DOWN',
      leanDirection: 'CENTER',
      climbStepDetected: false,
      steppedArm: null,
      currentLane: this.currentLane
    };
  }

  reset(): void {
    this.leftArmHistory = { states: [], timestamps: [] };
    this.rightArmHistory = { states: [], timestamps: [] };
    this.leanHistory = [];
    this.lastSteppedArm = null;
    this.lastStepTime = 0;
    this.currentLane = 0;
    this.lastLeanDirection = 'CENTER';
  }
}
