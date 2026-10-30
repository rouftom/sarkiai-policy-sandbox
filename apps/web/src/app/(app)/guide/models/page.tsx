'use client'

import { Cpu, Layers, MessageSquare, ShieldCheck, Workflow } from 'lucide-react'
import {
  GuideBanner,
  GuideChecklist,
  GuideSection,
  GuideShell,
  GuideTable,
} from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

export default function GuideModelsPage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell
      title={t('guide.models.title')}
      subtitle={t('guide.models.subtitle')}
      current="/guide/models"
      kicker={fr ? 'Modèles locaux · capacités et exploitation' : 'Local models · capabilities and operation'}
      meta={[
        { label: fr ? 'Services' : 'Services', value: '4' },
        { label: fr ? 'Fournisseur externe' : 'External provider', value: fr ? 'Aucun' : 'None' },
        { label: fr ? 'Résidence' : 'Residency', value: fr ? 'Sur site' : 'On-premise' },
      ]}
    >
      <GuideBanner tone="info" title={fr ? 'Aucun appel sortant' : 'No outbound call'}>
        <p>
          {fr
            ? 'Le raisonnement, les embeddings, le rerank, la transcription et l’OCR tournent sur l’infrastructure de l’institution. Aucune clé d’un fournisseur hébergé n’est nécessaire : ce que le badge fournisseur affiche, c’est ce qui répond réellement.'
            : 'Reasoning, embeddings, rerank, transcription and OCR run on the institution’s infrastructure. No hosted-provider key is needed: the provider badge shows what is actually answering.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Capacités locales, et où' : 'Local capabilities, and where'} icon={Layers}>
        <GuideTable
          headers={[
            fr ? 'Capacité' : 'Capability',
            fr ? 'Usage opérationnel' : 'Operational use',
            fr ? 'Service · modèle' : 'Service · model',
          ]}
          rows={[
            {
              a: fr ? 'Raisonnement et chat' : 'Reasoning and chat',
              b: fr
                ? 'Évaluation, coordination, what-if, rédaction des brouillons, assistant.'
                : 'Assessment, coordination, what-if, draft writing, assistant.',
              c: 'Ollama · qwen3.5:9b',
            },
            {
              a: fr ? 'Vision' : 'Vision',
              b: fr ? 'Lecture des zones du journal officiel scanné.' : 'Reading the zones of the scanned gazette.',
              c: 'Ollama · qwen3.5:9b',
            },
            {
              a: fr ? 'Embeddings' : 'Embeddings',
              b: fr ? 'Vecteurs denses pour la recherche et l’ingestion.' : 'Dense vectors for retrieval and ingestion.',
              c: 'Ollama · bge-m3 (1024 d)',
            },
            {
              a: fr ? 'Rerank' : 'Rerank',
              b: fr ? 'Réordonnancement optionnel des passages fusionnés.' : 'Optional reordering of fused passages.',
              c: 'TEI · cross-encoder local',
            },
            {
              a: fr ? 'Voix' : 'Voice',
              b: fr ? 'Notes vocales transformées en faits horodatés.' : 'Voice notes turned into timed facts.',
              c: 'faster-whisper',
            },
            {
              a: 'OCR',
              b: fr ? 'Transcription des pages scannées de la gazette.' : 'Transcription of scanned gazette pages.',
              c: 'Tesseract',
            },
          ]}
        />
        <p className="text-[11px] text-muted-foreground">
          {fr
            ? 'Le modèle de chat est choisi parmi ceux réellement tirés dans Ollama ; le composeur de l’assistant peut en retenir un autre. Les noms ci-dessus sont ceux avec lesquels cette instance tourne, sans variable d’environnement intermédiaire.'
            : 'The chat model is chosen from the models actually pulled into Ollama; the assistant composer can keep another one. The names above are the ones this instance runs with, with no environment variable in between.'}
        </p>
      </GuideSection>

      <GuideSection title={fr ? 'Chaîne de décision et d’approbation' : 'Decision and approval chain'} icon={Workflow}>
        <GuideTable
          headers={[
            fr ? 'Étape' : 'Step',
            fr ? 'Ce qui se passe' : 'What happens',
            fr ? 'Preuve conservée' : 'Evidence kept',
          ]}
          rows={[
            {
              a: fr ? 'Alerte' : 'Alert',
              b: fr
                ? 'Un message est rendu par l’API, écrit dans la boîte d’envoi et journalisé avec l’adresse masquée.'
                : 'A message is rendered by the API, written to the outbox and logged with the address masked.',
              c: fr ? 'Boîte d’envoi · audit' : 'Outbox · audit',
            },
            {
              a: fr ? 'Ouverture' : 'Open',
              b: fr
                ? 'L’opérateur s’authentifie (mot de passe + 2FA) avant de voir la demande.'
                : 'The operator authenticates (password + 2FA) before seeing the request.',
              c: fr ? 'Événement de session' : 'Session event',
            },
            {
              a: fr ? 'Décision' : 'Decision',
              b: fr
                ? 'Approbation ou rejet dans la console, avec motif et pièces jointes.'
                : 'Approve or reject in the console, with a reason and attachments.',
              c: fr ? 'Action journalisée' : 'Logged action',
            },
            {
              a: fr ? 'Clôture' : 'Close',
              b: fr
                ? 'Le jeton est consommé ; le lien rejoué ne produit plus d’effet.'
                : 'The token is consumed; a replayed link has no effect.',
              c: fr ? 'Hash du run' : 'Run hash',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Exploitation des services' : 'Operating the services'} icon={MessageSquare}>
        <GuideChecklist
          items={[
            {
              label: fr ? 'Modèle de chat tiré' : 'Chat model pulled',
              detail: fr
                ? 'qwen3.5:9b doit être présent dans Ollama ; sans lui, /v1/provider reste non prêt.'
                : 'qwen3.5:9b must be present in Ollama; without it, /v1/provider stays not ready.',
              state: 'ok',
            },
            {
              label: fr ? 'Collection Qdrant alignée' : 'Qdrant collection aligned',
              detail: fr
                ? 'bge-m3 produit 1024 dimensions ; une collection créée avec une autre taille doit être réindexée.'
                : 'bge-m3 produces 1024 dimensions; a collection created with another size must be reindexed.',
              state: 'watch',
            },
            {
              label: fr ? 'Services annexes' : 'Auxiliary services',
              detail: fr
                ? 'TEI (rerank), faster-whisper, Tesseract, ingestion, MCP charts et MCP docx sont sur le réseau local.'
                : 'TEI (rerank), faster-whisper, Tesseract, ingestion, MCP charts and MCP docx sit on the local network.',
              state: 'ok',
            },
          ]}
        />
      </GuideSection>

      <GuideBanner tone="success" title={fr ? 'La souveraineté est vérifiable' : 'Sovereignty is verifiable'}>
        <p>
          {fr
            ? 'Le badge fournisseur indique le service, le modèle et la résidence (sur site). Le mode est toujours local : il n’existe pas de bascule vers un fournisseur hébergé dans cette distribution.'
            : 'The provider badge shows the service, the model and the residency (on-premise). The mode is always local: this distribution has no switch to a hosted provider.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Limites assumées' : 'Accepted limits'} icon={ShieldCheck}>
        <ul className="grid gap-1.5">
          {(fr
            ? [
                'La qualité dépend du matériel : un modèle 9B demande assez de VRAM ou de RAM pour rester réactif.',
                'Un modèle non tiré n’est pas proposé : la liste vient d’Ollama, pas d’un catalogue distant.',
                'Une collection Qdrant créée avec une autre dimension ne peut pas être réutilisée sans réingestion.',
              ]
            : [
                'Quality depends on the hardware: a 9B model needs enough VRAM or RAM to stay responsive.',
                'A model that is not pulled is not offered: the list comes from Ollama, not a remote catalogue.',
                'A Qdrant collection created with another dimension cannot be reused without re-ingestion.',
              ]
          ).map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px]"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
              {item}
            </li>
          ))}
        </ul>
      </GuideSection>
    </GuideShell>
  )
}
