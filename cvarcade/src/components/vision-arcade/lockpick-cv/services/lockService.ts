
import { LockState, Pin, PinState, HandInput, GameConfig, Vector2, PickShape } from '../types';
import { CONFIG, DIMENSIONS } from '../constants';
import { audioService } from './audioService';

export class LockService {
  private config: GameConfig;
  private state: LockState;
  private lastTouchedPinId: number = -1;
  private unlockAnimationTime: number = 0;
  
  constructor() {
    this.config = { ...CONFIG };
    this.state = this.createInitialState(this.config.pinCount);
  }

  private createInitialState(pinCount: number): LockState {
    const pins: Pin[] = [];
    // Generate pins
    for (let i = 0; i < pinCount; i++) {
      // Randomize driver vs key pin ratios slightly
      const keyHeight = 30 + Math.random() * 20;
      const driverHeight = 40;
      
      pins.push({
        id: i,
        keyPinHeight: keyHeight,
        driverPinHeight: driverHeight,
        springForce: this.config.springConstant + (Math.random() * 0.05), // Slight variance
        bindingThreshold: 0, // Assigned later
        currentLift: 0,
        velocity: 0, // Positive = falling down, Negative = moving up
        state: PinState.RESTING,
        color: '#fbbf24'
      });
    }

    // Determine binding order
    const indices = Array.from({ length: pinCount }, (_, i) => i);
    const bindingOrder = this.shuffleArray(indices);
    
    return {
      pins,
      bindingOrder,
      currentBindingIndex: bindingOrder[0],
      coreRotation: 0,
      totalTorque: 0,
      pickPosition: { x: 0, y: 0 },
      isUnlocked: false,
      shackleOffset: 0
    };
  }

  private shuffleArray(array: number[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  public getState(): LockState {
    return this.state;
  }

  public reset(configOverride?: Partial<GameConfig>) {
    if (configOverride) {
        this.config = { ...CONFIG, ...configOverride };
    }
    this.state = this.createInitialState(this.config.pinCount);
    this.lastTouchedPinId = -1;
    this.unlockAnimationTime = 0;
  }

  public unlock() {
      if (!this.state.isUnlocked) {
          this.state.isUnlocked = true;
          this.unlockAnimationTime = 0;
      }
  }

  public update(input: HandInput, dt: number, toolType: PickShape = 'short-hook') {
    // --- UNLOCK ANIMATION ---
    if (this.state.isUnlocked) {
        this.unlockAnimationTime += dt;
        
        // 1. Rotate Core to 90
        const targetRot = 90;
        this.state.coreRotation += (targetRot - this.state.coreRotation) * 0.15;
        
        // 2. Pop Shackle after brief delay
        if (this.unlockAnimationTime > 0.2) {
             const targetShackle = 40;
             this.state.shackleOffset += (targetShackle - this.state.shackleOffset) * 0.2;
        }
        
        // Don't process physics if unlocked
        return;
    }


    const { pins, bindingOrder, currentBindingIndex } = this.state;
    
    // Map Input to World Space
    const lockX = 100; // Offset on canvas
    const lockY = 200;
    const worldPickX = lockX + (input.pickPosition.x * 400) - 50; 
    const worldPickY = lockY + (input.pickPosition.y * 200) - 50; 

    this.state.pickPosition = { x: worldPickX, y: worldPickY };
    this.state.totalTorque = input.tensionTorque;

    // --- PHYSICS LOOP ---

    // 1. Core Rotation
    const allSet = pins.every(p => p.state === PinState.SET);
    // Visual rotation only (until unlocked)
    const targetRotation = (input.tensionTorque * 5);
    this.state.coreRotation += (targetRotation - this.state.coreRotation) * 0.2;

    // 2. Identify Binding Pin
    let activeBindingPinIndex = -1;
    if (input.tensionTorque > 0.2) { 
        for (const idx of bindingOrder) {
            if (pins[idx].state !== PinState.SET) {
                activeBindingPinIndex = idx;
                break;
            }
        }
    }
    this.state.currentBindingIndex = activeBindingPinIndex;

    // Track which pin is touched this frame
    let newlyTouchedPinId = -1;

    // Tool Physics Profiles
    let interactionRadius = (DIMENSIONS.pinWidth / 2) + 5; // Default (Short Hook)
    let liftJitterScale = 0.0;

    switch (toolType) {
        case 'deep-hook':
            interactionRadius = (DIMENSIONS.pinWidth / 2) + 2; // Needs more precision/aim
            break;
        case 'half-diamond':
            interactionRadius = (DIMENSIONS.pinWidth / 2) + 10; // Ramp shape hits wider
            break;
        case 'offset-hybrid':
            interactionRadius = (DIMENSIONS.pinWidth / 2) + 6;
            break;
        case 'snake-rake':
        case 'city-rake':
            interactionRadius = DIMENSIONS.pinSpacing * 0.55; // Very wide, can bridge pins
            liftJitterScale = 0.15; // Rakes are messy
            break;
    }

    // 3. Pin Physics
    pins.forEach((pin, index) => {
        const pinXCenter = lockX + 50 + (index * DIMENSIONS.pinSpacing) + (DIMENSIONS.pinWidth / 2);
        
        // A. Collision with Pick
        // Use modified interaction radius based on tool
        const isPickUnder = Math.abs(worldPickX - pinXCenter) < interactionRadius;
        let upwardForce = 0;
        
        if (isPickUnder) {
            newlyTouchedPinId = index;
            const pickLiftHeight = Math.max(0, (lockY + 70) - worldPickY);
            
            if (pickLiftHeight > pin.currentLift * DIMENSIONS.pinMaxLift) {
                const isBinding = (index === activeBindingPinIndex);
                let resistance = pin.springForce;
                if (isBinding) {
                    resistance += (input.tensionTorque * 2.0); 
                }
                
                let targetLift = pickLiftHeight / DIMENSIONS.pinMaxLift;

                // Apply Tool Specific Physics
                if (liftJitterScale > 0) {
                    // Simulate the "bitting" or uneven profile of a rake.
                    // The effective lift changes as you drag across X (scrubbing).
                    // Use worldPickX to create a fixed spatial noise pattern.
                    const profile = Math.sin(worldPickX * 0.15 + (toolType === 'city-rake' ? 0 : Math.PI)); 
                    targetLift += (profile * liftJitterScale);
                }
                
                if (targetLift > pin.currentLift) {
                    // Moving UP - Direct control with resistance lag
                    const moveSpeed = isBinding ? (0.05 / (resistance + 0.1)) : 0.8;
                    pin.currentLift += (targetLift - pin.currentLift) * moveSpeed;
                    pin.velocity = 0; // Reset downward velocity when being pushed up
                }
            }
        }

        // B. Set / Overset Logic
        let canFall = true;
        const setPoint = 1.0 - (pin.keyPinHeight / 60); 
        const tolerance = 0.05; 
        
        if (index === activeBindingPinIndex) {
           pin.state = PinState.BINDING;
           if (Math.abs(pin.currentLift - setPoint) < tolerance) {
               pin.state = PinState.SET;
               audioService.playClick(1200);
           } else if (pin.currentLift > setPoint + tolerance) {
               pin.state = PinState.OVERSET;
           }
        } else if (pin.state === PinState.SET) {
            if (input.tensionTorque < 0.1) {
                pin.state = PinState.FALLING;
                audioService.playThud();
            } else {
                canFall = false;
                pin.currentLift = setPoint; 
            }
        } else if (pin.state === PinState.OVERSET) {
             if (input.tensionTorque < 0.1) {
                pin.state = PinState.FALLING;
            } else {
                canFall = false; 
            }
        }

        // C. Apply Gravity & Spring Bounce
        if (canFall && !isPickUnder) {
            // Apply gravity to velocity
            // Gravity scaled up to feel snappy in 0-1 space
            const gravityAccel = this.config.gravity * 2.0; 
            pin.velocity += gravityAccel * dt; 
            
            // Apply velocity to position
            pin.currentLift -= pin.velocity * dt;

            // Floor Collision (Bounce)
            if (pin.currentLift < 0) {
                if (pin.velocity > 0.5) { 
                    // Bounce
                    pin.currentLift = 0;
                    pin.velocity = -pin.velocity * 0.35; // 35% restitution
                } else {
                    // Settle
                    pin.currentLift = 0;
                    pin.velocity = 0;
                    pin.state = PinState.RESTING;
                }
            }
        } else {
            if (!canFall) pin.velocity = 0;
        }
        
        // Clamp Ceiling
        if (pin.currentLift > 1.1) {
            pin.currentLift = 1.1;
            pin.velocity = 0;
        }
    });

    // Handle Contact Audio
    if (newlyTouchedPinId !== this.lastTouchedPinId) {
        if (newlyTouchedPinId !== -1) {
            // Only play if we are entering a pin zone, not leaving one
            audioService.playContact();
        }
        this.lastTouchedPinId = newlyTouchedPinId;
    }
  }
}

export const lockService = new LockService();
