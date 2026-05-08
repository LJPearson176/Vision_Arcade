import * as THREE from "three";

export interface Obstacle {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  width: number;
  height: number;
  type: 'barrier' | 'cube';
  warning?: THREE.Mesh;
  animationPhase: number;
}

export interface GameState {
  speed: number;
  score: number;
  bikeX: number;
  obstacles: Obstacle[];
  isRunning: boolean;
  startTime: number;
  rpm: number;           // Current engine RPM (0-8000)
  gear: number;          // Current gear (1-6)
  maxRPM: number;        // Redline (8000)
  canShift: boolean;     // True when in shift zone
}

export class GamePhysics {
  private readonly minSpeed = 20;
  private readonly minRPM = 1000; // Idle RPM
  private readonly brakeRate = 100; // High-performance braking for aggressive acceleration
  private readonly friction = 8; // Reduced friction for maintaining high speeds
  private readonly steeringSpeed = 40;
  private readonly trackWidth = 30;
  private readonly screenMargin = 0.1; // 10% margin on each side
  private readonly positionSmoothing = 0.85; // INCREASED for ultra-responsive movement (was 0.75)
  
  // RPM & Gear System - Optimized for 0-60 in 2 seconds
  private readonly gearRatios = [
    { gear: 1, ratio: 0.5, maxSpeed: 50 },   // Increased for faster acceleration
    { gear: 2, ratio: 1.0, maxSpeed: 100 },  // Extended range for 0-60 run
    { gear: 3, ratio: 1.6, maxSpeed: 128 },
    { gear: 4, ratio: 2.2, maxSpeed: 176 },
    { gear: 5, ratio: 2.9, maxSpeed: 232 },
    { gear: 6, ratio: 3.75, maxSpeed: 400 }  // Increased top speed ceiling
  ];
  private readonly rpmAccelRate = 3000;      // 3.3x faster RPM gain for 0-60 in 2s
  private readonly rpmDecayRate = 900;       // Increased decay rate for better control
  private readonly shiftRPMThreshold = 7000; // Lower threshold for faster acceleration runs
  private readonly shiftRPMDrop = 3500;      // Slightly increased for more pronounced shifts
  private readonly maxRPM = 8000;            // Redline
  private readonly minRPMForGear = 2000;     // Auto-downshift below this RPM
  private readonly revMatchRPMGain = 1800;   // RPM gain when downshifting (rev-matching)

  updatePhysics(state: GameState, throttle: number, brake: boolean, targetPosition: number, dt: number) {
    const debugLog = Math.random() < 0.02; // Log 2% of frames
    
    // Get current gear configuration
    const currentGearConfig = this.gearRatios[state.gear - 1];
    
    // Update RPM based on throttle/brake
    if (throttle > 0.1) {
      // Accelerate RPM
      const rpmGain = this.rpmAccelRate * throttle * dt;
      state.rpm = Math.min(this.maxRPM, state.rpm + rpmGain);
    } else if (brake) {
      // Strong RPM reduction when braking
      const rpmLoss = this.rpmAccelRate * 1.5 * dt; // 1.5x faster decay when braking
      state.rpm = Math.max(this.minRPM, state.rpm - rpmLoss);
    } else {
      // Coast - RPM decays naturally
      const rpmDecay = this.rpmDecayRate * dt;
      state.rpm = Math.max(this.minRPM, state.rpm - rpmDecay);
    }
    
    // Calculate speed from RPM and gear ratio
    const rpmFactor = state.rpm / 1000;
    const calculatedSpeed = rpmFactor * currentGearConfig.ratio * 10; // 10 is the base speed multiplier
    state.speed = Math.max(this.minSpeed, calculatedSpeed);
    
    // Determine if we can shift up (RPM in redline zone and not in top gear)
    state.canShift = state.rpm >= this.shiftRPMThreshold && state.gear < 6;
    
    // Auto-downshift if RPM drops too low (not in first gear)
    if (state.rpm < this.minRPMForGear && state.gear > 1) {
      this.shiftDown(state);
    }
    
    // Update lateral position using direct position mapping
    // Map target position (0-1) to screen coordinates with margins
    const targetX = (this.screenMargin + targetPosition * (1 - 2 * this.screenMargin)) * this.trackWidth - this.trackWidth / 2;
    
    // Smooth interpolation towards target position (increased responsiveness)
    state.bikeX += (targetX - state.bikeX) * this.positionSmoothing;
    
    // Clamp to track bounds
    state.bikeX = Math.max(-this.trackWidth / 2, Math.min(this.trackWidth / 2, state.bikeX));
    
    // Update score based on time, speed, and gear (higher gears = more points)
    const gearBonus = Math.pow(state.gear, 1.3); // Exponential gear bonus
    const rpmBonus = state.rpm / 5000; // RPM contributes to score
    const speedBonus = Math.pow(state.speed / 50, 1.5); // Speed contributes
    const totalMultiplier = gearBonus * rpmBonus * speedBonus;
    state.score = Math.floor((Date.now() - state.startTime) / 100 * totalMultiplier);
  }

  shiftUp(state: GameState) {
    if (state.canShift) {
      state.gear++;
      state.rpm = Math.max(this.minRPM, state.rpm - this.shiftRPMDrop);
      state.canShift = false; // Reset until RPM builds up again
    }
  }

  shiftDown(state: GameState) {
    if (state.gear > 1) {
      state.gear--;
      state.rpm = Math.min(this.maxRPM, state.rpm + this.revMatchRPMGain);
      
      // If we're still too low after downshift, keep downshifting
      if (state.rpm < this.minRPMForGear && state.gear > 1) {
        this.shiftDown(state);
      }
    }
  }

  moveObstacles(state: GameState, dt: number) {
    const time = Date.now() / 1000;
    
    const spawnDistance = 100; // Obstacles spawn at z = -100
    const minReactionTime = 3; // seconds at top speed
    const maxReactionTime = 6; // seconds at slowest speed
    const minGameSpeed = 20;
    const maxGameSpeed = 400;
    
    const minApproachSpeed = spawnDistance / maxReactionTime; // ~16.67
    const maxApproachSpeed = spawnDistance / minReactionTime; // ~33.33
    
    // Linear interpolation based on current game speed
    const speedFactor = Math.min(1, Math.max(0, (state.speed - minGameSpeed) / (maxGameSpeed - minGameSpeed)));
    const approachSpeed = minApproachSpeed + speedFactor * (maxApproachSpeed - minApproachSpeed);
    
    for (const obstacle of state.obstacles) {
      obstacle.z += approachSpeed * dt;
      obstacle.mesh.position.z = obstacle.z;
      obstacle.animationPhase += dt;
      
      // Type-specific animations
      switch (obstacle.type) {
        case 'barrier':
          // Slow Y-axis rotation and gentle bobbing
          obstacle.mesh.rotation.y += 0.02 * dt * 60;
          obstacle.mesh.position.y = 4 + Math.sin(obstacle.animationPhase * 2) * 0.3;
          break;
          
        case 'cube':
          // Multi-axis tumbling rotation
          obstacle.mesh.rotation.x += 0.01 * dt * 60;
          obstacle.mesh.rotation.y += 0.02 * dt * 60;
          obstacle.mesh.rotation.z += 0.01 * dt * 60;
          
          const material = obstacle.mesh.material as THREE.MeshStandardMaterial;
          if (material.emissive) {
            material.emissiveIntensity = 0.5 + Math.sin(time * 2) * 0.5;
          }
          break;
      }
      
      // Update warning indicator position
      if (obstacle.warning) {
        obstacle.warning.position.z = obstacle.z - 20; // Stay 20 units ahead
        
        // Pulsing warning animation
        const pulseScale = 1 + Math.sin(time * 8) * 0.3;
        obstacle.warning.scale.setScalar(pulseScale);
        
        // Remove warning when obstacle gets close
        if (obstacle.z > -50 && obstacle.warning.parent) {
          obstacle.warning.parent.remove(obstacle.warning);
          obstacle.warning.geometry.dispose();
          (obstacle.warning.material as THREE.Material).dispose();
          obstacle.warning = undefined;
        }
      }
    }

    // Remove obstacles that passed behind
    state.obstacles = state.obstacles.filter(obs => {
      if (obs.z > 20) {
        obs.mesh.geometry.dispose();
        (obs.mesh.material as THREE.Material).dispose();
        
        if (obs.warning && obs.warning.parent) {
          obs.warning.parent.remove(obs.warning);
          obs.warning.geometry.dispose();
          (obs.warning.material as THREE.Material).dispose();
        }
        
        return false;
      }
      return true;
    });
  }

  checkCollisions(state: GameState): boolean {
    const bikeWidth = 4;
    const bikeDepth = 6;
    const bikeZ = 0;

    for (const obstacle of state.obstacles) {
      const collisionX = Math.abs(state.bikeX - obstacle.x) < (bikeWidth + obstacle.width) / 2;
      const collisionZ = Math.abs(bikeZ - obstacle.z) < (bikeDepth + obstacle.height) / 2;

      if (collisionX && collisionZ) {
        return true;
      }
    }
    return false;
  }

  spawnObstacle(scene: THREE.Scene, state: GameState, texture?: THREE.Texture, obstacleType?: 'barrier' | 'cube') {
    const lanes = [-10, 0, 10];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    
    if (!obstacleType) {
      const rand = Math.random();
      if (rand < 0.6) {
        obstacleType = 'barrier';
      } else {
        obstacleType = 'cube';
      }
    }
    
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;
    let width = 6;
    let height = 6;
    let warningColor = 0xff0000;
    
    switch (obstacleType) {
      case 'barrier':
        geometry = new THREE.PlaneGeometry(6, 6);
        if (texture) {
          material = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            emissive: 0xff0000,
            emissiveIntensity: 0.3
          });
        } else {
          material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
          });
        }
        warningColor = 0xff0000;
        break;
        
      case 'cube':
        geometry = new THREE.BoxGeometry(4, 4, 4);
        material = new THREE.MeshStandardMaterial({
          color: 0x00ffff,
          emissive: 0x00ffff,
          emissiveIntensity: 0.5,
          wireframe: true,
          transparent: true,
          opacity: 0.8
        });
        width = 4;
        height = 4;
        warningColor = 0x00ffff;
        break;
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(lane, 4, -100);
    scene.add(mesh);
    
    const warningGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const warningMaterial = new THREE.MeshBasicMaterial({
      color: warningColor,
      transparent: true,
      opacity: 0.8
    });
    const warning = new THREE.Mesh(warningGeometry, warningMaterial);
    warning.position.set(lane, 4, -80);
    scene.add(warning);

    state.obstacles.push({
      mesh,
      x: lane,
      z: -100,
      width,
      height,
      type: obstacleType as 'barrier' | 'cube',
      warning,
      animationPhase: 0
    });
  }
}
