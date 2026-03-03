// src/pages/profile.tsx
import { useEffect, useMemo, useState } from "react";

type PortalReq = {
  customerId: string;
  returnUrl?: string;
};

export default function ProfilePage() {
  // In your real app, load these from your auth/user store.
  // For dev/testing we allow manual entry and persist it to localStorage.
  const [email, setEmail] = useState<string>("member@example.com");
  const [customerId, setCustomerId] = useState<string>("");
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Derive a sensible return URL for the portal session
  const returnUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      // Next best: env or current origin
      const envBase =
        (process.env.NEXT_PUBLIC_APP_BASE_URL as string) ||
        (process.env.NEXT_PUBLIC_VERCEL_URL?.startsWith("http")
          ? process.env.NEXT_PUBLIC_VERCEL_URL
          : undefined);
      return envBase || window.location.origin;
    }
    return "http://localhost:3000";
  }, []);

  // Load any stored id from previous runs (handy in dev)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("stripeCustomerId");
    if (stored) setCustomerId(stored);
    const storedEmail = window.localStorage.getItem("profileEmail");
    if (storedEmail) setEmail(storedEmail);
  }, []);

  function saveLocally() {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem("stripeCustomerId", customerId.trim());
      window.localStorage.setItem("profileEmail", email.trim());
      setMessage("Saved locally.");
      setTimeout(() => setMessage(null), 2000);
    } catch {
      /* ignore */
    }
  }

  async function openBillingPortal() {
    setMessage(null);
    if (!customerId.trim()) {
      setMessage("Enter a Stripe customerId first.");
      return;
    }
    try {
      setLoadingPortal(true);
      const body: PortalReq = { customerId: customerId.trim(), returnUrl };
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setMessage(json.error || "Could not open billing portal.");
        return;
      }
      // Redirect to Stripe-hosted Billing Portal
      window.location.href = json.url as string;
    } catch (err: any) {
      setMessage(err?.message || "Request failed.");
    } finally {
      setLoadingPortal(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      <p className="text-sm opacity-70 mt-1">
        Manage your account and subscription.
      </p>

      <section className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Stripe Customer ID</label>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="cus_1234567890abcdef"
          />
          <p className="text-xs opacity-70 mt-1">
            Tip: After your first checkout, capture <code>customer</code> from the
            <code>checkout.session.completed</code> webhook and store it on the user record.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={saveLocally}
            className="rounded-lg px-4 py-2 border"
          >
            Save locally
          </button>

          <a
            href="/pricing"
            className="rounded-lg px-4 py-2 border"
            title="Go to pricing to start a new checkout"
          >
            View Pricing
          </a>

          <button
            onClick={openBillingPortal}
            disabled={!customerId || loadingPortal}
            className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50"
          >
            {loadingPortal ? "Opening…" : "Manage Subscription"}
          </button>
        </div>

        {message && (
          <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
            {message}
          </div>
        )}

        <div className="mt-6 text-xs opacity-70">
          <div>
            <strong>Portal return URL:</strong> {returnUrl}
          </div>
          <div>
            <strong>Environment:</strong>{" "}
            {process.env.NODE_ENV} (API base:{" "}
            {process.env.NEXT_PUBLIC_API_BASE || "not set"})
          </div>
        </div>
      </section>
    </main>
  );
}
