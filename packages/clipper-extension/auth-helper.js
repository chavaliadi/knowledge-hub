/**
 * Pure helper function to extract Supabase authentication token from a localStorage-like object.
 *
 * @param {Storage | Record<string, any> | null | undefined} storage
 * @returns {string | null}
 */
export function extractSupabaseAuthToken(storage) {
  if (!storage) return null;

  // Handle standard Web Storage API (with length / key / getItem methods)
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        try {
          const raw = typeof storage.getItem === 'function' ? storage.getItem(key) : storage[key];
          if (!raw) continue;
          const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (data && typeof data.access_token === 'string') {
            return data.access_token;
          }
        } catch (e) {
          // Ignore JSON parse errors and continue
        }
      }
    }
    return null;
  }

  // Handle plain key-value object map
  const keys = Object.keys(storage);
  for (const key of keys) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const raw = storage[key];
        if (!raw) continue;
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (data && typeof data.access_token === 'string') {
          return data.access_token;
        }
      } catch (e) {
        // Ignore JSON parse errors and continue
      }
    }
  }

  return null;
}
