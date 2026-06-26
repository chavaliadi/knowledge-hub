# KnowledgeHub V2 — Improvement Plan (Final)

**How to use this doc:** This is your reference plan for every improvement we discussed. Don't try to do it all at once. Pick one module, follow its steps, check things off, move on. Modules are ordered by priority — do them in this order unless you have a specific reason not to.

---

## Product Principles

KnowledgeHub is not trying to become another Notion, NotebookLM, or ChatGPT.

Every feature must do at least one of these:
- ✓ Help users **capture** knowledge.
- ✓ Help users **connect** knowledge.
- ✓ Help users **retrieve** knowledge.
- ✓ Help users **understand** their knowledge.

If a new idea doesn't strengthen one of these, it doesn't get added — no matter how cool it sounds. This is the rule that keeps the project from sliding back into "10 random AI features."

---

## Priority order

| Order | Module | Time | Why this order |
|---|---|---|---|
| 1 | Related Entries | 2-3 days | Reuses infra you already have. Lowest risk, fast win. |
| 2 | Duplicate Detection | 1-2 days | Same infra as #1, just a different trigger point. Build right after. |
| 3 | Knowledge Intelligence Dashboard | 5-7 days | Your signature feature. Needs real time — don't rush it. |
| 4 | Explain This | 0.5-1 day | Small, but check first if `ChatPanel.tsx` already covers this. |
| 5 | Export | 0.5 day | Small polish item. Do whenever you have a spare half-day. |

**Do not build all 5 in one sprint.** Finish one, ship it, use it for a few days, then move to the next.

---

## Module 1: Related Entries

**Goal:** When viewing an entry, show 3-5 similar entries automatically — no manual tagging needed.

**Why this works:** You already compute an embedding for every entry (`gemini.ts`, stored via `schema_v4.sql`) and you already have a working similarity search (`match_entries` RPC using pgvector + `hnsw` index). This feature is just calling that same RPC from a new place. Zero new AI calls, zero new cost.

**Success metric:** 90% of entries you manually know are related to each other show up in each other's Top 5.

### Backend steps

1. In `entries.ts`, add a new route:
   ```
   GET /api/entries/:id/related
   ```
2. Logic:
   - Look up the entry's existing embedding (already stored — don't regenerate it).
   - Call `match_entries` with that embedding.
   - Exclude the entry's own ID from the results.
   - Limit to 5 results.
   - Filter out anything below your similarity threshold (start at `0.75`, see tuning step below).
3. Return: `id`, `title`, `type`, `similarity score` for each result.

Sketch:
```ts
router.get('/:id/related', async (req, res) => {
  const entry = await getEntryById(req.params.id);
  if (!entry?.embedding) return res.json({ related: [] });

  const { data } = await supabase.rpc('match_entries', {
    query_embedding: entry.embedding,
    match_threshold: 0.75,
    match_count: 6, // 5 + buffer for self
  });

  const related = data.filter(r => r.id !== entry.id).slice(0, 5);
  res.json({ related });
});
```

No caching needed — pgvector with `hnsw` is fast enough to query live every time.

### Frontend steps

1. In `EntryDetail.tsx`, fire the `related` fetch when the entry loads (in parallel with other data — don't block the main render on it).
2. Render a "Related" section below the main content, reusing `EntryCard.tsx` styling (a smaller/mini version is fine).
3. Empty state: if there are zero related entries, either hide the section completely or show a quiet "No related entries yet" — never show an empty box.

### Tuning (don't skip this — it matters more than the code)

1. Pick 3-4 entries you know are genuinely related to each other (e.g. two Redis notes, two queue notes).
2. Pick 2-3 entries you know are unrelated.
3. Hit the endpoint manually for each and look at the similarity scores returned.
4. Adjust `match_threshold` until related entries consistently clear it and unrelated ones don't.
5. **Write down the final number you land on** — that's your documented, defensible threshold if anyone asks how it was chosen.

A noisy "related" list (showing things that obviously aren't related) will kill trust in the feature immediately — spend the 20-30 minutes here.

### Later idea: "Why related?" — backlog, not v1

It's tempting to show "✓ Redis ✓ BullMQ ✓ Workers" under each related entry. One catch: a cosine similarity score doesn't actually contain that information — you can't extract "shared concepts" from a single number. If you want this later, build it as a **tag/keyword-overlap proxy computed once at save time** (not a live Gemini call per view, which reintroduces the exact "AI on every page load" problem this plan is designed to avoid). Be clear with yourself that this approximates the embedding match, it doesn't explain it.

### Checklist
- [ ] `GET /related` endpoint built
- [ ] Tested manually with real entry IDs
- [ ] Threshold tuned with known related/unrelated pairs, value documented
- [ ] Related strip added to `EntryDetail.tsx`
- [ ] Empty state handled
- [ ] Loading state doesn't block the rest of the page

---

## Module 2: Duplicate Detection

**Goal:** When saving a new entry, warn the user if something near-identical already exists.

**Why this works:** Same `match_entries` infra as Related Entries, just triggered at save-time instead of view-time, with a much higher similarity threshold (you want "basically the same note," not "related topic").

**Success metric:** Near-identical notes get flagged reliably, false-positive rate stays low enough that it doesn't get annoying (track this informally as you use it — if it fires on notes that aren't really duplicates, raise the threshold).

### The one timing wrinkle

Your current pipeline generates embeddings **asynchronously** (a background reindex job catches anything missing one). For duplicate detection, you need the embedding **before** the save completes — so this one check has to run synchronously at submit time. This means one extra Gemini call at the moment of submission (just for the title + content text — small and fast).

### Backend steps

1. Add a new route in `entries.ts`:
   ```
   POST /api/entries/check-duplicate
   ```
2. Logic:
   - Generate an embedding inline for the submitted title + content (sync Gemini call).
   - Call `match_entries` with a high threshold (start at `0.92`).
   - Return the top match if one exists above that threshold, otherwise `null`.

Sketch:
```ts
router.post('/check-duplicate', async (req, res) => {
  const { title, content } = req.body;
  const embedding = await generateEmbedding(`${title} ${content}`);

  const { data } = await supabase.rpc('match_entries', {
    query_embedding: embedding,
    match_threshold: 0.92,
    match_count: 1,
  });

  res.json({ duplicate: data[0] ?? null });
});
```

### Frontend steps

1. In `EntryForm.tsx`, intercept the submit handler: call `check-duplicate` first, *before* the actual create request.
2. If a match comes back, show a modal:
   - "Looks similar to **[existing title]** ([X]% match)"
   - Buttons: **Open existing** / **Create anyway**
3. If no match, submit proceeds as normal.

**Skip "Merge" for v1.** Merging two entries' tags, attachments, and content is a meaningfully harder feature on its own. Don't build it until you've seen, from real usage, that duplicate detection actually fires often enough to be worth it.

### Tuning

Same approach as Module 1 — test with a couple of entries you know are near-duplicates and a couple you know are just topically related (but not duplicates). Make sure 0.92 actually separates "same note" from "related note." Adjust and document the final value.

### Checklist
- [ ] `POST /check-duplicate` endpoint built
- [ ] Sync embedding generation confirmed working
- [ ] Threshold tuned (start at 0.92), value documented
- [ ] Modal added to `EntryForm.tsx` submit flow
- [ ] "Open existing" and "Create anyway" both work
- [ ] Merge explicitly deferred — not built in v1

---

## Module 3: Knowledge Intelligence Dashboard

**Goal:** A homepage that answers "what do I actually know, what's missing, and what should I learn next" — generated from your real saved entries, not manual self-assessment.

**Why this is your best feature:** Most PKM tools just show note counts. None show "here's your real coverage and here's what to study next" derived from your own data. This is the one piece of the plan that's genuinely differentiated.

**Core architecture rule — don't skip this:**
```
Database → Statistics → Domain Analysis → Gemini → Natural Language Summary
```
AI explains your data. It does not create your data. Anything that's just counting, grouping, or aggregating is plain code (SQL). Gemini only touches the reasoning layer on top — next-topic suggestions and the one-line insight. This is what makes the dashboard explainable instead of a black box.

**Success metric:** Dashboard load is under 500ms on a cache hit (~95% of loads), with exactly one Gemini call per refresh cycle — not per page view.

### Step 1 — Lock a fixed domain list

Don't let domains emerge dynamically — pick a fixed list upfront. Example:
- Backend
- Frontend
- AI/ML
- System Design
- Databases
- DevOps/Cloud
- (add 1-2 more if relevant to your notes)

### Step 2 — Classify entries into domains

1. One-time backfill script: for each existing entry, one Gemini call classifies it into one (or more) of your fixed domains.
2. Store this classification on the entry (new column or join table).
3. For all *new* entries going forward, run this same classification as part of the existing save/embedding pipeline (you already have a background job pattern from `reindex.ts` — extend it, don't build a new one).

### Step 3 — Build the score (transparent, not AI-invented)

Design an actual formula, something like:
```
score = (tag coverage × weight) + (recency × weight) + (entry depth × weight) + (domain spread × weight)
```
Pick your own weights, but the point is: you can explain exactly how the number was produced.

**Display it honestly.** Don't show a bare "84%" — that invites "why 84?" with no good answer ready. Instead show a qualitative band plus the number, with the formula one click away:
```
Knowledge Health
Advanced — 84/100
[ⓘ How is this calculated?]
```
The popover explains the formula from Step 3 in plain language. Showing your work is the impressive part — hiding it isn't.

### Step 4 — Backend endpoint

```
GET /api/intelligence
```
Pipeline:
1. Load entries, summaries, tags, domain classifications (already stored — no new AI calls here).
2. Compute domain percentages and the overall score (your formula from Step 3 — plain code, not AI).
3. One Gemini call: feed it the aggregated data, ask for 3-5 "next topics" + one short insight sentence.
4. Return everything as structured JSON.

**Cache this and frame it as a report, not a live view.** Store the result in a `knowledge_reports` table (`id`, `user_id`, `generated_at`, `overall_score`, `domain_scores`, `missing_topics`, `insights`). On the dashboard, show "Generated yesterday" with a manual "Refresh AI Analysis" button — this sets the right expectation (it's a periodic report) instead of implying live updates. Regenerate on whichever trigger is simplest to start: every N new entries, every 24 hours, or purely on manual refresh.

### Step 5 — Frontend dashboard page

Build as a new page/route. Sections, in priority order:
1. **Knowledge Health score** — qualitative band + number + "how calculated" popover.
2. **Domain breakdown** — bar per domain with %.
3. **Next topics** — 3-5 suggested concepts, with a one-line "why" (e.g. "you already know Redis Queues, Kafka is a natural next step").
4. **One insight sentence** — short, AI-generated, e.g. "You have strong backend coverage but limited cloud/deployment notes."

Reuse your existing card/badge styling from `EntryCard.tsx` — don't design a new visual system from scratch.

### What to explicitly leave out of v1

- Per-domain "known concepts" vs "missing concepts" granular lists
- Recently-learned topics timeline
- Multiple rotating insights
- Dynamic/AI-generated taxonomy

These are real ideas but they roughly double the build time for marginal benefit. Add them later only if the core dashboard proves useful in daily use.

### Checklist
- [ ] Fixed domain list decided
- [ ] Classification backfill script run on existing entries
- [ ] New entries auto-classified going forward
- [ ] Score formula designed and documented (so you can explain it)
- [ ] Score displayed as band + number + popover, not a bare %
- [ ] `GET /api/intelligence` endpoint built
- [ ] `knowledge_reports` table created, caching working
- [ ] "Generated [time]" + manual refresh button shown in UI
- [ ] Dashboard page built with score + domains + next topics + insight
- [ ] Tested with both a near-empty account and a full one

---

## Module 4: Explain This

**Goal:** On any entry, a button that explains the topic *using your own saved notes as context* — connecting it to things you already know, instead of generic AI explanation.

**Success metric:** Every explanation references at least 2 of the user's own related entries — if it can't, it should say so explicitly rather than quietly going generic.

**Before building anything — check this first:** Look at what `ChatPanel.tsx` and the `/chat` SSE router already do. Your RAG chat already retrieves relevant notes and answers grounded in your saved knowledge. "Explain This" might just be a different entry point into that same pipeline (pre-filled with "explain [this entry's topic] using my notes" instead of a free-form question), not a new system. If that's true, this could be a few hours of UI work, not a new backend feature.

### If it does need new backend work

1. New endpoint (or reuse `/chat` with a specific prompt template):
   ```
   POST /api/entries/:id/explain
   ```
2. Pipeline:
   - Retrieve the current entry's content.
   - Retrieve related entries (reuse Module 1's logic — you'll already have this built).
   - Construct a prompt that explicitly references the related entries: *"Explain [topic]. The user already has notes on [related topic X, Y]. Connect this explanation to what they already know. If introducing something new, say so explicitly."*
   - Stream the response back (reuse your existing SSE pattern from `chat.ts`).

### Frontend

Add an "Explain This" button on `EntryDetail.tsx`. On click, either open the existing chat panel pre-filled with the prompt, or show the explanation inline below the entry — whichever is less work given what you find in the check-first step above.

### Checklist
- [ ] Checked whether `ChatPanel.tsx` / `/chat` already covers this
- [ ] Decided: reuse existing chat vs. new endpoint
- [ ] If new: endpoint built, references related entries
- [ ] Button added to `EntryDetail.tsx`
- [ ] Tested that explanations actually reference the user's own notes, not just generic AI output

---

## Module 5: Export

**Goal:** Let users download their entries/collections as Markdown (or JSON). Small feature, but signals the product respects user data ownership.

**Success metric:** A single entry exports to a clean, readable `.md` file with no missing data (tags, attachments list included).

### Steps

1. Single entry: button on `EntryDetail.tsx` → "Export as Markdown" → generates a `.md` file client-side (title, content, tags, attachments list) and triggers a download.
2. Collection export (optional, do single-entry first): button on a collection view → loops through entries → zips into one file or one `.md` per entry in a `.zip`.
3. JSON export (optional): same data, raw JSON — useful if anyone ever wants to migrate data elsewhere.

This is mostly frontend work — formatting + triggering a browser download. No backend changes needed if you build the markdown string client-side from data you already have loaded.

### Checklist
- [ ] Single-entry Markdown export working
- [ ] Collection export (optional)
- [ ] JSON export (optional)

---

## Design principles to keep in mind across all 5 modules

1. **Don't use AI where plain code works.** Counting, grouping, filtering = SQL. Only reach for Gemini when something genuinely requires reasoning or generation.
2. **Cache expensive AI calls.** Never regenerate AI-derived data on every page load. Time-based, count-based, or manual-refresh — pick one per feature.
3. **Make scores and decisions explainable.** If a number or recommendation can't be explained simply, don't show it as if it's certain. Surface confidence where relevant ("high confidence" vs "you may benefit from...").
4. **Check for overlap with your other projects before building.** Conquer owns interviews/assessment. Conceptra owns teaching/study planning. KnowledgeHub owns capture/organize/connect/analyze. If a new feature starts looking like it belongs to one of those, it probably does — don't rebuild it here.
5. **Reuse infrastructure before building new infrastructure.** Modules 1 and 2 are proof: the embedding + `match_entries` RPC you built for search quietly powers two more features for free. Look for these opportunities before writing new pipelines.
6. **Start with a concrete threshold, then tune it.** Don't leave similarity thresholds as abstract "tune empirically" — pick a real starting number (0.75, 0.92 above), test against known examples, document whatever you land on.

---

## Backlog — postponed on purpose, not forgotten

These ideas came up and are reasonable, but don't belong in this build:

- **"Why related?" explanations** — see Module 1 note. Only build as a cached tag-overlap proxy, never a live per-view LLM call.
- **"Referenced By" / bidirectional connections** — worth a caveat: if built purely on embedding similarity, "Related" and "Referenced By" will end up near-identical, since cosine similarity is roughly symmetric (if A is close to B, B is close to A). A genuinely different "Referenced By" needs real directional links — explicit references inside entry content — which doesn't exist in the current data model yet. Don't build this as described until that changes; it'll just be a duplicate list with a different label.
- **Knowledge Graph, Timeline, Sharing, Collaboration, real-time sync, mobile app, offline mode** — all genuinely good ideas, all Version 3+. Building these before the five modules above are solid and in real use risks the exact unfocused sprawl this whole plan exists to avoid.

---

## Tech stack note: Groq vs Gemini

Came up separately, worth recording the conclusion here since it affects how these modules get built.

**Don't do a full provider swap right now.** Checked current docs: Groq now has vision-capable models that can do OCR, but Groq's own embeddings offering is still weak — even Groq's own RAG examples route embeddings through other providers, not Groq itself. Swapping would mean re-embedding everything already stored and possibly changing the vector dimension in your schema (currently 768-dim, `hnsw`-indexed) for unclear quality gain.

**Keep Gemini for:** embeddings, OCR/multimodal processing. This is the part with real migration cost and no clear upgrade path on Groq today.

**Consider Groq for (later, not now):** pure text-generation calls — chat streaming responses, summaries, the Dashboard's insight text, Explain This. This is exactly what Groq's fast inference is built for, and you already use Groq/Llama on CodeVitals, so there's no new-tool learning cost. This is a small, reversible swap (one API call's destination) — not in the same category as the embeddings decision.

**When to revisit:** after Modules 1-2 ship, not alongside them. A provider change is its own task competing for the same time — don't bundle it into this build.

---

## Version 2 Complete

KnowledgeHub V2 is complete when:

- ✓ Related Entries work reliably (threshold tuned and documented).
- ✓ Duplicate Detection prevents accidental duplicates without excessive false positives.
- ✓ Knowledge Dashboard analyzes the user's knowledge with an explainable score.
- ✓ Explain This connects new concepts to existing notes.
- ✓ Users can export their data.

**No additional AI features get added before deployment.** Anything new — Knowledge Graph, Mentor modes, Timeline, anything not in this document — goes into a Version 3 backlog, not into this build. This line exists specifically to stop the project from drifting again. If you're tempted to add something mid-build, write it in the Backlog section above and keep going.

---

## Quick time reference

| Module | Time | Status |
|---|---|---|
| 1. Related Entries | 2-3 days | ☐ |
| 2. Duplicate Detection | 1-2 days | ☐ |
| 3. Knowledge Intelligence Dashboard | 5-7 days | ☐ |
| 4. Explain This | 0.5-1 day | ☐ |
| 5. Export | 0.5 day | ☐ |

**Total: roughly 9-13 days of focused work**, spread out — not a single sprint. Fit it around your July/August commitments (System Design Visualizer, CodeVitals, aggregator+bot, MCP linter, ECE projects) rather than instead of them.
