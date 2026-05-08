

'use client';

import { Button } from '@/components/ui/button';
import { Gamepad2, CupSoda, Car, Crosshair, ArrowUpFromLine, Box, Wind, Hand, Lock, Activity } from 'lucide-react';

type GameId = 'hand-pong' | 'cup-pong' | 'duck-hunt' | 'hurdles' | 'breath-of-the-wolf' | 'predator' | 'mudras-meditation' | 'kong-climber' | 'lockpick-cv' | 'tron-racer';

interface MenuScreenProps {
  onPlay: (game: GameId) => void;
}

const PredatorIcon = () => (
  <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-3">
    <circle cx="50" cy="25" r="8" fill="currentColor"/>
    <circle cx="25" cy="75" r="8" fill="currentColor"/>
    <circle cx="75" cy="75" r="8" fill="currentColor"/>
    <line x1="50" y1="25" x2="25" y2="75" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" opacity="0.5"/>
    <line x1="50" y1="25" x2="75" y2="75" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" opacity="0.5"/>
  </svg>
);


export function MenuScreen({ onPlay }: MenuScreenProps) {
  const nesButtonStyle = "font-mono text-xl py-8 bg-[#1014a0] border-2 border-[#808080] ring-2 ring-inset ring-white rounded-sm text-white hover:bg-[#2024b0] hover:ring-[#e0e0e0] transition-all duration-200 shadow-lg active:scale-95";

  return (
    <div className="relative z-10 flex flex-col items-center justify-center text-center p-8 bg-[#1014a0] rounded-sm border-4 border-[#808080] ring-4 ring-inset ring-white shadow-2xl max-w-6xl">
      <h1 className="font-headline text-6xl md:text-8xl text-white drop-shadow-[4px_4px_0_rgba(0,0,0,0.5)] mb-4 uppercase tracking-tighter">
        Vision Arcade
      </h1>
      <p className="mt-2 mb-10 text-lg md:text-xl text-white/90 max-w-md font-mono uppercase tracking-[0.2em] leading-relaxed">
        Step into the future. Your body is the controller.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        <Button 
          size="lg" 
          onClick={() => onPlay('hand-pong')} 
          className={nesButtonStyle}
        >
          <Gamepad2 className="mr-3 h-8 w-8" /> HandPong
        </Button>
        <Button 
          size="lg" 
          onClick={() => onPlay('cup-pong')} 
          className={nesButtonStyle}
        >
          <CupSoda className="mr-3 h-8 w-8" /> Cup Pong
        </Button>
        <Button 
            size="lg" 
            onClick={() => onPlay('duck-hunt')} 
            className={nesButtonStyle}
        >
          <Crosshair className="mr-3 h-8 w-8" /> Duck Hunt
        </Button>
         <Button 
            size="lg" 
            onClick={() => onPlay('hurdles')} 
            className={nesButtonStyle}
        >
          <ArrowUpFromLine className="mr-3 h-8 w-8" /> Hurdles
        </Button>
        <Button 
            size="lg" 
            onClick={() => onPlay('breath-of-the-wolf')} 
            className={nesButtonStyle}
        >
          <Wind className="mr-3 h-8 w-8" /> Breath Wolf
        </Button>
        <Button 
            size="lg" 
            onClick={() => onPlay('predator')} 
            className={nesButtonStyle}
        >
          <PredatorIcon /> Predator
        </Button>
        <Button 
            size="lg" 
            onClick={() => onPlay('mudras-meditation')} 
            className={nesButtonStyle}
        >
          <Hand className="mr-3 h-8 w-8" /> Meditation
        </Button>
        <Button 
            size="lg" 
            onClick={() => onPlay('kong-climber')} 
            className={nesButtonStyle}
        >
          <Activity className="mr-3 h-8 w-8" /> Kong Climber
        </Button>
        <Button 
            size="lg" 
            onClick={() => onPlay('lockpick-cv')} 
            className={nesButtonStyle}
        >
          <Lock className="mr-3 h-8 w-8" /> LockPick CV
        </Button>
        <Button 
            size="lg" 
            onClick={() => onPlay('tron-racer')} 
            className={nesButtonStyle}
        >
          <Car className="mr-3 h-8 w-8" /> Tron Racer
        </Button>
      </div>
    </div>
  );
}
