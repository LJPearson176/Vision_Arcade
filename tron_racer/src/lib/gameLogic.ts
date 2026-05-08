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
  private readonly positionSmoothing = 0.75; // INCREASED for more responsive movement (was 0.4)
  
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
    
    if (debugLog) {
      console.log('┌─────────────────────────────────────────────────────────┐');
      console.log('│ RPM & GEAR PHYSICS UPDATE                               │');
      console.log('├─────────────────────────────────────────────────────────┤');
      console.log('│ INPUT:');
      console.log('│   Throttle:', throttle.toFixed(3));
      console.log('│   Brake:', brake);
      console.log('│   Target Position:', targetPosition.toFixed(3));
      console.log('│   Delta Time:', dt.toFixed(4), 's');
      console.log('│ BEFORE:');
      console.log('│   RPM:', state.rpm.toFixed(0));
      console.log('│   Gear:', state.gear);
      console.log('│   Speed:', state.speed.toFixed(2));
      console.log('│   Position X:', state.bikeX.toFixed(2));
    }
    
    // Get current gear configuration
    const currentGearConfig = this.gearRatios[state.gear - 1];
    
    // Update RPM based on throttle/brake
    if (throttle > 0.5) {
      // Accelerate RPM
      const rpmGain = this.rpmAccelRate * throttle * dt;
      state.rpm = Math.min(this.maxRPM, state.rpm + rpmGain);
      
      if (debugLog) {
        console.log('│   → ACCELERATING RPM');
        console.log('│   RPM Gain:', rpmGain.toFixed(0));
      }
    } else if (brake) {
      // Strong RPM reduction when braking
      const rpmLoss = this.rpmAccelRate * 1.5 * dt; // 1.5x faster decay when braking
      state.rpm = Math.max(this.minRPM, state.rpm - rpmLoss);
      
      if (debugLog) {
        console.log('│   → BRAKING RPM');
        console.log('│   RPM Loss:', rpmLoss.toFixed(0));
      }
    } else {
      // Coast - RPM decays naturally
      const rpmDecay = this.rpmDecayRate * dt;
      state.rpm = Math.max(this.minRPM, state.rpm - rpmDecay);
      
      if (debugLog) {
        console.log('│   → RPM DECAY (coasting)');
        console.log('│   RPM Decay:', rpmDecay.toFixed(0));
      }
    }
    
    // Calculate speed from RPM and gear ratio
    // Formula: speed = (rpm / 1000) * gearRatio * speedMultiplier
    const rpmFactor = state.rpm / 1000;
    const calculatedSpeed = rpmFactor * currentGearConfig.ratio * 10; // 10 is the base speed multiplier
    state.speed = Math.max(this.minSpeed, calculatedSpeed);
    
    // Determine if we can shift up (RPM in redline zone and not in top gear)
    state.canShift = state.rpm >= this.shiftRPMThreshold && state.gear < 6;
    
    // Auto-downshift if RPM drops too low (not in first gear)
    if (state.rpm < this.minRPMForGear && state.gear > 1) {
      this.shiftDown(state);
      
      if (debugLog) {
        console.log('│   ⚠️  AUTO-DOWNSHIFT TRIGGERED!');
        console.log('│   RPM was too low:', state.rpm.toFixed(0));
      }
    }
    
    if (debugLog) {
      console.log('│   RPM Factor:', rpmFactor.toFixed(2));
      console.log('│   Gear Ratio:', currentGearConfig.ratio);
      console.log('│   Calculated Speed:', calculatedSpeed.toFixed(2));
      console.log('│   Can Shift Up:', state.canShift);
      console.log('│   Auto-Downshift Zone:', state.rpm < this.minRPMForGear ? '✓ YES' : '✗ NO');
    }

    // Update lateral position using direct position mapping
    const oldX = state.bikeX;
    
    // Map target position (0-1) to screen coordinates with margins
    const targetX = (this.screenMargin + targetPosition * (1 - 2 * this.screenMargin)) * this.trackWidth - this.trackWidth / 2;
    
    // Smooth interpolation towards target position (increased responsiveness)
    state.bikeX += (targetX - state.bikeX) * this.positionSmoothing;
    
    // Clamp to track bounds
    state.bikeX = Math.max(-this.trackWidth / 2, Math.min(this.trackWidth / 2, state.bikeX));
    
    if (debugLog) {
      const deltaX = state.bikeX - oldX;
      const distanceToTarget = Math.abs(targetX - state.bikeX);
      console.log('│ AFTER:');
      console.log('│   Target X:', targetX.toFixed(2));
      console.log('│   Distance to Target:', distanceToTarget.toFixed(3));
      console.log('│   Smoothing Factor:', this.positionSmoothing);
      console.log('│   Speed:', state.speed.toFixed(2));
      console.log('│   Position X:', state.bikeX.toFixed(2), '(Δ', deltaX.toFixed(3) + ')');
      console.log('│   Track Bounds: ±' + (this.trackWidth / 2));
    }

    // Update score based on time, speed, and gear (higher gears = more points)
    const oldScore = state.score;
    const gearBonus = Math.pow(state.gear, 1.3); // Exponential gear bonus
    const rpmBonus = state.rpm / 5000; // RPM contributes to score
    const speedBonus = Math.pow(state.speed / 50, 1.5); // Speed contributes
    const totalMultiplier = gearBonus * rpmBonus * speedBonus;
    state.score = Math.floor((Date.now() - state.startTime) / 100 * totalMultiplier);
    
    if (debugLog) {
      console.log('│   Gear Bonus:', gearBonus.toFixed(2) + 'x');
      console.log('│   RPM Bonus:', rpmBonus.toFixed(2) + 'x');
      console.log('│   Speed Bonus:', speedBonus.toFixed(2) + 'x');
      console.log('│   Total Multiplier:', totalMultiplier.toFixed(2) + 'x');
      console.log('│   Score:', state.score, '(+' + (state.score - oldScore) + ')');
      console.log('└─────────────────────────────────────────────────────────┘');
    }
  }

  shiftUp(state: GameState) {
    if (state.canShift) {
      console.log('⚡ SHIFTING UP! Gear', state.gear, '→', state.gear + 1);
      state.gear++;
      state.rpm = Math.max(this.minRPM, state.rpm - this.shiftRPMDrop);
      state.canShift = false; // Reset until RPM builds up again
      console.log('   New RPM after upshift:', state.rpm.toFixed(0));
    }
  }

  shiftDown(state: GameState) {
    if (state.gear > 1) {
      const oldGear = state.gear;
      state.gear--;
      
      // Rev-matching: When downshifting, RPM increases due to lower gear ratio
      // This simulates the engine spinning faster in a lower gear at the same speed
      state.rpm = Math.min(this.maxRPM, state.rpm + this.revMatchRPMGain);
      
      console.log('🔽 AUTO-DOWNSHIFT! Gear', oldGear, '→', state.gear);
      console.log('   Rev-matched RPM:', state.rpm.toFixed(0), '(+' + this.revMatchRPMGain + ')');
      
      // If we're still too low after downshift, keep downshifting
      if (state.rpm < this.minRPMForGear && state.gear > 1) {
        console.log('   Still too low, cascading downshift...');
        this.shiftDown(state);
      }
    }
  }

  moveObstacles(state: GameState, dt: number) {
    const time = Date.now() / 1000;
    
    // Calculate obstacle approach speed based on game speed
    // At max speed (400): 3 seconds to dodge = 100/3 = 33.33 units/sec
    // At min speed (20): 6 seconds to dodge = 100/6 = 16.67 units/sec
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
          
          // Pulsing emissive (if material supports it)
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
        
        // Clean up warning if still exists
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
    const bikeWidth = 4;  // Updated to match lightcycle plane size
    const bikeDepth = 6;  // Updated to match lightcycle plane size
    const bikeZ = 0;

    for (const obstacle of state.obstacles) {
      // Simple AABB collision
      const collisionX = Math.abs(state.bikeX - obstacle.x) < (bikeWidth + obstacle.width) / 2;
      const collisionZ = Math.abs(bikeZ - obstacle.z) < (bikeDepth + obstacle.height) / 2;

      if (collisionX && collisionZ) {
        console.log('🚨 COLLISION DETECTED! 🚨');
        console.log('  Bike X:', state.bikeX.toFixed(2));
        console.log('  Obstacle X:', obstacle.x.toFixed(2));
        console.log('  Obstacle Z:', obstacle.z.toFixed(2));
        console.log('  Speed:', state.speed.toFixed(2));
        console.log('  Final Score:', state.score);
        return true;
      }
    }
    return false;
  }

  spawnObstacle(scene: THREE.Scene, state: GameState, texture?: THREE.Texture, obstacleType?: 'barrier' | 'cube') {
    const lanes = [-10, 0, 10];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    
    // Weighted random selection if type not specified - only barrier and cube
    if (!obstacleType) {
      const rand = Math.random();
      if (rand < 0.6) {
        obstacleType = 'barrier'; // 60% red_repeater barriers
      } else {
        obstacleType = 'cube'; // 40% cyan cubes
      }
    }
    
    console.log('📦 Spawning', obstacleType, 'obstacle at lane:', lane, '| Active obstacles:', state.obstacles.length);
    
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;
    let width = 6;
    let height = 6;
    let warningColor = 0xff0000;
    
    switch (obstacleType) {
      case 'barrier':
        // Original barrier with texture
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
            emissive: 0xff0000,
            emissiveIntensity: 0.5
          });
        }
        warningColor = 0xff0000; // Red warning
        break;
        
      case 'cube':
        // Wireframe cyan cube with pulsing emissive
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
        warningColor = 0x00ffff; // Cyan warning
        break;
        
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(lane, 4, -100);
    scene.add(mesh);
    
    // Create warning indicator
    const warningGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const warningMaterial = new THREE.MeshBasicMaterial({
      color: warningColor,
      emissive: warningColor,
      emissiveIntensity: 1,
      transparent: true,
      opacity: 0.8
    });
    const warning = new THREE.Mesh(warningGeometry, warningMaterial);
    warning.position.set(lane, 4, -80); // Spawn at z = -80
    scene.add(warning);

    state.obstacles.push({
      mesh,
      x: lane,
      z: -100,
      width,
      height,
      type: obstacleType,
      warning,
      animationPhase: 0
    });
  }
}
