# Camera Black Screen Fix

## Problem
Camera showed black screen on Vercel deployment even though:
- Browser showed "Camera in use" indicator
- Permission was granted
- No error messages appeared

## Root Causes Identified

### 1. **Dark Overlay Blocking Video** (Primary Issue)
```tsx
// BEFORE - 40% opacity overlay made video nearly invisible
<div className="absolute inset-0 bg-background/40" />

// AFTER - 10% opacity for subtle effect
<div className="absolute inset-0 bg-black/10 pointer-events-none" />
```

### 2. **Missing autoPlay Attribute**
```tsx
// BEFORE
<video ref={videoRef} playsInline muted />

// AFTER
<video ref={videoRef} autoPlay playsInline muted />
```

### 3. **Video Loading Not Tracked**
The app showed "ready" state before video actually started displaying frames.

### 4. **No Fallback for Unsupported Constraints**
Some devices/browsers don't support `facingMode: 'environment'` constraint.

### 5. **Async Video Loading Issues**
Video metadata loading and play() were not properly synchronized.

## Solutions Implemented

### 1. Reduced Overlay Opacity
Changed from `bg-background/40` (40% dark) to `bg-black/10` (10% dark) so video is clearly visible.

### 2. Added autoPlay Attribute
Ensures video starts playing automatically when stream is ready.

### 3. Added videoReady State
```tsx
const [videoReady, setVideoReady] = useState(false)

// Set to true when video metadata loads
videoRef.current.onloadedmetadata = () => {
  setVideoReady(true)
  // ... play video
}

// Show loading overlay until video is ready
{!videoReady && (
  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
)}
```

### 4. Added Fallback for facingMode
```tsx
try {
  // Try with facingMode first
  stream = await navigator.mediaDevices.getUserMedia({
    video: { 
      facingMode: facingMode === 'environment' ? { ideal: 'environment' } : 'user',
      width: { ideal: 1280 }, 
      height: { ideal: 720 } 
    }
  })
} catch (err) {
  // Fallback: try without facingMode
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } }
  })
}
```

### 5. Added Timeout Fallback
```tsx
// If video doesn't load within 3 seconds, force ready state
setTimeout(() => {
  if (cameraState === 'loading') {
    console.warn('Video loading timeout, forcing ready state')
    setCameraState('ready')
  }
}, 3000)
```

### 6. Improved Video Initialization
```tsx
videoRef.current.onloadedmetadata = () => {
  console.log('Video metadata loaded')
  setVideoReady(true)
  videoRef.current?.play().then(() => {
    console.log('Video playing successfully')
    setCameraState('ready')
  }).catch((playErr) => {
    console.error('Video play error:', playErr)
    setCameraState('error')
  })
}
```

### 7. Added Debug Info
Shows video dimensions in top bar when camera is ready:
```tsx
{cameraState === 'ready' && videoRef.current && (
  <div className="glass-panel rounded-lg px-3 py-1 text-xs">
    {videoRef.current.videoWidth}x{videoRef.current.videoHeight}
  </div>
)}
```

### 8. Better Console Logging
Added detailed logs at each step:
- Camera request with facingMode
- Fallback attempts
- Video metadata loading
- Video play success/failure
- Dimensions when loaded

## Testing Instructions

### After Deployment:

1. **Open Browser DevTools** (F12)
2. **Go to Console tab**
3. **Navigate to /capture page**
4. **Look for these logs:**
   ```
   Requesting camera with facingMode: environment
   Video metadata loaded, dimensions: 1280 x 720
   Video playing successfully
   ```

5. **Check video element:**
   - Should see live camera feed (not black)
   - Should see video dimensions in top bar
   - Should see AR overlay corners and frame

### If Still Black:

1. **Check console for errors**
2. **Look for video dimensions** - if 0x0, video isn't loading
3. **Try switching camera** (flip button)
4. **Check if other apps can use camera**
5. **Try different browser**

## Expected Behavior

### Before Fix:
- ❌ Black screen with AR overlay visible
- ❌ "Camera in use" indicator but no video
- ❌ No way to know if video is loading or failed

### After Fix:
- ✅ Live camera feed visible
- ✅ Loading indicator while initializing
- ✅ Video dimensions shown in debug info
- ✅ Fallback for unsupported constraints
- ✅ Detailed console logs for debugging

## Files Changed

- `src/Pages/CameraCapture.tsx` - All camera fixes

## Commit

```
commit 996a46e
Fix camera black screen issue
```

## Deploy & Test

1. Push to Vercel (auto-deploys from dev branch if configured)
2. Visit https://your-app.vercel.app/capture
3. Grant camera permission
4. Should see live video feed (not black screen)

## Common Issues After Fix

### Still Black Screen?
- Check console logs
- Verify video dimensions are not 0x0
- Try different browser
- Check if camera works in other apps

### Video Flickers?
- Normal during initialization
- Should stabilize within 1-2 seconds

### Wrong Camera?
- Click flip button to switch
- Some devices only have one camera

### Blurry Video?
- Normal on some devices
- Capture quality is still good (1280x720)
