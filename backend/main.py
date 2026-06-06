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
    """Serve the frontend shell."""
    return FileResponse(FRONTEND_DIR / "index.html")


# Feature endpoints (profile, sessions, coach) attach to api_router; see
# backend/routers/api.py. Served under /api.
app.include_router(api_router, prefix="/api")

# Mounted last so it doesn't shadow "/" or "/health". Static assets (style.css,
# app.js, pose.js, voice.js) are reachable at /static/...
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
