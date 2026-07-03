import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';

const router = Router();

// GET /api/graph - Retrieve nodes and edges for Knowledge Graph
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;

  try {
    // 1. Fetch entries (nodes)
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('id, title, type')
      .eq('user_id', userId);

    if (entriesError) {
      res.status(500).json({ error: `Failed to fetch graph nodes: ${entriesError.message}` });
      return;
    }

    // 2. Fetch concept links (edges)
    const { data: links, error: linksError } = await supabase
      .from('concept_links')
      .select('id, source_id, target_id, relationship_type')
      .eq('user_id', userId);

    if (linksError) {
      res.status(500).json({ error: `Failed to fetch graph edges: ${linksError.message}` });
      return;
    }

    // Format for client consumption
    const formattedLinks = (links || []).map((link: any) => ({
      id: link.id,
      source: link.source_id,
      target: link.target_id,
      type: link.relationship_type
    }));

    res.json({
      nodes: entries || [],
      links: formattedLinks
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
