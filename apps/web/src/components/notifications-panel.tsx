'use client'

/**
 * N4b · operator notifications, local transport only.
 *
 * There is no SMTP relay and no messaging provider: every message is rendered
 * by the API, written to the process log and kept in a Mongo-backed outbox that
 * this panel lists. A contact is only reachable on the channel it consented to
 * (e-mail), and every send is audited server-side with the address masked.
 */

import * as React from 'react'
import {
  CheckCircle2,
  Feather,
  Inbox,
  Loader,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  MultiSelect,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@sps/ui'
import {
  ApiError,
  api,
  type MailOutboxMessageDto,
  type NewNotificationContactDto,
  type NotificationContactDto,
  type NotificationKind,
  type NotificationSendResultDto,
  type NotificationStatusDto,
  type ScenarioRunSummaryDto,
} from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { useToast } from '@/components/shared/toast'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { SearchSelect } from '@/components/shared/search-select'

const KINDS: NotificationKind[] = ['test', 'joint_report', 'deadline_alert', 'approval_request']

function apiErrorCode(cause: unknown): string | null {
  if (!(cause instanceof ApiError)) return null
  const payload = cause.json<{ error?: unknown; reason?: string }>()
  if (typeof payload?.error === 'string') return payload.error
  if (typeof payload?.reason === 'string') return payload.reason
  return null
}

/** Codes the console has a translated sentence for; anything else uses the fallback. */
const NOTIFY_ERROR_CODES = new Set([
  'duplicate',
  'email_required',
  'email_consent_without_email',
  'mail_not_configured',
  'run_not_found',
  'suggestion_failed',
  'not_found',
])

function notifyErrorText(
  cause: unknown,
  t: (key: MessageKey) => string,
  fallback: MessageKey,
  routeHint = false,
): string {
  if (routeHint && cause instanceof ApiError && cause.status === 404) return t('notify.error.not_found')
  const code = apiErrorCode(cause)
  if (code && NOTIFY_ERROR_CODES.has(code)) return t(`notify.error.${code}` as MessageKey)
  return t(fallback)
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export function NotificationsPanel({ country }: { country: string }) {
  const { locale, t } = useI18n()
  const toast = useToast()

  const [contacts, setContacts] = React.useState<NotificationContactDto[]>([])
  const [status, setStatus] = React.useState<NotificationStatusDto | null>(null)
  const [outbox, setOutbox] = React.useState<MailOutboxMessageDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<string[]>([])
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<NotificationContactDto | null>(null)
  const [deleting, setDeleting] = React.useState<NotificationContactDto | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<NotificationSendResultDto | null>(null)
  const [runs, setRuns] = React.useState<ScenarioRunSummaryDto[]>([])
  const [suggesting, setSuggesting] = React.useState(false)

  // Composer
  const [kind, setKind] = React.useState<NotificationKind>('test')
  const [runId, setRunId] = React.useState('')
  const [tick, setTick] = React.useState('1')
  const [summary, setSummary] = React.useState('')
  const [deadlineTitle, setDeadlineTitle] = React.useState('')
  const [deadline, setDeadline] = React.useState('')
  const [actionUrl, setActionUrl] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [heading, setHeading] = React.useState('')
  const [intro, setIntro] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [ctaLabel, setCtaLabel] = React.useState('')
  const [ctaUrl, setCtaUrl] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const [contactsResult, statusResult, outboxResult, runsResult] = await Promise.all([
        api.notificationContacts(),
        api.notificationStatus(),
        api.mailOutbox(20).catch(() => ({ messages: [] })),
        api.scenarioRuns().catch(() => ({ runs: [] })),
      ])
      setContacts(contactsResult.contacts)
      setStatus(statusResult)
      setOutbox(outboxResult.messages)
      setRuns(runsResult.runs)
    } catch (caught) {
      toast.error(t('toast.failed'), notifyErrorText(caught, t, 'notify.loadError', true))
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  React.useEffect(() => {
    void load()
  }, [load])

  const reachable = React.useMemo(
    () => contacts.filter((contact) => Boolean(contact.email) && contact.channels.email),
    [contacts],
  )

  const emailReady = Boolean(status?.email.configured)
  const run = runs.find((entry) => entry.id === runId) ?? null

  // Keep the subject and body in step with the chosen kind, without overwriting
  // anything the operator typed.
  React.useEffect(() => {
    if (kind === 'joint_report' && run) {
      setSubject((current) => current || `${t('notify.kind.joint_report')} · ${run.title}`)
      setCtaLabel((current) => current || t('notify.cta.openConsole'))
      setCtaUrl((current) => current || `${window.location.origin}/scenarios?run=${encodeURIComponent(run.id)}`)
    }
    if (kind === 'deadline_alert' && deadlineTitle) {
      setSubject((current) => current || deadlineTitle)
      setMessage((current) => current || `${deadlineTitle} · ${deadline}`)
    }
  }, [kind, run, deadlineTitle, deadline, t])

  const suggestSummary = async () => {
    if (!run) return
    setSuggesting(true)
    try {
      const suggestion = await api.suggestNotificationSummary({
        runId: run.id,
        kind: kind === 'approval_request' ? 'approval_request' : 'joint_report',
        locale,
      })
      setSummary(suggestion.summary)
      setMessage(suggestion.summary)
      toast.success(t('notify.message.suggested'), suggestion.model)
    } catch (caught) {
      toast.error(t('notify.message.suggestError'), notifyErrorText(caught, t, 'notify.error.generic', true))
    } finally {
      setSuggesting(false)
    }
  }

  const bodyReady = Boolean(message.trim() || (kind === 'joint_report' && summary.trim()))
  const canSend = Boolean(emailReady && selected.length > 0 && subject.trim() && bodyReady && !busy)

  const send = async () => {
    if (!canSend) return
    setBusy(true)
    setResult(null)
    try {
      const text = message.trim() || summary.trim()
      const outcome = await api.sendEmailNotification({
        contactIds: selected,
        subject: subject.trim(),
        ...(heading.trim() ? { heading: heading.trim() } : {}),
        ...(intro.trim() ? { intro: intro.trim() } : {}),
        message: text,
        ...(ctaLabel.trim() && ctaUrl.trim() ? { ctaLabel: ctaLabel.trim(), ctaUrl: ctaUrl.trim() } : {}),
        locale,
      })
      setResult(outcome)
      if (outcome.sent.length > 0) toast.success(t('notify.sentEmail'), t('notify.sentDetail', { sent: outcome.sent.length, failed: outcome.failed.length }))
      else toast.error(t('notify.nothingSent'), t('notify.nothingSentDetail'))
      setOutbox((await api.mailOutbox(20).catch(() => ({ messages: [] }))).messages)
    } catch (caught) {
      toast.error(t('notify.sendError'), notifyErrorText(caught, t, 'notify.error.generic', true))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Channel status */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', emailReady ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[12px] font-semibold">{t('notify.channel.email')}</p>
              <p className="text-[11px] text-muted-foreground">
                {status ? t('notify.status.emailLine', { from: status.email.from }) : t('notify.status.missing')}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {status?.email.transport === 'console' ? t('notify.transport.console') : t('notify.status.missing')}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            {t('notify.consentNotice')}
          </span>
        </CardContent>
      </Card>

      {!emailReady && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('notify.status.emailMissing')}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Address book */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold">{t('notify.contacts.title')}</p>
                <p className="text-[11px] text-muted-foreground">{t('notify.contacts.hint')}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t('notify.contacts.add')}
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                <div className="shimmer h-10 rounded-xl bg-secondary" />
                <div className="shimmer h-10 rounded-xl bg-secondary" />
              </div>
            ) : contacts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-[12px] text-muted-foreground">
                {t('notify.contacts.empty')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('notify.contacts.name')}</TableHead>
                    <TableHead>{t('notify.contacts.email')}</TableHead>
                    <TableHead>{t('notify.contacts.consentEmail')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="text-[12px] font-medium">{contact.name}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{contact.email ?? '—'}</TableCell>
                      <TableCell>
                        {contact.channels.email ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t('common.yes')}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{t('common.no')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" aria-label={t('notify.contacts.edit')} onClick={() => setEditing(contact)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={t('notify.contacts.delete')} onClick={() => setDeleting(contact)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Composer */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-[12px] font-semibold">{t('notify.compose.title')}</p>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('notify.message.kind')}
                </Label>
                <Select
                  value={kind}
                  onValueChange={(value) => setKind(value as NotificationKind)}
                  options={KINDS.map((value) => ({ value, label: t(`notify.kind.${value}` as MessageKey) }))}
                  ariaLabel={t('notify.message.kind')}
                  size="sm"
                />
              </div>
              {(kind === 'joint_report' || kind === 'approval_request') && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('notify.message.runId')}
                  </Label>
                  <SearchSelect
                    value={runId}
                    onValueChange={setRunId}
                    options={runs.map((entry) => ({ value: entry.id, label: entry.title, hint: entry.country.toUpperCase() }))}
                    ariaLabel={t('notify.message.runId')}
                    placeholder={t('notify.message.runPlaceholder')}
                    searchPlaceholder={t('notify.message.runSearch')}
                    emptyLabel={t('notify.message.runEmpty')}
                  />
                </div>
              )}
              {kind === 'joint_report' && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('notify.message.tick')}
                  </Label>
                  <Input value={tick} onChange={(event) => setTick(event.target.value)} inputMode="numeric" className="h-8" />
                </div>
              )}
              {kind === 'deadline_alert' && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('notify.message.title')}
                    </Label>
                    <Input value={deadlineTitle} onChange={(event) => setDeadlineTitle(event.target.value)} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('notify.message.deadline')}
                    </Label>
                    <Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="h-8" />
                  </div>
                </>
              )}
            </div>

            {(kind === 'joint_report' || kind === 'approval_request') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('notify.message.summary')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => void suggestSummary()} disabled={!run || suggesting}>
                          {suggesting ? <Loader className="h-3 w-3 animate-spin" /> : <Feather className="h-3 w-3" />}
                          {t('notify.message.suggest')}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{run ? t('notify.message.suggestTooltip') : t('notify.message.suggestNeedsRun')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  value={summary}
                  onChange={(event) => {
                    setSummary(event.target.value)
                    setMessage(event.target.value)
                  }}
                  placeholder={t('notify.message.summaryHint')}
                  className="min-h-16 text-[12px]"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('notify.email.subject')}
              </Label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} className="h-8 text-[12px]" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('notify.email.heading')}
                </Label>
                <Input value={heading} onChange={(event) => setHeading(event.target.value)} placeholder={t('notify.email.headingHint')} className="h-8 text-[12px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('notify.email.intro')}
                </Label>
                <Input value={intro} onChange={(event) => setIntro(event.target.value)} className="h-8 text-[12px]" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('notify.email.message')}
              </Label>
              <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t('notify.email.messageHint')} className="min-h-20 text-[12px]" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('notify.email.ctaLabel')}
                </Label>
                <Input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className="h-8 text-[12px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('notify.email.ctaUrl')}
                </Label>
                <Input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} className="h-8 text-[12px]" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('notify.recipients')}
              </Label>
              <MultiSelect
                ariaLabel={t('notify.recipients')}
                values={selected}
                onValuesChange={setSelected}
                minSelected={0}
                options={reachable.map((contact) => ({ value: contact.id, label: `${contact.name} · ${contact.email}` }))}
                className="w-full"
              />
              <p className="text-[10px] text-muted-foreground">
                {reachable.length === 0
                  ? t('notify.recipients.none')
                  : t('notify.recipients.hint', { count: selected.length, total: reachable.length })}
              </p>
            </div>

            <Button size="sm" onClick={() => void send()} disabled={!canSend}>
              {busy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {busy ? t('notify.sending') : t('notify.send')}
            </Button>

            {result && (
              <div className="space-y-1 rounded-xl border border-border bg-secondary/40 p-3 text-[11px]">
                <p className="font-semibold">{t('notify.result.sent', { count: result.sent.length })} · {t('notify.result.failed', { count: result.failed.length })} · {t('notify.result.skipped', { count: result.skipped.length })}</p>
                {result.sent.map((row) => (
                  <p key={row.contactId} className="text-muted-foreground">{row.name} · {row.to}</p>
                ))}
                {result.skipped.map((row) => (
                  <p key={row.contactId} className="text-amber-600 dark:text-amber-400">{row.name} · {row.reason}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Outbox */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[12px] font-semibold">{t('notify.outbox.title')}</p>
                <p className="text-[11px] text-muted-foreground">{t('notify.outbox.subtitle')}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('notify.outbox.refresh')}
            </Button>
          </div>

          {outbox.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[12px] text-muted-foreground">
              {t('notify.outbox.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('notify.outbox.to')}</TableHead>
                  <TableHead>{t('notify.email.subject')}</TableHead>
                  <TableHead>{t('notify.outbox.at')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outbox.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-[12px] text-muted-foreground">{entry.to}</TableCell>
                    <TableCell className="text-[12px] font-medium">{entry.subject}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{formatDate(entry.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ContactDialog
        open={adding}
        onOpenChange={setAdding}
        country={country}
        onSaved={() => {
          setAdding(false)
          void load()
        }}
      />
      <ContactDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        country={country}
        contact={editing ?? undefined}
        onSaved={() => {
          setEditing(null)
          void load()
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('notify.contacts.deleteTitle')}
        description={deleting ? t('notify.contacts.deleteBody', { name: deleting.name }) : ''}
        confirmText={t('notify.contacts.delete')}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.deleteNotificationContact(deleting.id)
            toast.success(t('notify.contacts.deleted'), deleting.name)
            setDeleting(null)
            void load()
          } catch (caught) {
            toast.error(t('notify.contacts.deleteError'), notifyErrorText(caught, t, 'notify.error.generic'))
          }
        }}
      />
    </div>
  )
}

function ContactDialog({
  open,
  onOpenChange,
  country,
  contact,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  country: string
  contact?: NotificationContactDto
  onSaved: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [emailConsent, setEmailConsent] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setName(contact?.name ?? '')
    setEmail(contact?.email ?? '')
    setEmailConsent(contact ? contact.channels.email : true)
  }, [open, contact])

  const save = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error(t('notify.contacts.saveError'), t('notify.contacts.incomplete'))
      return
    }
    setSaving(true)
    const body: NewNotificationContactDto = {
      name: name.trim(),
      email: email.trim(),
      country: country.toUpperCase(),
      channels: { email: emailConsent },
    }
    try {
      if (contact) {
        await api.updateNotificationContact(contact.id, body)
        toast.success(t('notify.contacts.edited'), body.name)
      } else {
        await api.addNotificationContact(body)
        toast.success(t('notify.contacts.added'), body.name)
      }
      onSaved()
    } catch (caught) {
      toast.error(contact ? t('notify.contacts.editError') : t('notify.contacts.saveError'), notifyErrorText(caught, t, 'notify.error.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? t('notify.contacts.editTitle') : t('notify.contacts.addTitle')}</DialogTitle>
          <DialogDescription>{contact ? t('notify.contacts.editHint') : t('notify.contacts.addHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px]">{t('notify.contacts.name')}</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} className="h-9 text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">{t('notify.contacts.email')}</Label>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-9 text-[12px]" />
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <Checkbox checked={emailConsent} onCheckedChange={(value) => setEmailConsent(value === true)} />
            {t('notify.contacts.consentEmail')}
          </label>
          <Button onClick={() => void save()} disabled={saving} className="w-full">
            {saving ? <Loader className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? t('notify.contacts.saving') : contact ? t('notify.contacts.saveEdit') : t('notify.contacts.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
