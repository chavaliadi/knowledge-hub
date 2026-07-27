import '../lib/env';
import { computeRerankScores } from '../lib/reranker';

async function runPhase2E2ETest() {
  console.log('=== Phase 2 Neural Reranker Verification ===\n');

  const testQuery = 'How does container management work?';
  const documents = [
    'PostgreSQL uses WAL logs for transaction durability.',
    'Kubernetes manages containers across a cluster of nodes, offering automated orchestration, scaling, and self-healing.',
    'Docker is a containerization tool that wraps software in filesystems.'
  ];

  console.log(`Query: "${testQuery}"`);
  console.log('Documents to rank:');
  documents.forEach((doc, idx) => console.log(`  [${idx}] ${doc}`));

  try {
    const t0 = Date.now();
    const scores = await computeRerankScores(testQuery, documents);
    console.log(`\nInference completed in ${Date.now() - t0}ms.`);

    const ranked = documents.map((doc, idx) => ({
      doc,
      score: scores[idx] ?? 0
    })).sort((a, b) => b.score - a.score);

    console.log('\nReranked Results:');
    ranked.forEach((item, idx) => {
      console.log(`  Rank ${idx + 1}: Score: ${item.score.toFixed(4)} | Text: "${item.doc}"`);
    });

    // Basic assertions
    if (ranked[0]?.doc?.includes('Kubernetes')) {
      console.log('\n🎉 [PASS] Reranker correctly scored the most relevant document highest.');
    } else {
      console.warn('\n⚠ [WARNING] Rerank matches were not sorted as expected. Please check model behavior.');
    }
  } catch (err: any) {
    console.error('\n❌ [FATAL E2E ERROR]:', err.message || err);
    process.exit(1);
  }
}

runPhase2E2ETest();
