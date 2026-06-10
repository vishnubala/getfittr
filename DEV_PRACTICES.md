# DEV_PRACTICES.md
# Personal reference — building GetFittr (and beyond)
# Written for a data scientist learning web app development with AI coding tools

---

## Part 1: Working with AI Coding Tools (Claude Code)

### The golden rule: you are the architect, the AI is the contractor
Claude Code writes fast but does not understand intent. It understands instructions.
Your job is to give it tight, unambiguous instructions. If the output is bad,
the prompt was probably bad — not the model.

### One task per prompt, always
Never say "do steps 1, 2, and 3." Give Claude Code one well-defined task.
Multi-step prompts produce multi-step errors that are hard to untangle.
When in doubt, break it in half.

### Plan Mode before every new feature
Use Shift+Tab (Plan Mode) before any non-trivial task. Read the plan carefully.
If the plan is wrong, correct it — do not let Claude Code build from a wrong plan.
A 2-minute plan review saves a 20-minute debugging session.

### Define "done" in the prompt
Tell Claude Code what a passing result looks like.
Bad:  "Add an endpoint to fetch workout history."
Good: "Add GET /api/history. Returns a JSON list of sessions for user 1. Each item
       includes id, date, exercise_name, set count. Test it: hit the endpoint and
       confirm you see at least one session if one has been logged. Stop there."

### Always verify against source files, not summaries
Claude Code summarises what it did. Summaries can be wrong.
Read the actual file. If Claude Code says "I added weight_kg to session_sets",
run `PRAGMA table_info(session_sets)` yourself. Trust, but verify.
This caught a real error in Phase 1 of this project.

### Surgical edits only
If you ask Claude Code to change one thing, it may refactor adjacent code
it wasn't asked to touch. This breaks things you didn't intend to change.
If you notice unrequested changes in the diff, reject them and re-prompt
with an explicit "only change X, leave everything else exactly as-is."

### Stop on broken code — never build on top of it
If step 3 produces a broken result, do not proceed to step 4.
Instruct Claude Code: "Stop. Describe what is broken before writing any more code."
Compounding errors exponentially increase debugging time.

### The two-Claude split
- Claude.ai = thinking, planning, reviewing, decisions. All conversations happen here.
- Claude Code = executing. Only the final prompt goes in.
This split saves tokens (Claude Code context is expensive) and keeps decisions auditable.

### Source of truth files
CLAUDE.md = full specification. Claude Code reads this at session start.
SESSION_STARTER.md = current build state. Keep it under 80 lines.
LEARNING_LOG.md = your personal learning record. Claude Code writes to it but never reads it.
If these three files conflict, CLAUDE.md wins. Fix the conflict before building.

---

## Part 2: Web App Development (for data scientists)

### Mental model: the request-response cycle
Every user action triggers a request from the browser (frontend) to the server (backend),
the server processes it and queries the database, then sends a response back.
The browser renders the response.
  Browser → HTTP Request → FastAPI → SQLite → FastAPI → HTTP Response → Browser

Your data science analogy: the frontend is the notebook, the backend is the pipeline,
the database is the data store. They are never the same process.

### HTTP status codes you will hit constantly
- 200: OK (success)
- 201: Created (new record added)
- 400: Bad request (your frontend sent malformed data)
- 404: Not found (endpoint doesn't exist, or record with that ID doesn't exist)
- 422: Unprocessable entity (FastAPI couldn't parse the request body — usually a Pydantic mismatch)
- 500: Internal server error (the backend crashed — check the terminal, not the browser)

When something breaks: open the browser devtools (F12), go to the Network tab,
click the failed request, and read the response body. The actual error is there.

### The browser has two places to look at
- Console tab: JavaScript errors and your console.log() output
- Network tab: every HTTP request the browser made, including its status code and response body
Most debugging starts in one of these two tabs.

### FastAPI's built-in docs
Run the server, then go to http://localhost:8000/docs
This gives you a live, interactive API explorer. You can test every endpoint without
writing any frontend code. Use this heavily during backend development.

### What a 422 error actually means
FastAPI uses Pydantic to validate incoming request bodies.
If the frontend sends { "rpe": "easy" } but the Pydantic model expects { "rpe": 7 },
FastAPI returns a 422 with a detailed error message showing exactly which field failed
and why. Read it — it tells you the fix.

### Static files and caching
Browsers aggressively cache CSS and JS files. If you change style.css and reload,
you may see the old version. This project uses NoCacheStaticFiles to prevent this.
If you ever see styles that don't match what you wrote, hard-reload (Ctrl+Shift+R)
or check that NoCacheStaticFiles is still in place.

### Never inline styles
All CSS goes in style.css. Inline styles (style="...") are impossible to maintain
and impossible to override consistently. If you feel tempted to inline a style,
add a class and define it in style.css instead.

---

## Part 3: Python Backend Patterns

### Pydantic models are your contracts
Define a Pydantic model for every request body and every response.
This gives you automatic validation, automatic docs, and catches mismatches early.
Think of them like pandas dtypes but for HTTP requests.

### Parameterised SQL always — no exceptions
Never format SQL strings with f-strings or .format():
  BAD:  cursor.execute(f"SELECT * FROM sessions WHERE id = {session_id}")
  GOOD: cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
The bad version is a SQL injection vulnerability. Even in a local personal app,
it's a habit that will hurt you if you ever build anything public-facing.

### Database connection pattern
Open a connection, do the work, close it. Do not hold connections open.
SQLite is not designed for long-held concurrent connections.
In FastAPI, use dependency injection (Depends) or a context manager.

### Environment variables and secrets
Never hardcode API keys, passwords, or any secret.
Never commit .env. Always check .gitignore before the first commit of a new file.
Use python-dotenv to load .env. Load it once at startup (load_dotenv() in main.py).

### Try/except every external call
Every call to the Anthropic API (or any external service) must be wrapped in try/except.
Networks fail. APIs return unexpected responses. Rate limits happen.
Without error handling, one bad API response crashes the whole app.

---

## Part 4: SQLite Specifics

### PRAGMA table_info — your schema inspector
When in doubt about what columns actually exist in a table:
  PRAGMA table_info(table_name);
Returns: column id, name, type, not-null constraint, default value, primary key flag.
Use this to verify, not to assume.

### JSON stored as TEXT
SQLite has no native JSON type. JSON arrays and objects are stored as TEXT.
In Python: json.dumps() before writing, json.loads() after reading.
This is the pattern for columns like goals, injuries, available_equipment.

### Migrations via ALTER TABLE
When you need to add a column to an existing table with data:
  ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT default_value;
You cannot remove columns in SQLite without recreating the table.
Plan your schema carefully. Add new columns; never remove them unless you recreate.

### The init_db() pattern
Running CREATE TABLE IF NOT EXISTS on startup is safe — it only creates if missing.
Running ALTER TABLE on startup needs an IF NOT EXISTS guard or a try/except,
or it will crash on subsequent startups when the column already exists.

---

## Part 5: API and AI Integration

### Mock mode first, always
Before writing a single line of real API integration:
  1. Define the exact JSON shape the API will return
  2. Write a mock function that returns a hardcoded example of that shape
  3. Build and test the entire downstream flow (backend route, frontend rendering) against the mock
  4. Only then replace the mock with the real API call
  This catches schema mismatches and UI bugs at zero API cost.

### The model string matters
In the Anthropic SDK, the model is specified as a string in the API call.
A wrong or outdated model string gives a cryptic error.
Store the model in .env as CLAUDE_MODEL so you can switch without touching code.
  Dev/testing: claude-haiku-4-5-20251001 (cheap, fast, good enough for coaching)
  Quality testing: claude-sonnet-4-6 (noticeably better reasoning)

### Prompt structure for structured outputs
When you need the API to return JSON (like a workout plan), be explicit:
  - Tell the model the exact JSON schema you expect
  - Tell it to return ONLY JSON, no preamble, no markdown code fences
  - Parse defensively: strip backticks, handle parse failures with a fallback
A model that ignores formatting instructions is a sign your prompt is ambiguous.

### API cost awareness
- Cost = (input tokens + output tokens) × rate per token
- Input tokens = system prompt + user message + conversation history
- Longer system prompts cost more on every call — keep them focused
- For a local personal app making ~50 calls during dev, the cost is likely under $1 with Haiku
- Set a spend alert in console.anthropic.com before your first real API call
- USE_MOCK_AI=true in .env prevents all API calls during functional testing

---

## Part 6: Git and Version Control

### Commit after every working feature
Not after every file change — after every feature that works end-to-end.
A commit is a savepoint. If the next step breaks everything, you can return here.
Never commit broken code.

### Commit messages
Format: [Phase X · Step Y] — short description of what was built
Bad:    "update"  /  "fix"  /  "changes"
Good:   "[Phase 2a · Step 2] coach.py: Claude API wrapper with mock mode"

### What goes in .gitignore
- .env (API keys and secrets — never commit)
- *.db (database files — local state, not source code)
- __pycache__/ and *.pyc (Python bytecode — regenerated automatically)
- .venv/ (virtual environment — regenerated with uv sync)
- chroma/ (vector store — regenerated by running ingest.py)

### Never commit, then revert
Committing a secret and then deleting it does not remove it from git history.
If a secret is committed, rotate the key immediately, then clean the history.
Prevention: check git diff before every commit.

---

## Part 7: Debugging Mindset

### Read the error before Googling it
Most error messages tell you exactly what went wrong and where.
The habit of skimming past the error and immediately Googling is slower
than reading the full traceback.
In Python: the actual error is the last line of the traceback.
Everything above it is the call stack showing how you got there.

### Change one thing at a time
If something is broken, change one variable and test.
Changing three things at once means you don't know which one fixed it (or broke it further).

### The server log is your friend
FastAPI prints every request to the terminal as it comes in.
It also prints Python exceptions with full tracebacks.
Keep the terminal visible while testing. The browser devtools + terminal = 90% of debugging.

### Reproduce before fixing
Before writing a fix, confirm you can reproduce the bug consistently.
A bug you can't reproduce reliably is a bug you don't understand.

### When Claude Code output seems wrong
1. Read the actual files — don't trust Claude Code's summary
2. Run the app and test the specific feature
3. If broken: tell Claude Code what you expected vs what actually happened
4. Include the exact error message, not a paraphrase of it

---

## Part 8: Mental Models Worth Internalising

### Make it work, then make it right
Get the feature working end-to-end first (even if the code is ugly).
Then refactor for clarity. Never try to make it perfect while it's still broken.

### Mock → real, simple → complex
Always build the mock version first, then replace with the real implementation.
Always build the simple version first, then add complexity.
This is how you avoid debugging two things at once.

### Fail loudly, not silently
An app that crashes with a clear error is easier to debug than one that silently
returns wrong data. Use assertions and explicit error handling.
In the Anthropic API integration: log exactly what was sent and what was received
during development. You'll need it when the response shape is unexpected.

### Your data science instincts transfer
- Always inspect the data (use /docs and PRAGMA table_info)
- Schema first, then code (same as defining your DataFrame structure before analysis)
- Parameterised queries = type safety in pandas (no string formatting your column access)
- Mock data = synthetic test data in ML workflows
- The progression logic is just a decision tree — you already know how to reason about those

---
*Last updated: Phase 2a planning — June 2026*
