import { chunkText } from './chunker';
import { getEmbedding } from './gemini';

/**
 * Rebuilds the chunk-level embeddings for a specific entry.
 * 1. Computes the combined text (title, type, content, and attachment contents).
 * 2. Splits the combined text into chunks using recursive splitting.
 * 3. Generates vector embeddings for each chunk via Gemini API.
 * 4. Deletes any pre-existing chunks for the entry.
 * 5. Saves the new chunks and their embeddings into `entry_chunks`.
 */
export async function rebuildEntryChunks(
  supabaseClient: any,
  entryId: string,
  userId: string,
  title: string,
  type: string,
  content: string | null,
  attachmentsText: string
): Promise<void> {
  // 1. Construct text to chunk
  let textToChunk = `Title: ${title}\nType: ${type}\nContent: ${content || ''}`;
  if (attachmentsText) {
    textToChunk += `\n\nAttachments Content:\n${attachmentsText}`;
  }

  // 2. Generate chunks
  const chunks = chunkText(textToChunk, { chunkSize: 1000, chunkOverlap: 200 });

  console.log(`Rebuilding chunks for Entry ${entryId}: generated ${chunks.length} chunks.`);

  // 3. Generate embeddings for each chunk
  const chunkEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await getEmbedding(chunks[i]);
      chunkEmbeddings.push(embedding);
      // Brief delay to prevent rate limits on large uploads
      if (chunks.length > 5 && i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (err: any) {
      console.error(`Failed to generate embedding for chunk ${i} of entry ${entryId}:`, err.message || err);
      // In case of error, generate a fallback zero-vector so indexing doesn't crash completely
      chunkEmbeddings.push(new Array(768).fill(0));
    }
  }

  // 4. Delete existing chunks for this entry
  const { error: deleteError } = await supabaseClient
    .from('entry_chunks')
    .delete()
    .eq('entry_id', entryId);

  if (deleteError) {
    console.error(`Warning: failed to clear old chunks for entry ${entryId}:`, deleteError.message);
  }

  // 5. Insert new chunks
  if (chunks.length > 0) {
    const rows = chunks.map((chunk, index) => ({
      entry_id: entryId,
      user_id: userId,
      chunk_index: index,
      content: chunk,
      embedding: chunkEmbeddings[index]
    }));

    const { error: insertError } = await supabaseClient
      .from('entry_chunks')
      .insert(rows);

    if (insertError) {
      throw new Error(`Failed to insert entry chunks: ${insertError.message}`);
    }
    console.log(`Successfully saved ${chunks.length} chunks for entry ${entryId}.`);
  }
}
