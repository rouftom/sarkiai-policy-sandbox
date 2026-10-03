'use client'

import * as React from 'react'
import { Activity, FileCheck2, Moon, Sun } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@sps/ui'
import { WORKFLOW_PROFILES, type Domain, type WorkflowLens } from '@sps/shared'
import { LensSelector } from '@/components/lens-selector'
import { FloatingAssistant } from '@/components/floating-assistant'
import { useTheme } from '@/components/theme-provider'
import { api, type ReadinessReportDto } from '@/lib/api'

const DOMAINS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

export default function HomePage() {
  const { mode, toggleMode, packId, packs, setPack } = useTheme()
  const [lens, setLens] = React.useState<WorkflowLens>('hybrid')
  const [country, setCountry] = React.useState('cm')
  const [domain, setDomain] = React.useState<Domain>('health')
  const [report, setReport] = React.useState<ReadinessReportDto | null>(null)
  const [busy, setBusy] = React.useState(false)

  const profile = WORKFLOW_PROFILES[lens]

  const runReadiness = async () => {
    setBusy(true)
    try {
      setReport(await api.readiness({ country, domain, globalCountry: 'global' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="container py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-gradient-brand text-2xl font-black tracking-tight">SarkiAI Policy Sandbox</h1>
          <p className="text-xs text-muted-foreground">Un moteur policy-grounded · deux lenses · aligné ITU-T Y.3172</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Theme pack"
            value={packId}
            onChange={(e) => setPack(e.target.value)}
            className="h-8 rounded-xl border border-border bg-transparent px-2 text-[11px]"
          >
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.label}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggleMode}>
            {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <section className="mb-6 flex flex-wrap items-center gap-3">
        <LensSelector value={lens} onChange={setLens} />
        <select
          aria-label="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="h-8 rounded-xl border border-border bg-transparent px-2 text-[11px]"
        >
          <option value="cm">Cameroun (CM)</option>
          <option value="ae">United Arab Emirates (AE)</option>
        </select>
        <select
          aria-label="Domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value as Domain)}
          className="h-8 rounded-xl border border-border bg-transparent px-2 text-[11px]"
        >
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </section>

      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">{profile.description}</p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle>WORKFLOW STAGES</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.entries(profile.stages).map(([stage, enabled]) => (
              <div key={stage} className="flex items-center justify-between">
                <span className="text-muted-foreground">{stage}</span>
                <span className={enabled ? 'text-primary' : 'text-muted-foreground/50'}>{enabled ? 'on' : 'off'}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <FileCheck2 className="h-4 w-4 text-primary" />
            <CardTitle>ITU AI READINESS — GAP REPORT</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={runReadiness} disabled={busy}>
              {busy ? 'Analyse…' : `Évaluer ${country.toUpperCase()} · ${domain}`}
            </Button>

            {report && (
              <div className="mt-4 space-y-3">
                <p className="text-sm">{report.summary}</p>
                {report.dimensions.map((dimension) => (
                  <div key={dimension.dimension} className="rounded-xl border border-border p-2">
                    <p className="text-[10px] font-black tracking-widest text-muted-foreground">
                      {dimension.dimension}
                    </p>
                    {dimension.gaps.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucun écart identifié.</p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-xs">
                        {dimension.gaps.map((gap) => (
                          <li key={gap.id}>
                            <span className="mr-1 font-semibold uppercase text-primary">{gap.severity}</span>
                            {gap.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <FloatingAssistant lens={lens} country={country} domain={domain} />
    </main>
  )
}
