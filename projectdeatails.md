🔧 FixAura — AI-Guided Home Repair Assistant

Hackathon Project · Computer Vision + Generative AI + AR UI
Turn any broken home object into a guided, step-by-step repair experience — right from your phone camera.


📌 The Problem
Most people face DIY anxiety when something breaks at home. Whether it's a leaking tap, a loose switch cover, or furniture assembly gone wrong — the usual options are:

Watch a 20-minute YouTube video that doesn't match your exact problem
Read a confusing manual full of jargon
Call a technician for something you could've fixed yourself

The result: wasted time, money spent unnecessarily, or worse — making the problem worse by guessing.

💡 The Solution
FixAura is an AI-powered repair assistant that uses your phone camera to:

Identify the broken object or issue using computer vision
Diagnose the problem and explain it in plain, local language
Guide you through a step-by-step repair with animated overlays, AR arrows, and progress tracking
Protect you with safety bubbles that force acknowledgment before any risky action

No manuals. No videos. Just point, scan, and fix.

🎥 Demo Scenario (Hackathon MVP)
Chosen repair: Leaking Tap
StageWhat HappensScanUser points phone at the tap; AI detects it and highlights with an AR bounding boxDiagnosis"Your tap washer appears worn. Estimated fix time: 15 minutes. Difficulty: Easy."Tool ListWrench, replacement washer, cloth — displayed as a checklistStep 1AR arrow points to the water shutoff valve → "Turn clockwise to close"Step 2 ⚠️Safety bubble appears → "You are about to open the tap body. Make sure water is OFF. Tap to confirm."Step 3–6Each step guided with AR highlights, zoom hints, and a progress barDoneCompletion screen with confidence score and a "Was this helpful?" prompt

🧠 Key AI Features
1. Visual Diagnosis

User captures an image of the broken object
Sent to a multimodal AI vision model (e.g., Claude claude-sonnet-4-20250514 via Anthropic API)
Model returns: object type, likely issue, severity, and recommended action

2. Repair Plan Generation

Based on diagnosis, AI generates a structured repair plan:

Tool and material checklist
Step-by-step instructions
Estimated time and difficulty rating
Safety warnings per step



3. Safety Detection

Each step is tagged as safe or risky by the AI
Risky steps trigger a Safety Bubble — a floating UI element the user must tap to proceed
Examples of risky steps: turning off a circuit breaker, opening electrical panels, using sharp tools

4. Voice Support (Hands-Free Mode)

User can ask follow-up questions by voice while hands are occupied
Example: "What if I don't have a wrench?" → AI suggests alternatives
Text input fallback always available

5. Confidence Meter

AI displays how confident it is about the diagnosis (e.g., 87%)
If confidence drops below a threshold, the app switches to Fallback Mode


🖼️ UI / UX Design
Crazy UI Elements
🟡 Confidence Meter
A circular progress indicator displayed on the diagnosis screen showing how certain the AI is about its identification. Color-coded: green (>75%), yellow (50–75%), red (<50%).
🔴 Safety Bubbles
Floating confirmation buttons that appear over the camera feed before any hazardous step. The user must physically tap "I understand, continue" before the app proceeds. Cannot be skipped.
🔵 AR Arrows and Highlight Circles
Overlaid on the live camera feed to show exactly:

Where to place the tool
Which component to turn, open, or press
Which direction to rotate or pull

📊 Step Timeline
A horizontal progress bar at the top of the screen:
[Find Tool] → [Shut Water] → [Open Tap] → [Replace Washer] → [Reassemble] → [Test]
Each stage lights up as completed.
🚨 Fallback Mode
If AI confidence is too low or the user taps "I'm stuck":

App shows: "This might need a professional. Here's what to tell them."
Or: "Here's a safer workaround."


🗺️ User Flow
App Opens
    │
    ▼
[Tap "Scan Problem"]
    │
    ▼
Camera Opens → User points at broken object
    │
    ▼
Image captured → Sent to AI Vision Model
    │
    ▼
AI returns diagnosis + confidence score
    │
    ▼
Diagnosis Screen:
  - Object identified
  - Problem described
  - Difficulty + time estimate
  - Confidence meter
    │
    ▼
Tool Checklist Screen
  - User confirms they have tools (checkbox UI)
    │
    ▼
Step-by-Step Guided Repair
  - Live camera feed
  - AR overlays (arrows, highlights)
  - Step timeline at top
  - Safety bubble on risky steps
    │
    ├─ [User asks follow-up] → Voice/text → AI answers inline
    │
    └─ [Low confidence / stuck] → Fallback Mode
    │
    ▼
Completion Screen
  - All steps done ✓
  - "Was your repair successful?" feedback
  - Option to share or save repair report

🛠️ Tech Stack
LayerTechnologyFrontendReact Native (iOS + Android) or FlutterCamera & ARReact Native Vision Camera / ARKit / ARCoreAI VisionAnthropic Claude claude-sonnet-4-20250514 API (multimodal)Repair Plan GenerationClaude claude-sonnet-4-20250514 via structured promptVoice InputWhisper API or native device speech recognitionBackend (optional)Node.js / FastAPI for session loggingConfidence ScoringExtracted from AI model response metadata
AI Prompt Design (Simplified)
Vision Diagnosis Prompt:
You are a home repair expert. Analyze this image and return:
1. Object identified
2. Likely problem
3. Severity (low/medium/high)
4. Estimated fix time
5. Difficulty level (beginner/intermediate/expert)
6. Confidence score (0–100)
7. Whether professional help is recommended
Return as structured JSON.
Step Generation Prompt:
Given this repair: [diagnosis]
Generate a step-by-step repair guide with:
- Tool list
- Each step (title, instruction, is_risky: true/false, safety_note if risky)
- Total estimated time
Keep language simple. User is a non-expert.

📦 MVP Scope (Hackathon Build)
For the hackathon, scope is intentionally tight:
FeatureIn MVP1 repair category (leaking tap)✅Image capture and AI diagnosis✅Step-by-step text guide✅Safety bubble interaction✅Confidence meter display✅Voice follow-up question✅AR overlays on live camera⚠️ Simulated / prototypeMultiple repair categories❌ Post-hackathonOffline mode❌ Post-hackathonUser accounts / repair history❌ Post-hackathon

🌍 Language Support
MVP supports 2 languages:

English
Hindi (हिन्दी)

Language is detected from device locale. All AI prompts instruct the model to respond in the user's selected language. The UI labels are pre-translated.

🔒 Safety Design Philosophy
FixAura treats user safety as a first-class feature, not an afterthought:

Mandatory confirmation before every step tagged as risky
Clear escalation path — the app never encourages users to attempt repairs beyond their confidence level
Fallback messaging always includes: "Call a licensed technician" as a valid, non-stigmatized option
Electrical steps always include a power shutoff verification before proceeding
Water steps always verify shutoff valve is closed before any pipe work


🏆 Why This Wins at a Hackathon
Judging CriteriaHow FixAura ScoresDemo-abilityCamera + AR overlays + safety bubble = visually impressive in 2 minutesReal-world impactSolves an everyday problem billions of people faceAI integrationVision model + text generation + voice — not a gimmick, core to the productUI innovationSafety bubbles, AR arrows, and confidence meter are memorable and novelExplainability"Point camera at broken thing, get step-by-step fix" — judges get it instantlyFeasibilityA polished 1-scenario prototype is buildable in 24–48 hours

🚀 Future Roadmap (Post-Hackathon)

10+ repair categories: plumbing, electrical, appliances, furniture, HVAC
Community repair library: crowdsourced repair plans with upvotes
Technician connect: if AI can't help, connect to a vetted local expert in-app
Parts ordering: detect part needed → link to buy it from Amazon/local store
Repair history: log of all repairs done, estimated money saved
Multilingual expansion: 10+ Indian and global languages
Wearable support: Apple Watch confirmation taps during hands-free repair


👥 Team
RoleResponsibilitiesAI/Backend EngineerAnthropic API integration, prompt design, structured output parsingFrontend/Mobile DeveloperReact Native UI, camera integration, AR overlaysUI/UX DesignerSafety bubble design, step flow, AR visual languageProduct/Demo LeadDemo script, pitch deck, user testing

📁 Project Structure
FixAura/
├── app/
│   ├── screens/
│   │   ├── ScanScreen.tsx        # Camera capture
│   │   ├── DiagnosisScreen.tsx   # AI result + confidence meter
│   │   ├── ToolChecklist.tsx     # Pre-repair checklist
│   │   ├── RepairGuide.tsx       # Step-by-step with AR overlays
│   │   └── CompletionScreen.tsx  # Done state + feedback
│   ├── components/
│   │   ├── SafetyBubble.tsx      # Confirmation overlay
│   │   ├── ConfidenceMeter.tsx   # Circular progress
│   │   ├── StepTimeline.tsx      # Horizontal progress bar
│   │   └── AROverlay.tsx         # Arrows and highlight boxes
│   └── services/
│       ├── visionAI.ts           # Image → diagnosis API call
│       ├── repairPlanner.ts      # Diagnosis → step plan API call
│       └── voiceInput.ts         # Speech recognition handler
├── backend/ (optional)
│   ├── api/
│   │   ├── diagnose.py
│   │   └── generate_steps.py
│   └── prompts/
│       ├── vision_prompt.txt
│       └── step_generator_prompt.txt
├── assets/
│   ├── icons/
│   └── demo/                     # Pre-recorded demo images/video
├── README.md
└── DEMO_SCRIPT.md

📄 License
MIT License — built for hackathon purposes. See LICENSE for details.

Built with ❤️ and a broken tap at 2am.