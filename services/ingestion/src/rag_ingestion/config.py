"""Environment-driven configuration for the ingestion microservice."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings loaded from environment variables / .env."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    environment: str = "development"
    service_api_key: str = ""

    # Qdrant vector knowledge base
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "policy_chunks"
    qdrant_dense_vector_name: str = "dense"
    qdrant_sparse_vector_name: str = "text"
    # fastembed model used to build the BM25 sparse vector (hybrid search).
    qdrant_sparse_model: str = "Qdrant/bm25"

    # VoyageAI embeddings
    voyage_api_key: str = ""
    voyage_embedding_model: str = "voyage-4"
    embedding_dimension: int = 1024
    embedding_batch_size: int = 128

    # Chunking
    default_chunk_size: int = 900
    default_chunk_overlap: int = 120

    # OCR fallback (scanned gazettes).
    ocr_url: str = ""

    # Defaults applied when the caller omits taxonomy fields.
    default_country: str = ""
    default_jurisdiction: str = "national"
    default_doc_type: str = "policy"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
