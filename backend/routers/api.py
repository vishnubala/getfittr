"""Aggregating API router for getfittr.

This is the single seam where feature routers attach. As each Phase 1/2 endpoint
file is built, create it under ``backend/routers/`` and wire it here with one
line — ``main.py`` never has to change.

Example (future):

    from . import profile, sessions, coach

    api_router.include_router(profile.router)
    api_router.include_router(sessions.router)
    api_router.include_router(coach.router)

``main.py`` mounts this whole router under the ``/api`` prefix, so a route
declared as ``GET /profile`` in ``profile.py`` is served at ``/api/profile``.
"""

from fastapi import APIRouter

from . import profile, sessions

api_router = APIRouter()

# Feature routers are included here as they are built (see module docstring).
api_router.include_router(profile.router, prefix="/profile")
# sessions routes already carry their full paths (/exercises, /sessions), so
# they mount with no sub-prefix -> /api/exercises, /api/sessions, ...
api_router.include_router(sessions.router)
