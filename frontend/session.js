// GetFittr — manual session logging (Phase 1, Step 6).
// Lives in the History section: log past sessions, list them, view detail.
// Loaded after app.js; app.js calls loadSessions()/loadExercises() when the
// History section becomes active.

// Emoji per movement_type, used in the search dropdown and exercise blocks.
const MOVEMENT_EMOJI = {
    strength: "💪",
    skill: "⚡",
    pilates: "🧘",
    mobility: "🤸",
    cardio: "🏃",
};

// Movement types logged by time-under-tension rather than reps.
const DURATION_TYPES = new Set(["pilates", "mobility"]);

// Fetched once on first need and reused for all client-side filtering.
let exerciseCache = null;

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

// Fetch the full exercise library once and cache it. Safe to call repeatedly.
// On failure the cache is left unset (not poisoned with []) so the next call
// — e.g. when the user opens the log panel — retries instead of silently
// showing an empty search forever.
async function loadExercises() {
    if (exerciseCache) return exerciseCache;
    try {
        const res = await fetch("/api/exercises");
        if (!res.ok) throw new Error(`GET /api/exercises failed (${res.status})`);
        exerciseCache = await res.json();
    } catch (err) {
        showToast("Could not load exercises");
        return [];
    }
    return exerciseCache;
}

// Case-insensitive client-side filter over name / category / movement_type.
function filterExercises(query) {
    const list = exerciseCache || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((ex) =>
        ex.name.toLowerCase().includes(q) ||
        (ex.category || "").toLowerCase().includes(q) ||
        ex.movement_type.toLowerCase().includes(q)
    );
}

// Build the searchable picker widget injected for each new exercise slot.
function createExerciseSearchWidget() {
    const widget = document.createElement("div");
    widget.className = "exercise-search-widget";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "exercise-search-input";
    input.placeholder = "Search exercises…";

    const dropdown = document.createElement("ul");
    dropdown.className = "exercise-results-dropdown hidden";

    widget.appendChild(input);
    widget.appendChild(dropdown);

    // Render the (filtered) results into the dropdown.
    function renderResults(results) {
        dropdown.innerHTML = "";
        if (results.length === 0) {
            dropdown.classList.add("hidden");
            return;
        }
        results.slice(0, 50).forEach((ex) => {
            const li = document.createElement("li");
            li.dataset.id = ex.id;
            const emoji = MOVEMENT_EMOJI[ex.movement_type] || "•";
            const badge = ex.category
                ? ` <span class="movement-badge ${ex.movement_type}">${ex.category}</span>`
                : "";
            li.innerHTML = `${emoji} ${ex.name}${badge}`;
            li.addEventListener("click", () => {
                widget.replaceWith(buildExerciseBlock(ex));
            });
            dropdown.appendChild(li);
        });
        dropdown.classList.remove("hidden");
    }

    input.addEventListener("keyup", () => renderResults(filterExercises(input.value)));
    input.addEventListener("focus", () => renderResults(filterExercises(input.value)));

    return widget;
}

// ---------------------------------------------------------------------------
// Exercise blocks + set rows
// ---------------------------------------------------------------------------

// Build the exercise block that replaces the search widget after a pick.
function buildExerciseBlock(exercise) {
    const block = document.createElement("div");
    block.className = "exercise-block";
    block.dataset.exerciseId = exercise.id;
    block.dataset.movementType = exercise.movement_type;

    const emoji = MOVEMENT_EMOJI[exercise.movement_type] || "•";

    const header = document.createElement("div");
    header.className = "exercise-block-header";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = `${emoji} ${exercise.name}`;
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-exercise-btn btn-icon";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => block.remove());
    header.appendChild(nameSpan);
    header.appendChild(removeBtn);

    const setRows = document.createElement("div");
    setRows.className = "set-rows";

    const addSetBtn = document.createElement("button");
    addSetBtn.className = "add-set-btn btn-text";
    addSetBtn.textContent = "+ Add Set";
    addSetBtn.addEventListener("click", () => addSetRow(block, exercise));

    block.appendChild(header);
    block.appendChild(setRows);
    block.appendChild(addSetBtn);

    // The first set row is added automatically.
    addSetRow(block, exercise);
    return block;
}

// Append one set row to an exercise block.
function addSetRow(block, exercise) {
    const setRows = block.querySelector(".set-rows");
    const setNumber = setRows.children.length + 1;
    const usesDuration = DURATION_TYPES.has(exercise.movement_type);

    const row = document.createElement("div");
    row.className = "set-row";

    const label = document.createElement("span");
    label.className = "set-label";
    label.textContent = `Set ${setNumber}`;

    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.min = "1";
    if (usesDuration) {
        valueInput.className = "duration-input";
        valueInput.placeholder = "sec";
    } else {
        valueInput.className = "reps-input";
        valueInput.placeholder = "reps";
    }

    const rpeGroup = document.createElement("div");
    rpeGroup.className = "rpe-group";
    [["3", "😌"], ["6", "💪"], ["8", "😤"], ["10", "😵"]].forEach(([rpe, emoji]) => {
        const btn = document.createElement("button");
        btn.className = "rpe-btn";
        btn.dataset.rpe = rpe;
        btn.textContent = emoji;
        btn.addEventListener("click", () => {
            rpeGroup.querySelectorAll(".rpe-btn").forEach((b) =>
                b.classList.remove("selected")
            );
            btn.classList.add("selected");
        });
        rpeGroup.appendChild(btn);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "del-set-btn btn-icon";
    delBtn.innerHTML = "&times;";
    delBtn.addEventListener("click", () => {
        row.remove();
        renumberSets(block);
    });

    row.appendChild(label);
    row.appendChild(valueInput);
    row.appendChild(rpeGroup);
    row.appendChild(delBtn);
    setRows.appendChild(row);
}

// Re-label "Set N" after a row is removed so numbering stays contiguous.
function renumberSets(block) {
    block.querySelectorAll(".set-row").forEach((row, i) => {
        row.querySelector(".set-label").textContent = `Set ${i + 1}`;
    });
}

// Inject a fresh search widget into the log panel's exercises area.
function addExerciseSlot() {
    document
        .getElementById("exercises-area")
        .appendChild(createExerciseSearchWidget());
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function setLogError(message) {
    const el = document.getElementById("log-error");
    if (el) el.textContent = message || "";
}

// Read all exercise blocks into a structured payload, validating as we go.
// Returns { date, exercises:[{exercise_id, sets:[...]}] } or null on error.
function collectSessionData() {
    const blocks = document.querySelectorAll("#exercises-area .exercise-block");
    if (blocks.length === 0) {
        setLogError("Add at least one exercise before saving.");
        return null;
    }

    const date = document.getElementById("session-date").value;
    if (!date) {
        setLogError("Pick a date for this session.");
        return null;
    }

    const exercises = [];
    for (const block of blocks) {
        const rows = block.querySelectorAll(".set-row");
        if (rows.length === 0) {
            setLogError("Each exercise needs at least one set.");
            return null;
        }

        const sets = [];
        let setNumber = 1;
        for (const row of rows) {
            const selected = row.querySelector(".rpe-btn.selected");
            if (!selected) {
                setLogError("Select an RPE for every set.");
                return null;
            }
            const durationInput = row.querySelector(".duration-input");
            const repsInput = row.querySelector(".reps-input");
            const set = {
                exercise_id: Number(block.dataset.exerciseId),
                set_number: setNumber,
                rpe: Number(selected.dataset.rpe),
                reps_completed: null,
                duration_seconds: null,
            };
            if (durationInput) {
                set.duration_seconds = durationInput.value
                    ? Number(durationInput.value)
                    : null;
            } else {
                set.reps_completed = repsInput.value
                    ? Number(repsInput.value)
                    : null;
            }
            sets.push(set);
            setNumber += 1;
        }
        exercises.push({ sets });
    }

    return { date, exercises };
}

// Persist the in-progress session: create it, post each set, then end it.
async function saveSession() {
    setLogError("");
    const data = collectSessionData();
    if (!data) return;

    try {
        const createRes = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: data.date, session_type: "custom" }),
        });
        if (!createRes.ok) throw new Error(`create failed (${createRes.status})`);
        const session = await createRes.json();

        for (const exercise of data.exercises) {
            for (const set of exercise.sets) {
                const setRes = await fetch(`/api/sessions/${session.id}/sets`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(set),
                });
                if (!setRes.ok) throw new Error(`set failed (${setRes.status})`);
            }
        }

        const endRes = await fetch(`/api/sessions/${session.id}/end`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ overall_rpe: null }),
        });
        if (!endRes.ok) throw new Error(`end failed (${endRes.status})`);

        closeLogPanel();
        await loadSessions();
        showToast("Session saved ✓");
    } catch (err) {
        showToast("Save failed — try again");
    }
}

// ---------------------------------------------------------------------------
// Session list + detail
// ---------------------------------------------------------------------------

// Format an ISO date string as e.g. "Mon 8 Jun 2026".
// A bare "YYYY-MM-DD" is parsed as LOCAL time (component-wise) rather than via
// `new Date(str)`, which would treat it as UTC midnight and display the wrong
// day in timezones west of UTC.
function formatDate(isoString) {
    let d;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoString);
    if (m) {
        d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    } else {
        d = new Date(isoString);
    }
    if (isNaN(d)) return isoString;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
        "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
    return `${day} ${d.getDate()} ${month} ${d.getFullYear()}`;
}

// Fetch and render the History session list.
async function loadSessions() {
    const listEl = document.getElementById("session-list");
    if (!listEl) return;
    try {
        const res = await fetch("/api/sessions");
        if (!res.ok) throw new Error(`GET /api/sessions failed (${res.status})`);
        const sessions = await res.json();

        if (sessions.length === 0) {
            listEl.innerHTML =
                '<p class="muted">No sessions logged yet. Click "+ Log a Session" to add one.</p>';
            return;
        }

        listEl.innerHTML = "";
        sessions.forEach((s) => {
            const card = document.createElement("div");
            card.className = "session-card";
            const rpe = s.overall_rpe != null ? ` · RPE: ${s.overall_rpe}` : "";
            card.innerHTML = `
                <div class="session-card-top">
                    <span class="session-card-date">${formatDate(s.date)}</span>
                    <span class="movement-badge">${s.session_type}</span>
                </div>
                <div class="session-card-stats muted">
                    ${s.exercise_count} exercise${s.exercise_count === 1 ? "" : "s"}
                    · ${s.set_count} set${s.set_count === 1 ? "" : "s"}${rpe}
                </div>
                <button class="btn-text view-session-btn">View</button>`;
            card.querySelector(".view-session-btn").addEventListener("click", () =>
                viewSession(s.id)
            );
            listEl.appendChild(card);
        });
    } catch (err) {
        listEl.innerHTML = '<p class="form-status error">Could not load sessions.</p>';
    }
}

// Fetch one session's detail and show it in the detail panel.
async function viewSession(sessionId) {
    try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error(`GET /api/sessions/${sessionId} failed (${res.status})`);
        const session = await res.json();

        document.getElementById("detail-title").textContent = formatDate(session.date);

        // Group sets by exercise, preserving order of first appearance.
        const groups = new Map();
        session.sets.forEach((set) => {
            if (!groups.has(set.exercise_id)) {
                groups.set(set.exercise_id, { name: set.exercise_name, sets: [] });
            }
            groups.get(set.exercise_id).sets.push(set);
        });

        const body = document.getElementById("detail-body");
        if (groups.size === 0) {
            body.innerHTML = '<p class="muted">No sets recorded for this session.</p>';
        } else {
            body.innerHTML = "";
            groups.forEach((group) => {
                const wrap = document.createElement("div");
                wrap.className = "detail-exercise";
                const rows = group.sets
                    .map((set) => {
                        const effort = set.duration_seconds != null
                            ? `${set.duration_seconds}s`
                            : `${set.reps_completed ?? "–"} reps`;
                        return `<li>Set ${set.set_number}: ${effort} · RPE ${set.rpe ?? "—"}</li>`;
                    })
                    .join("");
                wrap.innerHTML =
                    `<h4>${group.name}</h4><ul class="detail-set-list">${rows}</ul>`;
                body.appendChild(wrap);
            });
        }

        document.getElementById("session-log-panel").classList.add("hidden");
        document.getElementById("session-detail-panel").classList.remove("hidden");
    } catch (err) {
        showToast("Could not load session");
    }
}

// ---------------------------------------------------------------------------
// Panel open/close + toast
// ---------------------------------------------------------------------------

async function openLogPanel() {
    setLogError("");
    document.getElementById("exercises-area").innerHTML = "";
    const dateInput = document.getElementById("session-date");
    if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
    await loadExercises(); // ensure the library is ready (retries if preload failed)
    addExerciseSlot(); // start with one search widget ready
    document.getElementById("session-detail-panel").classList.add("hidden");
    document.getElementById("session-log-panel").classList.remove("hidden");
}

function closeLogPanel() {
    document.getElementById("session-log-panel").classList.add("hidden");
    document.getElementById("exercises-area").innerHTML = "";
    setLogError("");
}

let toastTimer = null;
function showToast(message) {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2000);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("open-log-btn").addEventListener("click", openLogPanel);
    document.getElementById("close-log-btn").addEventListener("click", closeLogPanel);
    document.getElementById("add-exercise-btn").addEventListener("click", addExerciseSlot);
    document.getElementById("save-session-btn").addEventListener("click", saveSession);
    document.getElementById("close-detail-btn").addEventListener("click", () => {
        document.getElementById("session-detail-panel").classList.add("hidden");
    });

    // Preload the library so the first search is instant.
    loadExercises();
});

// Exposed for app.js to call when the History section becomes active.
window.loadSessions = loadSessions;
window.loadExercises = loadExercises;
