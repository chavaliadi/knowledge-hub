/**
 * scripts/verify-migrations.ts — Verify all KnowledgeHub DB migrations are applied.
 *
 * Uses the Supabase JS client (service role key) to probe for every table,
 * column, and RPC function that the schema_v*.sql files create.
 *
 * Usage:
 *   bun run scripts/verify-migrations.ts
 *
 * Exit codes:
 *   0 — All migrations verified
 *   1 — One or more migrations are missing
 */
import { createClient } from '@supabase/supabase-js';
import '../lib/env';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

interface CheckResult {
  name: string;
  migration: string;
  exists: boolean;
}

async function checkTable(name: string): Promise<boolean> {
  // Use select('*') not select('id') — some tables (e.g. entry_tags) have no 'id' column
  const { error } = await supabase.from(name).select('*').limit(0);
  if (!error) return true;
  // "relation does not exist" means table is missing
  if (error.message.includes('does not exist') || error.code === '42P01') return false;
  // Other errors (RLS, permission) — table likely exists
  return true;
}

async function checkColumn(table: string, col: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(col).limit(0);
  return !error;
}

async function checkRpc(name: string, args: Record<string, any>): Promise<boolean> {
  const { error } = await supabase.rpc(name, args);
  if (!error) return true;
  if (error.message.includes('does not exist') || error.code === '42883') return false;
  return true; // Other errors mean function exists
}

async function verify() {
  const results: CheckResult[] = [];

  const check = (name: string, migration: string, exists: boolean) => {
    results.push({ name, migration, exists });
  };

  // schema.sql
  check('entries', 'schema.sql', await checkTable('entries'));
  check('tags', 'schema.sql', await checkTable('tags'));
  check('entry_tags', 'schema.sql', await checkTable('entry_tags'));

  // schema_v2.sql
  check('collections', 'schema_v2.sql', await checkTable('collections'));
  check('entries.collection_id', 'schema_v2.sql', await checkColumn('entries', 'collection_id'));
  check('entries.is_pinned', 'schema_v2.sql', await checkColumn('entries', 'is_pinned'));

  // schema_v3.sql
  check('attachments', 'schema_v3.sql', await checkTable('attachments'));

  // schema_v4.sql
  check('entries.embedding', 'schema_v4.sql', await checkColumn('entries', 'embedding'));
  check('match_entries()', 'schema_v4.sql', await checkRpc('match_entries', {
    query_embedding: JSON.stringify(new Array(768).fill(0)),
    match_threshold: 0.5,
    match_count: 1,
  }));

  // schema_v5.sql
  check('entries.summary', 'schema_v5.sql', await checkColumn('entries', 'summary'));
  check('entries.ai_tags', 'schema_v5.sql', await checkColumn('entries', 'ai_tags'));

  // schema_v6.sql
  check('entries.domains', 'schema_v6.sql', await checkColumn('entries', 'domains'));
  check('knowledge_reports', 'schema_v6.sql', await checkTable('knowledge_reports'));

  // schema_v7.sql
  check('entry_chunks', 'schema_v7.sql', await checkTable('entry_chunks'));
  check('match_chunks()', 'schema_v7.sql', await checkRpc('match_chunks', {
    query_embedding: JSON.stringify(new Array(768).fill(0)),
    match_threshold: 0.5,
    match_count: 1,
  }));

  // schema_v8.sql
  check('concept_links', 'schema_v8.sql', await checkTable('concept_links'));

  // Print results
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║      KnowledgeHub Database Migration Status         ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  
  let allOk = true;
  let currentMigration = '';
  for (const r of results) {
    if (r.migration !== currentMigration) {
      currentMigration = r.migration;
      console.log(`║  ${r.migration.padEnd(50)} ║`);
    }
    const icon = r.exists ? '✅' : '❌';
    const status = r.exists ? 'OK' : 'MISSING';
    console.log(`║    ${icon} ${r.name.padEnd(30)} ${status.padEnd(14)} ║`);
    if (!r.exists) allOk = false;
  }

  console.log('╠══════════════════════════════════════════════════════╣');
  if (allOk) {
    console.log('║  ✅ All migrations verified successfully!            ║');
  } else {
    console.log('║  ❌ Some migrations are MISSING — apply them first!  ║');
  }
  console.log('╚══════════════════════════════════════════════════════╝');

  process.exit(allOk ? 0 : 1);
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
