import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard.tsx';
import Auth from './pages/Auth.tsx';
import { supabase } from './lib/supabase.ts';

export default function App() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // 2. Register real auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-dark">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-accent border-t-transparent mx-auto"></div>
          <p className="mt-4 text-brand-textMuted font-medium">Initializing KnowledgeHub...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-dark text-brand-textMain">
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <Auth />
      )}
    </div>
  );
}
