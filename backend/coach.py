"""Claude API interaction for getfittr's AI coach.

This module owns every call to the Anthropic API. Nothing else in the codebase
talks to Claude directly — routes (added in Step 3) call `get_workout_plan()`
here and stay ignorant of prompts, models, and SDK details.

Two modes, switched by the ``USE_MOCK_AI`` env var:

* **mock** (default, ``USE_MOCK_AI=true``) — returns a hand-written ``MOCK_PLAN``
  and makes no network call. Use this for all functional/UI testing so it costs
  nothing and needs no key. A ``[MOCK MODE]`` line is printed so it's obvious.
* **real** (``USE_MOCK_AI=false``) — formats the user's profile and recent
  sessions into a system prompt and asks Claude for a structured plan.

The Anthropic client is created lazily (only on the first real call) so importing
this module — or running in mock mode — never requires a valid key.
"""

import json
import os

from dotenv import load_dotenv

# Load .env once at import so the vars below are populated. Reads ANTHROPIC_API_KEY,
# USE_MOCK_AI (default "true" — safe/offline), and CLAUDE_MODEL.
load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
USE_MOCK_AI = os.getenv("USE_MOCK_AI", "true")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

# Placeholder value shipped in .env.example — treated as "no real key set".
_PLACEHOLDER_KEY = "replace_with_your_key"

# Lazily-constructed Anthropic client (see _get_client). Never built at import.
_client = None


def _get_client():
    """Return a cached Anthropic client, constructing it on first use.

    Raises ValueError if no usable API key is configured, so the real path fails
    loudly and early instead of making a doomed network call. Importing the
    `anthropic` package is deferred to here too, so mock mode has no hard dep on
    it being importable at startup.
    """
    global _client
    if _client is not None:
        return _client

    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY == _PLACEHOLDER_KEY:
        raise ValueError(
            "ANTHROPIC_API_KEY is not set to a real key. Put your key in .env "
            "(or set USE_MOCK_AI=true to use the canned mock plan instead)."
        )

    import anthropic

    _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# Mock plan
# ---------------------------------------------------------------------------
# A realistic full-body session matching the exact schema the real API must
# return. exercise_id values are the REAL ids from the seeded library (queried
# from data/getfittr.db), so the frontend can resolve them like a live plan:
#   Plank=45  Hollow Hold=52  Side Plank=48  Full Pull-up=20  Full Dip=15
#   Bulgarian Split Squat=32  Archer Push-up=6  Archer Row=26  Tuck L-sit=61
# warm_up mixes dynamic stretches (no exercise_id — instruction text only) with
# bodyline drills (with exercise_id — trackable holds).
MOCK_PLAN = {
    "session_type": "full_body",
    "estimated_duration_minutes": 45,
    "coach_message": (
        "Nice consistency — that's three full-body sessions this week, all "
        "hitting your rest-day schedule. Your pull strength is trending well: "
        "last session you closed out Full Pull-up at 3x7 with RPE 7, so today "
        "we're testing the top of that range (3x8). Hold the Archer Push-up "
        "reps steady and chase clean depth rather than more reps — push and "
        "pull volume are balanced, so keep it there."
    ),
    "warm_up": [
        {"name": "Shoulder Rolls", "reps": 10,
         "note": "Slow circles, full range, both directions."},
        {"name": "Hip Circles", "reps": 10,
         "note": "Hands on hips, big controlled circles each way."},
        {"name": "Leg Swings", "reps": 10,
         "note": "Front-to-back then side-to-side, each leg."},
        {"name": "Plank", "seconds": 30, "exercise_id": 45,
         "note": "Bodyline drill — straight line head to heels, brace the abs."},
        {"name": "Hollow Hold", "seconds": 20, "exercise_id": 52,
         "note": "Bodyline drill — lower back pressed flat, ribs down."},
        {"name": "Side Plank", "seconds": 20, "exercise_id": 48,
         "note": "Bodyline drill — 20s each side, hips stacked and lifted."},
    ],
    "skill_work": [
        {"exercise_id": 61, "name": "Tuck L-sit", "sets": 3, "seconds": 10,
         "note": "Depress shoulders, lock elbows, build toward 3x30s."},
    ],
    "supersets": [
        {
            "pair": "A",
            "exercises": [
                {"exercise_id": 20, "name": "Full Pull-up", "sets": 3,
                 "reps": "5-8",
                 "note": "Testing 3x8 today — full hang to chin over the bar."},
                {"exercise_id": 15, "name": "Full Dip", "sets": 3, "reps": "5-8",
                 "note": "Shoulders down and back, lower to ~90 degrees."},
            ],
        },
        {
            "pair": "B",
            "exercises": [
                {"exercise_id": 32, "name": "Bulgarian Split Squat", "sets": 3,
                 "reps": "5-8",
                 "note": "Per leg. Front knee tracks over the toes."},
                {"exercise_id": 52, "name": "Hollow Hold", "sets": 3,
                 "seconds": 25,
                 "note": "Core hold paired with squats — stay tight, no arch."},
            ],
        },
        {
            "pair": "C",
            "exercises": [
                {"exercise_id": 6, "name": "Archer Push-up", "sets": 3,
                 "reps": "5-8",
                 "note": "Per side. Hold reps steady, prioritise clean depth."},
                {"exercise_id": 26, "name": "Archer Row", "sets": 3,
                 "reps": "5-8",
                 "note": "Per side. Pull the chest to the bar, squeeze the blades."},
            ],
        },
    ],
    "cool_down": (
        "5 minutes of light stretching: chest and shoulders, lats, quads and "
        "hip flexors. Breathe slow and easy — let the heart rate come down."
    ),
}


# ---------------------------------------------------------------------------
# System prompt (real API path only)
# ---------------------------------------------------------------------------

# Static instructions — role, the BWF hard rules, and the exact output schema.
# The dynamic user context is appended in _build_system_prompt().
_SYSTEM_PROMPT_HEADER = """\
ROLE:
You are a precise, evidence-based personal fitness coach for a bodyweight
training app. You follow the r/bodyweightfitness Recommended Routine principles
exactly.

HARD RULES:
- Always include a full warm-up. Never skip it.
- Warm-up structure: dynamic stretches (shoulder rolls, hip circles, leg swings)
  then bodyline drills (plank, hollow hold, side plank). Always in this order.
- Strength progression trigger: 3 consecutive sessions at 3x8 reps with RPE <= 7.
  On trigger: advance to the next variation, reset to 3x5.
- Working rep range: 3 sets of 5-8 reps for strength exercises.
- Hold progressions (L-sit, plank): build from 3x10s to 3x30s before advancing.
  Do not use rep counting for holds.
- Bodyline drills are warm-up only. Never progress them. 60s max.
- Never train the same muscle group on consecutive days.
- Balanced push/pull. Flag imbalances.
- Never recommend exercises that conflict with injury flags.
- Full body 3x/week is the default split.
- Never plan more than 4 sessions/week for a full-body routine.
"""

_SYSTEM_PROMPT_OUTPUT = """\
OUTPUT INSTRUCTION:
Return ONLY a valid JSON object. No explanation. No preamble. No markdown code
fences. The JSON must match this schema exactly:
{
  "session_type": string,
  "estimated_duration_minutes": integer,
  "coach_message": string (personalised based on the user's recent history -
                   mention specific patterns, what is being tested today, and why),
  "warm_up": array of objects. Each object has:
    "name": string
    "note": string
    and either "reps": integer  (for dynamic stretches, no exercise_id)
    or "seconds": integer       (for bodyline drills, include exercise_id)
    "exercise_id": integer      (only for bodyline drills)
  "skill_work": array (empty [] if none today). Each object:
    "exercise_id": integer, "name": string, "sets": integer,
    "seconds": integer, "note": string
  "supersets": array of 3 objects. Each object:
    "pair": "A" | "B" | "C"
    "exercises": array of 2 objects. Each object:
      "exercise_id": integer, "name": string, "sets": integer,
      and either "reps": "5-8" (strength) or "seconds": integer (holds),
      "note": string
  "cool_down": string
}
"""


def _format_sessions(recent_sessions: list) -> str:
    """Render recent sessions as readable lines for the prompt's USER CONTEXT.

    Each session is expected to look like the API's session-detail shape (a dict
    with a ``date`` and a ``sets`` list of {exercise_name, reps_completed,
    duration_seconds, rpe}). Missing pieces are tolerated so a partial history
    never breaks plan generation.
    """
    if not recent_sessions:
        return "  (no recent sessions on record — this may be the first workout)"

    lines = []
    for sess in recent_sessions[:3]:
        date = sess.get("date", "unknown date")
        sets = sess.get("sets", []) or []
        lines.append(f"  - {date}: {len(sets)} sets")
        for s in sets:
            name = s.get("exercise_name", "exercise")
            if s.get("duration_seconds"):
                effort = f"{s['duration_seconds']}s"
            else:
                effort = f"{s.get('reps_completed', '?')} reps"
            rpe = s.get("rpe", "?")
            lines.append(f"      {name}: {effort} @ RPE {rpe}")
    return "\n".join(lines)


def _build_system_prompt(profile: dict, recent_sessions: list) -> str:
    """Assemble the full system prompt from the static parts + dynamic context."""
    user_context = (
        "USER CONTEXT:\n"
        f"Fitness level: {profile.get('fitness_level', 'unknown')}\n"
        f"Goals: {profile.get('goals', [])}\n"
        f"Available equipment: {profile.get('available_equipment', [])}\n"
        f"Injuries: {profile.get('injuries', [])}\n"
        "Recent sessions (last 3):\n"
        f"{_format_sessions(recent_sessions)}\n"
    )
    return f"{_SYSTEM_PROMPT_HEADER}\n{user_context}\n{_SYSTEM_PROMPT_OUTPUT}"


def _strip_code_fences(text: str) -> str:
    """Remove accidental ``` / ```json markdown fences around a JSON string."""
    text = text.strip()
    if text.startswith("```"):
        # drop the opening fence line (``` or ```json) ...
        text = text.split("\n", 1)[1] if "\n" in text else ""
        # ... and a trailing closing fence if present.
        if text.rstrip().endswith("```"):
            text = text.rstrip()[: -len("```")]
    return text.strip()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def get_workout_plan(profile: dict, recent_sessions: list) -> dict:
    """Return today's structured workout plan as a dict.

    In mock mode returns ``MOCK_PLAN`` with no API call. In real mode asks Claude
    for a plan grounded in the profile + recent history and returns the parsed
    JSON. Any failure on the real path is caught and surfaced as
    ``{"error": True, "message": ...}`` rather than raising.
    """
    if USE_MOCK_AI == "true":
        print(
            "[MOCK MODE] get_workout_plan called - returning canned plan, "
            "no API call made."
        )
        return MOCK_PLAN

    try:
        client = _get_client()
        system_prompt = _build_system_prompt(profile, recent_sessions)
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2000,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": "Generate today's workout plan as JSON.",
                }
            ],
        )
        raw = response.content[0].text
        return json.loads(_strip_code_fences(raw))
    except Exception as e:  # noqa: BLE001 — surface any failure to the caller
        print(f"[coach] get_workout_plan failed: {e}")
        return {"error": True, "message": str(e)}
