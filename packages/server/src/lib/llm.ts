import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the project root .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

/**
 * The stable production model ID for Groq.
 * Using `llama-3.3-70b-versatile` (GA) rather than the `specdec` preview
 * which is subject to deprecation. Verified live against Groq's model list.
 */
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Generates text using Gemini with a transparent fallback to Groq Llama.
 *
 * Failover policy:
 *   - 429 (rate limit), 5xx (server errors), and network timeouts → failover to Groq
 *   - 400 (bad request) and 403 (permission denied) → do NOT failover; these indicate
 *     a configuration or prompt error that Groq would also fail on. Masking them
 *     would hide real bugs.
 *   - Empty response body (Gemini returned 200 but no text) → failover to Groq,
 *     because this is an API instability, not a client error.
 *
 * @param prompt - The user prompt to send
 * @param systemInstruction - Optional system instruction
 * @param responseJson - If true, request JSON-mode from both providers
 */
export async function generateTextWithFailover(
  prompt: string,
  systemInstruction?: string,
  responseJson: boolean = false
): Promise<string> {
  // 1. Attempt Gemini-2.5-Flash
  if (GEMINI_API_KEY) {
    try {
      console.log('LLM Service: Attempting generation with Google Gemini (gemini-2.5-flash)...');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

      const body: any = {
        contents: [{ parts: [{ text: prompt }] }]
      };

      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      if (responseJson) {
        body.generationConfig = { responseMimeType: 'application/json' };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const result = (await response.json()) as any;
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
        // 200 OK but no text — API instability, not a client error. Failover.
        console.warn('Gemini returned 200 OK but with no text content. Triggering failover.');
        if (!GROQ_API_KEY) {
          throw new Error('Gemini returned an empty response and no Groq fallback key is configured.');
        }
        // Fall through to Groq below
      } else {
        const errorText = await response.text();
        const status = response.status;
        console.warn(`Gemini generation failed (HTTP ${status}): ${errorText}`);

        // 400 / 403 → client/config error — do NOT failover, surface immediately
        if (status === 400 || status === 403) {
          throw new Error(`Gemini client error (HTTP ${status}): ${errorText}`);
        }

        // 429 / 5xx / other → temporary failure — failover to Groq
        console.warn(`Gemini returned ${status} — triggering failover to Groq.`);
        if (!GROQ_API_KEY) {
          throw new Error(`Gemini API error (HTTP ${status}) and no Groq fallback key configured.`);
        }
        // Fall through to Groq below
      }
    } catch (err: any) {
      // Re-throw non-failover errors (400/403 from above, or genuine network crashes)
      if (err.message?.includes('Gemini client error')) {
        throw err;
      }
      console.error('Gemini generation error (network/timeout):', err.message || err);
      if (!GROQ_API_KEY) {
        throw err;
      }
      // Fall through to Groq below
    }
  }

  // 2. Fallback to Groq (llama-3.3-70b-versatile, stable GA)
  if (GROQ_API_KEY) {
    console.log(`LLM Service: Falling back to Groq (${GROQ_MODEL})...`);
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const body: any = {
      model: GROQ_MODEL,
      messages,
      temperature: 0.2
    };

    if (responseJson) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq failover API failed (HTTP ${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as any;
    const content = result?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Groq API returned a 200 OK but with empty choices content.');
    }
    console.log('LLM Service: Successfully generated content via Groq fallback.');
    return content;
  }

  // Both providers unconfigured or failed
  throw new Error(
    'All LLM providers failed or are unconfigured. ' +
    'Set GEMINI_API_KEY and/or GROQ_API_KEY in your .env file.'
  );
}
