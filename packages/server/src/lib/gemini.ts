import dotenv from 'dotenv';
import path from 'path';
import { generateTextWithFailover } from './llm';

// Load environment variables from the project root .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not defined in environment variables.');
}

/**
 * Generates a 768-dimensional embedding vector for the provided text
 * using Google's gemini-embedding-001 model.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const t0 = Date.now();
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from environment variables.');
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    // Return a zero-vector if the text is empty to prevent api errors
    console.log(`Gemini API [getEmbedding]: ${Date.now() - t0}ms`);
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

  console.log(`Gemini API [getEmbedding]: ${Date.now() - t0}ms`);
  return values;
}

/**
 * Uses Gemini-1.5-flash with fallback to Groq to generate a one-sentence summary
 * and auto-suggest tags for the provided entry details.
 */
export async function getAISummaryAndTags(
  title: string,
  type: string,
  content: string | null
): Promise<{ summary: string; tags: string[] }> {
  const t0 = Date.now();
  const prompt = `Analyze the following developer save entry and generate:
1. A concise, one-sentence summary (max 15-20 words).
2. Up to 3 relevant technical tags/concepts (lowercase, alphanumeric, e.g. "redis", "database", "react").

[Entry details]
Title: ${title}
Type: ${type}
Content: ${content || 'No text content'}

You MUST return a JSON object with EXACTLY this structure:
{
  "summary": "your one-sentence summary here",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const responseText = await generateTextWithFailover(prompt, undefined, true);
  const parsed = JSON.parse(responseText.trim());
  console.log(`LLM [getAISummaryAndTags]: ${Date.now() - t0}ms`);
  return {
    summary: parsed.summary || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: string) => String(t).trim().toLowerCase()) : [],
  };
}

const FIXED_DOMAINS = [
  'Backend',
  'Frontend',
  'AI/ML',
  'System Design',
  'Databases',
  'DevOps/Cloud'
];

/**
 * Classifies an entry into one or two core domains from our fixed list.
 */
export async function classifyEntryDomains(
  title: string,
  content: string | null,
  type: string
): Promise<string[]> {
  const t0 = Date.now();
  const prompt = `Analyze this developer knowledge base entry:
Title: ${title}
Type: ${type}
Content: ${content || 'No text content'}

Classify this entry into one or more of these specific domains: ${FIXED_DOMAINS.join(', ')}.
You MUST respond with a JSON object containing a "domains" key, which holds an array of matched domains (max 2 matched domains). E.g.
{
  "domains": ["Backend", "Databases"]
}
If nothing matches, return:
{
  "domains": []
}`;

  try {
    const responseText = await generateTextWithFailover(prompt, undefined, true);
    const parsed = JSON.parse(responseText.trim());
    if (Array.isArray(parsed.domains)) {
      const resDomains = parsed.domains.filter((d: string) => FIXED_DOMAINS.includes(d));
      console.log(`LLM [classifyEntryDomains]: ${Date.now() - t0}ms`);
      return resDomains;
    }
  } catch (e) {
    console.error('Failed to parse domain classification response:', e);
  }
  console.log(`LLM [classifyEntryDomains] (failed parse): ${Date.now() - t0}ms`);
  return [];
}

/**
 * Generates an insight and next topic suggestions from the user's domain analysis data.
 */
export async function generateInsightAndNextTopics(
  domainCounts: Record<string, number>,
  totalEntries: number
): Promise<{ insight: string; topics: { name: string; rationale: string }[] }> {
  const t0 = Date.now();
  const summaryData = Object.entries(domainCounts)
    .map(([domain, count]) => `- ${domain}: ${count} entries`)
    .join('\n');

  const prompt = `Analyze this developer's knowledge base state.
They have a total of ${totalEntries} entries across these categories:
${summaryData}

Provide:
1. One short, natural-language, technical summary insight (max 20 words, developer-focused, e.g. "Your database skills are solid, but you could document more of your system design learnings.")
2. A list of 3 suggested concepts/technologies to study next, matching their domain profile, with a 1-sentence explanation of why it fits.

You MUST respond with a JSON object matching this structure exactly:
{
  "insight": "insight text here",
  "topics": [
    { "name": "Topic/Tech Name", "rationale": "one sentence explaining why they should study it next" }
  ]
}`;

  const responseText = await generateTextWithFailover(prompt, undefined, true);
  const parsed = JSON.parse(responseText.trim());
  console.log(`LLM [generateInsightAndNextTopics]: ${Date.now() - t0}ms`);
  return {
    insight: parsed.insight || '',
    topics: Array.isArray(parsed.topics) ? parsed.topics : []
  };
}

