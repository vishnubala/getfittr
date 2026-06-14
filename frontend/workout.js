// GetFittr — Workout section: AI plan display + session player.
//
// Plan display (Step 4): the four visual states of #workout-plan — empty,
// loading, loaded, error. Fetches GET /api/coach/plan and caches it.
//
// Session player (Step 5a): "Start Workout" creates a real session, then the
// player in #workout-active walks the plan step by step (Start Set / End Set),
// saving each logged set with rpe = NULL. It survives a refresh via localStorage
// and, on return, offers Resume / Finish & save / Discard for an open session.
// (RPE capture = 5b, voice = 5c, post-session summary = Step 6.)

// TODO: speak coach_message via voice.js once voice.js is implemented (Phase 2a Step 5c)

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
            <div class="plan-header-actions">
                <button id="start-workout-btn" class="btn-primary">Start Workout</button>
                <button id="refresh-plan-btn" class="btn-text">Refresh Plan</button>
            </div>
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
    // Start Workout creates the session and enters the player; Refresh re-fetches.
    document
        .getElementById("start-workout-btn")
        .addEventListener("click", startWorkout);
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

// ===========================================================================
// Session player (Step 5a)
// ===========================================================================

const ACTIVE_KEY = "getfittr.activeWorkout";   // {sessionId, plan, pos, lastByExercise}
const REST_KEY = "getfittr.restSeconds";       // user's custom rest duration

// In-memory active player, null when not in a workout:
//   { sessionId, plan, steps:[...], pos:int, lastByExercise:{exId: value} }
let _player = null;
let _audioCtx = null;                  // unlocked on the Start Workout gesture
let _holdTimer = null, _holdElapsed = 0;
let _rest = null;

// ---- audio (item 3): unlock inside the user gesture so the beep isn't blocked
function unlockAudio() {
    try {
        if (!_audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) _audioCtx = new Ctx();
        }
        if (_audioCtx && _audioCtx.state === "suspended") _audioCtx.resume();
    } catch (e) {
        _audioCtx = null;
    }
}

function beep() {
    if (!_audioCtx) return;
    try {
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0.12;
        osc.connect(gain).connect(_audioCtx.destination);
        osc.start();
        osc.stop(_audioCtx.currentTime + 0.18);
    } catch (e) { /* non-fatal */ }
}

// ---- localStorage helpers
function getRestSeconds() {
    const v = parseInt(localStorage.getItem(REST_KEY), 10);
    return Number.isFinite(v) && v > 0 ? v : 90;
}
function setRestSeconds(s) {
    localStorage.setItem(REST_KEY, String(s));
}
function persistPlayer() {
    if (!_player) return;
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({
        sessionId: _player.sessionId,
        plan: _player.plan,
        pos: _player.pos,
        lastByExercise: _player.lastByExercise,
    }));
}
function readActiveStorage() {
    try {
        return JSON.parse(localStorage.getItem(ACTIVE_KEY));
    } catch (e) {
        return null;
    }
}
function clearActiveStorage() {
    localStorage.removeItem(ACTIVE_KEY);
}

// ---- view toggle between the plan and the active player
function activeHost() {
    return document.getElementById("workout-active");
}
function showPlanView() {
    const act = activeHost();
    act.classList.add("hidden");
    act.innerHTML = "";
    document.getElementById("workout-plan").classList.remove("hidden");
}
function showActiveView() {
    document.getElementById("workout-plan").classList.add("hidden");
    activeHost().classList.remove("hidden");
}

// ---- plan → flat ordered steps[]; "current position" is an index into this.
// "5-8" → {low, high}; a single number → {low:n, high:n}.
function parseRange(reps) {
    const both = String(reps ?? "").match(/(\d+)\D+(\d+)/);
    if (both) return { low: +both[1], high: +both[2] };
    const one = String(reps ?? "").match(/(\d+)/);
    const n = one ? +one[1] : 1;
    return { low: n, high: n };
}

function flattenPlan(plan) {
    const steps = [];
    const counters = {};  // exercise_id → next per-exercise set_number
    const nextSetNo = (exId) => {
        counters[exId] = (counters[exId] || 0) + 1;
        return counters[exId];
    };

    (plan.warm_up || []).forEach((it) => {
        if ("exercise_id" in it) {
            steps.push({
                phase: "warm_up", logged: true, kind: "hold",
                exercise_id: it.exercise_id, name: it.name, note: it.note,
                seconds: it.seconds, set_number: nextSetNo(it.exercise_id),
            });
        } else {
            steps.push({
                phase: "warm_up", logged: false, kind: "stretch",
                name: it.name, note: it.note, reps: it.reps,
            });
        }
    });

    (plan.skill_work || []).forEach((it) => {
        for (let i = 0; i < (it.sets || 1); i++) {
            steps.push({
                phase: "skill_work", logged: true, kind: "hold",
                exercise_id: it.exercise_id, name: it.name, note: it.note,
                seconds: it.seconds, set_number: nextSetNo(it.exercise_id),
            });
        }
    });

    // Supersets: alternate the two exercises set by set (X1,Y1,X2,Y2,…).
    (plan.supersets || []).forEach((ss) => {
        const exs = ss.exercises || [];
        const maxSets = exs.reduce((m, e) => Math.max(m, e.sets || 0), 0);
        for (let setIdx = 0; setIdx < maxSets; setIdx++) {
            exs.forEach((ex) => {
                if (setIdx >= (ex.sets || 0)) return;  // unequal sets: shorter drops out
                const isHold = ex.seconds != null && ex.reps == null;
                const step = {
                    phase: "superset", pair: ss.pair, logged: true,
                    exercise_id: ex.exercise_id, name: ex.name, note: ex.note,
                    set_number: nextSetNo(ex.exercise_id),
                };
                if (isHold) {
                    step.kind = "hold";
                    step.seconds = ex.seconds;
                } else {
                    step.kind = "reps";
                    step.range = parseRange(ex.reps);
                }
                steps.push(step);
            });
        }
    });

    if (plan.cool_down) {
        steps.push({
            phase: "cool_down", logged: false, kind: "text",
            name: "Cool-down", text: plan.cool_down,
        });
    }

    return steps;
}

// ---- Start Workout: create the session, build the player, render step 0.
async function startWorkout(ev) {
    unlockAudio();
    const btn = ev && ev.currentTarget;
    if (btn) btn.disabled = true;  // hardening: no double-POST from a double-click
    try {
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                date: today,
                session_type: (_plan && _plan.session_type) || "full_body",
                manually_entered: 0,
            }),
        });
        if (!res.ok) throw new Error(`Couldn't start (${res.status})`);
        const session = await res.json();
        _player = {
            sessionId: session.id, plan: _plan,
            steps: flattenPlan(_plan), pos: 0, lastByExercise: {},
        };
        persistPlayer();
        renderActive();
    } catch (err) {
        if (btn) btn.disabled = false;
        const host = document.getElementById("start-workout-btn");
        if (host && !document.getElementById("start-error")) {
            host.insertAdjacentHTML("afterend",
                `<span id="start-error" class="form-status error">${esc(err.message)}</span>`);
        }
    }
}

// ---- render the current step (mode: 'start' shows Start Set; 'capture' the inputs)
function renderActive(mode) {
    stopHoldTimer();
    stopRest();
    if (!_player) return;
    if (_player.pos >= _player.steps.length) { finishWorkout(); return; }

    showActiveView();
    const step = _player.steps[_player.pos];
    const total = _player.steps.length;

    let body;
    if (step.kind === "stretch") body = stretchBody(step);
    else if (step.kind === "text") body = textBody(step);
    else if (mode === "capture") body = captureBody(step);
    else body = startBody(step);

    activeHost().innerHTML = `
        <div class="section-header">
            <span class="muted">Step ${_player.pos + 1} / ${total}${
                step.pair ? " · Pair " + esc(step.pair) : ""}</span>
            <button id="exit-workout-btn" class="btn-text">Exit</button>
        </div>
        <div class="card player-step">${body}</div>`;

    document.getElementById("exit-workout-btn").addEventListener("click", exitToPlan);
    if (step.kind === "stretch") {
        document.getElementById("next-step-btn").addEventListener("click", advanceDisplay);
    } else if (step.kind === "text") {
        document.getElementById("finish-workout-btn").addEventListener("click", finishWorkout);
    } else if (mode === "capture") {
        bindCapture(step);
    } else {
        document.getElementById("start-set-btn")
            .addEventListener("click", () => renderActive("capture"));
    }
}

function stretchBody(step) {
    const detail = step.reps != null ? `${step.reps} reps` : "Dynamic stretch";
    return `
        <div class="player-step-name">${esc(step.name)}</div>
        ${step.note ? `<p class="muted player-step-note">${esc(step.note)}</p>` : ""}
        <p class="muted">${detail} · not logged</p>
        <button id="next-step-btn" class="btn-primary">Next</button>`;
}

function textBody(step) {
    return `
        <div class="player-step-name">${esc(step.name)}</div>
        <p class="muted">${esc(step.text)}</p>
        <p class="form-status error hidden" id="finish-error">Couldn't finish — tap Finish Workout to retry.</p>
        <button id="finish-workout-btn" class="btn-primary">Finish Workout</button>`;
}

function startBody(step) {
    const target = step.kind === "hold"
        ? `Target ${step.seconds}s`
        : `Target ${step.range.low}-${step.range.high} reps`;
    return `
        <div class="player-step-name">${esc(step.name)}</div>
        ${step.note ? `<p class="muted player-step-note">${esc(step.note)}</p>` : ""}
        <p class="muted">Set ${step.set_number} · ${target}</p>
        <button id="start-set-btn" class="btn-primary">Start Set</button>`;
}

function captureBody(step) {
    const unit = step.kind === "hold" ? "s" : "reps";
    const timer = step.kind === "hold"
        ? `<div class="hold-timer" id="hold-timer">0s</div>` : "";
    return `
        <div class="player-step-name">${esc(step.name)}</div>
        <p class="muted">Set ${step.set_number}</p>
        ${timer}
        <div class="stepper">
            <button class="stepper-btn" id="step-minus" aria-label="decrease">−</button>
            <span class="stepper-value" id="step-value">…</span>
            <span class="stepper-unit">${unit}</span>
            <button class="stepper-btn" id="step-plus" aria-label="increase">+</button>
        </div>
        <p class="form-status error hidden" id="set-error">Couldn't save — tap End Set to retry.</p>
        <button id="end-set-btn" class="btn-primary">End Set</button>`;
}

async function bindCapture(step) {
    const valEl = document.getElementById("step-value");
    const read = () => parseInt(valEl.textContent, 10) || 1;
    const write = (v) => { valEl.textContent = Math.max(1, v); };
    document.getElementById("step-minus").addEventListener("click", () => write(read() - 1));
    document.getElementById("step-plus").addEventListener("click", () => write(read() + 1));
    document.getElementById("end-set-btn")
        .addEventListener("click", () => endSet(step, read()));
    if (step.kind === "hold") startHoldTimer();
    // Seed the stepper (async, crash-proof — item 7).
    write(await seedValue(step));
}

// Set 1 → most recent value for this exercise from a prior session (last-set
// route); on error OR no history, the range lower bound / target seconds. Sets
// 2+ → the previous set's actual value this session.
async function seedValue(step) {
    if (step.set_number > 1 && _player.lastByExercise[step.exercise_id] != null) {
        return _player.lastByExercise[step.exercise_id];
    }
    try {
        const res = await fetch(
            `/api/exercises/${step.exercise_id}/last-set?exclude_session=${_player.sessionId}`);
        if (res.ok) {
            const data = await res.json();
            if (data) {
                const v = step.kind === "hold" ? data.duration_seconds : data.reps_completed;
                if (v != null) return v;
            }
        }
    } catch (e) { /* fall through to the static fallback */ }
    return step.kind === "hold" ? (step.seconds || 1) : (step.range ? step.range.low : 1);
}

function startHoldTimer() {
    stopHoldTimer();
    _holdElapsed = 0;
    const el = document.getElementById("hold-timer");
    _holdTimer = setInterval(() => {
        _holdElapsed += 1;
        if (el) el.textContent = `${_holdElapsed}s`;
    }, 1000);
}
function stopHoldTimer() {
    if (_holdTimer) { clearInterval(_holdTimer); _holdTimer = null; }
}

// End Set: save, THEN (item 4) advance pos + persist — only after the POST 200,
// so a crash mid-save can't replay/duplicate the set on resume.
async function endSet(step, value) {
    stopHoldTimer();
    const body = { exercise_id: step.exercise_id, set_number: step.set_number, rpe: null };
    if (step.kind === "hold") body.duration_seconds = value;
    else body.reps_completed = value;

    try {
        const res = await fetch(`/api/sessions/${_player.sessionId}/sets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("save failed");
    } catch (e) {
        const err = document.getElementById("set-error");
        if (err) err.classList.remove("hidden");
        return;  // stay on the step; never pre-advance
    }

    _player.lastByExercise[step.exercise_id] = value;
    _player.pos += 1;
    persistPlayer();

    // Rest only between training sets (item 6) — not after warm-up bodyline holds.
    const restApplies = step.phase === "skill_work" || step.phase === "superset";
    if (restApplies && _player.pos < _player.steps.length) renderRest();
    else renderActive();
}

function advanceDisplay() {
    _player.pos += 1;
    persistPlayer();
    renderActive();
}

// Rest screen: countdown from the custom default, Skip, and a "Start Next Set"
// that is live the whole time. On expiry: beep + flash + flip to a count-up.
function renderRest() {
    const rs = getRestSeconds();
    activeHost().innerHTML = `
        <div class="section-header">
            <span class="muted">Rest</span>
            <button id="exit-workout-btn" class="btn-text">Exit</button>
        </div>
        <div class="card player-rest">
            <div class="rest-time" id="rest-time">${rs}s</div>
            <div class="rest-actions">
                <button id="start-next-btn" class="btn-primary">Start Next Set</button>
                <button id="skip-rest-btn" class="btn-secondary">Skip</button>
            </div>
            <label class="rest-config muted">Rest seconds
                <input type="number" id="rest-input" min="5" value="${rs}">
            </label>
        </div>`;
    document.getElementById("exit-workout-btn").addEventListener("click", exitToPlan);
    const go = () => { stopRest(); renderActive(); };
    document.getElementById("start-next-btn").addEventListener("click", go);
    document.getElementById("skip-rest-btn").addEventListener("click", go);
    document.getElementById("rest-input").addEventListener("change", (e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isFinite(v) && v > 0) setRestSeconds(v);
    });
    startRestCountdown(rs);
}

function startRestCountdown(total) {
    stopRest();
    let remaining = total;
    const el = document.getElementById("rest-time");
    _rest = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
            if (el) el.textContent = `${remaining}s`;
        } else if (remaining === 0) {
            if (el) { el.textContent = "0s"; el.classList.add("rest-expired"); }
            beep();
        } else {
            if (el) el.textContent = `+${-remaining}s`;  // non-blocking count-up
        }
    }, 1000);
}
function stopRest() {
    if (_rest) { clearInterval(_rest); _rest = null; }
}

// Leave the player but keep the session open in the DB; the banner takes over.
function exitToPlan() {
    stopHoldTimer();
    stopRest();
    _player = null;
    showPlanView();
    window.loadWorkoutPlan();
}

// Finish: end the session, clear localStorage (only after the PUT 200), go back.
async function finishWorkout() {
    stopHoldTimer();
    stopRest();
    if (!_player) { showPlanView(); window.loadWorkoutPlan(); return; }
    try {
        const res = await fetch(`/api/sessions/${_player.sessionId}/end`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ overall_rpe: null }),
        });
        if (!res.ok) throw new Error("end failed");
    } catch (e) {
        const err = document.getElementById("finish-error");
        if (err) err.classList.remove("hidden");
        return;
    }
    clearActiveStorage();
    _player = null;
    showPlanView();
    window.loadWorkoutPlan();
}

// ---- open-session resume banner
function renderResumeBanner(open, stored) {
    const canResume = stored && stored.sessionId === open.id;
    const hasSets = open.set_count > 0;
    showPlanView();
    planHost().innerHTML = `
        <div class="card resume-banner">
            <div class="plan-section-title">Workout in progress</div>
            <p class="muted">${open.set_count} set${open.set_count === 1 ? "" : "s"} logged · ${esc(open.date)}.</p>
            <div class="resume-actions">
                ${canResume ? `<button id="resume-btn" class="btn-primary">Resume</button>` : ""}
                ${hasSets ? `<button id="finish-save-btn" class="btn-secondary">Finish & save</button>` : ""}
                <button id="discard-btn" class="btn-text">Discard</button>
            </div>
        </div>`;
    if (canResume) {
        document.getElementById("resume-btn")
            .addEventListener("click", () => resumeWorkout(open, stored));
    }
    if (hasSets) {
        document.getElementById("finish-save-btn")
            .addEventListener("click", () => finishAndSave(open));
    }
    document.getElementById("discard-btn")
        .addEventListener("click", () => discardOpen(open));
}

// Resume: rebuild steps from the stored plan but derive pos from the DB
// (authoritative) — the index just after the set_count-th logged step.
function resumeWorkout(open, stored) {
    unlockAudio();
    const steps = flattenPlan(stored.plan);
    _player = {
        sessionId: open.id, plan: stored.plan, steps,
        pos: posAfterNthLoggedStep(steps, open.set_count),
        lastByExercise: stored.lastByExercise || {},
    };
    persistPlayer();
    renderActive();
}
function posAfterNthLoggedStep(steps, n) {
    if (n <= 0) return 0;
    let count = 0;
    for (let i = 0; i < steps.length; i++) {
        if (steps[i].logged && ++count === n) return i + 1;
    }
    return steps.length;  // all logged steps already saved → finish
}

async function finishAndSave(open) {
    try {
        const res = await fetch(`/api/sessions/${open.id}/end`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ overall_rpe: null }),
        });
        if (!res.ok) throw new Error("end failed");
    } catch (e) { return; }
    clearActiveStorage();
    _player = null;
    window.loadWorkoutPlan();
}

async function discardOpen(open) {
    if (open.set_count > 0 &&
        !confirm("Discard this workout and delete its logged sets? This can't be undone.")) {
        return;
    }
    try {
        const res = await fetch(`/api/sessions/${open.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
    } catch (e) { return; }
    clearActiveStorage();
    _player = null;
    window.loadWorkoutPlan();
}

// ---------------------------------------------------------------------------
// Public API (called from app.js on navigation)
// ---------------------------------------------------------------------------

// Entry point for the Workout tab. The server (GET /sessions/open) is the source
// of truth for whether a session is open; localStorage only supplies position.
window.loadWorkoutPlan = async function loadWorkoutPlan() {
    if (_player) { renderActive(); return; }   // mid-workout in this tab

    let open = null;
    try {
        const res = await fetch("/api/sessions/open");
        if (res.ok) open = await res.json();
    } catch (e) { open = null; }

    if (open) {
        renderResumeBanner(open, readActiveStorage());
        return;
    }
    // No open session: drop any stale activeWorkout, then show the plan/empty state.
    if (readActiveStorage()) clearActiveStorage();
    showPlanView();
    if (_plan) renderLoaded();
    else renderEmpty();
};

// Drop the cache and fetch a fresh plan.
window.refreshWorkoutPlan = function refreshWorkoutPlan() {
    _plan = null;
    fetchAndRenderPlan();
};
