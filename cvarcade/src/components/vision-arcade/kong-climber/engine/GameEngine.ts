
import { 
  Player, Entity, Particle, VisionInput, GameState, Point 
} from '../types';
import { 
  GAME_WIDTH, GAME_HEIGHT, BUILDING_WIDTH, 
  GRAVITY, CLIMB_FORCE_MULTIPLIER, MAX_VELOCITY,
  INITIAL_PLAYER_STATS, OBSTACLE_SPAWN_RATE, COLORS, WINDOW_ROWS_GAP
} from '../constants';

export class GameEngine {
  public player: Player;
  public entities: Entity[] = [];
  public particles: Particle[] = [];
  public state: GameState = GameState.MENU;
  public difficultyMultiplier: number = 1.0;
  
  public cameraY: number = 0; // Public for rendering scroll
  private frameCount: number = 0;
  private lastObstacleSpawn: number = 0;
  private buildingX: number = (GAME_WIDTH - BUILDING_WIDTH) / 2;
  
  // Tuned Physics for "Heavy but Powerful" feel
  private readonly FRICTION = 0.92; 
  private readonly FORCE_MULT = 4.0; 
  private readonly LEAN_ACCELERATION = 1.5; // Horizontal force multiplier

  constructor() {
    this.player = this.createPlayer();
    this.reset();
  }

  public reset() {
    this.player = this.createPlayer();
    this.entities = [];
    this.particles = [];
    this.frameCount = 0;
    this.cameraY = 0;
    this.difficultyMultiplier = 1.0;
    this.lastObstacleSpawn = 0;
    
    // Initial generation
    this.generateInitialWorld();
  }

  private createPlayer(): Player {
    return {
      id: 'player',
      x: GAME_WIDTH / 2 - 25,
      y: GAME_HEIGHT - 150,
      width: 50,
      height: 60,
      type: 'PLAYER',
      active: true,
      color: COLORS.PLAYER,
      ...INITIAL_PLAYER_STATS,
      climbPhase: 0,
      lean: 0,
      spriteState: 'IDLE',
      leftHandY: -20,
      rightHandY: -20,
      handState: { left: 'OPEN', right: 'OPEN' },
      swatting: { left: false, right: false },
      idleTimer: 0
    };
  }

  public update(input: VisionInput) {
    if (this.state !== GameState.PLAYING) return;

    this.frameCount++;
    this.difficultyMultiplier = 1 + (this.player.distanceTraveled * 0.0001);

    // Sync Hand States
    this.player.handState.left = input.leftHandState;
    this.player.handState.right = input.rightHandState;

    // --- PHYSICS ---
    
    // 1. Apply Climb Impulse (Vertical Force)
    // Only climb if hands are CLOSED (Fist)
    let effectiveImpulse = 0;
    if (input.leftHandState === 'CLOSED' || input.rightHandState === 'CLOSED') {
        effectiveImpulse = input.climbImpulse;
    }

    if (effectiveImpulse > 0) {
      this.player.vy -= effectiveImpulse * this.FORCE_MULT;
      // Stamina drain
      this.player.stamina = Math.max(0, this.player.stamina - (effectiveImpulse * 0.15));
    }

    // Recover stamina slowly if not climbing (faster if idle)
    const staminaRecovery = effectiveImpulse < 0.1 ? (this.player.spriteState === 'IDLE' ? 0.3 : 0.15) : 0;
    this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + staminaRecovery);

    // 2. Apply Gravity (Constant Downward Force)
    this.player.vy += GRAVITY;

    // 3. Apply Horizontal Lean (Horizontal Force)
    // Primary steering: Body Center deviation
    if (input.bodyCenterX !== undefined) {
       // Input range is 0 (Left) to 1 (Right). Center is 0.5.
       const deviation = (input.bodyCenterX - 0.5); 
       
       // Secondary steering: Shoulder Slant
       const slant = input.bodySlant || 0;
       
       const totalSteer = deviation + (slant * 2.0); 

       this.player.vx += totalSteer * this.LEAN_ACCELERATION;
    }
    
    // 4. Apply Friction (Drag)
    this.player.vy *= this.FRICTION;
    this.player.vx *= this.FRICTION;

    // 5. Cap Velocity
    this.player.vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, this.player.vy));
    this.player.vx = Math.max(-12, Math.min(12, this.player.vx)); // Horizontal cap

    // 6. Update Position
    this.player.y += this.player.vy;
    this.player.x += this.player.vx;

    // --- SWAT MECHANIC ---
    // If hand is OPEN and moving fast, it's a swat
    // We approximate hand velocity using impulse signals, but specific to side/up movement would be better.
    // Here we assume high "impulse" signal with OPEN hand is a swat attempt (e.g. rapid wave).
    const swatThreshold = 1.0; 
    
    // Reset swat state
    this.player.swatting.left = false;
    this.player.swatting.right = false;

    if (input.debug && input.debug.deltaLeft > 0.005 && input.leftHandState === 'OPEN') {
        this.player.swatting.left = true;
        this.checkSwatCollision(true);
    }
    if (input.debug && input.debug.deltaRight > 0.005 && input.rightHandState === 'OPEN') {
        this.player.swatting.right = true;
        this.checkSwatCollision(false);
    }

    // --- ANIMATION STATE ---
    const isMoving = Math.abs(this.player.vy) > 0.5 || Math.abs(this.player.vx) > 0.5 || effectiveImpulse > 0;
    const isClimbing = this.player.vy < -0.5; // Moving UP significantly

    // Idle / Eating Logic
    if (isMoving) {
      this.player.idleTimer = 0;
      if (this.player.spriteState === 'EATING') {
        this.player.spriteState = 'IDLE';
      }
    } else if (this.player.spriteState !== 'HIT') {
      // Increment idle timer
      this.player.idleTimer++;
      if (this.player.idleTimer > 180) { // 3 seconds @ 60fps
        this.player.spriteState = 'EATING';
      } else {
        this.player.spriteState = 'IDLE';
      }
    }

    // Drive Animation Phase
    if (isClimbing) {
      this.player.spriteState = 'CLIMBING';
      this.player.climbPhase += Math.abs(this.player.vy) * 0.15;
    }
    
    if (this.player.climbPhase > Math.PI * 2) {
      this.player.climbPhase -= Math.PI * 2;
    }

    // --- SMOOTH LIMB KINEMATICS ---
    const shoulderY = -this.player.height / 3;
    const reach = 25;
    let targetLeftY, targetRightY;
    let smoothFactor = 0.2;

    if (this.player.spriteState === 'HIT') {
        targetLeftY = shoulderY - 40 + Math.sin(this.frameCount * 0.5) * 20;
        targetRightY = shoulderY - 40 + Math.cos(this.frameCount * 0.5) * 20;
        smoothFactor = 0.1; 
    } else if (this.player.spriteState === 'EATING') {
        // Right hand moves to mouth, Left hand hangs
        // Mouth is roughly at -headY (approx -height/2)
        targetRightY = -this.player.height / 2 + 10 + Math.sin(this.frameCount * 0.2) * 2;
        targetLeftY = shoulderY + 30; 
        smoothFactor = 0.1;
    } else if (isClimbing) {
      targetLeftY = shoulderY + Math.sin(this.player.climbPhase) * reach;
      targetRightY = shoulderY + Math.sin(this.player.climbPhase + Math.PI) * reach;
      smoothFactor = 0.3;
    } else {
      // Idle Breathing
      const breathe = Math.sin(this.frameCount * 0.05) * 5;
      targetLeftY = shoulderY - 15 + breathe;
      targetRightY = shoulderY - 15 - breathe;
      smoothFactor = 0.05;
    }

    const lerp = (start: number, end: number, t: number) => start + (end - start) * t;
    this.player.leftHandY = lerp(this.player.leftHandY, targetLeftY, smoothFactor);
    this.player.rightHandY = lerp(this.player.rightHandY, targetRightY, smoothFactor);

    // Calculate Visual Lean (Rotation)
    const targetLean = Math.max(-0.4, Math.min(0.4, this.player.vx * 0.06));
    this.player.lean = this.player.lean * 0.85 + targetLean * 0.15;

    // Bounds Checking
    if (this.player.x < this.buildingX) {
        this.player.x = this.buildingX;
        this.player.vx = 0; // Bonk wall
    }
    if (this.player.x > this.buildingX + BUILDING_WIDTH - this.player.width) {
      this.player.x = this.buildingX + BUILDING_WIDTH - this.player.width;
      this.player.vx = 0; // Bonk wall
    }
    
    // Floor Check
    if (this.player.y > GAME_HEIGHT - this.player.height) {
      this.player.y = GAME_HEIGHT - this.player.height;
      this.player.vy = 0;
      if (this.player.distanceTraveled > 200) {
         this.state = GameState.GAME_OVER;
      }
    }

    // --- CAMERA / SCROLLING ---
    const threshold = GAME_HEIGHT * 0.4;
    if (this.player.y < threshold) {
      const diff = threshold - this.player.y;
      this.player.y = threshold;
      this.player.distanceTraveled += diff;
      this.player.score += Math.floor(diff);
      this.moveWorld(diff);
    }

    // --- GENERATION & ENTITY UPDATES ---
    this.proceduralGeneration();
    this.updateEntities();
    this.updateParticles();
  }

  private checkSwatCollision(isLeft: boolean) {
      const p = this.player;
      const reachX = isLeft ? p.x - 30 : p.x + p.width + 30;
      const reachY = p.y + p.leftHandY; // Approx hand height
      const radius = 40;

      this.entities.forEach(e => {
          if (!e.active || e.type !== 'OBSTACLE') return;
          
          const dist = Math.sqrt(Math.pow(e.x + e.width/2 - reachX, 2) + Math.pow(e.y + e.height/2 - reachY, 2));
          if (dist < radius + Math.max(e.width, e.height)/2) {
              // SWAT HIT!
              e.active = false;
              this.createParticles(e.x + e.width/2, e.y + e.height/2, 15, COLORS.OBSTACLE);
              this.player.score += 500; // Bonus score
          }
      });
  }

  private moveWorld(dy: number) {
    this.entities.forEach(e => e.y += dy);
    this.cameraY += dy;
  }

  private generateInitialWorld() {
    // Start loop at 2 to skip the bottom two rows (overlapping street/ground)
    // Row 0 (~600px): Ground level
    // Row 1 (~520px): Door body level
    // Row 2 (~440px): Door top/Awning level
    for(let i=2; i<12; i++) {
      // For row 2, skip the middle window to avoid overlapping the door/awning header
      const skipMiddle = (i === 2);
      this.spawnWindowRow(GAME_HEIGHT - (i * WINDOW_ROWS_GAP), skipMiddle);
    }
  }

  private proceduralGeneration() {
    if (this.frameCount - this.lastObstacleSpawn > (OBSTACLE_SPAWN_RATE / this.difficultyMultiplier)) {
      this.spawnObstacle();
      this.lastObstacleSpawn = this.frameCount;
    }

    const highestEntity = this.entities.reduce((min, e) => Math.min(min, e.y), 0);
    if (highestEntity > -100) {
      this.spawnWindowRow(highestEntity - WINDOW_ROWS_GAP);
    }
  }

  private spawnWindowRow(y: number, skipMiddle: boolean = false) {
    const cols = 3;
    const windowW = 40;
    const spacing = BUILDING_WIDTH / cols;
    
    for(let i=0; i<cols; i++) {
      // Skip middle column if requested (index 1 is middle)
      if (skipMiddle && i === 1) continue;

      const isOn = Math.random() > 0.7;
      this.entities.push({
        id: `win-${Math.random()}`,
        type: 'DECORATION',
        subtype: 'WINDOW',
        x: this.buildingX + (spacing * i) + 30,
        y: y,
        width: windowW,
        height: 60,
        active: true,
        color: isOn ? COLORS.WINDOW_ON : COLORS.WINDOW_OFF
      });
    }
  }

  private spawnObstacle() {
    const isSmall = Math.random() > 0.5;
    const type = isSmall ? 'HELICOPTER_SMALL' : 'HELICOPTER'; 
    const isLeft = Math.random() > 0.5;
    
    const obs: Entity = {
      id: `obs-${Math.random()}`,
      type: 'OBSTACLE',
      subtype: type as any,
      x: isLeft ? -100 : GAME_WIDTH + 100,
      y: -50, 
      width: isSmall ? 50 : 80,
      height: isSmall ? 35 : 50,
      active: true,
      color: COLORS.OBSTACLE,
      velocity: {
        x: isLeft ? (2 + Math.random() * 2) : -(2 + Math.random() * 2),
        y: 1 + Math.random()
      }
    };
    this.entities.push(obs);
  }

  private updateEntities() {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.velocity) {
        e.x += e.velocity.x;
        e.y += e.velocity.y;
      }
      if (e.y > GAME_HEIGHT + 100) e.active = false;

      if (e.active && e.type === 'OBSTACLE' && this.checkCollision(this.player, e)) {
         this.handleCollision(e);
      }

      if (!e.active) this.entities.splice(i, 1);
    }
  }

  private updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private checkCollision(a: Entity, b: Entity): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  private handleCollision(e: Entity) {
    if (this.player.shielded) {
      this.player.shielded = false;
      e.active = false;
      this.createParticles(e.x, e.y, 10, COLORS.PLAYER_SHIELD);
    } else {
      this.player.spriteState = 'HIT';
      this.player.vy = 10;
      this.player.stamina -= 20;
      this.createParticles(this.player.x, this.player.y, 5, COLORS.PLAYER);
      
      if (this.player.stamina <= 0) {
        this.state = GameState.GAME_OVER;
      }
    }
  }

  private createParticles(x: number, y: number, count: number, color: string) {
    for(let i=0; i<count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 20 + Math.random() * 20,
        maxLife: 40,
        color: color,
        size: 2 + Math.random() * 3
      });
    }
  }
}
