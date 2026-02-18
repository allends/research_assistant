---
title: Vector Search
tags:
  - reference
  - search
  - embeddings
  - ai
created: 2026-01-10
modified: 2026-02-12
---

# Vector Search

Notes on vector similarity search, embeddings, and hybrid retrieval — the foundation of [[research-assistant]]'s search layer.

## Embedding Models

### embeddinggemma-300M (used by QMD)

- 300M parameters, quantized to Q8_0 (~300MB)
- GGUF format, runs locally via node-llama-cpp
- Good balance of quality and speed for document retrieval
- 768-dimensional embeddings

### Alternatives Considered

- **OpenAI text-embedding-3-small** — better quality but requires API calls (not local-first)
- **BGE-small** — similar size, slightly lower quality on MTEB benchmarks
- **Nomic Embed** — good quality, but larger model

## Retrieval Strategies

### BM25 (Keyword Search)

Classic term-frequency based search. Fast, interpretable, no ML needed.

- **Pros:** Exact term matching, fast, no embeddings needed
- **Cons:** Misses synonyms and semantic similarity

### Vector Search (Semantic)

Embed query and documents, find nearest neighbors by cosine similarity.

- **Pros:** Captures meaning, handles synonyms
- **Cons:** Can miss exact terms, requires embedding model

### Hybrid (QMD's Approach)

QMD combines both via reciprocal rank fusion:

1. BM25 search → ranked results
2. Vector search → ranked results
3. Reciprocal rank fusion to merge rankings
4. Optional LLM re-ranking (Qwen3-reranker) for final ordering

This is the `qmd query` command — the default in [[research-assistant]].

## Index Structures

### Flat / Brute-Force

- sqlite-vec uses flat search by default
- O(n) per query — fine for vaults under 100k documents
- No index maintenance overhead

### HNSW (Hierarchical Navigable Small World)

- O(log n) search, but complex to maintain
- Used by pgvector, Chroma, Weaviate
- Overkill for personal vault scale

### IVF (Inverted File Index)

- Clusters vectors, searches only relevant clusters
- Good for large-scale (1M+ vectors)

## Chunking Strategy

QMD's chunking approach:
- 900 tokens per chunk, 15% overlap
- Prefers splitting on markdown heading boundaries
- Preserves document structure and context

This matters for [[research-assistant]] because vault notes vary wildly in length — from a quick [[fleeting-thought]] to a long reference like this one.

#reference #search #ml
