/** Retrieval contract. One backend in this deployment: Qdrant. */

import type { KbChunk, RetrievalQuery } from '@sps/shared'

export interface Retriever {
  search(query: RetrievalQuery): Promise<KbChunk[]>
}
