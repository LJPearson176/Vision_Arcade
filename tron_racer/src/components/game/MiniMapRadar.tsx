import { useMemo } from "react";
import type { Obstacle } from "@/lib/gameLogic";

interface MiniMapRadarProps {
  obstacles: Obstacle[];
  bikeX: number;
  distanceMeters: number;
}

export default function MiniMapRadar({ obstacles, bikeX, distanceMeters }: MiniMapRadarProps) {
  // Determine color zone based on distance (matches GridSystem logic)
  const colorZone = Math.floor(distanceMeters / 1000) % 3;
  const zoneColors = ['#00ffff', '#9333ea', '#fbbf24']; // cyan, purple, yellow
  const zoneColor = zoneColors[colorZone];
  
  // Filter obstacles within radar range (150 units ahead)
  const radarRange = 150;
  const visibleObstacles = useMemo(() => {
    return obstacles.filter(obs => {
      // Obstacles are positioned with negative Z (ahead of player at z=0)
      const distanceAhead = Math.abs(obs.mesh.position.z);
      return distanceAhead <= radarRange;
    });
  }, [obstacles]);
  
  // Convert 3D position to radar 2D position
  const getRadarPosition = (obstacle: Obstacle) => {
    const z = Math.abs(obstacle.mesh.position.z); // Distance ahead
    const x = obstacle.mesh.position.x; // Lateral position
    
    // Normalize to radar coordinates (0-100% of radar radius)
    const radius = (z / radarRange) * 100;
    const angle = (x / 15) * 45; // 15 units = track width, ±45 degrees
    
    // Convert polar to cartesian (inverted Y because obstacles approach from top)
    const radarX = 50 + (Math.sin(angle * Math.PI / 180) * radius);
    const radarY = 50 - (Math.cos(angle * Math.PI / 180) * radius);
    
    return { x: radarX, y: radarY, distance: z };
  };
  
  // Get obstacle color based on type
  const getObstacleColor = (obstacle: Obstacle) => {
    switch (obstacle.type) {
      case 'barrier': return '#ef4444'; // red
      case 'cube': return '#00ffff'; // cyan
      default: return '#ef4444';
    }
  };
  
  // Get obstacle size based on distance (closer = larger)
  const getObstacleSize = (distance: number) => {
    return Math.max(2, 8 - (distance / radarRange) * 6);
  };

  return (
    <div className="fixed top-1/2 -translate-y-1/2 right-4 w-40 h-40 z-50">
      {/* Radar container with glow */}
      <div 
        className="relative w-full h-full rounded-full border-2 backdrop-blur-sm"
        style={{
          borderColor: zoneColor,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          boxShadow: `0 0 20px ${zoneColor}40, inset 0 0 20px ${zoneColor}20`
        }}
      >
        {/* Grid circles */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          <defs>
            <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={zoneColor} stopOpacity="0" />
              <stop offset="100%" stopColor={zoneColor} stopOpacity="0.1" />
            </radialGradient>
          </defs>
          
          {/* Background gradient */}
          <circle cx="50" cy="50" r="48" fill="url(#radarGradient)" />
          
          {/* Range circles */}
          {[33, 66, 100].map((r, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r * 0.48}
              fill="none"
              stroke={zoneColor}
              strokeWidth="0.3"
              opacity="0.3"
            />
          ))}
          
          {/* Cross-hair lines */}
          <line x1="50" y1="2" x2="50" y2="98" stroke={zoneColor} strokeWidth="0.3" opacity="0.3" />
          <line x1="2" y1="50" x2="98" y2="50" stroke={zoneColor} strokeWidth="0.3" opacity="0.3" />
          
          {/* Obstacles */}
          {visibleObstacles.map((obstacle, idx) => {
            const pos = getRadarPosition(obstacle);
            const color = getObstacleColor(obstacle);
            const size = getObstacleSize(pos.distance);
            
            return (
              <g key={idx}>
                {/* Obstacle dot */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={size * 0.5}
                  fill={color}
                  opacity="0.9"
                />
                {/* Glow effect */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={size * 0.7}
                  fill={color}
                  opacity="0.3"
                />
              </g>
            );
          })}
          
          {/* Player indicator at center */}
          <g>
            {/* Player glow */}
            <circle cx="50" cy="50" r="4" fill={zoneColor} opacity="0.4" />
            {/* Player dot */}
            <circle cx="50" cy="50" r="2.5" fill={zoneColor} opacity="1" />
            {/* Directional arrow */}
            <path
              d="M 50 45 L 48 50 L 50 48 L 52 50 Z"
              fill={zoneColor}
              opacity="0.9"
            />
          </g>
        </svg>
        
        {/* Distance label */}
        <div 
          className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-mono opacity-70"
          style={{ color: zoneColor }}
        >
          {radarRange}m
        </div>
      </div>
      
      {/* Legend */}
      <div className="mt-2 text-xs font-mono space-y-1">
        <div className="flex items-center gap-2 opacity-70">
          <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
          <span style={{ color: zoneColor }}>Barrier</span>
        </div>
        <div className="flex items-center gap-2 opacity-70">
          <div className="w-2 h-2 rounded-full bg-[#00ffff]" />
          <span style={{ color: zoneColor }}>Cube</span>
        </div>
      </div>
    </div>
  );
}
