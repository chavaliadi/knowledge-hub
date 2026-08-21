/**
 * LangChain Model Abstraction Sandbox
 * -----------------------------------
 * Standalone evaluation script for provider abstraction wrappers:
 *   - ChatGoogleGenerativeAI (@langchain/google-genai)
 *   - ChatGroq (@langchain/groq)
 *
 * NOTE: This is a standalone sandbox for learning and API comparison.
 * It is NOT wired into production routes and does NOT replace llm.ts failover logic.
 *
 * Run with:  bun run src/scripts/langchain-model-sandbox.ts
 */

import '../lib/env';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { ragChatPromptTemplate } from '../lib/prompts';

async function runModelSandbox() {
  console.log('=== LangChain Model Abstraction Sandbox ===\n');

  const geminiKey = process.env.GEMINI_API_KEY || '';
  const groqKey = process.env.GROQ_API_KEY || '';

  console.log(`Environment Key Detection:`);
  console.log(`  GEMINI_API_KEY: ${geminiKey ? 'Present (Configured)' : 'Missing'}`);
  console.log(`  GROQ_API_KEY:   ${groqKey ? 'Present (Configured)' : 'Missing'}\n`);

  const sampleContext = `[Source #1]
Title: Search Index Fundamentals
Type: note
Content: Inverted indexes map words to document identifiers for exact keyword lookup. Vector indexes map high-dimensional embeddings to proximity neighborhoods using cosine distance for semantic retrieval.`;

  const sampleQuery = 'How do inverted indexes and vector indexes differ?';

  // ─── Test 1: Prompt Template Resolution ───
  console.log('--- Test 1: ChatPromptTemplate Formatting ---');
  const promptValue = await ragChatPromptTemplate.formatMessages({
    context: sampleContext,
    question: sampleQuery
  });
  console.log(`Formatted Messages Count: ${promptValue.length}`);
  console.log(`System Message Preview (first 120 chars): "${(promptValue[0]?.content as string).slice(0, 120)}..."`);
  console.log(`Human Message: "${promptValue[1]?.content as string}"\n`);

  // ─── Test 2: Side-by-Side Model Invocation ───
  console.log('--- Test 2: Side-by-Side Model Execution ---');

  if (geminiKey) {
    try {
      console.log('Invoking ChatGoogleGenerativeAI (gemini-2.5-flash)...');
      const t0 = Date.now();
      const geminiModel = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash',
        apiKey: geminiKey,
        temperature: 0.2
      });
      const geminiRes = await geminiModel.invoke(promptValue);
      const geminiDuration = Date.now() - t0;
      console.log(`  ✅ Gemini Response (${geminiDuration}ms):`);
      console.log(`  "${(geminiRes.content as string).trim()}"\n`);
    } catch (err: any) {
      console.error(`  ❌ Gemini Invocation Failed:`, err.message || err);
    }
  } else {
    console.log('  [SKIP] GEMINI_API_KEY not provided, skipping Gemini live invocation.\n');
  }

  if (groqKey) {
    try {
      console.log('Invoking ChatGroq (openai/gpt-oss-120b)...');
      const t0 = Date.now();
      const groqModel = new ChatGroq({
        model: 'openai/gpt-oss-120b',
        apiKey: groqKey,
        temperature: 0.2
      });
      const groqRes = await groqModel.invoke(promptValue);
      const groqDuration = Date.now() - t0;
      console.log(`  ✅ Groq Response (${groqDuration}ms):`);
      console.log(`  "${(groqRes.content as string).trim()}"\n`);
    } catch (err: any) {
      console.error(`  ❌ Groq Invocation Failed:`, err.message || err);
    }
  } else {
    console.log('  [SKIP] GROQ_API_KEY not provided, skipping Groq live invocation.\n');
  }

  // ─── Test 3: Error Shape Analysis with Invalid API Keys ───
  console.log('--- Test 3: Error Shape Analysis with Invalid API Keys ---');

  console.log('Testing ChatGoogleGenerativeAI with bad API key...');
  try {
    const badGemini = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: 'INVALID_GEMINI_KEY_XYZ_123',
      temperature: 0.2
    });
    await badGemini.invoke('Hello test');
    console.error('  ❌ Expected error was not thrown by Gemini wrapper.');
  } catch (err: any) {
    console.log('  ✅ Captured Gemini Error Shape:');
    console.log(`    Error Name:    ${err.name}`);
    console.log(`    Error Message: ${err.message?.slice(0, 160)}...`);
    console.log(`    Status Code:   ${err.status || err.statusCode || err.statusText || 'N/A'}`);
    console.log(`    Error Class:   ${err.constructor?.name}`);
  }

  console.log('\nTesting ChatGroq with bad API key...');
  try {
    const badGroq = new ChatGroq({
      model: 'openai/gpt-oss-120b',
      apiKey: 'gsk_INVALID_GROQ_KEY_XYZ_123',
      temperature: 0.2
    });
    await badGroq.invoke('Hello test');
    console.error('  ❌ Expected error was not thrown by Groq wrapper.');
  } catch (err: any) {
    console.log('  ✅ Captured Groq Error Shape:');
    console.log(`    Error Name:    ${err.name}`);
    console.log(`    Error Message: ${err.message?.slice(0, 160)}...`);
    console.log(`    Status Code:   ${err.status || err.statusCode || err.statusText || 'N/A'}`);
    console.log(`    Error Class:   ${err.constructor?.name}`);
  }

  console.log('\n=== Sandbox Execution Finished ===');
}

runModelSandbox();
