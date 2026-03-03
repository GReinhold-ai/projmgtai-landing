// projmgtai-ui/src/lib/parsePlansAndSaveScopes.ts
//
// Upload a PDF to the ProjMgtAI backend, receive parsed scopes,
// then persist the result to Firestore under:
//   projects/{projectId}/parses/{autoId}
//
// Requirements:
// - A Firebase client init that exports `db` (Firestore instance) from "@/lib/firebase"
// - NEXT_PUBLIC_API_BASE_URL set if your API isn't on 127.0.0.1:8080
//
// Example:
//   const { docId, response } = await parsePlansAndSaveScopes({
//     file,
//     trades: ["Millwork"],
//     projectId: "proj-123",
//     useGated: false, // or true once headers/auth are wired
//     userId: "user-abc", // required if useGated = true
//   });

import { db } from "@/lib/firebase"; // <-- make sure this exists in your project
import {
  addDoc,
  collection,
  serverTimestamp,
  DocumentReference,
} from "firebase/firestore";

export type ParsePlansMeta = {
  file_name: string;
  size_bytes: number;
  content_type: string;
  user?: string;
  plan?: string;
  had_text_before: boolean;
  has_text_after: boolean;
};

export type ParsePlansStats = {
  page_count: number;
  pages_with_text: number;
  first_page_text_len: number;
  sample_first_page_text?: string;
  error?: string;
};

export type ExtractedScopeItem = {
  id?: string;
  description?: string;
  quantity?: number | string;
  unit?: string;
  sheet?: string;
  notes?: string;
};

export type ExtractedScope = {
  trade: string;
  items: ExtractedScopeItem[];
};

export type ParsePlansResponse = {
  meta: ParsePlansMeta;
  stats: ParsePlansStats;
  extracted: {
    scopes: ExtractedScope[];
  };
};

const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8080";

/** Internal: perform the POST (multipart) to backend */
async function uploadToBackend(
  endpoint: string,
  file: File,
  trades: string[],
  headers?: Record<string, string>
): Promise<ParsePlansResponse> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("trades_json", JSON.stringify(trades || []));

  const resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body: fd,
  });

  let payload: any = null;
  try {
    payload = await resp.json();
  } catch {
    // ignore; synthesize below on error
  }

  if (!resp.ok) {
    const detail =
      (payload && (payload.detail || payload.message)) ||
      `HTTP ${resp.status} ${resp.statusText}`;
    throw new Error(detail);
  }

  return payload as ParsePlansResponse;
}

export type ParseAndSaveArgs = {
  file: File;
  trades: string[];
  projectId: string;
  useGated?: boolean; // false => /parse_plans_v2
  userId?: string; // required if useGated = true
  plan?: string; // default 'free'
  baseUrl?: string; // override API base
};

export type ParseAndSaveResult = {
  docRef: DocumentReference;
  docId: string;
  response: ParsePlansResponse;
};

/**
 * Main entry: parse the PDF and save the result to Firestore.
 */
export async function parsePlansAndSaveScopes({
  file,
  trades,
  projectId,
  useGated = false,
  userId,
  plan = "free",
  baseUrl = DEFAULT_BASE_URL,
}: ParseAndSaveArgs): Promise<ParseAndSaveResult> {
  if (!file) throw new Error("No file provided");
  if (!projectId) throw new Error("Missing projectId");
  // Some drag/drop inputs may not populate MIME; we accept .pdf extension as fallback
  const isPdf =
    (file.type && file.type === "application/pdf") ||
    /\.pdf$/i.test(file.name || "");
  if (!isPdf) throw new Error("Only PDF uploads are supported");

  const endpoint = useGated
    ? `${baseUrl}/analyze/parse_plans`
    : `${baseUrl}/analyze/parse_plans_v2`;

  const headers =
    useGated && userId
      ? {
          "X-Plan": plan,
          "X-User-Id": userId,
        }
      : undefined;

  // 1) Call backend
  const response = await uploadToBackend(endpoint, file, trades, headers);

  // 2) Save to Firestore
  const coll = collection(db, "projects", projectId, "parses");
  const docRef = await addDoc(coll, {
    createdAt: serverTimestamp(),
    projectId,
    sourceEndpoint: useGated ? "parse_plans" : "parse_plans_v2",
    file: {
      name: response.meta.file_name,
      size_bytes: response.meta.size_bytes,
      content_type: response.meta.content_type,
    },
    auth: {
      user: response.meta.user || null,
      plan: response.meta.plan || (useGated ? plan : null),
    },
    stats: response.stats,
    trades,
    extracted: response.extracted,
    // Room for UI state or post-processing flags
    status: "parsed",
    notes: null,
  });

  return { docRef, docId: docRef.id, response };
}

/**
 * Optional helper: quick client-side guard suitable for form inputs
 */
export function isPdfFile(file: File | null | undefined): boolean {
  if (!file) return false;
  if (file.type) return file.type === "application/pdf";
  return /\.pdf$/i.test(file.name || "");
}
