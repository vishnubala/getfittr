"""FastAPI application entry point for getfittr.

Wires the app together: initialises the database on startup, allows CORS (this is
a local single-user app), serves the frontend, exposes a health check, and mounts
the aggregating API router so future endpoints attach without touching this file.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .database import _connect, init_db
from .routers.api import api_router

# Frontend assets live at <project_root>/frontend, resolved from THIS file so it
# works regardless of where uvicorn is launched from (matches database.py).
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


class NoCacheStaticFiles(StaticFiles):
    """StaticFiles that tells the browser never to cache assets.

    Plain StaticFiles sends no Cache-Control header, so browsers fall back to
    heuristic caching and keep serving an old style.css/app.js after you edit
    it. For a local single-user dev app we always want the latest file, so we
    force revalidation on every request.
    """

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create and seed the database before the app starts serving requests."""
    init_db()
    yield
    # No teardown needed: each request opens and closes its own connection.


app = FastAPI(title="GetFittr", lifespan=lifespan)

# Local personal app — no auth, no deployment. Allow everything.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Liveness + DB connectivity check."""
    try:
        conn = _connect()
        try:
            conn.execute("SELECT 1")
        finally:
            conn.close()
    except Exception as exc:  # surface DB failure rather than reporting "ok"
        return JSONResponse(
            status_code=503,
            content={"status": "error", "app": "GetFittr", "db": "error", "detail": str(exc)},
        )
    return {"status": "ok", "app": "GetFittr", "db": "connected"}


@app.get("/")
def index():
    """Serve the frontend shell (uncached so edits show up on reload)."""
    return FileResponse(
        FRONTEND_DIR / "index.html",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


# Feature endpoints (profile, sessions, coach) attach to api_router; see
# backend/routers/api.py. Served under /api.
app.include_router(api_router, prefix="/api")

# Mounted last so it doesn't shadow "/" or "/health". Static assets (style.css,
# app.js, pose.js, voice.js) are reachable at /static/...
app.mount("/static", NoCacheStaticFiles(directory=FRONTEND_DIR), name="static")
