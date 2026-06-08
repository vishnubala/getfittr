"""Session endpoints: exercise library + manual session logging.

This is the Phase 1, Step 6 feature. A "session" is one workout; "sets" are the
individual logged efforts within it. Manual logging (no camera) sets
``manually_entered = 1`` and is the only path wired up so far.

Mounted by ``api.py`` with ``prefix="/api"`` (note: no extra sub-prefix here —
each route below already carries its full path, e.g. ``/exercises``,
``/sessions``), so the handlers serve ``GET /api/exercises``,
``POST /api/sessions``, etc.
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..models import (
    ExerciseOut,
    SessionCreate,
    SessionDetailOut,
    SessionEnd,
    SessionOut,
    SessionSummaryOut,
    SetCreate,
    SetOut,
)

router = APIRouter()


def _parse_muscle_groups(raw) -> list[str]:
    """Decode the muscle_groups JSON column; tolerate null/malformed values."""
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except (ValueError, TypeError):
        return []


# ---------------------------------------------------------------------------
# Exercise library
# ---------------------------------------------------------------------------


@router.get("/exercises", response_model=list[ExerciseOut])
def list_exercises(q: str | None = None, db=Depends(get_db)):
    """Return the exercise library alphabetically.

    Optional ``?q=`` does a case-insensitive substring match against the
    exercise name, category, or movement_type.
    """
    sql = (
        "SELECT id, name, category, movement_type, muscle_groups, "
        "       equipment_needed, difficulty, image_url "
        "FROM exercises"
    )
    params: tuple = ()
    if q:
        like = f"%{q.lower()}%"
        sql += (
            " WHERE LOWER(name) LIKE ? OR LOWER(category) LIKE ? "
            "OR LOWER(movement_type) LIKE ?"
        )
        params = (like, like, like)
    sql += " ORDER BY name COLLATE NOCASE ASC"

    rows = db.execute(sql, params).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "movement_type": r["movement_type"],
            "muscle_groups": _parse_muscle_groups(r["muscle_groups"]),
            "equipment_needed": r["equipment_needed"],
            "difficulty": r["difficulty"],
            "image_url": r["image_url"],
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


def _require_session(db, session_id: int):
    """Fetch a session row or raise 404."""
    row = db.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return row


@router.post("/sessions", response_model=SessionOut)
def create_session(payload: SessionCreate, db=Depends(get_db)):
    """Start a manually-entered session and return it."""
    now = datetime.now().isoformat()
    cur = db.execute(
        """INSERT INTO sessions
               (date, start_time, session_type, manually_entered, created_at)
           VALUES (?, ?, ?, 1, ?)""",
        (payload.date, now, payload.session_type, now),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM sessions WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return dict(row)


@router.post("/sessions/{session_id}/sets", response_model=SetOut)
def add_set(session_id: int, payload: SetCreate, db=Depends(get_db)):
    """Add one set to a session and return it (joined with exercise name)."""
    _require_session(db, session_id)

    cur = db.execute(
        """INSERT INTO session_sets
               (session_id, exercise_id, set_number, reps_completed,
                duration_seconds, rpe, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            session_id,
            payload.exercise_id,
            payload.set_number,
            payload.reps_completed,
            payload.duration_seconds,
            payload.rpe,
            payload.notes,
        ),
    )
    db.commit()

    row = db.execute(
        """SELECT s.id, s.session_id, s.exercise_id, e.name AS exercise_name,
                  s.set_number, s.reps_completed, s.duration_seconds, s.rpe,
                  s.notes
           FROM session_sets s
           JOIN exercises e ON e.id = s.exercise_id
           WHERE s.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return dict(row)


@router.put("/sessions/{session_id}/end", response_model=SessionOut)
def end_session(session_id: int, payload: SessionEnd, db=Depends(get_db)):
    """Mark a session finished: set end_time, compute duration, save RPE."""
    row = _require_session(db, session_id)

    end = datetime.now()
    duration_minutes = None
    if row["start_time"]:
        try:
            start = datetime.fromisoformat(row["start_time"])
            duration_minutes = max(0, round((end - start).total_seconds() / 60))
        except ValueError:
            duration_minutes = None

    db.execute(
        """UPDATE sessions
           SET end_time = ?, duration_minutes = ?, overall_rpe = ?
           WHERE id = ?""",
        (end.isoformat(), duration_minutes, payload.overall_rpe, session_id),
    )
    db.commit()

    updated = db.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    return dict(updated)


@router.get("/sessions", response_model=list[SessionSummaryOut])
def list_sessions(db=Depends(get_db)):
    """Return all sessions newest-first, with exercise and set counts."""
    rows = db.execute(
        """SELECT s.id, s.date, s.session_type, s.duration_minutes,
                  s.overall_rpe, s.manually_entered,
                  COUNT(DISTINCT ss.exercise_id) AS exercise_count,
                  COUNT(ss.id) AS set_count
           FROM sessions s
           LEFT JOIN session_sets ss ON ss.session_id = s.id
           GROUP BY s.id
           ORDER BY s.date DESC, s.id DESC"""
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/sessions/{session_id}", response_model=SessionDetailOut)
def get_session(session_id: int, db=Depends(get_db)):
    """Return one session with all its sets, ordered by exercise then set."""
    row = _require_session(db, session_id)

    set_rows = db.execute(
        """SELECT s.id, s.session_id, s.exercise_id, e.name AS exercise_name,
                  s.set_number, s.reps_completed, s.duration_seconds, s.rpe,
                  s.notes
           FROM session_sets s
           JOIN exercises e ON e.id = s.exercise_id
           WHERE s.session_id = ?
           ORDER BY s.exercise_id ASC, s.set_number ASC""",
        (session_id,),
    ).fetchall()

    detail = dict(row)
    detail["sets"] = [dict(r) for r in set_rows]
    return detail
