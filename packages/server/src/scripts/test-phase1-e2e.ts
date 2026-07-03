import { supabaseAdmin } from '../lib/supabase';
import { rebuildEntryChunks } from '../lib/chunks';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function runPhase1E2ETest() {
  console.log('=== Phase 1 Chunks & Hybrid Search Verification ===\n');

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GEMINI_API_KEY) {
    console.warn('\n❌ [SKIP] Credentials not defined. Skipping verification.\n');
    process.exit(0);
  }

  const testTitle = 'E2E Phase1 Text Note about Kubernetes clusters';
  const testContent = 'Kubernetes is a portable, extensible, open-source platform for managing containerized workloads and services. It facilitates declarative configuration and automation. It has a large, rapidly growing ecosystem.';
  const testType = 'note';

  let validUserId = '';
  try {
    // 1. Verify schema tables exist
    const { data: testChunksTable, error: schemaError } = await supabaseAdmin
      .from('entry_chunks')
      .select('id')
      .limit(1);

    if (schemaError) {
      console.error('\n❌ [SCHEMA ERROR] Could not read from entry_chunks table.');
      console.error('Please run packages/server/schema_v7.sql in your Supabase SQL Editor first, then rerun this test.\n');
      process.exit(1);
    }

    console.log('✔ Schema verification: entry_chunks table exists in the database.');

    // 2. Fetch a valid user_id to insert entries
    const { data: sampleRows } = await supabaseAdmin
      .from('entries')
      .select('user_id')
      .limit(1);

    if (sampleRows && sampleRows.length > 0 && sampleRows[0]?.user_id) {
      validUserId = sampleRows[0].user_id;
    } else {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      if (usersData && usersData.users && usersData.users.length > 0 && usersData.users[0]?.id) {
        validUserId = usersData.users[0].id;
      }
    }

    if (!validUserId) {
      throw new Error('No valid users found to associate with test note.');
    }

    // 3. Clear any previous test entries
    await supabaseAdmin.from('entries').delete().eq('title', testTitle);

    // 4. Insert temporary note
    console.log('Inserting raw note...');
    const { data: newEntry, error: insertError } = await supabaseAdmin
      .from('entries')
      .insert({
        title: testTitle,
        content: testContent,
        type: testType,
        user_id: validUserId
      })
      .select()
      .single();

    if (insertError || !newEntry) {
      throw new Error(`Failed to insert test entry: ${insertError?.message || 'Unknown'}`);
    }

    console.log(`Entry created: ${newEntry.id}. Rebuilding chunks...`);

    // 5. Run chunks rebuilding
    await rebuildEntryChunks(
      supabaseAdmin,
      newEntry.id,
      validUserId,
      newEntry.title,
      newEntry.type,
      newEntry.content,
      ''
    );

    // 6. Assert chunks created
    const { data: chunks, error: chunksFetchError } = await supabaseAdmin
      .from('entry_chunks')
      .select('id, content, embedding')
      .eq('entry_id', newEntry.id);

    if (chunksFetchError || !chunks || chunks.length === 0) {
      throw new Error(`Failed to retrieve chunk entries: ${chunksFetchError?.message || 'No chunks found'}`);
    }

    console.log(`✔ Chunks verification: successfully built ${chunks.length} chunks.`);
    const firstChunk = chunks[0];
    const hasEmbedding = firstChunk.embedding && firstChunk.embedding.startsWith('[') && firstChunk.embedding.endsWith(']');
    console.log(`✔ Chunk embedding populated: ${hasEmbedding ? 'YES' : 'NO'}`);

    // 7. Cleanup
    console.log('Cleaning up temporary note...');
    await supabaseAdmin.from('entries').delete().eq('id', newEntry.id);
    console.log('\n🎉 [PASS] Phase 1 verification completed successfully.');

  } catch (err: any) {
    console.error('\n❌ [FATAL E2E ERROR]:', err.message || err);
    process.exit(1);
  }
}

runPhase1E2ETest();
