'use client'

import * as React from 'react'
import { Download, GitMerge, Play, TriangleAlert } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@sps/ui'
import { api, type RunResultDto } from '@/lib/api'

const SEVERITY: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-500',
  high: 'text-orange-500',
  critical: 'text-destructive',
}

export function ScenarioConsole({ country, domain }: { country: string; domain: string }) {
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<RunResultDto | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      setResult(await api.runScenario({ id: 'health-data-breach', country, domain }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <GitMerge className="h-4 w-4 text-primary" />
        <CardTitle>MULTI-AGENT COORDINATION — HEALTH DATA BREACH</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {result && (
            <>
              <a href={api.dossierUrl(result.runId, 'markdown')} target="_blank" rel="noreferrer">
                <Button variant="outline" size="md">
                  <Download className="h-3.5 w-3.5" /> Dossier (MD)
                </Button>
              </a>
              <a href={api.dossierUrl(result.runId, 'json')} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="md">
                  JSON
                </Button>
              </a>
            </>
          )}
          <Button onClick={run} disabled={busy} size="md">
            <Play className="h-3.5 w-3.5" /> {busy ? 'Simulation…' : 'Lancer le scénario'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!result && !busy && (
          <p className="text-sm text-muted-foreground">
            Libère les événements par blocs (information asymétrique), fait produire à chaque institution une
            évaluation indépendante, puis réconcilie le tout en détectant les conflits de mandats.
          </p>
        )}

        <div className="space-y-3">
          {result?.ticks.map((tick) => (
            <div key={tick.tick} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black tracking-widest text-muted-foreground">TICK {tick.tick}</span>
                <span className="text-xs">{tick.summary}</span>
              </div>

              {tick.agreements.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-black tracking-widest text-primary">ACCORDS</p>
                  <ul className="text-xs">
                    {tick.agreements.map((a, i) => (
                      <li key={i}>· {a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {tick.conflicts.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-black tracking-widest text-destructive">CONFLITS DE MANDATS</p>
                  <ul className="space-y-1">
                    {tick.conflicts.map((conflict) => (
                      <li key={conflict.id} className="rounded-lg bg-secondary/60 p-2 text-xs">
                        <div className="flex items-center gap-1">
                          <TriangleAlert className={cn('h-3.5 w-3.5', SEVERITY[conflict.severity])} />
                          <span className="font-semibold">
                            {conflict.between[0]} ↔ {conflict.between[1]}
                          </span>
                          <span className={cn('ml-auto uppercase', SEVERITY[conflict.severity])}>
                            {conflict.severity}
                          </span>
                        </div>
                        <p className="mt-1">{conflict.summary}</p>
                        {conflict.positions.map((position, i) => (
                          <p key={i} className="mt-0.5 text-muted-foreground">
                            <span className="font-semibold">{position.agentId}</span> : {position.position}
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {tick.openQuestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-black tracking-widest text-muted-foreground">QUESTIONS OUVERTES</p>
                  <ul className="text-xs text-muted-foreground">
                    {tick.openQuestions.map((q, i) => (
                      <li key={i}>· {q}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-2 text-[10px] font-black tracking-widest text-muted-foreground">
                {tick.assessments.length} ÉVALUATION(S)
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
