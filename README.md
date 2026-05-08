# Vision Arcade
<img width="1845" height="926" alt="image" src="https://github.com/user-attachments/assets/bd16e948-e123-44a2-8dc7-11ef1afbc74e" />


Vision Arcade is a browser-based computer vision gaming platform that transforms your webcam into a high-fidelity game controller. Using state-of-the-art AI models via **MediaPipe Tasks Vision**, it provides a low-latency, immersive arcade experience where your body movements, hand gestures, and facial expressions drive the gameplay.

## 🚀 Platform Overview

The platform is built as a high-performance React/Next.js application, leveraging hardware-accelerated computer vision to track skeletal landmarks, hand geometry, and facial blendshapes in real-time. 

### Core Technology Stack
- **AI Engine**: MediaPipe Tasks Vision (Pose & Hand Landmarkers)
- **Frontend**: Next.js 14, React, Tailwind CSS
- **Graphics**: Three.js (3D), Canvas API (2D)
- **State Management**: React Refs for high-frequency vision-to-physics synchronization

---

## 🛠 Visual Debugging & Diagnostics

Vision Arcade features a robust suite of diagnostic tools designed for transparency and developer testing:

- **Sequence Log**: A real-time event log tracking system transitions, model initialization, and game states.
- **Live Pose/Hand Data**: Numerical feedback on skeletal grounding (feet), joint velocities, eye closure scores, and mouth openness ratios.
- **Landmark Overlays**: A real-time SVG/Canvas overlay that draws the detected skeleton and hand geometry directly over the webcam feed.
- **Gesture Color Key**: A visual legend explaining the state-aware color changes in the hand tracking (e.g., Cyan for Open, Yellow for Closed, Green for Thumbs Up).

---

## 🕹 Game Library

### 1. Tron Racer (Hybrid)
A high-speed 3D racing simulation inspired by the retro-futuristic aesthetic of Tron.
- **Implementation**: Three.js 3D engine with procedural grid generation.
- **Steering**: Lateral torso lean. The system uses a calibrated center-point to map your physical lean directly to the Lightcycle's X-axis position.
- **Throttle**: Right hand **Closed Fist**.
- **Brake**: Right hand **Open Palm**.
- **Up-Shift**: **L-Pose** gesture with the left arm (arm extended horizontally, forearm vertical).
- **Physics**: Real-time RPM/Gear simulation with torque curves and shift zones.

<img width="1917" height="930" alt="image" src="https://github.com/user-attachments/assets/6a65e05d-135a-4153-9aba-b79cfab95572" />


### 2. HandPong (Hand)
A 3D revival of the classic arcade paddle game.
- **Implementation**: Three.js WebGL engine.
- **Paddle Control**: Your **Hand Vertical Position** (Y-axis) maps directly to the paddle's vertical position.
- **Physics**: Real-time collision detection with ball velocity amplification on paddle impact.
  
<img width="1903" height="933" alt="image" src="https://github.com/user-attachments/assets/32ca59e1-13c3-4668-96ab-92c2399ab1a0" />

### 3. Cup Pong (Hand)
A physics-based 3D beer pong simulator.
- **Implementation**: Three.js with custom gravity and trajectory physics.
- **Gesture**: **Pinching** (Thumb and Index) to "hold" the ball.
- **Throwing**: The system calculates the **Release Velocity** and direction between your pinch-start and pinch-release points to determine the ball's trajectory.
- **Prediction**: Includes a visual trajectory line that updates in real-time as you aim.
  
- <img width="1913" height="922" alt="image" src="https://github.com/user-attachments/assets/bd8a3b73-a8e1-4c83-a1b3-a335f7ffd769" />


### 4. Duck Hunt (Hand)
A nostalgic 2D shooting gallery.
- **Implementation**: 2D React-based physics and sprite animation.
- **Aiming**: **Right Hand Position** acts as the crosshair reticle.
- **Firing**: **Closed Fist** or **Thumb Up** gesture to fire.
- **Spawning**: **Open Palm Above Head** (Left Hand) to "pull" and release new ducks into the field.
- <img width="1894" height="907" alt="image" src="https://github.com/user-attachments/assets/78e3df05-0937-42d0-ab5a-eb4f1bea8e05" />


### 5. Kong Climber (Hand)
A vertical scrolling survival game where you scale a skyscraper while dodging obstacles.
- **Implementation**: 2D Canvas-based vertical physics.
- **Climbing**: Velocity-based **Pulling Motion**. The game calculates the vertical delta of your hands; pulling down fast generates climbing impulse.
- **Swatting**: **Closed Fist** to swat away airborne enemies (birds).
- **Navigation**: Lateral movement based on the center of gravity between your hands.
- <img width="1930" height="928" alt="image" src="https://github.com/user-attachments/assets/bee557c7-a21f-4da6-b40a-b9960587f718" />


### 6. Lockpick CV (Hand)
A high-fidelity mechanical lockpicking simulator.
- **Implementation**: 2D physics simulation of pins, springs, and shear lines.
- **Picking**: Your **Index Finger** serves as the pick. Its X/Y position in the camera view maps directly to the pick's movement inside the lock.
- **Tension**: **Wrist Rotation**. The system calculates the angle between your wrist and index MCP to determine the torque applied to the lock core.
- **Feedback**: Visual and audio "clicks" indicate when a pin has reached the binding state or the shear line.
- <img width="1907" height="924" alt="image" src="https://github.com/user-attachments/assets/c760bb38-fbb9-41a0-9ff6-c81b1d419735" />


### 7. Hurdles (Pose)
An Olympic-style track and field game.
- **Implementation**: 2D side-scrolling physics.
- **Running**: **High Knees**. The system tracks the vertical velocity of your knees relative to your waist. Faster knee pumps result in higher running speed.
- **Jumping**: **Skeletal Grounding**. Jumping in real life (detecting both feet leaving the ground) triggers a jump in-game to clear hurdles.

### 8. Predator (Pose)
A stealth-based interaction game using facial and skeletal tracking.
- **Gestures**: Tracks **Head Position** (X/Y) for environmental interaction and **Mouth Openness Ratio** to trigger the Predator's thermal vision or roar effects.

### 9. Mudra Meditation (Hybrid)
A calm, gesture-matching experience.
- **Gestures**: Requires the player to match complex **Mudras** (specific hand poses) while maintaining precise skeletal alignment (yoga poses).

### 10. Breath of the Wolf (Hybrid)
An interaction game focused on breath and facial states.
- **Gestures**: Uses the **Mouth Openness Ratio** as a core gameplay trigger, simulating the release of energy or breath-based attacks.
- <img width="2327" height="930" alt="image" src="https://github.com/user-attachments/assets/247007ed-5e44-44b1-8ee5-f5ca14cdadf0" />


---

## 🔧 Getting Started

1. **Environment**: Ensure you are in a well-lit room with the camera positioned at chest height.
2. **Calibration**: Use the "RE-CALIBRATE" button in supported games (like Tron Racer) to set your neutral standing position for maximum accuracy.
3. **Hardware**: A GPU-capable browser (Chrome/Edge recommended) is required for the high-frequency AI models.

---

Designed and developed by the **Advanced Agentic Coding** team at **Google DeepMind**.
