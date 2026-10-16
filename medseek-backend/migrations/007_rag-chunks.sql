-- RAG chunks for vector search grounded in patient medical history
-- Stores 1024-dimensional embeddings from NVIDIA nv-embedqa-e5-v5
-- Plaintext PHI is NEVER stored in this table — only the vector and source reference.
-- At retrieval time, records are fetched and decrypted via the vault service.

CREATE TABLE IF NOT EXISTS rag_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL,
  source_id   INTEGER NOT NULL,
  embedding   halfvec(2048) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate nearest neighbor cosine similarity search
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
  ON rag_chunks USING hnsw (embedding halfvec_cosine_ops);

-- B-tree index on patient_id for strict multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_rag_chunks_patient_id
  ON rag_chunks(patient_id);

-- Composite index for syncing chunks on source create/update/delete
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source
  ON rag_chunks(patient_id, source_type, source_id);
