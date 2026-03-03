'use client'

import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { roles, trades as ALL_TRADES, projectTypes } from '@/lib/constants'
import { parsePlansAndSaveScopes, type ScopeItem } from '@/lib/parsePlansAndSaveScopes'
import { exportTradeToXLSX, exportAllTradesToXLSX } from '@/lib/exportToXLSX'
import { Button } from '@/components/ui/button'

import { getFirebaseApp } from '@/lib/firebase'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore'

type ScopesByTrade = Record<string, ScopeItem[]>

const schema = z.object({
  role: z.string().min(1, 'Role is required'),
  companyName: z.string().min(1, 'Company name is required'),
  email: z.string().email('Enter a valid email'),
  projectName: z.string().min(1, 'Project name is required'),
  projectType: z.string().min(1, 'Project type is required'),
  location: z.string().min(1, 'Location is required'),
  startDate: z.string().optional(),
  notes: z.string().optional(),
  trades: z.array(z.string()).min(1, 'Select at least one trade'),
})

export default function EstimatorLanding() {
  // —— Firebase ——
  const app = useMemo(() => getFirebaseApp(), [])
  const auth = useMemo(() => getAuth(app), [app])
  const db = useMemo(() => getFirestore(app), [app])

  // —— User + quota ——
  const [uid, setUid] = useState<string | null>(null)
  const [projectQuotaUsed, setProjectQuotaUsed] = useState<number>(0)
  const FREE_QUOTA = 3
  const quotaRemaining = Math.max(FREE_QUOTA - projectQuotaUsed, 0)
  const quotaExceeded = quotaRemaining <= 0

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid)
        const userRef = doc(db, `users/${user.uid}`)
        const snap = await getDoc(userRef)
        setProjectQuotaUsed(snap.exists() ? (snap.data().stats?.projectsParsed ?? 0) : 0)
      } else {
        setUid(null)
        setProjectQuotaUsed(0)
      }
    })
    return () => unsub()
  }, [auth, db])

  // —— Form state ——
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    role: '',
    companyName: '',
    email: '',
    projectName: '',
    projectType: '',
    location: '',
    startDate: '',
    notes: '',
    trades: [] as string[],
  })
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  // —— Parse state ——
  const [parsing, setParsing] = useState(false)
  const [scopes, setScopes] = useState<ScopesByTrade | null>(null)
  const [projectId, setProjectId] = useState<string>('')

  // —— Handlers ——
  const handleNext = () => setStep((s) => Math.min(3, s + 1))
  const handleBack = () => setStep((s) => Math.max(1, s - 1))

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((p) => ({ ...p, [name]: value }))
  }

  const toggleTrade = (t: string) => {
    setFormData((p) => {
      const exists = p.trades.includes(t)
      return { ...p, trades: exists ? p.trades.filter((x) => x !== t) : [...p.trades, t] }
    })
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || [])
    const pdfs = fs.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    setFiles(pdfs)
  }

  const validate = () => {
    const result = schema.safeParse({ ...formData })
    const fileErr = files.length === 0 ? { file: 'Please upload a PDF.' } : {}
    if (!result.success) {
      const zErrs = result.error.issues.reduce((acc, it) => {
        const k = it.path[0]?.toString() ?? 'form'
        acc[k] = it.message
        return acc
      }, {} as Record<string, string>)
      setErrors({ ...zErrs, ...fileErr })
      return false
    }
    setErrors(fileErr)
    return Object.keys(fileErr).length === 0
  }

  // Create a project shell in Firestore (client-side for MVP)
  const ensureProjectDoc = async (): Promise<string> => {
    if (projectId) return projectId
    if (!uid) throw new Error('Please sign in to create a project.')
    const id = crypto.randomUUID()
    const ref = doc(db, `projects/${id}`)
    await setDoc(ref, {
      owner: uid,
      ...formData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      phase: 'phase1-subs',
      status: 'intake',
    })
    setProjectId(id)
    return id
  }

  const handleParse = async () => {
    if (quotaExceeded) {
      alert(`Free tier limit reached. You used ${projectQuotaUsed}/${FREE_QUOTA} projects.`)
      return
    }
    if (!validate()) return

    try {
      setParsing(true)
      const pid = await ensureProjectDoc()
      const pdf = files[0]

      // Optional: pass auth token to backend if you enforce it server-side
      const user = auth.currentUser
      const authToken = user ? await user.getIdToken() : undefined

      const results = await parsePlansAndSaveScopes({
        apiBase: process.env.NEXT_PUBLIC_API_BASE as string,
        file: pdf,
        selectedTrades: formData.trades,
        firebaseApp: app,
        projectId: pid,
        authToken,
        uid: uid ?? undefined,
        plan: 'free',
      })
      setScopes(results)

      // Update usage counter + project status
      if (uid) {
        const uRef = doc(db, `users/${uid}`)
        await setDoc(
          uRef,
          { stats: { projectsParsed: increment(1) }, updatedAt: serverTimestamp() },
          { merge: true }
        )
        setProjectQuotaUsed((x) => x + 1)
      }
      const pRef = doc(db, `projects/${pid}`)
      await setDoc(pRef, { status: 'parsed', updatedAt: serverTimestamp() }, { merge: true })
    } catch (err: any) {
      console.error(err)
      alert(err?.message || 'Failed to parse plans.')
    } finally {
      setParsing(false)
    }
  }

  // —— UI ——
  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">ProjMgtAI — Subcontractor Bidding Assistant</h1>
        <p className="text-sm text-gray-600">
          Intake your project, upload plans (PDF), select trades, and auto-extract scope → export XLSX.
        </p>
      </header>

      {/* Free-tier banner */}
      <div className="mb-4 rounded-xl border p-3 text-sm">
        <div><b>Free Tier:</b> {FREE_QUOTA} projects total.</div>
        <div>Used: {projectQuotaUsed} • Remaining: {quotaRemaining}</div>
      </div>

      {/* Steps */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <StepDot active={step >= 1} label="Project Info" />
        <div className="opacity-50">→</div>
        <StepDot active={step >= 2} label="Upload & Trades" />
        <div className="opacity-50">→</div>
        <StepDot active={step >= 3} label="Parse & Export" />
      </div>

      {step === 1 && (
        <section className="rounded-2xl border p-4 space-y-4">
          <h2 className="font-semibold">1) Project Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectField label="Role" name="role" value={formData.role} onChange={handleChange} options={roles} error={errors.role} />
            <InputField label="Company" name="companyName" value={formData.companyName} onChange={handleChange} error={errors.companyName} />
            <InputField label="Email" name="email" type="email" value={formData.email} onChange={handleChange} error={errors.email} />
            <InputField label="Project Name" name="projectName" value={formData.projectName} onChange={handleChange} error={errors.projectName} />
            <SelectField label="Project Type" name="projectType" value={formData.projectType} onChange={handleChange} options={projectTypes} error={errors.projectType} />
            <InputField label="Location" name="location" value={formData.location} onChange={handleChange} error={errors.location} />
            <InputField label="Start Date (optional)" name="startDate" type="date" value={formData.startDate} onChange={handleChange} />
            <TextAreaField label="Notes (optional)" name="notes" value={formData.notes} onChange={handleChange} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleNext}>Next</Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-2xl border p-4 space-y-4">
          <h2 className="font-semibold">2) Upload Plans & Select Trades</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">Plan Set (PDF)</label>
            <input type="file" accept="application/pdf,.pdf" onChange={onFileChange} />
            {errors.file && <p className="text-xs text-red-600">{errors.file}</p>}
            {files.length > 0 && (
              <p className="text-xs text-gray-500">
                Selected: <span className="font-mono">{files[0].name}</span> ({Math.round(files[0].size / 1024)} KB)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Trades</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ALL_TRADES.map((t) => {
                const active = formData.trades.includes(t)
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleTrade(t)}
                    className={`rounded-xl border px-3 py-2 text-sm text-left transition 
                      ${active ? 'border-emerald-500 ring-2 ring-emerald-200' : 'hover:bg-gray-50'}`}
                    title={t}
                  >
                    {active ? '✅ ' : ''}{t}
                  </button>
                )
              })}
            </div>
            {errors.trades && <p className="text-xs text-red-600">{errors.trades}</p>}
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={handleBack}>Back</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { if (validate()) setStep(3) }}>Next</Button>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-2xl border p-4 space-y-4">
          <h2 className="font-semibold">3) Parse & Export</h2>

          <div className="rounded-xl border p-3 text-sm">
            <p className="mb-2">
              This will analyze your PDF for the selected trades and create a scope list per trade.
              Results are saved in Firestore under <code>projects/&lt;id&gt;/scopes/&lt;trade&gt;</code>.
            </p>
            <div className="flex items-center gap-2">
              <Button disabled={parsing || quotaExceeded || files.length === 0} onClick={handleParse}>
                {parsing ? 'Parsing…' : 'Parse Plans'}
              </Button>
              {quotaExceeded && <span className="text-xs text-red-600">Free tier limit reached.</span>}
            </div>
          </div>

          {/* Preview */}
          {scopes && Object.keys(scopes).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Preview — Extracted Scopes</h3>
                <Button
                  variant="outline"
                  onClick={() => exportAllTradesToXLSX(scopes, formData.projectName || 'Project')}
                >
                  Export All Trades (XLSX)
                </Button>
              </div>

              {Object.entries(scopes).map(([trade, items]) => (
                <div key={trade} className="rounded-2xl border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-semibold">{trade} — {items.length} items</h4>
                    <Button size="sm" onClick={() => exportTradeToXLSX(trade, items)}>
                      Export {trade}
                    </Button>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-sm text-gray-500">No items detected for this trade.</p>
                  ) : (
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {items.slice(0, 12).map((it, idx) => (
                        <li key={`${trade}-${idx}`}>
                          <span className="font-medium">{it.item}</span>
                          {it.qty !== '' ? ` — Qty: ${it.qty}` : ''}
                          {it.sheet ? ` — ${it.sheet}` : ''}
                          {it.notes ? ` — ${it.notes}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={handleBack}>Back</Button>
            <Button variant="secondary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Back to Top
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

/* ——— UI Subcomponents ——— */

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      <span className={`text-xs ${active ? 'font-medium' : 'opacity-60'}`}>{label}</span>
    </div>
  )
}

function InputField(props: {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  error?: string
}) {
  const { label, name, value, onChange, type = 'text', error } = props
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium" htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function TextAreaField(props: {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  error?: string
}) {
  const { label, name, value, onChange, error } = props
  return (
    <div className="space-y-1 md:col-span-2">
      <label className="text-sm font-medium" htmlFor={name}>{label}</label>
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        rows={3}
        className="w-full rounded-xl border px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function SelectField(props: {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  options: string[]
  error?: string
}) {
  const { label, name, value, onChange, options, error } = props
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium" htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
      >
        <option value="">Select…</option>
        {options.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
