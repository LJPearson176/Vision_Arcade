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

    const size = 200;
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 20;

    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 10, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'hsl(180, 100%, 50%)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const rpmPercent = Math.min(rpm / maxRPM, 1);
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const sweepAngle = endAngle - startAngle;
    const currentAngle = startAngle + (sweepAngle * rpmPercent);

    const majorTicks = 8;
    for (let i = 0; i <= majorTicks; i++) {
      const angle = startAngle + (sweepAngle * i / majorTicks);
      const isRedline = i >= 7;
      
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

      const numDistance = radius - 30;
      const numX = centerX + Math.cos(angle) * numDistance;
      const numY = centerY + Math.sin(angle) * numDistance;
      
      ctx.fillStyle = isRedline ? '#ff0000' : '#00ffff';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i.toString(), numX, numY);
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 10, startAngle, currentAngle);
    ctx.strokeStyle = rpm >= 7500 ? '#ff0000' : '#00ffff';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    const needleLength = radius - 25;
    const needleX = centerX + Math.cos(currentAngle) * needleLength;
    const needleY = centerY + Math.sin(currentAngle) * needleLength;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(needleX, needleY);
    ctx.strokeStyle = rpm >= 7500 ? '#ffff00' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#00ffff';
    ctx.fill();

  }, [rpm, maxRPM]);

  return (
    <div className="flex flex-col items-center gap-0">
      <div className="relative">
        <canvas 
          ref={canvasRef} 
          className="drop-shadow-[0_0_20px_rgba(0,255,255,0.5)]"
        />
        
        {/* Integrated Gear Display */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
          <div className="text-7xl font-bold text-yellow-400 leading-none drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
            {gear}
          </div>
          <div className="text-[10px] text-white/40 tracking-[0.2em] -mt-1 font-mono">GEAR</div>
        </div>
      </div>
      
      <div className={`text-red-500 text-2xl font-bold animate-pulse mt-1 transition-opacity duration-200 h-8 ${canShift ? 'opacity-100' : 'opacity-0'}`}>
        ⚡ SHIFT! ⚡
      </div>
    </div>
  );
}
