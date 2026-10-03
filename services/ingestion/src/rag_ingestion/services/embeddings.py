"""VoyageAI embedding service (document + query vectors)."""

from typing import List

import voyageai

from rag_ingestion.config import settings


class EmbeddingService:
    """Wraps VoyageAI to produce 1024-dim document/query embeddings."""

    def __init__(self, api_key: str = None, model: str = None):
        self.client = voyageai.Client(api_key=api_key or settings.voyage_api_key)
        self.model = model or settings.voyage_embedding_model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed a batch of chunks with input_type='document'. Fails fast on empty output."""
        if not texts:
            return []

        vectors: List[List[float]] = []
        batch = settings.embedding_batch_size
        for start in range(0, len(texts), batch):
            window = texts[start : start + batch]
            result = self.client.embed(window, model=self.model, input_type="document")
            if not result.embeddings or len(result.embeddings) != len(window):
                raise RuntimeError("VoyageAI returned an unexpected number of embeddings.")
            vectors.extend(result.embeddings)
        return vectors

    def embed_query(self, text: str) -> List[float]:
        """Embed a single retrieval query with input_type='query'."""
        result = self.client.embed([text], model=self.model, input_type="query")
        if not result.embeddings:
            raise RuntimeError("VoyageAI returned no embedding for the query.")
        return result.embeddings[0]
