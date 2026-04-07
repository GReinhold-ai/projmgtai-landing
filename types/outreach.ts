// ─────────────────────────────────────────────────────────────────────────────
// types/outreach.ts
// Shared types for the Estimator Outreach Agent pipeline
// ─────────────────────────────────────────────────────────────────────────────

export type PitchAngle = "speed" | "accuracy" | "AI_native" | "cost_reduction";
export type TeamSize   = "solo" | "small" | "mid" | "large";
export type CompanyTier = "sub" | "gc" | "owner" | "unknown";
export type LeadStatus  = "pending" | "approved" | "skipped" | "sent" | "replied";

// Raw lead record as stored in the DB after scraping
export interface RawLead {
  id: string;
  source: "indeed" | "linkedin" | "ziprecruiter" | "constructionjobs" | "agc" | "glassdoor";
  company: string;
  title: string;
  location: string;
  jd_text: string;
  url: string;
  posted_date: string;      // ISO date string
  scraped_at: string;       // ISO datetime string
  processed: boolean;
  dedup_hash: string;       // sha256(company + title + location)
}

// AI analysis result from /api/outreach/analyze
export interface JDAnalysis {
  lead_id: string;
  relevance_score: number;   // 1–10
  pitch_angle: PitchAngle;
  team_size_signal: TeamSize;
  company_tier: CompanyTier;
  project_types: string[];
  pain_phrases: string[];
  software_mentioned: string[];
  hook_sentence: string;
  auto_approve: boolean;     // true if score >= 8
  analyzed_at: string;
}

// Generated pitch set from /api/outreach/generate-pitch
export interface PitchSet {
  lead_id: string;
  subjects: [string, string, string];   // A/B/C variants
  bodies:   [string, string, string];
  generated_at: string;
}

// Full lead record as shown in the review dashboard
export interface ReviewLead extends RawLead {
  analysis?: JDAnalysis;
  pitches?: PitchSet;
  contact_name?: string;
  contact_email?: string;
  contact_confidence?: number;  // Hunter.io confidence 0–100
  linkedin_url?: string;
  status: LeadStatus;
}

// Request/response shapes for API routes
export interface AnalyzeRequest {
  lead_id: string;
  jd_text: string;
  company: string;
  title: string;
}

export interface AnalyzeResponse {
  success: true;
  analysis: JDAnalysis;
}

export interface GeneratePitchRequest {
  lead_id: string;
  jd_text: string;
  company: string;
  title: string;
  location: string;
  contact_name?: string;
  analysis: JDAnalysis;
}

export interface GeneratePitchResponse {
  success: true;
  pitches: PitchSet;
}

export interface ApproveRequest {
  lead_id: string;
  subject: string;   // final edited subject (user may have tweaked)
  body: string;      // final edited body
  contact_email: string;
  contact_name?: string;
}

export interface ApproveResponse {
  success: true;
  queued_at: string;
  send_scheduled_for: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}
