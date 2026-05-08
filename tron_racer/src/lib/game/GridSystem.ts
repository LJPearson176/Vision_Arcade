import * as THREE from "three";

export class GridSystem {
  private scene: THREE.Scene;
  private gridLines: THREE.Line[] = [];
  private gridWalls: THREE.Mesh[] = [];
  private wallLines: THREE.Line[] = [];
  private gridMaterial: THREE.ShaderMaterial;
  private wallMaterial: THREE.ShaderMaterial;
  private currentColorZone: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initMaterials();
    this.createVolumetricGrid();
    this.createBoundaryWalls();
  }

  // Custom shader for glowing, pulsing grid
  private initMaterials() {
    this.gridMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        pulseIntensity: { value: 0.5 },
        colorZone: { value: 0 }, // 0=cyan, 1=purple, 2=yellow
        opacity: { value: 0.6 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float pulseIntensity;
        uniform float colorZone;
        uniform float opacity;
        varying vec2 vUv;
        
        vec3 getZoneColor(float zone) {
          if (zone < 0.33) return vec3(0.0, 1.0, 1.0); // Cyan
          if (zone < 0.66) return vec3(0.5, 0.0, 1.0); // Purple
          return vec3(1.0, 1.0, 0.0); // Yellow
        }
        
        void main() {
          vec3 color = getZoneColor(colorZone);
          float pulse = 0.5 + 0.5 * sin(time * 2.0);
          float glow = mix(0.6, 1.0, pulse * pulseIntensity);
          gl_FragColor = vec4(color * glow, opacity);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.wallMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        colorZone: { value: 0 },
        opacity: { value: 0.3 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float colorZone;
        uniform float opacity;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        vec3 getZoneColor(float zone) {
          if (zone < 0.33) return vec3(0.0, 1.0, 1.0); // Cyan
          if (zone < 0.66) return vec3(0.5, 0.0, 1.0); // Purple
          return vec3(1.0, 1.0, 0.0); // Yellow
        }
        
        void main() {
          vec3 color = getZoneColor(colorZone);
          
          // Vertical scanning effect
          float scanline = sin(vPosition.y * 0.5 + time * 2.0) * 0.3 + 0.7;
          
          // Fade out towards top
          float heightFade = 1.0 - (vPosition.y / 20.0) * 0.5;
          
          // Edge glow
          float edgeGlow = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
          
          float finalOpacity = opacity * scanline * heightFade * (0.5 + edgeGlow * 0.5);
          gl_FragColor = vec4(color, finalOpacity);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
  }

  // Create volumetric grid with depth
  private createVolumetricGrid() {
    const lineSpacing = 10;
    const lineCount = 40;
    const lineWidth = 100;
    const gridHeight = -5; // Ground level

    // Horizontal grid lines (perpendicular to travel)
    for (let i = 0; i < lineCount; i++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array([
        -lineWidth / 2, gridHeight, -i * lineSpacing,
        lineWidth / 2, gridHeight, -i * lineSpacing
      ]);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geometry, this.gridMaterial.clone());
      this.gridLines.push(line);
      this.scene.add(line);
    }

    // Vertical grid lines (parallel to travel)
    const verticalLineCount = 10;
    for (let i = 0; i < verticalLineCount; i++) {
      const xPos = (i - verticalLineCount / 2) * (lineWidth / verticalLineCount);
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array([
        xPos, gridHeight, 50,
        xPos, gridHeight, -lineCount * lineSpacing
      ]);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geometry, this.gridMaterial.clone());
      this.gridLines.push(line);
      this.scene.add(line);
    }
  }

  // Boundary walls (Tron arena style)
  private createBoundaryWalls() {
    const wallHeight = 20;
    const wallDepth = 400;
    const trackWidth = 100;

    // Left wall - glowing barrier
    const leftWallGeometry = new THREE.PlaneGeometry(wallDepth, wallHeight);
    const leftWall = new THREE.Mesh(leftWallGeometry, this.wallMaterial.clone());
    leftWall.position.set(-trackWidth / 2, wallHeight / 2 - 5, -wallDepth / 2 + 50);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);
    this.gridWalls.push(leftWall);

    // Right wall
    const rightWallGeometry = new THREE.PlaneGeometry(wallDepth, wallHeight);
    const rightWall = new THREE.Mesh(rightWallGeometry, this.wallMaterial.clone());
    rightWall.position.set(trackWidth / 2, wallHeight / 2 - 5, -wallDepth / 2 + 50);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);
    this.gridWalls.push(rightWall);

    // Add vertical grid pattern to walls
    this.addWallGridPattern(trackWidth, wallHeight, wallDepth);
  }

  private addWallGridPattern(trackWidth: number, wallHeight: number, wallDepth: number) {
    const wallLineSpacing = 20;
    const wallLineCount = Math.floor(wallDepth / wallLineSpacing);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.4
    });

    // Vertical lines on left wall
    for (let i = 0; i < wallLineCount; i++) {
      const geometry = new THREE.BufferGeometry();
      const zPos = -i * wallLineSpacing + 50;
      const positions = new Float32Array([
        -trackWidth / 2, -5, zPos,
        -trackWidth / 2, wallHeight - 5, zPos
      ]);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geometry, lineMaterial.clone());
      this.scene.add(line);
      this.wallLines.push(line);
    }

    // Vertical lines on right wall
    for (let i = 0; i < wallLineCount; i++) {
      const geometry = new THREE.BufferGeometry();
      const zPos = -i * wallLineSpacing + 50;
      const positions = new Float32Array([
        trackWidth / 2, -5, zPos,
        trackWidth / 2, wallHeight - 5, zPos
      ]);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geometry, lineMaterial.clone());
      this.scene.add(line);
      this.wallLines.push(line);
    }

    // Horizontal lines on walls
    const horizontalLineCount = 8;
    for (let i = 0; i < horizontalLineCount; i++) {
      const yPos = (i * wallHeight / horizontalLineCount) - 5;
      
      // Left wall horizontal
      const leftGeometry = new THREE.BufferGeometry();
      const leftPositions = new Float32Array([
        -trackWidth / 2, yPos, 50,
        -trackWidth / 2, yPos, -wallDepth + 50
      ]);
      leftGeometry.setAttribute('position', new THREE.BufferAttribute(leftPositions, 3));
      const leftLine = new THREE.Line(leftGeometry, lineMaterial.clone());
      this.scene.add(leftLine);
      this.wallLines.push(leftLine);

      // Right wall horizontal
      const rightGeometry = new THREE.BufferGeometry();
      const rightPositions = new Float32Array([
        trackWidth / 2, yPos, 50,
        trackWidth / 2, yPos, -wallDepth + 50
      ]);
      rightGeometry.setAttribute('position', new THREE.BufferAttribute(rightPositions, 3));
      const rightLine = new THREE.Line(rightGeometry, lineMaterial.clone());
      this.scene.add(rightLine);
      this.wallLines.push(rightLine);
    }
  }

  // Color zone progression based on distance
  public updateColorZone(distance: number) {
    const zoneIndex = Math.floor(distance / 1000) % 3; // Change every 1km
    const colorZoneValue = zoneIndex / 3;

    // Only update if zone changed
    if (Math.abs(this.currentColorZone - colorZoneValue) > 0.01) {
      this.currentColorZone = colorZoneValue;
      console.log(`🎨 Color Zone Changed: ${zoneIndex === 0 ? 'CYAN' : zoneIndex === 1 ? 'PURPLE' : 'YELLOW'} (${distance}m)`);
      
      this.gridLines.forEach(line => {
        if (line.material instanceof THREE.ShaderMaterial) {
          line.material.uniforms.colorZone.value = colorZoneValue;
        }
      });

      this.gridWalls.forEach(wall => {
        if (wall.material instanceof THREE.ShaderMaterial) {
          wall.material.uniforms.colorZone.value = colorZoneValue;
        }
      });

      // Update wall line colors
      const color = zoneIndex === 0 ? 0x00ffff : zoneIndex === 1 ? 0x8000ff : 0xffff00;
      this.wallLines.forEach(line => {
        if (line.material instanceof THREE.LineBasicMaterial) {
          line.material.color.setHex(color);
        }
      });
    }
  }

  // Animation update (called every frame)
  public update(dt: number, gameSpeed: number) {
    const time = Date.now() * 0.001;

    // Update shader time uniform for pulsing effect
    this.gridLines.forEach(line => {
      if (line.material instanceof THREE.ShaderMaterial) {
        line.material.uniforms.time.value = time;
      }

      // Animate grid lines based on speed
      const positions = line.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 2] += gameSpeed * dt * 0.5;

        // Reset when line passes camera
        if (positions[i + 2] > 50) {
          positions[i + 2] -= 400;
        }
      }
      line.geometry.attributes.position.needsUpdate = true;
    });

    // Update wall shader time
    this.gridWalls.forEach(wall => {
      if (wall.material instanceof THREE.ShaderMaterial) {
        wall.material.uniforms.time.value = time;
      }
    });
  }

  // Cleanup
  public dispose() {
    this.gridLines.forEach(line => {
      line.geometry.dispose();
      if (line.material instanceof THREE.Material) {
        line.material.dispose();
      }
      this.scene.remove(line);
    });

    this.gridWalls.forEach(wall => {
      wall.geometry.dispose();
      if (wall.material instanceof THREE.Material) {
        wall.material.dispose();
      }
      this.scene.remove(wall);
    });

    this.wallLines.forEach(line => {
      line.geometry.dispose();
      if (line.material instanceof THREE.Material) {
        line.material.dispose();
      }
      this.scene.remove(line);
    });
  }
}
