import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';

const router = Router();

// Helper to format entry database response (maps entry_tags to tags array and flattens collection_name)
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

// GET /entries - Fetch all entries for authenticated user
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { type, tag, collectionId } = req.query;

  try {
    let entryIds: string[] | null = null;

    // Filter by tag name if provided
    if (tag) {
      const { data: tagData, error: tagError } = await supabase
        .from('tags')
        .select('id')
        .eq('user_id', userId)
        .eq('name', (tag as string).trim().toLowerCase())
        .maybeSingle();

      if (tagError) {
        res.status(500).json({ error: tagError.message });
        return;
      }

      if (!tagData) {
        // Tag doesn't exist, hence no entries will match
        res.json([]);
        return;
      }

      const { data: etData, error: etError } = await supabase
        .from('entry_tags')
        .select('entry_id')
        .eq('tag_id', tagData.id);

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

    if (type) {
      dbQuery = dbQuery.eq('type', type as string);
    }

    if (collectionId) {
      dbQuery = dbQuery.eq('collection_id', collectionId as string);
    }

    if (entryIds !== null) {
      dbQuery = dbQuery.in('id', entryIds);
    }

    // Sort pinned items to the top, then newest entries first
    const { data, error } = await dbQuery
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const formattedEntries = (data || []).map(formatEntry);
    res.json(formattedEntries);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /entries/:id - Get a single entry
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('entries')
      .select('*, entry_tags(tag:tags(id, name)), collections(name), attachments(*)')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json(formatEntry(data));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /entries - Create a new entry
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { title, content, type, url, tag_ids, collection_id, is_pinned } = req.body;

  if (!title || !type) {
    res.status(400).json({ error: 'Title and Type are required fields.' });
    return;
  }

  try {
    // 1. Insert Entry
    const { data: newEntry, error: entryError } = await supabase
      .from('entries')
      .insert({
        user_id: userId,
        title,
        content: content || null,
        type,
        url: url || null,
        is_favorite: false,
        collection_id: collection_id || null,
        is_pinned: !!is_pinned
      })
      .select()
      .single();

    if (entryError) {
      res.status(500).json({ error: entryError.message });
      return;
    }

    // 2. Associate tags if present
    if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
      const joinRows = tag_ids.map((tagId: string) => ({
        entry_id: newEntry.id,
        tag_id: tagId
      }));

      const { error: joinError } = await supabase
        .from('entry_tags')
        .insert(joinRows);

      if (joinError) {
        // Rollback entry insert manually
        await supabase.from('entries').delete().eq('id', newEntry.id);
        res.status(500).json({ error: `Failed to bind tags: ${joinError.message}` });
        return;
      }
    }

    // 3. Fetch complete populated entry
    const { data: fullEntry, error: fetchError } = await supabase
      .from('entries')
      .select('*, entry_tags(tag:tags(id, name)), collections(name), attachments(*)')
      .eq('id', newEntry.id)
      .single();

    if (fetchError) {
      res.status(500).json({ error: fetchError.message });
      return;
    }

    res.status(201).json(formatEntry(fullEntry));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// PUT /entries/:id - Update an entry
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { id } = req.params;
  const { title, content, type, url, tag_ids, is_favorite, collection_id, is_pinned } = req.body;

  try {
    // 1. Update Entry
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content || null;
    if (type !== undefined) updateData.type = type;
    if (url !== undefined) updateData.url = url || null;
    if (is_favorite !== undefined) updateData.is_favorite = is_favorite;
    if (collection_id !== undefined) updateData.collection_id = collection_id || null;
    if (is_pinned !== undefined) updateData.is_pinned = is_pinned;
    updateData.updated_at = new Date().toISOString();

    const { data: updatedEntry, error: entryError } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (entryError) {
      res.status(500).json({ error: entryError.message });
      return;
    }

    if (!updatedEntry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    // 2. Sync tags
    if (tag_ids && Array.isArray(tag_ids)) {
      // Delete existing join entries
      const { error: deleteError } = await supabase
        .from('entry_tags')
        .delete()
        .eq('entry_id', id);

      if (deleteError) {
        res.status(500).json({ error: `Failed to update tags: ${deleteError.message}` });
        return;
      }

      // Re-insert new tag mappings
      if (tag_ids.length > 0) {
        const joinRows = tag_ids.map((tagId: string) => ({
          entry_id: id,
          tag_id: tagId
        }));

        const { error: joinError } = await supabase
          .from('entry_tags')
          .insert(joinRows);

        if (joinError) {
          res.status(500).json({ error: `Failed to insert tags: ${joinError.message}` });
          return;
        }
      }
    }

    // 3. Fetch full updated entry
    const { data: fullEntry, error: fetchError } = await supabase
      .from('entries')
      .select('*, entry_tags(tag:tags(id, name)), collections(name), attachments(*)')
      .eq('id', id)
      .single();

    if (fetchError) {
      res.status(500).json({ error: fetchError.message });
      return;
    }

    res.json(formatEntry(fullEntry));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// DELETE /entries/:id - Delete an entry
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json({ message: 'Entry successfully deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
