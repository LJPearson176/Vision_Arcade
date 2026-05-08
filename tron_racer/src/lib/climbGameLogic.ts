import * as THREE from 'three';

export interface MCPNode {
  id: string;
  mesh: THREE.Mesh;
  lane: 0 | 1 | 2 | 3;
  yPosition: number;
  speed: number;
  resolved: boolean;
}

export interface ClimbGameState {
  playerHeight: number;
  playerLane: 0 | 1 | 2 | 3;
  targetLane: 0 | 1 | 2 | 3;
  climbSpeed: number;
  mcpNodes: MCPNode[];
  score: number;
  difficulty: number;
  nodesSpawned: number;
  nodesDodged: number;
  lastSpawnTime: number;
  gameTime: number;
  combo: number;
}

export class ClimbPhysics {
  private readonly TOWER_FACES = 4;
  private readonly BASE_CLIMB_SPEED = 2.0;
  private readonly CLIMB_STEP_BONUS = 3.0;
  private readonly BASE_SPAWN_INTERVAL = 2500;
  private readonly MIN_SPAWN_INTERVAL = 800;
  private readonly BASE_NODE_SPEED = 8;
  private readonly MAX_NODE_SPEED = 18;
  private readonly LANE_SWITCH_SPEED = 8;
  private readonly HIT_WINDOW = 2.0;
  private readonly DIFFICULTY_INCREASE_INTERVAL = 50;
  private readonly TOWER_RADIUS = 10;

  createInitialState(): ClimbGameState {
    return {
      playerHeight: 5,
      playerLane: 0,
      targetLane: 0,
      climbSpeed: this.BASE_CLIMB_SPEED,
      mcpNodes: [],
      score: 0,
      difficulty: 0,
      nodesSpawned: 0,
      nodesDodged: 0,
      lastSpawnTime: Date.now(),
      gameTime: 0,
      combo: 0
    };
  }

  updateClimbing(state: ClimbGameState, climbStepDetected: boolean, dt: number): void {
    state.playerHeight += this.BASE_CLIMB_SPEED * dt;

    if (climbStepDetected) {
      state.playerHeight += this.CLIMB_STEP_BONUS;
      state.score += 10;
      console.log('Climb step detected! Height:', state.playerHeight);
    }

    state.difficulty = Math.floor(state.playerHeight / this.DIFFICULTY_INCREASE_INTERVAL);
    state.score += Math.floor(this.BASE_CLIMB_SPEED * dt);
    state.gameTime += dt;
  }

  getFaceTransform(face: number): { x: number; z: number; rotationY: number } {
    const angle = (face * Math.PI) / 2;
    
    return {
      x: Math.sin(angle) * this.TOWER_RADIUS,
      z: -20 + Math.cos(angle) * this.TOWER_RADIUS,
      rotationY: -angle
    };
  }

  updatePlayerLane(state: ClimbGameState, targetLane: 0 | 1 | 2 | 3, dt: number): { x: number; z: number; rotationY: number } {
    state.targetLane = targetLane;
    
    let diff = targetLane - state.playerLane;
    if (diff > this.TOWER_FACES / 2) diff -= this.TOWER_FACES;
    if (diff < -this.TOWER_FACES / 2) diff += this.TOWER_FACES;
    
    const newLane = state.playerLane + diff * this.LANE_SWITCH_SPEED * dt;
    
    if (Math.abs(diff) < 0.1) {
      state.playerLane = targetLane;
    } else {
      state.playerLane = newLane as any;
    }
    
    return this.getFaceTransform(state.playerLane);
  }

  shouldSpawnNode(state: ClimbGameState): boolean {
    const spawnInterval = Math.max(
      this.MIN_SPAWN_INTERVAL,
      this.BASE_SPAWN_INTERVAL - (state.difficulty * 150)
    );
    
    return Date.now() - state.lastSpawnTime >= spawnInterval;
  }

  spawnMCPNode(
    scene: THREE.Scene,
    state: ClimbGameState,
    onTelegraph?: (lane: 0 | 1 | 2 | 3) => void
  ): void {
    const lane = Math.floor(Math.random() * this.TOWER_FACES) as 0 | 1 | 2 | 3;
    const nodeSpeed = Math.min(
      this.MAX_NODE_SPEED,
      this.BASE_NODE_SPEED + (state.difficulty * 0.8)
    );

    const geometry = new THREE.SphereGeometry(1.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff0066,
      emissive: 0xff0033,
      emissiveIntensity: 1.5,
      metalness: 0.2,
      roughness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    const faceTransform = this.getFaceTransform(lane);
    mesh.position.set(
      faceTransform.x,
      state.playerHeight + 30,
      faceTransform.z
    );
    mesh.rotation.y = faceTransform.rotationY;
    
    scene.add(mesh);

    const node: MCPNode = {
      id: `node_${Date.now()}_${Math.random()}`,
      mesh,
      lane,
      yPosition: mesh.position.y,
      speed: nodeSpeed,
      resolved: false
    };

    state.mcpNodes.push(node);
    state.nodesSpawned++;
    state.lastSpawnTime = Date.now();

    if (onTelegraph) {
      onTelegraph(lane);
    }
  }

  updateMCPNodes(state: ClimbGameState, dt: number): void {
    state.mcpNodes.forEach(node => {
      if (!node.resolved) {
        node.yPosition -= node.speed * dt;
        node.mesh.position.y = node.yPosition;

        if (node.yPosition < state.playerHeight - this.HIT_WINDOW * 2) {
          if (!node.resolved) {
            node.resolved = true;
            state.nodesDodged++;
            state.score += 50 * (state.combo + 1);
            state.combo++;
          }
        }
      }
    });
  }

  checkCollisions(state: ClimbGameState): { hit: boolean; hitNode?: MCPNode } {
    const playerFace = Math.round(state.playerLane) % this.TOWER_FACES;
    
    for (const node of state.mcpNodes) {
      if (node.resolved) continue;

      const heightDiff = Math.abs(node.yPosition - state.playerHeight);
      const sameFace = node.lane === playerFace;

      if (heightDiff < this.HIT_WINDOW && sameFace) {
        return { hit: true, hitNode: node };
      }
    }

    return { hit: false };
  }

  cleanupNodes(scene: THREE.Scene, state: ClimbGameState): void {
    state.mcpNodes = state.mcpNodes.filter(node => {
      if (node.yPosition < state.playerHeight - 40) {
        scene.remove(node.mesh);
        node.mesh.geometry.dispose();
        (node.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }

  reset(): void {
    // Reset any internal state if needed
  }
}
