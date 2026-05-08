
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;

// Physics
export const GRAVITY = 0.5;
export const FRICTION = 0.94;
export const CLIMB_FORCE_MULTIPLIER = 3.0;
export const MAX_VELOCITY = 20;
export const SIDE_MOVEMENT_SPEED = 2;

// World
export const BUILDING_WIDTH = 300;
export const LANE_LEFT_X = (GAME_WIDTH - BUILDING_WIDTH) / 2;
export const LANE_RIGHT_X = LANE_LEFT_X + BUILDING_WIDTH;

// Colors
export const COLORS = {
  BACKGROUND: '#0f172a', // slate-900
  BUILDING: '#1e293b',   // slate-800
  BUILDING_ACCENT: '#334155', // slate-700
  WINDOW_OFF: '#0f172a', // slate-900
  WINDOW_ON: '#facc15',  // yellow-400
  PLAYER: '#1a1a1a',     // Dark Grey / Black (Kong Fur)
  PLAYER_SHIELD: '#38bdf8', // sky-400
  OBSTACLE: '#ef4444',   // red-500
  COIN: '#fbbf24',       // amber-400
  TEXT: '#f8fafc',       // slate-50
  PARTICLE_DUST: '#94a3b8' // slate-400
};

// Spawn Rates
export const OBSTACLE_SPAWN_RATE = 100; // Frames
export const COIN_SPAWN_RATE = 150; 
export const WINDOW_ROWS_GAP = 80;

// Difficulty
export const LEVEL_DIFFICULTY_SCALER = 0.0005; 

export const INITIAL_PLAYER_STATS = {
  stamina: 100,
  maxStamina: 100,
  score: 0,
  distanceTraveled: 0,
  vy: 0,
  vx: 0,
  shielded: false,
  spriteState: 'IDLE' as const,
  climbFrame: 0
};
