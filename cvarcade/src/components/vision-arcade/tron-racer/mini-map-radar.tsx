import { useMemo } from "react";
import type { Obstacle } from "./lib/game-logic";

interface MiniMapRadarProps {
  obstacles: Obstacle[];
  bikeX: number;
  distanceMeters: number;
}

export default function MiniMapRadar({ obstacles, bikeX, distanceMeters }: MiniMapRadarProps) {
  const zoneColor = '#00ffff';
  
  const radarRange = 150;
  const visibleObstacles = useMemo(() => {
    return obstacles.filter(obs => {
      const distanceAhead = Math.abs(obs.z);
      return distanceAhead <= radarRange;
    });
  }, [obstacles]);
  
  const getRadarPosition = (obstacle: Obstacle) => {
    const z = Math.abs(obstacle.z);
    const x = obstacle.x;
    const radius = (z / radarRange) * 100;
    const angle = (x / 15) * 45;
    const radarX = 50 + (Math.sin(angle * Math.PI / 180) * radius);
    const radarY = 50 - (Math.cos(angle * Math.PI / 180) * radius);
    return { x: radarX, y: radarY, distance: z };
  };
  
  const getObstacleColor = (obstacle: Obstacle) => {
    switch (obstacle.type) {
      case 'barrier': return '#ef4444';
      case 'cube': return '#00ffff';
      default: return '#ef4444';
    }
  };
  
  const getObstacleSize = (distance: number) => {
    return Math.max(2, 8 - (distance / radarRange) * 6);
  };

  return (
    <div className="w-40 h-40">
      <div 
        className="relative w-full h-full rounded-full border-2 backdrop-blur-md"
        style={{
          borderColor: zoneColor,
          backgroundColor: 'rgba(0, 10, 30, 0.7)',
          boxShadow: `0 0 25px ${zoneColor}60, inset 0 0 20px ${zoneColor}20`
        }}
      >
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          <defs>
            <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={zoneColor} stopOpacity="0" />
              <stop offset="100%" stopColor={zoneColor} stopOpacity="0.1" />
            </radialGradient>
          </defs>
          
          <circle cx="50" cy="50" r="48" fill="url(#radarGradient)" />
          {[33, 66, 100].map((r, i) => (
            <circle key={i} cx="50" cy="50" r={r * 0.48} fill="none" stroke={zoneColor} strokeWidth="0.3" opacity="0.3" />
          ))}
          
          <line x1="50" y1="2" x2="50" y2="98" stroke={zoneColor} strokeWidth="0.3" opacity="0.3" />
          <line x1="2" y1="50" x2="98" y2="50" stroke={zoneColor} strokeWidth="0.3" opacity="0.3" />
          
          {visibleObstacles.map((obstacle, idx) => {
            const pos = getRadarPosition(obstacle);
            const color = getObstacleColor(obstacle);
            const size = getObstacleSize(pos.distance);
            return (
              <g key={idx}>
                <circle cx={pos.x} cy={pos.y} r={size * 0.5} fill={color} opacity="0.9" />
                <circle cx={pos.x} cy={pos.y} r={size * 0.7} fill={color} opacity="0.3" />
              </g>
            );
          })}
          
          <g>
            <circle cx="50" cy="50" r="4" fill={zoneColor} opacity="0.4" />
            <circle cx="50" cy="50" r="2.5" fill={zoneColor} opacity="1" />
            <path d="M 50 45 L 48 50 L 50 48 L 52 50 Z" fill={zoneColor} opacity="0.9" />
          </g>
        </svg>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-mono opacity-70" style={{ color: zoneColor }}>
          {radarRange}m
        </div>
      </div>
    </div>
  );
}
