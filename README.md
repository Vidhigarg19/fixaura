<p align="center">
  <img src="public/fixaura-logo.png" alt="FixAura Logo" width="80" />
</p>

<h1 align="center">FixAura</h1>

<p align="center">
  <strong>AR-powered AI repair assistant</strong><br/>
  Scan a broken item → get instant AI diagnosis → gather tools → follow AR-guided step-by-step repair
</p>

<p align="center">
  <a href="https://fixaura.vercel.app">Live Demo</a> · 
  <a href="#cloud-architecture">Architecture</a> · 
  <a href="#getting-started">Getting Started</a> · 
  <a href="#api-reference">API Reference</a>
</p>

---

## Overview

FixAura empowers everyday people to diagnose and repair broken household items using AI vision analysis and AR-guided instructions. Users point their camera at a broken object, receive an instant AI-powered diagnosis with confidence scoring, get a safety-first tool checklist, and follow step-by-step repair guidance with AR overlays — all from their browser.

### Key Features

| Feature | Description |
|---------|-------------|
| **AI Vision Scan** | Camera or photo upload → Claude Vision identifies the issue with confidence scoring |
| **Safety-First Guidance** | Critical steps gated behind confirmation prompts; safety warnings at every stage |
| **Tool Checklists** | Auto-generated checklists with essential tool acknowledgment before repair begins |
| **AR Step Overlays** | On-screen highlights, arrows, and zone indicators guide each repair step visually |
| **Voice Commands** | Hands-free navigation via Web Speech API — say "next", "previous", or "capture" |
| **Multilingual** | English + Hindi with instant language switching |
| **Image Upload Fallback** | Upload a photo when camera is unavailable — full flow still works |

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19 | UI framework with lazy-loaded routes |
| TypeScript | 6 | Type safety across the entire codebase |
| Vite | 8 | Build tooling + dev server + HMR |
| Tailwind CSS | v4 | Utility-first styling with `@theme` design tokens |
| Framer Motion | 12 | Page transitions, micro-animations, AnimatePresence |
| React Router | v7 | Client-side routing with animated transitions |
| Lucide React | — | Icon system |
| react-countup | — | Animated statistics counters |
| react-intersection-observer | — | Scroll-triggered reveal animations |

### Backend & Cloud

| Service | Provider | Purpose |
|---------|----------|---------|
| **Auth** | Supabase Auth | Email/password, Google OAuth, Apple Sign-In |
| **Database** | Supabase PostgreSQL | Users, repairs, diagnoses, guides, ratings |
| **Object Storage** | Supabase Storage + AWS S3 | Repair images, AR guide assets |
| **Edge Functions** | Supabase Edge Functions (Deno) | AI proxy, repair plan generation, webhooks |
| **AI Vision** | AWS Bedrock (Claude Sonnet) | Image analysis and diagnosis |
| **AI Repair Plans** | AWS Bedrock (Claude Haiku) | Step-by-step repair generation |
| **CDN** | AWS CloudFront | Global low-latency asset delivery |
| **Async Processing** | AWS SQS + Lambda | Image preprocessing, batch analytics, notifications |
| **Monitoring** | AWS CloudWatch | Logs, metrics, alarms, dashboards |
| **Email/Push** | AWS SES + SNS | Transactional emails, push notifications |
| **Secrets** | AWS Secrets Manager | API keys, credentials (never in client bundle) |

---

## Cloud Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER DEVICE                                    │
│          Browser / PWA  ←──  Camera + Web Speech API                        │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           EDGE / CDN LAYER                                   │
│                                                                              │
│   ┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐    │
│   │   Vercel      │     │   AWS CloudFront      │     │ Supabase Realtime│    │
│   │   Edge Network│     │   (Static Assets/CDN)  │     │ (WebSocket)      │    │
│   └──────┬───────┘     └──────────┬───────────┘     └────────┬─────────┘    │
└──────────┼────────────────────────┼──────────────────────────┼──────────────┘
           │                        │                          │
           ▼                        ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE (Core Backend)                              │
│                                                                              │
│   ┌────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐   │
│   │    Auth     │   │  PostgreSQL   │   │   Storage    │   │    Edge      │   │
│   │            │   │  (Database)   │   │  (Images)    │   │  Functions   │   │
│   │ • Email    │   │              │   │              │   │              │   │
│   │ • Google   │   │ • users      │   │ • repair-    │   │ • /analyze   │   │
│   │ • Apple    │   │ • repairs    │   │   images     │   │ • /plan      │   │
│   │ • JWT/RLS  │   │ • diagnoses  │   │ • guide-     │   │ • /history   │   │
│   │            │   │ • guides     │   │   assets     │   │ • /feedback  │   │
│   │            │   │ • ratings    │   │              │   │              │   │
│   │            │   │ • tools      │   │              │   │              │   │
│   └────────────┘   └──────────────┘   └─────────────┘   └──────┬───────┘   │
│                                                                 │           │
└─────────────────────────────────────────────────────────────────┼───────────┘
                                                                  │
                                                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                             AWS CLOUD                                        │
│                                                                              │
│   ┌──────────────────┐   ┌───────────────────┐   ┌──────────────────────┐   │
│   │   AWS Bedrock     │   │   AWS Lambda       │   │   AWS SQS            │   │
│   │                  │   │                   │   │   (Message Queue)     │   │
│   │ • Claude Sonnet  │   │ • Image resize    │   │                      │   │
│   │   (Vision AI)    │   │ • Batch analysis  │   │ • Async image jobs   │   │
│   │ • Claude Haiku   │   │ • Notification    │   │ • Notification queue  │   │
│   │   (Repair Plans) │   │   dispatcher      │   │ • Analytics events   │   │
│   │ • Titan Embed    │   │ • Analytics agg.  │   │                      │   │
│   │   (Embeddings)   │   │                   │   │                      │   │
│   └──────────────────┘   └───────────────────┘   └──────────────────────┘   │
│                                                                              │
│   ┌──────────────────┐   ┌───────────────────┐   ┌──────────────────────┐   │
│   │   AWS S3          │   │  AWS CloudWatch    │   │   AWS SES + SNS      │   │
│   │                  │   │                   │   │                      │   │
│   │ • Image archive  │   │ • API metrics     │   │ • Email (SES)        │   │
│   │ • Model artifacts│   │ • Error alerts    │   │ • Push notifs (SNS)  │   │
│   │ • Backup storage │   │ • Cost dashboards │   │ • SMS alerts         │   │
│   └──────────────────┘   └───────────────────┘   └──────────────────────┘   │
│                                                                              │
│   ┌──────────────────┐   ┌───────────────────┐                              │
│   │ Secrets Manager   │   │  API Gateway       │                              │
│   │                  │   │                   │                              │
│   │ • Anthropic key  │   │ • Rate limiting   │                              │
│   │ • Supabase keys  │   │ • Throttling      │                              │
│   │ • Service creds  │   │ • API key auth    │                              │
│   └──────────────────┘   └───────────────────┘                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### AI Diagnosis Pipeline

```
User Device                  Supabase                         AWS
───────────                  ────────                         ───

1. Capture photo
   ──────────────────────►  2. Upload to Storage
                               (repair-images bucket)
                                       │
                            3. Edge Function: /analyze
                               • Validate auth (JWT)
                               • Check rate limits
                               • Generate signed URL
                                       │
                                       ├──────────────────►  4. Lambda: preprocess
                                       │                        • Resize to 1280px
                                       │                        • Strip EXIF metadata
                                       │                        • Optimize quality
                                       │                              │
                                       │                     5. Bedrock: Claude Sonnet
                                       │                        • Vision analysis
                                       │                        • Structured JSON output
                                       │                        • Confidence scoring
                                       │                              │
                            6. Store diagnosis ◄─────────────────────┘
                               (PostgreSQL)
                                       │
                            7. Edge Function: /plan
                               ──────────────────────►  8. Bedrock: Claude Haiku
                                                           • Generate repair steps
                                                           • Safety warnings
                                                           • Tool requirements
                                                           • AR overlay zones
                                                                  │
                            9. Store plan ◄────────────────────────┘
                               (PostgreSQL)
                                       │
10. Receive results  ◄────────────────┘
    (via Supabase Realtime)
```

### Security Architecture

```
┌─────────────────────────────────────────────────────┐
│                   SECURITY LAYERS                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─── Client ───────────────────────────────────┐   │
│  │ • No API keys in bundle                      │   │
│  │ • Supabase anon key only (RLS protected)     │   │
│  │ • HTTPS enforced                             │   │
│  │ • CSP headers                                │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─── Supabase ─────────────────────────────────┐   │
│  │ • Row Level Security (RLS) on all tables     │   │
│  │ • JWT verification on Edge Functions         │   │
│  │ • Storage policies (user-scoped buckets)     │   │
│  │ • Rate limiting per user                     │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─── AWS ──────────────────────────────────────┐   │
│  │ • Secrets Manager for all API keys           │   │
│  │ • IAM roles with least-privilege             │   │
│  │ • VPC for Lambda ↔ Bedrock                   │   │
│  │ • API Gateway throttling                     │   │
│  │ • CloudTrail audit logging                   │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Database Schema

### Supabase PostgreSQL

```sql
-- Users (extends Supabase Auth)
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name  TEXT,
  avatar_url    TEXT,
  locale        TEXT DEFAULT 'en',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Repair sessions
CREATE TABLE repairs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT CHECK (status IN ('scanning','diagnosed','repairing','completed','abandoned'))
                DEFAULT 'scanning',
  image_path    TEXT,                    -- Supabase Storage path
  created_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

-- AI diagnosis results
CREATE TABLE diagnoses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id         UUID REFERENCES repairs(id) ON DELETE CASCADE,
  issue_name        TEXT NOT NULL,
  confidence        SMALLINT CHECK (confidence BETWEEN 0 AND 100),
  summary           TEXT,
  severity          TEXT CHECK (severity IN ('low','medium','high')),
  recommended_fix   TEXT,
  recommended_tools TEXT[],
  safety_warning    TEXT,
  explanation       TEXT,
  model_version     TEXT,                -- e.g., 'claude-sonnet-4-20250514'
  latency_ms        INT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Generated repair plans
CREATE TABLE repair_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id  UUID REFERENCES diagnoses(id) ON DELETE CASCADE,
  steps         JSONB NOT NULL,          -- Array of RepairStep objects
  safety_warnings TEXT[],
  tools         JSONB NOT NULL,          -- Array of Tool objects
  model_version TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- User ratings & feedback
CREATE TABLE ratings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id     UUID REFERENCES repairs(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stars         SMALLINT CHECK (stars BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- User tool inventory
CREATE TABLE user_tools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tool_name     TEXT NOT NULL,
  category      TEXT,
  owned         BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tools ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users read own profile"   ON profiles   FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles   FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users read own repairs"   ON repairs    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own repairs" ON repairs    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own ratings"   ON ratings    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own ratings" ON ratings    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own tools"   ON user_tools FOR ALL    USING (auth.uid() = user_id);
```

### Storage Buckets

| Bucket | Access | Policy |
|--------|--------|--------|
| `repair-images` | Private | User can upload/read their own files only |
| `guide-assets` | Public | Read-only for all; admin-write for AR overlay images |

---

## API Reference

### Supabase Edge Functions

#### `POST /functions/v1/analyze`

Uploads an image and triggers AI diagnosis.

```json
// Request
{
  "image": "<base64-encoded-image>",
  "mediaType": "image/jpeg"
}

// Response (200)
{
  "repairId": "uuid",
  "diagnosis": {
    "issueName": "Loose mounting bracket",
    "confidence": 87,
    "summary": "Fastener fatigue pattern detected...",
    "severity": "medium",
    "recommendedFix": "Replace bracket screws...",
    "recommendedTools": ["Phillips screwdriver", "M4 screws", ...],
    "safetyWarning": "Disconnect power before disassembly.",
    "explanation": "Visual cues match common fastener fatigue..."
  }
}
```

#### `POST /functions/v1/plan`

Generates a step-by-step repair plan from a diagnosis.

```json
// Request
{
  "diagnosisId": "uuid"
}

// Response (200)
{
  "planId": "uuid",
  "steps": [
    {
      "id": "prep-1",
      "title": "Prepare workspace",
      "instruction": "Clear the area and lay out tools...",
      "safetyNote": "Disconnect power at the breaker.",
      "requiresConfirmation": true,
      "visualCue": "box",
      "estimatedSeconds": 120
    }
  ],
  "safetyWarnings": ["Disconnect power before disassembly."],
  "tools": [
    { "name": "Phillips screwdriver", "icon": "screwdriver", "optional": false }
  ]
}
```

#### `GET /functions/v1/history`

Returns paginated repair history for the authenticated user.

```json
// Response (200)
{
  "repairs": [
    {
      "id": "uuid",
      "status": "completed",
      "diagnosis": { ... },
      "moneySaved": 95,
      "completedAt": "2026-05-27T12:00:00Z"
    }
  ],
  "total": 12,
  "page": 1
}
```

#### `POST /functions/v1/feedback`

Submits a rating and optional comment for a completed repair.

```json
// Request
{
  "repairId": "uuid",
  "stars": 5,
  "comment": "AR arrows were super helpful!"
}
```

---

## User Flow

```
 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │          │     │          │     │          │     │          │     │          │     │          │
 │ Landing  │────▶│ Capture  │────▶│Diagnosis │────▶│  Tools   │────▶│  Guide   │────▶│   Done   │
 │   /      │     │ /capture │     │/diagnosis│     │  /tools  │     │  /guide  │     │   /done  │
 │          │     │          │     │          │     │          │     │          │     │          │
 └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                   Camera or                         Interactive      AR overlays      Savings +
                   Photo upload     AI confidence     checklist +      + voice          share +
                                    + risk level      safety gates     commands         rating
```

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Marketing page with features, testimonials, stats, CTA |
| `/capture` | Camera Capture | Live camera feed or photo upload with AR scan overlay |
| `/diagnosis` | AI Diagnosis | Issue name, confidence meter, severity, recommended fix |
| `/tools` | Tool Checklist | Interactive checklist with safety tool acknowledgment |
| `/guide` | AR Repair Guide | Step-by-step instructions with AR overlays + voice control |
| `/done` | Completion | Animated celebration, savings metrics, share, rating |

---

## Project Structure

```
fixaura/
├── public/                      # Static assets (logo, favicon, icons)
├── src/
│   ├── main.tsx                 # React root render
│   ├── App.tsx                  # Router + AnimatePresence + locale sync
│   ├── index.css                # Tailwind @theme tokens + keyframes + utilities
│   ├── vite-env.d.ts            # Env types + SpeechRecognition globals
│   │
│   ├── Pages/
│   │   ├── Landing.tsx          # Marketing landing page
│   │   ├── CameraCapture.tsx    # Camera access + photo upload + AI analysis
│   │   ├── Diagnosis.tsx        # AI diagnosis results display
│   │   ├── ToolChecklist.tsx    # Pre-repair tool checklist
│   │   ├── RepairGuide.tsx      # Step-by-step AR-guided repair
│   │   └── Completion.tsx       # Success screen with metrics
│   │
│   ├── components/
│   │   ├── AROverlay.tsx        # AR zone overlay (capture + guide modes)
│   │   ├── CameraDiagnostics.tsx# Camera hardware debug panel
│   │   ├── ConfidenceMeter.tsx  # Animated circular SVG gauge
│   │   ├── FallbackMode.tsx     # Low-confidence warning with retake option
│   │   ├── LanguageToggle.tsx   # EN ↔ HI language switcher
│   │   ├── PageShell.tsx        # Page layout wrapper with transitions
│   │   ├── SafetyBubble.tsx     # Safety confirmation modal
│   │   ├── StepTimeline.tsx     # Vertical step progress indicator
│   │   └── VoiceInput.tsx       # Web Speech API voice commands
│   │
│   ├── services/
│   │   ├── visionAI.ts          # AI image analysis (Bedrock proxy / mock fallback)
│   │   ├── repairPlanner.ts     # Repair plan generator
│   │   └── repairSession.ts     # Session state management
│   │
│   ├── types/
│   │   └── repair.ts            # DiagnosisResult, RepairStep, RepairSession types
│   │
│   └── i18n/
│       ├── index.ts             # Custom i18n: t(), locale store, pub/sub
│       ├── en.json              # English translations
│       └── hi.json              # Hindi translations
│
├── supabase/                    # Supabase project config (future)
│   ├── migrations/              # SQL migration files
│   ├── functions/               # Deno edge functions
│   │   ├── analyze/index.ts     # AI diagnosis proxy
│   │   ├── plan/index.ts        # Repair plan generator
│   │   ├── history/index.ts     # Repair history API
│   │   └── feedback/index.ts    # Rating submission
│   └── config.toml              # Supabase project config
│
├── infra/                       # AWS infrastructure (future)
│   ├── template.yaml            # SAM / CloudFormation template
│   ├── lambda/                  # Lambda function code
│   │   ├── preprocess/          # Image resize + optimize
│   │   └── notify/              # Notification dispatcher
│   └── bedrock/                 # Bedrock model configs + prompts
│
├── tailwind.config.js           # Tailwind v4 theme
├── vite.config.ts               # Vite + React + Tailwind + @ alias
├── vercel.json                  # Vercel: SPA rewrites + Permissions-Policy
├── tsconfig.json                # TypeScript config
└── package.json                 # Dependencies + scripts
```

---

## Design System

### Color Palette (Dark Theme)

| Token | Hex | Preview | Usage |
|-------|-----|---------|-------|
| `background` | `#041329` | 🟫 | Page background — deep navy |
| `surface` | `#112036` | 🟫 | Card and panel backgrounds |
| `surface-high` | `#1C2A41` | 🟫 | Elevated surfaces |
| `primary` | `#00F5D4` | 🟩 | CTAs, glows, accent highlights |
| `primary-light` | `#80F7E0` | 🟩 | Soft highlights |
| `text-primary` | `#D6E3FF` | 🔵 | Main body text |
| `text-secondary` | `#B9CAC4` | ⬜ | Muted text |
| `warning` | `#FFD43B` | 🟨 | Safety warnings |
| `error` | `#FFB4AB` | 🟥 | Error states |
| `success` | `#51CF66` | 🟩 | Completion / success |

### Typography

- **Font**: [Inter](https://fonts.google.com/specimen/Inter) — weights 400, 600, 700, 800
- Fluid type scale using `clamp()` for responsive sizing

### Animations

| Animation | Duration | Usage |
|-----------|----------|-------|
| `fadeIn` | 0.4s | General content reveal |
| `slideUp` | 0.4s | Cards appearing from below |
| `scaleIn` | 0.4s | Modal / dialog entrance |
| `pulse-glow` | 2s ∞ | Capture button glow |
| `float` | 4s ∞ | Floating elements |
| `shimmer` | 1.5s ∞ | Loading skeleton |

---

## i18n (Internationalization)

Custom lightweight system — no external library.

| Language | File | Status |
|----------|------|--------|
| English | `src/i18n/en.json` | ✅ Complete |
| Hindi | `src/i18n/hi.json` | ✅ Complete |

**Usage:**
```tsx
import { t } from '../i18n'

// Dot-notation key lookup
<h1>{t('landing.headline')}</h1>

// Locale persisted to localStorage
import { setLocale, getLocale } from '../i18n'
setLocale('hi')  // Switch to Hindi
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Local Development

```bash
# Clone the repo
git clone https://github.com/Vidhigarg19/fixaura.git
cd fixaura/fixaura

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your keys (optional — app works with mock data)

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_ANTHROPIC_API_KEY` | No | Anthropic API key for live Claude Vision diagnosis. Without it, the app uses realistic mock data. |
| `VITE_SUPABASE_URL` | No* | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | No* | Supabase anon key (safe for client — protected by RLS) |

*\*Required when Supabase backend is connected. App runs fully client-side without them.*

### Build for Production

```bash
npm run build     # TypeScript check + Vite production build
npm run preview   # Preview production build locally
```

---

## Deployment

### Vercel (Frontend)

1. Push code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Set environment variables in Vercel dashboard
4. Deploy — Vercel auto-provides HTTPS (required for camera)

### Supabase (Backend)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Run migrations
supabase db push

# Deploy edge functions
supabase functions deploy analyze
supabase functions deploy plan
supabase functions deploy history
supabase functions deploy feedback
```

### AWS (Infrastructure)

```bash
# Deploy with SAM CLI
cd infra/
sam build
sam deploy --guided

# Required AWS services:
# • Bedrock (Claude model access enabled)
# • S3 bucket for image archival
# • Lambda + SQS for async processing
# • CloudWatch for monitoring
# • Secrets Manager for API keys
# • SES for transactional emails (verified domain required)
```

---

## Camera Troubleshooting

Camera access requires **HTTPS** and **user permission**.

| Error | Cause | Solution |
|-------|-------|----------|
| `NotAllowedError` | Permission denied | Click 🔒 in address bar → Allow camera |
| `NotFoundError` | No camera detected | Use a device with a camera or upload a photo |
| `NotReadableError` | Camera in use | Close other apps using the camera |
| `SecurityError` | Not HTTPS | Access via `https://` (Vercel provides this) |
| Black screen | Stream not attached | Refresh the page; check browser version |

> **Fallback**: If camera is unavailable, the app provides an "Upload a Photo Instead" button for full functionality without camera access.

See [`CAMERA_TROUBLESHOOTING.md`](CAMERA_TROUBLESHOOTING.md) for detailed debugging steps.

---

## Cost Estimation

### Supabase (Free Tier Covers MVP)

| Resource | Free Tier | Estimated Usage |
|----------|-----------|-----------------|
| Database | 500 MB | ~10K repairs |
| Auth | 50K MAU | Sufficient for launch |
| Storage | 1 GB | ~5K images |
| Edge Functions | 500K invocations/mo | ~160K repairs/mo |

### AWS (Pay-Per-Use)

| Service | Cost | Per |
|---------|------|-----|
| Bedrock (Claude Sonnet) | ~$0.003 | per diagnosis (input image + output) |
| Bedrock (Claude Haiku) | ~$0.0003 | per repair plan generation |
| Lambda | ~$0.20 | per 1M invocations |
| S3 | ~$0.023 | per GB/month |
| SQS | Free | first 1M requests/month |
| CloudFront | ~$0.085 | per GB transferred |

**Estimated cost for 10K repairs/month: ~$35–50**

---

## Roadmap

- [x] AI vision diagnosis with Claude
- [x] AR-guided repair steps
- [x] Voice command navigation
- [x] Multilingual support (EN/HI)
- [x] Image upload fallback
- [ ] Supabase Auth integration
- [ ] Persistent repair history
- [ ] User tool inventory
- [ ] Community repair templates
- [ ] PWA with offline support
- [ ] Additional languages (ES, FR, DE)
- [ ] Fine-tuned repair classification model
- [ ] Video-based repair analysis

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is private. All rights reserved.

---

<p align="center">
  <strong>FixAura</strong> — Fix anything. Fear nothing.<br/>
  Built with ❤️ using React, Supabase, and AWS
</p>
