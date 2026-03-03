// src/pages/toon-test.tsx
import React, { useState, FormEvent } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8080";

type ScopeItem = {
  item: string;
  qty: number;
  length?: number;
  width?: number;
  room?: string;
  wbs_code?: string;
  uom?: string;
  location?: string;
  sheet?: string;
  elevation?: string;
  note?: string;
  page?: string;
};

type WbsRow = {
  wbs_code: string;
  description: string;
  qty: number;
  uom: string;
  location: string;
};

type RawPage = {
  index: number;
  label: string;
  text: string;
};

type Classification = {
  index: number;
  item: string;
  category: string;
  include_in_bid: boolean;
  reason: string;
};

type ExtractResponse = {
  ok: boolean;
  filename: string;
  use_gpt?: boolean;
  toon_scope: string;
  scope_items: ScopeItem[];
  toon_wbs: string;
  wbs_rows: WbsRow[];
  vsc_scope?: string;
  raw_pages?: RawPage[];
  classifications?: Classification[];
};

const ToonTestPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [useGpt, setUseGpt] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ExtractResponse | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResponse(null);

    if (!file) {
      setError("Please choose a PDF first.");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `${API_BASE}/api/extract_file?use_gpt=${useGpt ? "true" : "false"}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server responded with ${res.status}: ${text}`);
      }

      const data: ExtractResponse = await res.json();
      setResponse(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const prettyJSON = (obj: any) => JSON.stringify(obj, null, 2);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <main
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <header style={{ marginBottom: "2rem" }}>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              marginBottom: "0.25rem",
            }}
          >
            ProjMgtAI Parser – TOON + VSC Test
          </h1>
          <p style={{ fontSize: "0.95rem", color: "#9ca3af" }}>
            Upload a PDF, optionally enable GPT parsing, and compare TOON, JSON,
            VSC, and raw OCR outputs from the FastAPI backend.
          </p>
        </header>

        {/* Upload / control panel */}
        <section
          style={{
            background: "#020617",
            borderRadius: "0.75rem",
            border: "1px solid #1f2937",
            padding: "1.5rem 1.75rem",
            marginBottom: "2rem",
          }}
        >
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                htmlFor="pdf-file"
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                }}
              >
                PDF file
              </label>
              <input
                id="pdf-file"
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                }}
              />
              {file && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#9ca3af",
                    marginTop: "0.25rem",
                  }}
                >
                  Selected: {file.name}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1rem",
                marginTop: "0.5rem",
              }}
            >
              <input
                id="use-gpt"
                type="checkbox"
                checked={useGpt}
                onChange={(e) => setUseGpt(e.target.checked)}
              />
              <label
                htmlFor="use-gpt"
                style={{ fontSize: "0.85rem", color: "#e5e7eb" }}
              >
                Use GPT parsing (VSC millwork scope)
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.5rem 1.25rem",
                borderRadius: "9999px",
                border: "none",
                background: loading ? "#16a34a99" : "#16a34a",
                color: "#ecfdf5",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Parsing..." : "Upload & Parse"}
            </button>

            {error && (
              <div
                style={{
                  marginTop: "1rem",
                  background: "#7f1d1d",
                  borderRadius: "0.5rem",
                  padding: "0.75rem 1rem",
                  fontSize: "0.8rem",
                }}
              >
                {error}
              </div>
            )}
          </form>
        </section>

        {/* Only render outputs once we have a response */}
        {response && (
          <>
            {/* TOON scope + JSON / WBS TOON + JSON */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
                marginBottom: "1.5rem",
              }}
            >
              {/* Scope side */}
              <div
                style={{
                  background: "#020617",
                  borderRadius: "0.75rem",
                  border: "1px solid #1f2937",
                  padding: "1rem 1.25rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  Scope (TOON + JSON)
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#9ca3af",
                    marginBottom: "0.75rem",
                  }}
                >
                  File: {response.filename} · GPT:{" "}
                  {response.use_gpt ? "ON" : "OFF"}
                </div>

                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      marginBottom: "0.25rem",
                    }}
                  >
                    TOON scope
                  </div>
                  <textarea
                    readOnly
                    value={response.toon_scope || ""}
                    style={{
                      width: "100%",
                      minHeight: "170px",
                      background: "#020617",
                      color: "#e5e7eb",
                      borderRadius: "0.5rem",
                      border: "1px solid #1f2937",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
                      fontSize: "0.75rem",
                      padding: "0.6rem",
                      whiteSpace: "pre",
                    }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      marginBottom: "0.25rem",
                    }}
                  >
                    scope_items (JSON)
                  </div>
                  <textarea
                    readOnly
                    value={prettyJSON(response.scope_items)}
                    style={{
                      width: "100%",
                      minHeight: "170px",
                      background: "#020617",
                      color: "#e5e7eb",
                      borderRadius: "0.5rem",
                      border: "1px solid #1f2937",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
                      fontSize: "0.75rem",
                      padding: "0.6rem",
                      whiteSpace: "pre",
                    }}
                  />
                </div>
              </div>

              {/* WBS side */}
              <div
                style={{
                  background: "#020617",
                  borderRadius: "0.75rem",
                  border: "1px solid #1f2937",
                  padding: "1rem 1.25rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  WBS (TOON + JSON)
                </div>

                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      marginBottom: "0.25rem",
                    }}
                  >
                    TOON WBS
                  </div>
                  <textarea
                    readOnly
                    value={response.toon_wbs || ""}
                    style={{
                      width: "100%",
                      minHeight: "170px",
                      background: "#020617",
                      color: "#e5e7eb",
                      borderRadius: "0.5rem",
                      border: "1px solid #1f2937",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
                      fontSize: "0.75rem",
                      padding: "0.6rem",
                      whiteSpace: "pre",
                    }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      marginBottom: "0.25rem",
                    }}
                  >
                    wbs_rows (JSON)
                  </div>
                  <textarea
                    readOnly
                    value={prettyJSON(response.wbs_rows)}
                    style={{
                      width: "100%",
                      minHeight: "170px",
                      background: "#020617",
                      color: "#e5e7eb",
                      borderRadius: "0.5rem",
                      border: "1px solid #1f2937",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
                      fontSize: "0.75rem",
                      padding: "0.6rem",
                      whiteSpace: "pre",
                    }}
                  />
                </div>
              </div>
            </section>

            {/* VSC + Raw OCR */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
                marginBottom: "1.5rem",
              }}
            >
              {/* VSC scope */}
              <div
                style={{
                  background: "#020617",
                  borderRadius: "0.75rem",
                  border: "1px solid #1f2937",
                  padding: "1rem 1.25rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  VSC scope (token-efficient rows)
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#9ca3af",
                    marginBottom: "0.5rem",
                  }}
                >
                  Format: description, wbs_code, qty, uom, location, sheet,
                  elevation, note
                </div>
                <textarea
                  readOnly
                  value={
                    response.vsc_scope && response.vsc_scope.trim().length > 0
                      ? response.vsc_scope
                      : "(No VSC scope returned)"
                  }
                  style={{
                    width: "100%",
                    minHeight: "260px",
                    background: "#020617",
                    color: "#e5e7eb",
                    borderRadius: "0.5rem",
                    border: "1px solid #1f2937",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
                    fontSize: "0.75rem",
                    padding: "0.6rem",
                    whiteSpace: "pre",
                  }}
                />
              </div>

              {/* Raw OCR */}
              <div
                style={{
                  background: "#020617",
                  borderRadius: "0.75rem",
                  border: "1px solid #1f2937",
                  padding: "1rem 1.25rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  Raw OCR pages
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#9ca3af",
                    marginBottom: "0.5rem",
                  }}
                >
                  First few sheets’ raw text (for debugging extraction).
                </div>
                <textarea
                  readOnly
                  value={
                    response.raw_pages && response.raw_pages.length > 0
                      ? response.raw_pages
                          .map(
                            (p) =>
                              `[Page ${p.index + 1} – ${p.label || ""}]\n${
                                p.text
                              }`
                          )
                          .join("\n\n" + "-".repeat(40) + "\n\n")
                      : "(No raw page text returned)"
                  }
                  style={{
                    width: "100%",
                    minHeight: "260px",
                    background: "#020617",
                    color: "#e5e7eb",
                    borderRadius: "0.5rem",
                    border: "1px solid #1f2937",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
                    fontSize: "0.75rem",
                    padding: "0.6rem",
                    whiteSpace: "pre",
                  }}
                />
              </div>
            </section>

            {/* GPT classifier results */}
            <section style={{ marginTop: "1rem", marginBottom: "2rem" }}>
              <h2
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  marginBottom: "0.75rem",
                }}
              >
                GPT Millwork Classifier
              </h2>

              <div
                style={{
                  background: "#020617",
                  borderRadius: "0.75rem",
                  border: "1px solid #1f2937",
                  padding: "1rem 1.25rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "#9ca3af",
                    marginBottom: "0.5rem",
                  }}
                >
                  For each scope row, GPT decides if it&apos;s core millwork,
                  misc, or non-millwork, and whether to include it in the bid.
                  Rows with <code>include_in_bid = false</code> are filtered out
                  of the VSC scope above.
                </div>

                <textarea
                  readOnly
                  value={
                    response.classifications
                      ? JSON.stringify(response.classifications, null, 2)
                      : "(no classifier output)"
                  }
                  style={{
                    width: "100%",
                    minHeight: "260px",
                    background: "#020617",
                    color: "#e5e7eb",
                    borderRadius: "0.5rem",
                    border: "1px solid #1f2937",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
                    fontSize: "0.75rem",
                    padding: "0.6rem",
                    whiteSpace: "pre",
                  }}
                />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default ToonTestPage;
