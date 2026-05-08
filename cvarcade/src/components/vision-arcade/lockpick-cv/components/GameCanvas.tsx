
import React, { useRef, useEffect } from 'react';
import { LockState, Pin, PinState, PickTool, PickShape } from '../types';
import { COLORS, DIMENSIONS } from '../constants';

interface GameCanvasProps {
  gameState: LockState;
  currentPick: PickTool;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, currentPick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Helper: Draw a metallic cylinder with gradients
  const drawCylinder = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colorType: 'brass' | 'chrome' | 'key' | 'driver') => {
    const gradient = ctx.createLinearGradient(x, y, x + w, y);
    
    if (colorType === 'brass' || colorType === 'key' || colorType === 'driver') {
        // Brass/Gold gradient
        gradient.addColorStop(0, COLORS.brassStart);
        gradient.addColorStop(0.3, COLORS.brassMid);
        gradient.addColorStop(0.5, '#fff'); // Specular highlight
        gradient.addColorStop(0.7, COLORS.brassMid);
        gradient.addColorStop(1, COLORS.brassEnd);
    } else {
        // Chrome/Silver gradient
        gradient.addColorStop(0, COLORS.chromeStart);
        gradient.addColorStop(0.4, COLORS.chromeMid);
        gradient.addColorStop(0.5, '#fff');
        gradient.addColorStop(0.6, COLORS.chromeMid);
        gradient.addColorStop(1, COLORS.chromeEnd);
    }

    ctx.fillStyle = gradient;
    
    // Rounded corners for pins look nicer
    const r = w / 4; 
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [2, 2, 2, 2]);
    ctx.fill();
    
    // Subtle outline
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const drawShackle = (ctx: CanvasRenderingContext2D, lockX: number, lockY: number) => {
    const shackleW = DIMENSIONS.lockWidth * 0.7;
    const shackleH = 120;
    const thickness = DIMENSIONS.shackleThickness;
    const leftX = lockX + (DIMENSIONS.lockWidth - shackleW) / 2;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const gradient = ctx.createLinearGradient(leftX, 0, leftX + thickness, 0);
    gradient.addColorStop(0, '#334155');
    gradient.addColorStop(0.4, '#e2e8f0');
    gradient.addColorStop(1, '#1e293b');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = thickness;

    const topY = lockY - 80;

    ctx.beginPath();
    ctx.moveTo(leftX, lockY); 
    ctx.lineTo(leftX, topY);
    ctx.arc(lockX + DIMENSIONS.lockWidth/2, topY, shackleW/2, Math.PI, 0);
    ctx.lineTo(leftX + shackleW, lockY);
    ctx.stroke();
    
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(leftX + shackleW - thickness/2, lockY - 15, thickness, 8);
  };

  const drawPinStack = (ctx: CanvasRenderingContext2D, x: number, y: number, pin: Pin, time: number) => {
    let visualOffsetY = 0;
    if (pin.state === PinState.RESTING && pin.currentLift < 0.05) {
        const t = time * 0.002;
        const phase = pin.id * 1337;
        visualOffsetY = (Math.sin(t + phase) + Math.sin(t * 1.5 + phase)) * 0.8;
    } else if (pin.state === PinState.BINDING) {
        if (Math.random() > 0.7) visualOffsetY = (Math.random() - 0.5) * 1.2;
    }

    const liftPx = (pin.currentLift * DIMENSIONS.pinMaxLift) - visualOffsetY;
    
    // --- SPRING ---
    const springTopY = y - 100; 
    const driverTopY = y - liftPx - pin.driverPinHeight;
    const springHeight = Math.max(0, driverTopY - springTopY);

    ctx.strokeStyle = '#94a3b8'; 
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    const coils = 12;
    const coilHeight = springHeight / coils;
    
    ctx.moveTo(x + 4, springTopY);
    if (springHeight > 5) {
        for(let i=0; i<coils; i++) {
            const cy = springTopY + (i * coilHeight);
            ctx.lineTo(x + DIMENSIONS.pinWidth - 4, cy + (coilHeight * 0.5));
            ctx.lineTo(x + 4, cy + coilHeight);
        }
    } else {
        ctx.lineTo(x + DIMENSIONS.pinWidth - 4, springTopY + springHeight);
    }
    ctx.stroke();

    // --- DRIVER PIN ---
    const driverY = y - liftPx - pin.driverPinHeight;
    drawCylinder(ctx, x, driverY, DIMENSIONS.pinWidth, pin.driverPinHeight, 'driver');

    // --- KEY PIN ---
    const keyY = y - liftPx;
    if (pin.state === PinState.SET) {
        ctx.shadowColor = COLORS.success;
        ctx.shadowBlur = 10;
    } else if (pin.state === PinState.BINDING) {
        ctx.shadowColor = COLORS.highlight;
        ctx.shadowBlur = 5;
    } else if (pin.state === PinState.OVERSET) {
        ctx.shadowColor = COLORS.fail;
        ctx.shadowBlur = 10;
    }

    drawCylinder(ctx, x, keyY, DIMENSIONS.pinWidth, pin.keyPinHeight, 'key');
    ctx.shadowBlur = 0; 
  };

  const drawTorqueMeter = (ctx: CanvasRenderingContext2D, torque: number, x: number, y: number) => {
    const radius = 40;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const maxAngle = startAngle + (endAngle - startAngle) * torque;

    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; 
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, maxAngle);
    ctx.strokeStyle = torque > 0.75 ? COLORS.fail : (torque > 0.4 ? COLORS.brassMid : COLORS.highlight);
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText("TENSION", x, y + 20);
  };

  // Helper to draw specific pick geometries
  // (x,y) is the physics interaction point (the tip top surface)
  const drawPickHead = (ctx: CanvasRenderingContext2D, x: number, y: number, type: PickShape) => {
    ctx.beginPath();
    
    switch (type) {
        case 'short-hook':
            // Classic hook
            ctx.moveTo(x, y); // Tip
            ctx.lineTo(x - 2, y + 2);
            ctx.quadraticCurveTo(x - 5, y + 8, x - 15, y + 8); // Neck
            break;
        case 'deep-hook':
            // Steep hook
            ctx.moveTo(x, y); // Tip
            ctx.lineTo(x - 2, y + 2);
            ctx.bezierCurveTo(x - 3, y + 15, x - 8, y + 25, x - 25, y + 22); // Deep curve
            break;
        case 'offset-hybrid':
            // Rounded
             ctx.moveTo(x, y); 
             ctx.arc(x - 4, y + 4, 4, -Math.PI/4, Math.PI, true); 
             ctx.lineTo(x - 18, y + 8);
             break;
        case 'half-diamond':
             // Triangle
             ctx.moveTo(x, y); // Top point
             ctx.lineTo(x - 8, y + 12); // Left base
             ctx.lineTo(x + 8, y + 12); // Right base
             ctx.lineTo(x, y); // Close
             ctx.moveTo(x - 8, y + 12);
             ctx.lineTo(x - 20, y + 12); // Neck
             break;
        case 'snake-rake':
             // Wavy
             ctx.moveTo(x, y);
             ctx.bezierCurveTo(x - 5, y + 6, x - 10, y - 4, x - 15, y);
             ctx.bezierCurveTo(x - 20, y + 6, x - 25, y - 4, x - 30, y + 2);
             break;
        case 'city-rake':
             // Jagged
             ctx.moveTo(x, y);
             ctx.lineTo(x - 6, y + 6);
             ctx.lineTo(x - 10, y); // Peak
             ctx.lineTo(x - 16, y + 6);
             ctx.lineTo(x - 20, y); // Peak
             ctx.lineTo(x - 26, y + 6);
             break;
        default:
             ctx.moveTo(x, y);
             ctx.lineTo(x - 15, y + 5);
             break;
    }
    ctx.stroke();
    
    // Return approximate neck position for shaft connection
    return { x: x - 20, y: y + 20 };
  };

  const render = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear & Background
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 50, canvas.width/2, canvas.height/2, 400);
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0, canvas.width, canvas.height);

    const lockX = 100;
    const lockY = 200;

    drawShackle(ctx, lockX, lockY);

    // Body
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(lockX - 10, lockY - 110, DIMENSIONS.lockWidth + 20, DIMENSIONS.lockHeight + 40, 8);
    ctx.fillStyle = COLORS.lockBodyFill;
    ctx.fill();
    ctx.strokeStyle = COLORS.lockBodyBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Chambers
    ctx.fillStyle = COLORS.lockChamber;
    gameState.pins.forEach((pin, i) => {
        const pinX = lockX + 50 + (i * DIMENSIONS.pinSpacing);
        ctx.beginPath();
        ctx.roundRect(pinX - 2, lockY - 105, DIMENSIONS.pinWidth + 4, 150, 2);
        ctx.fill();
    });
    
    // Shear Line
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; 
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lockX, lockY);
    ctx.lineTo(lockX + DIMENSIONS.lockWidth, lockY);
    ctx.stroke();

    // Plug
    ctx.save();
    const coreCenterX = lockX + DIMENSIONS.lockWidth/2;
    const coreCenterY = lockY + 25; 
    ctx.translate(coreCenterX, coreCenterY);
    ctx.rotate(gameState.coreRotation * Math.PI / 180);
    ctx.translate(-coreCenterX, -coreCenterY);

    drawCylinder(ctx, lockX, lockY, DIMENSIONS.lockWidth, 50, 'brass');

    // Pins
    gameState.pins.forEach((pin, i) => {
        const pinX = lockX + 50 + (i * DIMENSIONS.pinSpacing);
        drawPinStack(ctx, pinX, lockY, pin, time);
    });

    // Tension Wrench
    const wrenchX = lockX + 10;
    const wrenchY = lockY + 15;
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.roundRect(wrenchX - 40, wrenchY, 50, 10, 2); 
    ctx.roundRect(wrenchX, wrenchY, 10, 80, 2); 
    ctx.fill();
    
    ctx.restore(); 

    // Highlights
    const shineGrad = ctx.createLinearGradient(lockX, lockY - 100, lockX + DIMENSIONS.lockWidth, lockY + 50);
    shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
    shineGrad.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.1)'); 
    shineGrad.addColorStop(0.6, 'rgba(255,255,255,0.02)');
    shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shineGrad;
    ctx.beginPath();
    ctx.roundRect(lockX - 10, lockY - 110, DIMENSIONS.lockWidth + 20, DIMENSIONS.lockHeight + 40, 8);
    ctx.fill();
    ctx.restore(); 

    // --- PICK TOOL ---
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 5;
    
    const pickX = gameState.pickPosition.x;
    const pickY = gameState.pickPosition.y;

    // Draw Tool Head
    const neckPos = drawPickHead(ctx, pickX, pickY, currentPick.id);

    // Draw Shaft connecting to hand
    ctx.beginPath();
    ctx.moveTo(neckPos.x, neckPos.y);
    const handX = canvas.width + 50;
    const handY = canvas.height + 150;
    // Curve shaft
    ctx.quadraticCurveTo(pickX + 50, pickY + 100, handX, handY);
    ctx.stroke();

    ctx.shadowBlur = 0;

    drawTorqueMeter(ctx, gameState.totalTorque, canvas.width - 60, canvas.height - 60);
  };

  useEffect(() => {
    let animationFrameId: number;
    const loop = (time: number) => {
      render(time);
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, currentPick]);

  return <canvas ref={canvasRef} width={800} height={600} className="w-full h-full object-contain" />;
};

export default GameCanvas;
