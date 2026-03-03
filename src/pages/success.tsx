import { useEffect, useState } from "react";

type SessionView = {
  id: string;
  customer_email: string | null;
  productName: string | null;
  interval: string | null;
  amount_total: number;
  currency: string;
  payment_status: string;
  customerId: string | null;
  subscriptionId: string | null;
};

export default function SuccessPage() {
  const [data, setData] = useState<SessionView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const sid = sp.get("session_id");
    if (!sid) {
      setErr("Missing session_id");
      return;
    }
    fetch(`/api/session?id=${encodeURIComponent(sid)}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) setErr(json.error);
        else setData(json);
      })
      .catch(e => setErr(String(e)));
  }, []);

  if (err) return <div className="p-10 text-center">Error: {err}</div>;
  if (!data) return <div className="p-10 text-center">Loading payment details…</div>;

  return (
    <main className="max-w-xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">Payment Success ✅</h1>
      <p className="mb-2">Thanks! Your payment was processed.</p>
      <div className="mt-6 space-y-1">
        <div><strong>Email:</strong> {data.customer_email ?? "—"}</div>
        <div><strong>Product:</strong> {data.productName ?? "—"}</div>
        <div><strong>Plan:</strong> {data.interval ?? "one-time"}</div>
        <div>
          <strong>Amount:</strong>{" "}
          ${(data.amount_total / 100).toFixed(2)} {data.currency}
        </div>
        <div><strong>Status:</strong> {data.payment_status}</div>
        <div><strong>Session:</strong> {data.id}</div>
      </div>

      {data.customerId && (
        <form
          className="mt-6"
          action="/api/portal"
          method="POST"
          onSubmit={e => {
            // decorate POST with JSON via fetch to keep SPA feel
            e.preventDefault();
            fetch("/api/portal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerId: data.customerId,
                returnUrl:
                  (process.env.NEXT_PUBLIC_APP_BASE_URL as string) ||
                  (process.env.NEXT_PUBLIC_VERCEL_URL?.startsWith("http") ? process.env.NEXT_PUBLIC_VERCEL_URL : undefined) ||
                  "http://localhost:3000",
              }),
            })
              .then(r => r.json())
              .then(j => {
                if (j.url) window.location.href = j.url;
                else alert(j.error || "Could not open billing portal.");
              });
          }}
        >
          <button className="mt-3 rounded-lg px-4 py-2 bg-black text-white">
            Manage Subscription
          </button>
        </form>
      )}
    </main>
  );
}
