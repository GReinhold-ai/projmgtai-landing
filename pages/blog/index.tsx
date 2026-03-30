// pages/blog/index.tsx
// ProjMgtAI Blog — SEO landing hub
import Head from "next/head";
import Link from "next/link";

const posts = [
  {
    slug: "missing-scope-construction",
    title: "Why Construction Bids Miss Scope (And How to Catch It)",
    excerpt: "Most construction bids don't fail because of pricing. They fail because of missing scope. Here's where it hides — and how to find it before bid day.",
    date: "March 2026",
  },
  {
    slug: "rfi-examples-construction",
    title: "Top RFIs That Should Be Caught Before Bidding",
    excerpt: "RFIs are supposed to clarify details. But most exist because something was missing in the drawings. These are the ones that should never reach the field.",
    date: "March 2026",
  },
  {
    slug: "millwork-estimating-checklist",
    title: "Millwork Estimating Checklist: What Experienced Estimators Check Before Submitting",
    excerpt: "A complete pre-bid checklist for millwork contractors — hardware, blocking, ADA, dimensions, material specs, and scope exclusions. Print it. Use it every time.",
    date: "March 2026",
  },
];

export default function BlogIndex() {
  return (
    <>
      <Head>
        <title>ProjMgtAI Insights — Millwork Estimating, RFIs, and Construction Scope</title>
        <meta name="description" content="Practical guides for millwork contractors and estimators. Catch missing scope, reduce RFIs, and build better bids from architectural plan sets." />
        <meta property="og:title" content="ProjMgtAI Insights" />
        <meta property="og:description" content="Practical guides for millwork contractors and estimators." />
        <link rel="canonical" href="https://projmgt.ai/blog" />
      </Head>
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "60px 24px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1e293b" }}>
        <a href="/" style={{ fontSize: 13, color: "#64748b", textDecoration: "none", display: "inline-block", marginBottom: 40 }}>← projmgt.ai</a>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, lineHeight: 1.2 }}>ProjMgtAI Insights</h1>
        <p style={{ fontSize: 17, color: "#64748b", marginBottom: 48, lineHeight: 1.6 }}>
          Practical guides for millwork contractors, estimators, and project managers who read plans for a living.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {posts.map(post => (
            <a key={post.slug} href={`/blog/${post.slug}`} style={{ textDecoration: "none", color: "inherit", display: "block", padding: "28px 32px", border: "1px solid #e2e8f0", borderRadius: 12, transition: "box-shadow 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{post.date}</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, lineHeight: 1.3, color: "#0f172a" }}>{post.title}</h2>
              <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.6, margin: 0 }}>{post.excerpt}</p>
              <div style={{ marginTop: 16, fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>Read more →</div>
            </a>
          ))}
        </div>
        <div style={{ marginTop: 64, padding: "32px", background: "#f0f9ff", borderRadius: 12, border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#0c4a6e" }}>Try the scope extractor free</div>
          <p style={{ fontSize: 14, color: "#0369a1", marginBottom: 16, lineHeight: 1.6 }}>
            Upload your plan set and get 130+ scope items extracted into a structured shop order in under 2 minutes.
          </p>
          <a href="/scope-extractor" style={{ display: "inline-block", padding: "12px 24px", background: "#0ea5e9", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            Open Scope Extractor →
          </a>
        </div>
      </main>
    </>
  );
}
