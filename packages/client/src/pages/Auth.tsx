import React, { useState } from 'react';
import { BookOpen, ShieldAlert, Lock, Mail, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase.ts';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Sign in using Supabase client SDK
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (signInError) {
          throw signInError;
        }
      } else {
        // Sign up using Supabase client SDK
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });
        if (signUpError) {
          throw signUpError;
        }
        alert('Registration successful! Please check your email inbox if verification is enabled.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-brand-dark relative overflow-hidden">
      {/* Background Decorative Blobs */}
      <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-brand-accent/5 filter blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-entry-idea/5 filter blur-[100px] animate-pulse"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center text-center mb-8 select-none">
          <div className="p-3.5 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 text-brand-accentLight shadow-inner mb-3">
            <BookOpen size={32} className="glow-text" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-textMain leading-tight">Welcome to KnowledgeHub</h1>
          <p className="mt-2 text-xs font-semibold text-brand-textMuted uppercase tracking-wider">Save what you learn. Instantly retrieve it.</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 border-brand-border/60 shadow-2xl relative overflow-hidden">
          
          {/* Tab selector */}
          <div className="flex border-b border-brand-border/40 pb-4 mb-6">
            <button
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 text-center pb-2 text-sm font-semibold border-b-2 transition-all select-none
                ${isLogin 
                  ? 'border-brand-accent text-brand-textMain' 
                  : 'border-transparent text-brand-textMuted hover:text-brand-textMain'
                }
              `}
            >
              Sign In
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 text-center pb-2 text-sm font-semibold border-b-2 transition-all select-none
                ${!isLogin 
                  ? 'border-brand-accent text-brand-textMain' 
                  : 'border-transparent text-brand-textMuted hover:text-brand-textMain'
                }
              `}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-medium">
                <ShieldAlert size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Email field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-brand-textMuted">
                  <Mail size={15} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="block w-full pl-10 pr-3 py-2.5 bg-brand-dark border border-brand-border rounded-xl text-sm text-brand-textMain placeholder-brand-textMuted/40 focus:outline-none focus:border-brand-accent/50 focus:bg-brand-dark/80 transition-all font-medium"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-brand-textMuted">
                  <Lock size={15} />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-2.5 bg-brand-dark border border-brand-border rounded-xl text-sm text-brand-textMain placeholder-brand-textMuted/40 focus:outline-none focus:border-brand-accent/50 focus:bg-brand-dark/80 transition-all font-medium"
                />
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 w-full py-2.5 mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm text-white font-bold rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.99] transition-all select-none"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Sign Up'}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Privacy note */}
          <p className="mt-6 text-[10px] text-center text-brand-textMuted/50 font-semibold leading-relaxed">
            Your knowledge stays private. Data is stored securely in your Supabase database.
          </p>
        </div>
      </div>
    </div>
  );
}
