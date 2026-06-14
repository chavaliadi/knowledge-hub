import type { Response, NextFunction, Request } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization token missing or invalid format' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Authorization token missing' });
    return;
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: error?.message || 'Invalid or expired session token' });
      return;
    }

    // Attach authenticated user details to the request object
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal server authentication error' });
  }
};
