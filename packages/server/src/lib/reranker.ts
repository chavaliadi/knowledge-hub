import { AutoModelForSequenceClassification, AutoTokenizer } from '@xenova/transformers';

/**
 * Local Cross-Encoder Reranker service using Transformers.js direct model classes.
 * Runs CPU-bound ONNX execution in Bun/Node.
 */

let tokenizerInstance: any = null;
let modelInstance: any = null;

export async function getReranker() {
  if (!tokenizerInstance || !modelInstance) {
    try {
      console.log('Loading local Cross-Encoder model (Xenova/bge-reranker-base)...');
      const model_id = 'Xenova/bge-reranker-base';
      tokenizerInstance = await AutoTokenizer.from_pretrained(model_id);
      modelInstance = await AutoModelForSequenceClassification.from_pretrained(model_id);
      console.log('Cross-Encoder model loaded successfully.');
    } catch (err: any) {
      console.error('Failed to load Cross-Encoder model:', err.message || err);
      throw err;
    }
  }
  return { tokenizer: tokenizerInstance, model: modelInstance };
}

/**
 * Asynchronously warms up the local Cross-Encoder ONNX model during server startup.
 */
export async function warmupReranker(): Promise<void> {
  const t0 = Date.now();
  console.log('Reranker Service: Warming up Cross-Encoder model in background...');
  try {
    await getReranker();
    console.log(`Reranker Service: Model warmup complete (${Date.now() - t0}ms).`);
  } catch (err: any) {
    console.error('Reranker Service: Background warmup failed (will retry on demand):', err.message || err);
  }
}

/**
 * Computes semantic relevance scores for a list of document texts given a query.
 * Returns an array of scores (floats between 0 and 1) corresponding to inputs.
 */
export async function computeRerankScores(
  query: string,
  documents: string[]
): Promise<number[]> {
  if (documents.length === 0) return [];

  try {
    const { tokenizer, model } = await getReranker();
    const scores: number[] = [];
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

    for (const doc of documents) {
      // Keep doc slice within model max token bounds (~1500 chars is safe)
      const inputs = await tokenizer(query, {
        text_pair: doc.slice(0, 1500),
        padding: true,
        truncation: true,
        max_length: 512,
        return_tensors: 'pt',
      });

      const output = await model(inputs);
      const logit = output.logits.data[0] as number;
      scores.push(sigmoid(logit));
    }
    
    return scores;
  } catch (err: any) {
    console.error('Reranking inference failed, falling back to 0 scores:', err.message || err);
    return new Array(documents.length).fill(0);
  }
}
