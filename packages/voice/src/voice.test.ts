import { describe, expect, test } from 'bun:test'
import { LocalAsrClient } from './asr.js'
import { formatTimestamp, toVoiceFacts } from './facts.js'
import { probeWav, wavError } from './wav.js'

interface WavOptions {
  channels?: number
  sampleRate?: number
  bitsPerSample?: number
  audioFormat?: number
  samples?: number
}

/** Build a RIFF/WAVE file in memory: header, fmt chunk, PCM data. */
function makeWav(options: WavOptions = {}): Uint8Array {
  const channels = options.channels ?? 1
  const sampleRate = options.sampleRate ?? 24_000
  const bitsPerSample = options.bitsPerSample ?? 16
  const audioFormat = options.audioFormat ?? 1
  const samples = options.samples ?? sampleRate
  const dataBytes = samples * channels * (bitsPerSample / 8)
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  write(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, audioFormat, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true)
  view.setUint16(32, channels * (bitsPerSample / 8), true)
  view.setUint16(34, bitsPerSample, true)
  write(36, 'data')
  view.setUint32(40, dataBytes, true)
  return new Uint8Array(buffer)
}

describe('WAV inspection', () => {
  test('reads the format and computes duration', () => {
    const info = probeWav(makeWav({ samples: 12_000 }))
    expect(info).not.toBeNull()
    expect(info?.sampleRate).toBe(24_000)
    expect(info?.channels).toBe(1)
    expect(info?.bitsPerSample).toBe(16)
    expect(info?.durationMs).toBe(500)
    expect(wavError(info)).toBeNull()
  })

  test('rejects a file that is not a WAV and an empty one', () => {
    expect(wavError(probeWav(new Uint8Array([1, 2, 3])))).toContain('RIFF/WAVE')
    expect(wavError(probeWav(makeWav({ samples: 0 })))).toContain('no audio samples')
  })
})

describe('LocalAsrClient', () => {
  test('maps Whisper segments to millisecond turns', async () => {
    let url = ''
    const client = new LocalAsrClient({
      baseUrl: 'http://transcription:8000',
      fetchImpl: (async (input: string | URL | Request) => {
        url = String(input)
        return new Response(
          JSON.stringify({ text: 'Bonjour. Incident.', segments: [{ start: 0, end: 0.4, text: 'Bonjour.' }] }),
          { status: 200 },
        )
      }) as unknown as typeof fetch,
    })
    const transcript = await client.transcribe({ audio: makeWav(), languageBias: ['French'] })
    expect(url).toBe('http://transcription:8000/v1/transcribe?language=fr')
    expect(transcript.turns[0]?.endMs).toBe(400)
    expect(transcript.engine).toBe('faster-whisper')
    expect(transcript.durationMs).toBe(1000)
  })

  test('rejects an unusable upload before spending a request', async () => {
    let called = false
    const client = new LocalAsrClient({
      baseUrl: 'http://transcription:8000',
      fetchImpl: (async () => {
        called = true
        return new Response('{}')
      }) as unknown as typeof fetch,
    })
    await expect(client.transcribe({ audio: new Uint8Array([1, 2, 3]) })).rejects.toThrow(/RIFF\/WAVE/)
    expect(called).toBe(false)
  })

  test('surfaces the service error body', async () => {
    const client = new LocalAsrClient({
      baseUrl: 'http://transcription:8000',
      fetchImpl: (async () => new Response('{"error":"bad audio"}', { status: 400 })) as unknown as typeof fetch,
    })
    await expect(client.transcribe({ audio: makeWav() })).rejects.toThrow(/400.*bad audio/)
  })
})

describe('timed facts', () => {
  test('formats offsets', () => {
    expect(formatTimestamp(0)).toBe('T+00:00')
    expect(formatTimestamp(12_400)).toBe('T+00:12')
    expect(formatTimestamp(3_723_000)).toBe('T+01:02:03')
  })

  test('orders turns and keeps the speaker label', () => {
    const facts = toVoiceFacts({
      sessionId: 's1',
      transcript: '',
      durationMs: 5000,
      turns: [
        { turnId: 2, startMs: 3000, endMs: 5000, text: '  Deuxième.  ', speaker: 'B' },
        { turnId: 1, startMs: 500, endMs: 2000, text: 'Premier.' },
        { turnId: 3, startMs: 2000, endMs: 2500, text: '   ' },
      ],
      engine: 'faster-whisper',
      model: 'large-v3',
    })
    expect(facts.map((fact) => fact.text)).toEqual(['Premier.', 'Deuxième.'])
    expect(facts[0]?.at).toBe('T+00:00')
    expect(facts[1]?.at).toBe('T+00:03')
    expect(facts[1]?.speaker).toBe('B')
    expect(facts[1]?.id).toBe('s1:2')
  })

  test('falls back to one fact when there are no turns', () => {
    const facts = toVoiceFacts({
      sessionId: 's2',
      transcript: 'Une note sans segmentation.',
      durationMs: 4000,
      turns: [],
      engine: 'faster-whisper',
      model: 'faster-whisper',
    })
    expect(facts).toHaveLength(1)
    expect(facts[0]?.atMs).toBe(0)
  })
})
