# 🔧 FixAura — AI-Guided Home Repair Assistant

**Hackathon Project** · Computer Vision + Generative AI + AR-style Web UI  
**Tagline:** Fix anything. Fear nothing.

Turn any broken home object into a guided, step-by-step repair experience — right from your browser.

---

## 📌 The Problem

Most people face **DIY anxiety** when something breaks at home. Whether it's a leaking tap, loose switch cover, or furniture assembly gone wrong — the usual options are:

- Watch a 20-minute YouTube video that doesn't match your exact problem
- Read a confusing manual full of jargon
- Call a technician for something you could've fixed yourself

**The result:** Wasted time, money spent unnecessarily, or worse — making the problem worse by guessing.

---

## 💡 The Solution

**FixAura** is an AI-powered web app that uses your browser camera to:

1. **Identify** the broken object or issue using computer vision
2. **Diagnose** the problem and explain it in plain language (English + Hindi)
3. **Guide** you through step-by-step repair with animated AR-style overlays, arrows, and progress tracking
4. **Protect** you with safety bubbles that force acknowledgment before any risky action

**No manuals. No app installs. No videos.** Just open the browser, point, and fix.

---

## 🌐 Why a Web App?

| Advantage      | Detail                                                    |
|----------------|-----------------------------------------------------------|
| Zero install   | Opens instantly in any browser — judges can try it live   |
| Cross-platform | Works on phone, tablet, and laptop equally                |
| Fast to build  | React + Vite, no App Store approval, deploy in minutes    |
| Camera access  | `MediaDevices.getUserMedia()` gives full webcam access    |
| AR overlays    | CSS/Canvas overlays on video feed simulate AR without SDKs|
| Voice input    | Web Speech API built into Chrome, Edge, and Safari        |
| Easy deploy    | Vercel or Netlify — one push, live URL, shareable instantly|

---

## 🎥 Demo Scenario (Hackathon MVP)

**Chosen repair:** Leaking Tap

| Stage      | What Happens                                                                 |
|------------|------------------------------------------------------------------------------|
| **Scan**   | User clicks "Scan Problem" → browser asks camera permission → camera opens   |
| **Capture**| User frames the tap → clicks "Capture" → image sent to AI                    |
| **Diagnosis**| "Your tap washer appears worn. Estimated fix time: 15 minutes. Difficulty: Easy." + confidence meter |
| **Tool List**| Wrench, replacement washer, cloth — displayed as interactive checklist      |
| **Step 1** | Animated arrow overlaid on camera frame → "Turn shutoff valve clockwise"     |
| **Step 2 ⚠️**| Safety bubble appears → "Make sure water is OFF. Click to confirm."         |
| **Steps 3–6**| Each step guided with highlight boxes, zoom hints, progress timeline       |
| **Done**   | Completion screen with cost saved estimate + "Was this helpful?" prompt     |

---

## 🧠 Key AI Features

### 1. Visual Diagnosis
- User captures image via browser camera (`<video>` + `<canvas>` capture)
- Image encoded as base64 and sent to **Claude Sonnet 4** via Anthropic API
- Model returns: object type, likely issue, severity, confidence score, recommended action

### 2. Repair Plan Generation
- Based on diagnosis, AI generates structured repair plan:
  - Tool and material checklist
  - Step-by-step instructions in plain language
  - Estimated time and difficulty rating
  - `is_risky` flag and safety note per step

### 3. Safety Detection
- Each step tagged as safe or risky by AI in JSON response
- Risky steps trigger a **Safety Bubble** — full-screen overlay user must confirm before proceeding
- Cannot be bypassed or auto-dismissed

### 4. Voice Support (Hands-Free Mode)
- Uses **Web Speech API** (`SpeechRecognition`) — no external dependency
- User clicks mic icon and asks: "What if I don't have a wrench?"
- AI responds inline in step view
- Text input always available as fallback

### 5. Confidence Meter
- AI returns `confidence_score` (0–100) in JSON response
- Displayed as animated circular meter on diagnosis screen
- Below 50%: app shifts to **Fallback Mode** automatically

---

## 🖼️ UI / UX Design

### Signature UI Elements

#### 🟡 Confidence Meter
Animated circular progress ring on diagnosis card. Color transitions:
- 🟢 **Green:** >75% — "AI is confident"
- 🟡 **Yellow:** 50–75% — "Possible match"
- 🔴 **Red:** <50% — triggers Fallback Mode

#### 🔴 Safety Bubbles
Full-screen modal overlay with pulsing red border before hazardous steps. Confirm button activates after **2-second delay** to prevent accidental clicks. Cannot be closed without confirming or going back.

#### 🔵 AR-Style Arrows & Highlight Boxes
CSS-animated SVG arrows and glowing div borders overlaid on live `<video>` element using absolute positioning. Point to relevant areas with bounce animation.

#### 📊 Step Timeline
Sticky horizontal progress bar at top of repair screen:
● Find Tool → ● Shut Water → ○ Open Tap → ○ Replace Washer → ○ Test

text
- Completed steps: show checkmark ✓
- Current step: pulses
- Upcoming steps: greyed out

#### 🚨 Fallback Mode
Triggers when confidence < 50% or user clicks "I'm stuck":
- Displays: "This might need a professional. Here's what to tell them."
- Shows simplified safe-action checklist
- Offers "Find a technician near me" CTA (links to Google Maps)

---

## 🗺️ User Flow
Browser Opens FixAura URL
│
▼
Landing Page
[Scan Problem] button
│
▼
Camera Permission Request
(MediaDevices.getUserMedia)
│
▼
Live Camera Feed (<video> element)
[Capture Image] button
│
▼
Image → base64 → Anthropic API (Claude Vision)
│
▼
Diagnosis Screen
├── Object identified
├── Problem description
├── Difficulty + time estimate
└── Confidence meter
│
▼
Tool Checklist
(User checks off available tools)
│
▼
Step-by-Step Repair Guide
├── Live camera feed in background
├── AR-style CSS overlays (arrows, highlights)
├── Step timeline at top
├── Safety bubble on risky steps
├── [Mic] Voice follow-up → Web Speech API → AI inline response
└── [I'm stuck] → Fallback Mode
│
▼
Completion Screen
├── All steps done ✓
├── Estimated cost saved: ₹800
└── "Was your repair successful?" feedback

text

---

## 🛠️ Tech Stack

| Layer              | Technology                                           |
|--------------------|------------------------------------------------------|
| Framework          | React 18 + Vite                                      |
| Styling            | Tailwind CSS + Framer Motion (animations)            |
| Camera             | `MediaDevices.getUserMedia()` Web API                |
| Image Capture      | HTML5 `<canvas>` snapshot from `<video>` feed        |
| AR Overlays        | CSS absolute-positioned SVG + animated divs over video|
| AI Vision & Plan   | Anthropic Claude Sonnet 4 API (multimodal)           |
| Voice Input        | Web Speech API (`window.SpeechRecognition`)          |
| Deployment         | Vercel (one-command deploy)                          |
| Language Toggle    | i18next (English + Hindi)                            |

**No backend required for MVP** — all API calls go directly from browser to Anthropic API. API key stored in `.env` as `VITE_ANTHROPIC_API_KEY`.

> ⚠️ **For production:** Proxy API calls through lightweight backend (Express or Next.js API routes) to keep key server-side.

---

## 🤖 AI Prompt Design

### Vision Diagnosis Prompt

```text
You are a home repair expert assistant.
Analyze the provided image and return ONLY a JSON object with these fields:
{
  "object": "string — what object is in the image",
  "problem": "string — the likely issue in simple language",
  "severity": "low | medium | high",
  "fix_time_minutes": number,
  "difficulty": "beginner | intermediate | expert",
  "confidence_score": number between 0 and 100,
  "needs_professional": boolean,
  "tools_needed": ["tool1", "tool2"]
}
Do not include any text outside the JSON object.
```

### Step Generation Prompt

```text
You are a home repair guide assistant.
Given this repair diagnosis: [INSERT DIAGNOSIS JSON]

Return ONLY a JSON object:
{
  "steps": [
    {
      "step_number": 1,
      "title": "short title",
      "instruction": "clear instruction in simple language",
      "is_risky": false,
      "safety_note": "only present if is_risky is true"
    }
  ],
  "total_time_minutes": number
}
Do not include any text outside the JSON object.
Respond in [LANGUAGE].
```

---

## 📦 MVP Scope (Hackathon Build)

| Feature                     | In MVP | Notes                              |
|-----------------------------|--------|------------------------------------|
| Browser camera capture      | ✅     | `getUserMedia` API                 |
| AI image diagnosis          | ✅     | Claude Vision via Anthropic API    |
| Step-by-step repair guide   | ✅     | Generated from AI JSON             |
| Safety bubble interaction   | ✅     | Blocking modal with 2s delay       |
| Confidence meter            | ✅     | Animated CSS ring                  |
| Step timeline progress bar  | ✅     | Sticky top bar                     |
| Voice follow-up questions   | ✅     | Web Speech API                     |
| AR-style CSS overlays       | ✅     | CSS + SVG over video               |
| English + Hindi language    | ✅     | i18next                            |
| 1 repair category (tap)     | ✅     | Demo focus                         |
| Fallback mode               | ✅     | Triggers at low confidence         |
| Multiple categories         | ❌     | Post-hackathon                     |
| User accounts / history     | ❌     | Post-hackathon                     |
| Real native AR (WebXR)      | ❌     | Post-hackathon                     |
| Backend API proxy           | ❌     | Direct browser calls for MVP       |

---

## 📁 Project Structure
fixaura/
├── public/
│ └── favicon.ico
├── src/
│ ├── pages/
│ │ ├── Landing.tsx # Home screen with "Scan Problem" CTA
│ │ ├── CameraCapture.tsx # Live camera + capture button
│ │ ├── Diagnosis.tsx # AI result + confidence meter
│ │ ├── ToolChecklist.tsx # Pre-repair tool checklist
│ │ ├── RepairGuide.tsx # Step-by-step + AR overlays
│ │ └── Completion.tsx # Done screen + cost saved
│ ├── components/
│ │ ├── SafetyBubble.tsx # Blocking confirmation modal
│ │ ├── ConfidenceMeter.tsx # Animated circular ring
│ │ ├── StepTimeline.tsx # Sticky horizontal progress bar
│ │ ├── AROverlay.tsx # CSS arrows + highlight boxes over video
│ │ ├── VoiceInput.tsx # Web Speech API mic button
│ │ └── FallbackMode.tsx # Low-confidence fallback card
│ ├── services/
│ │ ├── visionAI.ts # Image → base64 → Claude API → diagnosis
│ │ └── repairPlanner.ts # Diagnosis → steps → JSON
│ ├── i18n/
│ │ ├── en.json # English strings
│ │ └── hi.json # Hindi strings
│ ├── App.tsx
│ └── main.tsx
├── .env # VITE_ANTHROPIC_API_KEY=sk-ant-...
├── .env.example
├── index.html
├── tailwind.config.js
├── vite.config.ts
├── package.json
└── README.md

text

---

## ⚡ Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/your-team/fixaura.git
cd fixaura

# 2. Install dependencies
npm install

# 3. Add your Anthropic API key
cp .env.example .env
# Edit .env and add: VITE_ANTHROPIC_API_KEY=sk-ant-your-key-here

# 4. Start the dev server
npm run dev

# 5. Open in browser — allow camera access when prompted
# http://localhost:5173
```

### Deploy to Vercel (1 minute)

```bash
npm install -g vercel
vercel
# Add VITE_ANTHROPIC_API_KEY in Vercel dashboard → Settings → Environment Variables
```

---

## 🌍 Language Support

MVP supports **2 languages** toggled via button in top navigation:

| Language | Code | Status |
|----------|------|--------|
| English  | en   | ✅     |
| Hindi    | hi   | ✅     |

Selected language is passed into AI prompt so repair instructions are returned in correct language.

---

## 🔒 Safety Design Philosophy

FixAura treats **user safety as a first-class feature**:

- Mandatory confirmation before every step tagged as `is_risky: true`
- **2-second confirm delay** on safety bubbles — prevents accidental clicks
- Fallback messaging always surfaces "Call a licensed technician" as valid option
- Electrical steps always include power shutoff verification before proceeding
- Water steps always verify shutoff valve is closed before any pipe work
- **Low confidence = stop** — app never encourages guessing on ambiguous diagnoses

---

## 🏆 Why This Wins at a Hackathon

| Judging Criteria   | How FixAura Scores                                                      |
|--------------------|-------------------------------------------------------------------------|
| Demo-ability       | Live camera + animated overlays + safety bubble = visually impressive   |
| Real-world impact  | Solves everyday problem millions of households face                     |
| AI integration     | Vision + text generation + voice — AI is the product, not a feature     |
| UI innovation      | Safety bubbles, confidence meter, AR overlays are memorable & novel     |
| Explainability     | "Open browser, point camera at broken thing, get guided fix" — instant  |
| Feasibility        | Fully buildable in 24–48 hours with no native app complexity            |
| Accessibility      | No install, no account, works on any device with browser + camera       |

---

## 🚀 Future Roadmap (Post-Hackathon)

- 10+ repair categories: plumbing, electrical, appliances, furniture, HVAC
- WebXR integration: true AR overlays using WebXR Device API
- Community repair library: crowdsourced repair plans with upvotes
- Technician connect: if AI can't help, connect to vetted local expert in-app
- Parts ordering: detect part needed → link to buy from Amazon/local store
- Repair history: log of repairs done, estimated money saved over time
- Multilingual expansion: 10+ Indian regional languages
- Backend + auth: save repair history across sessions

---

## 👥 Team Roles

| Role              | Responsibilities                                                                 |
|-------------------|----------------------------------------------------------------------------------|
| AI Engineer       | Anthropic API integration, prompt design, JSON parsing, confidence logic         |
| Frontend Developer| React pages, Tailwind styling, Framer Motion animations, camera feed             |
| UI/UX Developer   | AR overlay components, safety bubble, confidence meter, step timeline            |
| Product/Demo Lead | Demo script, pitch deck, language strings, user testing                          |

---

## 🎬 Demo Script (2 Minutes)

- **(0:00)** "Most people don't fix things at home because they're scared they'll make it worse. FixAura changes that — and it works right in your browser."
- **(0:15)** Open `fixaura.vercel.app` → click "Scan Problem" → allow camera
- **(0:25)** Point at dripping tap → click Capture → confidence meter animates to 89% → diagnosis card appears
- **(0:40)** "Worn tap washer. 15 min fix. Beginner level." Tool checklist appears → check off wrench and washer
- **(0:55)** Step 1: AR arrow pulses over camera feed pointing at shutoff valve
- **(1:10)** Step 2: Safety bubble fills screen with red pulsing border → "Water off? Click to confirm." — 2-second delay, then click
- **(1:25)** Steps 3–5: highlight boxes and arrows guide through each action, step timeline advances
- **(1:40)** Click mic → ask "What if my wrench doesn't fit?" → AI answers inline
- **(1:52)** Completion screen → "Estimated plumber cost saved: ₹800."
- **(2:00)** "No app. No manual. No plumber. That's FixAura."

---

## 📄 License

MIT License — built for hackathon purposes. See [LICENSE](LICENSE) for details.

---

**Built with ❤️ and a broken tap at 2am.**