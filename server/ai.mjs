// OpenAI-backed enrichment: transcribe a forwarded video and turn a caption +
// transcript into a structured suggestion (title, description, checklist of
// steps). Disabled cleanly when OPENAI_API_KEY is unset. Uses global fetch/
// FormData/Blob (Node 18+), so no dependencies.

import fs from "node:fs";

const OPENAI_BASE = "https://api.openai.com/v1";

export function createAI({
  apiKey = null,
  model = "gpt-4o-mini",
  transcribeModel = "whisper-1",
  maxAudioBytes = 24 * 1024 * 1024, // Whisper hard limit is 25 MB
} = {}) {
  const key = apiKey?.trim() || null;

  async function transcribe(filePath, fileName = "audio.mp4") {
    if (!key) throw new Error("AI is not configured.");
    const buf = fs.readFileSync(filePath);
    if (buf.length > maxAudioBytes) {
      throw new Error("Audio too large to transcribe.");
    }
    const form = new FormData();
    form.append("file", new Blob([buf]), fileName);
    form.append("model", transcribeModel);
    const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`transcription failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return (data.text ?? "").trim();
  }

  // Turn caption + transcript into { title, description, steps: string[] }.
  async function structure({ caption = "", transcript = "" }) {
    if (!key) throw new Error("AI is not configured.");
    const parts = [];
    if (caption) parts.push(`CAPTION:\n${caption}`);
    if (transcript) parts.push(`TRANSCRIPT:\n${transcript}`);
    const content = parts.join("\n\n").slice(0, 12000); // keep tokens bounded
    if (!content.trim()) return null;

    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You turn a social-media post (its caption and/or spoken transcript) " +
              "into a concise, actionable note for a personal goal-tracking app. " +
              "Reply ONLY with JSON of the shape " +
              '{"title": string, "description": string, "steps": string[]}. ' +
              "title: a short name (max ~8 words). " +
              "description: 1-3 sentences summarising the idea. " +
              "steps: ordered, actionable steps if the post describes a process " +
              "(recipe, workout, tutorial); otherwise an empty array. " +
              "Keep each step short. Do not invent details that are not present.",
          },
          { role: "user", content },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`structuring failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const description =
      typeof parsed.description === "string" ? parsed.description.trim() : "";
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps
          .map((s) => (typeof s === "string" ? s.trim() : ""))
          .filter(Boolean)
          .slice(0, 30)
      : [];
    if (!title && !description && steps.length === 0) return null;
    return { title, description, steps };
  }

  return { enabled: Boolean(key), transcribe, structure };
}
