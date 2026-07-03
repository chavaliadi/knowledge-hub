import { supabaseAdmin } from '../lib/supabase';
import { getEmbedding, getAISummaryAndTags, classifyEntryDomains } from '../lib/gemini';
import { extractTextFromAttachment } from '../lib/attachments';
import { rebuildEntryChunks } from '../lib/chunks';

// Helper function to reconstruct the text format for embedding
const getEntryEmbedText = (title: string, type: string, content: string | null) => {
  return `Title: ${title}\nType: ${type}\nContent: ${content || ''}`;
};

// Helper delay to avoid rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function reindex() {
  console.log('--- Starting Embedding & AI Summary/Domain Re-indexer Script ---');

  try {
    // 1. Fetch entries missing an embedding OR missing a summary OR missing domains
    const { data: entries, error } = await supabaseAdmin
      .from('entries')
      .select('id, title, type, content, embedding, summary, ai_tags, domains')
      .or('embedding.is.null,summary.is.null,domains.is.null');

    if (error) {
      throw new Error(`Failed to fetch entries: ${error.message}`);
    }

    let successCount = 0;
    let failureCount = 0;

    if (!entries || entries.length === 0) {
      console.log('No entries missing embeddings, summaries, or domains found.');
    } else {
      console.log(`Found ${entries.length} entries missing metadata. Processing...`);

    for (const entry of entries) {
      const { id, title, type, content, embedding, summary, domains } = entry;
      console.log(`Processing entry: "${title}" (ID: ${id})`);

      const updateData: any = {};

      try {
        // If embedding is missing, regenerate it
        if (embedding === null) {
          console.log(`- Generating missing vector embedding for ID ${id}`);
          const textToEmbed = getEntryEmbedText(title, type, content);
          updateData.embedding = await getEmbedding(textToEmbed);
        }

        // If AI summary/tags are missing, regenerate them
        if (summary === null) {
          console.log(`- Generating missing AI summary/tags for ID ${id}`);
          const aiResult = await getAISummaryAndTags(title, type, content);
          updateData.summary = aiResult.summary;
          updateData.ai_tags = aiResult.tags;
        }

        // If domains are missing, regenerate them
        if (domains === null) {
          console.log(`- Generating missing domain classification for ID ${id}`);
          updateData.domains = await classifyEntryDomains(title, content, type);
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabaseAdmin
            .from('entries')
            .update(updateData)
            .eq('id', id);

          if (updateError) {
            console.error(`Failed to update entry ${id} in DB:`, updateError.message);
            failureCount++;
          } else {
            console.log(`Successfully indexed metadata for entry ${id}`);
            successCount++;
          }
        }
      } catch (err: any) {
        console.error(`Failed to generate metadata for entry ${id}:`, err.message || err);
        failureCount++;
      }

      // Throttle API requests (Gemini API rate limit safeguard)
      await delay(300);
    }
    }

    console.log('--- Re-indexing & Recovery Completed ---');
    console.log(`Summary: ${successCount} updated successfully, ${failureCount} failed.`);

    // 2. Fetch all entries to verify chunk-level index coverage
    console.log('--- Starting Chunks Verification & Rebuilding ---');
    const { data: allEntries, error: fetchAllError } = await supabaseAdmin
      .from('entries')
      .select('id, user_id, title, type, content');

    if (fetchAllError) {
      throw new Error(`Failed to fetch entries for chunking: ${fetchAllError.message}`);
    }

    const { data: chunkedEntryIdsData, error: chunksError } = await supabaseAdmin
      .from('entry_chunks')
      .select('entry_id');

    if (chunksError) {
      console.error('Failed to fetch existing chunks list:', chunksError.message);
    }

    const chunkedEntryIds = new Set((chunkedEntryIdsData || []).map((c: any) => c.entry_id));
    const entriesToChunk = (allEntries || []).filter(e => !chunkedEntryIds.has(e.id));

    console.log(`Found ${entriesToChunk.length} entries missing chunk-level indices. Rebuilding...`);

    let chunkSuccess = 0;
    let chunkFailure = 0;

    for (const entry of entriesToChunk) {
      console.log(`Building chunks for: "${entry.title}" (ID: ${entry.id})`);
      try {
        // Fetch attachments for this entry
        const { data: attachments } = await supabaseAdmin
          .from('attachments')
          .select('*')
          .eq('entry_id', entry.id);

        let attachmentsText = '';
        if (attachments && attachments.length > 0) {
          const extractedTexts = [];
          for (const att of attachments) {
            const text = await extractTextFromAttachment(supabaseAdmin, att.file_path, att.mime_type, att.file_name);
            if (text) {
              extractedTexts.push(`[File: ${att.file_name}]\n${text}`);
            }
          }
          if (extractedTexts.length > 0) {
            attachmentsText = extractedTexts.join('\n\n');
          }
        }

        await rebuildEntryChunks(
          supabaseAdmin,
          entry.id,
          entry.user_id,
          entry.title,
          entry.type,
          entry.content,
          attachmentsText
        );
        chunkSuccess++;
      } catch (err: any) {
        console.error(`Failed to build chunks for entry ${entry.id}:`, err.message || err);
        chunkFailure++;
      }
      await delay(300);
    }
    console.log(`Chunks status: ${chunkSuccess} updated, ${chunkFailure} failed.`);
  } catch (error: any) {
    console.error('Re-indexing process crashed:', error.message || error);
  }
}

// Run the script
reindex();
