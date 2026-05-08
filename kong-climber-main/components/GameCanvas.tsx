
import React, { useRef, useEffect } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { VisionService } from '../services/visionService';
import { GameState, VisionInput, Player, Point, Entity } from '../types';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, BUILDING_WIDTH } from '../constants';

interface GameCanvasProps {
  visionService: VisionService;
  gameState: GameState;
  setGameState: (state: GameState) => void;
  onStatsUpdate: (stats: any) => void;
  debugMode: boolean;
  debugCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
  visionService, gameState, setGameState, onStatsUpdate, debugMode, debugCanvasRef
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine>(new GameEngine());
  const requestRef = useRef<number>();
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState === GameState.PLAYING && engineRef.current.state !== GameState.PLAYING) {
      engineRef.current.state = GameState.PLAYING;
      engineRef.current.reset();
      engineRef.current.state = GameState.PLAYING; 
    }

    const render = () => {
      const input = visionService.process();
      
      if (gameState === GameState.PLAYING) {
        engineRef.current.update(input);
        
        if (engineRef.current.state === GameState.GAME_OVER) {
          setGameState(GameState.GAME_OVER);
        }
        
        onStatsUpdate({
          score: engineRef.current.player.score,
          stamina: engineRef.current.player.stamina,
          height: Math.floor(engineRef.current.player.distanceTraveled / 10),
          impulse: input.climbImpulse
        });
      }

      // Draw Main Game
      draw(ctx, engineRef.current, input);

      // Draw Debug Overlay (MiniCam)
      if (debugMode && debugCanvasRef.current) {
         const debugCtx = debugCanvasRef.current.getContext('2d');
         if (debugCtx) {
           drawDebugOverlay(debugCtx, visionService.getVideo(), input, engineRef.current);
         }
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [gameState, visionService, debugMode]);

  const drawDebugOverlay = (
    ctx: CanvasRenderingContext2D, 
    video: HTMLVideoElement | null, 
    input: VisionInput,
    engine: GameEngine
  ) => {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // 1. Clear & Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw Video Feed
    if (video) {
      ctx.save();
      // Mirror the video to match user expectation (moving left moves left on screen)
      ctx.scale(-1, 1); 
      ctx.drawImage(video, -w, 0, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '14px monospace';
      ctx.fillText("WAITING FOR CAMERA...", w/2, h/2);
    }

    // 3. Draw Skeleton / Landmarks (Pose)
    if (input.rawLandmarks) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      input.rawLandmarks.forEach((landmarks: any[]) => {
        const poseConnections = PoseConnections; 
        
        ctx.strokeStyle = '#00ff00'; // Bright Green
        ctx.beginPath();
        for (const [start, end] of poseConnections) {
          const p1 = landmarks[start];
          const p2 = landmarks[end];
          // Mirror points
          ctx.moveTo((1 - p1.x) * w, p1.y * h);
          ctx.lineTo((1 - p2.x) * w, p2.y * h);
        }
        ctx.stroke();

        // Draw points (Joints)
        ctx.fillStyle = '#ffff00'; // Yellow
        landmarks.forEach((p: any) => {
          ctx.beginPath();
          ctx.arc((1 - p.x) * w, p.y * h, 3, 0, Math.PI * 2);
          ctx.fill();
        });

        // Visualize Posture Logic
        // Draw Center line based on shoulders
        const lSh = landmarks[11];
        const rSh = landmarks[12];
        const cx = (lSh.x + rSh.x) / 2;
        ctx.strokeStyle = '#38bdf8'; // Blue
        ctx.beginPath();
        ctx.moveTo((1 - cx) * w, 0);
        ctx.lineTo((1 - cx) * w, h);
        ctx.stroke();
      });
    }

    // 4. Draw Stats Text Overlay
    // Bottom overlay background
    const overlayHeight = 70;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, h - overlayHeight, w, overlayHeight);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const xBase = 10;
    let yBase = h - overlayHeight + 8;
    const step = 14;
    
    // Status Lines
    ctx.fillText(`STATE: ${engine.player.spriteState}`, xBase, yBase);
    yBase += step;
    ctx.fillText(`IMPULSE: ${input.climbImpulse.toFixed(2)}`, xBase, yBase);
    yBase += step;
    
    const lean = engine.player.lean.toFixed(2);
    ctx.fillText(`LEAN: ${lean}`, xBase, yBase);
    
    yBase += step;
    ctx.fillStyle = input.handsDetected ? '#4ade80' : '#f87171';
    ctx.fillText(`TRACKING: ${input.handsDetected ? 'OK' : 'LOST'}`, xBase, yBase);
  };

  const drawParallaxSky = (ctx: CanvasRenderingContext2D, engine: GameEngine) => {
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;
    const scroll = engine.cameraY;

    // 1. Sky Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#020617'); // slate-950 (Space)
    gradient.addColorStop(1, '#1e293b'); // slate-800 (Horizon)
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // 2. Stars (Slow scroll)
    const starSpeed = 0.05;
    const starOffset = scroll * starSpeed;
    
    ctx.fillStyle = '#ffffff';
    for(let i=0; i<60; i++) {
        const x = (i * 137) % w; 
        const yBase = (i * 211) % h;
        const y = (yBase + starOffset) % h;
        const size = (i % 3) + 1;
        ctx.globalAlpha = 0.3 + ((i % 5)/10);
        ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1.0;

    // 3. Clouds (Background - Slow)
    const cloudSpeed = 0.1;
    const cloudOffset = scroll * cloudSpeed;
    
    ctx.fillStyle = '#475569'; // slate-600
    for(let i=0; i<6; i++) {
        const x = ((i * 300) + (scroll * 0.02)) % (w + 400) - 200; 
        const yBase = (i * 180) % (h + 200);
        const y = (yBase + cloudOffset) % (h + 300) - 100;
        
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.ellipse(x, y, 80 + (i*10), 30 + (i*5), 0, 0, Math.PI*2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    
    // 4. Distant City Skyline (Moves down and disappears)
    if (scroll < 1200) {
        const cityY = h - 150 + (scroll * 0.5); // Parallax factor 0.5
        if (cityY < h) {
             ctx.fillStyle = '#0f172a'; // Dark silhouette
             ctx.beginPath();
             ctx.moveTo(0, h);
             ctx.lineTo(0, cityY);
             
             // Draw jagged skyline
             for(let i=0; i<=20; i++) {
                 const step = w/20;
                 const hRandom = ((i * 9301 + 49297) % 80);
                 const x = i * step;
                 ctx.lineTo(x, cityY - hRandom);
                 ctx.lineTo(x + step, cityY - hRandom);
             }
             ctx.lineTo(w, cityY);
             ctx.lineTo(w, h);
             ctx.fill();
        }
    }
  };

  const drawMidgroundCity = (ctx: CanvasRenderingContext2D, engine: GameEngine) => {
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;
    const scroll = engine.cameraY;
    
    // Parallax scrolling for side buildings (City Canyon effect)
    const pFactor = 0.6; // Moves faster than sky, slower than main building
    const pScroll = scroll * pFactor;
    
    const patternH = 800;
    const offset = pScroll % patternH;
    const yStart = offset;

    // Draw pattern repeated to cover screen
    // We draw relative to the parallax scroll
    [-1, 0, 1].forEach(i => {
        const yBase = yStart + (i * patternH);
        
        // Don't draw if completely off screen
        if (yBase > h || yBase + patternH < 0) return;

        // --- Left Neighbors ---
        ctx.fillStyle = '#1e293b'; // slate-800
        ctx.fillRect(0, yBase + 100, 120, 700); // Tall block
        ctx.fillStyle = '#334155'; // Window grid (dim)
        for(let r=0; r<10; r++) {
            if (r%2===0) ctx.fillRect(20, yBase + 120 + (r*60), 20, 40);
            ctx.fillRect(60, yBase + 120 + (r*60), 20, 40);
        }

        ctx.fillStyle = '#1e293b'; 
        ctx.fillRect(80, yBase - 150, 100, 600); // Back layer block
        
        // --- Right Neighbors ---
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(w - 140, yBase + 50, 140, 750);
        ctx.fillStyle = '#334155'; // Window grid
        for(let r=0; r<12; r++) {
            ctx.fillRect(w - 100, yBase + 70 + (r*50), 60, 30);
        }

        ctx.fillStyle = '#0f172a'; // Darker back block
        ctx.fillRect(w - 200, yBase - 200, 120, 500);
    });
  };

  const drawBuilding = (ctx: CanvasRenderingContext2D, engine: GameEngine) => {
    const buildingX = (GAME_WIDTH - BUILDING_WIDTH) / 2;
    const brickH = 40;
    const brickW = 60;
    const scrollY = engine.cameraY % brickH;
    const w = BUILDING_WIDTH;
    const h = GAME_HEIGHT;

    // 1. Base Building Color
    ctx.fillStyle = '#4a2c2a'; // Dark Reddish-Brown Brick
    ctx.fillRect(buildingX, 0, w, h);

    // 2. Brick Texture (Mortar lines)
    ctx.strokeStyle = '#2d1b19'; // Darker mortar
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let y = scrollY - brickH; y < h; y += brickH) {
        // Horizontal
        ctx.moveTo(buildingX, y);
        ctx.lineTo(buildingX + w, y);

        // Vertical
        const row = Math.floor((y - scrollY) / brickH);
        const isOffset = (row % 2) !== 0;
        const xStart = isOffset ? buildingX - (brickW/2) : buildingX;
        
        for (let x = xStart; x < buildingX + w; x += brickW) {
            if (x > buildingX) {
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + brickH);
            }
        }
    }
    ctx.stroke();

    // 3. Industrial Details (Pipes & Vents)
    const pipeOffset = engine.cameraY % 100;
    ctx.fillStyle = '#44403c'; // Dark metal
    // Left Pipe
    ctx.fillRect(buildingX + 30, 0, 10, h);
    // Right Pipe
    ctx.fillRect(buildingX + w - 40, 0, 10, h);
    
    // Pipe Joints
    for(let y = pipeOffset - 100; y < h; y += 100) {
        ctx.fillStyle = '#78716c'; // Lighter joint
        ctx.fillRect(buildingX + 28, y, 14, 10);
        ctx.fillRect(buildingX + w - 42, y, 14, 10);
    }
    
    // Side Pillars (Concrete) - Overlaying edges
    const pillarWidth = 25;
    ctx.fillStyle = '#1c1917'; // Dark stone
    ctx.fillRect(buildingX, 0, pillarWidth, h);
    ctx.fillRect(buildingX + w - pillarWidth, 0, pillarWidth, h);

    // Pillar Highlights
    ctx.fillStyle = '#44403c';
    ctx.fillRect(buildingX + pillarWidth - 4, 0, 2, h); 
    ctx.fillRect(buildingX + w - pillarWidth + 2, 0, 2, h);
  };

  const drawAtmosphere = (ctx: CanvasRenderingContext2D, engine: GameEngine) => {
      const h = GAME_HEIGHT;
      // Gradient fog from bottom
      const grad = ctx.createLinearGradient(0, h - 300, 0, h);
      grad.addColorStop(0, 'rgba(15, 23, 42, 0)'); // Transparent
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.6)'); // Slate fog
      ctx.fillStyle = grad;
      ctx.fillRect(0, h - 300, GAME_WIDTH, 300);
      
      // Floating Foreground Clouds (Fast, transparent)
      const scroll = engine.cameraY;
      const cloudSpeed = 0.4;
      const cloudOffset = scroll * cloudSpeed;
      
      ctx.fillStyle = '#cbd5e1'; // Lighter cloud
      for(let i=0; i<4; i++) {
        const x = ((i * 400) + (scroll * 0.1) + 100) % (GAME_WIDTH + 600) - 300; 
        const yBase = (i * 250) % h;
        const y = (yBase + cloudOffset) % (h + 200) - 100;
        
        ctx.globalAlpha = 0.1; // Very subtle
        ctx.beginPath();
        ctx.ellipse(x, y, 120, 50, 0, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
  };

  const drawStreet = (ctx: CanvasRenderingContext2D, engine: GameEngine) => {
    const scroll = engine.cameraY;
    
    // The visual "Floor" of the world initially (Sidewalk Top)
    // Initially near bottom of screen
    const floorY = GAME_HEIGHT - 60 + scroll; 
    
    // If floor is way off screen, don't draw
    if (floorY > GAME_HEIGHT + 400) return;

    // 1. Sidewalk
    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.fillRect(0, floorY, GAME_WIDTH, 60);
    
    // Curb highlight
    ctx.fillStyle = '#cbd5e1'; // slate-300
    ctx.fillRect(0, floorY, GAME_WIDTH, 5);
    ctx.fillStyle = '#64748b'; // slate-500 (Curb side)
    ctx.fillRect(0, floorY + 5, GAME_WIDTH, 5);

    // 2. Road (Asphalt)
    ctx.fillStyle = '#1e293b'; // slate-800
    ctx.fillRect(0, floorY + 60, GAME_WIDTH, 200); // Extends down

    // Road Lines
    ctx.strokeStyle = '#fbbf24'; // amber-400
    ctx.lineWidth = 4;
    ctx.setLineDash([40, 40]);
    ctx.beginPath();
    ctx.moveTo(0, floorY + 140);
    ctx.lineTo(GAME_WIDTH, floorY + 140);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Building Entrance (Centered on building)
    const buildingX = (GAME_WIDTH - BUILDING_WIDTH) / 2;
    const doorH = 120;
    const doorW = 100;
    const doorX = buildingX + (BUILDING_WIDTH - doorW) / 2;
    const doorY = floorY - doorH;

    // Door Frame
    ctx.fillStyle = '#1c1917'; // Stone color like pillars
    ctx.fillRect(doorX - 10, doorY - 10, doorW + 20, doorH + 10);

    // Glass Interior
    ctx.fillStyle = '#0ea5e9'; // sky-500 (Glass)
    ctx.fillRect(doorX, doorY, doorW, doorH);
    
    // Reflections
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(doorX, doorY + doorH);
    ctx.lineTo(doorX + doorW, doorY);
    ctx.lineTo(doorX + doorW/2, doorY);
    ctx.lineTo(doorX, doorY + doorH/2);
    ctx.fill();

    // Divider
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(doorX + doorW/2 - 2, doorY, 4, doorH);
    
    // Handles
    ctx.fillStyle = '#facc15'; // Gold
    ctx.fillRect(doorX + doorW/2 - 12, doorY + doorH/2, 8, 20);
    ctx.fillRect(doorX + doorW/2 + 4, doorY + doorH/2, 8, 20);

    // Entrance Canopy / Awning
    ctx.fillStyle = '#b91c1c'; // Red Awning
    ctx.beginPath();
    ctx.moveTo(doorX - 20, doorY - 10);
    ctx.lineTo(doorX + doorW + 20, doorY - 10);
    ctx.lineTo(doorX + doorW + 30, doorY + 30);
    ctx.lineTo(doorX - 30, doorY + 30);
    ctx.fill();
    
    // Awning Stripes
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for(let i=0; i<10; i++) {
        if(i%2===0) {
             const startX = (doorX - 30) + (i * ((doorW+60)/10));
             const w = ((doorW+60)/10);
             ctx.beginPath();
             ctx.moveTo(startX + 10, doorY - 10); // Perspective shift approx
             ctx.lineTo(startX + w + 10, doorY - 10);
             ctx.lineTo(startX + w, doorY + 30);
             ctx.lineTo(startX, doorY + 30);
             ctx.fill();
        }
    }
  };

  const draw = (ctx: CanvasRenderingContext2D, engine: GameEngine, input: VisionInput) => {
    // 1. Background (Parallax Sky)
    drawParallaxSky(ctx, engine);
    
    // 2. Midground (City Canyon)
    drawMidgroundCity(ctx, engine);

    // 3. Game World (Building)
    drawBuilding(ctx, engine);
    
    // 4. Entities (Obstacles, Windows) - Drawn BEFORE street so awning can cover them
    engine.entities.forEach(e => {
      if (!e.active) return;
      ctx.fillStyle = e.color || '#fff';
      
      if (e.subtype === 'WINDOW') {
        ctx.fillRect(e.x, e.y, e.width, e.height);
        // Window glint
        if (e.color === COLORS.WINDOW_ON) {
           ctx.fillStyle = 'rgba(255,255,255,0.3)';
           ctx.beginPath();
           ctx.moveTo(e.x, e.y);
           ctx.lineTo(e.x + 10, e.y);
           ctx.lineTo(e.x, e.y + 10);
           ctx.fill();
        }
      } else if (e.type === 'OBSTACLE') {
         drawHelicopter(ctx, e);
      } else {
        ctx.fillRect(e.x, e.y, e.width, e.height);
      }
    });

    // 5. Street Layer (Foreground) - Drawn AFTER entities to layer ON TOP
    drawStreet(ctx, engine);

    // 6. Player (Kong)
    drawPlayer(ctx, engine.player);

    // 7. Atmospheric Overlay (Foreground Clouds/Fog)
    drawAtmosphere(ctx, engine);

    // 8. Particles
    engine.particles.forEach(pt => {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = pt.life / pt.maxLife;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });
  };
  
  const drawHelicopter = (ctx: CanvasRenderingContext2D, e: Entity) => {
    const { x, y, width: w, height: h, color, velocity } = e;
    const isMovingLeft = (velocity?.x || 0) < 0;
    const time = Date.now();

    ctx.save();
    ctx.translate(x + w/2, y + h/2);
    if (isMovingLeft) ctx.scale(-1, 1);

    // Body
    ctx.fillStyle = color || '#f00';
    ctx.beginPath();
    ctx.ellipse(0, 0, w/2, h/2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Window
    ctx.fillStyle = '#bef264';
    ctx.beginPath();
    ctx.ellipse(w/5, -h/8, w/4, h/5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.fillStyle = color || '#f00';
    ctx.fillRect(-w/2 - w/3, -h/8, w/2, h/4);

    // Tail Rotor
    ctx.fillStyle = '#ccc';
    const tailSpin = Math.sin(time * 0.05);
    ctx.fillRect(-w + 5, -h/2 + (tailSpin * 5), 5, 20);

    // Skids
    ctx.strokeStyle = '#94a3b8'; 
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w/4, h/3);
    ctx.lineTo(-w/4, h/2);
    ctx.moveTo(w/4, h/3);
    ctx.lineTo(w/4, h/2);
    ctx.moveTo(-w/2, h/2);
    ctx.lineTo(w/2, h/2);
    ctx.stroke();

    // Main Rotor
    ctx.fillStyle = '#e2e8f0';
    const rotorWidth = Math.sin(time * 0.1) * (w * 1.4);
    ctx.fillRect(-2, -h/2 - 5, 4, 5);
    ctx.fillStyle = `rgba(255, 255, 255, 0.5)`;
    ctx.beginPath();
    ctx.ellipse(0, -h/2 - 5, Math.abs(rotorWidth), 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const solveIK = (p1: Point, target: Point, length1: number, length2: number, bendDirection: number): Point => {
    const dx = target.x - p1.x;
    const dy = target.y - p1.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    
    // Safety: prevent stretching beyond reach
    const maxReach = length1 + length2;
    // Don't fully straighten to keep "muscle" tension look, cap at 99%
    if (dist > maxReach * 0.99) {
       dist = maxReach * 0.99;
    }

    const l1 = length1;
    const l2 = length2;
    // Law of Cosines to find elbow angle
    const cosAngle = (l1*l1 + dist*dist - l2*l2) / (2 * l1 * dist);
    // Clamp for float errors
    const clampedCos = Math.max(-1, Math.min(1, cosAngle));
    const angleOffset = Math.acos(clampedCos);
    const angleBase = Math.atan2(dy, dx);
    const totalAngle = angleBase + (angleOffset * bendDirection);
    
    return {
      x: p1.x + Math.cos(totalAngle) * l1,
      y: p1.y + Math.sin(totalAngle) * l1
    };
  };

  // Draws a "hairy" limb by drawing a thick jagged line
  const drawFurryLimb = (ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string, bendDir: number, handState: 'OPEN' | 'CLOSED' = 'CLOSED') => {
    const armLength = 30; // Longer gorilla arms
    const forearmLength = 30;
    const elbow = solveIK(start, end, armLength, forearmLength, bendDir);

    ctx.strokeStyle = color;
    ctx.lineWidth = 18; // Very thick arms
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Base bone structure
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Elbow Tuft
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(elbow.x, elbow.y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // HANDS
    ctx.fillStyle = '#262626'; // Dark skin for hands
    
    if (handState === 'CLOSED') {
        // FIST
        ctx.beginPath();
        ctx.arc(end.x, end.y, 12, 0, Math.PI*2);
        ctx.fill();
    } else {
        // OPEN PALM (Swatting)
        ctx.beginPath();
        ctx.arc(end.x, end.y, 8, 0, Math.PI*2);
        ctx.fill();
        
        // Fingers spreading out from end point
        ctx.strokeStyle = '#262626';
        ctx.lineWidth = 4;
        const angle = bendDir === 1 ? 0 : Math.PI; 
        for(let i=-1; i<=1; i++) {
           ctx.beginPath();
           ctx.moveTo(end.x, end.y);
           ctx.lineTo(end.x + (bendDir * 15), end.y + (i * 8)); 
           ctx.stroke();
        }
    }
  };

  const drawFurryRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      // Simple "noise" for fur edges without heavy computation
      const jitter = () => (Math.random() - 0.5) * 4;
      
      ctx.moveTo(x + jitter(), y + jitter());
      ctx.lineTo(x + w + jitter(), y + jitter()); // Top Edge
      ctx.lineTo(x + w + jitter(), y + h + jitter()); // Right Edge
      ctx.lineTo(x + jitter(), y + h + jitter()); // Bottom Edge
      ctx.lineTo(x + jitter(), y + jitter()); // Left Edge
      ctx.fill();
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, p: Player) => {
    ctx.save();
    
    const centerX = p.x + p.width / 2;
    const centerY = p.y + p.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(p.lean);
    
    const w = p.width; // Base width
    const h = p.height;
    
    const isHit = p.spriteState === 'HIT';
    if (isHit) {
        ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
    }
    
    // Ape Colors
    const furColor = '#0a0a0a'; // Almost Black
    const skinColor = '#262626'; // Dark Grey
    
    // --- LEGS ---
    // Short, stout legs for a gorilla
    const legRange = 10;
    const leftLegY = h/2 + 25 + Math.sin(p.climbPhase + Math.PI) * legRange;
    const rightLegY = h/2 + 25 + Math.sin(p.climbPhase) * legRange;
    const hipY = h/4;
    // Shorter IK for legs
    drawFurryLimb(ctx, {x: -w/3, y: hipY}, {x: -w/2, y: leftLegY}, furColor, 1);
    drawFurryLimb(ctx, {x: w/3, y: hipY}, {x: w/2, y: rightLegY}, furColor, -1);

    // --- TORSO ---
    // Massive upper body, narrow waist
    ctx.fillStyle = furColor;
    ctx.beginPath();
    const shoulderWidth = w * 1.4;
    const waistWidth = w * 0.8;
    // Trapezoid shape
    ctx.moveTo(-shoulderWidth/2, -h/2); // Top Left
    ctx.lineTo(shoulderWidth/2, -h/2);  // Top Right
    ctx.lineTo(waistWidth/2, h/2);      // Bottom Right
    ctx.lineTo(-waistWidth/2, h/2);     // Bottom Left
    ctx.fill();

    // Chest Definition (Pecs)
    ctx.fillStyle = '#171717'; // Slightly lighter black
    ctx.beginPath();
    ctx.roundRect(-shoulderWidth/4, -h/3, shoulderWidth/2, h/3, 5);
    ctx.fill();

    // --- HEAD ---
    // Tucked into shoulders
    const headY = -h/2 - 5;
    
    // Cranium
    ctx.fillStyle = furColor;
    ctx.beginPath();
    ctx.arc(0, headY, 22, 0, Math.PI*2);
    ctx.fill();

    // Brow Ridge (Prominent)
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.ellipse(0, headY - 5, 16, 10, 0, 0, Math.PI*2);
    ctx.fill();

    // Muzzle (Protruding)
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.ellipse(0, headY + 8, 12, 10, 0, 0, Math.PI*2);
    ctx.fill();

    // Mouth Animation (Chewing if Eating)
    if (p.spriteState === 'EATING' && Math.sin(Date.now() / 100) > 0) {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, headY + 10, 6, 4, 0, 0, Math.PI*2);
        ctx.fill();
    }

    // Nostrils
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-4, headY + 6, 2, 0, Math.PI*2);
    ctx.arc(4, headY + 6, 2, 0, Math.PI*2);
    ctx.fill();

    // Eyes (Angry/Focused)
    ctx.fillStyle = '#fff'; // White sclera
    ctx.beginPath();
    ctx.ellipse(-7, headY - 4, 3, 2, 0.3, 0, Math.PI*2);
    ctx.ellipse(7, headY - 4, 3, 2, -0.3, 0, Math.PI*2);
    ctx.fill();
    // Pupils
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-7, headY - 4, 1, 0, Math.PI*2);
    ctx.arc(7, headY - 4, 1, 0, Math.PI*2);
    ctx.fill();


    // --- ARMS ---
    // Shoulders attach high and wide
    const shL = { x: -shoulderWidth/2 + 5, y: -h/2 + 10 };
    const shR = { x: shoulderWidth/2 - 5, y: -h/2 + 10 };
    
    const hL = { x: -w - 10, y: p.leftHandY };
    let hR = { x: w + 10, y: p.rightHandY };

    // EATING ANIMATION OVERRIDE
    if (p.spriteState === 'EATING') {
        // Bring right hand to mouth visual position
        hR.x = 10;
        hR.y = headY + 15;
    }

    drawFurryLimb(ctx, shL, hL, furColor, -1, p.handState.left); 
    drawFurryLimb(ctx, shR, hR, furColor, 1, p.handState.right); 

    // DRAW BANANA if Eating
    if (p.spriteState === 'EATING') {
        ctx.fillStyle = '#facc15'; // Banana Yellow
        ctx.beginPath();
        // Draw banana in hand
        ctx.ellipse(hR.x - 5, hR.y - 5, 10, 4, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        // Stem
        ctx.strokeStyle = '#654321'; // Brown
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hR.x - 12, hR.y - 12);
        ctx.lineTo(hR.x - 8, hR.y - 8);
        ctx.stroke();
    }

    // --- SWAT VISUALS ---
    // Draw "Whoosh" lines if swatting
    if (p.swatting.left) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(hL.x, hL.y, 30, Math.PI, Math.PI * 1.5);
        ctx.stroke();
    }
    if (p.swatting.right) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(hR.x, hR.y, 30, Math.PI * 1.5, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
  };

  return (
    <canvas 
      ref={canvasRef} 
      width={GAME_WIDTH} 
      height={GAME_HEIGHT}
      className="border-4 border-slate-700 rounded-lg shadow-2xl bg-black max-w-full h-auto"
    />
  );
};

// Pose Landmarks subset relevant for drawing
const PoseConnections = [
  [11, 12], // Shoulders
  [11, 13], [13, 15], // Left Arm
  [12, 14], [14, 16], // Right Arm
  [11, 23], [12, 24], // Torso sides
  [23, 24]  // Hips
];
