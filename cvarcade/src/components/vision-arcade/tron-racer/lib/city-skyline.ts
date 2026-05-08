import * as THREE from 'three';

export class CitySkyline {
  private scene: THREE.Scene;
  private buildings: THREE.Group;
  private buildingEdges: THREE.LineSegments[] = [];
  private currentColorZone: number = 0;
  private mcpTower: THREE.Group;
  private mcpBeam: THREE.Mesh | null = null;
  private mcpText: THREE.Mesh | null = null;
  private mcpTextCanvas: HTMLCanvasElement | null = null;
  private elapsedTime: number = 0;
  private clouds: THREE.Group;
  private cloudMeshes: THREE.Mesh[] = [];
  private starfield: THREE.Points | null = null;
  private starMaterials: THREE.PointsMaterial[] = [];
  
  private readonly colorZones = [
    { primary: 0x00ffff, secondary: 0x0080ff },
    { primary: 0xff00ff, secondary: 0x8000ff },
    { primary: 0xffff00, secondary: 0xff8000 }
  ];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.buildings = new THREE.Group();
    this.mcpTower = new THREE.Group();
    this.clouds = new THREE.Group();
    this.createStarfield();
    this.createSkyline();
    this.createMCPTower();
    this.createNeonClouds();
    this.scene.add(this.buildings);
    this.scene.add(this.mcpTower);
    this.scene.add(this.clouds);
  }

  private createSkyline(): void {
    const buildingConfigs = [
      { x: -80, z: -600, width: 15, height: 80, depth: 15 },
      { x: -100, z: -650, width: 20, height: 120, depth: 20 },
      { x: -60, z: -550, width: 12, height: 60, depth: 12 },
      { x: -120, z: -700, width: 18, height: 100, depth: 18 },
      { x: -40, z: -580, width: 10, height: 50, depth: 10 },
      { x: -140, z: -750, width: 25, height: 140, depth: 25 },
      { x: 80, z: -600, width: 15, height: 80, depth: 15 },
      { x: 100, z: -650, width: 20, height: 120, depth: 20 },
      { x: 60, z: -550, width: 12, height: 60, depth: 12 },
      { x: 120, z: -700, width: 18, height: 100, depth: 18 },
      { x: 40, z: -580, width: 10, height: 50, depth: 10 },
      { x: 140, z: -750, width: 25, height: 140, depth: 25 },
      { x: -50, z: -900, width: 30, height: 180, depth: 30 },
      { x: -30, z: -850, width: 20, height: 120, depth: 20 },
      { x: 50, z: -900, width: 30, height: 180, depth: 30 },
      { x: 30, z: -850, width: 20, height: 120, depth: 20 },
    ];
    buildingConfigs.forEach(config => this.createBuilding(config.x, config.z, config.width, config.height, config.depth));
  }

  private createBuilding(x: number, z: number, width: number, height: number, depth: number): void {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const buildingDistanceFactor = Math.abs(z) / 1000;
    const atmosphericOpacity = Math.max(0.15, 0.5 - buildingDistanceFactor * 0.3);
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: atmosphericOpacity, side: THREE.DoubleSide });
    const building = new THREE.Mesh(geometry, material);
    building.position.set(x, height / 2, z);
    this.buildings.add(building);
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgeDistanceFactor = Math.abs(z) / 1000;
    const edgeOpacity = Math.max(0.3, 0.8 - edgeDistanceFactor * 0.4);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: this.colorZones[0].primary, transparent: true, opacity: edgeOpacity });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.position.copy(building.position);
    this.buildings.add(edges);
    this.buildingEdges.push(edges);
    this.addLightStrips(x, z, width, height, depth);
  }

  private addLightStrips(x: number, z: number, width: number, height: number, depth: number): void {
    const stripCount = Math.floor(width / 5);
    for (let i = 0; i < stripCount; i++) {
      const offsetX = (i - stripCount / 2) * 3;
      const stripGeometry = new THREE.PlaneGeometry(0.5, height * 0.8);
      const stripMaterial = new THREE.MeshBasicMaterial({ color: this.colorZones[0].primary, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const strip = new THREE.Mesh(stripGeometry, stripMaterial);
      strip.position.set(x + offsetX, height / 2, z + depth / 2 + 0.1);
      this.buildings.add(strip);
      this.buildingEdges.push(strip as any);
    }
  }

  public updateColorZone(distance: number): void {
    const newZone = Math.floor(distance / 1000) % 3;
    if (newZone !== this.currentColorZone) {
      this.currentColorZone = newZone;
      const colors = this.colorZones[newZone];
      this.buildingEdges.forEach((edge: any) => {
        if (edge.material) edge.material.color.setHex(colors.primary);
      });
    }
  }

  private createMCPTower(): void {
    const towerGeometry = new THREE.BoxGeometry(120, 600, 100);
    const towerMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.set(0, 300, -700);
    this.mcpTower.add(tower);
    const edgesGeometry = new THREE.EdgesGeometry(towerGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0xff1493, transparent: true, opacity: 0.5 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.position.copy(tower.position);
    this.mcpTower.add(edges);
    this.createMCPText();
    this.createCoreBeam();
  }

  private createMCPText(): void {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff69b4';
    ctx.fillStyle = '#ff1493';
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MCP', canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const textGeometry = new THREE.PlaneGeometry(60, 15);
    const textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.set(0, 380, -650);
    this.mcpTower.add(textMesh);
    this.mcpText = textMesh;
    this.mcpTextCanvas = canvas;
  }

  private createCoreBeam(): void {
    const beamGeometry = new THREE.CylinderGeometry(4, 4, 600, 8);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xff1493, transparent: true, opacity: 0.2 });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.set(0, 300, -700);
    this.mcpTower.add(beam);
    this.mcpBeam = beam;
  }

  private createStarfield(): void {
    const starCount = 800;
    for (let j = 0; j < 3; j++) {
      const starLayers = [
        { color: 0x00ffff, opacity: 0.8, size: 2 },
        { color: 0xffffff, opacity: 0.6, size: 1.5 },
        { color: 0x0088ff, opacity: 0.5, size: 1 },
      ];
      const layer = starLayers[j];
      const material = new THREE.PointsMaterial({ color: layer.color, size: layer.size, transparent: true, opacity: layer.opacity, sizeAttenuation: true });
      const layerGeometry = new THREE.BufferGeometry();
      const layerPositions = new Float32Array(Math.floor(starCount / 3) * 3);
      for (let i = 0; i < Math.floor(starCount / 3); i++) {
        layerPositions[i * 3] = (Math.random() - 0.5) * 1500;
        layerPositions[i * 3 + 1] = 80 + Math.random() * 450;
        layerPositions[i * 3 + 2] = -400 - Math.random() * 700;
      }
      layerGeometry.setAttribute('position', new THREE.BufferAttribute(layerPositions, 3));
      const stars = new THREE.Points(layerGeometry, material);
      this.scene.add(stars);
      this.starMaterials.push(material);
      if (j === 0) this.starfield = stars;
    }
  }

  private createNeonClouds(): void {
    const cloudConfigs = [
      { x: -200, y: 180, z: -500, scale: 1.2 }, { x: -150, y: 220, z: -600, scale: 0.8 }, { x: -280, y: 160, z: -450, scale: 1.0 }, { x: -100, y: 200, z: -700, scale: 0.6 },
      { x: 200, y: 190, z: -500, scale: 1.1 }, { x: 150, y: 210, z: -550, scale: 0.9 }, { x: 280, y: 170, z: -480, scale: 1.0 }, { x: 100, y: 230, z: -650, scale: 0.7 },
      { x: -50, y: 250, z: -800, scale: 1.5 }, { x: 50, y: 240, z: -750, scale: 1.3 }, { x: 0, y: 280, z: -900, scale: 1.8 },
    ];
    cloudConfigs.forEach((config, index) => {
      const cloud = this.createSingleCloud(config.scale, index);
      cloud.position.set(config.x, config.y, config.z);
      this.clouds.add(cloud);
    });
  }

  private createSingleCloud(scale: number, index: number): THREE.Group {
    const cloudGroup = new THREE.Group();
    const sphereCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < sphereCount; i++) {
      const radius = (15 + Math.random() * 20) * scale;
      const geometry = new THREE.SphereGeometry(radius, 16, 12);
      const material = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.15 + Math.random() * 0.1, wireframe: true });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set((Math.random() - 0.5) * 40 * scale, (Math.random() - 0.5) * 15 * scale, (Math.random() - 0.5) * 20 * scale);
      cloudGroup.add(sphere);
    }
    const coreGeometry = new THREE.SphereGeometry(20 * scale, 12, 8);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.08 });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    cloudGroup.add(core);
    (cloudGroup as any).animPhase = index * 0.5;
    return cloudGroup;
  }

  public update(dt: number): void {
    this.elapsedTime += dt;
    this.starMaterials.forEach((material, index) => {
      const baseOpacity = [0.8, 0.6, 0.5][index] || 0.6;
      material.opacity = baseOpacity + Math.sin(this.elapsedTime * (1.5 + index * 0.5) + index * 2) * (0.3 + index * 0.1);
    });
    this.clouds.children.forEach((cloud) => {
      const phase = (cloud as any).animPhase || 0;
      cloud.position.x += Math.sin(this.elapsedTime * 0.1 + phase) * 0.05;
      cloud.position.y += Math.sin(this.elapsedTime * 0.15 + phase) * 0.02;
      cloud.children.forEach((mesh) => {
        if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
          const baseOpacity = mesh.material.wireframe ? 0.18 : 0.08;
          mesh.material.opacity = baseOpacity + Math.sin(this.elapsedTime * 0.3 + phase) * 0.05;
        }
      });
    });
  }

  public dispose(): void {
    [this.buildings, this.mcpTower, this.clouds].forEach(group => {
      group.traverse(child => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        }
      });
      this.scene.remove(group);
    });
    this.starMaterials.forEach(m => m.dispose());
    if (this.starfield) this.scene.remove(this.starfield);
  }
}
