# How to Fix "Camera unavailable" Error

## Quick Fix (Most Common Solution)

### For Chrome/Edge:
1. Look at the address bar: `https://fixaura.vercel.app/capture`
2. Click the **🔒 lock icon** or **🎥 camera icon** (left side of address bar)
3. Find "Camera" in the dropdown
4. Change from "Block" to **"Allow"**
5. Click "Refresh" or press F5

### For Safari (Mac):
1. Go to Safari menu → Settings (or Preferences)
2. Click "Websites" tab
3. Click "Camera" in the left sidebar
4. Find `fixaura.vercel.app` in the list
5. Change to **"Allow"**
6. Refresh the page

### For Safari (iPhone/iPad):
1. Go to iPhone Settings → Safari → Camera
2. Change to **"Allow"**
3. Go back to Safari and refresh the page

### For Firefox:
1. Click the **🔒 lock icon** in address bar
2. Click the arrow next to "Blocked" or "Connection Secure"
3. Find Camera permissions
4. Click "X" to clear blocked permission
5. Refresh page and click "Allow" when prompted

## Why This Happens

### 1. Permission Previously Denied
- You clicked "Block" or "Don't Allow" when first prompted
- Browser remembered this choice
- **Solution**: Reset permissions using steps above

### 2. Camera In Use by Another App
- Another browser tab is using the camera
- Zoom, Teams, or other video app is running
- **Solution**: Close other apps/tabs using camera

### 3. Browser Doesn't Have Camera Access (Mac)
- macOS System Preferences might be blocking browser
- **Solution**: 
  1. System Preferences → Security & Privacy → Camera
  2. Check the box next to your browser (Chrome, Safari, etc.)
  3. Restart browser

### 4. Browser Doesn't Have Camera Access (Windows)
- Windows Settings might be blocking browser
- **Solution**:
  1. Settings → Privacy → Camera
  2. Turn on "Allow apps to access your camera"
  3. Scroll down and enable for your browser

## Step-by-Step Visual Guide

### Chrome/Edge - Reset Camera Permission:

```
Address Bar:  [🔒] https://fixaura.vercel.app/capture
                ↓ Click here
              
Dropdown appears:
┌─────────────────────────────┐
│ Connection is secure        │
│                             │
│ 🎥 Camera: Blocked ← Click  │
│    Change to: Allow         │
└─────────────────────────────┘

Then click: [Refresh] button or press F5
```

### Safari - Reset Camera Permission:

```
Safari Menu → Settings → Websites → Camera

Find in list:
┌──────────────────────────────────┐
│ fixaura.vercel.app: Deny ← Click │
│ Change to: Allow                 │
└──────────────────────────────────┘

Then refresh the page
```

## Testing If Camera Works

### Test in Another Website:
1. Go to: https://webcamtests.com/
2. Click "Test my cam"
3. If it works there but not in FixAura:
   - Problem is FixAura-specific permissions
   - Follow reset steps above
4. If it doesn't work there either:
   - Problem is system-level
   - Check OS camera permissions

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "Camera unavailable" | Permission denied or camera in use | Reset permissions, close other apps |
| "NotAllowedError" | User denied permission | Click "Allow" when prompted |
| "NotFoundError" | No camera detected | Check if device has camera |
| "NotReadableError" | Camera in use | Close other apps using camera |
| "SecurityError" | Not using HTTPS | Use https:// URL |

## Still Not Working?

### 1. Check Camera Hardware
- Does your device have a camera?
- Is there a physical camera cover/switch?
- Does camera work in other apps?

### 2. Try Different Browser
- Chrome: https://www.google.com/chrome/
- Edge: Built into Windows
- Safari: Built into Mac/iOS
- Firefox: https://www.mozilla.org/firefox/

### 3. Restart Browser
- Close ALL browser windows
- Reopen browser
- Try again

### 4. Restart Device
- Sometimes a full restart fixes permission issues
- Restart computer/phone
- Try again

### 5. Check Browser Console
1. Press F12 (or right-click → Inspect)
2. Click "Console" tab
3. Look for red error messages
4. Share error message for help

## Browser-Specific Issues

### Chrome/Edge on Windows:
- Windows Settings → Privacy → Camera → Allow
- Chrome Settings → Privacy and security → Site Settings → Camera → Allow

### Safari on Mac:
- System Preferences → Security & Privacy → Camera → Enable Safari
- Safari → Preferences → Websites → Camera → Allow

### Mobile Browsers:
- Use native browser (Safari on iOS, Chrome on Android)
- Avoid in-app browsers (Facebook, Instagram, Twitter)
- These often block camera access

## Need More Help?

If none of these solutions work:

1. **Check browser console** (F12 → Console tab)
2. **Take screenshot** of error message
3. **Note your browser** and version
4. **Note your OS** (Windows/Mac/iOS/Android)
5. **Report the issue** with above information

## Prevention

To avoid this issue in the future:

✅ Always click "Allow" when prompted for camera
✅ Use HTTPS URLs (not HTTP)
✅ Keep browser updated
✅ Don't block camera in system settings
✅ Close other apps before using camera
