const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// status 0 signals a network-level failure (backend unreachable), as opposed to an HTTP error
// response — callers can use this to show a more actionable message than a generic 500.
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(0, `Can't reach the backend at ${API_BASE_URL} — is it running?`);
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

const MIDI_MAX_UPLOAD_MB = 10;
const COACH_MAX_UPLOAD_MB = 50;

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
  unique_pitch_classes: number;
  velocity_range: [number, number];
  avg_note_length_sec: number;
  polyphony: number;
  syncopation: number;
  feel_summary: string;
  notes: string;
  suggestions: string[];
};

export async function analyzeMidi(file: File): Promise<MidiAnalysisResponse> {
  if (file.size > MIDI_MAX_UPLOAD_MB * 1024 * 1024) {
    throw new ApiError(413, `File exceeds the ${MIDI_MAX_UPLOAD_MB}MB upload limit.`);
  }
  const form = new FormData();
  form.append("file", file);
  const res = await safeFetch(`${API_BASE_URL}/api/midi/analyze`, { method: "POST", body: form });
  return handle<MidiAnalysisResponse>(res);
}

export type MidiHistoryEntry = MidiAnalysisResponse & {
  id: number;
  created_at: string;
  filename: string;
};

export async function getMidiHistory(): Promise<MidiHistoryEntry[]> {
  const res = await safeFetch(`${API_BASE_URL}/api/midi/history`);
  return handle<MidiHistoryEntry[]>(res);
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

export async function analyzeLyrics(lyrics: string): Promise<LyricsAnalyzeResponse> {
  const res = await safeFetch(`${API_BASE_URL}/api/lyrics/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lyrics }),
  });
  return handle<LyricsAnalyzeResponse>(res);
}

export type LyricsHistoryEntry = {
  id: number;
  created_at: string;
  mode: "analyze" | "generate";
  lyrics: string;
  style_reference: string | null;
  theme_or_prompt: string | null;
  result: LyricsAnalyzeResponse | { candidates: string[] };
};

export async function getLyricsHistory(): Promise<LyricsHistoryEntry[]> {
  const res = await safeFetch(`${API_BASE_URL}/api/lyrics/history`);
  return handle<LyricsHistoryEntry[]>(res);
}

// ---------------------------------------------------------------------------
// AI Coach
// ---------------------------------------------------------------------------

export type CoachUploadResponse = {
  track_id: string;
  filename: string;
  duration_sec: number;
};

export type TrackFeatures = {
  bpm: number;
  key: string;
  rms_db: number;
  brightness_hz: number;
  rolloff_hz: number;
  zero_crossing_rate: number;
  dynamic_range_db: number;
  low_end_ratio: number;
  onset_density: number;
};

export type CoachFeedbackResponse = {
  track_id: string;
  features: TrackFeatures;
  strengths: string[];
  improvements: string[];
};

export async function uploadTrack(file: File): Promise<CoachUploadResponse> {
  if (file.size > COACH_MAX_UPLOAD_MB * 1024 * 1024) {
    throw new ApiError(413, `File exceeds the ${COACH_MAX_UPLOAD_MB}MB upload limit.`);
  }
  const form = new FormData();
  form.append("file", file);
  const res = await safeFetch(`${API_BASE_URL}/api/coach/upload`, { method: "POST", body: form });
  return handle<CoachUploadResponse>(res);
}

export async function getFeedback(trackId: string): Promise<CoachFeedbackResponse> {
  const res = await safeFetch(`${API_BASE_URL}/api/coach/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId }),
  });
  return handle<CoachFeedbackResponse>(res);
}

export type CoachHistoryEntry = {
  track_id: string;
  created_at: string;
  filename: string;
  duration_sec: number;
  feedback: CoachFeedbackResponse | null;
};

export async function getCoachHistory(): Promise<CoachHistoryEntry[]> {
  const res = await safeFetch(`${API_BASE_URL}/api/coach/history`);
  return handle<CoachHistoryEntry[]>(res);
}
