"use client";
// app/upload/page.tsx
// Self-serve upload flow — 4 states: form → uploading → processing → done
// Deploy to: app/upload/page.tsx

import { useState, useRef, DragEvent, ChangeEvent, useEffect } from "react";

type ProjectType = "fitness" | "hospitality" | "office" | "retail" | "healthcare" | "education" | "other";
type UploadState = "form" | "uploading" | "processing" | "done" | "error";
type FileTag = "Plans" | "Specs" | "Addenda" | "Shop Drawings";

const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "fitness",     label: "Fitness / Recreation" },
  { value: "hospitality", label: "Hospitality / Restaurant" },
  { value: "office",      label: "Office / Corporate" },
  { value: "retail",      label: "Retail / Commercial" },
  { value: "healthcare",  label: "Healthcare / Medical" },
  { value: "education",   label: "Education / Institutional" },
  { value: "other",       label: "Other" },
];

const FILE_TAGS: FileTag[] = ["Plans", "Specs", "Addenda", "Shop Drawings"];

function detectTag(filename: string): FileTag {
  const lower = filename.toLowerCase();
  if (/spec|division|csi/.test(lower))      return "Specs";
  if (/addend|delta|revision/.test(lower))  return "Addenda";
  if (/shop|submittal/.test(lower))          return "Shop Drawings";
  return "Plans";
}

interface TaggedFile {
  file: File;
  tag: FileTag;
  id: string;
}

export default function UploadPage() {
  const [state, setState]             = useState<UploadState>("form");
  const [email, setEmail]             = useState("");
  const [company, setCompany]         = useState("");
  const [projectType, setProjectType] = useState<ProjectType | "">("");
  const [projectName, setProjectName] = useState("");
  const [taggedFiles, setTaggedFiles] = useState<TaggedFile[]>([]);
  const [isDragging, setIsDragging]   = useState(false);
  const [progress, setProgress]       = useState(0);
  const [progressLabel, setProgressLabel] = useState("Uploading files…");
  const [errorMsg, setErrorMsg]       = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pick up prefill email from homepage widget
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get("email") || sessionStorage.getItem("prefill_email") || "";
    if (pre) setEmail(decodeURIComponent(pre));
  }, []);

  const addFiles = (incoming: File[]) => {
    const pdfs = incoming.filter((f) => f.type === "application/pdf");
    const tagged: TaggedFile[] = pdfs.map((f) => ({
      file: f,
      tag: detectTag(f.name),
      id: Math.random().toString(36).slice(2),
    }));
    setTaggedFiles((prev) => [...prev, ...tagged].slice(0, 8));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const removeFile = (id: string) =>
    setTaggedFiles((prev) => prev.filter((f) => f.id !== id));

  const updateTag = (id: string, tag: FileTag) =>
    setTaggedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, tag } : f)));

  const totalMB = taggedFiles.reduce((s, tf) => s + tf.file.size, 0) / 1024 / 1024;

  const isValid =
    email.includes("@") &&
    company.trim().length > 0 &&
    projectType !== "" &&
    taggedFiles.length > 0 &&
    totalMB < 150;

  const startProgress = (targetPct: number, label: string, durationMs: number) => {
    if (progressRef.current) clearInterval(progressRef.current);
    setProgressLabel(label);
    const steps = 40;
    const stepMs = durationMs / steps;
    progressRef.current = setInterval(() => {
      setProgress((p) => {
        const next = p + (targetPct - p) * 0.12;
        if (next >= targetPct - 0.5) {
          clearInterval(progressRef.current!);
          return targetPct;
        }
        return next;
      });
    }, stepMs);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmittedEmail(email);
    setState("uploading");
    setProgress(0);
    startProgress(40, "Uploading files…", 3000);

    try {
      const form = new FormData();
      form.append("email", email);
      form.append("company", company);
      form.append("project_type", projectType);
      form.append("project_name", projectName || `${company} Project`);
      taggedFiles.forEach((tf) => {
        form.append("files", tf.file);
        form.append(`tag_${tf.file.name}`, tf.tag);
      });

      setState("processing");
      startProgress(90, "Sending to extraction pipeline…", 4000);

      const res = await fetch("/api/process-upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(100);
      setProgressLabel("Done!");
      setTimeout(() => setState("done"), 600);
    } catch (err: unknown) {
      if (progressRef.current) clearInterval(progressRef.current);
      setErrorMsg(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setState("error");
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #0b0d14; }

        .up-page {
          min-height: 100vh;
          background: #0b0d14;
          font-family: 'Barlow', sans-serif;
          color: #f0ede8;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 20px 80px;
        }

        /* NAV */
        .up-nav {
          width: 100%;
          max-width: 680px;
          padding: 28px 0 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 44px;
        }
        .up-logo {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #f0ede8;
          letter-spacing: 0.06em;
          text-decoration: none;
        }
        .up-logo span { color: #c8922a; }
        .up-back {
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          color: #454858;
          text-decoration: none;
          letter-spacing: 0.08em;
          transition: color 0.15s;
        }
        .up-back:hover { color: #c8922a; }

        /* CARD */
        .up-card {
          width: 100%;
          max-width: 640px;
          background: #0f1117;
          border: 1px solid #1e2130;
          border-radius: 4px;
          position: relative;
          overflow: hidden;
        }
        .up-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #7a5010, #c8922a, #e8b84b, #c8922a, #7a5010);
        }

        /* CARD HEADER */
        .up-head {
          padding: 36px 40px 28px;
          border-bottom: 1px solid #1e2130;
        }
        .up-eyebrow {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.2em;
          color: #c8922a;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .up-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 38px;
          font-weight: 800;
          line-height: 1.05;
          color: #f0ede8;
          margin-bottom: 10px;
        }
        .up-title em { font-style: normal; color: #c8922a; }
        .up-sub {
          font-size: 14px;
          color: #6a7080;
          line-height: 1.6;
        }

        /* FORM BODY */
        .up-body {
          padding: 32px 40px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        .field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          color: #454858;
          text-transform: uppercase;
        }
        .field input,
        .field select {
          background: #1a1d27;
          border: 1px solid #252838;
          border-radius: 3px;
          padding: 11px 14px;
          font-family: 'Barlow', sans-serif;
          font-size: 14px;
          color: #f0ede8;
          outline: none;
          transition: border-color 0.15s;
          width: 100%;
          -webkit-appearance: none;
          appearance: none;
        }
        .field input::placeholder { color: #353848; }
        .field input:focus,
        .field select:focus { border-color: #c8922a; }
        .field select option { background: #1a1d27; }

        /* DROP ZONE */
        .section-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.15em;
          color: #454858;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .drop-zone {
          border: 1px dashed #252838;
          border-radius: 3px;
          padding: 30px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
          background: #141720;
        }
        .drop-zone.active {
          border-color: #c8922a;
          background: #1a1508;
        }
        .drop-zone:hover { border-color: #353848; }
        .dz-icon { font-size: 26px; margin-bottom: 8px; display: block; }
        .dz-main { font-size: 14px; color: #9098a8; margin-bottom: 4px; }
        .dz-main span { color: #c8922a; text-decoration: underline; }
        .dz-sub {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #353848;
          letter-spacing: 0.04em;
        }

        /* FILE LIST */
        .file-list { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; }
        .file-row {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #141720;
          border: 1px solid #1e2130;
          border-radius: 3px;
          padding: 9px 12px;
        }
        .file-icon { font-size: 15px; flex-shrink: 0; }
        .file-name {
          flex: 1;
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          color: #9098a8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .file-size {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #353848;
          flex-shrink: 0;
        }
        .file-tag {
          background: #1e2130;
          border: 1px solid #2a2d3a;
          border-radius: 2px;
          padding: 4px 8px;
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #c8922a;
          outline: none;
          cursor: pointer;
          flex-shrink: 0;
          -webkit-appearance: none;
          appearance: none;
        }
        .file-tag option { background: #1a1d27; color: #f0ede8; }
        .file-remove {
          background: none;
          border: none;
          color: #353848;
          font-size: 18px;
          cursor: pointer;
          padding: 0 2px;
          flex-shrink: 0;
          transition: color 0.1s;
          line-height: 1;
        }
        .file-remove:hover { color: #e05555; }

        .size-track {
          height: 2px;
          background: #1e2130;
          border-radius: 1px;
          overflow: hidden;
          margin-top: 10px;
        }
        .size-fill {
          height: 100%;
          background: #c8922a;
          transition: width 0.3s;
        }
        .size-fill.over { background: #e05555; }
        .size-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #3a3d4a;
          text-align: right;
          margin-top: 4px;
        }

        /* WHAT TO UPLOAD TIP */
        .upload-tip {
          border-top: 1px solid #1a1d27;
          padding-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .tip-section-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.15em;
          color: #3a3d4a;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .tip-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border-radius: 3px;
          padding: 10px 12px;
        }
        .tip-row.good { background: #0d1f14; border: 1px solid #1a3a22; }
        .tip-row.bad  { background: #1f0d0d; border: 1px solid #3a1a1a; }
        .tip-mark { font-size: 13px; flex-shrink: 0; margin-top: 1px; font-style: normal; }
        .tip-row.good .tip-mark { color: #4caf7d; }
        .tip-row.bad  .tip-mark { color: #e05555; }
        .tip-title { font-weight: 600; display: block; margin-bottom: 1px; font-size: 13px; }
        .tip-row.good .tip-title { color: #4caf7d; }
        .tip-row.bad  .tip-title { color: #e05555; }
        .tip-body { color: #4a5060; font-size: 12px; line-height: 1.5; }

        /* FOOTER / SUBMIT */
        .up-foot {
          padding: 0 40px 36px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .btn-primary {
          background: #c8922a;
          color: #0b0d14;
          border: none;
          border-radius: 3px;
          padding: 16px 28px;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
          width: 100%;
        }
        .btn-primary:hover:not(:disabled) {
          background: #e8a83a;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(200,146,42,0.25);
        }
        .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
        .submit-note {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #353848;
          text-align: center;
          line-height: 1.8;
          letter-spacing: 0.04em;
        }

        /* STATE PANELS */
        .state-panel {
          padding: 64px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 18px;
        }
        .state-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 30px;
          font-weight: 700;
          color: #f0ede8;
        }
        .state-sub {
          font-size: 14px;
          color: #6a7080;
          line-height: 1.7;
          max-width: 400px;
        }
        .state-sub strong { color: #c8922a; font-weight: 600; }

        /* PROGRESS BAR */
        .prog-wrap { width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 8px; }
        .prog-track {
          height: 3px;
          background: #1e2130;
          border-radius: 2px;
          overflow: hidden;
          width: 100%;
        }
        .prog-fill {
          height: 100%;
          background: linear-gradient(90deg, #c8922a, #e8b84b);
          border-radius: 2px;
          transition: width 0.4s ease;
        }
        .prog-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #454858;
          letter-spacing: 0.1em;
          text-align: left;
        }

        /* DONE CHECKLIST */
        .done-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          max-width: 380px;
          text-align: left;
        }
        .done-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: #7a8090;
        }
        .done-check {
          width: 22px;
          height: 22px;
          background: #0d1f14;
          border: 1px solid #1a3a22;
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          flex-shrink: 0;
          color: #4caf7d;
        }
        .done-email-badge {
          background: #1a1d27;
          border: 1px solid #2a2d3a;
          border-radius: 3px;
          padding: 10px 16px;
          font-family: 'Space Mono', monospace;
          font-size: 12px;
          color: #c8922a;
          text-align: center;
          width: 100%;
          max-width: 380px;
        }
        .btn-secondary {
          background: none;
          border: 1px solid #2a2d3a;
          border-radius: 3px;
          padding: 12px 24px;
          font-family: 'Barlow', sans-serif;
          font-size: 14px;
          color: #7a8090;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .btn-secondary:hover { border-color: #c8922a; color: #c8922a; }

        /* SPINNER */
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner {
          width: 32px;
          height: 32px;
          border: 2px solid #1e2130;
          border-top-color: #c8922a;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }

        /* ERROR */
        .error-box {
          background: #1f0d0d;
          border: 1px solid #3a1a1a;
          border-radius: 3px;
          padding: 14px 16px;
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          color: #e05555;
          line-height: 1.6;
          max-width: 400px;
          width: 100%;
          text-align: left;
        }

        /* RESPONSIVE */
        @media (max-width: 520px) {
          .up-head, .up-body, .up-foot { padding-left: 22px; padding-right: 22px; }
          .field-row { grid-template-columns: 1fr; }
          .up-title { font-size: 30px; }
          .state-panel { padding: 48px 22px; }
        }
      `}</style>

      <div className="up-page">

        {/* NAV */}
        <nav className="up-nav">
          <a href="/" className="up-logo">ProjMgt<span>.AI</span></a>
          <a href="/" className="up-back">← Back to home</a>
        </nav>

        <div className="up-card">

          {/* ── FORM STATE ── */}
          {(state === "form") && (
            <>
              <div className="up-head">
                <div className="up-eyebrow">// Free extraction · No account required</div>
                <div className="up-title">Upload Your<br /><em>Plan Set.</em></div>
                <div className="up-sub">
                  Drop your architectural PDFs. We extract every millwork item — cabinets, countertops, shelving, hardware — and deliver a structured Excel workbook straight to your inbox.
                </div>
              </div>

              <div className="up-body">

                {/* Row 1: email + company */}
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Email *</label>
                    <input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Company *</label>
                    <input
                      type="text"
                      placeholder="Acme Millwork Co."
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </div>
                </div>

                {/* Row 2: project type + project name */}
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Project Type *</label>
                    <select
                      value={projectType}
                      onChange={(e) => setProjectType(e.target.value as ProjectType)}
                    >
                      <option value="">Select type…</option>
                      {PROJECT_TYPES.map((pt) => (
                        <option key={pt.value} value={pt.value}>{pt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">Project Name</label>
                    <input
                      type="text"
                      placeholder="24hr Fitness Ventura"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Drop zone */}
                <div>
                  <div className="section-label">Plan Files *</div>
                  <div
                    className={`drop-zone${isDragging ? " active" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                  >
                    <span className="dz-icon">📐</span>
                    <div className="dz-main">
                      Drag PDFs here or <span>browse files</span>
                    </div>
                    <div className="dz-sub">Up to 8 files · 150MB combined</div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf"
                      multiple
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />
                  </div>

                  {taggedFiles.length > 0 && (
                    <>
                      <div className="file-list">
                        {taggedFiles.map((tf) => (
                          <div key={tf.id} className="file-row">
                            <span className="file-icon">📄</span>
                            <span className="file-name">{tf.file.name}</span>
                            <span className="file-size">
                              {(tf.file.size / 1024 / 1024).toFixed(1)}MB
                            </span>
                            <select
                              className="file-tag"
                              value={tf.tag}
                              onChange={(e) => updateTag(tf.id, e.target.value as FileTag)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {FILE_TAGS.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <button
                              className="file-remove"
                              onClick={(e) => { e.stopPropagation(); removeFile(tf.id); }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="size-track">
                        <div
                          className={`size-fill${totalMB > 150 ? " over" : ""}`}
                          style={{ width: `${Math.min((totalMB / 150) * 100, 100)}%` }}
                        />
                      </div>
                      <div className="size-label">
                        {totalMB.toFixed(1)} / 150 MB used
                      </div>
                    </>
                  )}
                </div>

                {/* What to upload tip */}
                <div className="upload-tip">
                  <div className="tip-section-label">What to upload</div>
                  <div className="tip-row good">
                    <span className="tip-mark">✓</span>
                    <div>
                      <span className="tip-title">Architectural (A-) and Interior Design (ID-) sheets</span>
                      <span className="tip-body">Interior elevations, casework plans, millwork details — this is where the scope lives.</span>
                    </div>
                  </div>
                  <div className="tip-row bad">
                    <span className="tip-mark">✕</span>
                    <div>
                      <span className="tip-title">Skip structural, MEP, civil, and site sheets</span>
                      <span className="tip-body">These don't contain millwork scope and will slow down your results.</span>
                    </div>
                  </div>
                </div>

              </div>{/* /up-body */}

              <div className="up-foot">
                <button
                  className="btn-primary"
                  disabled={!isValid}
                  onClick={handleSubmit}
                >
                  Extract Scope &amp; Email Results →
                </button>
                <div className="submit-note">
                  // RESULTS IN ~2–5 MIN · NO ACCOUNT NEEDED · NO SPAM
                </div>
              </div>
            </>
          )}

          {/* ── UPLOADING STATE ── */}
          {state === "uploading" && (
            <div className="state-panel">
              <div className="spinner" />
              <div className="state-title">Uploading…</div>
              <div className="prog-wrap">
                <div className="prog-track">
                  <div className="prog-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="prog-label">{progressLabel}</div>
              </div>
              <div className="state-sub">Hang tight — transferring your files securely.</div>
            </div>
          )}

          {/* ── PROCESSING STATE ── */}
          {state === "processing" && (
            <div className="state-panel">
              <div className="spinner" />
              <div className="state-title">Extracting Scope…</div>
              <div className="prog-wrap">
                <div className="prog-track">
                  <div className="prog-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="prog-label">{progressLabel}</div>
              </div>
              <div className="state-sub">
                The extraction pipeline is grouping rooms, identifying millwork items, and building your WBS. This typically takes 2–5 minutes for a full plan set.
              </div>
            </div>
          )}

          {/* ── DONE STATE ── */}
          {state === "done" && (
            <div className="state-panel">
              <div style={{ fontSize: "36px" }}>✓</div>
              <div className="state-title">You're in the queue.</div>
              <div className="done-email-badge">
                📬 Results → {submittedEmail}
              </div>
              <div className="state-sub">
                Your Excel workbook will arrive in <strong>2–5 minutes</strong>. Check your spam folder if it doesn't show up.
              </div>
              <div className="done-list">
                {[
                  "All millwork items extracted by room",
                  "WBS summary with trade hierarchy",
                  "Bid checklist — blocking, hardware, ADA, finish",
                  "RFI log — missing scope, dims, materials",
                ].map((item) => (
                  <div key={item} className="done-item">
                    <div className="done-check">✓</div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <button
                className="btn-secondary"
                onClick={() => {
                  setTaggedFiles([]);
                  setEmail("");
                  setCompany("");
                  setProjectType("");
                  setProjectName("");
                  setProgress(0);
                  setState("form");
                }}
              >
                Upload another project
              </button>
            </div>
          )}

          {/* ── ERROR STATE ── */}
          {state === "error" && (
            <div className="state-panel">
              <div style={{ fontSize: "32px" }}>⚠</div>
              <div className="state-title">Something went wrong.</div>
              <div className="error-box">// {errorMsg}</div>
              <div className="state-sub">
                Your files were not processed. Please try again or email{" "}
                <strong>gary@projmgt.ai</strong> if the problem persists.
              </div>
              <button
                className="btn-secondary"
                onClick={() => { setProgress(0); setState("form"); }}
              >
                ← Try again
              </button>
            </div>
          )}

        </div>{/* /up-card */}
      </div>
    </>
  );
}
