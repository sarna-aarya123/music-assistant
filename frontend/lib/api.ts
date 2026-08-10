const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// MIDI Analyzer
// ---------------------------------------------------------------------------

export type MidiAnalysisResponse = {
  bpm: number;
  time_signature: string;
  key: string;
  note_density: number;
  pitch_range: [string, string];
  avg_velocity: number;
  track_count: number;
  ai_available: boolean;
  feel_summary: string;
  notes: string;
  suggestions: string[];
};

export async function analyzeMidi(file: File): Promise<MidiAnalysisResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/midi/analyze`, { method: "POST", body: form });
  return handle<MidiAnalysisResponse>(res);
}

// ---------------------------------------------------------------------------
// Lyric Lab
// ---------------------------------------------------------------------------

export type LyricsAnalyzeResponse = {
  overall_notes: string;
  rhyme_notes: string;
  repetition_notes: string;
  cadence_notes: string;
  line_by_line: { line: string; note: string }[];
};

export async function analyzeLyrics(
  lyrics: string,
  styleReference?: string
): Promise<LyricsAnalyzeResponse> {
  const res = await fetch(`${API_BASE_URL}/api/lyrics/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lyrics, style_reference: styleReference }),
  });
  return handle<LyricsAnalyzeResponse>(res);
}

export async function generateLyrics(
  lyrics: string,
  themeOrPrompt: string,
  styleReference?: string,
  count = 4
): Promise<{ candidates: string[] }> {
  const res = await fetch(`${API_BASE_URL}/api/lyrics/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lyrics,
      theme_or_prompt: themeOrPrompt,
      style_reference: styleReference,
      count,
    }),
  });
  return handle<{ candidates: string[] }>(res);
}

// ---------------------------------------------------------------------------
// AI Coach
// ---------------------------------------------------------------------------

export type CoachUploadResponse = {
  track_id: string;
  filename: string;
  duration_sec: number;
};

export type CoachFeedbackResponse = {
  track_id: string;
  features: { bpm: number; key: string; rms_db: number; brightness_hz: number };
  ai_available: boolean;
  strengths: string[];
  improvements: string[];
  follow_up_questions: string[];
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function uploadTrack(file: File): Promise<CoachUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/coach/upload`, { method: "POST", body: form });
  return handle<CoachUploadResponse>(res);
}

export async function getFeedback(trackId: string): Promise<CoachFeedbackResponse> {
  const res = await fetch(`${API_BASE_URL}/api/coach/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId }),
  });
  return handle<CoachFeedbackResponse>(res);
}

export async function sendChatMessage(
  trackId: string,
  messages: ChatMessage[]
): Promise<{ reply: string }> {
  const res = await fetch(`${API_BASE_URL}/api/coach/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId, messages }),
  });
  return handle<{ reply: string }>(res);
}
