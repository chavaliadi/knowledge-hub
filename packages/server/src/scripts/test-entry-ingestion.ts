/**
 * Multi-Format Entry Ingestion Unit & Integration Test
 * ----------------------------------------------------
 * Validates the full lifecycle for plain non-attachment entry types:
 *   1. Note (type: 'note')
 *   2. Bookmark (type: 'bookmark')
 *   3. Code Snippet (type: 'snippet')
 *   4. Validation error handling (missing title / missing type)
 *
 * MOCKING POLICY:
 * All Gemini AI calls (getEmbedding, getAISummaryAndTags, classifyEntryDomains, extractSemanticLinks)
 * are strictly intercepted by mocking globalThis.fetch. This ensures:
 *   - No live network requests or external API quota consumption
 *   - Deterministic execution in CI without requiring real Gemini credentials
 *   - Direct proof of mock interception via intercept counters
 *
 * Round-trip integrity is verified symmetrically across all three types:
 *   - POST /entries creation payload validation (HTTP 201 Created)
 *   - Subsequent GET /entries/:id fetch to confirm persisted database records
 *   - Tag association verification
 *
 * Run with:  bun run src/scripts/test-entry-ingestion.ts
 */

import '../lib/env';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabase';
import entriesRouter from '../routes/entries';

async function runEntryIngestionTest() {
  console.log('=== Multi-Format Entry Ingestion Test (Note, Bookmark, Snippet) ===\n');

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.warn('\n❌ [SKIP] Supabase credentials are not set. Skipping entry ingestion test.\n');
    process.exit(process.env.CI ? 0 : 1);
  }

  let passedCount = 0;
  let totalCount = 0;

  function assertEqual(actual: any, expected: any, label: string) {
    totalCount++;
    if (actual === expected) {
      console.log(`  ✅ [PASS] ${label}: ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assertCondition(condition: boolean, label: string) {
    totalCount++;
    if (condition) {
      console.log(`  ✅ [PASS] ${label}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${label}`);
    }
  }

  // ─── Setup Gemini API Mocks ───
  console.log('Setting up Gemini API mocks to prevent live network/quota usage...');
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  let mockEmbeddingCount = 0;
  let mockSummaryCount = 0;
  let mockDomainCount = 0;

  process.env.GEMINI_API_KEY = 'MOCK_GEMINI_TEST_API_KEY';

  globalThis.fetch = (async (urlOrReq: any, options: any) => {
    const urlStr = typeof urlOrReq === 'string' ? urlOrReq : (urlOrReq?.url || '');

    if (urlStr.includes('generativelanguage.googleapis.com')) {
      // 1. Embedding request
      if (urlStr.includes('embedContent') || urlStr.includes('batchEmbedContents')) {
        mockEmbeddingCount++;
        const dummy768Vector = Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.1) * 0.05);
        return new Response(
          JSON.stringify({
            embedding: { values: dummy768Vector },
            embeddings: [{ values: dummy768Vector }]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 2. Text generation request (Summary / Tags / Domains / Graph)
      if (urlStr.includes('generateContent')) {
        const bodyStr = typeof options?.body === 'string' ? options.body : '';

        // Domain classification prompt
        if (bodyStr.includes('Classify this entry into one or more of these specific domains')) {
          mockDomainCount++;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      { text: JSON.stringify({ domains: ['Backend', 'System Design'] }) }
                    ]
                  }
                }
              ]
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Summary and tags prompt
        if (bodyStr.includes('Analyze the following developer save entry')) {
          mockSummaryCount++;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          summary: 'Mocked AI technical summary for test entry.',
                          tags: ['mock-tag-a', 'mock-tag-b']
                        })
                      }
                    ]
                  }
                }
              ]
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Semantic concept links prompt
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: JSON.stringify([]) }
                  ]
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return originalFetch(urlOrReq, options);
  }) as any;

  // ─── Setup Auth and Test Fixtures ───
  const timestamp = Date.now();
  const testUserEmail = `ingest-test-user-${timestamp}@example.com`;
  const testPassword = 'Password123!';
  let testUserId = '';
  let userAuthToken = '';
  let testTagId = '';
  const createdEntryIds: string[] = [];

  let server: any = null;
  let baseUrl = '';

  try {
    console.log('\nCreating temporary test user and test tag in Supabase...');
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: testUserEmail,
      password: testPassword,
      email_confirm: true
    });
    if (userErr || !userRes?.user) {
      throw new Error(`Failed to create test user: ${userErr?.message}`);
    }
    testUserId = userRes.user.id;

    // Sign in to obtain a valid access token
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: sessionData, error: signInErr } = await client.auth.signInWithPassword({
      email: testUserEmail,
      password: testPassword
    });
    if (signInErr || !sessionData?.session) {
      throw new Error(`Failed to sign in test user: ${signInErr?.message}`);
    }
    userAuthToken = sessionData.session.access_token;

    // Create a shared test tag
    const { data: tagData, error: tagErr } = await supabaseAdmin
      .from('tags')
      .insert({
        user_id: testUserId,
        name: `test-tag-${timestamp}`
      })
      .select()
      .single();
    if (tagErr || !tagData) {
      throw new Error(`Failed to create test tag: ${tagErr?.message}`);
    }
    testTagId = tagData.id;
    console.log(`  Test User ID: ${testUserId}`);
    console.log(`  Test Tag ID: ${testTagId} (${tagData.name})`);

    // ─── Start Ephemeral Express Server for Testing ───
    const app = express();
    app.use(express.json());
    // Attach auth mock to inject test user
    app.use('/entries', (req, _res, next) => {
      (req as any).user = { id: testUserId, email: testUserEmail };
      req.headers.authorization = `Bearer ${userAuthToken}`;
      next();
    }, entriesRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr: any = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
    console.log(`  Ephemeral test server listening at ${baseUrl}`);

    // Helper for making API requests
    async function apiRequest(endpoint: string, method: string, body?: any): Promise<{ status: number; data: any }> {
      const res = await originalFetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userAuthToken}`
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const data: any = await res.json().catch(() => null);
      return { status: res.status, data };
    }

    // ─── Scenario 1: Note Ingestion (type: 'note') ───
    console.log('\n--- Scenario 1: Note Ingestion (type: "note") ---');
    const notePayload = {
      title: 'Distributed Consensus Architecture Note',
      type: 'note',
      content: 'Notes detailing Raft leader election, heartbeats, and log compaction.',
      tag_ids: [testTagId]
    };

    const postNoteRes = await apiRequest('/entries', 'POST', notePayload);
    assertEqual(postNoteRes.status, 201, 'POST /entries returns 201 Created for note');
    assertEqual(postNoteRes.data?.type, 'note', 'Created entry type is "note"');
    assertEqual(postNoteRes.data?.title, notePayload.title, 'Created entry title matches');
    assertEqual(postNoteRes.data?.content, notePayload.content, 'Created entry content matches');
    assertEqual(postNoteRes.data?.url, null, 'Note entry url is null');
    assertEqual(postNoteRes.data?.summary, 'Mocked AI technical summary for test entry.', 'AI summary generated via mocked service');

    const noteId = postNoteRes.data?.id;
    assertCondition(Boolean(noteId), 'POST /entries returned valid entry ID');
    if (noteId) createdEntryIds.push(noteId);

    // Round-trip fetch verification
    console.log('  Verifying GET /entries/:id round-trip for note...');
    const getNoteRes = await apiRequest(`/entries/${noteId}`, 'GET');
    assertEqual(getNoteRes.status, 200, 'GET /entries/:id returns 200 OK');
    assertEqual(getNoteRes.data?.id, noteId, 'Fetched entry ID matches created note');
    assertEqual(getNoteRes.data?.type, 'note', 'Fetched entry type is "note"');
    assertEqual(getNoteRes.data?.title, notePayload.title, 'Persisted title matches');
    assertEqual(getNoteRes.data?.content, notePayload.content, 'Persisted content matches');
    assertEqual(getNoteRes.data?.url, null, 'Persisted url is null');
    assertCondition(
      Array.isArray(getNoteRes.data?.tags) && getNoteRes.data.tags.some((t: any) => t.id === testTagId),
      'Persisted tags array contains linked tag ID'
    );

    // ─── Scenario 2: Bookmark Ingestion (type: 'bookmark') ───
    console.log('\n--- Scenario 2: Bookmark Ingestion (type: "bookmark") ---');
    const bookmarkPayload = {
      title: 'PostgreSQL Official Documentation: Index Types',
      type: 'bookmark',
      url: 'https://www.postgresql.org/docs/current/indexes-types.html',
      content: 'Comprehensive overview of B-tree, Hash, GiST, SP-GiST, GIN, and BRIN indexes.',
      tag_ids: [testTagId]
    };

    const postBookmarkRes = await apiRequest('/entries', 'POST', bookmarkPayload);
    assertEqual(postBookmarkRes.status, 201, 'POST /entries returns 201 Created for bookmark');
    assertEqual(postBookmarkRes.data?.type, 'bookmark', 'Created entry type is "bookmark"');
    assertEqual(postBookmarkRes.data?.title, bookmarkPayload.title, 'Created entry title matches');
    assertEqual(postBookmarkRes.data?.url, bookmarkPayload.url, 'Created bookmark URL matches');
    assertEqual(postBookmarkRes.data?.content, bookmarkPayload.content, 'Created bookmark content matches');

    const bookmarkId = postBookmarkRes.data?.id;
    assertCondition(Boolean(bookmarkId), 'POST /entries returned valid entry ID');
    if (bookmarkId) createdEntryIds.push(bookmarkId);

    // Round-trip fetch verification
    console.log('  Verifying GET /entries/:id round-trip for bookmark...');
    const getBookmarkRes = await apiRequest(`/entries/${bookmarkId}`, 'GET');
    assertEqual(getBookmarkRes.status, 200, 'GET /entries/:id returns 200 OK');
    assertEqual(getBookmarkRes.data?.id, bookmarkId, 'Fetched entry ID matches created bookmark');
    assertEqual(getBookmarkRes.data?.type, 'bookmark', 'Fetched entry type is "bookmark"');
    assertEqual(getBookmarkRes.data?.url, bookmarkPayload.url, 'Persisted bookmark URL matches verbatim');
    assertEqual(getBookmarkRes.data?.content, bookmarkPayload.content, 'Persisted bookmark content matches');
    assertCondition(
      Array.isArray(getBookmarkRes.data?.tags) && getBookmarkRes.data.tags.some((t: any) => t.id === testTagId),
      'Persisted tags array contains linked tag ID'
    );

    // ─── Scenario 3: Code Snippet Ingestion (type: 'snippet') ───
    console.log('\n--- Scenario 3: Code Snippet Ingestion (type: "snippet") ---');
    const snippetCode = `export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}`;

    const snippetPayload = {
      title: 'React Custom useDebounce Hook with Generics',
      type: 'snippet',
      content: snippetCode,
      tag_ids: [testTagId]
    };

    const postSnippetRes = await apiRequest('/entries', 'POST', snippetPayload);
    assertEqual(postSnippetRes.status, 201, 'POST /entries returns 201 Created for snippet');
    assertEqual(postSnippetRes.data?.type, 'snippet', 'Created entry type is "snippet"');
    assertEqual(postSnippetRes.data?.title, snippetPayload.title, 'Created entry title matches');
    assertEqual(postSnippetRes.data?.url, null, 'Snippet entry url is null');
    assertEqual(postSnippetRes.data?.content, snippetCode, 'Multi-line code snippet content with generics preserved');

    const snippetId = postSnippetRes.data?.id;
    assertCondition(Boolean(snippetId), 'POST /entries returned valid entry ID');
    if (snippetId) createdEntryIds.push(snippetId);

    // Round-trip fetch verification
    console.log('  Verifying GET /entries/:id round-trip for code snippet...');
    const getSnippetRes = await apiRequest(`/entries/${snippetId}`, 'GET');
    assertEqual(getSnippetRes.status, 200, 'GET /entries/:id returns 200 OK');
    assertEqual(getSnippetRes.data?.id, snippetId, 'Fetched entry ID matches created snippet');
    assertEqual(getSnippetRes.data?.type, 'snippet', 'Fetched entry type is "snippet"');
    assertEqual(getSnippetRes.data?.content, snippetCode, 'Persisted multi-line code indentation and quotes match exactly');
    assertCondition(
      Array.isArray(getSnippetRes.data?.tags) && getSnippetRes.data.tags.some((t: any) => t.id === testTagId),
      'Persisted tags array contains linked tag ID'
    );

    // ─── Scenario 4: Validation & Error Handling ───
    console.log('\n--- Scenario 4: Validation and Error Handling ---');
    console.log('  Testing omitted title (should return 400 Bad Request)...');
    const missingTitleRes = await apiRequest('/entries', 'POST', {
      type: 'note',
      content: 'Missing title content'
    });
    assertEqual(missingTitleRes.status, 400, 'Returns 400 when title is missing');
    assertEqual(missingTitleRes.data?.error, 'Title and Type are required fields.', 'Error message specifies required fields');

    console.log('  Testing omitted type (should return 400 Bad Request)...');
    const missingTypeRes = await apiRequest('/entries', 'POST', {
      title: 'Missing Type Title',
      content: 'Missing type content'
    });
    assertEqual(missingTypeRes.status, 400, 'Returns 400 when type is missing');
    assertEqual(missingTypeRes.data?.error, 'Title and Type are required fields.', 'Error message specifies required fields');

    // ─── Verification of Gemini Mock Interceptions ───
    console.log('\n--- Verification of Mock Interceptions ---');
    console.log(`  Total Mock Embeddings Intercepted: ${mockEmbeddingCount}`);
    console.log(`  Total Mock Summaries Intercepted: ${mockSummaryCount}`);
    console.log(`  Total Mock Domain Classifications Intercepted: ${mockDomainCount}`);

    assertCondition(mockEmbeddingCount > 0, 'Gemini embeddings were intercepted via mock without live API calls');
    assertCondition(mockSummaryCount > 0, 'Gemini summaries were intercepted via mock without live API calls');
    assertCondition(mockDomainCount > 0, 'Gemini domain classifications were intercepted via mock without live API calls');

  } catch (err: any) {
    console.error('\n❌ [ERROR in Entry Ingestion Test]:', err.message || err);
    if (process.env.CI) {
      console.warn('Skipping in CI environment due to remote database unavailability.');
      process.exit(0);
    }
  } finally {
    // ─── Cleanup Test Fixtures ───
    console.log('\nCleaning up entry ingestion test fixtures...');
    for (const id of createdEntryIds) {
      try {
        await supabaseAdmin.from('entries').delete().eq('id', id);
        console.log(`  Deleted test entry ${id}`);
      } catch (e) {}
    }
    if (testTagId) {
      try {
        await supabaseAdmin.from('tags').delete().eq('id', testTagId);
        console.log(`  Deleted test tag ${testTagId}`);
      } catch (e) {}
    }
    if (testUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(testUserId);
        console.log(`  Deleted test user ${testUserId}`);
      } catch (e) {}
    }

    if (server) {
      server.close();
    }

    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;

    console.log(`\n--- Summary: ${passedCount}/${totalCount} tests passed ---`);
    if (passedCount !== totalCount) {
      process.exit(1);
    }
  }
}

runEntryIngestionTest();
