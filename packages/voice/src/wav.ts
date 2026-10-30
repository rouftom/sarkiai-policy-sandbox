/**
 * WAV probing for browser recordings.
 *
 * The voice route accepts a single WAV upload; the browser records one with the
 * Web Audio API. Parsing the header here keeps the duration and sample rate
 * authoritative instead of asking the transcription service to guess, and lets
 * an empty or truncated upload fail before a network round-trip.
 */

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** 1 = integer PCM, 3 = IEEE float. */
  audioFormat: number
  dataBytes: number
  durationMs: number
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = ''
  for (let i = 0; i < length; i += 1) value += String.fromCharCode(bytes[offset + i] ?? 0)
  return value
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/** Read the chunks of a RIFF/WAVE file. Returns null when it is not a WAV. */
export function probeWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.byteLength < 44) return null
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null

  const data = view(bytes)
  let offset = 12
  let format: Omit<WavInfo, 'dataBytes' | 'durationMs'> | null = null
  let dataBytes = 0

  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4)
    const size = data.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ' && body + 16 <= bytes.byteLength) {
      format = {
        audioFormat: data.getUint16(body, true),
        channels: data.getUint16(body + 2, true),
        sampleRate: data.getUint32(body + 4, true),
        bitsPerSample: data.getUint16(body + 14, true),
      }
    }
    if (id === 'data') {
      // A streamed WAV may declare size 0 or 0xFFFFFFFF; clamp to what is there.
      const available = Math.max(0, bytes.byteLength - body)
      dataBytes = size === 0 || size > available ? available : size
      break
    }
    offset = body + size + (size % 2)
  }

  if (!format) return null
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8)
  return {
    ...format,
    dataBytes,
    durationMs: bytesPerSecond > 0 ? Math.round((dataBytes / bytesPerSecond) * 1000) : 0,
  }
}

/** Why an upload cannot be transcribed, or null when it is usable. */
export function wavError(info: WavInfo | null): string | null {
  if (!info) return 'The audio is not a RIFF/WAVE file.'
  if (info.dataBytes === 0) return 'The WAV contains no audio samples.'
  return null
}
