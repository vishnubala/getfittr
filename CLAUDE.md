\# GymCoach — Personal AI Workout Companion



\## What This App Is



A personal, local web-based workout coaching app for a single user.

It combines live pose analysis (MediaPipe.js), AI coaching (Anthropic Claude API),

and evidence-based bodyweight training principles (r/bodyweightfitness Recommended Routine).



This is NOT a SaaS product. It runs entirely on the user's local machine.

No authentication. No deployment. No public access. One user only.



\---



\## Tech Stack



| Layer | Choice |

|---|---|

| Frontend | Plain HTML + CSS + JavaScript (no frameworks, no build tools) |

| Pose Engine | MediaPipe Pose Landmarker (runs in browser via CDN) |

| Voice | Web Speech API (browser built-in, toggle on/off) |

| Backend | Python 3.11+ with FastAPI |

| AI Coaching | Anthropic Claude API (model: claude-sonnet-4-20250514) |

| Fitness Knowledge | RAG — BAAI/bge-small embeddings + Chroma vector store |

| Storage | SQLite (single local file) |

| Env vars | python-dotenv (.env file, never committed) |



\---



\## Project Structure



```

gymcoach/

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

│   ├── gymcoach.db            ← SQLite database (gitignored)

│   ├── knowledge/             ← Plain text fitness docs for RAG indexing

│   │   ├── bwf\_progressions.txt

│   │   ├── rpe\_guidelines.txt

│   │   └── recovery\_principles.txt

│   └── chroma/                ← Chroma vector store (gitignored)

└── scripts/

&#x20;   └── seed\_knowledge.py      ← One-time script to build the RAG index

```



\---



\## Database Schema



\### `user\_profile` (single row)

```sql

CREATE TABLE user\_profile (

&#x20;   id INTEGER PRIMARY KEY DEFAULT 1,

&#x20;   name TEXT,

&#x20;   age INTEGER,

&#x20;   height\_cm REAL,

&#x20;   weight\_kg REAL,

&#x20;   fitness\_level TEXT,        -- 'beginner', 'intermediate', 'advanced'

&#x20;   goals TEXT,                -- JSON array: \['strength', 'endurance', 'weight\_loss']

&#x20;   injuries TEXT,             -- JSON array of injury notes

&#x20;   rest\_days TEXT,            -- JSON array: \['saturday', 'sunday']

&#x20;   diet\_module\_enabled INTEGER DEFAULT 0,

&#x20;   created\_at TEXT,

&#x20;   updated\_at TEXT

);

```



\### `exercises` (seeded at startup)

```sql

CREATE TABLE exercises (

&#x20;   id INTEGER PRIMARY KEY AUTOINCREMENT,

&#x20;   name TEXT NOT NULL,

&#x20;   category TEXT,             -- 'push', 'pull', 'legs', 'core'

&#x20;   muscle\_groups TEXT,        -- JSON array

&#x20;   difficulty INTEGER,        -- 1 (easiest) to 10 (hardest)

&#x20;   variation\_order INTEGER,   -- Position in progression tree

&#x20;   parent\_exercise\_id INTEGER,-- Previous variation in tree (NULL = first)

&#x20;   next\_exercise\_id INTEGER,  -- Next variation in tree (NULL = last)

&#x20;   form\_cues TEXT,            -- JSON array of coaching cues

&#x20;   FOREIGN KEY (parent\_exercise\_id) REFERENCES exercises(id),

&#x20;   FOREIGN KEY (next\_exercise\_id) REFERENCES exercises(id)

);

```



\### `sessions`

```sql

CREATE TABLE sessions (

&#x20;   id INTEGER PRIMARY KEY AUTOINCREMENT,

&#x20;   date TEXT NOT NULL,

&#x20;   start\_time TEXT,

&#x20;   end\_time TEXT,

&#x20;   duration\_minutes INTEGER,

&#x20;   session\_type TEXT,         -- 'full\_body', 'upper', 'lower', 'custom'

&#x20;   overall\_rpe REAL,

&#x20;   coach\_notes TEXT,          -- Claude-generated post-session feedback

&#x20;   manually\_entered INTEGER DEFAULT 0,  -- 1 = historical backfill

&#x20;   created\_at TEXT

);

```



\### `session\_sets`

```sql

CREATE TABLE session\_sets (

&#x20;   id INTEGER PRIMARY KEY AUTOINCREMENT,

&#x20;   session\_id INTEGER NOT NULL,

&#x20;   exercise\_id INTEGER NOT NULL,

&#x20;   set\_number INTEGER,

&#x20;   reps\_completed INTEGER,

&#x20;   duration\_seconds INTEGER,  -- For holds (plank, L-sit)

&#x20;   rpe INTEGER,               -- 1-10, user-reported after set

&#x20;   form\_score REAL,           -- 0.0-1.0, from pose analysis (NULL if manual)

&#x20;   form\_flags TEXT,           -- JSON array: \['knee\_caving', 'hip\_drop']

&#x20;   camera\_used INTEGER DEFAULT 0,

&#x20;   notes TEXT,

&#x20;   FOREIGN KEY (session\_id) REFERENCES sessions(id),

&#x20;   FOREIGN KEY (exercise\_id) REFERENCES exercises(id)

);

```



\### `exercise\_progress`

```sql

CREATE TABLE exercise\_progress (

&#x20;   id INTEGER PRIMARY KEY AUTOINCREMENT,

&#x20;   exercise\_id INTEGER NOT NULL,

&#x20;   date TEXT NOT NULL,

&#x20;   avg\_rpe REAL,

&#x20;   avg\_form\_score REAL,

&#x20;   max\_reps INTEGER,

&#x20;   total\_sets INTEGER,

&#x20;   progression\_ready INTEGER DEFAULT 0,  -- 1 = Claude has flagged for upgrade

&#x20;   FOREIGN KEY (exercise\_id) REFERENCES exercises(id)

);

```



\### `diet\_log` (optional module — ignored if diet\_module\_enabled = 0)

```sql

CREATE TABLE diet\_log (

&#x20;   id INTEGER PRIMARY KEY AUTOINCREMENT,

&#x20;   date TEXT NOT NULL,

&#x20;   calories\_target INTEGER,

&#x20;   calories\_actual INTEGER,

&#x20;   protein\_g REAL,

&#x20;   carbs\_g REAL,

&#x20;   fats\_g REAL,

&#x20;   notes TEXT

);

```



\---



\## Fitness Knowledge Base (Evidence-Based — DO NOT INVENT)



All coaching logic must be grounded in these principles. When uncertain, retrieve

from the RAG knowledge base before generating any recommendation.



\### Progression Trees (r/bodyweightfitness Recommended Routine)



```

PUSH:  Wall Push-up → Incline Push-up → Knee Push-up → Full Push-up

&#x20;      → Diamond Push-up → Archer Push-up → One-Arm Push-up



PULL:  Dead Hang → Scapular Pull → Negative Pull-up → Jumping/Assisted Pull-up

&#x20;      → Full Pull-up → L-sit Pull-up → Weighted Pull-up



LEGS:  Assisted Squat → Bodyweight Squat → Step-up → Deep Step-up

&#x20;      → Bulgarian Split Squat → Pistol Squat



CORE:  Plank (hold) → Extended Plank → Side Plank → Hollow Hold

&#x20;      → L-sit (foot supported → one foot → tucked → full)



HINGE: Romanian Deadlift → Single-Leg RDL → Nordic Curl

```



\### Progression Rules (HARD — follow exactly)



1\. Working rep range: \*\*3 sets of 5–8 reps\*\* for strength exercises

2\. \*\*Progression trigger\*\*: 3 consecutive sessions completing 3×8 at RPE ≤ 7 with no form flags

3\. \*\*After progression\*\*: drop to 3×5 of the harder variation and rebuild

4\. \*\*Hold progressions\*\* (plank, L-sit): build from 3×10s to 3×30s before advancing

5\. \*\*Bodyline drills\*\* (daily warm-up plank, hollow hold): NOT progressed. Hold once comfortably up to 60s. Do not increase beyond 60s — they serve as movement prep only.

6\. \*\*Never increase both reps AND variation difficulty in the same session\*\*



\### RPE Scale (user self-report after each set)



| Rating | Label | RPE | App Action |

|---|---|---|---|

| 😌 | Easy | 1–5 | +1-2 reps next session |

| 💪 | Good | 6–7 | Maintain — optimal training zone |

| 😤 | Hard | 8–9 | Hold reps, focus on form |

| 😵 | Failed | 10 | Reduce reps, flag for form review |



\### Session Structure (per BWF RR)



```

1\. Warm-up (10–15 min)

&#x20;  - Dynamic stretches: shoulder rolls, hip circles, leg swings

&#x20;  - Bodyline drills: plank, side plank, hollow hold (once each, up to 60s)



2\. Skill Work (optional, 5–10 min)

&#x20;  - L-sit progression practice

&#x20;  - (Handstand — only if user has progressed to this level)



3\. Strength Work — 3 paired supersets, 90s rest between exercises

&#x20;  - Pair A: Vertical Pull (pull-up progression) + Vertical Push (dip/overhead)

&#x20;  - Pair B: Squat progression + Core hold (L-sit progression)

&#x20;  - Pair C: Horizontal Push (push-up) + Horizontal Pull (row)



4\. Cool-down (5 min)

&#x20;  - Light stretching of worked muscles

```



\### Coaching Hard Rules (NEVER violate these)



1\. \*\*No same-muscle training on consecutive days.\*\* Minimum 1 rest day between sessions targeting same muscle group.

2\. \*\*Always include warm-up\*\* in every generated session plan. Never skip it.

3\. \*\*Form quality > rep count.\*\* A clean 5-rep set is better than a sloppy 8-rep set.

4\. \*\*Balanced push/pull.\*\* Horizontal push volume should never exceed horizontal pull volume significantly. Flag imbalances.

5\. \*\*No high-rep crunches or sit-ups.\*\* Use L-sits, hollow holds, hanging leg raises instead. This is evidence-based.

6\. \*\*Do not recommend exercises the user has flagged as injured.\*\* Always check injury list before generating plans.

7\. \*\*3x/week is optimal for this routine.\*\* Never plan more than 4 sessions/week for a full-body routine.

8\. \*\*Rest days are when muscles grow.\*\* Never frame rest as "doing nothing" — frame it positively.



\---



\## Pose Analysis (MediaPipe Pose Landmarker)



MediaPipe runs \*\*entirely in the browser\*\* via CDN. Never process pose server-side.



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



\*\*Push-up:\*\*

\- Elbow angle at bottom: should reach \~90°. Flag if > 110° (not deep enough)

\- Hip alignment: shoulder-hip-ankle should be straight. Flag if hips sag > 15° or pike > 15°

\- Head position: nose should align with spine. Flag if head drops or cranes



\*\*Squat:\*\*

\- Knee tracking: knee should follow toe direction. Flag if knee caves inward

\- Hip depth: hip crease should reach or pass knee level at bottom

\- Back angle: torso should stay relatively upright (not excessive forward lean)



\*\*Plank:\*\*

\- Hip height: hip should align with shoulder-ankle line. Flag if sagging or piking

\- Shoulder position: stacked over wrists/elbows



\*\*Pull-up:\*\*

\- Full range of motion: chin clearly over bar at top, arms fully extended at bottom



\---



\## RAG Pipeline



Purpose: Inject evidence-based fitness knowledge into every Claude coaching prompt.

This prevents Claude from generating generic or incorrect fitness advice.



```python

\# How it works:

\# 1. seed\_knowledge.py chunks fitness docs → embeds with BAAI/bge-small → stores in Chroma

\# 2. On every coaching call: retrieve top-3 relevant chunks for the current query

\# 3. Inject retrieved chunks into Claude system prompt as context

\# 4. Claude generates advice grounded in retrieved knowledge, not hallucination

```



Embedding model: `BAAI/bge-small-en-v1.5` (via sentence-transformers, runs locally)

Vector store: Chroma (persisted to `data/chroma/`)



\---



\## API Key Handling



```

ANTHROPIC\_API\_KEY=your\_key\_here   ← in .env file only

```



Always load with:

```python

from dotenv import load\_dotenv

import os

load\_dotenv()

api\_key = os.getenv("ANTHROPIC\_API\_KEY")

```



\*\*NEVER hardcode API keys. NEVER commit .env.\*\*



\---



\## Build Rules



\- One phase at a time. \*\*Test each phase fully before starting the next.\*\*

\- Frontend: plain HTML/CSS/JS only. No React. No Vue. No Tailwind. No Bootstrap.

\- Never use inline styles in HTML. All styles go in style.css.

\- Backend: FastAPI only. No Django, no Flask.

\- SQLite: always use parameterized queries. No string-formatted SQL (SQL injection risk).

\- MediaPipe: browser-side only. Never attempt server-side pose processing.

\- Error handling: every API call (Claude, MediaPipe) needs a try/catch or try/except.

\- Git: commit after every working feature with a clear message.

\- Never install packages not in requirements.txt without adding them first.



\---



\## Current Build Phase



\### ✅ PHASE 1 — Foundation (START HERE)

\- \[ ] Create folder structure and all empty files

\- \[ ] Write requirements.txt (fastapi, uvicorn, anthropic, chromadb, sentence-transformers, python-dotenv)

\- \[ ] Write .gitignore (gymcoach.db, chroma/, .env, \_\_pycache\_\_, \*.pyc)

\- \[ ] Build database.py: create all 6 tables on startup

\- \[ ] Build main.py: FastAPI app with /health endpoint

\- \[ ] Build basic frontend shell (index.html, style.css): navigation + placeholder pages

\- \[ ] Build profile page: create/edit user profile, POST to /api/profile

\- \[ ] Build manual session log: add past workout sessions without camera

\- \[ ] Verify: can create profile, log a session, view it back



\### ⏳ PHASE 2 — AI Coach (after Phase 1 passes verification)

\- \[ ] seed\_knowledge.py: chunk fitness docs, embed, store in Chroma

\- \[ ] rag.py: retrieve relevant chunks by query

\- \[ ] coach.py: Claude API call with RAG context injection

\- \[ ] /api/plan endpoint: generate today's workout from profile + history + RAG

\- \[ ] /api/feedback endpoint: post-session coaching summary

\- \[ ] RPE input after each set (UI + backend)

\- \[ ] Progression engine: flag exercises ready for variation upgrade

\- \[ ] Verify: app plans a workout, gives feedback, tracks RPE over time



\### ⏳ PHASE 3 — The Eyes (after Phase 2 passes verification)

\- \[ ] pose.js: MediaPipe integration, display skeleton overlay on camera feed

\- \[ ] Rep counting: detect rep completion from keypoint movement

\- \[ ] Form checks: per-exercise angle calculations + flag generation

\- \[ ] /api/form-flag endpoint: save form flags from browser to session\_sets

\- \[ ] Real-time coaching text overlay on camera feed

\- \[ ] Verify: camera detects pose, counts reps, flags form issues for push-up + squat



\### ⏳ PHASE 4 — Polish (after Phase 3 passes verification)

\- \[ ] voice.js: Web Speech API coaching output (toggle on/off)

\- \[ ] Progress dashboard: charts of reps, form scores, variation history

\- \[ ] Diet module: toggle on/off in profile, daily log UI

\- \[ ] Automatic split recommendation after 4+ weeks of data

\- \[ ] Verify: full session flow works end-to-end with voice, camera, and logging



\---



\## What "Done" Looks Like for Each Phase



\*\*Phase 1 done:\*\* I can open the browser, fill in my profile, manually log a past workout session with exercises/sets/reps, and see it listed back.



\*\*Phase 2 done:\*\* I can click "Plan Today's Workout", get a personalised session based on my history and goals, log it with RPE after each set, and receive a coaching summary after finishing.



\*\*Phase 3 done:\*\* I can start a push-up set, have the camera count reps, flag my form in real time, and have that data automatically saved to the session.



\*\*Phase 4 done:\*\* The app speaks coaching cues aloud, shows me a progress chart over time, and the full daily experience feels like a real coaching session.

