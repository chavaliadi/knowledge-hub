import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Brain, Sparkles, Loader2, RefreshCw, HelpCircle, Award, Compass, Layout } from 'lucide-react';

interface TopicSuggestion {
  name: string;
  rationale: string;
}

interface IntelligenceReport {
  overall_score: number;
  domain_scores: Record<string, number>;
  missing_topics: TopicSuggestion[];
  insights: string;
  generated_at: string;
}

export default function IntelligenceDashboard() {
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [activeTopicIndex, setActiveTopicIndex] = useState<number | null>(null);

  const fetchReport = async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const data = await api.getIntelligenceReport(forceRefresh);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch intelligence report. Make sure database migrations are applied.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const getScoreBand = (score: number) => {
    if (score < 30) return { label: 'Novice', color: 'text-rose-400 border-rose-500/20 bg-rose-500/5', barColor: 'bg-rose-500' };
    if (score < 60) return { label: 'Competent', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5', barColor: 'bg-amber-500' };
    if (score < 85) return { label: 'Advanced', color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5', barColor: 'bg-indigo-500' };
    return { label: 'Expert', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5', barColor: 'bg-emerald-500' };
  };

  const formatCacheTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-brand-textMuted select-none">
        <Loader2 size={32} className="animate-spin text-purple-500 mb-4" />
        <h3 className="text-sm font-bold text-brand-textMain">Analyzing Knowledge Base</h3>
        <p className="text-xs text-brand-textMuted/70 mt-1 max-w-xs text-center leading-relaxed">
          Evaluating file characters, tags density, recency logs, and domain spread matrix...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8 max-w-xl mx-auto text-center select-none">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 mb-6 flex justify-center w-fit mx-auto shadow-md">
          <Brain size={28} className="animate-pulse" />
        </div>
        <h3 className="text-base font-bold text-brand-textMain mb-2">Failed to load analytics</h3>
        <p className="text-sm text-brand-textMuted leading-relaxed mb-6">
          {error.includes('migrations') ? (
            <>
              Database migrations are missing. Please run <code className="px-1.5 py-0.5 rounded bg-brand-dark font-mono text-xs border border-brand-border text-brand-textMain">schema_v6.sql</code> in the Supabase SQL editor to create the necessary tables.
            </>
          ) : error}
        </p>
        <button
          onClick={() => fetchReport(false)}
          className="px-4 py-2 bg-brand-accent hover:bg-brand-accentLight text-xs text-white font-bold rounded-xl shadow-md transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!report) return null;

  const band = getScoreBand(report.overall_score);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto select-none animate-in fade-in duration-300">
      
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-brand-border/20 pb-5">
        <div>
          <h2 className="text-xl font-bold text-brand-textMain tracking-tight">Knowledge Intelligence</h2>
          <p className="text-xs text-brand-textMuted mt-0.5">AI-assisted analysis of your developer knowledge profile.</p>
        </div>
        
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className="text-[10px] font-bold text-brand-textMuted/65 uppercase tracking-wider">
            Cached {formatCacheTime(report.generated_at)}
          </span>
          <button
            onClick={() => fetchReport(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-card hover:bg-brand-card/70 border border-brand-border/60 rounded-xl text-xs font-semibold text-brand-textMain hover:text-brand-accentLight select-none transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh Analysis</span>
          </button>
        </div>
      </div>

      {/* Grid Stats Block */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Gauge Widget */}
        <div className="glass-card p-6 flex flex-col items-center justify-center text-center relative border-brand-border/40 min-h-[220px]">
          <div className="absolute top-4 right-4 relative">
            <button
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={() => setShowTooltip(!showTooltip)}
              className="p-1 rounded-full text-brand-textMuted/50 hover:text-brand-textMain transition-colors"
            >
              <HelpCircle size={15} />
            </button>
            {showTooltip && (
              <div className="absolute right-0 bottom-full mb-2 w-52 p-3 bg-brand-dark/95 border border-brand-border/80 rounded-xl text-[10px] text-brand-textMuted leading-normal z-30 shadow-xl animate-in fade-in slide-in-from-bottom-1 duration-150">
                <span className="font-bold text-brand-textMain block mb-1">Knowledge Health Score Formula</span>
                Calculated dynamically from:
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>30% Domain Spread Coverage</li>
                  <li>25% Note Length/Content Depth</li>
                  <li>20% Tag Link Density per Entry</li>
                  <li>25% Activity Recency (past 30 days)</li>
                </ul>
              </div>
            )}
          </div>

          <div className="relative flex items-center justify-center w-28 h-28 rounded-full border-[6px] border-brand-border/25">
            {/* Simple circle bar progress border fallback */}
            <div className={`absolute inset-0 rounded-full border-[6px] border-transparent border-t-purple-500 rotate-45 opacity-20`} />
            <div className="flex flex-col items-center">
              <span className="text-3xl font-extrabold text-brand-textMain leading-none tracking-tight">{report.overall_score}</span>
              <span className="text-[9px] uppercase font-bold text-brand-textMuted/55 tracking-wider mt-1">Health index</span>
            </div>
          </div>

          <div className={`mt-4 px-3 py-1 border rounded-full text-[10px] font-bold tracking-wide uppercase select-none ${band.color}`}>
            Level: {band.label}
          </div>
        </div>

        {/* Gemini Overall Insight */}
        <div className="md:col-span-2 glass-card p-6 flex flex-col justify-between border-brand-border/40 min-h-[220px]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-purple-400">
              <Sparkles size={16} className="animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-textMuted">AI Profile Insight</h3>
            </div>
            
            <p className="text-base font-semibold text-brand-textMain leading-relaxed italic pr-4">
              "{report.insights}"
            </p>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-brand-textMuted/50 font-bold border-t border-brand-border/20 pt-4 mt-4">
            <Award size={12} />
            <span>AI assessment based on character volumes, tags, and frequency distributions.</span>
          </div>
        </div>
      </div>

      {/* Domain Breakdown & Suggestions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Domain Scores Bar */}
        <div className="glass-card p-6 border-brand-border/40">
          <div className="flex items-center gap-2 mb-5">
            <Layout size={15} className="text-brand-accentLight" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-textMuted">Domain Coverage Breakdown</h3>
          </div>
          
          <div className="space-y-4">
            {Object.entries(report.domain_scores).map(([domain, pct]) => (
              <div key={domain} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-brand-textMain">
                  <span>{domain}</span>
                  <span className="text-brand-textMuted">{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-brand-border/25 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${band.barColor}`} 
                    style={{ width: `${pct}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suggested Next Topics */}
        <div className="glass-card p-6 border-brand-border/40">
          <div className="flex items-center gap-2 mb-5">
            <Compass size={15} className="text-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-textMuted">AI Study Suggestions</h3>
          </div>

          <div className="space-y-3">
            {report.missing_topics.length === 0 ? (
              <div className="text-xs text-brand-textMuted/40 italic p-2 text-center">
                All domain records are fully aligned. No suggestions available.
              </div>
            ) : (
              report.missing_topics.map((topic, idx) => {
                const isActive = activeTopicIndex === idx;
                return (
                  <div 
                    key={topic.name}
                    className="p-3.5 rounded-xl bg-brand-dark/40 border border-brand-border/40 hover:border-brand-accent/30 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brand-textMain flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                        {topic.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTopicIndex(isActive ? null : idx)}
                        className="text-[10px] font-bold text-brand-accentLight hover:underline"
                      >
                        {isActive ? 'Hide rationale' : 'View rationale'}
                      </button>
                    </div>
                    
                    {isActive && (
                      <p className="text-xs text-brand-textMuted leading-relaxed mt-2.5 pt-2.5 border-t border-brand-border/20 animate-in fade-in slide-in-from-top-1 duration-150 font-medium">
                        {topic.rationale}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
