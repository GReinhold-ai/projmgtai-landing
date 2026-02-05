// src/app/page.tsx

export default function HomePage() {
  return (
    <main className="min-h-screen p-10 bg-white text-black">
      <h1 className="text-4xl font-bold mb-4">ProjMgtAI</h1>
      <p className="mb-6 text-lg">Welcome to the MVP of Project Management AI.</p>

      <div className="space-y-4">
        <a
          href="/estimator"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Go to Estimator Intake Form
        </a>
      </div>
    </main>
  )
}
