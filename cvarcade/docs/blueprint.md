# **App Name**: Vision Arcade

## Core Features:

- CV Input Engine: Initializes MediaPipe Hands, tracks the user’s right hand, and outputs a smoothed, normalized hand position (e.g., handX in [0,1]). Uses the right_hand tool to obtain precise right-hand landmark data, with basic jitter reduction and configurable smoothing.
- Game Manager: Orchestrates the overall app flow, managing whether the user is viewing the main menu or actively playing a game. Provides a clean interface for registering and switching between multiple games.
- Menu Screen: Displays a simple, responsive game selection UI. For the MVP, it highlights a single playable title: HandPong. Designed so additional CV-powered games can be added later with minimal changes.
- HandPong Game Logic: Implements the core mechanics of the HandPong experience, including ball physics, paddle movement driven by CV input, collision detection, scoring, and win/loss conditions. Uses the normalized right-hand position as the primary control signal.
- HandPong Rendering: Uses Three.js to render the HandPong scene, including paddles, ball, and arena boundaries. Applies basic visual effects (glow, subtle gradients, and motion cues) to reinforce the futuristic arcade identity of Vision Arcade.
- Webcam Preview: Displays a small, non-intrusive webcam preview overlay on the interface. Optionally draws a marker or outline over the detected right hand so the player can see how their movements map to game input.

## Style Guidelines:

- Primary color: Electric Blue (#7DF9FF) to convey a futuristic, neon-lit arcade atmosphere.
- Background color: Dark Grey (#28282B) to keep focus on gameplay elements and provide strong contrast for neon accents.
- Accent color: Neon Pink (#FF69B4) for key highlights such as scores, active selections, and call-to-action elements.
- Body and headline font: Use ‘Space Grotesk’ for headings and primary UI labels, paired with ‘Inter’ for body text and secondary UI copy to maintain clarity and readability.
- Use simple, geometric icons for menu navigation, settings, and in-game indicators to match the minimalist, futuristic visual language.
- Maintain clear separation between the main game view, the webcam preview, and score/status overlays so that information is easy to parse at a glance.
- Add subtle animations for ball movement, paddle impacts, score updates, and hover states. Animations should enhance the arcade feel without overwhelming performance or visual clarity.