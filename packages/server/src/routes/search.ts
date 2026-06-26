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
    // 1. AI Semantic Search path
    if (ai === 'true' && q && typeof q === 'string' && q.trim()) {
      const t0 = Date.now();
      let queryEmbedding: number[];
      try {
        queryEmbedding = await getEmbedding(q);
      } catch (embedErr: any) {
        res.status(500).json({ error: `Failed to compute query embedding: ${embedErr.message}` });
        return;
      }

      // Invoke RPC similarity search
      const { data: matchedRows, error: rpcError } = await supabase.rpc('match_entries', {
        query_embedding: queryEmbedding,
        match_threshold: 0.1, // lower threshold to match more concepts
        match_count: 40,
        filter_type: (type && typeof type === 'string' && type.trim()) ? type.trim() : null,
        filter_collection_id: (collectionId && typeof collectionId === 'string' && collectionId.trim()) ? collectionId.trim() : null
      });

      if (rpcError) {
        res.status(500).json({ error: `RPC similarity search failed: ${rpcError.message}` });
        return;
      }

      let matchedIds = matchedRows ? matchedRows.map((r: any) => r.id) : [];

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
        matchedIds = matchedIds.filter((id: string) => taggedIds.has(id));
      }

      if (matchedIds.length === 0) {
        res.json([]);
        return;
      }

      // Fetch complete entry structures for all matched IDs
      const { data: fullEntries, error: fetchError } = await supabase
        .from('entries')
        .select('*, entry_tags(tag:tags(id, name)), collections(name), attachments(*)')
        .in('id', matchedIds);

      if (fetchError) {
        res.status(500).json({ error: fetchError.message });
        return;
      }

      const similarityMap = new Map<string, number>(
        matchedRows.map((r: any) => [r.id, r.similarity] as [string, number])
      );

      const formattedResults = (fullEntries || [])
        .map((entry: any) => {
          const formatted = formatEntry(entry);
          return {
            ...formatted,
            similarity: similarityMap.get(entry.id)
          };
        })
        .sort((a: any, b: any) => {
          // Pinned entries take priority, then ordered by descending similarity score
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return (similarityMap.get(b.id) || 0) - (similarityMap.get(a.id) || 0);
        });

      console.log(`AI Search path execution: ${Date.now() - t0}ms`);
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
