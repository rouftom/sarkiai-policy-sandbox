import { describe, expect, test } from 'bun:test'
import { renderNotificationEmail } from './index'

describe('renderNotificationEmail', () => {
  test('renders HTML and plain text with the message and the call to action', async () => {
    const { html, text } = await renderNotificationEmail({
      locale: 'fr',
      preview: 'Rapport conjoint disponible',
      heading: 'Rapport conjoint',
      intro: 'Cameroun · santé',
      message: 'Premier paragraphe.\n\nSecond paragraphe.',
      cta: { label: 'Ouvrir la console', url: 'https://example.test/scenarios/run_1' },
      note: 'Vous recevez ce message parce que vous avez consenti aux notifications.',
    })
    expect(html).toContain('Rapport conjoint')
    expect(html).toContain('Premier paragraphe.')
    expect(html).toContain('https://example.test/scenarios/run_1')
    expect(text).toContain('Premier paragraphe.')
    expect(text).toContain('Second paragraphe.')
  })
})
