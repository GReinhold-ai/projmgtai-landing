// src/pages/pricing/index.tsx
import * as React from "react";

type PlanKey = "pro-monthly" | "pro-year";

export default function PricingPage() {
  const [loading, setLoading] = React.useState<PlanKey | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function startCheckout(plan: PlanKey, trialDays?: number) {
    try {
      setError(null);
      setLoading(plan);

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, trialDays }),
      });

      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || `Checkout failed (${res.status})`);
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#073842",
        color: "#fff",
        padding: "40px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          display: "grid",
          gap: 24,
        }}
      >
        <header style={{ textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800 }}>
            ProjMgtAI Membership
          </h1>
          <p style={{ opacity: 0.8, marginTop: 8 }}>
            Get access to Millwork WBS parsing, XLSX export, and upcoming estimator tools.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          <PlanCard
            title="Pro — Monthly"
            price="$49 / mo"
            features={[
              "WBS upload & XLSX export",
              "Bid reconciliation tools",
              "Basic support",
            ]}
            onClick={() => startCheckout("pro-monthly")}
            loading={loading === "pro-monthly"}
          />

          <PlanCard
            title="Pro — Yearly"
            price="$490 / yr"
            badge="2 months free"
            features={[
              "Everything in Monthly",
              "Priority support",
              "Early feature access",
            ]}
            onClick={() => startCheckout("pro-year")}
            loading={loading === "pro-year"}
            highlight
          />
        </section>

        {error && (
          <div
            style={{
              background: "rgba(255,0,0,0.12)",
              border: "1px solid rgba(255,0,0,0.3)",
              padding: 12,
              borderRadius: 12,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

function PlanCard({
  title,
  price,
  badge,
  features,
  onClick,
  loading,
  highlight,
}: {
  title: string;
  price: string;
  badge?: string;
  features: string[];
  onClick: () => void;
  loading?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? "rgba(21,197,193,0.1)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${highlight ? "rgba(21,197,193,0.4)" : "rgba(255,255,255,0.18)"}`,
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
        {badge && (
          <span
            style={{
              alignSelf: "start",
              background: "rgba(255,145,81,0.2)",
              border: "1px solid rgba(255,145,81,0.5)",
              color: "#FF9151",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{price}</div>

      <ul style={{ marginTop: 12, paddingLeft: 18, opacity: 0.9 }}>
        {features.map((f) => (
          <li key={f} style={{ margin: "6px 0" }}>
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={onClick}
        disabled={loading}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "12px 14px",
          fontWeight: 700,
          color: "#0B1F23",
          background: loading ? "#9adbd9" : "#15C5C1",
          border: "none",
          borderRadius: 12,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Redirecting…" : "Start membership"}
      </button>
    </div>
  );
}
