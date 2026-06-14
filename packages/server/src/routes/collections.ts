import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';

const router = Router();

// GET /collections - Fetch all collections for authenticated user
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;

  try {
    const { data, error } = await supabase
      .from('collections')
      .select('id, name, created_at')
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

// POST /collections - Create a new collection (with case-insensitive duplication check)
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Collection name is required.' });
    return;
  }

  const cleanedName = name.trim();

  try {
    // Check if the collection already exists (case-insensitive check for this user)
    const { data: existingCol, error: checkError } = await supabase
      .from('collections')
      .select('id, name')
      .eq('user_id', userId)
      .eq('name', cleanedName)
      .maybeSingle();

    if (checkError) {
      res.status(500).json({ error: checkError.message });
      return;
    }

    if (existingCol) {
      res.json(existingCol);
      return;
    }

    // Insert new collection
    const { data: newCol, error: createError } = await supabase
      .from('collections')
      .insert({
        user_id: userId,
        name: cleanedName
      })
      .select('id, name, created_at')
      .single();

    if (createError) {
      res.status(500).json({ error: createError.message });
      return;
    }

    res.status(201).json(newCol);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// DELETE /collections/:id - Delete a collection
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('collections')
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
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    res.json({ message: 'Collection successfully deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
