import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';

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
  const { q, type, tagId, collectionId } = req.query;

  try {
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
