import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the project root .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not defined in environment variables.');
}

/**
 * Generates a 768-dimensional embedding vector for the provided text
 * using Google's text-embedding-004 model.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from environment variables.');
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    // Return a zero-vector if the text is empty to prevent api errors
    return new Array(768).fill(0);
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: {
        parts: [
          {
            text: trimmedText,
          },
        ],
      },
      outputDimensionality: 768
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini embedding API failed with status ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as any;
  const values = result?.embedding?.values;

  if (!values || !Array.isArray(values) || values.length !== 768) {
    throw new Error(`Unexpected embedding format or length received from Gemini API.`);
  }

  return values;
}
