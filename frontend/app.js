// GetFittr — frontend shell navigation.
// Pure client-side section switching. No API calls yet (Phase 1, Step 4).

// The four sections the nav can switch between. Order is irrelevant here;
// it just bounds what showSection() will accept as a valid target.
const SECTIONS = ["dashboard", "workout", "history", "profile"];
const DEFAULT_SECTION = "dashboard";

/**
 * Show one section and hide the rest, and highlight the matching nav link.
 * Falls back to the default section if given an unknown name.
 * @param {string} name - section id to reveal
 */
function showSection(name) {
    if (!SECTIONS.includes(name)) {
        name = DEFAULT_SECTION;
    }

    // Toggle the .active class on each section so only `name` is visible.
    SECTIONS.forEach((id) => {
        const section = document.getElementById(id);
        if (section) {
            section.classList.toggle("active", id === name);
        }
    });

    // Mirror the same active state on the nav buttons for the highlight.
    document.querySelectorAll(".nav-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.section === name);
    });

    // Keep the URL hash in sync so the view is shareable / reloadable.
    if (window.location.hash !== "#" + name) {
        window.location.hash = name;
    }

    // History is data-driven: (re)load the session list when it's revealed.
    // session.js exposes these on window and may not have loaded yet on the
    // very first call, hence the typeof guard.
    if (name === "history" && typeof window.loadSessions === "function") {
        window.loadExercises();
        window.loadSessions();
    }
}

// Read the current hash (e.g. "#workout") and return the bare section name.
function sectionFromHash() {
    return window.location.hash.replace(/^#/, "") || DEFAULT_SECTION;
}

// ---------------------------------------------------------------------------
// Profile page — load existing profile, equipment exclusivity, save.
// ---------------------------------------------------------------------------

// Read the value of the checked radio in a named group, or "" if none.
function checkedRadio(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
}

// Collect the values of all checked checkboxes in a named group as an array.
function checkedValues(name) {
    return Array.from(
        document.querySelectorAll(`input[name="${name}"]:checked`)
    ).map((el) => el.value);
}

// Tick the checkboxes in a named group whose value is in `values`.
function setChecks(name, values) {
    const wanted = new Set(values || []);
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
        el.checked = wanted.has(el.value);
    });
}

// Parse a number input: empty string becomes null, otherwise a Number.
function numOrNull(value) {
    return value === "" || value == null ? null : Number(value);
}

// Show a status message under the form (kind: "success" | "error").
function setProfileStatus(message, kind) {
    const status = document.getElementById("profile-status");
    if (!status) return;
    status.textContent = message;
    status.className = "form-status" + (kind ? " " + kind : "");
}

// Equipment rule: "No equipment" is mutually exclusive with everything else.
// Selecting "none" clears the others; selecting any other clears "none".
function wireEquipmentExclusivity() {
    const boxes = document.querySelectorAll("#pf-equipment input[name='equipment']");
    boxes.forEach((box) => {
        box.addEventListener("change", () => {
            if (!box.checked) return;
            if (box.value === "none") {
                boxes.forEach((other) => {
                    if (other.value !== "none") other.checked = false;
                });
            } else {
                boxes.forEach((other) => {
                    if (other.value === "none") other.checked = false;
                });
            }
        });
    });
}

// Fill the form fields from a profile object returned by the API.
function fillProfileForm(p) {
    document.getElementById("pf-name").value = p.name || "";
    document.getElementById("pf-age").value = p.age ?? "";
    document.getElementById("pf-height").value = p.height_cm ?? "";
    document.getElementById("pf-weight").value = p.weight_kg ?? "";
    document.getElementById("pf-injuries").value = (p.injuries || []).join("\n");
    document.getElementById("pf-diet").checked = !!p.diet_module_enabled;

    const level = document.querySelector(
        `input[name="fitness_level"][value="${p.fitness_level}"]`
    );
    if (level) level.checked = true;

    setChecks("goals", p.goals);
    setChecks("equipment", p.available_equipment);
    setChecks("rest_days", p.rest_days);
}

// On load: GET the profile and pre-fill. A 404 means first-time setup (no-op).
async function loadProfile() {
    try {
        const res = await fetch("/api/profile");
        if (res.status === 404) return; // first run — leave the form empty
        if (!res.ok) throw new Error(`GET /api/profile failed (${res.status})`);
        fillProfileForm(await res.json());
    } catch (err) {
        setProfileStatus("Could not load profile: " + err.message, "error");
    }
}

// On submit: validate, POST the profile, show a success/error message.
async function saveProfile(event) {
    event.preventDefault();
    setProfileStatus("", null);

    const name = document.getElementById("pf-name").value.trim();
    const fitnessLevel = checkedRadio("fitness_level");
    if (!name) {
        setProfileStatus("Name is required.", "error");
        return;
    }
    if (!fitnessLevel) {
        setProfileStatus("Please choose a fitness level.", "error");
        return;
    }

    const injuries = document.getElementById("pf-injuries").value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    let equipment = checkedValues("equipment");
    if (equipment.length === 0) equipment = ["none"]; // default to bodyweight

    const payload = {
        name,
        age: numOrNull(document.getElementById("pf-age").value),
        height_cm: numOrNull(document.getElementById("pf-height").value),
        weight_kg: numOrNull(document.getElementById("pf-weight").value),
        fitness_level: fitnessLevel,
        goals: checkedValues("goals"),
        injuries,
        rest_days: checkedValues("rest_days"),
        available_equipment: equipment,
        diet_module_enabled: document.getElementById("pf-diet").checked,
    };

    try {
        const res = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`POST /api/profile failed (${res.status})`);
        fillProfileForm(await res.json());
        setProfileStatus("Profile saved.", "success");
    } catch (err) {
        setProfileStatus("Could not save profile: " + err.message, "error");
    }
}

// Wire up nav clicks and hash-based routing once the DOM is ready.
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-link").forEach((link) => {
        link.addEventListener("click", () => showSection(link.dataset.section));
    });

    // Support back/forward navigation and manual hash edits.
    window.addEventListener("hashchange", () => showSection(sectionFromHash()));

    // Honour a direct link like ...#workout on first load.
    showSection(sectionFromHash());

    // Profile page: exclusivity rules, initial load, and save handler.
    wireEquipmentExclusivity();
    loadProfile();
    document.getElementById("profile-form").addEventListener("submit", saveProfile);
});
