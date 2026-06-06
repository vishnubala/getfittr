# GetFittr — Session Starter
# Paste this at the beginning of every new Claude Code session.
# CLAUDE.md is the full source of truth. This file is current-state context only.
# AUTO-MAINTAINED: Claude Code updates marked sections after every step.

---

## Who I Am
Single user, personal use only. Data scientist background (Python/Pandas/PySpark),
not a software developer. You are doing all the coding. I direct, review, and test.

## What This Project Is
GetFittr is a personal, local AI workout coaching web app. Full spec in CLAUDE.md.
Short version: MediaPipe.js pose analysis + Claude API coaching + RAG fitness knowledge + SQLite.

---

## Environment — IMPORTANT (Windows)
<!-- SECTION: Environment — edit only if tooling changes -->
- Package manager: uv (never pip, pip3, or python -m venv)
- PowerShell PATH fix required before every uv command:
    $env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
- Run dev server:  uv run python -m uvicorn backend.main:app --reload
- Add package:     uv add package-name
- Install all:     uv sync

---

## Key Decisions Locked In
<!-- SECTION: Key Decisions — append new decisions only, never remove existing -->
- Frontend: plain HTML + CSS + JS (no frameworks, no build tools)
- Backend: Python + FastAPI; Storage: SQLite (single local file)
- Pose detection: MediaPipe.js browser-side only
- Voice: Web Speech API toggle, on from day one
- Exercise selection: manual (user tells the app)
- Set status: manual buttons (Start Set / End Set / Rest)
- Progression: RPE-based after every set (😌Easy 💪Good 😤Hard 😵Failed)
- Progression trigger: 3×8 at RPE ≤7 for 3 consecutive sessions (strength/skill only)
- Workout split: Full Body 3x/week default; AI proposes change after 4 weeks of data
- App mode: plans workout first, then coaches through it
- Exercise library: 84 exercises (strength 58, skill 7, pilates 7, mobility 6, cardio 6)
- Pilates/mobility/cardio: standalone rows, consistency tracking only (no rep progression)
- Profile onboarding includes equipment selection step

## Schema Additions vs Original Spec
<!-- SECTION: Schema Additions — append only when schema changes -->
- exercises.movement_type: 'strength'|'pilates'|'mobility'|'cardio'|'skill'
- exercises.equipment_needed: 'none'|'pullup_bar'|'low_bar'|'anchor'|'parallel_bars'
- user_profile.available_equipment: JSON array set during onboarding

---

## Current Build Status
<!-- SECTION: Build Status — update after EVERY step -->
Phase 1 — Foundation:
  ✅ Step 1: Project scaffold (folders, pyproject.toml, .gitignore)
  ✅ Step 2: database.py (6 tables, 84 exercises seeded)
  ✅ Step 3: main.py (FastAPI skeleton, /health, router structure)
  ✅ Tooling: uv + pyproject.toml, Windows PATH fix
  ✅ Step 4: Frontend shell (navigation, 4 sections, dark theme)
  [ ] Step 5: Profile page (backend route + frontend form + equipment selection)
  [ ] Step 6: Manual session log (backend route + frontend UI)
  [ ] Step 7: End-to-end verify

Phase 2 — AI Coach:   [ ] NOT STARTED
Phase 3 — The Eyes:   [ ] NOT STARTED
Phase 4 — Polish:     [ ] NOT STARTED

Last completed: Frontend shell — single-page app, 4 sections, hash routing, dark teal theme
Next task: Phase 1 Step 5 — profile page (backend route + frontend form + equipment selection)

---

## How We Work Together
- One task per prompt. Plan Mode (Shift+Tab) before every new feature.
- After every step: append LEARNING_LOG, update SESSION_STARTER, then commit + push.
- Never hardcode API keys. Always .env via python-dotenv.
- Never hand-edit pyproject.toml — use uv add.
- Stop and describe before building on broken code.