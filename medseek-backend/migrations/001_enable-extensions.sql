-- Enable required PostgreSQL extensions
-- pgvector: for embedding-based similarity search (RAG, Phase 3+)
-- pg_trgm: for fuzzy/typo-tolerant text matching (Phase 1 search)
-- unaccent: for accent-insensitive search

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
