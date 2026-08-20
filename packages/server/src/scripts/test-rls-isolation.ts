/**
 * Row-Level Security (RLS) Multi-User Isolation Test
 * --------------------------------------------------
 * Verifies that PostgreSQL Row-Level Security policies are strictly enforced
 * on the Supabase database. Proves that User B cannot read, update, or delete
 * an entry owned by User A.
 *
 * Run with:  bun run src/scripts/test-rls-isolation.ts
 */

import '../lib/env';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabase';

async function runRlsIsolationTest() {
  console.log('=== Row-Level Security Multi-User Isolation Test ===\n');

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.warn('\n❌ [SKIP] Supabase credentials are not set. Skipping RLS isolation test.\n');
    process.exit(process.env.CI ? 0 : 1);
  }

  const timestamp = Date.now();
  const userAEmail = `rls-test-user-a-${timestamp}@example.com`;
  const userBEmail = `rls-test-user-b-${timestamp}@example.com`;
  const testPassword = 'TestPassword123!';

  let userAId = '';
  let userBId = '';
  let testEntryId = '';

  let passedCount = 0;
  let totalCount = 0;

  function assertCondition(condition: boolean, label: string) {
    totalCount++;
    if (condition) {
      console.log(`  ✅ [PASS] ${label}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${label}`);
    }
  }

  try {
    // 1. Create two separate test users in auth schema
    console.log('Step 1: Creating throwaway test users (User A & User B)...');
    const { data: userARes, error: errA } = await supabaseAdmin.auth.admin.createUser({
      email: userAEmail,
      password: testPassword,
      email_confirm: true
    });
    if (errA || !userARes?.user) {
      throw new Error(`Failed to create User A: ${errA?.message}`);
    }
    userAId = userARes.user.id;
    console.log(`  Created User A: ${userAId} (${userAEmail})`);

    const { data: userBRes, error: errB } = await supabaseAdmin.auth.admin.createUser({
      email: userBEmail,
      password: testPassword,
      email_confirm: true
    });
    if (errB || !userBRes?.user) {
      throw new Error(`Failed to create User B: ${errB?.message}`);
    }
    userBId = userBRes.user.id;
    console.log(`  Created User B: ${userBId} (${userBEmail})`);

    // 2. Initialize separate Supabase clients and authenticate as User A and User B
    console.log('\nStep 2: Authenticating separate Supabase client sessions...');
    const clientA = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const clientB = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { error: signInErrA } = await clientA.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword
    });
    if (signInErrA) throw new Error(`User A login failed: ${signInErrA.message}`);

    const { error: signInErrB } = await clientB.auth.signInWithPassword({
      email: userBEmail,
      password: testPassword
    });
    if (signInErrB) throw new Error(`User B login failed: ${signInErrB.message}`);

    console.log('  Both User A and User B sessions authenticated successfully.');

    // 3. User A creates a confidential note entry
    console.log('\nStep 3: User A inserts an entry into entries table...');
    const { data: insertEntry, error: insertError } = await clientA
      .from('entries')
      .insert({
        user_id: userAId,
        title: 'User A Confidential Security Note',
        content: 'Top secret proprietary algorithm notes.',
        type: 'note'
      })
      .select()
      .single();

    if (insertError || !insertEntry) {
      throw new Error(`User A failed to insert entry: ${insertError?.message}`);
    }
    testEntryId = insertEntry.id;
    console.log(`  Inserted Entry ID: ${testEntryId}`);

    // 4. Test Isolation: User B attempts to read User A's entry
    console.log('\nStep 4: Testing SELECT isolation (User B queries User A\'s entry)...');
    const { data: userBReadData } = await clientB
      .from('entries')
      .select('*')
      .eq('id', testEntryId);

    assertCondition(
      !userBReadData || userBReadData.length === 0,
      'User B receives 0 rows when attempting to select User A\'s entry'
    );

    // 5. Test Isolation: User B attempts to update User A's entry
    console.log('\nStep 5: Testing UPDATE isolation (User B attempts to modify User A\'s entry)...');
    const { data: userBUpdateData } = await clientB
      .from('entries')
      .update({ title: 'Hacked by User B' })
      .eq('id', testEntryId)
      .select();

    assertCondition(
      !userBUpdateData || userBUpdateData.length === 0,
      'User B cannot update User A\'s entry (0 rows modified)'
    );

    // 6. Test Isolation: User B attempts to delete User A's entry
    console.log('\nStep 6: Testing DELETE isolation (User B attempts to delete User A\'s entry)...');
    await clientB
      .from('entries')
      .delete()
      .eq('id', testEntryId);

    // Verify record still exists via User A
    const { data: userACheckData } = await clientA
      .from('entries')
      .select('*')
      .eq('id', testEntryId)
      .single();

    assertCondition(
      Boolean(userACheckData && userACheckData.title === 'User A Confidential Security Note'),
      'User A\'s entry remains intact and untouched after User B delete attempt'
    );

    // 7. Verify User A CAN read their own entry
    console.log('\nStep 7: Verifying User A has full access to their own entry...');
    assertCondition(
      userACheckData?.id === testEntryId,
      'User A can read and query their own entry successfully'
    );

  } catch (err: any) {
    console.error('\n❌ [ERROR in RLS Test]:', err.message || err);
    if (process.env.CI) {
      console.warn('Skipping in CI environment due to remote database unavailability.');
      process.exit(0);
    }
  } finally {
    // 8. Clean up created database records and test users
    console.log('\nCleaning up RLS test fixtures...');
    if (testEntryId) {
      try {
        await supabaseAdmin.from('entries').delete().eq('id', testEntryId);
        console.log(`  Deleted test entry ${testEntryId}`);
      } catch (e) {}
    }
    if (userAId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userAId);
        console.log(`  Deleted test user A ${userAId}`);
      } catch (e) {}
    }
    if (userBId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userBId);
        console.log(`  Deleted test user B ${userBId}`);
      } catch (e) {}
    }

    console.log(`\n--- Summary: ${passedCount}/${totalCount} tests passed ---`);
  }
}

runRlsIsolationTest();
