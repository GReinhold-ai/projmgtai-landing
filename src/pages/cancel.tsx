export default function CancelPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ maxWidth: 700 }}>
        <h1>❌ Checkout canceled</h1>
        <p>No charge was made. You can safely close this page and try again later.</p>
      </div>
    </main>
  );
}
