import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';
import { getEmbedding } from '../lib/gemini';
import { computeRerankScores } from '../lib/reranker';

const router = Router();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

import type { SupportedGroqModel } from '../lib/llm';

/**
 * Stable Groq model ID for streaming fallback.
 * Using openai/gpt-oss-120b (GA) — verified against Groq's live model list.
 * Note: The SSE failover below only covers pre-stream failures (Gemini returns non-2xx
 * before any data is read). Mid-stream failures (Gemini 429 after partial tokens are
 * already sent to the client) are not recoverable — the user will see a truncated
 * response. This is a known limitation; full mid-stream recovery would require
 * buffering the entire response before flushing, which defeats streaming latency.
 */
const GROQ_STREAM_MODEL: SupportedGroqModel = 'openai/gpt-oss-120b';

// Hybrid search / reranking helper
const rerankCandidates = (
  candidates: any[],
  query: string
): any[] => {
  const queryWords = query.toLowerCase().match(/\w+/g) || [];
  
  const scored = candidates.map((item) => {
    let score = item.similarity || 0;

    // 1. Title match boost (+0.2 per word)
    const title = (item.title || '').toLowerCase();
    queryWords.forEach((word) => {
      if (title.includes(word)) {
        score += 0.2;
      }
    });

    // 2. Content match boost (+0.05 per word)
    const content = (item.content || '').toLowerCase();
    queryWords.forEach((word) => {
      if (content.includes(word)) {
        score += 0.05;
      }
    });

    // 3. Tag match boost (+0.1 per tag match)
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach((tag: any) => {
        const tagName = (tag.name || '').toLowerCase();
        queryWords.forEach((word) => {
          if (tagName === word) {
            score += 0.1;
          }
        });
      });
    }

    return { ...item, rerankScore: score };
  });

  // Sort descending by rerank score
  return scored.sort((a, b) => b.rerankScore - a.rerankScore);
};

// POST /chat - RAG endpoint returning SSE stream of response
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const t0 = Date.now();
  let firstTokenLogged = false;
  const { message } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Message query parameter is required.' });
    return;
  }

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not defined in server environment variables.' });
    return;
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering for Nginx if deployed

  try {
    const supabase = getSupabaseClient(req.headers.authorization);

    // 1. Generate embedding for query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await getEmbedding(message);
    } catch (embedErr: any) {
      console.error('Failed to compute chat query embedding:', embedErr.message);
      res.write(`data: ${JSON.stringify({ error: 'Failed to compute query embedding.' })}\n\n`);
      res.end();
      return;
    }

    // 2. Query Supabase match_chunks RPC for top 30 chunks matching similarity
    const { data: matchedChunks, error: rpcError } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.01, // low threshold to capture broad matches
      match_count: 30,
    });

    if (rpcError) {
      console.error('RPC match_chunks failed for chat:', rpcError.message);
      res.write(`data: ${JSON.stringify({ error: `Similarity database search failed: ${rpcError.message}` })}\n\n`);
      res.end();
      return;
    }

    // 2.5. Retrieve keyword text chunks as well (Hybrid Pool)
    let keywordChunks: any[] = [];
    try {
      const searchStr = `%${message.trim()}%`;
      const { data: kwData, error: keywordErr } = await supabase
        .from('entry_chunks')
        .select('id, entry_id, user_id, chunk_index, content')
        .eq('user_id', req.user!.id)
        .ilike('content', searchStr)
        .limit(15);
      
      if (!keywordErr && kwData) {
        keywordChunks = kwData;
      }
    } catch (kwErr) {
      console.error('Keyword pool retrieval failed for chat:', kwErr);
    }

    // Deduplicate pool
    const uniqueChunksMap = new Map<string, any>();
    (matchedChunks || []).forEach((c: any) => uniqueChunksMap.set(c.id, c));
    keywordChunks.forEach((c: any) => {
      if (!uniqueChunksMap.has(c.id)) {
        uniqueChunksMap.set(c.id, {
          id: c.id,
          entry_id: c.entry_id,
          user_id: c.user_id,
          chunk_index: c.chunk_index,
          content: c.content,
          similarity: 0
        });
      }
    });

    const pool = Array.from(uniqueChunksMap.values());

    let topCandidates: any[] = [];
    const uniqueParentEntries: any[] = [];

    if (pool.length > 0) {
      // 3. Rerank the pool using Cross-Encoder
      const docTexts = pool.map(c => c.content);
      const scores = await computeRerankScores(message, docTexts);

      const scoredChunks = pool.map((c, idx) => ({
        ...c,
        rerankScore: scores[idx] ?? 0
      }));

      // Sort descending by rerankScore
      scoredChunks.sort((a, b) => b.rerankScore - a.rerankScore);
      const selectedChunks = scoredChunks.slice(0, 5); // Take top 5

      // Fetch parent entries for selected chunks
      const parentEntryIds = Array.from(new Set(selectedChunks.map(c => c.entry_id)));
      const { data: parentEntries, error: fetchError } = await supabase
        .from('entries')
        .select('id, title, type, url')
        .in('id', parentEntryIds);

      if (fetchError) {
        console.error('Failed to populate parent entries for chat:', fetchError.message);
        res.write(`data: ${JSON.stringify({ error: 'Failed to retrieve populated matches from database.' })}\n\n`);
        res.end();
        return;
      }

      // Format candidates
      const mappedCandidates = selectedChunks.map((chunk) => {
        const parent = (parentEntries || []).find((p: any) => p.id === chunk.entry_id);
        return {
          chunk_id: chunk.id,
          entry_id: chunk.entry_id,
          content: chunk.content,
          title: parent?.title || 'Untitled Note',
          type: parent?.type || 'note',
          url: parent?.url || null
        };
      });

      // Deduplicate parent entries for UI citations list
      const uniqueEntriesMap = new Map<string, any>();
      mappedCandidates.forEach((c) => {
        if (!uniqueEntriesMap.has(c.entry_id)) {
          uniqueEntriesMap.set(c.entry_id, {
            id: c.entry_id,
            title: c.title,
            type: c.type,
            url: c.url
          });
        }
      });
      uniqueParentEntries.push(...Array.from(uniqueEntriesMap.values()));
      topCandidates = mappedCandidates;
    }

    // Send citations structure to client first
    const citations = uniqueParentEntries.map((entry, idx) => ({
      index: idx + 1,
      id: entry.id,
      title: entry.title,
      type: entry.type,
      url: entry.url
    }));
    res.write(`data: ${JSON.stringify({ citations })}\n\n`);

    // 4. Construct RAG context prompt using chunk level sources
    let formattedContext = '';
    if (topCandidates.length > 0) {
      formattedContext = topCandidates.map((cand) => {
        const citationIndex = uniqueParentEntries.findIndex(e => e.id === cand.entry_id) + 1;
        return `[Source #${citationIndex}]\nTitle: ${cand.title}\nType: ${cand.type}\nContent: ${cand.content}\n${cand.url ? `URL: ${cand.url}` : ''}`;
      }).join('\n\n');
    } else {
      formattedContext = 'No relevant notes or bookmarks were found in the database matching this query.';
    }

    const systemPrompt = `You are KnowledgeHub's AI Assistant. Answer the user's question using ONLY the following verified saves from their personal database:

[Verified Saves]
${formattedContext}

Instructions:
1. Ground your answer strictly in the provided sources. Do not make up facts or use external knowledge.
2. Reference the sources in your answer using bracketed numbers like [1], [2], corresponding to the source list (e.g. [Source #1] -> [1]). Include multiple citations if multiple sources support the claim (e.g. [1][2]).
3. If the provided sources do not contain sufficient info to answer the question, state exactly: "I couldn't find any information about that in your saved knowledge. Please check your query or add relevant notes." Do not synthesize from generic LLM knowledge in this case.
4. Keep the answer clear, structured, and developer-focused. Include markdown code blocks if the sources contain relevant snippets.`;

    // 5. Call Gemini stream API with fallback to Groq
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    };

    let useGroq = false;
    let geminiResponse: globalThis.Response | null = null;

    if (GEMINI_API_KEY) {
      try {
        geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        if (!geminiResponse.ok) {
          console.warn(`Gemini stream API returned non-200 status (${geminiResponse.status}). Triggering failover to Groq...`);
          useGroq = true;
        }
      } catch (err: any) {
        console.error('Gemini stream API request failed, triggering failover to Groq:', err.message || err);
        useGroq = true;
      }
    } else {
      useGroq = true;
    }

    if (useGroq) {
      const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
      if (!GROQ_API_KEY) {
        res.write(`data: ${JSON.stringify({ error: 'Both Gemini and Groq (fallback) providers are unconfigured or failed.' })}\n\n`);
        res.end();
        return;
      }

      console.log('Chat Route: Falling back to Groq completions stream...');
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      
      const groqBody = {
        model: GROQ_STREAM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.2,
        stream: true
      };

      const groqResponse = await fetch(groqUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify(groqBody)
      });

      if (!groqResponse.ok) {
        const errorText = await groqResponse.text();
        console.error(`Groq stream API failed: ${groqResponse.status} - ${errorText}`);
        res.write(`data: ${JSON.stringify({ error: 'Groq failover service communication error.' })}\n\n`);
        res.end();
        return;
      }

      if (!groqResponse.body) {
        res.write(`data: ${JSON.stringify({ error: 'Groq response body stream is missing.' })}\n\n`);
        res.end();
        return;
      }

      const reader = groqResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep partial line in buffer

        for (const line of lines) {
          const cleanedLine = line.trim();
          if (cleanedLine.startsWith('data: ')) {
            const jsonStr = cleanedLine.slice(6).trim();
            if (jsonStr === '[DONE]') {
              break;
            }
            if (jsonStr) {
              try {
                const parsedData = JSON.parse(jsonStr);
                const textChunk = parsedData.choices?.[0]?.delta?.content || '';
                if (textChunk) {
                  if (!firstTokenLogged) {
                    console.log(`Chat SSE (Groq) - Time to first token chunk: ${Date.now() - t0}ms`);
                    firstTokenLogged = true;
                  }
                  res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
                }
              } catch (err) {
                // Ignore parsing errors
              }
            }
          }
        }
      }
    } else {
      if (!geminiResponse || !geminiResponse.body) {
        res.write(`data: ${JSON.stringify({ error: 'Gemini response body stream is missing.' })}\n\n`);
        res.end();
        return;
      }

      const reader = geminiResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep partial line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              try {
                const parsedData = JSON.parse(jsonStr);
                const textChunk = parsedData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (textChunk) {
                  if (!firstTokenLogged) {
                    console.log(`Chat SSE (Gemini) - Time to first token chunk: ${Date.now() - t0}ms`);
                    firstTokenLogged = true;
                  }
                  res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
                }
              } catch (err) {
                // Ignore parser issues
              }
            }
          }
        }
      }

      // Flush any remaining buffer if applicable
      if (buffer && buffer.startsWith('data: ')) {
        const jsonStr = buffer.slice(6).trim();
        try {
          const parsedData = JSON.parse(jsonStr);
          const textChunk = parsedData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (textChunk) {
            res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
          }
        } catch (err) {}
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error('Chat endpoint crashed:', err);
    try {
      res.write(`data: ${JSON.stringify({ error: 'Internal server error occurred.' })}\n\n`);
      res.end();
    } catch {}
  }
});

export default router;
