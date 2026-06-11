"""SQLite setup, schema, and exercise seed data for getfittr.

This module owns the database: it resolves the DB file path, creates all six
tables, seeds the multi-modality exercise library, and exposes a connection
helper (`get_db`) for FastAPI route handlers.

No work happens on import. Call `init_db()` explicitly (the test does this now;
`main.py` will call it on startup).
"""

import json
import sqlite3
from pathlib import Path

# DB lives at <project_root>/data/getfittr.db, resolved from THIS file (not cwd)
# so it works regardless of where python/uvicorn is launched from.
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "getfittr.db"


# ---------------------------------------------------------------------------
# Schema — all six tables, created with IF NOT EXISTS so init_db is safe to
# call on every startup.
# ---------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT,
    age INTEGER,
    height_cm REAL,
    weight_kg REAL,
    fitness_level TEXT,                       -- 'beginner', 'intermediate', 'advanced'
    goals TEXT,                               -- JSON array: ['strength', 'endurance', 'weight_loss']
    injuries TEXT,                            -- JSON array of injury notes
    rest_days TEXT,                           -- JSON array: ['saturday', 'sunday']
    available_equipment TEXT DEFAULT '["none"]',  -- JSON array: ['pullup_bar', 'none']
    diet_module_enabled INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,                            -- 'push','pull','legs','hinge','core','mobility','cardio'
    muscle_groups TEXT,                       -- JSON array
    difficulty INTEGER,                       -- 1 (easiest) to 10 (hardest)
    variation_order INTEGER,                  -- Position in progression tree
    parent_exercise_id INTEGER,               -- Previous variation in tree (NULL = first/standalone)
    next_exercise_id INTEGER,                 -- Next variation in tree (NULL = last/standalone)
    movement_type TEXT DEFAULT 'strength',    -- 'strength','pilates','mobility','cardio','skill'
    equipment_needed TEXT DEFAULT 'none',     -- 'none','pullup_bar','low_bar','anchor','parallel_bars'
    form_cues TEXT,                           -- JSON array of coaching cues
    FOREIGN KEY (parent_exercise_id) REFERENCES exercises(id),
    FOREIGN KEY (next_exercise_id) REFERENCES exercises(id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    session_type TEXT,                        -- 'full_body', 'upper', 'lower', 'custom'
    overall_rpe REAL,
    coach_notes TEXT,                         -- Claude-generated post-session feedback
    manually_entered INTEGER DEFAULT 0,       -- 1 = historical backfill
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS session_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    set_number INTEGER,
    reps_completed INTEGER,
    duration_seconds INTEGER,                 -- For holds (plank, L-sit)
    rpe INTEGER,                              -- 1-10, user-reported after set
    form_score REAL,                          -- 0.0-1.0, from pose analysis (NULL if manual)
    form_flags TEXT,                          -- JSON array: ['knee_caving', 'hip_drop']
    camera_used INTEGER DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);

CREATE TABLE IF NOT EXISTS exercise_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    avg_rpe REAL,
    avg_form_score REAL,
    max_reps INTEGER,
    total_sets INTEGER,
    progression_ready INTEGER DEFAULT 0,      -- 1 = flagged for variation upgrade
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);

CREATE TABLE IF NOT EXISTS diet_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    calories_target INTEGER,
    calories_actual INTEGER,
    protein_g REAL,
    carbs_g REAL,
    fats_g REAL,
    notes TEXT
);
"""


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
# CHAINS = progression trees. Each exercise is linked to its neighbours via
# parent_exercise_id / next_exercise_id. Only movement_type 'strength' and
# 'skill' belong here (the Phase 2 planner applies the 3x8 rep-progression
# threshold to 'strength'; 'skill' progresses by hold/quality).
#
# An exercise entry is either "Name" (uses the chain's default equipment) or
# a ("Name", "equipment") tuple to override where a chain crosses an equipment
# boundary (e.g. Chair Dip -> Parallel-Bar Dip).
CHAINS = [
    # ---- PUSH ----
    {
        "category": "push", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["chest", "shoulders", "triceps"],
        "form_cues": ["Hands under shoulders", "Body in a straight line head to heels",
                      "Lower until elbows reach ~90 degrees", "Full lockout at the top"],
        "exercises": ["Wall Push-up", "Incline Push-up", "Knee Push-up", "Full Push-up",
                      "Diamond Push-up", "Archer Push-up", "One-Arm Push-up"],
    },
    {
        "category": "push", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["shoulders", "triceps", "upper_chest"],
        "form_cues": ["Hips stacked over shoulders", "Press straight overhead",
                      "Keep core braced", "Control the descent"],
        "exercises": ["Pike Push-up", "Elevated Pike Push-up",
                      "Wall Handstand Push-up Negative", "Wall Handstand Push-up"],
    },
    {
        "category": "push", "movement_type": "strength", "equipment": "parallel_bars",
        "muscle_groups": ["chest", "shoulders", "triceps"],
        "form_cues": ["Shoulders down and back", "Lower to ~90 degrees at the elbow",
                      "Lean slightly forward for chest", "Lock out at the top"],
        "exercises": [("Chair Dip", "none"), ("Parallel-Bar Support Hold", "parallel_bars"),
                      ("Negative Dip", "parallel_bars"), ("Full Dip", "parallel_bars")],
    },

    # ---- PULL ----
    {
        "category": "pull", "movement_type": "strength", "equipment": "pullup_bar",
        "muscle_groups": ["back", "biceps", "forearms"],
        "form_cues": ["Full hang at the bottom", "Lead with the chest",
                      "Pull chin clearly over the bar", "Control the descent"],
        "exercises": ["Dead Hang", "Scapular Pull", "Negative Pull-up",
                      "Jumping/Assisted Pull-up", "Full Pull-up", "L-sit Pull-up",
                      "Weighted Pull-up"],
    },
    {
        "category": "pull", "movement_type": "strength", "equipment": "low_bar",
        "muscle_groups": ["back", "biceps", "rear_delts"],
        "form_cues": ["Body in a straight line", "Pull chest to the bar",
                      "Squeeze shoulder blades together", "Lower under control"],
        "exercises": ["Incline Row", "Horizontal Row", "Wide Row", "Archer Row",
                      "One-Arm Row"],
    },

    # ---- LEGS ----
    {
        "category": "legs", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["quads", "glutes"],
        "form_cues": ["Knees track over toes", "Hip crease to or below knee depth",
                      "Keep torso relatively upright", "Drive through the whole foot"],
        "exercises": ["Assisted Squat", "Bodyweight Squat", "Step-up", "Deep Step-up",
                      "Bulgarian Split Squat", "Pistol Squat"],
    },
    {
        "category": "legs", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["glutes", "hamstrings"],
        "form_cues": ["Posterior pelvic tilt at the top", "Squeeze glutes hard",
                      "Ribs down, no lower-back arch", "Full hip extension"],
        "exercises": ["Glute Bridge", "Single-Leg Glute Bridge", "Hip Thrust",
                      "Single-Leg Hip Thrust"],
    },
    {
        "category": "legs", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["calves"],
        "form_cues": ["Full stretch at the bottom", "Rise onto the balls of the feet",
                      "Pause at the top", "Slow controlled tempo"],
        "exercises": ["Double-Leg Calf Raise", "Single-Leg Calf Raise",
                      "Deficit Single-Leg Calf Raise"],
    },

    # ---- HINGE ----
    {
        "category": "hinge", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["hamstrings", "glutes", "lower_back"],
        "form_cues": ["Hinge from the hips, not the lower back", "Neutral spine throughout",
                      "Feel the stretch in the hamstrings", "Drive hips forward to stand"],
        "exercises": ["Floor Back Extension", "Romanian Deadlift", "Single-Leg RDL",
                      ("Nordic Curl", "anchor")],
    },

    # ---- CORE ----
    {
        "category": "core", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["abs", "core"],
        "form_cues": ["Hips level with shoulders and ankles", "Brace the abs",
                      "No sagging or piking", "Shoulders stacked over elbows"],
        "exercises": ["Plank", "Extended Plank", "Body Saw"],
    },
    {
        "category": "core", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["obliques", "core"],
        "form_cues": ["Stack hips and shoulders", "Lift hips off the floor",
                      "Keep body in one straight line", "Don't let the hips drop"],
        "exercises": ["Side Plank", "Side Plank with Leg Raise", "Copenhagen Plank"],
    },
    {
        "category": "core", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["abs", "core"],
        "form_cues": ["Lower back pressed into the floor", "Ribs down",
                      "Posterior pelvic tilt", "Stay tight, no arching"],
        "exercises": ["Tuck Hollow Hold", "Hollow Hold", "Hollow Rock"],
    },
    {
        "category": "core", "movement_type": "strength", "equipment": "none",
        "muscle_groups": ["lower_back", "glutes", "core"],
        "form_cues": ["Squeeze glutes and lift chest", "Reach arms long overhead",
                      "Keep neck neutral", "Stay tight throughout"],
        "exercises": ["Arch Hold", "Arch Rock"],
    },
    {
        "category": "core", "movement_type": "strength", "equipment": "pullup_bar",
        "muscle_groups": ["abs", "hip_flexors", "core"],
        "form_cues": ["Minimise swinging", "Control both up and down",
                      "Posterior pelvic tilt to start", "Raise with the abs, not momentum"],
        "exercises": ["Hanging Knee Raise", "Hanging Leg Raise", "Toes-to-Bar"],
    },

    # ---- SKILL (hold/quality progression, not 3x8) ----
    {
        "category": "core", "movement_type": "skill", "equipment": "parallel_bars",
        "muscle_groups": ["core", "hip_flexors", "triceps"],
        "form_cues": ["Depress the shoulders", "Lock out the elbows",
                      "Point the toes", "Hold legs as straight as the stage allows"],
        "exercises": ["Foot-Supported L-sit", "One-Foot L-sit", "Tuck L-sit", "Full L-sit"],
    },
    {
        "category": "push", "movement_type": "skill", "equipment": "none",
        "muscle_groups": ["shoulders", "core", "wrists"],
        "form_cues": ["Stack wrists, shoulders and hips", "Push the floor away",
                      "Squeeze glutes and point toes", "Look slightly forward"],
        "exercises": ["Wall Plank", "Wall Handstand Hold", "Freestanding Handstand"],
    },
]


# STANDALONE = single exercises with no progression chain (parent/next NULL).
# These are tracked for consistency and quality, NOT rep-based advancement.
STANDALONE = [
    # ---- PILATES ----
    {"name": "Dead Bug", "category": "core", "movement_type": "pilates", "difficulty": 2,
     "muscle_groups": ["core", "abs"],
     "form_cues": ["Lower back glued to the floor", "Move opposite arm and leg slowly",
                   "Exhale as you extend"]},
    {"name": "Bird-Dog", "category": "core", "movement_type": "pilates", "difficulty": 2,
     "muscle_groups": ["core", "lower_back", "glutes"],
     "form_cues": ["Keep hips square", "Reach opposite arm and leg long", "No rotation"]},
    {"name": "Single-Leg Stretch", "category": "core", "movement_type": "pilates", "difficulty": 2,
     "muscle_groups": ["abs", "core"],
     "form_cues": ["Curl the upper body up", "Keep the lower back anchored",
                   "Switch legs with control"]},
    {"name": "The Hundred", "category": "core", "movement_type": "pilates", "difficulty": 3,
     "muscle_groups": ["abs", "core"],
     "form_cues": ["Curl head and shoulders up", "Pump arms with small beats",
                   "Breathe in for 5, out for 5"]},
    {"name": "Roll-Up", "category": "core", "movement_type": "pilates", "difficulty": 3,
     "muscle_groups": ["abs", "core"],
     "form_cues": ["Articulate the spine one vertebra at a time", "Reach for the toes",
                   "Control the lowering"]},
    {"name": "Side-Lying Leg Series", "category": "legs", "movement_type": "pilates", "difficulty": 2,
     "muscle_groups": ["glutes", "hip_abductors"],
     "form_cues": ["Stack the hips", "Keep the torso still", "Move the leg with control"]},
    {"name": "Pilates Pelvic Curl", "category": "legs", "movement_type": "pilates", "difficulty": 2,
     "muscle_groups": ["glutes", "hamstrings", "core"],
     "form_cues": ["Roll the spine up one vertebra at a time", "Squeeze the glutes at the top",
                   "Lower with control"]},

    # ---- MOBILITY ----
    {"name": "Hip Flexor Stretch", "category": "mobility", "movement_type": "mobility", "difficulty": 1,
     "muscle_groups": ["hip_flexors"],
     "form_cues": ["Tuck the pelvis under", "Keep the torso tall", "Breathe into the stretch"]},
    {"name": "Pigeon Pose", "category": "mobility", "movement_type": "mobility", "difficulty": 2,
     "muscle_groups": ["glutes", "hips"],
     "form_cues": ["Keep hips square to the floor", "Fold forward gently", "Relax into it"]},
    {"name": "Cat-Cow", "category": "mobility", "movement_type": "mobility", "difficulty": 1,
     "muscle_groups": ["spine", "core"],
     "form_cues": ["Move with the breath", "Arch and round fully", "Slow and smooth"]},
    {"name": "Thoracic Rotation", "category": "mobility", "movement_type": "mobility", "difficulty": 1,
     "muscle_groups": ["thoracic_spine", "shoulders"],
     "form_cues": ["Rotate from the upper back", "Follow the hand with the eyes",
                   "Keep the hips stable"]},
    {"name": "Shoulder Dislocates", "category": "mobility", "movement_type": "mobility", "difficulty": 1,
     "muscle_groups": ["shoulders", "chest"],
     "form_cues": ["Use a wide grip", "Keep arms straight", "Move slowly through the range"]},
    {"name": "Deep Squat Hold", "category": "mobility", "movement_type": "mobility", "difficulty": 2,
     "muscle_groups": ["hips", "ankles", "groin"],
     "form_cues": ["Heels flat on the floor", "Elbows gently press the knees out",
                   "Keep the chest up"]},

    # ---- CARDIO ----
    {"name": "Burpees", "category": "cardio", "movement_type": "cardio", "difficulty": 4,
     "muscle_groups": ["full_body"],
     "form_cues": ["Chest to the floor", "Explode up", "Land softly"]},
    {"name": "Mountain Climbers", "category": "cardio", "movement_type": "cardio", "difficulty": 3,
     "muscle_groups": ["core", "shoulders", "legs"],
     "form_cues": ["Keep hips low", "Drive knees toward the chest", "Steady rhythm"]},
    {"name": "Jumping Jacks", "category": "cardio", "movement_type": "cardio", "difficulty": 1,
     "muscle_groups": ["full_body"],
     "form_cues": ["Land softly", "Full arm extension overhead", "Keep a steady pace"]},
    {"name": "High Knees", "category": "cardio", "movement_type": "cardio", "difficulty": 2,
     "muscle_groups": ["legs", "core"],
     "form_cues": ["Drive knees to hip height", "Stay on the balls of the feet",
                   "Pump the arms"]},
    {"name": "Squat Jumps", "category": "cardio", "movement_type": "cardio", "difficulty": 3,
     "muscle_groups": ["quads", "glutes", "calves"],
     "form_cues": ["Sit into a squat", "Explode upward", "Land softly into the next rep"]},
    {"name": "Push-up to Downward Dog", "category": "cardio", "movement_type": "cardio", "difficulty": 3,
     "muscle_groups": ["shoulders", "chest", "core"],
     "form_cues": ["Flow between the two positions", "Push the hips up and back",
                   "Keep the movement controlled"]},
]


def _connect():
    """Open a connection to the SQLite DB, creating the data dir if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _insert_exercise(conn, name, category, muscle_groups, difficulty,
                     variation_order, movement_type, equipment_needed, form_cues):
    """Insert one exercise (parent/next links set to NULL here) and return its id."""
    cur = conn.execute(
        """INSERT INTO exercises
               (name, category, muscle_groups, difficulty, variation_order,
                parent_exercise_id, next_exercise_id, movement_type,
                equipment_needed, form_cues)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)""",
        (name, category, json.dumps(muscle_groups), difficulty, variation_order,
         movement_type, equipment_needed, json.dumps(form_cues)),
    )
    return cur.lastrowid


def seed_exercises(conn):
    """Populate the exercises table with the full multi-modality library.

    Idempotent: does nothing if the table already has rows, so it is safe to
    call on every startup.
    """
    already = conn.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]
    if already:
        return

    # Progression chains: insert in order, then link parent/next.
    for chain in CHAINS:
        ids = []
        for order, entry in enumerate(chain["exercises"], start=1):
            if isinstance(entry, tuple):
                name, equipment = entry
            else:
                name, equipment = entry, chain["equipment"]
            ex_id = _insert_exercise(
                conn,
                name=name,
                category=chain["category"],
                muscle_groups=chain["muscle_groups"],
                difficulty=min(order, 10),
                variation_order=order,
                movement_type=chain["movement_type"],
                equipment_needed=equipment,
                form_cues=chain["form_cues"],
            )
            ids.append(ex_id)
        for i, ex_id in enumerate(ids):
            parent = ids[i - 1] if i > 0 else None
            nxt = ids[i + 1] if i < len(ids) - 1 else None
            conn.execute(
                "UPDATE exercises SET parent_exercise_id = ?, next_exercise_id = ? WHERE id = ?",
                (parent, nxt, ex_id),
            )

    # Standalone exercises: no progression chain (parent/next stay NULL).
    for ex in STANDALONE:
        _insert_exercise(
            conn,
            name=ex["name"],
            category=ex["category"],
            muscle_groups=ex["muscle_groups"],
            difficulty=ex["difficulty"],
            variation_order=1,
            movement_type=ex["movement_type"],
            equipment_needed=ex.get("equipment", "none"),
            form_cues=ex["form_cues"],
        )


def init_db():
    """Create all tables (if missing) and seed the exercise library."""
    conn = _connect()
    try:
        conn.executescript(SCHEMA)
        seed_exercises(conn)

        # Lightweight migrations for columns added after the table first shipped.
        # Each runs once; re-running on an already-migrated DB raises and is
        # skipped silently (SQLite has no "ADD COLUMN IF NOT EXISTS").
        migrations = [
            "ALTER TABLE exercises ADD COLUMN image_url TEXT",
        ]
        for sql in migrations:
            try:
                conn.execute(sql)
            except Exception:
                pass  # column already exists — skip silently

        conn.commit()
    finally:
        conn.close()


def get_db():
    """FastAPI dependency: yield a connection, always closing it afterwards."""
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()
