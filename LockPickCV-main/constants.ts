
import { GameConfig, PickTool, LevelDefinition } from './types';

export const CONFIG: GameConfig = {
  pinCount: 5,
  gravity: 1.2, 
  springConstant: 0.15,
  friction: 0.92,
  pickRadius: 8,
  shearLineY: 200, 
};

export const LEVELS: LevelDefinition[] = [
  {
    id: 1,
    name: "Novice",
    description: "Standard 3-pin practice lock. Loose tolerances.",
    pinCount: 3,
    configOverrides: {
      gravity: 1.0,
      springConstant: 0.12,
      friction: 0.95 // High friction, pins stay put easier
    }
  },
  {
    id: 2,
    name: "Apprentice",
    description: "4 pins. Standard springs. Gravity increases.",
    pinCount: 4,
    configOverrides: {
      gravity: 1.2,
      springConstant: 0.15,
      friction: 0.92
    }
  },
  {
    id: 3,
    name: "Journeyman",
    description: "5 pins. Tighter springs require precise tension.",
    pinCount: 5,
    configOverrides: {
      gravity: 1.4,
      springConstant: 0.18,
      friction: 0.90
    }
  },
  {
    id: 4,
    name: "Expert",
    description: "6 pins. Heavy pins drop instantly without tension.",
    pinCount: 6,
    configOverrides: {
      gravity: 1.8,
      springConstant: 0.22,
      friction: 0.85
    }
  },
  {
    id: 5,
    name: "Grandmaster",
    description: "6 pins. Maximum difficulty. Twitchy feedback.",
    pinCount: 6,
    configOverrides: {
      gravity: 2.2,
      springConstant: 0.25,
      friction: 0.80
    }
  }
];

export const COLORS = {
  background: '#0f172a', // Slate 900
  // Acrylic Body
  lockBodyFill: 'rgba(255, 255, 255, 0.05)',
  lockBodyBorder: 'rgba(255, 255, 255, 0.2)',
  lockChamber: 'rgba(0, 0, 0, 0.15)',
  
  // Metals
  shackle: '#cbd5e1',
  brassStart: '#b45309', // Dark gold
  brassMid: '#fcd34d',   // Bright gold
  brassEnd: '#78350f',   // Brown gold shadow
  
  chromeStart: '#64748b',
  chromeMid: '#f1f5f9',
  chromeEnd: '#475569',

  // Functional
  shearLine: '#ef4444',
  spring: '#94a3b8',     
  pick: '#e2e8f0',       
  tensionWrench: '#94a3b8', 
  highlight: '#22d3ee',  
  success: '#22c55e',    
  fail: '#ef4444',       
  warning: '#f59e0b',    
};

export const DIMENSIONS = {
  pinWidth: 18, // Slightly thinner for elegance
  pinSpacing: 42,
  pinMaxLift: 60,
  lockWidth: 320,
  lockHeight: 160,
  shackleThickness: 25,
};

export const PICK_TOOLS: PickTool[] = [
  { id: 'short-hook', name: 'Short Hook', description: 'Standard profile. Versatile and precise for single pin picking.' },
  { id: 'deep-hook', name: 'Deep Hook', description: 'Increased reach. Perfect for setting high pins behind low ones.' },
  { id: 'offset-hybrid', name: 'Offset Hybrid', description: 'Rounded tip combining a hook and a half-diamond. Good all-rounder.' },
  { id: 'half-diamond', name: 'Half Diamond', description: 'Triangular head. Effective for both lifting and kinetic attacks.' },
  { id: 'snake-rake', name: 'Snake Rake', description: 'S-curved profile designed for scrubbing multiple pins quickly.' },
  { id: 'city-rake', name: 'City Rake', description: 'Saw-tooth pattern mimicking common key bitting. Great for rocking.' },
];
