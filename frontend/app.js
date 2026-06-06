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
}

// Read the current hash (e.g. "#workout") and return the bare section name.
function sectionFromHash() {
    return window.location.hash.replace(/^#/, "") || DEFAULT_SECTION;
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
});
