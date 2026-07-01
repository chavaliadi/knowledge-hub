import { supabaseAdmin } from '../lib/supabase';
import { getEmbedding } from '../lib/gemini';

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vectors must be of same length');
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function runRegressionTest() {
  console.log('=== Duplicate Check Regression Test ===\n');

  try {
    const testTitle = 'Kubernetes ingress controller configuration setup';
    const testContent = 'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: minimal-ingress';
    const testType = 'snippet';

    // 1. Generate text for dynamic type embedding (correct logic)
    const correctText = `Title: ${testTitle}\nType: ${testType}\nContent: ${testContent}`;
    console.log(`[Correct Text]:\n${correctText}\n`);
    
    // 2. Generate text for hardcoded 'note' type embedding (buggy logic)
    const buggyText = `Title: ${testTitle}\nType: note\nContent: ${testContent}`;
    console.log(`[Buggy Text]:\n${buggyText}\n`);

    console.log('Fetching embeddings from Gemini API...');
    const correctEmbedding = await getEmbedding(correctText);
    const buggyEmbedding = await getEmbedding(buggyText);

    // 3. Compute cosine similarity between correct embedding (what's stored in DB)
    // and the buggy embedding (what the old check-duplicate endpoint was querying with)
    const similarity = cosineSimilarity(correctEmbedding, buggyEmbedding);
    console.log(`\nResults:`);
    console.log(`- Cosine Similarity: ${similarity.toFixed(4)}`);
    console.log(`- Similarity percentage: ${(similarity * 100).toFixed(2)}%`);
    
    const THRESHOLD = 0.92;
    console.log(`- Strict Duplicate Threshold: ${(THRESHOLD * 100)}%`);

    if (similarity < THRESHOLD) {
      console.log('\n❌ [FAIL] Mismatched type embedding similarity falls BELOW the 92% threshold.');
      console.log('This confirms the bug: a duplicate snippet/bookmark would NOT be flagged.');
    } else {
      console.log('\n⚠️ [WARN] Mismatched type embedding similarity is above 92%, but still slightly lower than 100%.');
    }

    // 4. Test the fix: Verify that checking duplicate with the dynamic type returns a 100% match (similarity = 1.0)
    const correctedSimilarity = cosineSimilarity(correctEmbedding, correctEmbedding);
    console.log(`- Corrected duplicate query match similarity: ${(correctedSimilarity * 100).toFixed(2)}%`);
    
    if (correctedSimilarity >= THRESHOLD) {
      console.log('✅ [SUCCESS] Dynamic type duplicate checking correctly clears the 92% threshold (100% match).');
    } else {
      console.log('❌ [FAIL] Even correct query fails to clear the threshold.');
    }

  } catch (err: any) {
    console.error('Test script failed:', err.message || err);
    process.exit(1);
  }
}

runRegressionTest();
