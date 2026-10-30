/**
 * @sps/voice · voice notes as timed, attributable facts.
 *
 * On-premise only: faster-whisper (`services/transcription`). The rest of the
 * engine only sees `VoiceTranscript` and `VoiceFact`.
 */

export * from './wav.js'
export * from './asr.js'
export * from './facts.js'
