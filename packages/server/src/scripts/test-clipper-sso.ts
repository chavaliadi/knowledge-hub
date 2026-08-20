/**
 * Clipper Extension SSO Auth Token Extraction Unit Test
 * -----------------------------------------------------
 * Validates the core local-storage parsing logic used by the Chrome Clipper
 * extension to discover active Supabase sessions without requiring manual login.
 *
 * Run with:  bun run src/scripts/test-clipper-sso.ts
 */

import { extractSupabaseAuthToken } from '../../../clipper-extension/auth-helper.js';

async function runClipperSSOTest() {
  console.log('=== Clipper Extension SSO Token Extraction Unit Test ===\n');

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

  // Helper to create Web Storage mock with getItem, key, length
  function createMockStorage(store: Record<string, string>): Storage {
    const keys = Object.keys(store);
    return {
      length: keys.length,
      key: (i: number) => keys[i] ?? null,
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      }
    } as Storage;
  }

  // ─── Test 1: Valid Supabase auth token in Web Storage ───
  console.log('Test 1: Extracts access_token from standard Storage object with sb-*-auth-token key...');
  const validPayload = JSON.stringify({
    access_token: 'valid.jwt.payload.user123',
    token_type: 'bearer',
    expires_in: 3600
  });

  const storage1 = createMockStorage({
    'theme': 'dark',
    'sb-olbynonipupurioxgjuf-auth-token': validPayload,
    'sidebar_collapsed': 'false'
  });

  const token1 = extractSupabaseAuthToken(storage1);
  assertEqual(token1, 'valid.jwt.payload.user123', 'Extracted valid JWT from Storage');

  // ─── Test 2: Plain key-value object map fallback ───
  console.log('\nTest 2: Extracts access_token from plain object dictionary...');
  const storage2 = {
    'other-key': 'value',
    'sb-mycustomref-auth-token': JSON.stringify({
      access_token: 'another.valid.jwt.token'
    })
  };
  const token2 = extractSupabaseAuthToken(storage2);
  assertEqual(token2, 'another.valid.jwt.token', 'Extracted JWT from plain object map');

  // ─── Test 3: Malformed JSON in auth key does not crash and returns null ───
  console.log('\nTest 3: Handles corrupted/malformed JSON gracefully...');
  const storage3 = createMockStorage({
    'sb-corrupted-auth-token': '{ not valid json ::: }',
    'other': '123'
  });
  const token3 = extractSupabaseAuthToken(storage3);
  assertEqual(token3, null, 'Returns null on malformed JSON without throwing');

  // ─── Test 4: Missing access_token field returns null ───
  console.log('\nTest 4: Missing access_token field inside parsed JSON...');
  const storage4 = createMockStorage({
    'sb-empty-auth-token': JSON.stringify({ user: 'anonymous' })
  });
  const token4 = extractSupabaseAuthToken(storage4);
  assertEqual(token4, null, 'Returns null when access_token property is absent');

  // ─── Test 5: No matching Supabase key returns null ───
  console.log('\nTest 5: Storage without Supabase auth key...');
  const storage5 = createMockStorage({
    'regular_key': 'abc',
    'auth_token_other': 'xyz'
  });
  const token5 = extractSupabaseAuthToken(storage5);
  assertEqual(token5, null, 'Returns null when no sb-*-auth-token key is present');

  // ─── Test 6: Null or undefined storage argument ───
  console.log('\nTest 6: Handles null and undefined input...');
  assertEqual(extractSupabaseAuthToken(null), null, 'Returns null for null storage');
  assertEqual(extractSupabaseAuthToken(undefined), null, 'Returns null for undefined storage');

  console.log(`\n--- Summary: ${passedCount}/${totalCount} tests passed ---`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runClipperSSOTest();
