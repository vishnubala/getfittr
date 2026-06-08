# GetFittr — Learning Log

A plain-English record of what was built at each step, why decisions were made,
and what every new term means. Updated automatically after every completed step.

---

## [Phase 1 · Step 1] — Project Scaffold
*Retroactive entry — rule not yet in place when this was built*

### What was built
The empty skeleton of the entire project: all folders and blank files, a
requirements.txt listing every Python package needed, and a .gitignore telling
Git which files to never track. Nothing runs yet — this step is purely about
establishing the structure everything else will be built inside.

### New terms introduced
- **Scaffold**: The empty folder and file structure of a project before any logic
  is written. Like the steel frame of a building before the walls go in.
- **requirements.txt**: A plain text file listing every Python package the project
  needs. Running `pip install -r requirements.txt` installs them all at once.
  Anyone cloning the repo uses this to recreate your exact environment.
- **.gitignore**: A file telling Git which files and folders to never track or
  commit. Entries like `.env` (API keys) and `*.pyc` (compiled Python cache files)
  should never be in a public repo.
- **`__pycache__/`**: A folder Python creates automatically to store compiled
  versions of your .py files. Speeds up repeated runs. Never needs to be in Git.

### Why these decisions were made
Plain HTML/CSS/JS for the frontend (no React, no build tools) keeps the project
simple and AI-codeable without needing a compilation step. FastAPI for the backend
because it's Python-native (matching the developer's background) and modern.
SQLite for storage because it's a single file — no database server to install or
manage for a personal local app.

### What this enables
Every subsequent step has a known home for its files. Claude Code can now write
real code into real files rather than deciding structure and logic at the same time.

---

## [Phase 1 · Step 2] — Database Setup and Exercise Library
*Retroactive entry — rule not yet in place when this was built*

### What was built
`backend/database.py` — the file that owns all interaction with the SQLite
database. It creates the database file on first run, defines all 6 tables, and
seeds a library of 84 exercises covering strength training, pilates, mobility,
cardio, and skill work. It also provides a connection helper that FastAPI routes
will use to read and write data.

### New terms introduced
- **SQLite**: A database that lives entirely in a single file on your computer
  (in this case `data/getfittr.db`). No separate database server needed. Perfect
  for personal or small apps.
- **Schema**: The structure of a database — what tables exist, what columns each
  table has, and what type of data each column holds.
- **`CREATE TABLE IF NOT EXISTS`**: SQL that creates a table only if it doesn't
  already exist. Safe to run multiple times without crashing.
- **Idempotent**: A function that produces the same result no matter how many
  times you run it. `seed_exercises()` checks if exercises already exist and
  skips seeding if they do — so running it twice doesn't give you 168 exercises.
- **`row_factory = sqlite3.Row`**: Makes database results behave like dictionaries
  (access columns by name: `row["name"]`) instead of plain tuples (access by
  position: `row[0]`). Much more readable code.
- **`PRAGMA foreign_keys = ON`**: SQLite has foreign key enforcement turned OFF by
  default for legacy reasons. This line turns it on so the database actually
  checks that parent/child relationships between tables are valid.
- **Foreign key**: A column in one table that references a row in another table.
  For example, `session_sets.session_id` references `sessions.id`. With foreign
  keys on, you can't create a session_set for a session that doesn't exist.
- **Parameterized query**: SQL written with `?` placeholders instead of string
  formatting. `cursor.execute("INSERT INTO t VALUES (?)", (value,))` is safe.
  `cursor.execute(f"INSERT INTO t VALUES ({value})")` is dangerous (SQL injection).
- **`get_db()`**: A function that creates a database connection, hands it to
  whoever needs it, then closes it when they're done. FastAPI calls this
  automatically for every request that needs the database.
- **`movement_type`**: A new column distinguishing HOW an exercise is tracked:
  `strength` and `skill` use rep-based progression; `pilates`, `mobility`, and
  `cardio` are tracked for consistency and quality only.
- **`equipment_needed`**: A column on each exercise recording what physical
  equipment it requires. The planner cross-references this against
  `user_profile.available_equipment` to only recommend exercises you can actually do.

### Why these decisions were made
Separating `movement_type` (how to treat it in the planner) from `category`
(what muscle/pattern it trains) gives the planning engine two independent
dimensions to reason about. An exercise can be `category=core, movement_type=pilates`
— the planner knows to include it in a core-focused session but not to push for
rep progression on it.

Progression chains are modelled as a linked list (each exercise knows its
previous and next variation) rather than a flat list with a "level" number.
This makes it easy to insert a new variation between two existing ones later
without renumbering everything.

### What this enables
The app now has a permanent, structured home for all data. Phase 1's profile page
and session log can write real records. Phase 2's AI coach can query exercise
history. Phase 3's pose analysis can look up form cues by exercise ID.

---

## [Phase 1 · Step 3] — FastAPI Skeleton and Health Endpoint
*Retroactive entry — rule not yet in place when this was built*

### What was built
`backend/main.py` — the entry point of the entire application. When you run the
server, this file is what starts. It initialises the database on startup, tells
FastAPI how to serve the frontend files, exposes a `/health` endpoint to confirm
everything is running, and sets up a router structure so future features have a
clean place to attach their routes without touching `main.py` again.

### New terms introduced
- **FastAPI**: A Python web framework. It's the layer that receives HTTP requests
  from the browser and routes them to the right Python function.
- **Uvicorn**: The web server that actually listens on port 8000 for incoming
  connections and hands them to FastAPI. `uvicorn backend.main:app` means "run
  the object named `app` from the file `backend/main.py`."
- **`--reload`**: A uvicorn flag for development. The server restarts automatically
  every time you save a .py file. Never use this in production.
- **Lifespan context manager**: A pattern for running code at server startup and
  shutdown. Everything before `yield` runs when the server starts; everything
  after runs when it stops. Used here to call `init_db()` before the first request.
- **`@asynccontextmanager`**: A decorator that turns a generator function (one
  with `yield`) into a context manager. The `async` part means it works with
  FastAPI's asynchronous request handling.
- **CORS (Cross-Origin Resource Sharing)**: A browser security rule that blocks
  requests between different origins (protocol + domain + port). The CORS
  middleware here tells the browser "this API allows requests from anywhere."
  Fine for a local personal app; would be restricted in production.
- **Middleware**: Code that runs on every request before it reaches your route
  handler, and/or on every response before it goes back to the browser. Like a
  checkpoint on the way in and out.
- **StaticFiles**: A FastAPI/Starlette feature that serves files directly from
  a folder without any Python logic. `GET /static/style.css` just sends the file.
  No route function needed.
- **`FileResponse`**: Returns a file (like an HTML page) as an HTTP response.
  Used for `GET /` to send `index.html` to the browser.
- **APIRouter**: A mini-app that groups related routes together. You define routes
  on a router, then attach the router to the main app with a URL prefix. Keeps
  code organised — each feature owns its own routes file.
- **`prefix="/api"`**: All routes registered on `api_router` automatically get
  `/api` prepended. So a route defined as `GET /profile` becomes `GET /api/profile`.
- **`backend/__init__.py`**: An empty file that tells Python "this folder is a
  package" — a collection of importable modules. Without it, `from backend.database
  import init_db` fails.
- **Port 8000**: The network port uvicorn listens on by default. In your browser,
  `http://127.0.0.1:8000` means "this machine, port 8000."

### Why these decisions were made
The static mount is registered last in `main.py`. Order matters — FastAPI matches
routes top-to-bottom. If the static mount were first, `/` might match as a static
file before the explicit `GET /` route runs. Explicit routes always beat the
catch-all static server.

The router structure (`routers/api.py` as an aggregator) means `main.py` never
needs to be edited again to add new features. Adding a profile feature = write
`routers/profile.py`, add one line to `routers/api.py`. Main stays stable.

The health endpoint actively tests the database connection (runs `SELECT 1`)
rather than just returning a hardcoded `"ok"`. If the DB file is missing or
corrupt, the health check fails honestly instead of lying.

### What this enables
The app now boots and serves pages. A browser can reach it. The router structure
is ready for Phase 1's profile and session log endpoints to be attached. The
`/health` endpoint gives a reliable way to confirm the whole stack is running
before proceeding to the next step.

---
## [Phase 1 · Tooling] — Switch to uv for environment + dependencies
*2026-06-06*

### What was built
The project's Python setup moved from the old pip + virtualenv approach to **uv**.
A `pyproject.toml` now lists every dependency, a `uv.lock` file pins their exact
versions, and uv created a `.venv/` folder holding the installed packages. The old
`requirements.txt` is kept for reference only (marked deprecated at the top). The
server now runs with `uv run python -m uvicorn backend.main:app --reload`, and
`/health` was confirmed returning `ok` under the new setup.

### New terms introduced
- **uv**: A single fast tool (written in Rust) that does everything pip, venv, and
  pip-tools used to do separately: create the virtual environment, resolve and
  install dependencies, lock exact versions, and run commands inside the
  environment. One tool instead of three or four.
- **Virtual environment (`.venv/`)**: An isolated copy of Python plus only the
  packages this project needs, kept in a folder inside the project. It stops this
  project's packages from clashing with other projects or the system Python. uv
  creates and manages it automatically — you never build it by hand.
- **`pyproject.toml`**: The modern standard config file for a Python project. It
  records the project's name, description, the Python version it needs, and its
  list of dependencies. It replaces `requirements.txt` (and several other older
  config files) as the single source of truth. uv reads and writes the
  `dependencies` list for you — you never hand-edit it.
- **`uv.lock`**: An auto-generated file recording the *exact* version of every
  package (including dependencies-of-dependencies) that got installed. Committing
  it means anyone running `uv sync` gets an identical environment, down to the
  patch number. `pyproject.toml` says "I want fastapi"; `uv.lock` says "...and it
  resolved to fastapi 0.136.3 with these exact sub-packages."
- **`uv sync`**: Reads `pyproject.toml` + `uv.lock` and makes `.venv/` match them
  exactly — installing what's missing, removing what shouldn't be there.
- **`uv add <package>`**: Adds a new dependency: updates `pyproject.toml`, updates
  `uv.lock`, and installs it — all in one command. The reason you never edit
  `pyproject.toml` dependencies by hand is that doing so would leave the lock file
  and the installed environment out of sync.
- **`uv run <command>`**: Runs a command *inside* the project's virtual environment
  without you having to "activate" anything first. `uv run python ...` uses the
  project's Python and packages automatically.

### Why these decisions were made
- **uv over pip/venv**: It's dramatically faster, and it combines four tools into
  one consistent workflow. Crucially, the lock file makes the environment
  perfectly reproducible — a recurring pain point with bare `requirements.txt`,
  which only lists top-level packages and not their exact resolved versions.
- **Why `uv run` beats manual activation**: The old way was "activate the venv"
  (a shell command that changes your terminal so `python` points at `.venv`), then
  run your command, then remember to deactivate. That state is invisible and easy
  to get wrong — you can forget to activate and accidentally use the system Python,
  or forget which project's venv is active. `uv run` carries no hidden state: it
  picks the correct environment fresh for each command, every time. Nothing to
  remember, nothing to leave in the wrong state — which also makes it reliable for
  scripts and automation.
- **Keep but deprecate `requirements.txt`**: Removing it outright could break old
  notes or muscle memory; marking it deprecated points anyone reading it to the new
  source of truth without losing the history.
- **Windows PATH note**: On this machine Claude Code's terminal doesn't inherit the
  user PATH, so bare `uv` isn't found. Commands must prefix the PATH or use the full
  `uv.exe` path — documented in CLAUDE.md so it isn't rediscovered painfully.

### What this enables
Every future "install a package" or "run the server" instruction now has one clean,
reproducible form. When Phase 2 needs the heavy AI packages, they're already
installed (`chromadb`, `sentence-transformers`, `torch`), and adding anything new is
a single `uv add`. Anyone cloning the repo gets the identical environment with one
`uv sync`.

---
## [Phase 1 · Step 4] — Frontend Shell with Navigation
*2026-06-06*

### What was built
The first thing a human actually sees: the app's visual shell. A single
`index.html` holds all four screens (Dashboard, Workout, History, Profile) at
once as four `<section>` blocks. A fixed dark-themed top navigation bar switches
between them, and `app.js` shows exactly one section at a time by toggling a CSS
class — no page reloads, no extra HTML files. Everything is still placeholder
text; no real data and no calls to the backend yet. Verified in a browser: all
four tabs switch cleanly, the active tab highlights teal, the Workout screen
shows a 16:9 camera placeholder, and nothing breaks at phone width.

### New terms introduced
- **Single-Page Application (SPA)**: A web app that loads one HTML page once, then
  swaps what's visible with JavaScript instead of fetching a new page from the
  server for every screen. Navigation feels instant because nothing reloads. Ours
  is the simplest possible version: all four screens are already in the page; we
  just show one and hide the rest.
- **`<section>`**: An HTML tag that groups a chunk of related content. We use one
  per screen and give each an `id` (e.g. `id="workout"`) so JavaScript and the
  nav buttons can target it.
- **`<nav>`**: An HTML tag for a navigation block. Semantic — it tells browsers
  and screen readers "these are the app's main links."
- **CSS class toggling**: Showing/hiding by adding or removing a class name. Our
  `.section` rule sets `display: none` (hidden); `.section.active` sets
  `display: block` (shown). JavaScript adds `active` to one section and removes it
  from the others. The browser repaints instantly.
- **`classList.toggle(name, condition)`**: A JavaScript method that adds the class
  `name` when `condition` is true and removes it when false. One line replaces an
  if/else, and we use it for both the sections and the nav highlight.
- **`data-*` attribute**: A custom HTML attribute for stashing your own data on an
  element. Our nav buttons carry `data-section="workout"`, and JavaScript reads it
  via `link.dataset.section`. It cleanly links a button to the section it opens
  without hard-coding anything.
- **Hash-based routing**: Using the part of the URL after `#` (e.g.
  `...:8000/#workout`) to remember which screen is open. The browser never sends
  the hash to the server, so it's a free, reload-safe way for a static page to
  track state. We read it on load (so a direct link to `#workout` opens that
  screen) and listen for `hashchange` (so the browser Back button works).
- **`DOMContentLoaded`**: A browser event that fires once the HTML is fully parsed
  and elements exist. We wait for it before wiring up buttons — otherwise the
  script might run before the buttons are on the page and find nothing.
- **CSS custom properties (variables)**: Reusable values declared once under
  `:root` (e.g. `--accent: #00d4aa`) and referenced everywhere with
  `var(--accent)`. Change the colour in one place and the whole app updates.
- **`aspect-ratio: 16 / 9`**: A CSS rule that forces a box to keep a 16-by-9 width
  to height ratio at any screen size. It keeps the camera placeholder shaped like
  a video frame whether the window is wide or narrow.
- **System font stack**: The `font-family` list starting with `-apple-system`. It
  tells the browser to use whatever clean default font the operating system
  already ships (San Francisco on Mac, Segoe UI on Windows). No download, no
  Google Fonts — instant and offline-friendly.
- **Media query (`@media`)**: A CSS block that applies rules only when a condition
  is met, here `max-width: 480px` (phone-sized screens). We use it to tighten
  spacing so the nav and content stay usable on a narrow phone.

### Why these decisions were made
- **One HTML file, not four**: The spec calls for a single-page app with no build
  tools. Keeping all sections in one file and toggling visibility means there's no
  router library, no server round-trip per screen, and the whole app loads once.
  For a four-screen personal app this is far simpler than separate pages.
- **CSS class toggle over inline `style.display`**: CLAUDE.md bans inline styles.
  Toggling a class keeps every visual decision in `style.css` — JavaScript only
  ever changes *which* class is present, never the styling itself.
- **Hash routing over a JS-only variable**: Storing the current screen in the URL
  hash means reloading the page keeps you on the same screen, a direct link to
  `#workout` works, and the browser's Back/Forward buttons navigate between
  screens for free. A plain variable would reset on every reload.
- **CSS variables for the theme**: The dark palette (`#0f0f0f` / `#1a1a1a` /
  `#00d4aa`) appears in many rules. Defining each once under `:root` means future
  theme tweaks happen in one place instead of hunting through the stylesheet.
- **Verified in a real browser, not just by eye**: Loaded the running server in the
  preview, clicked through all four tabs, and resized to a 375px phone viewport to
  confirm the layout holds. This matches the build rule of fully testing each step
  before moving on.

### What this enables
There is now a real, navigable app surface to hang features on. Step 5 (the
profile form) and Step 6 (manual session logging) each get a section already
built and routable — they only need to fill in the placeholder content and wire
it to the backend. The Workout section's camera box, rep counter, and RPE buttons
are visible stand-ins that Phases 2 and 3 will make live.

---
## [Phase 1 · Step 5] — Profile Page (backend route + frontend form)
*2026-06-06*

### What was built
The first end-to-end feature: a real form that reads from and writes to the
database. The Profile screen now has a four-group form (About You, Your Goals,
Your Equipment, Schedule & Diet). A new backend file, `backend/routers/profile.py`,
exposes `GET /api/profile` (returns the saved profile, or 404 before first setup)
and `POST /api/profile` (saves it). On page load the form fetches the existing
profile and pre-fills itself; on save it posts the form and shows a success
message without reloading. Verified live: saved a test profile, reloaded, and
confirmed every field pre-filled correctly.

### New terms introduced
- **API endpoint / route**: A specific URL the backend answers, paired with an HTTP
  method. `GET /api/profile` (read) and `POST /api/profile` (write) are two
  endpoints sharing one URL but doing different things based on the method.
- **HTTP method (GET vs POST)**: GET asks the server for data and changes nothing;
  POST sends data to the server to create or update something. The browser's
  `fetch()` defaults to GET; we pass `method: "POST"` to write.
- **Upsert**: "Update or insert" in one operation. If the profile row already
  exists we overwrite it; if not, we create it. SQLite does this with
  `INSERT ... ON CONFLICT(id) DO UPDATE`, which tries to insert and, if a row with
  that primary key already exists, updates it instead. We always use `id = 1`
  because there is only ever one user.
- **HTTP status code**: A number the server returns describing the outcome. `200`
  = success, `404` = not found (we return this when no profile exists yet),
  `422` = the data sent failed validation. The frontend branches on these.
- **Pydantic model**: A Python class (in `backend/models.py`) describing the exact
  shape of the JSON a request must contain or a response will return. FastAPI uses
  it to automatically validate incoming data (rejecting bad input with a 422) and
  to document the API. `ProfileIn` is what the client sends; `ProfileOut` is what
  we send back (it adds server-managed fields like `id` and timestamps).
- **`response_model`**: A FastAPI setting that filters and validates what a route
  returns against a Pydantic model, so the JSON shape is guaranteed and consistent.
- **`Depends(get_db)`**: FastAPI's dependency injection. Declaring `db=Depends(get_db)`
  as a parameter tells FastAPI to call `get_db()` for you, hand the database
  connection to the function, and close it afterwards — no manual open/close in
  every route.
- **JSON-encoded column**: SQLite has no "list" column type, so list fields (goals,
  injuries, rest_days, equipment) are stored as a JSON string with `json.dumps()`
  on the way in and turned back into a Python list with `json.loads()` on the way
  out. The router does this translation so the rest of the app sees real lists.
- **`fetch()`**: The browser's built-in function for making HTTP requests from
  JavaScript. Returns a Promise (an eventual result), so we `await` it. This is how
  the frontend talks to the backend without reloading the page.
- **`async` / `await`**: JavaScript keywords for handling operations that take time
  (like a network request). `await fetch(...)` pauses the function until the
  response arrives, then continues — letting us write asynchronous code that reads
  top-to-bottom like normal code.
- **`event.preventDefault()`**: By default, submitting an HTML form reloads the page
  by sending it to the server the old-fashioned way. Calling this on the submit
  event cancels that, so our JavaScript can handle the save with `fetch()` and the
  page stays put.
- **Radio button vs checkbox**: Radios in the same group are mutually exclusive
  (pick one fitness level); checkboxes allow many (pick several goals or pieces of
  equipment). We read radios with `:checked` (one value) and checkboxes by
  collecting all `:checked` boxes into an array.
- **`:has()` CSS selector**: A newer CSS feature that styles an element based on
  what's inside it. `.pill:has(input:checked)` highlights a whole pill when its
  hidden radio/checkbox is checked — no JavaScript needed for the visual state.
- **Toggle switch (CSS)**: The on/off slider for diet tracking is just a styled
  checkbox: the real `<input>` is hidden and a `<span class="slider">` is animated
  with CSS based on the checkbox's `:checked` state.

### Why these decisions were made
- **404 instead of an empty object for a missing profile**: A 404 lets the frontend
  cleanly tell "first-time setup, leave the form blank" apart from "a saved profile
  exists, pre-fill it." An empty `{}` would be ambiguous and force guessing.
- **Single row at `id = 1` with upsert**: This is a one-user app, so the profile is
  a singleton. Pinning it to `id = 1` and upserting means there's never a question
  of "which profile" or accidental duplicates — saving always targets the same row.
- **Separate `ProfileIn` and `ProfileOut` models**: The client shouldn't send
  server-managed fields (`id`, `created_at`, `updated_at`), and `name`/`fitness_level`
  are required on input but always present on output. Two models express those
  different contracts cleanly instead of one loose model with everything optional.
- **`created_at` preserved across updates**: On every save we read the existing
  `created_at` and keep it, only bumping `updated_at`. This keeps an honest record
  of when the profile was first created versus last changed.
- **Equipment exclusivity handled in JavaScript**: "No equipment" contradicts every
  other option, so selecting it clears the others and vice versa. Doing this on the
  `change` event gives immediate, obvious feedback rather than rejecting a
  contradictory combination only after submit.
- **Validation on both ends**: The frontend blocks submit if name or fitness level
  is missing (instant feedback, no wasted request); Pydantic also requires them on
  the backend (the database is never the weak link even if the frontend is bypassed).
- **`launch.json` gained `--reload`**: The dev server was running without
  auto-reload, so backend edits weren't taking effect until a manual restart (this
  caused the new route to 404 during testing). Adding `--reload` brings it in line
  with the documented run command so future `.py` edits apply immediately.

### What this enables
The app now has a complete read/write loop between browser, backend, and database —
the pattern every remaining feature reuses. The saved profile (goals, injuries,
equipment, rest days, fitness level) is exactly the input Phase 2's AI coach needs
to generate a personalised, equipment-aware, injury-safe workout plan. Step 6
(manual session logging) follows the same `fetch` + router + upsert shape proven
here.
---
## [Phase 1 · Step 6] — Manual session log
*2026-06-08*

### What was built
The History screen is now a working feature instead of a placeholder. You can
click "+ Log a Session", search the 84-exercise library through a custom
type-to-filter picker (no dropdown), add exercises with sets, reps (or hold
seconds), and an RPE per set, then save the whole session to the database. Saved
sessions appear as cards in a list (newest first) with exercise and set counts,
and each can be expanded into a detail panel showing every set grouped by
exercise. A new backend file, `backend/routers/sessions.py`, exposes the
exercise library and full session/set lifecycle; a new frontend file,
`frontend/session.js`, holds all the logging UI logic. Verified live end-to-end:
logged multi-exercise sessions, viewed them, confirmed date sorting, reload
persistence, and that saving with a missing RPE is blocked before any API call.

### New terms introduced
- **Database migration**: A controlled change to an existing database's structure
  after it already holds data. We needed to add an `image_url` column to the
  `exercises` table without dropping and re-seeding it. SQLite has no
  "ADD COLUMN IF NOT EXISTS", so we run `ALTER TABLE ... ADD COLUMN` inside a
  `try/except` that silently skips if the column is already there — safe to run on
  every startup.
- **Path parameter**: A value baked into the URL itself, like the `42` in
  `/api/sessions/42/sets`. FastAPI captures it by declaring `session_id: int` in
  the function signature and matching the `{session_id}` placeholder in the route.
  Used to say "add a set to *this specific* session."
- **SQL JOIN**: A query that stitches two tables together on a shared key. A logged
  set only stores an `exercise_id` (a number); to show the exercise's *name* we
  JOIN `session_sets` to `exercises` on that id, so one query returns the set data
  plus the human-readable name.
- **Aggregate function (COUNT / COUNT DISTINCT)**: SQL maths over many rows.
  `COUNT(*)` counts all a session's sets; `COUNT(DISTINCT exercise_id)` counts how
  many *different* exercises were used. Combined with `GROUP BY s.id`, this gives
  each session its "2 exercises · 4 sets" summary in a single query.
- **LEFT JOIN**: Like a JOIN but keeps rows from the left table even when the right
  side has no match. We LEFT JOIN sessions to their sets so a brand-new session
  with zero sets still appears in the list (with counts of 0) instead of vanishing.
- **Module-level cache**: A variable (`exerciseCache`) that lives for the whole page
  session and holds the exercise library after one fetch. Searching then filters
  this in-memory list on every keystroke — instant, with no network call per key.
- **Client-side filtering**: Doing the search in the browser against cached data
  rather than asking the server each time. Fast and offline-friendly for a fixed
  84-item list; the server-side `?q=` search still exists for completeness.
- **DOM element creation in JS**: Building interface pieces from JavaScript with
  `document.createElement(...)` and `.appendChild(...)` instead of writing them in
  HTML. The search widget, exercise blocks, and set rows are all created on the fly
  as the user adds them, because their number isn't known ahead of time.
- **`.replaceWith()`**: A DOM method that swaps one element for another in place.
  When you pick an exercise from the search dropdown, the search widget calls
  `.replaceWith(exerciseBlock)` to turn itself into the selected exercise's block.
- **Cache-Control HTTP header**: A header telling the browser how long it may reuse a
  downloaded file. FastAPI's static file server sends none, so browsers fall back to
  *heuristic caching* and keep serving an old `style.css`/`app.js` after you edit it.
  We added `Cache-Control: no-cache, no-store, must-revalidate` so the latest file
  is always fetched — important for a local dev app you edit constantly.
- **Subclassing to override behaviour**: `NoCacheStaticFiles` extends Starlette's
  `StaticFiles` and overrides one method (`file_response`) to stamp the no-cache
  header on every static response, reusing all the parent's logic otherwise.
- **Toast notification**: A small message that slides in, lingers ~2s, then fades —
  used for "Session saved ✓". Created once and reused, it confirms an action
  without a blocking pop-up the user must dismiss.

### Why these decisions were made
- **Custom search widget instead of a `<select>` dropdown**: An 84-item native
  dropdown is painful to scan and can't show emoji icons or category badges. A
  text input that filters as you type, with iconned results, scales better and is
  the groundwork for the richer picker planned in Phase 4.
- **Session built incrementally over several requests (create → add sets → end)**
  rather than one big payload: It mirrors how a live workout actually unfolds (you
  start a session, log sets as you go, finish it) and reuses the exact same backend
  endpoints Phase 2/3 will call during a real coached session — manual logging is
  just the same flow driven by hand. `manually_entered = 1` marks these as
  backfilled so later analytics can tell typed-in history from camera sessions.
- **`duration_seconds` vs `reps_completed` chosen by movement type**: Holds (planks,
  mobility) are measured in seconds, strength work in reps. The set row shows the
  right field automatically (pilates/mobility → seconds, everything else → reps) so
  the data matches how each exercise is actually performed.
- **Validate before any network call**: `collectSessionData()` checks there's an
  exercise, a set, and an RPE on every set *before* creating anything. This avoids
  leaving a half-saved empty session in the database when the form is incomplete,
  and gives the user an instant inline error.
- **Don't cache an empty result on fetch failure**: The first attempt to load the
  library can fail if it fires while the dev server is mid-restart. Caching `[]`
  then would break search silently until a reload. Leaving the cache unset on error
  means the next action (opening the log panel) simply retries — a small change that
  removes a confusing failure mode found during live testing.
- **No-cache static files**: Discovered during verification that the browser kept
  running an old `app.js`/`style.css` after edits, making fixes appear not to work.
  Rather than fight the cache per-test, fixing it at the source makes every future
  edit reliably show up on reload — the right call for a local single-user app.
- **`formatDate` parses `YYYY-MM-DD` as local time**: `new Date("2026-06-08")` is
  interpreted as UTC midnight and displays as the *previous* day in timezones west
  of UTC. Caught this live (a Monday showing as Sunday). Parsing the date parts by
  hand into a local `Date` fixes the off-by-one.

### What this enables
Phase 1 is now functionally complete: profile in, sessions logged and viewable
back — the full "fill profile → log a workout → see it listed" loop the phase set
out to deliver. The session/set tables now hold real training data, which is the
raw material Phase 2's AI coach reads to spot progression readiness and plan the
next workout, and the same create/add-sets/end endpoints will be driven live (not
by hand) once camera-based logging arrives in Phase 3.

---
## [Phase 1 · Step 7] — Close Phase 1 + architecture decisions
*2026-06-08*

### 🏁 Phase 1 complete
This is the Phase 1 close-out. No new features were built — it locks in the
decisions that shape Phase 2 and confirms the foundation is solid. With profile
setup, the full exercise library, and manual session logging all working and
verified, Phase 1 ("fill profile → log a workout → see it listed back") is done.

### What was built
Documentation and verification only. CLAUDE.md gained a new "Key Decisions Locked
In" section (Phase 2 architecture, build order, deferred reactive coaching, the
weight_kg clarification, and the HuggingFace model/deployment choices), a detailed
"## Phase 2 — AI Coach" plan split into 2a (coaching, no RAG) and 2b (add Chroma
RAG), and Change Log entries marking the milestone and the embedding-model update.
The Phase 1 checklist is ticked complete and the Phase 2 stub now points at the
detailed plan. A full smoke test confirmed /health, all four nav sections, profile
save+reload persistence, and session log → list → detail all work with a clean
console.

### New terms introduced
- **Upfront (one-shot) planning vs reactive coaching**: Two ways an AI coach can
  drive a workout. *Upfront* makes a single API call at the start that returns the
  whole session plan (which exercises, how many sets, target reps); the app then
  runs that plan and only asks the AI to react to your RPE after each set.
  *Reactive* would ask the AI what to do next after every single set — far more API
  calls, more latency, and more cost. We chose upfront for Phase 2 and deferred
  reactive to a future release.
- **Works offline after the plan is received**: Because the plan is fetched once at
  session start, the rest of the workout doesn't depend on the network — if the
  connection drops mid-session you can still finish the logged plan.
- **Build order 2a → 2b**: Deliberately building the AI coaching loop *without* RAG
  first (2a) so the core "plan + feedback" mechanic is proven and debuggable on its
  own, then layering retrieval-augmented knowledge (2b) once that's stable. Adding
  both at once would make it hard to tell which piece caused a problem.
- **RAG (Retrieval-Augmented Generation)** — recap: instead of trusting the model's
  memory, you store reference documents as numeric vectors, fetch the few most
  relevant chunks for the current question, and paste them into the prompt so the
  model answers from real source material. Phase 2b adds this for fitness knowledge.
- **Embedding model (all-MiniLM-L6-v2)**: The specific HuggingFace sentence-
  transformers model that turns a chunk of text into a vector of numbers capturing
  its meaning, so similar text sits close together and can be retrieved by
  similarity. This supersedes the earlier BAAI/bge-small note in the spec.
- **Gradio / HuggingFace Spaces**: Gradio is a Python library that wraps a function
  in a simple web UI with almost no front-end code; HuggingFace Spaces is free
  hosting that runs such an app from a git repo. Together they're the planned Phase 4
  portfolio demo (AI planning + coaching only, no camera).
- **Singleton row**: A table that, by design, only ever holds one row — here
  user_profile at id=1. The smoke-test profile save overwrites that single row
  rather than creating new ones.

### Why these decisions were made
- **Upfront planning over reactive**: One API call per session is cheap, fast, and
  resilient to a dropped connection, and it's enough for a structured bodyweight
  routine where the plan is known in advance. Reactive per-set decisions add cost
  and complexity that aren't justified yet, so they're explicitly deferred rather
  than left as an open question.
- **2a before 2b**: Isolating the coaching loop from RAG means each layer is
  verified independently — if coaching misbehaves we know it isn't the retrieval
  step, and vice versa. It also gives a working, demonstrable AI coach sooner.
- **weight_kg correction**: An earlier draft of this step claimed session_sets had a
  weight_kg column sitting NULL for future use. Checking the actual schema showed no
  such column exists in CLAUDE.md, database.py, or the live DB — and none is needed,
  since all 84 exercises are bodyweight. The docs were corrected to say plainly that
  the column doesn't exist and would be added via ALTER TABLE only if weighted
  (gym-mode) exercises are introduced. Recording the *accurate* state matters more
  than matching a mistaken assumption — the spec must not assert something false.
- **Decisions locked in CLAUDE.md, not just SESSION_STARTER**: CLAUDE.md is the
  durable source of truth; settled architecture belongs there so it survives across
  sessions, with SESSION_STARTER holding only a one-line summary.

### What this enables
Phase 2 can start with an unambiguous plan: build coach.py and the /api/coach/plan
endpoint first (2a), prove the plan-and-feedback loop against the real profile and
session data now sitting in SQLite, then add the Chroma knowledge layer (2b). The
foundation — profile, library, logging, a clean request/response/DB loop — is the
exact input the AI coach consumes, so the next phase is purely additive.
