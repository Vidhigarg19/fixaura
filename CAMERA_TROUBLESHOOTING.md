# Camera Troubleshooting Guide

## Common Issues on Vercel Deployment

### 1. HTTPS Required
**Problem**: Camera doesn't work on HTTP
**Solution**: 
- Vercel automatically provides HTTPS
- Always access via `https://your-app.vercel.app`
- Never use `http://` URLs

### 2. Browser Permissions
**Problem**: User denied camera access
**Solution**:
- Click the camera icon in browser address bar
- Select "Allow" for camera permissions
- Refresh the page

### 3. Mobile Browser Compatibility
**Problem**: Camera not working on mobile
**Solution**:
- Use Chrome, Safari, or Edge (latest versions)
- Avoid in-app browsers (Facebook, Instagram, etc.)
- Check if device has camera access enabled

### 4. iOS Safari Specific
**Problem**: Camera black screen on iOS
**Solution**:
- Ensure `playsInline` attribute is set (already implemented)
- Check iOS Settings > Safari > Camera access
- Try closing and reopening Safari

### 5. Vercel Preview Deployments
**Problem**: Camera works locally but not on preview URLs
**Solution**:
- Test on production domain, not preview URLs
- Some browsers restrict camera on non-production domains
- Add your Vercel domain to browser's allowed sites

## Testing Checklist

- [ ] Access site via HTTPS (not HTTP)
- [ ] Grant camera permissions when prompted
- [ ] Test on latest Chrome/Safari/Edge
- [ ] Check browser console for errors
- [ ] Verify device camera works in other apps
- [ ] Test on production domain (not preview)

## Browser Support

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome  | ✅ 53+  | ✅ 53+ |
| Safari  | ✅ 11+  | ✅ 11+ |
| Edge    | ✅ 79+  | ✅ 79+ |
| Firefox | ✅ 36+  | ✅ 36+ |

## Debug Steps

1. Open browser DevTools (F12)
2. Go to Console tab
3. Try to capture - look for errors
4. Common errors:
   - `NotAllowedError`: Permission denied
   - `NotFoundError`: No camera detected
   - `NotReadableError`: Camera in use by another app
   - `SecurityError`: HTTPS required
