/**
 * Text chunker implementation matching recursive character splitting strategies.
 * Splits text by trying delimiters sequentially to keep paragraphs, sentences, 
 * and words intact while keeping chunk sizes uniform.
 */

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const chunkSize = options.chunkSize ?? 1000;
  const chunkOverlap = options.chunkOverlap ?? 200;

  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be strictly smaller than chunkSize');
  }

  const delimiters = ['\n\n', '\n', '. ', ' ', ''];
  
  function splitRecursive(textToSplit: string, currentLevel: number): string[] {
    const trimmed = textToSplit.trim();
    if (trimmed.length <= chunkSize) {
      return [trimmed];
    }

    if (currentLevel >= delimiters.length) {
      // Base case: split text by maximum chunk size directly if no delimiter fits
      const fallbackChunks: string[] = [];
      let index = 0;
      while (index < trimmed.length) {
        fallbackChunks.push(trimmed.slice(index, index + chunkSize).trim());
        index += (chunkSize - chunkOverlap);
      }
      return fallbackChunks.filter(Boolean);
    }

    const delimiter = delimiters[currentLevel];
    if (delimiter === undefined) {
      return [trimmed];
    }

    let splits: string[] = [];
    if (delimiter === '') {
      splits = trimmed.split('');
    } else {
      splits = trimmed.split(delimiter);
    }

    const chunks: string[] = [];
    let currentChunk = '';

    for (let i = 0; i < splits.length; i++) {
      const rawSegment = splits[i];
      if (rawSegment === undefined) continue;
      let segment: string = rawSegment;

      // Re-add delimiter if not at base character-level split
      if (delimiter !== '' && i < splits.length - 1) {
        segment += delimiter;
      }

      // If segment is larger than chunkSize, recursively split it using next delimiter level
      if (segment.length > chunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        const subChunks = splitRecursive(segment, currentLevel + 1);
        chunks.push(...subChunks);
      } else {
        // Check if adding this segment exceeds chunk size
        if (currentChunk.length + segment.length > chunkSize) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
          }
          // Build new chunk starting with overlap from current chunk if possible
          currentChunk = getOverlapText(currentChunk, chunkOverlap) + segment;
        } else {
          currentChunk += segment;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(Boolean);
  }

  return splitRecursive(text, 0);
}

/**
 * Returns the trailing overlap portion of a text to carry over to the next chunk.
 */
function getOverlapText(text: string, overlapSize: number): string {
  if (text.length <= overlapSize) {
    return text;
  }
  // Try to cut at a word boundary within the overlap window
  const cutIndex = text.length - overlapSize;
  const nextSpace = text.indexOf(' ', cutIndex);
  if (nextSpace !== -1 && nextSpace < text.length) {
    return text.slice(nextSpace + 1);
  }
  return text.slice(cutIndex);
}
