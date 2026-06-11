# GetFittr — Personal AI Workout Companion

## What This App Is

A personal, local web-based workout coaching app for a single user.
It combines live pose analysis (MediaPipe.js), AI coaching (Anthropic Claude API),
and evidence-based bodyweight training principles (r/bodyweightfitness Recommended Routine).

This is NOT a SaaS product. It runs entirely on the user's local machine.
No authentication. No deployment. No public access. One user only.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Plain HTML + CSS + JavaScript (no frameworks, no build tools) |
| Pose Engine | MediaPipe Pose Landmarker (runs in browser via CDN) |
| Voice | Web Speech API (browser built-in, toggle on/off) |
| Backend | Python 3.11+ with FastAPI |
| AI Coaching | Anthropic Claude API (model: Configurable via CLAUDE_MODEL env var (default: claude-haiku-4-5-20251001 for dev)) |
| Fitness Knowledge | RAG — all-MiniLM-L6-v2 embeddings (sentence-transformers, local) + Chroma vector store |
| Storage | SQLite (single local file) |
| Env vars | python-dotenv (.env file, never committed) |

---

## Project Structure

```
getfittr/
├── CLAUDE.md                  ← You are here
├── .env                       ← API keys (NEVER commit this)
├── .gitignore
├── requirements.txt
├── backend/
│   ├── main.py                ← FastAPI app entry point, all routes
│   ├── database.py            ← SQLite setup, all queries, schema
│   ├── models.py              ← Pydantic request/response models
│   ├── coach.py               ← Claude API calls: planning + coaching
│   ├── rag.py                 ← Chroma vector store + embedding logic
│   └── exercises.py           ← Exercise knowledge: trees, thresholds, form rules
├── frontend/
│   ├── index.html             ← App shell and navigation
│   ├── style.css              ← All styles (no external CSS frameworks)
│   ├── app.js                 ← Main app logic, routing, state
│   ├── pose.js                ← MediaPipe integration, landmark processing
│   └── voice.js               ← Web Speech API wrapper
├── data/
│   ├── getfittr.db            ← SQLite database (gitignored)
│   ├── knowledge/             ← Plain text fitness docs for RAG indexing
│   │   ├── bwf_progressions.txt
│   │   ├── rpe_guidelines.txt
│   │   └── recovery_principles.txt
│   └── chroma/                ← Chroma vector store (gitignored)
└── scripts/
    └── seed_knowledge.py      ← One-time script to build the RAG index
```

---

## Database Schema

### `user_profile` (single row)
```sql
CREATE TABLE user_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT,
    age INTEGER,
    height_cm REAL,
    weight_kg REAL,
    fitness_level TEXT,        -- 'beginner', 'intermediate', 'advanced'
    goals TEXT,                -- JSON array: ['strength', 'endurance', 'weight_loss']
    injuries TEXT,             -- JSON array of injury notes
    rest_days TEXT,            -- JSON array: ['saturday', 'sunday']
    available_equipment TEXT DEFAULT '["none"]',  -- JSON array: ['pullup_bar', 'none']
    diet_module_enabled INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);
```

### `exercises` (seeded at startup)
```sql
CREATE TABLE exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,             -- 'push','pull','legs','hinge','core','mobility','cardio'
    muscle_groups TEXT,        -- JSON array
    difficulty INTEGER,        -- 1 (easiest) to 10 (hardest)
    variation_order INTEGER,   -- Position in progression tree
    parent_exercise_id INTEGER,-- Previous variation in tree (NULL = first/standalone)
    next_exercise_id INTEGER,  -- Next variation in tree (NULL = last/standalone)
    movement_type TEXT DEFAULT 'strength',  -- 'strength','pilates','mobility','cardio','skill'
    equipment_needed TEXT DEFAULT 'none',   -- 'none','pullup_bar','low_bar','anchor','parallel_bars'
    image_url TEXT,            -- relative path to SVG line-art for exercise (NULL until populated)
    form_cues TEXT,            -- JSON array of coaching cues
    FOREIGN KEY (parent_exercise_id) REFERENCES exercises(id),
    FOREIGN KEY (next_exercise_id) REFERENCES exercises(id)
);
```

### `sessions`
```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    session_type TEXT,         -- 'full_body', 'upper', 'lower', 'custom'
    overall_rpe REAL,
    coach_notes TEXT,          -- Claude-generated post-session feedback
    manually_entered INTEGER DEFAULT 0,  -- 1 = historical backfill
    created_at TEXT
);
```

### `session_sets`
```sql
CREATE TABLE session_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    set_number INTEGER,
    reps_completed INTEGER,
    duration_seconds INTEGER,  -- For holds (plank, L-sit)
    rpe INTEGER,               -- 1-10, user-reported after set
    form_score REAL,           -- 0.0-1.0, from pose analysis (NULL if manual)
    form_flags TEXT,           -- JSON array: ['knee_caving', 'hip_drop']
    camera_used INTEGER DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);
```

### `exercise_progress`
```sql
CREATE TABLE exercise_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    avg_rpe REAL,
    avg_form_score REAL,
    max_reps INTEGER,
    total_sets INTEGER,
    progression_ready INTEGER DEFAULT 0,  -- 1 = Claude has flagged for upgrade
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);
```

### `diet_log` (optional module — ignored if diet_module_enabled = 0)
```sql
CREATE TABLE diet_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    calories_target INTEGER,
    calories_actual INTEGER,
    protein_g REAL,
    carbs_g REAL,
    fats_g REAL,
    notes TEXT
);
```

---

## Fitness Knowledge Base (Evidence-Based — DO NOT INVENT)

All coaching logic must be grounded in these principles. When uncertain, retrieve
from the RAG knowledge base before generating any recommendation.

### Progression Trees (r/bodyweightfitness Recommended Routine)

```
PUSH:  Wall Push-up → Incline Push-up → Knee Push-up → Full Push-up
       → Diamond Push-up → Archer Push-up → One-Arm Push-up

PULL:  Dead Hang → Scapular Pull → Negative Pull-up → Jumping/Assisted Pull-up
       → Full Pull-up → L-sit Pull-up → Weighted Pull-up

LEGS:  Assisted Squat → Bodyweight Squat → Step-up → Deep Step-up
       → Bulgarian Split Squat → Pistol Squat

CORE:  Plank (hold) → Extended Plank → Side Plank → Hollow Hold
       → L-sit (foot supported → one foot → tucked → full)

HINGE: Romanian Deadlift → Single-Leg RDL → Nordic Curl
```

### Progression Rules (HARD — follow exactly)

1. Working rep range: **3 sets of 5–8 reps** for strength exercises
2. **Progression trigger**: 3 consecutive sessions completing 3×8 at RPE ≤ 7 with no form flags
3. **After progression**: drop to 3×5 of the harder variation and rebuild
4. **Hold progressions** (plank, L-sit): build from 3×10s to 3×30s before advancing
5. **Bodyline drills** (daily warm-up plank, hollow hold): NOT progressed. Hold once comfortably up to 60s. Do not increase beyond 60s — they serve as movement prep only.
6. **Never increase both reps AND variation difficulty in the same session**

### RPE Scale (user self-report after each set)

| Rating | Label | RPE | App Action |
|---|---|---|---|
| 😌 | Easy | 1–5 | +1-2 reps next session |
| 💪 | Good | 6–7 | Maintain — optimal training zone |
| 😤 | Hard | 8–9 | Hold reps, focus on form |
| 😵 | Failed | 10 | Reduce reps, flag for form review |

### Session Structure (per BWF RR)

```
1. Warm-up (10–15 min)
   - Dynamic stretches: shoulder rolls, hip circles, leg swings
   - Bodyline drills: plank, side plank, hollow hold (once each, up to 60s)

2. Skill Work (optional, 5–10 min)
   - L-sit progression practice
   - (Handstand — only if user has progressed to this level)

3. Strength Work — 3 paired supersets, 90s rest between exercises
   - Pair A: Vertical Pull (pull-up progression) + Vertical Push (dip/overhead)
   - Pair B: Squat progression + Core hold (L-sit progression)
   - Pair C: Horizontal Push (push-up) + Horizontal Pull (row)

4. Cool-down (5 min)
   - Light stretching of worked muscles
```

### Coaching Hard Rules (NEVER violate these)

1. **No same-muscle training on consecutive days.** Minimum 1 rest day between sessions targeting same muscle group.
2. **Always include warm-up** in every generated session plan. Never skip it.
3. **Form quality > rep count.** A clean 5-rep set is better than a sloppy 8-rep set.
4. **Balanced push/pull.** Horizontal push volume should never exceed horizontal pull volume significantly. Flag imbalances.
5. **No high-rep crunches or sit-ups.** Use L-sits, hollow holds, hanging leg raises instead. This is evidence-based.
6. **Do not recommend exercises the user has flagged as injured.** Always check injury list before generating plans.
7. **3x/week is optimal for this routine.** Never plan more than 4 sessions/week for a full-body routine.
8. **Rest days are when muscles grow.** Never frame rest as "doing nothing" — frame it positively.

---

## Pose Analysis (MediaPipe Pose Landmarker)

MediaPipe runs **entirely in the browser** via CDN. Never process pose server-side.

Key landmark indices used:
```
Nose: 0 | Left Eye: 1 | Right Eye: 2
Left Shoulder: 11 | Right Shoulder: 12
Left Elbow: 13 | Right Elbow: 14
Left Wrist: 15 | Right Wrist: 16
Left Hip: 23 | Right Hip: 24
Left Knee: 25 | Right Knee: 26
Left Ankle: 27 | Right Ankle: 28
```

Per-exercise form checks (build these out in exercises.js):

**Push-up:**
- Elbow angle at bottom: should reach ~90°. Flag if > 110° (not deep enough)
- Hip alignment: shoulder-hip-ankle should be straight. Flag if hips sag > 15° or pike > 15°
- Head position: nose should align with spine. Flag if head drops or cranes

**Squat:**
- Knee tracking: knee should follow toe direction. Flag if knee caves inward
- Hip depth: hip crease should reach or pass knee level at bottom
- Back angle: torso should stay relatively upright (not excessive forward lean)

**Plank:**
- Hip height: hip should align with shoulder-ankle line. Flag if sagging or piking
- Shoulder position: stacked over wrists/elbows

**Pull-up:**
- Full range of motion: chin clearly over bar at top, arms fully extended at bottom

---

## RAG Pipeline

Purpose: Inject evidence-based fitness knowledge into every Claude coaching prompt.
This prevents Claude from generating generic or incorrect fitness advice.

```python
# How it works:
# 1. seed_knowledge.py chunks fitness docs → embeds with all-MiniLM-L6-v2 → stores in Chroma
# 2. On every coaching call: retrieve top-3 relevant chunks for the current query
# 3. Inject retrieved chunks into Claude system prompt as context
# 4. Claude generates advice grounded in retrieved knowledge, not hallucination
```

Embedding model: `all-MiniLM-L6-v2` (via sentence-transformers, runs locally)
Vector store: Chroma (persisted to `data/chroma/`)

---

## API Key Handling

```
ANTHROPIC_API_KEY=your_key_here   ← in .env file only
```

Always load with:
```python
from dotenv import load_dotenv
import os
load_dotenv()
api_key = os.getenv("ANTHROPIC_API_KEY")
```

**NEVER hardcode API keys. NEVER commit .env.**

---

## Build Rules

- One phase at a time. **Test each phase fully before starting the next.**
- Frontend: plain HTML/CSS/JS only. No React. No Vue. No Tailwind. No Bootstrap.
- Never use inline styles in HTML. All styles go in style.css.
- Backend: FastAPI only. No Django, no Flask.
- SQLite: always use parameterized queries. No string-formatted SQL (SQL injection risk).
- MediaPipe: browser-side only. Never attempt server-side pose processing.
- Error handling: every API call (Claude, MediaPipe) needs a try/catch or try/except.
- Git: commit after every working feature with a clear message.

---

## Python Environment

Package manager: uv (NEVER use pip, pip3, or python -m venv)
Virtual environment: managed automatically by uv at .venv/

Install all dependencies:     uv sync
Add a new package:            uv add package-name
Add a dev-only package:       uv add --dev package-name
Run any command in env:       uv run <command>
Run the dev server:           uv run python -m uvicorn backend.main:app --reload

Never manually activate .venv/. Always use uv run.
Never commit .venv/ — it is gitignored.
Any new package must be added via uv add (updates pyproject.toml automatically).
Do not edit pyproject.toml dependencies by hand.

On Windows, Claude Code's terminal may not inherit user PATH.
Prefix uv commands with:
$env:PATH = '$env:USERPROFILE\.local\bin;$env:PATH'
Or use the full uv path found at C:\Users\vishn\.local\bin\uv.exe


---

## Learning Log Rule — MANDATORY, NO EXCEPTIONS

After every completed step — without being asked — append an entry to `LEARNING_LOG.md`
in the project root. Do this BEFORE the commit so the log is included in the same commit
as the code it documents, along with the commit message and ID.

**Entry format (use this exactly):**

```
---
## [Phase X · Step Y] — [short title]
*[Date]*

### What was built
[2-3 sentences in plain English. What exists now that didn't before.]

### New terms introduced
- **[term]**: [plain English definition — assume reader knows basic Python but no web dev]
[include every new concept, pattern, or tool introduced in this step]

### Why these decisions were made
[The reasoning behind key architectural choices — not just what, but why.
Why this approach over alternatives? What problem does each decision solve?]

### What this enables
[How does this step connect to the next one? What is now possible that wasn't before?]
```

**Rules:**
- Never skip this step. Never wait to be asked.
- Append only — never overwrite earlier entries.
- Plain English throughout. No assuming prior knowledge of web frameworks.
- Every new term gets defined, even if it seems obvious.
- The "why" section is the most important — capture the reasoning, not just the facts.


---

## Session Starter Update Rule — MANDATORY, NO EXCEPTIONS

Immediately after appending to LEARNING_LOG.md, and still before the commit,
make surgical edits to SESSION_STARTER.md. Never rewrite the whole file.
Only touch the sections listed below, and only if they actually changed.

**Section: Current Build Status — update after EVERY step**
- Mark the just-completed step ✅
- Move the [ ] marker to the next pending step
- Update "Last completed" and "Next task" lines with one sentence each

**Section: Key Decisions Locked In — only if a new decision was made this step**
- Add one bullet line for the new decision
- Do not reword or remove existing decisions
- If no new decisions were made: do not touch this section

**Section: Schema Additions — only if the schema changed this step**
- Add the new field or table with a one-line description
- If schema did not change: do not touch this section

**Section: Environment — only if tooling changed this step**
- Edit the affected line only
- If environment did not change: do not touch this section

**Rules:**
- Surgical only. If a section did not change, leave it untouched.
- Never duplicate content from CLAUDE.md — SESSION_STARTER summarises, CLAUDE.md specifies.
- Keep SESSION_STARTER.md under 80 lines. If it grows beyond that, move detail
  into CLAUDE.md and replace with a one-line reference here.
- Never wait to be asked. This runs after LEARNING_LOG, before every commit.


---

## Current Build Phase

### ✅ PHASE 1 — Foundation (COMPLETE)
- [x] Create folder structure and all empty files
- [x] Write requirements.txt (fastapi, uvicorn, anthropic, chromadb, sentence-transformers, python-dotenv)
- [x] Write .gitignore (getfittr.db, chroma/, .env, __pycache__, *.pyc)
- [x] Build database.py: create all 6 tables on startup
- [x] Build main.py: FastAPI app with /health endpoint
- [x] Build basic frontend shell (index.html, style.css): navigation + placeholder pages
- [x] Build profile page: create/edit user profile, POST to /api/profile
- [x] Build manual session log: add past workout sessions without camera
- [x] Verify: can create profile, log a session, view it back

### ⏳ PHASE 2 — AI Coach (after Phase 1 passes verification)
Build order is 2a (coaching, no RAG) then 2b (add Chroma RAG). Full step-by-step
plan in the "## Phase 2 — AI Coach" section below.
- [ ] Phase 2a: coach.py + /api/coach/plan + per-set coaching + post-session summary
- [ ] Phase 2b: knowledge docs + ingest.py + Chroma retrieval wired into coach.py
- [ ] Verify: app plans a workout, gives feedback, tracks RPE over time

### ⏳ PHASE 3 — The Eyes (after Phase 2 passes verification)
- [ ] pose.js: MediaPipe integration, display skeleton overlay on camera feed
- [ ] Rep counting: detect rep completion from keypoint movement
- [ ] Form checks: per-exercise angle calculations + flag generation
- [ ] /api/form-flag endpoint: save form flags from browser to session_sets
- [ ] Real-time coaching text overlay on camera feed
- [ ] Verify: camera detects pose, counts reps, flags form issues for push-up + squat

### ⏳ PHASE 4 — Polish (after Phase 3 passes verification)
- [ ] voice.js: Web Speech API coaching output (toggle on/off)
- [ ] Progress dashboard: charts of reps, form scores, variation history
- [ ] Diet module: toggle on/off in profile, daily log UI
- [ ] Automatic split recommendation after 4+ weeks of data
- [ ] Verify: full session flow works end-to-end with voice, camera, and logging

---

## Phase 2 — AI Coach

The workout plan returned by coach.py is a structured JSON object (session_type,
estimated_duration_minutes, coach_message, warm_up, skill_work, supersets,
cool_down). Plan schema note: within `warm_up`, items WITH an `exercise_id` are
trackable bodyline drills (plank, hollow hold, side plank — logged as holds);
items WITHOUT an `exercise_id` are dynamic stretches (shoulder rolls, hip circles,
leg swings) rendered as instruction text only and never logged.

### Phase 2a: Coaching without RAG
Steps:
1. .env setup: ANTHROPIC_API_KEY; uv add anthropic python-dotenv
2. coach.py: Claude API wrapper, system prompt template, test call
3. GET /api/coach/plan — profile + recent history → structured workout plan
4. Workout section UI: "Get Today's Plan" button, displays the plan
5. Per-set coaching: after each RPE tap, brief Claude response shown
6. Post-session summary: session end → Claude summary + next-session note
7. End-to-end Phase 2a verify

### Phase 2b: Add Chroma RAG
Steps:
1. Knowledge base: /knowledge/ directory of Claude-generated markdown docs
   (exercise progressions, RPE guidelines, form cues per category)
2. uv add chromadb sentence-transformers
3. ingest.py: chunk docs, embed with HuggingFace all-MiniLM-L6-v2, store in Chroma
4. Retrieval wired into coach.py: relevant chunks injected into every coaching prompt
5. A/B compare: same query with and without RAG context, confirm improvement
6. End-to-end Phase 2b verify

---

## RAG Knowledge Base — Sources and Content

The `data/knowledge/` files must be populated with real fitness content before Phase 2.
Claude Code should write these files during Phase 2 setup based on the content below.

**bwf_progressions.txt** — Full progression trees, rep ranges, advancement rules
Source: r/bodyweightfitness Recommended Routine (community wiki, CC-licensed)
Content: All progression chains (push/pull/legs/core/hinge), the 3×5-8 working rep range,
the 3×8 @ RPE≤7 progression trigger, bodyline drill rules (hold to 60s, never advance),
paired superset structure, 90s rest periods, 3x/week non-consecutive scheduling.

**rpe_guidelines.txt** — Autoregulation and RPE-based training
Content: RPE 1-10 scale definitions, RIR (Reps In Reserve) explained, how RPE maps to
load decisions (Easy→add reps, Good→maintain, Hard→hold, Failed→reduce),
autoregulation principles, why fixed-threshold progression is inferior to RPE-based.

**recovery_principles.txt** — Rest, recovery, and injury prevention
Content: Minimum rest between same-muscle sessions (48h), why rest days produce gains,
deload weeks (every 4-6 weeks reduce volume by ~40%), sleep and nutrition basics,
DOMS vs injury distinction, when to skip a session vs push through.

---

## Portfolio and HuggingFace Strategy

This project doubles as a portfolio piece demonstrating:
- RAG pipeline (same stack as primary Finance RAG project: BAAI/bge-small + Chroma)
- Real-time computer vision (MediaPipe.js, browser-based)
- FastAPI backend with structured Python
- LLM integration with grounded prompting
- Evidence-based domain knowledge application

**HuggingFace plan (Phase 2, after RAG is working):**
- Host a DEMO version on HuggingFace Spaces — AI planning + coaching only, NO camera
- The demo takes a mock user profile and history, generates a workout plan + coaching text
- Built with Gradio (simple, fast, deploys to HF Spaces in one command)
- This is the portfolio-shareable artifact; the full local app is the real product

**GitHub README (write during Phase 4):**
- What the app does, tech stack, architecture diagram
- Screenshots/GIF of the session flow
- How to run locally (setup instructions)
- Link to HuggingFace demo

**Demo video (after Phase 4):**
- 90-second screen recording showing: profile → plan → live session with camera → feedback
- For portfolio and LinkedIn

---

## Key Decisions Locked In
[Architectural decisions that are settled. Append, never remove.]
- Phase 2 architecture: upfront workout plan — one Claude API call at
  session start returns a structured plan (exercises, sets, target reps);
  user executes it; AI evaluates after each RPE input. Single call, works
  offline after plan is received.
- Phase 2 build order: 2a first (AI coaching without RAG, proves the
  coaching loop), then 2b (add Chroma RAG + HuggingFace sentence-
  transformers embeddings once 2a is stable).
- Reactive coaching (AI decides next exercise after every set): deferred
  to future major release — too expensive and complex for Phase 2.
- weight_kg in session_sets: no such column exists or is needed. All 84
  current exercises are bodyweight. If weighted exercises are added in
  future (gym-mode expansion), add weight_kg REAL to session_sets via
  ALTER TABLE migration in init_db() at that time. Phase 2 progression
  logic uses exercise_id + reps_completed + rpe only.
- HuggingFace integration: sentence-transformers (all-MiniLM-L6-v2) for
  Chroma embeddings in Phase 2b; HuggingFace Spaces + Gradio for the
  Phase 4 portfolio demo deployment.
- Mock mode: USE_MOCK_AI env var (true/false). When true, coach.py returns a canned
  workout plan — no API call is made. Terminal must log a visible [MOCK MODE] warning.
  Use for all functional/UI testing. Set to false only when testing real AI output.
- AI model: controlled by CLAUDE_MODEL env var. Default dev model:
  claude-haiku-4-5-20251001. Upgrade to claude-sonnet-4-6 in .env for quality testing.
  Never hardcode a model string in Python source files.

## Change Log
[Add entries here when decisions change mid-build]
- 2026-06-06: Expanded from bodyweight-strength-only to a full home-training
  library (calisthenics, Pilates, mobility, cardio, skill). Added
  `exercises.movement_type` ('strength'/'pilates'/'mobility'/'cardio'/'skill')
  and `exercises.equipment_needed` ('none'/'pullup_bar'/'low_bar'/'anchor'/
  'parallel_bars'); added `user_profile.available_equipment` (JSON array).
  Only 'strength'/'skill' use the 3×8 progression threshold; pilates/mobility/
  cardio are tracked for consistency & quality, not rep-based advancement.
  Seeded in backend/database.py.
- 2026-06-08: Added `exercises.image_url TEXT` (nullable). Stores relative path to SVG
  line-art for each exercise. NULL until artwork is populated. Requires ALTER TABLE
  migration in database.py init_db(). Column sits between equipment_needed and form_cues.
- 2026-06-08: Phase 1 complete. Locked Phase 2 architecture (see Key Decisions Locked In):
  upfront single-call planning, 2a (no RAG) before 2b (RAG).
- 2026-06-08: Phase 2b embedding model updated to `all-MiniLM-L6-v2` (HuggingFace
  sentence-transformers), superseding the earlier `BAAI/bge-small` note in the Tech
  Stack table and RAG Pipeline section. Chroma vector store unchanged.

## Pending Ideas
[Dump ideas here mid-session — review between phases, not during them]
- Phase 3 layout: overlay coaching text + rep counter directly
  on the camera feed (bottom-left and top-right of the video frame).
  RPE buttons remain below feed — only tapped between sets, not mid-rep.
- Phase 4 stretch: movement-pattern-based exercise suggestion ("Looks like push-ups?")
  using MediaPipe trajectory classification — assisted ID, not automatic.
  Full auto-identification without user confirmation is a major future release.
- Phase 4: full-screen modal exercise picker — grid view grouped by category with filter
  tabs and search bar. Better UX once the library grows beyond ~100 exercises, and for
  gym-mode where the full equipment range is available. Replaces the inline combobox.
- Phase 4: evaluate library-based select (Tom Select or Choices.js) for the exercise
  picker if the custom combobox becomes hard to maintain or needs image thumbnails,
  keyboard navigation, or multi-select. Both are lightweight CDN imports. Would require
  relaxing the no-external-library rule for this one component — weigh at Phase 4.
- Phase 4 / voice.js: voice-triggered exercise selection — user says "add push-up"
  mid-session, app matches against the exercise library and auto-selects. Integrates
  with the Web Speech API already planned in voice.js. Useful when hands are occupied.
- Weekly coaching summary: after 7 days of sessions, AI generates a
  plain-English summary of the week — consistency, RPE trends, what
  progressed, what to watch. Delivered in the Workout section as a
  banner. Candidate for Phase 4 alongside the progress dashboard.

---

## What "Done" Looks Like for Each Phase

**Phase 1 done:** I can open the browser, fill in my profile, manually log a past workout session with exercises/sets/reps, and see it listed back.

**Phase 2 done:** I can click "Plan Today's Workout", get a personalised session based on my history and goals, log it with RPE after each set, and receive a coaching summary after finishing.

**Phase 3 done:** I can start a push-up set, have the camera count reps, flag my form in real time, and have that data automatically saved to the session.

**Phase 4 done:** The app speaks coaching cues aloud, shows me a progress chart over time, and the full daily experience feels like a real coaching session.