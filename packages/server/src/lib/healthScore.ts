export const FIXED_DOMAINS = [
  'Backend',
  'Frontend',
  'AI/ML',
  'System Design',
  'Databases',
  'DevOps/Cloud'
];

export interface EntryForScoring {
  id?: string;
  content?: string | null;
  domains?: string[] | null;
  created_at?: string;
  updated_at?: string;
  entry_tags?: { tag_id?: string }[] | null;
}

export interface HealthScoreResult {
  overall_score: number;
  spread_score: number;
  depth_score: number;
  tag_score: number;
  recency_score: number;
  domain_scores: Record<string, number>;
  active_domains_count: number;
}

/**
 * Computes deterministic Knowledge Health Score based on ADR 003.
 * Formula weights:
 * - Domain Spread: 30%
 * - Content Depth: 25%
 * - Tag Density: 20%
 * - Study Recency: 25%
 */
export function computeKnowledgeHealthScore(
  entries: EntryForScoring[],
  domains: string[] = FIXED_DOMAINS,
  referenceDate: Date = new Date()
): HealthScoreResult {
  const totalEntries = entries.length;

  if (totalEntries === 0) {
    return {
      overall_score: 0,
      spread_score: 0,
      depth_score: 0,
      tag_score: 0,
      recency_score: 0,
      domain_scores: domains.reduce((acc, d) => ({ ...acc, [d]: 0 }), {} as Record<string, number>),
      active_domains_count: 0
    };
  }

  // 1. Domain counts & spread (30% weight)
  const domainCounts: Record<string, number> = domains.reduce(
    (acc, d) => ({ ...acc, [d]: 0 }),
    {} as Record<string, number>
  );

  for (const entry of entries) {
    if (entry.domains && Array.isArray(entry.domains)) {
      entry.domains.forEach((d) => {
        if (domains.includes(d)) {
          domainCounts[d] = (domainCounts[d] || 0) + 1;
        }
      });
    }
  }

  const activeDomains = Object.values(domainCounts).filter((c) => c > 0).length;
  const spreadScore = (activeDomains / domains.length) * 100;

  // 2. Content Depth (25% weight, 1000+ chars = 100)
  let totalContentCharCount = 0;
  entries.forEach((e) => {
    totalContentCharCount += (e.content || '').length;
  });
  const avgLength = totalContentCharCount / totalEntries;
  const depthScore = Math.min((avgLength / 1000) * 100, 100);

  // 3. Tag Density (20% weight, 3+ tags = 100)
  let totalTagsCount = 0;
  entries.forEach((e) => {
    if (e.entry_tags && Array.isArray(e.entry_tags)) {
      totalTagsCount += e.entry_tags.length;
    }
  });
  const avgTags = totalTagsCount / totalEntries;
  const tagScore = Math.min((avgTags / 3) * 100, 100);

  // 4. Study Recency (25% weight, 10+ updates in 30 days = 100)
  const thirtyDaysAgo = new Date(referenceDate.getTime());
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recencyCount = entries.filter((e) => {
    const entryDateStr = e.updated_at || e.created_at;
    if (!entryDateStr) return false;
    const entryTime = new Date(entryDateStr).getTime();
    return entryTime > thirtyDaysAgo.getTime();
  }).length;
  const recencyScore = Math.min((recencyCount / 10) * 100, 100);

  // Weighted overall calculation
  const overallScore = Math.round(
    spreadScore * 0.3 +
    depthScore * 0.25 +
    tagScore * 0.20 +
    recencyScore * 0.25
  );

  // Domain score percentages relative to most frequent domain
  const maxDomainCount = Math.max(...Object.values(domainCounts), 1);
  const domainScores = domains.reduce((acc, d) => {
    const pct = Math.round(((domainCounts[d] || 0) / maxDomainCount) * 100);
    return { ...acc, [d]: pct };
  }, {} as Record<string, number>);

  return {
    overall_score: overallScore,
    spread_score: spreadScore,
    depth_score: depthScore,
    tag_score: tagScore,
    recency_score: recencyScore,
    domain_scores: domainScores,
    active_domains_count: activeDomains
  };
}
