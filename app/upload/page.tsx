"use client";

import { useState, useRef } from "react";

type ProjectType = "fitness" | "hospitality" | "office" | "retail" | "healthcare" | "education" | "other";
type FormState = "form" | "submitting" | "done" | "error";

const PROJECT_TYPES = [
  { value: "fitness", label: "Fitness / Recreation" },
  { value: "hospitality", label: "Hospitality / Restaurant" },
  { value: "office", label: "Office / Corporate" },
  { value: "retail", label: "Retail / Commercial" },
  { value: "healthcare", label: "Healthcare / Medical" },
  { value: "education", label: "Education / Institutional" },
  { value: "other", label: "Other" },
];

export default function UploadPage() {
  const [state, setState] = useState<FormState>("form");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [projectType, setProjectType] = useState<ProjectType | "">("");
  const [projectName, setProjectName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  const isValid = email.includes("@") && company.trim().length > 0 && projectType !== "";

  const handleSubmit = async () => {
    if (!isValid) return;
    setState("submitting");
    setSubmittedEmail(email);
    try {
      const res = await fetch("/api/process-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company, project_type: projectType, project_name: projectName || company + " Project", files: [] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Server error " + res.status);
      }
      setState("done");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0b0d14;}
        .up-page{min-height:100vh;background:#0b0d14;font-family:'Barlow',sans-serif;color:#f0ede8;display:flex;flex-direction:column;align-items:center;padding:0 20px 80px;}
        .up-nav{width:100%;max-width:680px;padding:28px 0 0;display:flex;align-items:center;justify-content:space-between;margin-bottom:44px;}
        .up-logo{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;color:#f0ede8;letter-spacing:0.06em;text-decoration:none;}
        .up-logo span{color:#c8922a;}
        .up-back{font-family:'Space Mono',monospace;font-size:11px;color:#8a90a0;text-decoration:none;letter-spacing:0.08em;transition:color 0.15s;}
        .up-back:hover{color:#c8922a;}
        .up-card{width:100%;max-width:600px;background:#0f1117;border:1px solid #1e2130;border-radius:4px;position:relative;overflow:hidden;}
        .up-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#7a5010,#c8922a,#e8b84b,#c8922a,#7a5010);}
        .up-head{padding:36px 40px 28px;border-bottom:1px solid #1e2130;}
        .up-eyebrow{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.2em;color:#c8922a;text-transform:uppercase;margin-bottom:10px;}
        .up-title{font-family:'Barlow Condensed',sans-serif;font-size:38px;font-weight:800;line-height:1.05;color:#f0ede8;margin-bottom:10px;}
        .up-title em{font-style:normal;color:#c8922a;}
        .up-sub{font-size:14px;color:#9098a8;line-height:1.6;}
        .up-body{padding:32px 40px;display:flex;flex-direction:column;gap:20px;}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        .field{display:flex;flex-direction:column;gap:6px;}
        .field-label{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.12em;color:#8a90a0;text-transform:uppercase;}
        .field input,.field select{background:#1a1d27;border:1px solid #353848;border-radius:3px;padding:11px 14px;font-family:'Barlow',sans-serif;font-size:14px;color:#f0ede8;outline:none;transition:border-color 0.15s;width:100%;-webkit-appearance:none;appearance:none;}
        .field input::placeholder{color:#6a7080;}
        .field input:focus,.field select:focus{border-color:#c8922a;}
        .field select option{background:#1a1d27;}
        .upload-tip{border-top:1px solid #1a1d27;padding-top:16px;display:flex;flex-direction:column;gap:7px;}
        .tip-label{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.15em;color:#8a90a0;text-transform:uppercase;margin-bottom:2px;}
        .tip-row{display:flex;align-items:flex-start;gap:10px;border-radius:3px;padding:10px 12px;}
        .tip-row.good{background:#0d1f14;border:1px solid #1a3a22;}
        .tip-row.bad{background:#1f0d0d;border:1px solid #3a1a1a;}
        .tip-mark{font-size:13px;flex-shrink:0;margin-top:1px;}
        .tip-row.good .tip-mark{color:#4caf7d;}
        .tip-row.bad .tip-mark{color:#e05555;}
        .tip-title{font-weight:600;display:block;margin-bottom:1px;font-size:13px;}
        .tip-row.good .tip-title{color:#4caf7d;}
        .tip-row.bad .tip-title{color:#e05555;}
        .tip-body{color:#7a8090;font-size:12px;line-height:1.5;}
        .up-foot{padding:0 40px 36px;display:flex;flex-direction:column;gap:12px;}
        .btn-primary{background:#c8922a;color:#0b0d14;border:none;border-radius:3px;padding:16px 28px;font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;letter-spacing:0.05em;cursor:pointer;transition:background 0.15s,transform 0.1s;width:100%;}
        .btn-primary:hover:not(:disabled){background:#e8a83a;transform:translateY(-1px);}
        .btn-primary:disabled{opacity:0.35;cursor:not-allowed;transform:none;}
        .submit-note{font-family:'Space Mono',monospace;font-size:10px;color:#6a7080;text-align:center;line-height:1.8;letter-spacing:0.04em;}
        .state-panel{padding:64px 40px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px;}
        .state-title{font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:700;color:#f0ede8;}
        .state-sub{font-size:14px;color:#9098a8;line-height:1.7;max-width:400px;}
        .state-sub strong{color:#c8922a;font-weight:600;}
        .email-badge{background:#1a1d27;border:1px solid #2a2d3a;border-radius:3px;padding:10px 16px;font-family:'Space Mono',monospace;font-size:12px;color:#c8922a;text-align:center;width:100%;max-width:380px;}
        .btn-cta{display:inline-block;background:#c8922a;color:#0b0d14;text-decoration:none;border:none;border-radius:3px;padding:14px 28px;font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:700;letter-spacing:0.05em;cursor:pointer;transition:background 0.15s;margin-top:4px;}
        .btn-cta:hover{background:#e8a83a;}
        .btn-secondary{background:none;border:1px solid #2a2d3a;border-radius:3px;padding:11px 22px;font-family:'Barlow',sans-serif;font-size:14px;color:#7a8090;cursor:pointer;transition:border-color 0.15s,color 0.15s;}
        .btn-secondary:hover{border-color:#c8922a;color:#c8922a;}
        .error-box{background:#1f0d0d;border:1px solid #3a1a1a;border-radius:3px;padding:14px 16px;font-family:'Space Mono',monospace;font-size:11px;color:#e05555;line-height:1.6;max-width:400px;width:100%;text-align:left;}
        @keyframes spin{to{transform:rotate(360deg);}}
        .spinner{width:28px;height:28px;border:2px solid #1e2130;border-top-color:#c8922a;border-radius:50%;animation:spin 0.8s linear infinite;}
        @media(max-width:520px){.up-head,.up-body,.up-foot{padding-left:22px;padding-right:22px;}.field-row{grid-template-columns:1fr;}.up-title{font-size:30px;}.state-panel{padding:48px 22px;}}
      `}</style>

      <div className="up-page">
        <nav className="up-nav">
          <a href="/" className="up-logo">ProjMgt<span>.AI</span></a>
          <a href="/" className="up-back">Back to home</a>
        </nav>

        <div className="up-card">

          {state === "form" && (<>
            <div className="up-head">
              <div className="up-eyebrow">// Free extraction - No account required</div>
              <div className="up-title">Get Your<br /><em>Scope Extract.</em></div>
              <div className="up-sub">Tell us about your project and we'll send you a link to run your millwork extraction â€” cabinets, countertops, shelving, hardware â€” delivered as a structured Excel workbook.</div>
            </div>

            <div className="up-body">
              <div className="field-row">
                <div className="field"><label className="field-label">Email *</label><input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="field"><label className="field-label">Company *</label><input type="text" placeholder="Acme Millwork Co." value={company} onChange={(e) => setCompany(e.target.value)} /></div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Project Type *</label>
                  <select value={projectType} onChange={(e) => setProjectType(e.target.value as ProjectType)}>
                    <option value="">Select type...</option>
                    {PROJECT_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                  </select>
                </div>
                <div className="field"><label className="field-label">Project Name</label><input type="text" placeholder="24hr Fitness Ventura" value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
              </div>

              <div className="upload-tip">
                <div className="tip-label">What to upload</div>
                <div className="tip-row good"><span className="tip-mark">+</span><div><span className="tip-title">Architectural (A-) and Interior Design (ID-) sheets</span><span className="tip-body">Interior elevations, casework plans, millwork details.</span></div></div>
                <div className="tip-row bad"><span className="tip-mark">-</span><div><span className="tip-title">Skip structural, MEP, civil, and site sheets</span><span className="tip-body">These don't contain millwork scope and will slow down results.</span></div></div>
              </div>
            </div>

            <div className="up-foot">
              <button className="btn-primary" disabled={!isValid} onClick={handleSubmit}>Send Me the Extraction Link</button>
              <div className="submit-note">// NO ACCOUNT NEEDED - NO SPAM - UNSUBSCRIBE ANYTIME</div>
            </div>
          </>)}

          {state === "submitting" && (
            <div className="state-panel">
              <div className="spinner" />
              <div className="state-title">Sending...</div>
            </div>
          )}

          {state === "done" && (
            <div className="state-panel">
              <div style={{ fontSize:"36px" }}>âœ“</div>
              <div className="state-title">Check your inbox.</div>
              <div className="email-badge">Email sent to: {submittedEmail}</div>
              <div className="state-sub">We sent you a link to run your extraction. Ready to go right now? Click below.</div>
              <a href="https://www.projmgt.ai/scope-extractor" className="btn-cta">Run Extraction Now</a>
              <button className="btn-secondary" onClick={() => { setEmail(""); setCompany(""); setProjectType(""); setProjectName(""); setState("form"); }}>Submit another project</button>
            </div>
          )}

          {state === "error" && (
            <div className="state-panel">
              <div style={{ fontSize:"32px" }}>!</div>
              <div className="state-title">Something went wrong.</div>
              <div className="error-box">// {errorMsg}</div>
              <div className="state-sub">Please try again or email gary@projmgt.ai</div>
              <button className="btn-secondary" onClick={() => setState("form")}>Try again</button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
