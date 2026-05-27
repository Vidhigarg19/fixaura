# FixAura

AR-powered repair assistant — scan a broken item, get AI diagnosis, gather tools, and follow step-by-step guidance with AR overlays.

## Stack

- React 18+ / TypeScript / Vite
- Tailwind CSS v4
- Framer Motion
- React Router v6+
- Lucide React, react-countup, react-intersection-observer, lottie-react

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Environment

Copy `.env.example` to `.env` and set `VITE_ANTHROPIC_API_KEY` for live Claude vision analysis. Without a key, the app uses realistic mock diagnosis data.

## User flow

| Route | Page |
|-------|------|
| `/` | Landing |
| `/capture` | Camera capture |
| `/diagnosis` | AI diagnosis + confidence |
| `/tools` | Tool checklist |
| `/guide` | AR repair guide |
| `/done` | Completion + savings |

## i18n

Strings live in `src/i18n/en.json` and `src/i18n/hi.json`. Use the language toggle in the navbar to switch.

## Build

```bash
npm run build
npm run preview
```

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Import project in Vercel
3. Set environment variable (optional):
   - `VITE_ANTHROPIC_API_KEY` = your Anthropic API key
4. Deploy!

**Important**: Camera access requires HTTPS. Vercel automatically provides HTTPS for all deployments.

### Camera Troubleshooting on Production

If camera doesn't work after deployment:

1. **Check HTTPS**: Ensure you're accessing via `https://` (Vercel does this automatically)
2. **Browser Permissions**: Users must click "Allow" when prompted for camera access
3. **Mobile Browsers**: Use Chrome, Safari, or Edge (avoid in-app browsers)
4. **iOS Safari**: Ensure camera permissions are enabled in iOS Settings
5. **Console Errors**: Check browser DevTools console for specific error messages

See `CAMERA_TROUBLESHOOTING.md` for detailed debugging steps.

### Common Camera Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `NotAllowedError` | Permission denied | Grant camera permission in browser |
| `NotFoundError` | No camera detected | Check device has camera |
| `NotReadableError` | Camera in use | Close other apps using camera |
| `SecurityError` | Not HTTPS | Access via HTTPS (Vercel provides this) |

