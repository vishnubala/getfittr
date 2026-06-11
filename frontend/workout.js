// GetFittr — Workout section: AI plan display (Phase 2a, Step 4).
// Owns the four visual states of #workout-plan: empty (button), loading,
// loaded (the rendered plan), and error. Fetches GET /api/coach/plan and caches
// the result so navigating away and back doesn't re-fetch. Step 5 will add the
// active-session controls in #workout-active.

// TODO: speak coach_message via voice.js once voice.js is implemented (Phase 2a Step 5+)

// Cached plan dict, null until the first successful fetch. While null the Workout
// tab shows the empty state; once set, navigating back renders it without a fetch.
let _plan = null;

// Escape text that gets dropped into innerHTML. The mock plan is safe, but real
// Claude output is less controlled, so we never trust it to be HTML-clean.
function esc(s) {
    return String(s ?? "").replace(/[&<>]/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
    );
}

// The single source of truth for how a "work" detail string is formatted.
// Used for warm-up items, skill work, and superset exercises alike:
//   - has `sets`  → strength/skill/hold: "{sets} × {reps} reps" or "{sets} × {seconds}s"
//   - no `sets`   → warm-up: bodyline hold (has exercise_id) "⏱ {seconds}s",
//                   else dynamic stretch "{reps} reps"
function workDetail(item) {
    if (item.sets != null) {
        if (item.reps != null) return `${item.sets} × ${item.reps} reps`;
        if (item.seconds != null) return `${item.sets} × ${item.seconds}s`;
    } else {
        if ("exercise_id" in item) return `⏱ ${item.seconds}s`;
        if (item.reps != null) return `${item.reps} reps`;
    }
    return "";
}

// Convenience: the host element every state renders into.
function planHost() {
    return document.getElementById("workout-plan");
}

// ---------------------------------------------------------------------------
// STATE 1 — empty (no plan yet): the call-to-action button.
// ---------------------------------------------------------------------------
function renderEmpty() {
    planHost().innerHTML = `
        <div class="card plan-centered">
            <p class="muted">Your AI coach will generate today's workout.</p>
            <button id="get-plan-btn" class="btn-primary">Get Today's Plan</button>
        </div>`;
    document
        .getElementById("get-plan-btn")
        .addEventListener("click", fetchAndRenderPlan);
}

// ---------------------------------------------------------------------------
// STATE 2 — loading: brief placeholder while the fetch is in flight.
// ---------------------------------------------------------------------------
function renderLoading() {
    planHost().innerHTML = `
        <div class="card plan-centered">
            <p class="muted">Generating your plan…</p>
        </div>`;
}

// ---------------------------------------------------------------------------
// STATE 4 — error: shown on a failed request or a coach error.
// ---------------------------------------------------------------------------
function renderError(detail) {
    planHost().innerHTML = `
        <div class="card plan-centered">
            <p class="muted">Couldn't generate your plan.</p>
            <p class="muted plan-error-detail">${esc(detail)}</p>
            <button id="try-again-btn" class="btn-secondary">Try Again</button>
        </div>`;
    document
        .getElementById("try-again-btn")
        .addEventListener("click", fetchAndRenderPlan);
}

// ---------------------------------------------------------------------------
// STATE 3 — loaded: the full rendered plan.
// ---------------------------------------------------------------------------

// One plan row: bold name with its note beneath, work detail on the right.
function planItemRow(item) {
    return `
        <div class="plan-item">
            <span class="plan-item-name">${esc(item.name)}
                <span class="plan-item-note">${esc(item.note)}</span>
            </span>
            <span class="plan-item-detail">${workDetail(item)}</span>
        </div>`;
}

function renderWarmup(warmUp) {
    const rows = (warmUp || []).map(planItemRow).join("");
    return `
        <div class="plan-section">
            <div class="plan-section-title">Warm-up</div>
            ${rows}
        </div>`;
}

function renderSkill(skillWork) {
    if (!skillWork || skillWork.length === 0) return "";
    const rows = skillWork.map(planItemRow).join("");
    return `
        <div class="plan-section">
            <div class="plan-section-title">Skill Work</div>
            ${rows}
        </div>`;
}

function renderSupersets(supersets) {
    const cards = (supersets || [])
        .map((ss) => {
            const exercises = ss.exercises
                .map(
                    (ex) => `
                <div class="plan-superset-exercise">
                    <span class="plan-item-name">${esc(ex.name)}
                        <span class="plan-item-note">${esc(ex.note)}</span>
                    </span>
                    <span class="plan-item-detail">${workDetail(ex)}</span>
                </div>`
                )
                .join("");
            return `
                <div class="card plan-superset">
                    <div class="plan-superset-pair">Pair ${esc(ss.pair)}</div>
                    ${exercises}
                </div>`;
        })
        .join("");
    return `
        <div class="plan-section">
            <div class="plan-section-title">Supersets</div>
            ${cards}
        </div>`;
}

function renderLoaded() {
    const p = _plan;
    planHost().innerHTML = `
        <div class="section-header">
            <span class="muted">~${esc(p.estimated_duration_minutes)} min</span>
            <button id="refresh-plan-btn" class="btn-text">Refresh Plan</button>
        </div>
        <div class="card plan-coach-msg">
            <p>${esc(p.coach_message)}</p>
        </div>
        ${renderWarmup(p.warm_up)}
        ${renderSkill(p.skill_work)}
        ${renderSupersets(p.supersets)}
        <div class="card">
            <div class="plan-section-title">Cool-down</div>
            <p class="muted">${esc(p.cool_down)}</p>
        </div>`;
    // Refresh always re-fetches (fetchAndRenderPlan ignores the cache).
    document
        .getElementById("refresh-plan-btn")
        .addEventListener("click", fetchAndRenderPlan);
}

// ---------------------------------------------------------------------------
// Fetch + state machine
// ---------------------------------------------------------------------------

// Always hits the network (used by the button, Refresh, and Try Again). Caches
// the plan on success so loadWorkoutPlan() can re-render it later without a call.
async function fetchAndRenderPlan() {
    renderLoading();
    try {
        const res = await fetch("/api/coach/plan");
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.error === true) {
            const detail =
                (data && (data.detail || data.message)) ||
                `Request failed (${res.status})`;
            renderError(detail);
            return;
        }
        _plan = data;
        renderLoaded();
    } catch (err) {
        renderError(err.message);
    }
}

// ---------------------------------------------------------------------------
// Public API (called from app.js on navigation)
// ---------------------------------------------------------------------------

// Render whatever we already have: the cached plan if present, otherwise the
// empty state. Never auto-fetches — fetching is the button's job.
window.loadWorkoutPlan = function loadWorkoutPlan() {
    if (_plan) {
        renderLoaded();
    } else {
        renderEmpty();
    }
};

// Drop the cache and fetch a fresh plan.
window.refreshWorkoutPlan = function refreshWorkoutPlan() {
    _plan = null;
    fetchAndRenderPlan();
};
