// pages/pricing.tsx  v14.9.37
// Three tiers: Solo $49/mo, Small Shop $99/mo, Enterprise custom
// Annual toggle (20% off), feature comparison table, FAQ

import React, { useState } from "react";
import Head from "next/head";
import Link from "next/link";

const TIERS = [
  {
    name: "Solo",
    desc: "For independent estimators doing their own takeoffs.",
    monthly: 49,
    annual: 39,
    cta: "Start Free Trial",
    href: "/scope-extractor",
    highlight: false,
    features: [
      "25 extractions / month",
      "Single PDF upload",
      "6-tab Excel workbook",
      "WBS + RFI + Bid Checklist",
      "AWI 300 Parts List",
      "Email delivery",
      "—",
      "—",
    ],
  },
  {
    name: "Small Shop",
    desc: "For millwork shops bidding multiple projects per week.",
    monthly: 99,
    annual: 79,
    cta: "Start Free Trial",
    href: "/scope-extractor",
    highlight: true,
    badge: "Most Popular",
    features: [
      "Unlimited extractions",
      "Multi-PDF upload (plans + specs + addenda)",
      "6-tab Excel workbook",
      "WBS + RFI + Bid Checklist",
      "AWI 300 Parts List",
      "Email delivery",
      "Revision diff (addenda vs bid set)",
      "—",
    ],
  },
  {
    name: "Enterprise",
    desc: "For multi-estimator shops, GCs, or platform integrations.",
    monthly: null,
    annual: null,
    cta: "Contact Us",
    href: "mailto:gary@projmgt.ai",
    highlight: false,
    features: [
      "Unlimited extractions",
      "Multi-PDF upload",
      "6-tab Excel workbook",
      "WBS + RFI + Bid Checklist",
      "AWI 300 Parts List",
      "Email delivery",
      "Revision diff",
      "API access + custom integration",
    ],
  },
];

const COMPARISON = [
  { feature: "Extractions per month", solo: "25", shop: "Unlimited", enterprise: "Unlimited" },
  { feature: "Multi-PDF upload", solo: "—", shop: "✓", enterprise: "✓" },
  { feature: "All Items tab", solo: "✓", shop: "✓", enterprise: "✓" },
  { feature: "WBS Summary", solo: "✓", shop: "✓", enterprise: "✓" },
  { feature: "Bid Checklist", solo: "✓", shop: "✓", enterprise: "✓" },
  { feature: "RFI Log", solo: "✓", shop: "✓", enterprise: "✓" },
  { feature: "AWI 300 Parts List", solo: "✓", shop: "✓", enterprise: "✓" },
  { feature: "Revision diff (addenda)", solo: "—", shop: "✓", enterprise: "✓" },
  { feature: "API access", solo: "—", shop: "—", enterprise: "✓" },
  { feature: "Custom integrations", solo: "—", shop: "—", enterprise: "✓" },
  { feature: "Priority support", solo: "—", shop: "Email", enterprise: "Dedicated" },
];

const FAQ = [
  {
    q: "What file types does ProjMgtAI accept?",
    a: "PDF only — architectural bid sets, shop drawings, addenda, and spec books. Multi-page PDFs up to 150 MB per file. Multiple files can be uploaded together and tagged by type.",
  },
  {
    q: "How accurate is the extraction?",
    a: "Against validated NCC ground-truth projects, extraction hits ~94% item coverage. Accuracy improves with plan quality — fully-dimensioned casework sheets outperform floor-plan-only sets. RFIs flag anything the AI is uncertain about.",
  },
  {
    q: "What does 'extraction' count as?",
    a: "One extraction = one project run (one or more PDFs processed together). Re-running the same project or running addenda counts as a new extraction.",
  },
  {
    q: "What is the AWI 300 Parts List?",
    a: "Every cabinet line item in your scope is exploded into its component parts — sides, bottom, back, face frame, doors, drawers — with net dimensions (L×W×T in inches) and material codes. Built to AWI Series 300 custom construction standards.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Monthly plans cancel at end of the current billing period. Annual plans are non-refundable but can be cancelled before renewal.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — the scope extractor is free to try with no credit card required. Paid plans unlock higher extraction limits and advanced features.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <Head>
        <title>Pricing — ProjMgtAI</title>
        <meta name="description" content="Simple, transparent pricing for millwork estimators. From $39/month." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #FAFAF8; color: #0F0F0E; font-family: 'DM Sans', sans-serif; }

        .nav { display: flex; align-items: center; justify-content: space-between; padding: 0 48px; height: 64px; border-bottom: 1px solid #E8E6E1; background: #FAFAF8; }
        .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #0F0F0E; }
        .nav-mark { width: 28px; height: 28px; background: #0F0F0E; border-radius: 5px; display: flex; align-items: center; justify-content: center; }
        .nav-mark span { color: #FAFAF8; font-size: 13px; font-weight: 600; font-family: 'DM Mono', monospace; }
        .nav-links { display: flex; align-items: center; gap: 32px; }
        .nav-link { font-size: 14px; color: #6B6860; text-decoration: none; }
        .nav-cta { font-size: 13px; font-weight: 500; padding: 8px 18px; background: #0F0F0E; color: #FAFAF8; border-radius: 6px; text-decoration: none; }

        .hero { text-align: center; padding: 80px 48px 56px; max-width: 700px; margin: 0 auto; }
        .eyebrow { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #B8860B; margin-bottom: 20px; }
        .hero-title { font-size: clamp(32px, 4vw, 52px); font-weight: 300; letter-spacing: -0.025em; margin-bottom: 16px; }
        .hero-title strong { font-weight: 600; }
        .hero-sub { font-size: 16px; color: #5A5850; line-height: 1.7; margin-bottom: 36px; }

        .toggle-wrap { display: inline-flex; align-items: center; gap: 12px; background: #F0EEE9; border-radius: 8px; padding: 4px; margin-bottom: 56px; }
        .toggle-opt { padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; font-family: 'DM Sans', sans-serif; transition: all .15s; }
        .toggle-opt.active { background: #0F0F0E; color: #FAFAF8; }
        .toggle-opt.inactive { background: transparent; color: #6B6860; }
        .save-badge { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: .08em; color: #B8860B; background: #B8860B0F; border: 1px solid #B8860B22; padding: 3px 8px; border-radius: 4px; }

        .tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #E8E6E1; border: 1px solid #E8E6E1; border-radius: 12px; overflow: hidden; max-width: 960px; margin: 0 auto 80px; }
        .tier { background: #FAFAF8; padding: 36px 32px; position: relative; }
        .tier.highlighted { background: #0F0F0E; color: #FAFAF8; }
        .tier-badge { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #B8860B; background: #B8860B15; border: 1px solid #B8860B30; padding: 4px 10px; border-radius: 4px; display: inline-block; margin-bottom: 16px; }
        .tier-name { font-size: 20px; font-weight: 600; margin-bottom: 6px; }
        .tier-desc { font-size: 13px; line-height: 1.6; margin-bottom: 28px; }
        .tier.highlighted .tier-desc { color: #8A8880; }
        .tier:not(.highlighted) .tier-desc { color: #5A5850; }
        .tier-price { margin-bottom: 28px; }
        .tier-amount { font-size: 44px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
        .tier-period { font-size: 13px; margin-left: 4px; }
        .tier.highlighted .tier-period { color: #8A8880; }
        .tier:not(.highlighted) .tier-period { color: #8A8880; }
        .tier-custom { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
        .tier-savings { font-family: 'DM Mono', monospace; font-size: 11px; color: #B8860B; margin-top: 4px; height: 16px; }
        .tier-cta { display: block; width: 100%; padding: 12px; text-align: center; font-size: 14px; font-weight: 500; font-family: 'DM Sans', sans-serif; border-radius: 7px; text-decoration: none; margin-bottom: 28px; transition: opacity .15s; cursor: pointer; border: none; }
        .tier-cta.dark { background: #FAFAF8; color: #0F0F0E; }
        .tier-cta.dark:hover { opacity: 0.9; }
        .tier-cta.light { background: #0F0F0E; color: #FAFAF8; }
        .tier-cta.light:hover { opacity: 0.85; }
        .tier-cta.outline { background: transparent; color: #0F0F0E; border: 1px solid #D4D2CC; }
        .tier-cta.outline:hover { border-color: #0F0F0E; }
        .tier-divider { border: none; border-top: 1px solid #E8E6E1; margin-bottom: 24px; }
        .tier.highlighted .tier-divider { border-top-color: #1E1E1C; }
        .tier-features { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .tier-feature { font-size: 13px; display: flex; align-items: flex-start; gap: 10px; line-height: 1.4; }
        .tier-feature-check { color: #B8860B; flex-shrink: 0; font-size: 14px; margin-top: 1px; }
        .tier-feature-dash { color: #5A5850; flex-shrink: 0; }
        .tier.highlighted .tier-feature-dash { color: #3A3A38; }
        .tier.highlighted .tier-feature { color: #C8C6C0; }

        .comparison { max-width: 960px; margin: 0 auto 80px; padding: 0 48px; }
        .comp-title { font-size: 22px; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 24px; }
        .comp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .comp-table th { text-align: left; padding: 12px 16px; font-weight: 600; font-size: 13px; border-bottom: 2px solid #E8E6E1; }
        .comp-table th:not(:first-child) { text-align: center; }
        .comp-table td { padding: 12px 16px; border-bottom: 1px solid #F0EEE9; color: #0F0F0E; }
        .comp-table td:not(:first-child) { text-align: center; }
        .comp-table tr:hover td { background: #F5F3EE; }
        .comp-table .check { color: #B8860B; font-size: 14px; }
        .comp-table .dash { color: #C8C6C0; }
        .comp-highlight-col { background: #F0EEE90A; font-weight: 500; }

        .faq { max-width: 700px; margin: 0 auto 80px; padding: 0 48px; }
        .faq-title { font-size: 22px; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 24px; }
        .faq-item { border-bottom: 1px solid #E8E6E1; }
        .faq-q { width: 100%; text-align: left; padding: 20px 0; font-size: 15px; font-weight: 500; background: none; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; color: #0F0F0E; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
        .faq-q:hover { color: #B8860B; }
        .faq-icon { flex-shrink: 0; font-size: 18px; color: #B8860B; font-weight: 300; transition: transform .2s; }
        .faq-a { font-size: 14px; line-height: 1.7; color: #5A5850; padding-bottom: 20px; }

        .bottom-cta { background: #0F0F0E; color: #FAFAF8; }
        .bottom-inner { max-width: 700px; margin: 0 auto; padding: 80px 48px; text-align: center; }
        .bottom-title { font-size: clamp(28px, 3vw, 40px); font-weight: 300; letter-spacing: -0.02em; margin-bottom: 12px; }
        .bottom-title strong { font-weight: 600; }
        .bottom-sub { font-size: 15px; color: #8A8880; margin-bottom: 36px; line-height: 1.6; }
        .bottom-actions { display: flex; align-items: center; justify-content: center; gap: 12px; }
        .btn-white { padding: 12px 24px; background: #FAFAF8; color: #0F0F0E; font-size: 14px; font-weight: 500; font-family: 'DM Sans', sans-serif; border-radius: 7px; text-decoration: none; display: inline-block; }
        .btn-ghost { padding: 12px 24px; background: transparent; color: #8A8880; font-size: 14px; font-family: 'DM Sans', sans-serif; border: 1px solid #2A2A28; border-radius: 7px; text-decoration: none; display: inline-block; }
        .btn-ghost:hover { color: #FAFAF8; border-color: #FAFAF8; }

        .footer { border-top: 1px solid #E8E6E1; padding: 28px 48px; display: flex; align-items: center; justify-content: space-between; background: #FAFAF8; }
        .footer-left { font-family: 'DM Mono', monospace; font-size: 11px; color: #A8A69E; }
        .footer-links { display: flex; gap: 20px; }
        .footer-link { font-size: 13px; color: #A8A69E; text-decoration: none; }
        .footer-link:hover { color: #0F0F0E; }

        @media (max-width: 768px) {
          .nav { padding: 0 20px; }
          .hero { padding: 56px 20px 40px; }
          .tiers { grid-template-columns: 1fr; }
          .comparison, .faq { padding: 0 20px; }
          .bottom-inner { padding: 56px 20px; }
          .footer { padding: 24px 20px; flex-direction: column; gap: 12px; }
        }
      `}</style>

      {/* Nav */}
      <nav className="nav">
        <Link href="/" className="nav-logo">
          <div className="nav-mark"><span>P</span></div>
          <span style={{ fontSize: 15, fontWeight: 600 }}>ProjMgtAI</span>
        </Link>
        <div className="nav-links">
          <Link href="/pricing" className="nav-link" style={{ color: "#0F0F0E", fontWeight: 500 }}>Pricing</Link>
          <Link href="/scope-extractor" className="nav-link">Extractor</Link>
          <Link href="/scope-extractor" className="nav-cta">Try Free</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="hero">
        <div className="eyebrow">Pricing</div>
        <h1 className="hero-title">Simple pricing.<br /><strong>No surprises.</strong></h1>
        <p className="hero-sub">
          Start free, upgrade when you need more volume. Built for millwork estimators
          who bid 5 to 50 projects a month.
        </p>

        {/* Annual toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 56 }}>
          <div className="toggle-wrap">
            <button className={`toggle-opt ${!annual ? "active" : "inactive"}`} onClick={() => setAnnual(false)}>Monthly</button>
            <button className={`toggle-opt ${annual ? "active" : "inactive"}`} onClick={() => setAnnual(true)}>Annual</button>
          </div>
          {annual && <span className="save-badge">SAVE 20%</span>}
        </div>
      </div>

      {/* Tier cards */}
      <div style={{ padding: "0 48px" }}>
        <div className="tiers">
          {TIERS.map(tier => {
            const price = annual ? tier.annual : tier.monthly;
            const savings = tier.monthly && tier.annual ? (tier.monthly - tier.annual) * 12 : null;
            return (
              <div key={tier.name} className={`tier ${tier.highlight ? "highlighted" : ""}`}>
                {tier.badge && <div className="tier-badge">{tier.badge}</div>}
                <div className="tier-name">{tier.name}</div>
                <div className="tier-desc">{tier.desc}</div>
                <div className="tier-price">
                  {price !== null ? (
                    <>
                      <span className="tier-amount">${price}</span>
                      <span className="tier-period">/mo</span>
                      <div className="tier-savings">
                        {annual && savings ? `Save $${savings}/yr` : "\u00a0"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="tier-custom">Custom</div>
                      <div className="tier-savings">&nbsp;</div>
                    </>
                  )}
                </div>
                <a
                  href={tier.href}
                  className={`tier-cta ${tier.highlight ? "dark" : tier.name === "Enterprise" ? "outline" : "light"}`}
                >
                  {tier.cta}
                </a>
                <hr className="tier-divider" />
                <ul className="tier-features">
                  {tier.features.map((f, i) => (
                    <li key={i} className="tier-feature">
                      {f === "—" ? (
                        <span className="tier-feature-dash">—</span>
                      ) : (
                        <span className="tier-feature-check">✓</span>
                      )}
                      <span>{f === "—" ? "Not included" : f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison table */}
      <div className="comparison">
        <div className="comp-title">Full feature comparison</div>
        <table className="comp-table">
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Feature</th>
              <th>Solo</th>
              <th style={{ background: "#F5F3EE" }}>Small Shop</th>
              <th>Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map(row => (
              <tr key={row.feature}>
                <td style={{ color: "#5A5850" }}>{row.feature}</td>
                {[row.solo, row.shop, row.enterprise].map((val, i) => (
                  <td key={i} className={i === 1 ? "comp-highlight-col" : ""}>
                    {val === "✓" ? <span className="check">✓</span>
                     : val === "—" ? <span className="dash">—</span>
                     : val}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FAQ */}
      <div className="faq">
        <div className="faq-title">Frequently asked</div>
        {FAQ.map((item, i) => (
          <div key={i} className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              {item.q}
              <span className="faq-icon" style={{ transform: openFaq === i ? "rotate(45deg)" : "none" }}>+</span>
            </button>
            {openFaq === i && <div className="faq-a">{item.a}</div>}
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="bottom-cta">
        <div className="bottom-inner">
          <h2 className="bottom-title">Try it on a real project.<br /><strong>No card required.</strong></h2>
          <p className="bottom-sub">
            Upload any architectural PDF and get a full six-tab Excel workbook back in under 3 minutes.
            See exactly what ProjMgtAI extracts before you pay anything.
          </p>
          <div className="bottom-actions">
            <Link href="/scope-extractor" className="btn-white">Start Free Extraction →</Link>
            <a href="mailto:gary@projmgt.ai" className="btn-ghost">Talk to Gary</a>
          </div>
        </div>
      </div>

      <footer className="footer">
        <div className="footer-left">PROJMGTAI &nbsp;·&nbsp; CENTRIV AI &nbsp;·&nbsp; FULLERTON CA</div>
        <div className="footer-links">
          <Link href="/" className="footer-link">Home</Link>
          <Link href="/scope-extractor" className="footer-link">Extractor</Link>
          <a href="mailto:gary@projmgt.ai" className="footer-link">Contact</a>
        </div>
      </footer>
    </>
  );
}
