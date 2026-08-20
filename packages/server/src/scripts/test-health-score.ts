/**
 * Health Score Formula Unit Test
 * ------------------------------
 * Validates that the deterministic Knowledge Health Score matches the ADR 003
 * specification:
 *   Overall = round(Spread*0.30 + Depth*0.25 + Tag*0.20 + Recency*0.25)
 *
 * Run with:  bun run src/scripts/test-health-score.ts
 */

import { computeKnowledgeHealthScore, FIXED_DOMAINS, type EntryForScoring } from '../lib/healthScore';

async function runHealthScoreTest() {
  console.log('=== Knowledge Health Score Formula Unit Test ===\n');

  let passedCount = 0;
  let totalCount = 0;

  function assertEqual(actual: any, expected: any, label: string) {
    totalCount++;
    if (actual === expected) {
      console.log(`  ✅ [PASS] ${label}: ${actual} === ${expected}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${label}: expected ${expected}, got ${actual}`);
    }
  }

  // ─── Test 1: Empty state (0 entries) ───
  console.log('Test 1: Empty state (0 entries) returns score of 0...');
  const emptyResult = computeKnowledgeHealthScore([]);
  assertEqual(emptyResult.overall_score, 0, 'Empty state overall score');
  assertEqual(emptyResult.spread_score, 0, 'Empty state spread score');
  assertEqual(emptyResult.depth_score, 0, 'Empty state depth score');
  assertEqual(emptyResult.tag_score, 0, 'Empty state tag score');
  assertEqual(emptyResult.recency_score, 0, 'Empty state recency score');

  // ─── Test 2: Perfect 100 Score ───
  console.log('\nTest 2: Perfect state (all metrics at 100%) produces overall score of 100...');
  const baseDate = new Date('2026-08-20T12:00:00Z');
  
  // 10 entries across all 6 domains, each with 1200 chars, 3 tags, updated today
  const perfectEntries: EntryForScoring[] = FIXED_DOMAINS.map((domain, i) => ({
    id: `entry-${i}`,
    content: 'x'.repeat(1200), // >= 1000 chars -> depth = 100
    domains: [domain],
    created_at: baseDate.toISOString(),
    updated_at: baseDate.toISOString(),
    entry_tags: [{ tag_id: 't1' }, { tag_id: 't2' }, { tag_id: 't3' }] // 3 tags -> tag = 100
  }));

  // Add 4 more entries to reach >= 10 recent entries
  for (let i = 6; i < 10; i++) {
    perfectEntries.push({
      id: `entry-${i}`,
      content: 'x'.repeat(1000),
      domains: [FIXED_DOMAINS[i % 6]!],
      created_at: baseDate.toISOString(),
      updated_at: baseDate.toISOString(),
      entry_tags: [{ tag_id: 't1' }, { tag_id: 't2' }, { tag_id: 't3' }, { tag_id: 't4' }]
    });
  }

  const perfectResult = computeKnowledgeHealthScore(perfectEntries, FIXED_DOMAINS, baseDate);
  assertEqual(perfectResult.spread_score, 100, 'Perfect spread score (6/6 domains)');
  assertEqual(perfectResult.depth_score, 100, 'Perfect depth score (>= 1000 chars)');
  assertEqual(perfectResult.tag_score, 100, 'Perfect tag score (>= 3 tags)');
  assertEqual(perfectResult.recency_score, 100, 'Perfect recency score (>= 10 updates)');
  assertEqual(perfectResult.overall_score, 100, 'Perfect overall score');

  // ─── Test 3: Controlled 50% Metric Baseline ───
  console.log('\nTest 3: Controlled 50% components produce exactly 50 overall score...');
  // 3 of 6 domains active -> spread = 50% (contrib: 15)
  // avg length = 500 chars -> depth = 50% (contrib: 12.5)
  // avg tags = 1.5 -> tag = 50% (contrib: 10)
  // 5 recent entries -> recency = 50% (contrib: 12.5)
  // expected overall = round(15 + 12.5 + 10 + 12.5) = 50
  const oldDate = new Date('2026-01-01T12:00:00Z'); // > 30 days ago
  const halfEntries: EntryForScoring[] = [
    // 5 recent entries in 3 domains (Backend, Frontend, Databases)
    { content: 'a'.repeat(500), domains: ['Backend'], updated_at: baseDate.toISOString(), entry_tags: [{ tag_id: 't1' }, { tag_id: 't2' }] }, // 2 tags
    { content: 'b'.repeat(500), domains: ['Frontend'], updated_at: baseDate.toISOString(), entry_tags: [{ tag_id: 't1' }] }, // 1 tag
    { content: 'c'.repeat(500), domains: ['Databases'], updated_at: baseDate.toISOString(), entry_tags: [{ tag_id: 't1' }, { tag_id: 't2' }] }, // 2 tags
    { content: 'd'.repeat(500), domains: ['Backend'], updated_at: baseDate.toISOString(), entry_tags: [{ tag_id: 't1' }] }, // 1 tag
    { content: 'e'.repeat(500), domains: ['Frontend'], updated_at: baseDate.toISOString(), entry_tags: [{ tag_id: 't1' }, { tag_id: 't2' }] }, // 2 tags
    // 5 old entries
    { content: 'f'.repeat(500), domains: ['Backend'], updated_at: oldDate.toISOString(), entry_tags: [{ tag_id: 't1' }] }, // 1 tag
    { content: 'g'.repeat(500), domains: ['Frontend'], updated_at: oldDate.toISOString(), entry_tags: [{ tag_id: 't1' }, { tag_id: 't2' }] }, // 2 tags
    { content: 'h'.repeat(500), domains: ['Databases'], updated_at: oldDate.toISOString(), entry_tags: [{ tag_id: 't1' }] }, // 1 tag
    { content: 'i'.repeat(500), domains: ['Backend'], updated_at: oldDate.toISOString(), entry_tags: [{ tag_id: 't1' }, { tag_id: 't2' }] }, // 2 tags
    { content: 'j'.repeat(500), domains: ['Frontend'], updated_at: oldDate.toISOString(), entry_tags: [{ tag_id: 't1' }] }, // 1 tag
  ];

  const halfResult = computeKnowledgeHealthScore(halfEntries, FIXED_DOMAINS, baseDate);
  assertEqual(halfResult.spread_score, 50, 'Half spread score (3/6 domains)');
  assertEqual(halfResult.depth_score, 50, 'Half depth score (500 chars avg)');
  assertEqual(halfResult.tag_score, 50, 'Half tag score (1.5 tags avg)');
  assertEqual(halfResult.recency_score, 50, 'Half recency score (5/10 recent updates)');
  assertEqual(halfResult.overall_score, 50, 'Half overall score (round(15 + 12.5 + 10 + 12.5))');

  // ─── Test 4: Upper bound saturation / clamping ───
  console.log('\nTest 4: High volume does not exceed 100 score...');
  const superEntries: EntryForScoring[] = Array.from({ length: 50 }, (_, i) => ({
    id: `super-${i}`,
    content: 'z'.repeat(10000), // 10k chars
    domains: FIXED_DOMAINS,
    updated_at: baseDate.toISOString(),
    entry_tags: Array.from({ length: 10 }, (_, t) => ({ tag_id: `tag-${t}` })) // 10 tags
  }));

  const superResult = computeKnowledgeHealthScore(superEntries, FIXED_DOMAINS, baseDate);
  assertEqual(superResult.overall_score, 100, 'Clamped max overall score');
  assertEqual(superResult.depth_score, 100, 'Clamped max depth score');
  assertEqual(superResult.tag_score, 100, 'Clamped max tag score');
  assertEqual(superResult.recency_score, 100, 'Clamped max recency score');

  console.log(`\n--- Summary: ${passedCount}/${totalCount} tests passed ---`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runHealthScoreTest();
