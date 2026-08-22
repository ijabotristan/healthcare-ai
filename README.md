# Patient Health Assistant — Learning Project (Phase 1)

A conversational health-information assistant for patients. This is the
foundation: a safe, well-guarded chatbot. Appointment booking, medication
reminders, and structured triage come in later phases.

## What this does (and doesn't do)

- ✅ Answers general health questions in plain language
- ✅ Points people toward the right level of care (self-care / doctor visit / ER)
- ✅ Flags emergencies and crisis situations with clear guidance
- ❌ Does NOT diagnose
- ❌ Does NOT recommend drug dosages or medication changes
- ❌ Is NOT HIPAA-compliant yet (don't put real patient data into this version)

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # on Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and paste in your Anthropic API key (get one at
https://console.anthropic.com — Settings → API Keys):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Run the server:

```bash
uvicorn main:app --reload --port 8000
```

You should see it running at `http://localhost:8000`. Check
`http://localhost:8000/health` — it should return `{"status": "ok"}`.

### 2. Frontend

No build step needed. Just open `frontend/index.html` directly in your
browser (double-click it, or use the "Live Server" extension in VS Code
for auto-reload).

Make sure the backend is running first — the frontend talks to
`http://localhost:8000/chat`.

## How it works

- `backend/main.py` — FastAPI app with one main endpoint: `POST /chat`.
  It keeps a simple in-memory conversation history per session and sends
  it to Claude along with a safety-focused system prompt.
- The **system prompt** is the core of the safety design — it tells the
  model to never diagnose, to escalate emergencies immediately, and to
  handle crisis situations with care. Read through it in `main.py` and
  tweak it as you learn.
- `frontend/index.html` — a minimal chat UI, no framework, so you can see
  exactly what's happening: it POSTs your message, gets a reply, renders it.

## Suggested next steps (in order)

1. **Test the guardrails.** Try messages like "I have chest pain and can't
   breathe" or "what dose of ibuprofen should I take" and confirm the
   assistant responds safely. This is the most important testing you'll do.
2. **Persist conversations** — swap the in-memory dict for SQLite, so
   history survives a server restart.
3. **Add user accounts** — even simple email/password auth, so each patient
   has their own history.
4. **Add structured symptom intake** — a form (not just free text) that
   organizes what the patient reports into a summary a doctor could
   quickly scan.
5. **Add appointment booking** — start with a simple calendar model before
   integrating a real scheduling system.
6. **Add medication reminders** — CRUD for meds + times, with browser or
   push notifications.
7. **Before any real deployment:** get a clinician to review your prompts
   and flows, add proper HIPAA-compliant infrastructure (encrypted DB,
   signed BAAs with any vendors, audit logging), and add real auth/session
   security.

## A note on scope

Each phase above is its own small project. Don't feel like you need to
build it all at once — get Phase 1 solid and genuinely tested first. A
health assistant with a great chat experience but weak safety guardrails
is worse than a simple one that's careful.
