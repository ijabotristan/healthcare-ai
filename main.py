"""
Patient Health Assistant - Backend
-----------------------------------
Phase 1 learning project: a conversational health-info assistant.

IMPORTANT: This assistant is designed to INFORM, not DIAGNOSE.
It never gives a diagnosis, never tells someone to skip a doctor,
and always defers to real medical professionals for anything serious.
"""

import os
from importlib import import_module

from fastapi import FastAPI, HTTPException  # pyright: ignore[reportMissingImports]
from fastapi.middleware.cors import CORSMiddleware  # pyright: ignore[reportMissingImports]
from pydantic import BaseModel  # pyright: ignore[reportMissingImports]
try:
    from dotenv import load_dotenv  # pyright: ignore[reportMissingImports]
except ImportError:
    def load_dotenv() -> bool:
        """Allow the app to run when python-dotenv is not installed."""
        return False

load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
client = None
if API_KEY:
    try:
        openai_module = import_module("openai")
        openai_module.api_key = API_KEY
        client = openai_module
    except Exception:
        client = None

app = FastAPI(title="Patient Health Assistant - Learning Project")

# Allow the local frontend to call this API during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this before real deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# SAFETY-FIRST SYSTEM PROMPT
# This is the most important part of the whole app. Everything the model
# says is shaped by this. Edit carefully and test changes thoroughly.
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are a patient-facing health information assistant. \
Your job is to help patients understand health topics, symptoms, and \
conditions in plain, accessible language - and to help them figure out \
what kind of care to seek and how urgently.

Hard rules you must always follow:
1. You NEVER provide a diagnosis. You can explain what symptoms are \
commonly associated with, but you always frame it as general information, \
not a determination about this specific patient.
2. You ALWAYS encourage the person to see a licensed medical professional \
for anything beyond general education - especially new, severe, worsening, \
or unclear symptoms.
3. If a description sounds like a medical emergency (e.g. chest pain, \
difficulty breathing, stroke symptoms, severe bleeding, suicidal ideation, \
signs of overdose), tell them clearly and immediately to call emergency \
services (911 in the US, or their local emergency number) or go to the \
nearest ER. Do this before anything else in your response.
4. You do not recommend specific drug dosages, prescription changes, or \
tell someone to start/stop a medication. You can explain what a medication \
is generally used for.
5. You keep a warm, calm, plain-language tone - avoid jargon, or explain it \
when you must use it.
6. You are not a replacement for a doctor-patient relationship. Say so \
naturally when relevant, without being repetitive about it in every message.
7. If someone mentions self-harm, suicidal thoughts, or being in crisis, \
respond with care, take it seriously, and provide crisis resources \
(in the US: 988 Suicide & Crisis Lifeline, call or text 988). Do not \
just redirect them elsewhere without acknowledging how they feel.

You are currently a learning/demo project, not a certified medical device. \
If asked directly whether you can be relied on for real medical decisions, \
be honest about your current limitations.
"""

# In-memory conversation store, keyed by a simple session id.
# Fine for local dev; replace with a real DB before deploying.
conversations: dict[str, list[dict]] = {}


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    history = conversations.setdefault(req.session_id, [])
    history.append({"role": "user", "content": req.message})

    # If an OpenAI client is configured, use it. Otherwise use a
    # safe, deterministic demo responder so the app can run without an API key.
    if client:
        try:
            messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history
            response = client.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=messages,
                max_tokens=1000,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Model call failed: {e}")

        # Extract assistant text
        try:
            reply_text = response["choices"][0]["message"]["content"]
        except Exception:
            raise HTTPException(status_code=502, detail="Malformed response from OpenAI")
    else:
        # Simple, safety-first demo responder.
        user_msg = req.message.lower()
        emergency_triggers = [
            "chest pain",
            "can\'t breathe",
            "difficulty breathing",
            "severe bleeding",
            "stroke",
            "suicid",
            "overdose",
        ]

        if any(keyword in user_msg for keyword in emergency_triggers):
            reply_text = (
                "If you are experiencing severe or life-threatening symptoms (for example, "
                "chest pain, trouble breathing, severe bleeding, or signs of stroke), "
                "call emergency services immediately (911 in the US) or go to the nearest ER. "
                "I can't provide a diagnosis."
            )
        else:
            # Friendly, non-diagnostic fallback answer that encourages seeking care
            reply_text = (
                "Demo mode: I can help explain general health topics and suggest when "
                "to seek care. I can't diagnose or give medical advice here. "
                "You said: '" + req.message.strip() + "'. For specific concerns, please see a "
                "licensed clinician."
            )

    history.append({"role": "assistant", "content": reply_text})

    return ChatResponse(reply=reply_text)


@app.get("/health")
def health_check():
    return {"status": "ok"}
