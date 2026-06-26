# 002. One match_entries RPC, Three Call Sites

## Problem
KnowledgeHub implements similarity searching across three distinct features: semantic search querying, Related Entries identification, and synchronous Duplicate Detection. We need to decide whether to design separate custom SQL/database procedures for each feature or share a single generic PostgreSQL RPC function.

## Options considered

### Option A: Feature-Specific Similarity Procedures
* **Pros**:
  - Code insulation: changes to one feature's similarity calculation (e.g., search filters) won't inadvertently modify duplicate checking or related notes logic.
  - Highly tailored optimizations can be applied individually (e.g. optimizing tag filters specifically on search and bypass on duplicate detection).
* **Cons**:
  - Code duplication: three identical cosine-similarity query functions stored in the database schema.
  - Harder schema maintenance: schema updates or modifications to vector calculations must be replicated three times across SQL migrations.

### Option B: Shared Generic `match_entries` RPC function
* **Pros**:
  - Single point of maintenance: one clean PostgreSQL database function (`match_entries`) using the `pgvector` operator.
  - Parameters (query vector, similarity threshold, count limit, optional metadata filters) are passed at execution time, allowing each call site to customize its query constraints.
  - Call sites use tuned thresholds specific to their needs: search (low `0.1` threshold), related entries (moderate `0.75` threshold), and duplicate detection (strict `0.92` near-match threshold).
* **Cons**:
  - Unified blast radius: any edit or optimization to the `match_entries` database signature risks breaking all three features at once.

## Decision
We chose **Option B (Shared Generic `match_entries` RPC)**. It is invoked across all three call sites in the Express routes:
1. `search.ts` (AI Search Mode, threshold: `0.1`, filters applied)
2. `entries.ts` (Related Entries, threshold: `0.75`, self-filtering)
3. `entries.ts` (Duplicate check before save, threshold: `0.92`, limit: 1)

## Trade-offs
* Any database-level schema migrations changing the signature of `match_entries` require comprehensive testing against search, related entries, and duplicate checks. We trade modular isolation for code reuse and database simplicity.
