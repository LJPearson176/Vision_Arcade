
export enum GameState {
  MENU = 'MENU',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  PAUSED = 'PAUSED'
}

export interface Point {
  x: number;
  y: number;
}

export type HandState = 'OPEN' | 'CLOSED';

export interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'PLAYER' | 'OBSTACLE' | 'POWERUP' | 'DECORATION';
  subtype?: 'BIRD' | 'HELICOPTER' | 'HELICOPTER_SMALL' | 'COIN' | 'SHIELD' | 'WINDOW' | 'CLOUD';
  active: boolean;
  color?: string;
  velocity?: Point;
  rotation?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Player extends Entity {
  vy: number; // Vertical velocity
  vx: number; // Horizontal velocity
  stamina: number; // 0-100
  maxStamina: number;
  shielded: boolean;
  score: number;
  distanceTraveled: number; // Total height climbed (score basis)
  spriteState: 'IDLE' | 'CLIMBING' | 'HIT' | 'EATING';
  climbPhase: number; // 0 to 2PI, drives animation cycle
  lean: number; // -1 to 1, rotation for physics feel
  leftHandY: number; // Relative Y position of left hand
  rightHandY: number; // Relative Y position of right hand
  handState: { left: HandState; right: HandState };
  swatting: { left: boolean; right: boolean };
  idleTimer: number; // Frames since last movement
}

export interface VisionInput {
  leftHand: Point | null; // Normalized 0-1
  rightHand: Point | null; // Normalized 0-1
  climbImpulse: number; // calculated upward force 0-1
  handsDetected: boolean;
  bodyCenterX?: number;
  bodySlant?: number;
  leftHandState: HandState;
  rightHandState: HandState;
  rawLandmarks?: any[]; // MediaPipe landmarks for debug drawing
  debug?: {
    rawLeftY: number;
    rawRightY: number;
    deltaLeft: number;
    deltaRight: number;
  };
}

export interface GameSettings {
  sensitivity: number;
  audioEnabled: boolean;
  debugMode: boolean;
}
