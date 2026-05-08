import { useEffect, useRef } from 'react';

interface ArcadeTachometerProps {
  rpm: number;
  maxRPM: number;
  gear: number;
  canShift: boolean;
}

export default function ArcadeTachometer({ rpm, maxRPM, gear, canShift }: ArcadeTachometerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const size = 200;
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 20;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Draw outer circle (background)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 10, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'hsl(180, 100%, 50%)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Calculate RPM percentage
    const rpmPercent = Math.min(rpm / maxRPM, 1);
    const startAngle = Math.PI * 0.75; // Start at 7 o'clock
    const endAngle = Math.PI * 2.25; // End at 5 o'clock
    const sweepAngle = endAngle - startAngle;
    const currentAngle = startAngle + (sweepAngle * rpmPercent);

    // Draw tick marks and numbers
    const majorTicks = 9; // 0-8 (x1000 RPM)
    for (let i = 0; i <= majorTicks; i++) {
      const angle = startAngle + (sweepAngle * i / majorTicks);
      const isRedline = i >= 7; // 7000-8000 RPM is redline
      
      // Major tick marks
      const tickStart = radius - 15;
      const tickEnd = radius - 5;
      const x1 = centerX + Math.cos(angle) * tickStart;
      const y1 = centerY + Math.sin(angle) * tickStart;
      const x2 = centerX + Math.cos(angle) * tickEnd;
      const y2 = centerY + Math.sin(angle) * tickEnd;
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isRedline ? '#ff0000' : '#00ffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Numbers
      const numDistance = radius - 30;
      const numX = centerX + Math.cos(angle) * numDistance;
      const numY = centerY + Math.sin(angle) * numDistance;
      
      ctx.fillStyle = isRedline ? '#ff0000' : '#00ffff';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i.toString(), numX, numY);

      // Minor ticks
      if (i < majorTicks) {
        for (let j = 1; j <= 4; j++) {
          const minorAngle = angle + (sweepAngle / majorTicks) * (j / 5);
          const mx1 = centerX + Math.cos(minorAngle) * (radius - 10);
          const my1 = centerY + Math.sin(minorAngle) * (radius - 10);
          const mx2 = centerX + Math.cos(minorAngle) * (radius - 5);
          const my2 = centerY + Math.sin(minorAngle) * (radius - 5);
          
          ctx.beginPath();
          ctx.moveTo(mx1, my1);
          ctx.lineTo(mx2, my2);
          ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // Draw RPM arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 10, startAngle, currentAngle);
    ctx.strokeStyle = rpm >= 7500 ? '#ff0000' : '#00ffff';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Add glow effect to arc
    if (rpm >= 7500) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff0000';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 10, startAngle, currentAngle);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw needle
    const needleLength = radius - 25;
    const needleX = centerX + Math.cos(currentAngle) * needleLength;
    const needleY = centerY + Math.sin(currentAngle) * needleLength;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(needleX, needleY);
    ctx.strokeStyle = rpm >= 7500 ? '#ffff00' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#00ffff';
    ctx.fill();

    // Draw x1000 RPM label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('×1000rpm', centerX, centerY + 35);

    // Draw current RPM value
    ctx.fillStyle = rpm >= 7500 ? '#ff0000' : '#00ffff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(rpm.toFixed(0), centerX, centerY + 55);

  }, [rpm, maxRPM]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas 
        ref={canvasRef} 
        className="drop-shadow-[0_0_20px_rgba(0,255,255,0.5)]"
      />
      
      {/* Large Gear Display */}
      <div className="flex flex-col items-center">
        <div className="text-8xl font-bold text-neon-yellow leading-none" 
          style={{ textShadow: '0 0 30px hsl(var(--neon-yellow))' }}>
          {gear}
        </div>
        <div className="text-sm text-foreground/60 mt-1">GEAR</div>
      </div>
      
      {/* Shift Indicator */}
      {canShift && (
        <div className="text-red-500 text-2xl font-bold animate-pulse mt-2">
          ⚡ SHIFT! ⚡
        </div>
      )}
    </div>
  );
}
