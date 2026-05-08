'use client';
import React from 'react';

interface ArcadeTachometerProps {
  rpm: number;
  maxRPM: number;
  gear: number;
  canShift: boolean;
}

const ArcadeTachometer: React.FC<ArcadeTachometerProps> = ({ rpm, maxRPM, gear, canShift }) => {
  const rpmPercent = Math.min(rpm / maxRPM, 1);
  const numBars = 20;
  const activeBars = Math.round(rpmPercent * numBars);

  const getBarColor = (index: number) => {
    const percent = index / numBars;
    if (percent < 0.6) return 'bg-green-500 shadow-green-500/50';
    if (percent < 0.85) return 'bg-yellow-500 shadow-yellow-500/50';
    return 'bg-red-500 shadow-red-500/50';
  };

  return (
    <div className="p-4 bg-black/50 border-2 border-neon-purple/50 rounded-lg relative">
      {/* Gear Display */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-neon-purple text-void px-4 py-1 rounded-t-md font-bold text-2xl">
        GEAR: {gear}
      </div>

      {/* Tachometer Bars */}
      <div className="flex items-end justify-center h-24 gap-1">
        {Array.from({ length: numBars }).map((_, i) => (
          <div
            key={i}
            className={`w-4 rounded-t-sm transition-all duration-100 ${
              i < activeBars ? getBarColor(i) : 'bg-gray-800'
            }`}
            style={{
              height: `${10 + (i / numBars) * 90}%`,
              boxShadow: i < activeBars ? `0 0 8px` : 'none',
            }}
          />
        ))}
      </div>
      
      {/* RPM Readout */}
      <div className="text-center text-4xl font-mono font-bold text-white mt-4 tabular-nums">
        {Math.round(rpm)} <span className="text-xl text-muted-foreground">RPM</span>
      </div>

      {/* Shift Indicator */}
      {canShift && (
        <div className="mt-2 text-center text-2xl font-bold text-neon-cyan animate-pulse">
          ⬆️ SHIFT UP!
        </div>
      )}
    </div>
  );
};

export default ArcadeTachometer;
