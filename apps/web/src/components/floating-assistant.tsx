'use client'

import * as React from 'react'
import { Bot, Scale, Shield, X } from 'lucide-react'
import { Button, cn } from '@sps/ui'
import { institutionsForDomain, type Domain, type WorkflowLens } from '@sps/shared'
import { api, type AssessmentDto } from '@/lib/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: AssessmentDto['citations']
  agentId?: string
}

/**
 * Floating policy assistant — same charter as the SarkiAI apps:
 * backdrop `z-[105]`, panel `z-[110]`, bottom-center avatar when minimised.
 */
export function FloatingAssistant({
  lens,
  country,
  domain,
}: {
  lens: WorkflowLens
  country: string
  domain: Domain
}) {
  const [open, setOpen] = React.useState(false)
  const [minimized, setMinimized] = React.useState(true)
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])

  const institutions = React.useMemo(() => institutionsForDomain(domain), [domain])
  const [institutionId, setInstitutionId] = React.useState(institutions[0]?.id ?? 'legal_advisor')

  React.useEffect(() => {
    if (!institutions.some((i) => i.id === institutionId)) setInstitutionId(institutions[0]?.id ?? 'legal_advisor')
  }, [institutions, institutionId])

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const question = input.trim()
    if (!question || busy) return
    setInput('')
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: question }])
    setBusy(true)
    try {
      const result = await api.ask({ institutionId, question, country, domain, lens })
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          agentId: result.agentId,
          content: result.findings.join('\n\n'),
          citations: result.citations,
        },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${(error as Error).message}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && !minimized && (
        <div
          className="fixed inset-0 z-[105] bg-foreground/30 dark:bg-black/30"
          onClick={() => setMinimized(true)}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      {open && !minimized && (
        <div className="fixed top-2 bottom-14 left-2 right-2 z-[110] mx-auto flex max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl lg:top-4">
          <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <span className="text-[10px] font-black tracking-widest text-muted-foreground">POLICY ASSISTANT</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="Minimize" onClick={() => setMinimized(true)}>
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {institutions.slice(0, 4).map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => setInstitutionId(inst.id)}
                    className={cn(
                      'rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary',
                      institutionId === inst.id && 'border-primary bg-primary/5',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {inst.role === 'legal_advisor' ? (
                        <Scale className={cn('h-4 w-4', inst.color)} />
                      ) : (
                        <Shield className={cn('h-4 w-4', inst.color)} />
                      )}
                      <span className="text-xs font-semibold">{inst.name}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{inst.mandate}</p>
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                  message.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground',
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.citations && message.citations.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-border/50 pt-2 text-[11px]">
                    {message.citations.slice(0, 4).map((citation, i) => (
                      <li key={i} className="text-muted-foreground">
                        {citation.filename}
                        {citation.articleNumber ? ` · ARTICLE ${citation.articleNumber}` : ''}
                        {citation.headingPath ? ` · ${citation.headingPath}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {busy && <div className="text-xs text-muted-foreground">Reconnaissance de la disposition applicable…</div>}
          </div>

          <form onSubmit={send} className="flex shrink-0 items-center gap-2 border-t border-border p-2">
            <select
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              className="h-8 rounded-xl border border-border bg-transparent px-2 text-[11px]"
              aria-label="Agent"
            >
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez une question de politique publique…"
              className="h-8 flex-1 rounded-xl border border-border bg-transparent px-3 text-sm"
            />
            <Button type="submit" size="md" disabled={busy || !input.trim()}>
              Envoyer
            </Button>
          </form>
        </div>
      )}

      {/* Bottom-center prompt / avatar */}
      {(!open || minimized) && (
        <div className="fixed bottom-1.5 left-0 right-0 z-[110] p-2">
          <div className="mx-auto flex w-[95%] max-w-xl items-center gap-2">
            <Button
              onClick={() => {
                setOpen(true)
                setMinimized(false)
              }}
              aria-label="Ouvrir l'assistant politique"
              className="h-12 w-16 rounded-t-[5rem] rounded-b-none"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
            </Button>
            <form onSubmit={send} className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-background/90 p-1 backdrop-blur-sm">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Interroger un agent institutionnel…"
                className="h-8 flex-1 bg-transparent px-3 text-sm"
              />
              <Button type="submit" size="md" disabled={busy || !input.trim()}>
                Envoyer
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
