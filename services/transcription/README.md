# Transcription service

Optional, stateless media → transcript service (Groq Whisper). Useful for policy
briefings, parliamentary hearings, and press conferences. Media is never
persisted; audio is kept in RAM (`tmpfs`) only.

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health` | Liveness + `configured` flag |
| POST | `/v1/transcribe` | Multipart audio/video → `{ text, language, segments }` |

Enabled behind the `full` / `media` compose profile. Run standalone with
`make transcription`.
