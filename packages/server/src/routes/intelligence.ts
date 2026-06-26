import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';
import { generateInsightAndNextTopics } from '../lib/gemini';

const router = Router();

const FIXED_DOMAINS = [
  'Backend',
  'Frontend',
  'AI/ML',
  'System Design',
  'Databases',
  'DevOps/Cloud'
];

// GET /intelligence - Fetch intelligence report analytics
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const t0 = Date.now();
  const supabase = getSupabaseClient(req.headers.authorization);
  const userId = req.user!.id;
  const { refresh } = req.query;

  try {
    // 1. Check for existing cached report in database
    if (refresh !== 'true') {
      const { data: cachedReport, error: cacheErr } = await supabase
        .from('knowledge_reports')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cacheErr && cachedReport) {
        // Cache exists. Check if it was generated in the last 24 hours
        const cacheAgeMs = Date.now() - new Date(cachedReport.generated_at).getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (cacheAgeMs < oneDayMs) {
          console.log('Returning cached knowledge intelligence report.');
          console.log(`Dashboard Report generation (cache hit): ${Date.now() - t0}ms`);
          res.json(cachedReport);
          return;
        }
      }
    }

    console.log('Generating fresh knowledge intelligence report...');

    // 2. Fetch all user entries with tags and attachments counts
    const { data: entries, error: fetchErr } = await supabase
      .from('entries')
      .select('id, content, domains, created_at, updated_at, entry_tags(tag_id), attachments(id)')
      .eq('user_id', userId);

    if (fetchErr) {
      res.status(500).json({ error: `Failed to fetch entries: ${fetchErr.message}` });
      return;
    }

    if (!entries || entries.length === 0) {
      // Empty state
      const emptyReport = {
        user_id: userId,
        generated_at: new Date().toISOString(),
        overall_score: 0,
        domain_scores: FIXED_DOMAINS.reduce((acc, d) => ({ ...acc, [d]: 0 }), {}),
        missing_topics: FIXED_DOMAINS.map(d => ({ name: d, rationale: `Create your first note in ${d} to start tracking metrics.` })),
        insights: "Welcome to KnowledgeHub! Create or clip your first developer save entries to build your AI intelligence report."
      };
      res.json(emptyReport);
      return;
    }

    // 3. Compute score stats
    const totalEntries = entries.length;
    
    // Domain counts & coverage
    const domainCounts: Record<string, number> = FIXED_DOMAINS.reduce((acc, d) => ({ ...acc, [d]: 0 }), {} as Record<string, number>);
    let classifiedCount = 0;

    for (const entry of entries) {
      if (entry.domains && Array.isArray(entry.domains)) {
        entry.domains.forEach(d => {
          if (FIXED_DOMAINS.includes(d)) {
            domainCounts[d] = (domainCounts[d] || 0) + 1;
            classifiedCount++;
          }
        });
      }
    }

    // Metric component weights
    // a. Domain Spread / Coverage (30% weight)
    const activeDomains = Object.values(domainCounts).filter(c => c > 0).length;
    const spreadScore = (activeDomains / FIXED_DOMAINS.length) * 100;

    // b. Content Depth: avg characters (25% weight)
    let totalContentCharCount = 0;
    entries.forEach(e => {
      totalContentCharCount += (e.content || '').length;
    });
    const avgLength = totalContentCharCount / totalEntries;
    const depthScore = Math.min((avgLength / 1000) * 100, 100); // 1000+ chars = full marks

    // c. Tag Density: avg tag attachments (20% weight)
    let totalTagsCount = 0;
    entries.forEach(e => {
      if (e.entry_tags && Array.isArray(e.entry_tags)) {
        totalTagsCount += e.entry_tags.length;
      }
    });
    const avgTags = totalTagsCount / totalEntries;
    const tagScore = Math.min((avgTags / 3) * 100, 100); // 3+ tags per entry = full marks

    // d. Recency: updates in past 30 days (25% weight)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recencyCount = entries.filter(e => {
      const entryTime = new Date(e.updated_at || e.created_at).getTime();
      return entryTime > thirtyDaysAgo.getTime();
    }).length;
    const recencyScore = Math.min((recencyCount / 10) * 100, 100); // 10+ updates in month = full marks

    // Weighted Overall Score
    const overallScore = Math.round(
      (spreadScore * 0.3) + 
      (depthScore * 0.25) + 
      (tagScore * 0.20) + 
      (recencyScore * 0.25)
    );

    // Compute relative percentage scores per domain based on maximum frequency
    const maxDomainCount = Math.max(...Object.values(domainCounts), 1);
    const domainScores = FIXED_DOMAINS.reduce((acc, d) => {
      // Normalize percentages relative to active categories
      const pct = Math.round(((domainCounts[d] || 0) / maxDomainCount) * 100);
      return { ...acc, [d]: pct };
    }, {} as Record<string, number>);

    // 4. Run Gemini Insight service
    let aiInsight = '';
    let suggestions: { name: string; rationale: string }[] = [];

    try {
      const aiResult = await generateInsightAndNextTopics(domainCounts, totalEntries);
      aiInsight = aiResult.insight;
      suggestions = aiResult.topics;
    } catch (aiErr: any) {
      console.error('Failed to generate intelligence dashboard analysis:', aiErr.message);
      aiInsight = 'Continue saving notes and bookmarks to generate tailored domain insights.';
      suggestions = FIXED_DOMAINS.filter(d => domainCounts[d] === 0).slice(0, 3).map(d => ({
        name: d,
        rationale: `You currently have 0 saves mapped to the ${d} domain. Start exploring items here.`
      }));
    }

    // 5. Save report to DB cache
    const { data: newReport, error: saveErr } = await supabase
      .from('knowledge_reports')
      .insert({
        user_id: userId,
        overall_score: overallScore,
        domain_scores: domainScores,
        missing_topics: suggestions,
        insights: aiInsight
      })
      .select()
      .single();

    if (saveErr) {
      console.error('Failed to cache knowledge report in DB:', saveErr.message);
    }

    console.log(`Dashboard Report generation (cache miss): ${Date.now() - t0}ms`);
    res.json(newReport || {
      user_id: userId,
      generated_at: new Date().toISOString(),
      overall_score: overallScore,
      domain_scores: domainScores,
      missing_topics: suggestions,
      insights: aiInsight
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error occurred.' });
  }
});

export default router;
