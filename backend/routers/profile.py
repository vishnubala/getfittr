"""Profile endpoints: read and upsert the single user_profile row.

There is exactly one user (this is a personal app), so the profile always lives
at ``id = 1``. GET returns it (404 before first setup); POST upserts it.

Mounted by ``api.py`` with ``prefix="/profile"``, and ``main.py`` mounts the
whole API under ``/api``, so these handlers serve ``GET/POST /api/profile``.
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..models import ProfileIn, ProfileOut

router = APIRouter()

# user_profile columns persisted as JSON-encoded arrays of strings.
_JSON_FIELDS = ("goals", "injuries", "rest_days", "available_equipment")


def _row_to_profile(row) -> dict:
    """Turn a sqlite Row into a JSON-serialisable profile dict.

    Decodes the JSON array columns back into lists and the integer flag back
    into a real bool, so the response matches ProfileOut.
    """
    data = dict(row)
    for field in _JSON_FIELDS:
        raw = data.get(field)
        data[field] = json.loads(raw) if raw else []
    data["diet_module_enabled"] = bool(data["diet_module_enabled"])
    return data


@router.get("", response_model=ProfileOut)
def get_profile(db=Depends(get_db)):
    """Return the single profile row, or 404 if setup hasn't happened yet."""
    row = db.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No profile yet")
    return _row_to_profile(row)


@router.post("", response_model=ProfileOut)
def upsert_profile(profile: ProfileIn, db=Depends(get_db)):
    """Create or overwrite the profile at id=1 and return the saved row.

    created_at is preserved across updates; updated_at is bumped every save.
    """
    now = datetime.now(timezone.utc).isoformat()
    existing = db.execute(
        "SELECT created_at FROM user_profile WHERE id = 1"
    ).fetchone()
    created_at = existing["created_at"] if existing else now

    db.execute(
        """INSERT INTO user_profile
               (id, name, age, height_cm, weight_kg, fitness_level, goals,
                injuries, rest_days, available_equipment, diet_module_enabled,
                created_at, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               age = excluded.age,
               height_cm = excluded.height_cm,
               weight_kg = excluded.weight_kg,
               fitness_level = excluded.fitness_level,
               goals = excluded.goals,
               injuries = excluded.injuries,
               rest_days = excluded.rest_days,
               available_equipment = excluded.available_equipment,
               diet_module_enabled = excluded.diet_module_enabled,
               updated_at = excluded.updated_at""",
        (
            profile.name,
            profile.age,
            profile.height_cm,
            profile.weight_kg,
            profile.fitness_level,
            json.dumps(profile.goals),
            json.dumps(profile.injuries),
            json.dumps(profile.rest_days),
            json.dumps(profile.available_equipment),
            int(profile.diet_module_enabled),
            created_at,
            now,
        ),
    )
    db.commit()

    row = db.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    return _row_to_profile(row)
