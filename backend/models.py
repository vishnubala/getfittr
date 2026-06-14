"""Pydantic request/response models for getfittr.

These describe the JSON shapes crossing the API boundary. The SQLite layer
stores list-valued fields (goals, injuries, rest_days, available_equipment) as
JSON-encoded TEXT; the router does that (de)serialisation, so here they are
plain Python lists.
"""

from typing import Optional

from pydantic import BaseModel, Field


class ProfileIn(BaseModel):
    """Profile fields accepted from the client on POST /api/profile.

    ``name`` and ``fitness_level`` are required (the frontend enforces this too);
    everything else is optional with sensible defaults.
    """

    name: str
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_level: str
    goals: list[str] = Field(default_factory=list)
    injuries: list[str] = Field(default_factory=list)
    rest_days: list[str] = Field(default_factory=list)
    available_equipment: list[str] = Field(default_factory=lambda: ["none"])
    diet_module_enabled: bool = False


class ProfileOut(BaseModel):
    """Profile as returned to the client, including server-managed fields."""

    id: int
    name: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_level: Optional[str] = None
    goals: list[str] = Field(default_factory=list)
    injuries: list[str] = Field(default_factory=list)
    rest_days: list[str] = Field(default_factory=list)
    available_equipment: list[str] = Field(default_factory=list)
    diet_module_enabled: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Exercise library + manual session logging (Phase 1, Step 6)
# ---------------------------------------------------------------------------


class ExerciseOut(BaseModel):
    """One exercise from the library, as returned by GET /api/exercises."""

    id: int
    name: str
    category: Optional[str] = None
    movement_type: str
    muscle_groups: list[str] = Field(default_factory=list)
    equipment_needed: str
    difficulty: Optional[int] = None
    image_url: Optional[str] = None


class SessionCreate(BaseModel):
    """Body for POST /api/sessions — start a session.

    ``manually_entered`` defaults to 1 (historical backfill, the manual-log flow);
    the live workout player sends 0 to mark a camera/coached session.
    """

    date: str                 # ISO date string, e.g. "2026-06-08"
    session_type: str = "custom"
    manually_entered: int = 1


class SessionOut(BaseModel):
    """A session row as returned to the client."""

    id: int
    date: str
    session_type: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    overall_rpe: Optional[float] = None
    manually_entered: int
    created_at: Optional[str] = None


class SetCreate(BaseModel):
    """Body for POST /api/sessions/{id}/sets — one logged set."""

    exercise_id: int
    set_number: int
    reps_completed: Optional[int] = None
    duration_seconds: Optional[int] = None  # for holds: plank, L-sit, etc.
    rpe: Optional[int] = None                # 1–10; NULL until RPE capture (5b)
    notes: Optional[str] = None


class SetOut(BaseModel):
    """A logged set, joined with its exercise name."""

    id: int
    session_id: int
    exercise_id: int
    exercise_name: str   # joined from exercises table
    set_number: int
    reps_completed: Optional[int] = None
    duration_seconds: Optional[int] = None
    rpe: Optional[int] = None
    notes: Optional[str] = None


class SessionEnd(BaseModel):
    """Body for PUT /api/sessions/{id}/end — finalise a session."""

    overall_rpe: Optional[float] = None


class SessionSummaryOut(BaseModel):
    """A session as shown in the History list (with aggregate counts)."""

    id: int
    date: str
    session_type: str
    duration_minutes: Optional[int] = None
    overall_rpe: Optional[float] = None
    exercise_count: int   # distinct exercises logged
    set_count: int        # total sets logged
    manually_entered: int


class SessionDetailOut(BaseModel):
    """A single session with all its sets, for the detail panel."""

    id: int
    date: str
    session_type: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    overall_rpe: Optional[float] = None
    manually_entered: int
    sets: list[SetOut] = Field(default_factory=list)
