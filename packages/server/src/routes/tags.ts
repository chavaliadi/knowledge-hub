import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';

const router = Router();

// GET /tags - Fetch all tags for authenticated user
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;

  try {
    const { data, error } = await supabase
      .from('tags')
      .select('id, name')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /tags - Create a new tag (with case-insensitive duplication check)
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Tag name is required.' });
    return;
  }

  const cleanedName = name.trim().toLowerCase();

  try {
    // Check if the tag already exists (case-insensitive for the current user)
    const { data: existingTag, error: checkError } = await supabase
      .from('tags')
      .select('id, name')
      .eq('user_id', userId)
      .eq('name', cleanedName)
      .maybeSingle();

    if (checkError) {
      res.status(500).json({ error: checkError.message });
      return;
    }

    if (existingTag) {
      res.json(existingTag);
      return;
    }

    // Insert new tag
    const { data: newTag, error: createError } = await supabase
      .from('tags')
      .insert({
        user_id: userId,
        name: cleanedName
      })
      .select('id, name')
      .single();

    if (createError) {
      res.status(500).json({ error: createError.message });
      return;
    }

    res.status(201).json(newTag);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// DELETE /tags/:id - Delete a tag
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('tags')
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
      res.status(404).json({ error: 'Tag not found' });
      return;
    }

    res.json({ message: 'Tag successfully deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
