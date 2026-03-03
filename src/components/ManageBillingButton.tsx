import { useState } from "react";

export default function ManageBillingButton({ customerId, returnUrl }: { customerId: string; returnUrl?: string }) {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    try {
      setLoading(true);
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          returnUrl:
            returnUrl ||
            (process.env.NEXT_PUBLIC_APP_BASE_URL as string) ||
            "http://localhost:3000",
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Could not open billing portal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={openPortal}
      disabled={loading}
      className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50"
    >
      {loading ? "Opening…" : "Manage Subscription"}
    </button>
  );
}
