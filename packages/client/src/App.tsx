import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard.tsx';
import Auth from './pages/Auth.tsx';

export default function App() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for mock session on mount
    const savedUser = localStorage.getItem('kh_mock_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const handleLogin = (email: string) => {
    const mockUser = { id: 'user_' + Math.random().toString(36).substr(2, 9), email };
    localStorage.setItem('kh_mock_user', JSON.stringify(mockUser));
    setUser(mockUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('kh_mock_user');
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
        <Auth onLogin={handleLogin} />
      )}
    </div>
  );
}
