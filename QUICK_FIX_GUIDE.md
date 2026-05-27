# Quick Fix Guide: Camera Not Working on Vercel

## TL;DR - Most Common Issue

**Problem**: Camera works locally but not on Vercel
**Solution**: Make sure you're accessing via **HTTPS** (Vercel does this automatically)

## 3-Step Quick Fix

### Step 1: Check Your URL
❌ `http://your-app.vercel.app` (won't work)
✅ `https://your-app.vercel.app` (will work)

Vercel automatically provides HTTPS, so just make sure you're using it!

### Step 2: Grant Permissions
When you visit the camera page, your browser will ask:
```
"your-app.vercel.app wants to use your camera"
[Block] [Allow]
```
Click **Allow**!

### Step 3: Check Browser Support
Use a modern browser:
- ✅ Chrome (recommended)
- ✅ Safari
- ✅ Edge
- ✅ Firefox
- ❌ Internet Explorer (not supported)

## Still Not Working?

### On Desktop
1. Open browser DevTools (press F12)
2. Go to Console tab
3. Try to use camera
4. Look for error messages:
   - `NotAllowedError` → Click "Allow" in permission prompt
   - `NotFoundError` → Check if camera is connected
   - `SecurityError` → Use HTTPS

### On Mobile
1. Use Safari (iOS) or Chrome (Android)
2. Don't use in-app browsers (Facebook, Instagram, etc.)
3. Check Settings → Safari/Chrome → Camera → Allow

### Reset Permissions
**Chrome/Edge**:
1. Click 🔒 icon in address bar
2. Click "Site settings"
3. Find "Camera" → Change to "Allow"
4. Refresh page

**Safari**:
1. Safari → Settings → Websites → Camera
2. Find your site → Change to "Allow"
3. Refresh page

## Test Your Camera

Visit the camera page and look for:
- 🟢 Camera preview appears → Working!
- 🟡 Permission prompt → Click "Allow"
- 🔴 Error message → Click diagnostics button (bottom-right)

## Need More Help?

See detailed guides:
- `CAMERA_TROUBLESHOOTING.md` - Full troubleshooting guide
- `DEPLOYMENT_CHECKLIST.md` - Deployment verification
- `CAMERA_FIX_SUMMARY.md` - Technical details

## Emergency Fallback

If camera still doesn't work, the app will use **mock diagnosis data** so you can still test the full flow without a working camera.
