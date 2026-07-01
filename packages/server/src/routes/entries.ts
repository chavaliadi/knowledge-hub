import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';
import { getEmbedding, getAISummaryAndTags, classifyEntryDomains } from '../lib/gemini';
import { extractTextFromAttachment } from '../lib/attachments';

const getEntryEmbedText = (title: string, type: string, content: string | null) => {
  return `Title: ${title}\nType: ${type}\nContent: ${content || ''}`;
};

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
  const { title, content, type, url, tag_ids, collection_id, is_pinned, attachments } = req.body;

  if (!title || !type) {
    res.status(400).json({ error: 'Title and Type are required fields.' });
    return;
  }

  try {
    // Extract text from attachments if present
    let attachmentsText = '';
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const extractedTexts = [];
      for (const att of attachments) {
        const text = await extractTextFromAttachment(supabase, att.file_path, att.mime_type, att.file_name);
        if (text) {
          extractedTexts.push(`[File: ${att.file_name}]\n${text}`);
        }
      }
      if (extractedTexts.length > 0) {
        attachmentsText = extractedTexts.join('\n\n');
      }
    }

    // Generate embedding vector using Google Gemini (including attachment content)
    let embeddingVector: number[] | null = null;
    try {
      let embedText = getEntryEmbedText(title, type, content);
      if (attachmentsText) {
        embedText += `\n\nAttachments Content:\n${attachmentsText}`;
      }
      embeddingVector = await getEmbedding(embedText);
    } catch (embedErr: any) {
      console.error('Failed to generate embedding for new entry:', embedErr.message);
    }

    // Generate AI Summary and suggested tags (including attachment content preview)
    let aiSummary: string | null = null;
    let aiTags: string[] | null = null;
    try {
      let summaryText = content || '';
      if (attachmentsText) {
        summaryText += `\n[Attachments Content Preview]: ${attachmentsText.slice(0, 1000)}`;
      }
      const aiResult = await getAISummaryAndTags(title, type, summaryText);
      aiSummary = aiResult.summary;
      aiTags = aiResult.tags;
    } catch (aiErr: any) {
      console.error('Failed to generate AI summary/tags for entry:', aiErr.message);
    }

    // Generate domains classification using Gemini
    let entryDomains: string[] | null = null;
    try {
      entryDomains = await classifyEntryDomains(title, content, type);
    } catch (classErr: any) {
      console.error('Failed to classify entry domains:', classErr.message);
    }

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
        is_pinned: !!is_pinned,
        embedding: embeddingVector,
        summary: aiSummary,
        ai_tags: aiTags,
        domains: entryDomains
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

    // 3. Associate attachments if present
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const attachmentRows = attachments.map((att: any) => ({
        user_id: userId,
        entry_id: newEntry.id,
        file_path: att.file_path,
        file_name: att.file_name,
        file_size: att.file_size,
        mime_type: att.mime_type
      }));

      const { error: attError } = await supabase
        .from('attachments')
        .insert(attachmentRows);

      if (attError) {
        // Rollback entry insert manually
        await supabase.from('entries').delete().eq('id', newEntry.id);
        res.status(500).json({ error: `Failed to save attachments: ${attError.message}` });
        return;
      }
    }

    // 4. Fetch complete populated entry
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
  const { title, content, type, url, tag_ids, is_favorite, collection_id, is_pinned, attachments } = req.body;

  try {
    // If text fields or attachments are updated, we need to regenerate embeddings and summary.
    let embeddingVector: number[] | undefined = undefined;
    let aiSummary: string | undefined = undefined;
    let aiTags: string[] | undefined = undefined;
    let entryDomains: string[] | undefined = undefined;
    
    if (title !== undefined || type !== undefined || content !== undefined || attachments !== undefined) {
      const { data: existingEntry, error: fetchErr } = await supabase
        .from('entries')
        .select('title, type, content, attachments(*)')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingEntry) {
        const finalTitle = title !== undefined ? title : existingEntry.title;
        const finalType = type !== undefined ? type : existingEntry.type;
        const finalContent = content !== undefined ? content : existingEntry.content;
        
        // Final attachments to be embedded
        const finalAttachments = attachments !== undefined ? attachments : (existingEntry.attachments || []);
        
        let attachmentsText = '';
        if (finalAttachments && Array.isArray(finalAttachments) && finalAttachments.length > 0) {
          const extractedTexts = [];
          for (const att of finalAttachments) {
            const text = await extractTextFromAttachment(supabase, att.file_path, att.mime_type || att.mimeType, att.file_name || att.name);
            if (text) {
              extractedTexts.push(`[File: ${att.file_name || att.name}]\n${text}`);
            }
          }
          if (extractedTexts.length > 0) {
            attachmentsText = extractedTexts.join('\n\n');
          }
        }

        try {
          let embedText = getEntryEmbedText(finalTitle, finalType, finalContent);
          if (attachmentsText) {
            embedText += `\n\nAttachments Content:\n${attachmentsText}`;
          }
          embeddingVector = await getEmbedding(embedText);
        } catch (embedErr: any) {
          console.error('Failed to regenerate embedding on update:', embedErr.message);
        }

        try {
          let summaryText = finalContent || '';
          if (attachmentsText) {
            summaryText += `\n[Attachments Content Preview]: ${attachmentsText.slice(0, 1000)}`;
          }
          const aiResult = await getAISummaryAndTags(finalTitle, finalType, summaryText);
          aiSummary = aiResult.summary;
          aiTags = aiResult.tags;
        } catch (aiErr: any) {
          console.error('Failed to regenerate AI summary/tags on update:', aiErr.message);
        }

        try {
          entryDomains = await classifyEntryDomains(finalTitle, finalContent, finalType);
        } catch (classErr: any) {
          console.error('Failed to regenerate domains on update:', classErr.message);
        }
      }
    }

    // 1. Update Entry
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content || null;
    if (type !== undefined) updateData.type = type;
    if (url !== undefined) updateData.url = url || null;
    if (is_favorite !== undefined) updateData.is_favorite = is_favorite;
    if (collection_id !== undefined) updateData.collection_id = collection_id || null;
    if (is_pinned !== undefined) updateData.is_pinned = is_pinned;
    if (embeddingVector !== undefined) updateData.embedding = embeddingVector;
    if (aiSummary !== undefined) updateData.summary = aiSummary;
    if (aiTags !== undefined) updateData.ai_tags = aiTags;
    if (entryDomains !== undefined) updateData.domains = entryDomains;
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

    // 3. Sync attachments
    if (attachments && Array.isArray(attachments)) {
      // Fetch existing attachments for this entry
      const { data: existingAtts, error: fetchAttsError } = await supabase
        .from('attachments')
        .select('*')
        .eq('entry_id', id);

      if (fetchAttsError) {
        res.status(500).json({ error: `Failed to fetch existing attachments: ${fetchAttsError.message}` });
        return;
      }

      const existingAttsList = existingAtts || [];

      // Identify deleted attachments (present in DB, but not in update payload)
      const newPaths = new Set(attachments.map((a: any) => a.file_path));
      const toDelete = existingAttsList.filter((a: any) => !newPaths.has(a.file_path));

      // Identify newly added attachments (present in update payload, but not in DB)
      const existingPaths = new Set(existingAttsList.map((a: any) => a.file_path));
      const toInsert = attachments.filter((a: any) => !existingPaths.has(a.file_path));

      // Delete removed attachments from database & Supabase Storage
      if (toDelete.length > 0) {
        const deleteIds = toDelete.map((a: any) => a.id);
        const deletePaths = toDelete.map((a: any) => a.file_path);

        const { error: dbDeleteError } = await supabase
          .from('attachments')
          .delete()
          .in('id', deleteIds);

        if (dbDeleteError) {
          res.status(500).json({ error: `Failed to delete attachments from DB: ${dbDeleteError.message}` });
          return;
        }

        // Delete files from storage
        const { error: storageDeleteError } = await supabase.storage
          .from('Knowledge-Hub')
          .remove(deletePaths);

        if (storageDeleteError) {
          console.error('Failed to delete files from storage:', storageDeleteError.message);
        }
      }

      // Insert new attachments
      if (toInsert.length > 0) {
        const insertRows = toInsert.map((att: any) => ({
          user_id: userId,
          entry_id: id,
          file_path: att.file_path,
          file_name: att.file_name,
          file_size: att.file_size,
          mime_type: att.mime_type
        }));

        const { error: insertError } = await supabase
          .from('attachments')
          .insert(insertRows);

        if (insertError) {
          res.status(500).json({ error: `Failed to insert new attachments: ${insertError.message}` });
          return;
        }
      }
    }

    // 4. Fetch full updated entry
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
    // 1. Fetch attachments to get file paths for storage cleanup
    const { data: attachments, error: fetchError } = await supabase
      .from('attachments')
      .select('file_path')
      .eq('entry_id', id);

    if (fetchError) {
      res.status(500).json({ error: `Failed to fetch attachments for deletion: ${fetchError.message}` });
      return;
    }

    // 2. Delete entry (cascades deletion to DB attachment rows)
    const { data: deletedEntry, error: deleteError } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    if (!deletedEntry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    // 3. Delete physical files from Supabase Storage
    if (attachments && attachments.length > 0) {
      const filePaths = attachments.map((att: any) => att.file_path);
      const { error: storageDeleteError } = await supabase.storage
        .from('Knowledge-Hub')
        .remove(filePaths);

      if (storageDeleteError) {
        console.error('Failed to delete files from storage:', storageDeleteError.message);
      }
    }

    res.json({ message: 'Entry successfully deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /entries/:id/related - Fetch up to 5 similar entries for context
router.get('/:id/related', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    // 1. Fetch current entry's embedding
    const { data: entry, error: fetchError } = await supabase
      .from('entries')
      .select('embedding')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      res.status(500).json({ error: fetchError.message });
      return;
    }

    if (!entry || !entry.embedding) {
      res.json([]);
      return;
    }

    // 2. Query similarity matches
    const { data: matchedRows, error: rpcError } = await supabase.rpc('match_entries', {
      query_embedding: entry.embedding,
      match_threshold: 0.75, // threshold tuned for topic relations
      match_count: 6, // 5 + 1 buffer for self
    });

    if (rpcError) {
      res.status(500).json({ error: `RPC match_entries failed: ${rpcError.message}` });
      return;
    }

    // 3. Filter out self and limit to 5
    const relatedIds = (matchedRows || [])
      .filter((r: any) => r.id !== id)
      .slice(0, 5)
      .map((r: any) => r.id);

    if (relatedIds.length === 0) {
      res.json([]);
      return;
    }

    // 4. Fetch complete entry details for related items
    const { data: fullEntries, error: getFullError } = await supabase
      .from('entries')
      .select('*, entry_tags(tag:tags(id, name)), collections(name), attachments(*)')
      .in('id', relatedIds);

    if (getFullError) {
      res.status(500).json({ error: getFullError.message });
      return;
    }

    // Map matched score back to full entry lists
    const similarityMap = new Map<string, number>(
      matchedRows.map((r: any) => [r.id, r.similarity] as [string, number])
    );

    const formattedResults = (fullEntries || [])
      .map((item: any) => {
        const formatted = formatEntry(item);
        return {
          ...formatted,
          similarity: similarityMap.get(item.id)
        };
      })
      .sort((a: any, b: any) => (similarityMap.get(b.id) || 0) - (similarityMap.get(a.id) || 0));

    res.json(formattedResults);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /entries/check-duplicate - Check for duplicates synchronously
router.post('/check-duplicate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { title, content, type } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'Title is required for duplicate check.' });
    return;
  }

  try {
    const supabase = getSupabaseClient(req.headers.authorization);
    
    // 1. Generate text embedding synchronously using the title, type, and content
    const cleanType = (type && ['note', 'bookmark', 'snippet', 'idea', 'resource'].includes(type)) ? type : 'note';
    const embedText = `Title: ${title.trim()}\nType: ${cleanType}\nContent: ${(content || '').trim()}`;
    const queryEmbedding = await getEmbedding(embedText);

    // 2. Call pgvector similarity search RPC
    const { data: matchedRows, error: rpcError } = await supabase.rpc('match_entries', {
      query_embedding: queryEmbedding,
      match_threshold: 0.92, // High threshold for near-duplicate identification
      match_count: 1
    });

    if (rpcError) {
      res.status(500).json({ error: `Similarity RPC failed: ${rpcError.message}` });
      return;
    }

    if (!matchedRows || matchedRows.length === 0) {
      res.json({ duplicate: null });
      return;
    }

    // 3. Retrieve populated details for the duplicate item
    const duplicateRow = matchedRows[0];
    const { data: fullEntry, error: fetchError } = await supabase
      .from('entries')
      .select('*, entry_tags(tag:tags(id, name)), collections(name), attachments(*)')
      .eq('id', duplicateRow.id)
      .maybeSingle();

    if (fetchError || !fullEntry) {
      res.json({ duplicate: null });
      return;
    }

    const formatted = formatEntry(fullEntry);
    res.json({
      duplicate: {
        ...formatted,
        similarity: duplicateRow.similarity
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
