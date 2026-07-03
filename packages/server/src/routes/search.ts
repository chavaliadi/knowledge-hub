import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';
import { getEmbedding } from '../lib/gemini';

const router = Router();

// Helper to format entry response (maps entry_tags to tags array and flattens collection_name)
const formatEntry = (entry: any) => {
  if (!entry) return null;
  const tags = entry.entry_tags 
    ? entry.entry_tags.map((et: any) => et.tag).filter(Boolean)
    : [];
  const collection_name = entry.collections ? entry.collections.name : null;
  const attachments = entry.attachments || [];
  const formatted = { ...entry, tags, collection_name, attachments };
  delete formatted.entry_tags;
  delete formatted.collections;
  return formatted;
};

// GET /search - Query entries matching query text, filter type, tag ID, and collection ID
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { q, type, tagId, collectionId, ai } = req.query;

  try {
    // 1. AI Semantic Search path (Now Hybrid Search with RRF)
    if (ai === 'true' && q && typeof q === 'string' && q.trim()) {
      const t0 = Date.now();
      let queryEmbedding: number[];
      try {
        queryEmbedding = await getEmbedding(q);
      } catch (embedErr: any) {
        res.status(500).json({ error: `Failed to compute query embedding: ${embedErr.message}` });
        return;
      }

      // Fetch entries matching primary filters (type, collection) to restrict search scope
      let filterQuery = supabase
        .from('entries')
        .select('id')
        .eq('user_id', userId);

      if (type && typeof type === 'string' && type.trim()) {
        filterQuery = filterQuery.eq('type', type.trim());
      }
      if (collectionId && typeof collectionId === 'string' && collectionId.trim()) {
        filterQuery = filterQuery.eq('collection_id', collectionId.trim());
      }

      const { data: filteredRows, error: filterErr } = await filterQuery;
      if (filterErr) {
        res.status(500).json({ error: `Filter search failed: ${filterErr.message}` });
        return;
      }
      const allowedEntryIds = new Set((filteredRows || []).map((r: any) => r.id));

      if (allowedEntryIds.size === 0) {
        res.json([]);
        return;
      }

      // Step A: Vector search across chunks
      const { data: matchedChunks, error: rpcError } = await supabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.01, // low threshold to capture broad matches
        match_count: 100
      });

      if (rpcError) {
        res.status(500).json({ error: `Chunk similarity search failed: ${rpcError.message}` });
        return;
      }

      const vectorEntriesMap = new Map<string, number>();
      (matchedChunks || []).forEach((chunk: any) => {
        if (allowedEntryIds.has(chunk.entry_id)) {
          const score = chunk.similarity || 0;
          const existing = vectorEntriesMap.get(chunk.entry_id);
          if (existing === undefined || score > existing) {
            vectorEntriesMap.set(chunk.entry_id, score);
          }
        }
      });

      const vectorRankedList = Array.from(vectorEntriesMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);

      // Step B: Keyword search (ILIKE pattern matching)
      const searchStr = `%${q.trim()}%`;
      const { data: keywordRows, error: keywordErr } = await supabase
        .from('entries')
        .select('id, title, content')
        .eq('user_id', userId)
        .or(`title.ilike.${searchStr},content.ilike.${searchStr},url.ilike.${searchStr}`);

      if (keywordErr) {
        res.status(500).json({ error: `Keyword search failed: ${keywordErr.message}` });
        return;
      }

      const keywordRankedList = (keywordRows || [])
        .filter((entry: any) => allowedEntryIds.has(entry.id))
        .map((entry: any) => {
          let score = 0;
          const titleLower = (entry.title || '').toLowerCase();
          const contentLower = (entry.content || '').toLowerCase();
          const qLower = q.toLowerCase();
          if (titleLower.includes(qLower)) score += 10;
          if (contentLower.includes(qLower)) score += 2;
          return { id: entry.id, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(item => item.id);

      // Step C: Reciprocal Rank Fusion (RRF)
      const k = 60;
      const rrfScores = new Map<string, number>();

      vectorRankedList.forEach((id, index) => {
        const rank = index + 1;
        const rrfContribution = 1 / (k + rank);
        rrfScores.set(id, rrfContribution);
      });

      keywordRankedList.forEach((id, index) => {
        const rank = index + 1;
        const rrfContribution = 1 / (k + rank);
        rrfScores.set(id, (rrfScores.get(id) || 0) + rrfContribution);
      });

      let finalEntryIds = Array.from(rrfScores.keys())
        .sort((a, b) => (rrfScores.get(b) || 0) - (rrfScores.get(a) || 0));

      // Filter by tagId if provided
      if (tagId && typeof tagId === 'string' && tagId.trim()) {
        const { data: etData, error: etError } = await supabase
          .from('entry_tags')
          .select('entry_id')
          .eq('tag_id', tagId.trim());

        if (etError) {
          res.status(500).json({ error: etError.message });
          return;
        }

        const taggedIds = new Set(etData ? etData.map((et: any) => et.entry_id) : []);
        finalEntryIds = finalEntryIds.filter((id: string) => taggedIds.has(id));
      }

      // Limit results
      const limitIds = finalEntryIds.slice(0, 40);

      if (limitIds.length === 0) {
        res.json([]);
        return;
      }

      // Fetch complete entry structures for all matched IDs
      const { data: fullEntries, error: fetchError } = await supabase
        .from('entries')
        .select('*, entry_tags(tag:tags(id, name)), collections(name), attachments(*)')
        .in('id', limitIds);

      if (fetchError) {
        res.status(500).json({ error: fetchError.message });
        return;
      }

      const formattedResults = (fullEntries || [])
        .map((entry: any) => {
          const formatted = formatEntry(entry);
          return {
            ...formatted,
            similarity: vectorEntriesMap.get(entry.id) || 0 // pass maximum chunk vector similarity back
          };
        })
        .sort((a: any, b: any) => {
          // Pinned entries take priority, then ordered by RRF sorting
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return limitIds.indexOf(a.id) - limitIds.indexOf(b.id);
        });

      console.log(`Hybrid Search execution: ${Date.now() - t0}ms`);
      res.json(formattedResults);
      return;
    }

    // 2. Normal Keyword Search path
    let entryIds: string[] | null = null;

    // Filter by tagId if provided
    if (tagId && typeof tagId === 'string' && tagId.trim()) {
      const { data: etData, error: etError } = await supabase
        .from('entry_tags')
        .select('entry_id')
        .eq('tag_id', tagId.trim());

      if (etError) {
        res.status(500).json({ error: etError.message });
        return;
      }

      entryIds = etData ? etData.map((et: any) => et.entry_id) : [];
    }

    let dbQuery = supabase
      .from('entries')
      .select('*, entry_tags(tag:tags(id, name)), collections(name), attachments(*)')
      .eq('user_id', userId);

    if (type && typeof type === 'string' && type.trim()) {
      dbQuery = dbQuery.eq('type', type.trim());
    }

    if (collectionId && typeof collectionId === 'string' && collectionId.trim()) {
      dbQuery = dbQuery.eq('collection_id', collectionId.trim());
    }

    // Apply tag filters if applicable
    if (entryIds !== null) {
      dbQuery = dbQuery.in('id', entryIds);
    }

    // Text search query filtering on title, content, or url
    if (q && typeof q === 'string' && q.trim()) {
      const searchStr = `%${q.trim()}%`;
      dbQuery = dbQuery.or(`title.ilike.${searchStr},content.ilike.${searchStr},url.ilike.${searchStr}`);
    }

    // Prioritize pinned entries first, then order chronologically
    const { data, error } = await dbQuery
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const formattedResults = (data || []).map(formatEntry);
    res.json(formattedResults);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
