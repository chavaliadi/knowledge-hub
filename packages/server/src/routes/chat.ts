import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';
import { getEmbedding } from '../lib/gemini';

const router = Router();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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

    // 2. Query Supabase RPC for top 8 items matching cosine similarity
    const { data: matchedRows, error: rpcError } = await supabase.rpc('match_entries', {
      query_embedding: queryEmbedding,
      match_threshold: 0.1, // low threshold to capture potential matches
      match_count: 8,
    });

    if (rpcError) {
      console.error('RPC match_entries failed for chat:', rpcError.message);
      res.write(`data: ${JSON.stringify({ error: `Similarity database search failed: ${rpcError.message}` })}\n\n`);
      res.end();
      return;
    }

    let topCandidates: any[] = [];
    if (matchedRows && matchedRows.length > 0) {
      const matchedIds = matchedRows.map((r: any) => r.id);

      // Fetch tags/relationships for these entries
      const { data: fullEntries, error: fetchError } = await supabase
        .from('entries')
        .select('*, entry_tags(tag:tags(id, name)), collections(name)')
        .in('id', matchedIds);

      if (fetchError) {
        console.error('Failed to populate chat entries:', fetchError.message);
        res.write(`data: ${JSON.stringify({ error: 'Failed to retrieve populated matches from database.' })}\n\n`);
        res.end();
        return;
      }

      // Map populated details back to matched similarity scores
      const populated = (fullEntries || []).map((entry: any) => {
        const similarity = matchedRows.find((r: any) => r.id === entry.id)?.similarity || 0;
        const tags = entry.entry_tags 
          ? entry.entry_tags.map((et: any) => et.tag).filter(Boolean)
          : [];
        const collection_name = entry.collections ? entry.collections.name : null;
        
        const formatted = { ...entry, tags, collection_name };
        delete formatted.entry_tags;
        delete formatted.collections;
        return { ...formatted, similarity };
      });

      // 3. Rerank the top 8 down to 3-5 candidates
      const reranked = rerankCandidates(populated, message);
      topCandidates = reranked.slice(0, 4); // Take top 4 reranked documents
    }

    // Send citations structure to client first
    const citations = topCandidates.map((c, i) => ({
      index: i + 1,
      id: c.id,
      title: c.title,
      type: c.type,
      url: c.url
    }));
    res.write(`data: ${JSON.stringify({ citations })}\n\n`);

    // 4. Construct RAG context prompt
    let formattedContext = '';
    if (topCandidates.length > 0) {
      formattedContext = topCandidates.map((entry, index) => {
        return `[Source #${index + 1}]\nTitle: ${entry.title}\nType: ${entry.type}\nContent: ${entry.content || 'No text content'}\n${entry.url ? `URL: ${entry.url}` : ''}`;
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

    // 5. Call Gemini stream API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    
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

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`Gemini stream API failed: ${geminiResponse.status} - ${errorText}`);
      res.write(`data: ${JSON.stringify({ error: 'Gemini service communication error.' })}\n\n`);
      res.end();
      return;
    }

    if (!geminiResponse.body) {
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
                  console.log(`Chat SSE - Time to first token chunk: ${Date.now() - t0}ms`);
                  firstTokenLogged = true;
                }
                res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
              }
            } catch (err) {
              // Ignore lines that aren't valid JSON (e.g. stream boundaries)
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
          if (!firstTokenLogged) {
            console.log(`Chat SSE - Time to first token chunk: ${Date.now() - t0}ms`);
            firstTokenLogged = true;
          }
          res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
        }
      } catch (err) {}
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
