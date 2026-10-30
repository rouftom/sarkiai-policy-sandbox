/**
 * @sps/gazette · scanned gazette ingestion for the policy sandbox.
 *
 * Deterministic layout (projection profiles) and on-premise Tesseract OCR,
 * with provenance that survives into the knowledge base. No cloud vision model
 * and no segmentation service: the geometry is computed here, the text is read
 * by the local OCR container.
 */

export * from './image.js'
export * from './layout.js'
export * from './ocr.js'
export * from './pipeline.js'
