# Vercel Deployment Checklist

## Pre-Deployment

- [ ] Test camera locally on `http://localhost:5173`
- [ ] Verify all features work with mock data (no API key)
- [ ] Test with Anthropic API key if using live AI
- [ ] Run `npm run build` to ensure no build errors
- [ ] Check `vercel.json` is present for proper routing

## Vercel Setup

- [ ] Push code to GitHub repository
- [ ] Import project in Vercel dashboard
- [ ] Configure environment variables (if needed):
  - `VITE_ANTHROPIC_API_KEY` (optional)
- [ ] Deploy to production

## Post-Deployment Testing

### Desktop Testing
- [ ] Access site via HTTPS URL (e.g., `https://fixaura.vercel.app`)
- [ ] Test camera capture on Chrome
- [ ] Test camera capture on Safari
- [ ] Test camera capture on Edge
- [ ] Verify camera permission prompt appears
- [ ] Test camera flip (front/back)
- [ ] Test full repair flow (capture → diagnosis → tools → guide → done)

### Mobile Testing
- [ ] Test on iOS Safari
- [ ] Test on Android Chrome
- [ ] Test camera permissions on mobile
- [ ] Verify responsive design
- [ ] Test touch interactions

### Camera-Specific Checks
- [ ] Camera permission prompt appears
- [ ] "Allow" grants camera access successfully
- [ ] "Deny" shows appropriate error message
- [ ] Error state shows troubleshooting tips
- [ ] Camera diagnostics tool appears on error
- [ ] HTTPS warning shows if accessed via HTTP

## Common Issues & Solutions

### Issue: Camera shows black screen
**Solution**: 
- Check if another app is using the camera
- Try different browser
- Check browser camera permissions

### Issue: Permission denied error
**Solution**:
- Click camera icon in address bar
- Reset permissions and reload
- Check browser settings

### Issue: Camera not found
**Solution**:
- Verify device has camera
- Check if camera is enabled in OS settings
- Try external webcam if available

### Issue: Works locally but not on Vercel
**Solution**:
- Ensure accessing via HTTPS (not HTTP)
- Check browser console for specific errors
- Test on production domain (not preview URL)
- Verify `vercel.json` is deployed

## Browser Console Debugging

Open DevTools (F12) and check for:
- `NotAllowedError` → Permission issue
- `NotFoundError` → No camera detected
- `NotReadableError` → Camera in use
- `SecurityError` → HTTPS required
- `TypeError` → API not available

## Performance Checks

- [ ] Lighthouse score > 90
- [ ] First Contentful Paint < 2s
- [ ] Time to Interactive < 3s
- [ ] Camera loads within 2s
- [ ] Image analysis completes within 5s

## Final Verification

- [ ] All routes work correctly
- [ ] Language toggle works (EN/HI)
- [ ] Animations are smooth
- [ ] No console errors
- [ ] Camera works on multiple devices
- [ ] Share functionality works
- [ ] Back navigation works properly

## Rollback Plan

If critical issues found:
1. Revert to previous deployment in Vercel dashboard
2. Fix issues locally
3. Test thoroughly
4. Redeploy

## Support Resources

- Vercel Docs: https://vercel.com/docs
- MediaDevices API: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices
- Camera Troubleshooting: See `CAMERA_TROUBLESHOOTING.md`
