"use client";
// components/UploadWidget.tsx
// Embedded homepage CTA widget — email + file drop → /upload full page
// Drop this into your homepage wherever you want the "Try It" block

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export default function UploadWidget() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf"
    );
    setFiles((prev) => [...prev, ...dropped].slice(0, 5));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const picked = Array.from(e.target.files).filter(
      (f) => f.type === "application/pdf"
    );
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
  };

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = () => {
    // Pass email + files to /upload via sessionStorage for seamless handoff
    if (files.length > 0) {
      sessionStorage.setItem("prefill_email", email);
      // Files can't be passed via URL — /upload page will pick up from sessionStorage
      // For the full multi-file experience, redirect with context
      router.push(`/upload?email=${encodeURIComponent(email)}`);
    } else {
      router.push(`/upload?email=${encodeURIComponent(email)}`);
    }
  };

  const isReady = email.includes("@") && files.length > 0;

  return (
    <div className="upload-widget">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap');

        .upload-widget {
          font-family: 'Barlow', sans-serif;
          background: #0f1117;
          border: 1px solid #2a2d3a;
          border-radius: 4px;
          padding: 36px 40px 32px;
          max-width: 560px;
          position: relative;
          overflow: hidden;
        }
        .upload-widget::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #c8922a, #e8b84b, #c8922a);
        }

        .widget-eyebrow {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.18em;
          color: #c8922a;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .widget-headline {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 28px;
          font-weight: 700;
          color: #f0ede8;
          line-height: 1.1;
          margin-bottom: 6px;
        }
        .widget-sub {
          font-size: 14px;
          color: #7a8090;
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .widget-email {
          display: flex;
          gap: 0;
          margin-bottom: 16px;
        }
        .widget-email input {
          flex: 1;
          background: #1a1d27;
          border: 1px solid #2a2d3a;
          border-right: none;
          border-radius: 3px 0 0 3px;
          padding: 11px 14px;
          font-family: 'Barlow', sans-serif;
          font-size: 14px;
          color: #f0ede8;
          outline: none;
          transition: border-color 0.15s;
        }
        .widget-email input::placeholder { color: #454858; }
        .widget-email input:focus { border-color: #c8922a; }
        .widget-email-label {
          background: #1e2130;
          border: 1px solid #2a2d3a;
          border-radius: 0 3px 3px 0;
          padding: 11px 14px;
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #454858;
          letter-spacing: 0.1em;
          display: flex;
          align-items: center;
        }

        .drop-zone {
          border: 1px dashed #2a2d3a;
          border-radius: 3px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
          background: #1a1d27;
          margin-bottom: 16px;
        }
        .drop-zone.dragging {
          border-color: #c8922a;
          background: #1e1a10;
        }
        .drop-zone:hover { border-color: #3a3d4a; }
        .drop-zone-icon {
          font-size: 22px;
          margin-bottom: 6px;
          display: block;
        }
        .drop-zone-text {
          font-size: 13px;
          color: #5a6070;
        }
        .drop-zone-text span {
          color: #c8922a;
          cursor: pointer;
          text-decoration: underline;
        }

        .file-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
        }
        .file-chip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #1a1d27;
          border: 1px solid #2a2d3a;
          border-radius: 3px;
          padding: 7px 10px;
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          color: #b0b8c8;
        }
        .file-chip-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 320px;
        }
        .file-chip-remove {
          background: none;
          border: none;
          color: #454858;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0 2px;
          transition: color 0.1s;
        }
        .file-chip-remove:hover { color: #e05555; }

        .widget-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .btn-submit {
          background: #c8922a;
          color: #0f1117;
          border: none;
          border-radius: 3px;
          padding: 12px 22px;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          white-space: nowrap;
        }
        .btn-submit:hover:not(:disabled) { background: #e8a83a; transform: translateY(-1px); }
        .btn-submit:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

        .btn-full {
          background: none;
          border: 1px solid #2a2d3a;
          border-radius: 3px;
          padding: 11px 16px;
          font-family: 'Barlow', sans-serif;
          font-size: 13px;
          color: #7a8090;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .btn-full:hover { border-color: #c8922a; color: #c8922a; }

        .widget-disclaimer {
          font-size: 11px;
          color: #3a3d4a;
          margin-top: 14px;
          font-family: 'Space Mono', monospace;
          line-height: 1.6;
        }

        .upload-tip {
          margin-top: 20px;
          border-top: 1px solid #1e2130;
          padding-top: 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .upload-tip-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.15em;
          color: #454858;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .tip-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border-radius: 3px;
          padding: 10px 12px;
          font-size: 13px;
          line-height: 1.5;
        }
        .tip-row.good {
          background: #0d1f14;
          border: 1px solid #1a3a22;
        }
        .tip-row.bad {
          background: #1f0d0d;
          border: 1px solid #3a1a1a;
        }
        .tip-icon {
          font-size: 13px;
          flex-shrink: 0;
          margin-top: 1px;
          font-style: normal;
        }
        .tip-row.good .tip-icon { color: #4caf7d; }
        .tip-row.bad  .tip-icon { color: #e05555; }
        .tip-title {
          font-weight: 600;
          display: block;
          margin-bottom: 1px;
        }
        .tip-row.good .tip-title { color: #4caf7d; }
        .tip-row.bad  .tip-title { color: #e05555; }
        .tip-body { color: #5a6070; font-size: 12px; }
      `}</style>

      <div className="widget-eyebrow">// Free extraction · No account required</div>
      <div className="widget-headline">Drop Your Plan Set.<br />Get a Bid-Ready Workbook.</div>
      <div className="widget-sub">
        Upload millwork PDFs. Get a structured Excel scope extract in your inbox — items, rooms, RFIs, WBS — in minutes.
      </div>

      <div className="widget-email">
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && isReady && handleSubmit()}
        />
        <div className="widget-email-label">EMAIL</div>
      </div>

      <div
        className={`drop-zone ${isDragging ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <span className="drop-zone-icon">📐</span>
        <div className="drop-zone-text">
          Drag PDFs here or <span>browse files</span>
          <br />
          <span style={{ color: "#3a3d4a", textDecoration: "none" }}>
            Plan sets, specs, addenda — up to 5 files, 150MB total
          </span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      {files.length > 0 && (
        <div className="file-list">
          {files.map((f, i) => (
            <div key={i} className="file-chip">
              <span className="file-chip-name">📄 {f.name}</span>
              <button
                className="file-chip-remove"
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="widget-actions">
        <button
          className="btn-submit"
          disabled={!email.includes("@")}
          onClick={handleSubmit}
        >
          Extract Scope →
        </button>
        <button
          className="btn-full"
          onClick={() => router.push("/upload")}
        >
          Full upload options
        </button>
      </div>

      <div className="widget-disclaimer">
        // Results delivered by email · No spam · Unsubscribe anytime
      </div>

      <div className="upload-tip">
        <div className="upload-tip-label">What to upload</div>
        <div className="tip-row good">
          <span className="tip-icon">✓</span>
          <div>
            <span className="tip-title">Architectural (A-) and Interior Design (ID-) sheets</span>
            <span className="tip-body">Interior elevations, casework plans, millwork details — this is where the scope lives.</span>
          </div>
        </div>
        <div className="tip-row bad">
          <span className="tip-icon">✕</span>
          <div>
            <span className="tip-title">Skip structural, MEP, civil, and site sheets</span>
            <span className="tip-body">These don't contain millwork scope and will slow down your results.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
