# GetFittr — Session Starter
# Paste this at the beginning of every new Claude Code session.

---

## Who I Am
Single user, personal use only. Data scientist background (Python/Pandas/PySpark),
not a software developer. No OOP expertise. You are doing all the coding.
I will direct, review, and test. I will not write code myself.

## What This Project Is
GetFittr is a personal, local AI workout coaching web app.
It combines:
- Live pose analysis (MediaPipe.js in browser)
- AI coaching and workout planning (Anthropic Claude API)
- Evidence-based bodyweight training (r/bodyweightfitness Recommended Routine)
- RAG pipeline for grounded fitness knowledge (Chroma + BAAI/bge-small)

Read CLAUDE.md in this project for the full spec, data model, tech stack,
progression rules, and coaching hard rules. It is your source of truth.

## Key Decisions Already Made
- Platform: Web browser (desktop first), plain HTML/CSS/JS frontend
- Backend: Python + FastAPI
- Storage: SQLite (local file, single user)
- Pose detection: MediaPipe.js (browser-side only, never server-side)
- Voice: Web Speech API (toggle on/off, built into browser)
- Exercise selection: User tells the app manually (no auto-detection yet)
- Set status: Manual buttons (Start Set / End Set / Rest)
- Progression: RPE-based (😌Easy / 💪Good / 😤Hard / 😵Failed after each set)
- Progression trigger: 3×8 clean reps at RPE ≤7 for 3 consecutive sessions
- Workout split: Full Body 3x/week (non-consecutive days) as default
- App mode: Plans workout first, then coaches through it
- Coaching: Text first, voice toggle from day one

## Fitness Knowledge Rules (NEVER violate)
These come from the r/bodyweightfitness Recommended Routine (evidence-based):
1. Working rep range is 3 sets of 5–8 reps for strength work
2. Progression trigger: 3 consecutive sessions at 3×8, RPE ≤7, no form flags
3. After advancing variation: drop back to 3×5 and rebuild
4. Bodyline drills (plank, hollow hold in warm-up): NOT progressed beyond 60s
5. Never train same muscle group on consecutive days
6. Always include warm-up in every generated session plan
7. Balance push and pull volume — never let one significantly exceed the other
8. No high-rep sit-ups or crunches — use L-sits, hollow holds, hanging leg raises
9. Form quality beats rep count, always

## Progression Trees
PUSH:  Wall → Incline → Knee → Full → Diamond → Archer → One-arm push-up
PULL:  Dead hang → Scapular pull → Negative → Assisted → Full → L-sit pull-up
LEGS:  Assisted squat → Bodyweight squat → Step-up → Deep step-up → Bulgarian split → Pistol
CORE:  Plank → Extended plank → Side plank → Hollow hold → L-sit (foot → one foot → tucked → full)

## Current Build Status
[UPDATE THIS SECTION AT THE START OF EACH SESSION]

Phase 1 — Foundation: [ ] NOT STARTED / [~] IN PROGRESS / [✅] COMPLETE
Phase 2 — AI Coach:   [ ] NOT STARTED
Phase 3 — The Eyes:   [ ] NOT STARTED
Phase 4 — Polish:     [ ] NOT STARTED

Last completed task: [describe what was done last session]
Next task: [describe what to do this session]

## How We Work Together
- One task per prompt. Never ask for multiple features at once.
- Use Plan Mode for any new feature (Shift+Tab twice before prompting).
- After each completed task: git add . && git commit -m "clear message" && git push
- If something breaks, say what broke and what you were doing. Don't keep building on broken code.
- Explain what you're going to do before touching files when the task is complex.
- Never install packages not in requirements.txt without adding them first.
- Never hardcode the API key. Always use .env via python-dotenv.
