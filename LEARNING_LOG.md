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

---
## [Phase 2a · Step 1] — Configuration setup
*2026-06-10*

### What was built
No application code yet — this step sets up the configuration the AI coach will
read in Step 2. Two new files now exist in the project root: `.env` (holds the real
secrets and switches, never committed) and `.env.example` (a safe, committable
template showing which variables are needed). CLAUDE.md was corrected to name the
real embedding model and to make the Claude model configurable, and two new
architecture decisions (mock mode, configurable model) were locked in.

### New terms introduced
- **Environment variable (env var)**: A named value that lives outside your source
  code, in the runtime environment. Code reads it at startup instead of having the
  value written directly in a `.py` file. We use them for the API key, the model
  name, and the mock-mode switch — so none of those are hardcoded.
- **`.env` file**: A plain text file of `KEY=value` lines that holds env vars for
  local development. The `python-dotenv` package loads it into the program at
  startup. It is gitignored because it contains the real API key.
- **`.env.example`**: A committed copy of `.env` with the same keys but no real
  secret values. It documents, for anyone setting up the project, exactly which env
  vars they must provide. Copy it to `.env` and fill in the real key.
- **`python-dotenv`**: The Python library that reads a `.env` file and makes its
  values available via `os.getenv("NAME")`. Without it, env vars would have to be
  set manually in the shell every session.
- **`anthropic`**: The official Python SDK (software development kit) for calling the
  Claude API. coach.py will use it in Step 2 to send prompts and receive plans.
- **Mock mode (`USE_MOCK_AI`)**: A boolean switch. When `true`, the coach returns a
  fixed, canned workout plan and makes **no** network/API call — so the whole UI can
  be built and tested for free, offline, and deterministically. Set to `false` only
  when deliberately testing real Claude output. The terminal must print a visible
  `[MOCK MODE]` warning so it's never ambiguous which mode is active.
- **`uv add`**: The uv command that adds a dependency to `pyproject.toml` and the
  lockfile. Running it for packages already declared is a harmless no-op
  confirmation (here, `anthropic` and `python-dotenv` were already present from the
  Phase 1 scaffold).

### Why these decisions were made
- **Mock mode by default for dev**: Building and testing the workout UI shouldn't
  cost API tokens, require a live key, or give different output each run. A canned
  plan makes development fast, free, and repeatable; real calls are opt-in. The
  loud `[MOCK MODE]` log prevents the classic trap of thinking you're testing real
  AI when you're not (and vice versa).
- **Model name in an env var, never in source**: The dev default
  (`claude-haiku-4-5-20251001`) is cheap and fast for iterating; swapping to a
  higher-quality model for a quality pass should be a one-line `.env` edit, not a
  code change. Keeping the string out of Python also means no accidental commit of a
  model choice and one single place to change it.
- **`.env` gitignored, `.env.example` committed**: The real key must never reach the
  repo, but new setups still need to know which variables exist. The example file
  solves both: documentation without exposure. Verified `.env` is in `.gitignore`
  before creating it.
- **Corrected stale CLAUDE.md references**: The spec still named `BAAI/bge-small` and
  a pinned sonnet model from before the architecture was finalised. Fixing them now
  (to `all-MiniLM-L6-v2` and the configurable model) keeps the source of truth
  accurate before any code depends on it.

### What this enables
Step 2 (coach.py) can now load configuration cleanly: read the key, model, and
mock flag from the environment via `python-dotenv`, branch on `USE_MOCK_AI` to
either return the canned plan or call Claude through the `anthropic` SDK — with no
secrets or model strings hardcoded anywhere in the Python.

---
## [Phase 2a · Step 2] — coach.py: Claude API wrapper with mock mode
*2026-06-11*

### What was built
The backend now has `backend/coach.py`, the single module that talks to the
Anthropic Claude API. It exposes one function, `get_workout_plan(profile,
recent_sessions)`, which returns a structured workout plan as a Python dict. A
`USE_MOCK_AI` switch means it returns a hand-written canned plan (no network, no
key, no cost) during development and only calls the real API when explicitly
turned on. A one-line thread-safety fix was also made to the database layer.

### New terms introduced
- **API wrapper module**: A single file that hides all the messy details of
  talking to an external service (here, Claude) behind one simple function. The
  rest of the app calls `get_workout_plan(...)` and never sees prompts, model
  names, or the SDK — so if any of that changes, only this one file changes.
- **Mock mode**: A development switch that returns fake-but-realistic data
  instead of calling the real paid API. `USE_MOCK_AI=true` makes the coach return
  a fixed plan, so the UI and the rest of the system can be built and tested for
  free and offline. It prints a loud `[MOCK MODE]` line so you never mistake mock
  output for real AI output.
- **Lazy initialisation**: Creating an expensive or key-requiring object only at
  the moment it's first actually needed, not when the module loads. The Anthropic
  client is built inside `_get_client()` on the first real call — so importing
  coach.py (or running in mock mode) never needs a valid API key.
- **Module-level vs function-level**: Code at the top of a file (module level)
  runs once, the moment the file is imported. Code inside a function runs only
  when that function is called. We load the `.env` vars at module level (cheap,
  always needed) but build the API client at function level (only sometimes
  needed, and requires a key).
- **Environment variable (env var)**: A named setting read from the runtime
  environment rather than hardcoded in source. `os.getenv("USE_MOCK_AI", "true")`
  reads it, falling back to `"true"` if unset. `python-dotenv`'s `load_dotenv()`
  loads them from the `.env` file into that environment first.
- **System prompt**: The instruction block that tells the model who it is and how
  to behave, sent separately from the user's message. Ours embeds the coach's
  role, the hard training rules, the user's context, and the exact JSON shape the
  answer must take.
- **Structured (JSON) output**: Asking the model to reply as a strict JSON object
  rather than prose, so the program can parse it directly into data. The prompt
  forbids any preamble or markdown fences to keep the reply machine-readable.
- **Markdown code fences**: The ```` ``` ```` lines models sometimes wrap code/JSON
  in. `_strip_code_fences()` removes them defensively before `json.loads()` so an
  over-helpful reply doesn't break parsing.
- **`check_same_thread=False`**: A SQLite connection option. By default a Python
  SQLite connection may only be used by the thread that created it; FastAPI can
  serve requests on different worker threads, which intermittently raised a
  `ProgrammingError`. Setting this to `False` allows the connection to be used
  across threads, fixing the crash. (Safe here because each request opens and
  closes its own short-lived connection via `get_db`.)
- **Graceful degradation**: When the real API call fails, instead of crashing we
  catch the error and return `{"error": True, "message": ...}` so the caller (the
  route, next step) can show a friendly message rather than a 500.

### Why these decisions were made
- **One module owns all Claude calls**: Centralising API interaction means the
  routes stay simple and ignorant of AI details, and any change to model, prompt,
  or SDK touches exactly one file. It also keeps the expensive/credential-bound
  code in a single, easy-to-audit place.
- **Mock mode as the default**: Building and testing the planning UI shouldn't
  cost money or require a live key, and shouldn't depend on network reliability.
  Defaulting `USE_MOCK_AI` to `"true"` makes the safe, free path the one you get
  unless you deliberately opt into real calls — and the printed warning prevents
  silent confusion between mock and real output.
- **Real exercise IDs baked into the mock**: The mock plan uses the actual seeded
  database IDs (Plank=45, Full Pull-up=20, etc.), so the frontend can resolve and
  render the mock exactly as it will a live plan — the UI can't tell the
  difference, which makes mock-mode testing genuinely representative.
- **Lazy client + key validation**: Instantiating the client at import would make
  every import (and mock run) need a key and the `anthropic` package importable.
  Deferring it, and rejecting the `replace_with_your_key` placeholder with a clear
  `ValueError`, fails loudly only when a real call is actually attempted without a
  real key.
- **Never hardcode the model**: The model name comes from `CLAUDE_MODEL` in `.env`
  so we can swap the cheap dev model for a stronger one for quality testing
  without editing Python — matching the decision locked in Step 1.
- **Catch-all on the real path**: Network calls, JSON parsing, and model output
  are all fallible. Returning a structured error keeps a bad call from taking down
  the request, and gives the next step a clean shape to handle.

### What this enables
Step 3 can now add a `GET /api/coach/plan` route that simply reads the profile and
recent sessions from the database, passes them to `get_workout_plan(...)`, and
returns the result — no AI logic in the route at all. Because mock mode produces a
schema-accurate plan with real exercise IDs, the entire "Get Today's Plan" UI can
be built and verified before a single real API token is spent.

---
## [Phase 2a · Step 3] — GET /api/coach/plan endpoint
*2026-06-11*

### What was built
The AI coach is now reachable over HTTP. A new endpoint, `GET /api/coach/plan`,
reads the user's profile and last three sessions from the database, hands them to
`get_workout_plan()` (Step 2), and returns the resulting plan as JSON. A new
database helper, `get_recent_sessions_for_coach()`, produces the session history
in exactly the shape the coach expects. Two small fixes also landed: a hardcoded
fallback for the `CLAUDE_MODEL` env var, and replacing an em-dash in the mock-mode
log line with a plain hyphen so the Windows console renders it cleanly.

### New terms introduced
- **HTTP endpoint vs the function behind it**: The endpoint is the URL
  (`/api/coach/plan`) the browser hits; the function (`coach_plan`) is the Python
  that runs when it's hit. The endpoint is deliberately thin — it gathers inputs
  from the DB and delegates all the real work to `get_workout_plan()`, so the web
  layer stays free of AI logic.
- **SQL JOIN (recap, used here)**: `session_sets` stores only an `exercise_id`
  number; the coach needs exercise *names*. The query joins `session_sets` to
  `exercises` on that id so each set comes back already carrying its name.
- **Two-query vs one-query fetch**: `get_recent_sessions_for_coach()` first gets
  the recent sessions, then runs one set-fetching query per session (a small,
  bounded number — at most 3). This keeps each query simple and the grouping
  obvious, at the cost of a few extra queries. Fine at this scale.
- **Generator function**: `get_db()` is a *generator* — a function with `yield`.
  Calling it doesn't run the body; it returns a generator object. `next(...)` runs
  it up to the `yield` (handing back the connection) and pauses it there. The code
  after `yield` (in a `finally:`, the `conn.close()`) only runs when the generator
  is resumed, closed, or garbage-collected.
- **Garbage collection (GC) and `finally`**: Python frees objects nothing
  references anymore. When a *paused* generator is freed, Python runs its `finally`
  block on the way out. That detail caused the bug below.
- **`run_in_threadpool`**: FastAPI runs a plain `def` (non-`async`) route in a
  background thread so a slow call (like the real Claude API) doesn't block the
  whole server. This is why the DB connection is opened with
  `check_same_thread=False` (Step 2) — it gets used from a worker thread.
- **`HTTPException`**: FastAPI's way to return an error status from a route.
  `raise HTTPException(500, detail=...)` produces an HTTP 500 with a message. We
  also *catch* the 404 that `get_profile` raises and turn it into an empty profile.

### Why these decisions were made
- **Thin route, logic in dedicated modules**: The route only orchestrates — read
  profile, read history, call coach, return. The DB query lives in `database.py`
  and the AI logic in `coach.py`. Each file has one job, so the route stays a few
  readable lines and the pieces are testable on their own.
- **A new DB function shaped for the coach**: `get_recent_sessions_for_coach()`
  returns exactly the `{date, sets:[{exercise_name, reps_completed,
  duration_seconds, rpe}]}` structure `_format_sessions()` consumes. Matching the
  consumer's shape at the source means no reshaping glue in the route.
- **Empty profile instead of an error**: `get_profile` raises a 404 when no
  profile exists yet. For planning we'd rather degrade gracefully, so the route
  catches that and passes `{}` — in mock mode the profile is ignored anyway, and
  in real mode the coach can still produce a sensible default.
- **Default for `CLAUDE_MODEL`**: If `.env` is missing the variable, the model was
  `None`, which would break a real call. A hardcoded fallback to the dev model
  keeps the app working out-of-the-box while still letting `.env` override it.

### The bug I hit (and the fix) — `next(get_db())`
My first version wrote `conn = next(get_db())`. It failed immediately with
`sqlite3.ProgrammingError: Cannot operate on a closed database`. Reason: `get_db()`
returns a generator whose `finally:` closes the connection. Because nothing kept a
reference to the *generator* (only to `conn`), Python garbage-collected the
generator the instant `next()` returned — running its `finally` and closing the
connection before the very next line could use it. The fix is to hold the
generator in a variable and close it explicitly at the end:
`db_gen = get_db(); conn = next(db_gen); try: ...; finally: db_gen.close()`. Now
the generator stays alive for the whole request and the connection closes cleanly
only when we're done. (Lesson: when driving a dependency generator by hand, keep
the generator alive, not just its yielded value.)

### What this enables
Step 4 can now add a "Get Today's Plan" button to the Workout screen that simply
`fetch()`es `/api/coach/plan` and renders the JSON — the whole planning UI can be
built against mock mode, free and offline, with a response shaped identically to
what real Claude output will produce.

---
## [Phase 2a · Step 4] — Workout section UI: plan display
*2026-06-11*

### What was built
The Workout tab now shows the AI plan. On first visit it presents a single "Get
Today's Plan" button; clicking it fetches `GET /api/coach/plan` and renders the
full session — coach message, warm-up, optional skill work, three supersets, and a
cool-down. A new file, `frontend/workout.js`, owns this and manages four on-screen
states (empty, loading, loaded, error). The plan is cached in memory so leaving and
returning to the tab re-shows it instantly without another request; a "Refresh
Plan" button forces a fresh fetch. No backend changes.

### New terms introduced
- **Client-side state machine**: The plan area is always in exactly one of four
  states — empty, loading, loaded, error — and the JS swaps the area's HTML to move
  between them. Thinking in named states (rather than ad-hoc show/hide) keeps the UI
  predictable: every path ends in one known, fully-rendered state.
- **`innerHTML` rendering**: Each state builds an HTML string and assigns it to the
  container's `innerHTML`, replacing whatever was there. Simple and fast for
  read-only views like this; the trade-off is that any old event listeners are
  discarded, so buttons are re-bound after every render.
- **Re-binding event listeners**: Because `innerHTML` throws away the old DOM (and
  its listeners), each render function re-attaches the click handler to the button
  it just created. Miss this and the button silently does nothing.
- **HTML escaping**: `esc()` converts `&`, `<`, `>` to safe entities before text is
  put into `innerHTML`. The mock text is safe, but real Claude output isn't
  guaranteed to be, and unescaped `<` could break the layout or inject markup.
- **In-memory cache (`_plan`)**: A module-level variable holds the last fetched
  plan. `loadWorkoutPlan()` renders from it without a network call; only the
  button / Refresh actually fetch. This avoids a redundant API hit (and, later, a
  redundant paid call) every time you glance at the tab.
- **Nullish handling in template strings**: `workDetail(item)` branches on which
  fields are present (`sets`, `reps`, `seconds`, `exercise_id`) to format one
  correct string for very different row types — a bodyline hold ("⏱ 30s"), a
  dynamic stretch ("10 reps"), or a strength set ("3 × 5-8 reps").
- **CSS composition (multiple classes)**: Rather than redefine card styling, the
  coach-message and superset boxes use `class="card plan-coach-msg"` etc. — they
  inherit `.card` and add only their one extra rule (an accent border, a margin).
  Less duplicated CSS, consistent look.
- **Design tokens / CSS variables**: All new styles reference existing variables
  (`--accent`, `--muted`, `--border`) instead of hard-coded colours, so the whole
  app stays themeable from one place and this step introduces no new colour values.

### Why these decisions were made
- **Button-triggered fetch, never automatic**: Generating a plan is a deliberate
  action (and in real mode, a paid API call). `loadWorkoutPlan()` only ever renders
  what's cached or the empty button — it never fetches on its own — so merely
  opening the tab can't rack up calls.
- **Cache the plan in JS**: Without caching, every tab switch would re-fetch. Since
  the plan doesn't change until you ask for a new one, holding it in `_plan` and
  re-rendering is both faster and (in real mode) cheaper. "Refresh Plan" is the
  explicit escape hatch when you do want a new one.
- **One `workDetail()` helper for all row types**: Warm-up, skill work, and superset
  rows display differently but are conceptually "name + how much work". Centralising
  the formatting in one function avoids three near-identical branches scattered
  through the render code and keeps the rules in one place.
- **Four explicit states**: Showing a clear loading line and a real error card (with
  a Try Again button) — instead of a blank screen on a slow or failed request — is
  the difference between the app feeling broken and feeling responsive. The error
  state was verified by simulating a failed fetch; Try Again recovers cleanly.
- **Stayed surgical and frontend-only**: The camera box was left untouched, the
  Step 5 `#workout-active` stub was added (hidden) but not built, and `app.js` got a
  single navigation hook — keeping the diff small and the step's scope honest.

### Note on voice
`voice.js` is still an empty stub — there is no `speak()` function yet. Voice
output (reading the coach message aloud) is deliberately deferred. A `TODO` comment
at the top of `workout.js` marks where it will hook in, planned for Phase 2a Step 5
or later when `voice.js` is actually implemented.

### What this enables
The plan is now visible and interactive in the browser, entirely against mock mode
(free, offline, and shaped identically to real output). Step 5 can build the live
session on top of this: turning the displayed plan into an active workout in
`#workout-active` — Start Set / End Set, RPE capture per set, and the first real
use of `voice.js` for spoken cues.

---
## [Phase 2a · Step 5a] — Workout player state machine
*2026-06-14*

### What was built
The Workout tab is now a player, not just a plan viewer. "Start Workout" creates a
real session row, then the app walks the plan step by step — warm-up, skill,
supersets (the two exercises alternated set by set), cool-down — with Start Set /
End Set capturing reps or hold-seconds via a +/− stepper. Each logged set is saved
to the database with **rpe = NULL** (RPE comes in 5b). The workout survives a page
refresh (state in localStorage), and on returning the app offers Resume / Finish &
save / Discard for an in-progress session. Three new backend routes support it:
GET /api/sessions/open, DELETE /api/sessions/{id}, and
GET /api/exercises/{id}/last-set.

### New terms introduced
- **State machine (the player)**: The workout is modelled as a list of ordered
  "steps" plus a single integer **position** (`pos`) pointing at the current one.
  Every action (End Set, Next, Skip) advances `pos`; the UI is always a pure
  function of "which step are we on and in what sub-state". Thinking this way keeps a
  multi-screen flow predictable instead of a tangle of show/hide flags.
- **Flattening a nested plan**: The plan JSON is nested (supersets contain
  exercises, each with several sets). The player "flattens" it once into a single
  ordered array of atomic steps — e.g. a 3-set superset of two exercises becomes 6
  steps (X1, Y1, X2, Y2, X3, Y3). Walking a flat list is far simpler than recursing
  through the nested shape at every tap.
- **localStorage**: A small key-value store the browser persists across reloads (and
  tab closes), unlike normal JS variables which vanish on refresh. We keep the active
  workout (`getfittr.activeWorkout`) and the user's custom rest length
  (`getfittr.restSeconds`) there so a refresh mid-workout doesn't lose your place.
- **Source of truth / reconciliation**: Two stores could disagree after a crash — the
  DB (saved sets) and localStorage (position). We treat the **server as
  authoritative**: on Resume, position is recomputed as "the step just after the
  Nth logged set", where N comes from the DB, and the stored position is ignored for
  that. This is what stops a set being saved twice if the app dies between the save
  and the position write.
- **Idempotency / duplicate-avoidance ordering**: We advance and persist `pos`
  **only after** the set's POST returns 200 — never before. Combined with the
  DB-derived resume above, a half-finished save can't replay the set.
- **Route ordering (FastAPI)**: Routes match in declaration order. `/sessions/open`
  had to be declared **before** `/sessions/{session_id}`; otherwise "open" gets
  captured by the typed `{session_id}` route and fails int validation (422) instead
  of reaching the open-session handler.
- **Hard delete + foreign keys**: Discard removes the session for real. Because
  `session_sets` references `sessions`, we delete the child rows first (FK-safe) then
  the parent — otherwise the foreign-key constraint would block the delete.
- **AudioContext unlocking**: Browsers start an `AudioContext` "suspended" until a
  user gesture, to stop pages auto-playing sound. We create/resume it inside the
  Start Workout click so the rest-timer expiry beep actually plays later.
- **Optional chaining / nullish (`?.`, `??`)**: `set.rpe ?? "—"` shows a dash when
  rpe is null; `el?.textContent` safely reads a node that might not exist. Small
  guards that keep null values from rendering as the literal text "null" or throwing.

### Why these decisions were made
- **Session created on Start, not on plan fetch**: Fetching a plan is browsing;
  starting is committing. Creating the session row only on "Start Workout" (with
  `manually_entered = 0`) avoids littering the database with empty sessions from
  plans the user looked at but never did.
- **rpe saved as NULL now**: 5a deliberately omits RPE (that's 5b). Making the
  `rpe` column optional end to end (request and response models) lets the player save
  real sets immediately, and the History view renders the gap as "RPE —". The manual
  log still sends an rpe, so nothing there breaks.
- **Server is the source of truth for "open"**: A single GET tells us authoritatively
  whether a workout is unfinished; localStorage only fills in the position. If
  localStorage is stale (no open session) we clear it; if it points at a different
  session we don't resume into the wrong one. This avoids the classic
  "two sources of truth quietly diverge" bug.
- **Rest only between training sets**: Bodyline warm-up holds are movement prep, not
  training, so the 90s rest timer is suppressed for them and shown only for skill and
  superset sets — matching how the routine is actually performed.
- **Stepper seeded from history, never the top of the range**: Pre-filling the
  upper bound of "5-8" would let an un-edited value falsely read as a 3×8 set (the
  progression trigger). So Set 1 seeds from your last actual effort on that exercise
  (or the range's lower bound if there's no history), and later sets seed from the
  previous set — honest defaults the user nudges with +/−.

### Known issue logged (for 5b)
`skill_work` is logged as holds (`duration_seconds`), yet the progression rules
group "strength/skill" under the rep-based 3×8 trigger. A caveat now sits beside that
rule in CLAUDE.md and a Pending Idea (Phase 2b) tracks defining skill's real
advancement signal (the hold rule, item 4). Voice cues remain a stub — the expiry
cue is a plain WebAudio beep; spoken coaching is Step 5c.

### What this enables
There is now real, structured session data flowing in from actually *doing* a
workout (not just backfilling history). Step 5b can layer RPE capture and local
per-set feedback on top of the End Set flow, and Step 6's post-session summary has
genuine per-set reps/holds to summarise.

---
## [Phase 2a · Step 5a.1] — 5a hardening + RPE-scale reconciliation
*2026-06-17*

### What was built
Four small, independent fixes that close loose ends from Step 5a — no schema
changes, no RPE *capture* yet (that's 5b). The resume banner now ignores manual
backfills, a failed manual save no longer leaves an orphan session in History, the
superset flattener resolves a malformed "both fields" plan deterministically, and
the manual-log RPE buttons now write the same numbers (5/7/9/10) as the player will.

### New terms introduced
- **Reps-wins precedence**: when a single exercise carries BOTH a `reps` and a
  `seconds` value (which the plan schema says should never happen — it's reps XOR
  seconds), the flattener now treats it as a reps exercise rather than guessing. A
  defined tie-break beats silent misclassification.
- **All-or-nothing save (rollback)**: a multi-step write (create session → post each
  set → end session) that, on any failure partway, undoes the parts that did
  succeed — here by deleting the just-created session — so the user never sees a
  half-saved record. The classic database word for this is a *transaction*; we do it
  manually in the browser because each step is a separate HTTP call.
- **Best-effort cleanup**: the rollback DELETE is wrapped in its own try/catch that
  swallows errors. If the cleanup itself fails, we don't want it to mask or replace
  the original "Save failed" message the user actually needs to see.
- **Canonical mapping**: one agreed source of truth for a value used in more than one
  place. Here, the RPE-button → stored-number mapping (😌5 / 💪7 / 😤9 / 😵10) lives
  in CLAUDE.md and both entry paths (manual log + player) now match it.

### Why these decisions were made
- **(a) Open-session query filters `manually_entered = 0`.** "Resume an open
  workout" is a live-player concept. A manual backfill row also has a start_time, so
  without this filter a manually-logged session that somehow lacked an end_time could
  pop up as a resumable workout — meaningless for a backfill. Filtering at the query
  is the narrowest fix: the banner is player-only by construction, not by hoping the
  data is clean.
- **(b) Manual save rolls back on failure.** Before this, a network blip after the
  session row was created (but before its sets posted) left a real session in History
  with zero or partial sets — confusing and hard to clean up by hand. Tracking the
  created id in a `let` visible to the catch lets us delete it. We chose rollback over
  "leave it and let the user retry" because a single-user local app should never
  accumulate junk rows the user didn't intend.
- **(c) Reps-wins over the old `seconds != null && reps == null` test.** The old test
  classified "both present" as *not* a hold → it happened to fall through to reps, but
  only by accident of the boolean. Making reps-wins explicit (and commenting why)
  means the behaviour is intentional and documented against the CLAUDE.md schema rule,
  not an emergent side effect someone could "fix" into a bug later.
- **(d) RPE 5/7/9/10 everywhere.** The manual log shipped earlier with 3/6/8/10. The
  player (5b) and the progression trigger both assume 5/7/9/10. Two scales writing to
  one `rpe` column would make "RPE ≤ 7 counts toward progression" mean different
  things depending on which screen logged the set. Reconciling now, before any real
  data exists, avoids a migration later (old test rows are discarded, not migrated).

### What this enables
Step 5b can add RPE capture to the player knowing the manual log already writes the
identical 5/7/9/10 values, so the progression logic reads one consistent scale. The
resume banner and History are now robust to the edge cases (manual rows, failed
saves) that would otherwise surface as confusing UI during 5b/6 testing.

---
## [Phase 2a · Step 5b] — RPE capture + local per-set feedback + measured hold value
*2026-06-18*

### What was built
The workout player now captures how hard each working set felt and shows a short
coaching line in response — without any AI call. For skill and superset sets, "End
Set" no longer writes the set; it opens a four-button RPE prompt, and *tapping a
button* is what writes the set (now with a real rpe) and then shows a one-line
feedback message on the rest screen. Separately, every hold (warm-up bodyline holds
included) now saves the time the count-up timer actually measured, instead of the
pre-filled target. Frontend only — no backend, model, or schema change.

### New terms introduced
- **Sub-state**: a screen the player shows *within* a single step. The step itself
  (e.g. "Tuck L-sit, set 1") doesn't change; we just swap the card's contents from
  the capture view (stepper) to the RPE view (four buttons) and back. It's a smaller
  version of the same state-machine idea the whole player already uses.
- **Write trigger**: the single user action that commits data. Before 5b the trigger
  was "End Set"; now, for RPE-eligible sets, it's "tap a rating." Naming the one
  action that POSTs keeps the before/after-POST safety reasoning crisp.
- **Rating identity vs. raw number**: the feedback text is chosen by *which button*
  was pressed (its `rating`: easy/good/hard/failed), not by inspecting the stored
  integer (5/7/9/10). The two happen to correspond, but keying on the button means
  the wording can never drift if the numbers are ever remapped.
- **Take-over flag**: a boolean (`_holdUserTookOver`) that flips the first time the
  user nudges a hold's +/− stepper. Until then the running timer auto-fills the
  stepper live; after, the timer stops writing so the user's manual correction sticks
  (the timer keeps counting invisibly, but the stepper is now theirs).
- **Measured value (Option B)**: the saved hold duration is the elapsed time the timer
  measured, not the plan's target. The stepper *is* the live readout — there's no
  longer a separate timer display.

### Why these decisions were made
- **RPE is captured before the POST, not after.** A set is only written once the user
  taps a rating, so the row never exists with a placeholder rpe that has to be patched
  later. This preserves the 5a "advance + persist only after a 200" invariant: a crash
  while the RPE buttons are showing leaves nothing in the DB, and on resume the player
  lands back on that step to redo it (verified). The alternative — write at End Set,
  then UPDATE with the rpe — would reintroduce a half-written row, exactly what 5a.1
  worked to eliminate.
- **Feedback is local, keyed on (rating, kind).** The decision log already fixed that
  per-set feedback is template-based, not an API call (cost + offline). Keying on the
  button's rating and the step kind (reps vs hold) gives four short, correct lines per
  kind with zero interpolation of the raw number — so "Hard" on a hold says "hold this
  duration," while "Hard" on reps says "hold these reps."
- **Warm-up holds stay rpe = null but still measure.** RPE-eligibility reuses the exact
  predicate the rest timer already uses (`phase` is skill_work or superset). Bodyline
  warm-up holds are movement prep, not training, so prompting for effort there would be
  noise — but there's no reason to keep saving a fake target when we have the real
  elapsed time, so the measured-value change applies to *all* holds.
- **The stepper became the single hold readout.** 5a had two numbers on screen (a
  timer display and a target-seeded stepper) that disagreed. Making the timer drive the
  stepper directly means one number that is both the live count and the value that
  saves — simpler, and it removes a class of "which number is right?" confusion. The
  old `#hold-timer` element and its `.hold-timer` CSS are gone.

### What this enables
Sets now carry the two signals the Phase 2b progression engine needs: a real rpe
(the 3×8 @ RPE≤7 trigger can finally be evaluated) and an honest hold duration (the
3×10s→3×30s hold-progression rule has real numbers to read). Step 5c (voice) can
speak the same feedback line this step renders, and Step 6's post-session summary now
has rated, measured sets to summarise.
