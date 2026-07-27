/**
 * Reindexer E2E Positive Path Test
 * --------------------------------
 * Inserts a test entry with empty/null metadata (embedding, summary, domains),
 * triggers the reindex subprocess, and verifies that the metadata is successfully
 * generated and stored in the database. Finally, cleans up the test entry.
 *
 * Run with:  bun run src/scripts/test-reindex-e2e.ts
 */

import { supabaseAdmin } from '../lib/supabase';
import { execSync } from 'child_process';
import '../lib/env';
import path from 'path';

async function runReindexerE2ETest() {
  console.log('=== Reindexer E2E Verification ===\n');

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GEMINI_API_KEY) {
    console.warn('\n❌ [SKIP] SUPABASE_SERVICE_ROLE_KEY or GEMINI_API_KEY is not set. Skipping reindexer E2E test.\n');
    process.exit(process.env.CI ? 0 : 1);
  }

  const testTitle = 'E2E Reindexer Test Target Note';
  const testContent = 'This is a test note for validating the reindexer script. It contains technical terms like Docker, Kubernetes, and Bun.';
  const testType = 'note';

  let validUserId = '';
  let createdTempUser = false;

  try {
    // 1. Fetch valid user_id from the entries table (most common in populated dev db)
    const { data: sampleRows } = await supabaseAdmin
      .from('entries')
      .select('user_id')
      .limit(1);

    if (sampleRows && sampleRows.length > 0 && sampleRows[0]?.user_id) {
      validUserId = sampleRows[0].user_id;
      console.log(`Using existing user ID from entries: ${validUserId}`);
    } else {
      // 2. Fallback: Query auth schema for existing user
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      if (usersData && usersData.users && usersData.users.length > 0 && usersData.users[0]?.id) {
        validUserId = usersData.users[0].id;
        console.log(`Using existing auth user ID: ${validUserId}`);
      } else {
        // 3. Fallback: Create a temporary test user if the database is entirely unseeded
        console.log('No users found in database. Creating a temporary test user...');
        const tempEmail = `reindex-test-${Date.now()}@example.com`;
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: tempEmail,
          password: 'Password123!',
          email_confirm: true
        });
        if (createError || !newUser || !newUser.user) {
          throw new Error(`Failed to seed a valid user: ${createError?.message || 'Unknown error'}`);
        }
        validUserId = newUser.user.id;
        createdTempUser = true;
        console.log(`Created temporary test user ID: ${validUserId}`);
      }
    }

    // 2. Ensure any old test run entry is cleaned up first
    await supabaseAdmin
      .from('entries')
      .delete()
      .eq('title', testTitle);

    // 3. Insert a fresh note missing all AI/vector metadata (all set to null)
    console.log('Inserting raw test entry with NULL metadata...');
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from('entries')
      .insert({
        title: testTitle,
        content: testContent,
        type: testType,
        embedding: null,
        summary: null,
        domains: null,
        ai_tags: null,
        user_id: validUserId
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert test note: ${insertError.message}`);
    }

    const entryId = insertData.id;
    console.log(`Inserted entry successfully. ID: ${entryId}`);

    // 4. Trigger the reindex script as a subprocess
    console.log('\nRunning reindex script as a subprocess...');
    const output = execSync('bun run src/scripts/reindex.ts', {
      cwd: path.resolve(__dirname, '../../'),
      encoding: 'utf-8'
    });
    console.log('--- Subprocess Output Start ---');
    console.log(output.trim());
    console.log('--- Subprocess Output End ---\n');

    // 5. Fetch the entry back to confirm metadata population
    console.log('Fetching updated entry from database...');
    const { data: updatedData, error: fetchError } = await supabaseAdmin
      .from('entries')
      .select('embedding, summary, domains, ai_tags')
      .eq('id', entryId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch updated entry: ${fetchError.message}`);
    }

    // 6. Assertions
    // Note: PostgREST/Supabase client returns vector columns as string formatted arrays (e.g. "[0.1, -0.2, ...]")
    const embeddingVal = updatedData.embedding;
    const hasEmbedding = embeddingVal !== null && (
      Array.isArray(embeddingVal) || 
      (typeof embeddingVal === 'string' && embeddingVal.startsWith('[') && embeddingVal.endsWith(']'))
    );
    const hasSummary = updatedData.summary !== null && typeof updatedData.summary === 'string' && updatedData.summary.trim().length > 0;
    const hasDomains = updatedData.domains !== null && Array.isArray(updatedData.domains) && updatedData.domains.length > 0;
    
    console.log('Verification Results:');
    console.log(`- Vector Embedding populated: ${hasEmbedding ? '✅ YES' : '❌ NO'}`);
    console.log(`- AI Summary populated: ${hasSummary ? '✅ YES' : '❌ NO'}`);
    console.log(`- Domains classified: ${hasDomains ? '✅ YES' : '❌ NO'}`);
    
    // Clean up database row
    console.log('\nCleaning up E2E test entry...');
    await supabaseAdmin
      .from('entries')
      .delete()
      .eq('id', entryId);

    // Clean up temporary user if one was created
    if (createdTempUser && validUserId) {
      console.log(`Deleting temporary test user ID: ${validUserId}...`);
      await supabaseAdmin.auth.admin.deleteUser(validUserId);
    }

    if (hasEmbedding && hasSummary && hasDomains) {
      console.log('\n✅ [PASS] Reindexer E2E Verification complete: entries are successfully processed and saved.');
    } else {
      console.error('\n❌ [FAIL] Reindexer script executed but some metadata fields remained null.');
      process.exit(1);
    }

  } catch (err: any) {
    console.error('\n❌ [FATAL E2E ERROR]:', err.message || err);
    
    // Attempt cleanup of temp user on failure
    if (createdTempUser && validUserId) {
      try {
        console.log(`Attempting cleanup of temporary test user ID: ${validUserId}...`);
        await supabaseAdmin.auth.admin.deleteUser(validUserId);
      } catch (e) {}
    }
    process.exit(1);
  }
}

runReindexerE2ETest();
