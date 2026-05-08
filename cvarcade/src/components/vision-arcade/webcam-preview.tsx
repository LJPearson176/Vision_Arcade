'use client';

import { RefObject } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface WebcamPreviewProps {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  isVisible: boolean;
}

export function WebcamPreview({ videoRef, canvasRef, isVisible }: WebcamPreviewProps) {

  return (
    <Card className={cn(
        "fixed bottom-4 right-4 w-48 h-36 rounded-lg overflow-hidden border-2 border-primary/50 shadow-2xl shadow-primary/20 transition-all duration-500 z-50",
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
      )}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover scale-x-[-1]"
      ></video>
      <canvas
        ref={canvasRef}
        width="640"
        height="480"
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
      ></canvas>
    </Card>
  );
}
