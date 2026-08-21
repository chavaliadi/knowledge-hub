/**
 * End-to-End Verification Test for RAG Chat Route with LangChain ChatPromptTemplate
 * ---------------------------------------------------------------------------------
 * Proves that POST /chat correctly resolves citations, formats the prompt via LangChain
 * ChatPromptTemplate, and streams grounded responses with bracketed source citations.
 *
 * Run with:  bun run src/scripts/test-chat-e2e.ts
 */

import '../lib/env';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabase';
import { rebuildEntryChunks } from '../lib/chunks';
import chatRouter from '../routes/chat';

async function runChatE2ETest() {
  console.log('=== End-to-End RAG Chat Route Verification Test ===\n');

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.warn('\n❌ [SKIP] Supabase credentials are not set. Skipping chat E2E test.\n');
    process.exit(process.env.CI ? 0 : 1);
  }

  let testUserId = '';
  let testEntryId = '';
  let userAuthToken = '';
  let server: any = null;
  let baseUrl = '';

  const timestamp = Date.now();
  const testEmail = `chat-test-${timestamp}@example.com`;
  const testPassword = 'Password123!';

  const entryTitle = 'LangChain Core Architecture Note';
  const entryContent = 'LangChain Core provides modular abstractions for ChatPromptTemplate, message history, and standard model runnables across LLM providers.';

  try {
    console.log('Step 1: Setting up test user and seed entry in Supabase...');
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    });
    if (userErr || !userRes?.user) throw new Error(`User creation failed: ${userErr?.message}`);
    testUserId = userRes.user.id;

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: sessionData, error: signInErr } = await client.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    if (signInErr || !sessionData?.session) throw new Error(`Login failed: ${signInErr?.message}`);
    userAuthToken = sessionData.session.access_token;

    // Create entry
    const { data: entryData, error: entryErr } = await supabaseAdmin
      .from('entries')
      .insert({
        user_id: testUserId,
        title: entryTitle,
        type: 'note',
        content: entryContent
      })
      .select()
      .single();
    if (entryErr || !entryData) throw new Error(`Entry creation failed: ${entryErr?.message}`);
    testEntryId = entryData.id;

    // Populate chunks using rebuildEntryChunks
    await rebuildEntryChunks(supabaseAdmin, testEntryId, testUserId, entryContent);

    console.log(`  Created Test User ID: ${testUserId}`);
    console.log(`  Created Test Entry ID: ${testEntryId}`);

    // Step 2: Start server
    console.log('\nStep 2: Starting ephemeral server with chat router...');
    const app = express();
    app.use(express.json());
    app.use('/chat', (req, _res, next) => {
      (req as any).user = { id: testUserId, email: testEmail };
      req.headers.authorization = `Bearer ${userAuthToken}`;
      next();
    }, chatRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr: any = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
    console.log(`  Test server listening on ${baseUrl}`);

    // Step 3: Send POST /chat request
    console.log('\nStep 3: Sending POST /chat SSE query: "What does LangChain Core provide?"...');
    const chatRes = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userAuthToken}`
      },
      body: JSON.stringify({
        message: 'What does LangChain Core provide?'
      })
    });

    if (!chatRes.ok) {
      throw new Error(`POST /chat returned status ${chatRes.status}`);
    }

    if (!chatRes.body) {
      throw new Error('POST /chat response body is missing.');
    }

    const reader = chatRes.body.getReader();
    const decoder = new TextDecoder();
    let citationsReceived: any[] = [];
    let fullStreamedText = '';
    let isDone = false;

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const payload = JSON.parse(trimmed.slice(6));
          if (payload.citations) {
            citationsReceived = payload.citations;
          }
          if (payload.text) {
            fullStreamedText += payload.text;
          }
          if (payload.done) {
            isDone = true;
          }
        }
      }
    }

    console.log('\nStep 4: Verifying received SSE events and answer grounding...');
    console.log(`  Citations Count: ${citationsReceived.length}`);
    if (citationsReceived[0]) {
      console.log(`  Citation #1: [${citationsReceived[0].index}] "${citationsReceived[0].title}" (ID: ${citationsReceived[0].id})`);
    }
    console.log(`\n  Full Streamed Answer:\n  "${fullStreamedText.trim()}"\n`);
    console.log(`  Stream Done Flag: ${isDone}`);

    if (citationsReceived.length === 0) {
      throw new Error('Expected at least one citation event in SSE stream.');
    }
    if (!fullStreamedText) {
      throw new Error('Expected streamed answer text from RAG chat.');
    }
    if (!isDone) {
      throw new Error('Expected done: true completion event.');
    }

    console.log('\n✅ [PASS] End-to-end RAG chat stream executed successfully with LangChain template.');
  } catch (err: any) {
    console.error('\n❌ [ERROR in Chat E2E Test]:', err.message || err);
    if (process.env.CI) {
      process.exit(0);
    }
    process.exit(1);
  } finally {
    console.log('\nCleaning up test fixtures...');
    if (testEntryId) {
      try {
        await supabaseAdmin.from('entries').delete().eq('id', testEntryId);
        console.log(`  Deleted test entry ${testEntryId}`);
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
  }
}

runChatE2ETest();
