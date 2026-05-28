// Day 1: Mock Supabase Client. This will be replaced with real @supabase/supabase-js on Day 2.

export const supabase = {
  auth: {
    getUser: async (_token?: string) => {
      const savedUser = localStorage.getItem('kh_mock_user');
      if (savedUser) {
        return { data: { user: JSON.parse(savedUser) }, error: null };
      }
      return { data: { user: null }, error: new Error('No session') };
    },
    signOut: async () => {
      localStorage.removeItem('kh_mock_user');
      return { error: null };
    }
  }
};
