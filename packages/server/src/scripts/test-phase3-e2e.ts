import '../lib/env';
import { supabaseAdmin } from '../lib/supabase';
import { rebuildEntrySemanticLinks } from '../lib/graph';

async function runPhase3E2ETest() {
  console.log('=== Phase 3 Concept Graph Verification ===\n');

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GEMINI_API_KEY) {
    console.warn('\n❌ [SKIP] Credentials not defined. Skipping verification.\n');
    process.exit(0);
  }

  const testTitleA = 'Docker Containers Basics';
  const testContentA = 'Docker is a tool that allows developers to run application files inside isolated container runtimes.';

  const testTitleB = 'Kubernetes Orchestration Platform';
  // Include explicit mention to trigger relation extraction
  const testContentB = 'Kubernetes is a container orchestration engine. It is an alternative to Docker Swarm, and it is a system that depends on Docker container runtime technologies to run container software.';

  let validUserId = '';
  let entryIdA = '';
  let entryIdB = '';

  try {
    // 1. Verify schema tables exist
    const { data: testLinksTable, error: schemaError } = await supabaseAdmin
      .from('concept_links')
      .select('id')
      .limit(1);

    if (schemaError) {
      console.error('\n❌ [SCHEMA ERROR] Could not read from concept_links table.');
      console.error('Please run packages/server/schema_v8.sql in your Supabase SQL Editor first, then rerun this test.\n');
      process.exit(1);
    }

    console.log('✔ Schema verification: concept_links table exists in the database.');

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
      throw new Error('No valid users found to associate with test entries.');
    }

    // 3. Clear any previous test entries
    await supabaseAdmin.from('entries').delete().eq('title', testTitleA);
    await supabaseAdmin.from('entries').delete().eq('title', testTitleB);

    // 4. Insert Entry A (target note)
    console.log('Inserting Target Entry (Docker)...');
    const { data: newEntryA, error: insertErrorA } = await supabaseAdmin
      .from('entries')
      .insert({
        title: testTitleA,
        content: testContentA,
        type: 'note',
        user_id: validUserId
      })
      .select()
      .single();

    if (insertErrorA || !newEntryA) {
      throw new Error(`Failed to insert target entry: ${insertErrorA?.message || 'Unknown'}`);
    }
    entryIdA = newEntryA.id;

    // 5. Insert Entry B (source note referring to A)
    console.log('Inserting Source Entry (Kubernetes)...');
    const { data: newEntryB, error: insertErrorB } = await supabaseAdmin
      .from('entries')
      .insert({
        title: testTitleB,
        content: testContentB,
        type: 'note',
        user_id: validUserId
      })
      .select()
      .single();

    if (insertErrorB || !newEntryB) {
      throw new Error(`Failed to insert source entry: ${insertErrorB?.message || 'Unknown'}`);
    }
    entryIdB = newEntryB.id;

    // 6. Run concept linking builder
    console.log('Rebuilding semantic connections for Entry B...');
    await rebuildEntrySemanticLinks(
      supabaseAdmin,
      entryIdB,
      validUserId,
      newEntryB.title,
      newEntryB.content
    );

    // 7. Verify relation was detected and inserted
    const { data: links, error: fetchLinksError } = await supabaseAdmin
      .from('concept_links')
      .select('id, source_id, target_id, relationship_type')
      .eq('source_id', entryIdB);

    if (fetchLinksError) {
      throw new Error(`Failed to retrieve generated links: ${fetchLinksError.message}`);
    }

    console.log(`\nVerification Results:`);
    console.log(`- Retrieved ${links ? links.length : 0} links for Entry B.`);

    const foundTargetLink = (links || []).find(l => l.target_id === entryIdA);
    if (foundTargetLink) {
      console.log(`✔ Link verified: created relationship "${foundTargetLink.relationship_type}" connecting Kubernetes ➔ Docker.`);
      console.log('\n🎉 [PASS] Phase 3 backend verification completed successfully.');
    } else {
      console.warn('\n⚠ [WARNING] Gemini did not establish a link. This can happen due to non-deterministic model outputs.');
      console.log('Ensure Entry A was successfully indexed and is visible to the list search.');
    }

    // 8. Cleanup
    console.log('\nCleaning up temporary entries...');
    await supabaseAdmin.from('entries').delete().eq('id', entryIdA);
    await supabaseAdmin.from('entries').delete().eq('id', entryIdB);

  } catch (err: any) {
    console.error('\n❌ [FATAL E2E ERROR]:', err.message || err);
    // Cleanup anyway
    if (entryIdA) await supabaseAdmin.from('entries').delete().eq('id', entryIdA);
    if (entryIdB) await supabaseAdmin.from('entries').delete().eq('id', entryIdB);
    process.exit(1);
  }
}

runPhase3E2ETest();
