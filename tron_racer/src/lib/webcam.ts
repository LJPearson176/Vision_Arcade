/**
 * Shared webcam initialization utility for CV games
 * Handles browser permissions, autoplay policies, and provides detailed error feedback
 */

export interface WebcamError {
  type: 'permission_denied' | 'not_found' | 'not_supported' | 'other';
  message: string;
  originalError?: Error;
}

/**
 * Initialize webcam and attach stream to video element
 * @param videoEl - The video element to attach the stream to
 * @param label - A label for logging purposes (e.g., "CvTronRacer")
 * @returns MediaStream on success, null on failure
 */
export async function initWebcam(
  videoEl: HTMLVideoElement,
  label: string
): Promise<{ stream: MediaStream | null; error: WebcamError | null }> {
  console.log(`[${label}] 📹 Initializing webcam...`);
  
  // Check if getUserMedia is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const error: WebcamError = {
      type: 'not_supported',
      message: 'Camera access is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.'
    };
    console.error(`[${label}] ❌ getUserMedia not supported`);
    return { stream: null, error };
  }

  try {
    // Request camera access
    console.log(`[${label}] Requesting camera permissions...`);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user" 
      },
      audio: false
    });

    console.log(`[${label}] ✅ Camera access granted`);
    console.log(`[${label}]    Video tracks:`, stream.getVideoTracks().length);
    
    // Attach stream to video element
    videoEl.srcObject = stream;
    videoEl.muted = true;
    
    // Wait for metadata to load, then play
    return new Promise((resolve) => {
      videoEl.onloadedmetadata = () => {
        console.log(`[${label}] 📊 Video metadata loaded:`);
        console.log(`[${label}]    Dimensions: ${videoEl.videoWidth}x${videoEl.videoHeight}`);
        console.log(`[${label}]    Ready state: ${videoEl.readyState}`);
        
        // Attempt to play
        const playPromise = videoEl.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log(`[${label}] ▶️  Video playing successfully`);
              console.log(`[${label}]    Paused: ${videoEl.paused}`);
              console.log(`[${label}]    Current time: ${videoEl.currentTime}`);
              resolve({ stream, error: null });
            })
            .catch((err) => {
              console.error(`[${label}] ⚠️  Auto-play blocked (expected):`, err.name, err.message);
              console.log(`[${label}] 💡 Video will play on user gesture (button click)`);
              // Return stream anyway - it will play on user gesture
              resolve({ stream, error: null });
            });
        } else {
          resolve({ stream, error: null });
        }
      };

      videoEl.onerror = (e) => {
        console.error(`[${label}] ❌ Video element error:`, e);
        const error: WebcamError = {
          type: 'other',
          message: 'Failed to load video stream'
        };
        resolve({ stream: null, error });
      };
    });

  } catch (err) {
    // Parse error type
    const error = err as any;
    let webcamError: WebcamError;
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      webcamError = {
        type: 'permission_denied',
        message: 'Camera access was blocked. Please click the camera icon in your browser\'s address bar, allow camera access, and refresh the page.',
        originalError: error
      };
      console.error(`[${label}] 🚫 Camera permission denied:`, error.message);
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      webcamError = {
        type: 'not_found',
        message: 'No camera found on this device. Please connect a camera and try again.',
        originalError: error
      };
      console.error(`[${label}] 📷 No camera found:`, error.message);
    } else {
      webcamError = {
        type: 'other',
        message: `Failed to access camera: ${error.message || 'Unknown error'}`,
        originalError: error
      };
      console.error(`[${label}] ❌ Camera initialization error:`, error.name, error.message);
    }
    
    return { stream: null, error: webcamError };
  }
}

/**
 * Clean up webcam stream
 */
export function cleanupWebcam(stream: MediaStream | null, label: string) {
  if (!stream) return;
  
  console.log(`[${label}] 🧹 Cleaning up webcam stream...`);
  stream.getTracks().forEach((track) => {
    track.stop();
    console.log(`[${label}]    Stopped track: ${track.label} (kind: ${track.kind})`);
  });
}
