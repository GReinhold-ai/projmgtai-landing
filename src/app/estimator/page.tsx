export const dynamic = 'force-dynamic';
// src/app/estimator/page.tsx
import type { Metadata } from 'next'
import EstimatorLanding from '@/components/EstimatorLanding'  // ← matches your file path/name

export const metadata: Metadata = {
  title: 'Estimator | ProjMgtAI',
  description:
    'Upload plans, select trades, parse scope, and export XLSX for subcontractor bidding.',
}

export default function EstimatorPage() {
  return (
    <main className="min-h-screen">
      <EstimatorLanding />
    </main>
  )
}

