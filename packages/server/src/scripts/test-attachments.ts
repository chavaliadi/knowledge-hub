/**
 * Attachment Extraction Unit Test
 * ------------------------------
 * Validates local PDF text extraction (pdf-parse v2) and image OCR parsing (Gemini vision)
 * without requiring external Supabase storage or live Google Gemini API network access.
 *
 * Run with:  bun run src/scripts/test-attachments.ts
 */

import '../lib/env';
import { extractTextFromAttachment } from '../lib/attachments';

function buildMinimalValidPdf(text: string): Buffer {
  const objects: string[] = [];

  // Obj 1: Catalog
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  // Obj 2: Pages
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
  // Obj 3: Page
  objects.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`);
  // Obj 4: Stream Content
  const streamContent = `BT\n/F1 12 Tf\n50 700 Td\n(${text}) Tj\nET\n`;
  objects.push(`4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf-8')} >>\nstream\n${streamContent}endstream\nendobj\n`);
  // Obj 5: Font
  objects.push(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf-8'));
    body += obj;
  }

  const xrefOffset = Buffer.byteLength(body, 'utf-8');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, '0');
    xref += `${offsetStr} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body + xref + trailer, 'utf-8');
}

async function runAttachmentsTest() {
  console.log('=== Attachment Text Extraction Unit Test ===\n');

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

  const pdfBuffer = buildMinimalValidPdf('KnowledgeHub Sample PDF Content');

  // Minimal Valid 1x1 PNG Buffer
  const minimalPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(minimalPngBase64, 'base64');

  // Helper to create a mocked Supabase client returning given buffer
  function createMockSupabase(bufferToReturn: Buffer | null, shouldError = false) {
    return {
      storage: {
        from: (_bucketName: string) => ({
          download: async (_filePath: string) => {
            if (shouldError || !bufferToReturn) {
              return { data: null, error: { message: 'Mock storage download error' } };
            }
            return {
              data: {
                arrayBuffer: async () => bufferToReturn.buffer.slice(
                  bufferToReturn.byteOffset,
                  bufferToReturn.byteOffset + bufferToReturn.byteLength
                )
              },
              error: null
            };
          }
        })
      }
    };
  }

  // ─── Test 1: Local PDF Text Extraction ───
  console.log('Test 1: Extract text from PDF attachment via local pdf-parse parser...');
  try {
    const mockSupabasePdf = createMockSupabase(pdfBuffer);
    const extractedPdfText = await extractTextFromAttachment(
      mockSupabasePdf,
      'test-user/sample.pdf',
      'application/pdf',
      'sample.pdf'
    );

    console.log(`  Parsed text output: "${extractedPdfText.trim()}"`);
    assertCondition(
      extractedPdfText.includes('KnowledgeHub Sample PDF Content'),
      'Extracted known text from valid PDF document'
    );
  } catch (err: any) {
    assertCondition(false, `PDF test threw unexpectedly: ${err.message}`);
  }

  // ─── Test 2: Gemini Vision Multimodal Image OCR (Mocked HTTP Fetch) ───
  console.log('\nTest 2: Extract text from image attachment via Gemini Vision OCR API...');
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  let ocrEndpointCalled = false;

  try {
    process.env.GEMINI_API_KEY = 'TEST_GEMINI_KEY_FOR_OCR';

    globalThis.fetch = (async (url: any, _options: any) => {
      const urlStr = typeof url === 'string' ? url : (url as any).url || '';
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        ocrEndpointCalled = true;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: 'Architecture Diagram: Microservices Flow with Redis & PostgreSQL' }
                  ]
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, _options);
    }) as any;

    const mockSupabasePng = createMockSupabase(pngBuffer);
    const extractedOcrText = await extractTextFromAttachment(
      mockSupabasePng,
      'test-user/diagram.png',
      'image/png',
      'diagram.png'
    );

    console.log(`  Parsed OCR output: "${extractedOcrText.trim()}"`);
    assertCondition(ocrEndpointCalled, 'Called Gemini Vision endpoint with image payload');
    assertCondition(
      extractedOcrText.includes('Architecture Diagram: Microservices Flow'),
      'Returned extracted text content from image OCR response'
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
  }

  // ─── Test 3: Unsupported File Types Return Empty String ───
  console.log('\nTest 3: Unsupported MIME types return empty string without parsing...');
  const mockSupabaseZip = createMockSupabase(Buffer.from('PK...zip'));
  const zipText = await extractTextFromAttachment(
    mockSupabaseZip,
    'test-user/archive.zip',
    'application/zip',
    'archive.zip'
  );
  assertCondition(zipText === '', 'Returns empty string for non-PDF, non-image files');

  // ─── Test 4: Download Failures Handled Gracefully ───
  console.log('\nTest 4: Supabase storage download failures return empty string without throwing...');
  const mockSupabaseError = createMockSupabase(null, true);
  const errorText = await extractTextFromAttachment(
    mockSupabaseError,
    'missing-file.pdf',
    'application/pdf',
    'missing-file.pdf'
  );
  assertCondition(errorText === '', 'Returns empty string on storage download error');

  console.log(`\n--- Summary: ${passedCount}/${totalCount} tests passed ---`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runAttachmentsTest();
