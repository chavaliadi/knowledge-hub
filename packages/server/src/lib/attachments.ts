import { PDFParse } from 'pdf-parse';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Downloads a file from Supabase Storage and extracts text content from it.
 * - PDFs: Extracted locally using pdf-parse PDFParse class (v2 syntax).
 * - Images: OCR/transcription performed using Google's multimodal Gemini-1.5-flash API.
 * - Others: Returns an empty string.
 */
export async function extractTextFromAttachment(
  supabaseClient: any,
  filePath: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  try {
    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const isImage = mimeType.startsWith('image/');

    if (!isPdf && !isImage) {
      return '';
    }

    console.log(`Extracting text from attachment: ${fileName} (${mimeType})`);

    // 1. Download file buffer from Supabase Storage
    const { data: blob, error: downloadError } = await supabaseClient.storage
      .from('Knowledge-Hub')
      .download(filePath);

    if (downloadError || !blob) {
      console.error(`Failed to download attachment ${filePath}:`, downloadError?.message || 'Empty response blob');
      return '';
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Local PDF extraction using PDFParse v2 API
    if (isPdf) {
      try {
        const uint8Array = new Uint8Array(buffer);
        const parser = new PDFParse({ data: uint8Array });
        const parsedPdf = await parser.getText();
        await parser.destroy();
        console.log(`Successfully extracted ${parsedPdf.text.length} characters from PDF ${fileName}`);
        return parsedPdf.text || '';
      } catch (pdfErr: any) {
        console.error(`Failed local PDF text parsing for ${fileName}:`, pdfErr.message || pdfErr);
        return '';
      }
    }

    // 3. Gemini Multimodal Image OCR
    if (isImage) {
      if (!GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY is missing. Skipping image OCR.');
        return '';
      }

      const base64Data = buffer.toString('base64');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

      const prompt = `Analyze this image uploaded to a developer knowledge base. Extract all text/code from it. If the image is a diagram, chart, or system architecture schematic, provide a detailed description of the components and relationship flow as well. Output only the extracted text and diagram descriptions, with no conversational introduction or filler.`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Gemini image OCR failed for ${fileName}:`, response.status, errText);
        return '';
      }

      const result = (await response.json()) as any;
      const extractedText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`Successfully extracted ${extractedText.length} characters from Image ${fileName} via Gemini OCR`);
      return extractedText;
    }

    return '';
  } catch (err: any) {
    console.error(`Failed to process attachment text indexing for ${fileName}:`, err.message || err);
    return '';
  }
}
