const express = require("express");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = 8000;

console.log(
  "GEMINI KEY:",
  process.env.GEMINI_API_KEY ? "LOADED 🔥" : "MISSING ❌"
);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(express.static(__dirname));

const users = new Map();
const conversations = new Map();

const SYSTEM_PROMPT = `
You are a patient-facing health information assistant.

Rules:
- Never diagnose.
- Give general health information in simple language.
- Encourage users to see a licensed healthcare professional for serious, worsening, or unclear symptoms.
- For emergencies such as severe chest pain, difficulty breathing, stroke symptoms, severe bleeding, or overdose, tell the user to seek emergency medical care immediately.
- Do not prescribe medication or provide prescription dosage instructions.
- Be calm, helpful, and honest that you are not a replacement for a doctor.
`;

function buildFallbackReply(message) {
  const text = String(message || "").trim();
  const lowered = text.toLowerCase();
  const emergencyTriggers = [
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "difficulty breathing",
    "severe bleeding",
    "stroke",
    "suicid",
    "overdose"
  ];

  if (emergencyTriggers.some((trigger) => lowered.includes(trigger))) {
    return "If you are experiencing severe or life-threatening symptoms such as chest pain, trouble breathing, severe bleeding, or stroke symptoms, seek emergency medical care immediately or call your local emergency number. I can only give general health information and cannot diagnose or treat you.";
  }

  return `I can help with general health information and safe next steps, but I can't diagnose or prescribe treatments. You said: "${text}". For specific concerns, a licensed healthcare professional is the best next step.`;
}

function extractGeminiText(response) {
  if (!response) return "";

  if (typeof response.text === "string" && response.text.trim()) {
    return response.text;
  }

  if (Array.isArray(response.candidates)) {
    const candidate = response.candidates[0];
    const parts = candidate?.content?.parts || [];

    const text = parts
      .filter((part) => typeof part?.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();

    if (text) return text;
  }

  return "";
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/auth/signup", (req, res) => {
  const { name, email, password } = req.body || {};

  if (!email || !String(email).trim()) {
    return res.status(400).json({ detail: "Email is required." });
  }

  if (!password || String(password).length < 8) {
    return res.status(400).json({ detail: "Password must be at least 8 characters." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = users.get(normalizedEmail);

  if (existingUser) {
    return res.status(409).json({ detail: "An account with that email already exists." });
  }

  const newUser = {
    name: name && String(name).trim() ? String(name).trim() : normalizedEmail.split("@")[0],
    email: normalizedEmail,
    password: String(password)
  };

  users.set(normalizedEmail, newUser);

  return res.status(201).json({
    user: {
      name: newUser.name,
      email: newUser.email
    }
  });
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ detail: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = users.get(normalizedEmail);

  if (!user || user.password !== String(password)) {
    return res.status(401).json({ detail: "Invalid email or password." });
  }

  return res.json({
    user: {
      name: user.name,
      email: user.email
    }
  });
});

app.post("/chat", async (req, res) => {
  console.log("🔥 CHAT REQUEST:", req.body);

  const { session_id, message } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({
      detail: "Message cannot be empty."
    });
  }

  const sessionId = session_id || "default";
  const history = conversations.get(sessionId) || [];

  history.push({
    role: "user",
    parts: [{ text: message }]
  });

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

  if (!hasGeminiKey) {
    const reply = buildFallbackReply(message);

    history.push({
      role: "model",
      parts: [{ text: reply }]
    });

    conversations.set(sessionId, history);

    return res.json({ reply });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

   const mainModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const backupModel = "gemini-3.1-flash-lite";

let response;

try {
  // Try the main model first
  response = await ai.models.generateContent({
    model: mainModel,
    contents: [
      {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }]
      },
      ...history
    ]
  });

} catch (mainError) {

  // Main model quota reached → automatically try backup
  if (
    mainError?.status === 429 ||
    mainError?.code === 429 ||
    String(mainError?.message || "").includes("429") ||
    String(mainError?.message || "").includes("RESOURCE_EXHAUSTED")
  ) {
    console.log("⚠️ Main model quota reached. Switching to backup...");

    try {
      response = await ai.models.generateContent({
        model: backupModel,
        contents: [
          {
            role: "user",
            parts: [{ text: SYSTEM_PROMPT }]
          },
          ...history
        ]
      });

    } catch (backupError) {

      // Both models exhausted
      if (
        backupError?.status === 429 ||
        backupError?.code === 429 ||
        String(backupError?.message || "").includes("429") ||
        String(backupError?.message || "").includes("RESOURCE_EXHAUSTED")
      ) {
        console.log("🚫 Both Gemini models are out of quota.");

        return res.status(200).json({
          reply: "AI quota temporarily reached. Please try again later."
        });
      }

      throw backupError;
    }

  } else {
    throw mainError;
  }
}
    const reply = extractGeminiText(response) || buildFallbackReply(message);

    console.log("🤖 GEMINI RESPONSE:", reply);

    history.push({
      role: "model",
      parts: [{ text: reply }]
    });

    conversations.set(sessionId, history);

    return res.json({ reply });
  } catch (error) {
  console.error("💥 GEMINI ERROR:", error);

  // Gemini quota exceeded
  if (
    error?.status === 429 ||
    error?.code === 429 ||
    String(error?.message || "").includes("429") ||
    String(error?.message || "").includes("RESOURCE_EXHAUSTED")
  ) {
    return res.status(200).json({
      reply: "AI quota temporarily reached. Please try again later."
    });
  }

  // Gemini authentication error
  if (
    error?.status === 401 ||
    error?.code === 401 ||
    String(error?.message || "").includes("401") ||
    String(error?.message || "").includes("UNAUTHENTICATED")
  ) {
    return res.status(500).json({
      reply: "AI authentication error. Please contact the administrator."
    });
  }

  // Other errors
  const fallbackReply = buildFallbackReply(message);

  history.push({
    role: "model",
    parts: [{ text: fallbackReply }]
  });

  conversations.set(sessionId, history);

  return res.status(200).json({
    reply: `${fallbackReply} (The AI service is temporarily unavailable.)`
  });
}
});

app.listen(PORT, () => {
  console.log(`🔥 Backend running at http://localhost:${PORT}`);
});