# 001. Embedding Provider: Gemini vs OpenAI

## Problem
KnowledgeHub requires high-quality text embeddings to power AI semantic search, Conversational RAG, Related Entries discovery, and synchronous Duplicate Detection. A decision is required on whether to use OpenAI's embedding models or Google's Gemini embedding models.

## Options considered

### Option A: OpenAI `text-embedding-3` (1536-dimensional)
* **Pros**: 
  - State-of-the-art embedding quality and semantic representation.
  - Standard industry choice with mature SDK ecosystem.
  - Larger embedding space (1536 dimensions) captures subtle linguistic nuances.
* **Cons**:
  - Requires setting up a second third-party provider account (OpenAI).
  - Doubles the surface area for environment keys, API billing, and quota limits.
  - 1536-dimensional vectors double the storage size and indexing overhead within the `pgvector` database compared to 768 dimensions.

### Option B: Google Gemini `gemini-embedding-001` (768-dimensional)
* **Pros**:
  - Leverages the existing developer relationship with Google Gemini (already used for OCR, summaries, and chat features).
  - Consolidated architecture: requires only a single API key, unified billing account, and one vendor footprint.
  - 768-dimensional output is half the size of OpenAI's, reducing PostgreSQL storage requirements and increasing search speeds. Supports configurable dimensions if needed.
* **Cons**:
  - Smaller semantic vector space (768 dimensions) could theoretically result in minor loss of retrieval nuance compared to a larger 1536-dimension footprint.
  - Locked into Gemini-specific embedding vectors, meaning any future vendor change will require recalculating the embeddings of all saved documents.

## Decision
We chose **Option B (Google Gemini `gemini-embedding-001`)** with a fixed dimension size of 768.

## Trade-offs
* We accepted a smaller overall dimensions footprint (768 dimensions), which is highly suited for note-to-note similarity and user-scoped bookmark searching, though it may have slightly less capacity for complex semantic hierarchy than 1536 dimensions.
* Switching to a different LLM or embedding provider later will require running a database-wide reindexing script to update all document rows, as embeddings are incompatible across different models.
