'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { HandState } from '@/hooks/use-hand-tracking';

interface HandPongProps {
  handPosition: { x: number; y: number } | null;
  onGameOver: (winner: 'Player' | 'AI') => void;
  onReturnToMenu: () => void;
}

const COURT_WIDTH = 10;
const COURT_HEIGHT = 6;
const PADDLE_HEIGHT = 1.5;
const PADDLE_WIDTH = 0.2;
const BALL_RADIUS = 0.1;
const WINNING_SCORE = 5;

export function HandPong({ handPosition, onGameOver, onReturnToMenu }: HandPongProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameStateRef = useRef({
    ball: {
      position: new THREE.Vector2(0, 0),
      velocity: new THREE.Vector2(0, 0),
    },
    playerScore: 0,
    aiScore: 0,
    aiPaddleY: 0,
  });

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const latestHandPosition = useRef(handPosition);

  useEffect(() => {
    latestHandPosition.current = handPosition;
  }, [handPosition]);

  const resetBall = useCallback((direction: number) => {
    gameStateRef.current.ball.position.set(0, 0);
    const speed = 0.05;
    const angle = (Math.random() - 0.5) * Math.PI / 2;
    gameStateRef.current.ball.velocity.set(Math.cos(angle) * speed * direction, Math.sin(angle) * speed);
  }, []);

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    const scene = sceneRef.current;
    const playerPaddle = scene.getObjectByName('playerPaddle') as THREE.Mesh;
    const aiPaddle = scene.getObjectByName('aiPaddle') as THREE.Mesh;
    const ball = scene.getObjectByName('ball') as THREE.Mesh;
    const playerScoreElem = document.getElementById('player-score');
    const aiScoreElem = document.getElementById('ai-score');
    
    if (!playerPaddle || !aiPaddle || !ball || !playerScoreElem || !aiScoreElem) {
        animationFrameIdRef.current = requestAnimationFrame(animate);
        return;
    }

    // Player paddle movement
    if (latestHandPosition.current) {
      const targetY = (0.5 - latestHandPosition.current.y) * COURT_HEIGHT;
      playerPaddle.position.y = THREE.MathUtils.clamp(targetY, -COURT_HEIGHT / 2 + PADDLE_HEIGHT / 2, COURT_HEIGHT / 2 - PADDLE_HEIGHT / 2);
    }

    // AI paddle movement
    const aiTargetY = gameStateRef.current.ball.position.y;
    gameStateRef.current.aiPaddleY += (aiTargetY - gameStateRef.current.aiPaddleY) * 0.08; // Lag
    aiPaddle.position.y = THREE.MathUtils.clamp(gameStateRef.current.aiPaddleY, -COURT_HEIGHT / 2 + PADDLE_HEIGHT / 2, COURT_HEIGHT / 2 - PADDLE_HEIGHT / 2);
    
    // Ball movement
    const { position, velocity } = gameStateRef.current.ball;
    position.add(velocity);
    ball.position.set(position.x, position.y, 0);
    
    // Wall collision
    if (position.y + BALL_RADIUS > COURT_HEIGHT / 2 || position.y - BALL_RADIUS < -COURT_HEIGHT / 2) {
      velocity.y *= -1;
    }
    
    // Paddle collision
    const ballBox = new THREE.Box3().setFromObject(ball);
    const playerBox = new THREE.Box3().setFromObject(playerPaddle);
    const aiBox = new THREE.Box3().setFromObject(aiPaddle);

    if (velocity.x > 0 && ballBox.intersectsBox(playerBox)) {
        velocity.x *= -1.05; // Speed up
        position.x = playerPaddle.position.x - PADDLE_WIDTH / 2 - BALL_RADIUS;
    }
    if (velocity.x < 0 && ballBox.intersectsBox(aiBox)) {
        velocity.x *= -1.05; // Speed up
        position.x = aiPaddle.position.x + PADDLE_WIDTH / 2 + BALL_RADIUS;
    }

    // Scoring
    if (position.x < -COURT_WIDTH / 2 - PADDLE_WIDTH) {
        gameStateRef.current.playerScore++;
        if (gameStateRef.current.playerScore >= WINNING_SCORE) {
          onGameOver('Player');
          return;
        }
        resetBall(1);
    } else if (position.x > COURT_WIDTH / 2 + PADDLE_WIDTH) {
        gameStateRef.current.aiScore++;
         if (gameStateRef.current.aiScore >= WINNING_SCORE) {
          onGameOver('AI');
          return;
        }
        resetBall(-1);
    }
    
    playerScoreElem.innerText = gameStateRef.current.playerScore.toString();
    aiScoreElem.innerText = gameStateRef.current.aiScore.toString();

    rendererRef.current.render(scene, cameraRef.current);
    animationFrameIdRef.current = requestAnimationFrame(animate);
  }, [onGameOver, resetBall]);


  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(0, 0, 5);
    scene.add(pointLight);

    // Game Objects
    const paddleMaterial = new THREE.MeshStandardMaterial({ color: '#7DF9FF', emissive: '#7DF9FF', emissiveIntensity: 2 });
    const playerPaddle = new THREE.Mesh(new THREE.BoxGeometry(PADDLE_WIDTH, PADDLE_HEIGHT, 0.2), paddleMaterial);
    playerPaddle.position.x = COURT_WIDTH / 2;
    playerPaddle.name = 'playerPaddle';
    scene.add(playerPaddle);

    const aiPaddle = new THREE.Mesh(new THREE.BoxGeometry(PADDLE_WIDTH, PADDLE_HEIGHT, 0.2), paddleMaterial.clone());
    aiPaddle.material.emissive.set('#FF69B4');
    aiPaddle.position.x = -COURT_WIDTH / 2;
    aiPaddle.name = 'aiPaddle';
    scene.add(aiPaddle);

    const ballMaterial = new THREE.MeshStandardMaterial({ color: '#FF69B4', emissive: '#FF69B4', emissiveIntensity: 2 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 16, 16), ballMaterial);
    ball.name = 'ball';
    scene.add(ball);

    const wallMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2 });
    const topWall = new THREE.Mesh(new THREE.BoxGeometry(COURT_WIDTH, 0.1, 0.1), wallMaterial);
    topWall.position.y = COURT_HEIGHT / 2;
    scene.add(topWall);
    const bottomWall = new THREE.Mesh(new THREE.BoxGeometry(COURT_WIDTH, 0.1, 0.1), wallMaterial);
    bottomWall.position.y = -COURT_HEIGHT / 2;
    scene.add(bottomWall);
    
    // Score display
    const playerScoreElem = document.createElement('div');
    playerScoreElem.id = 'player-score';
    playerScoreElem.className = 'absolute top-4 right-1/4 text-6xl font-headline text-primary/50';
    mount.appendChild(playerScoreElem);
    
    const aiScoreElem = document.createElement('div');
    aiScoreElem.id = 'ai-score';
    aiScoreElem.className = 'absolute top-4 left-1/4 text-6xl font-headline text-accent/50';
    mount.appendChild(aiScoreElem);

    resetBall(Math.random() > 0.5 ? 1 : -1);

    animationFrameIdRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if(mount && renderer.domElement){
        mount.removeChild(renderer.domElement);
      }
       if(mount && playerScoreElem){
        mount.removeChild(playerScoreElem);
      }
      if(mount && aiScoreElem){
        mount.removeChild(aiScoreElem);
      }
      renderer.dispose();
    };
  }, [animate, resetBall]);

  return (
    <div className="w-full h-full absolute inset-0">
      <div ref={mountRef} className="w-full h-full" />
      <Button
        variant="outline"
        onClick={onReturnToMenu}
        className="absolute top-4 left-4 z-20"
      >
        Return to Menu
      </Button>
    </div>
  );
}
