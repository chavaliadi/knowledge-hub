import { supabaseAdmin } from '../lib/supabase';
import { getEmbedding, getAISummaryAndTags, classifyEntryDomains } from '../lib/gemini';

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

    if (!entries || entries.length === 0) {
      console.log('No entries missing embeddings, summaries, or domains found. All up to date.');
      return;
    }

    console.log(`Found ${entries.length} entries missing metadata. Processing...`);

    let successCount = 0;
    let failureCount = 0;

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

    console.log('--- Re-indexing & Recovery Completed ---');
    console.log(`Summary: ${successCount} updated successfully, ${failureCount} failed.`);
  } catch (error: any) {
    console.error('Re-indexing process crashed:', error.message || error);
  }
}

// Run the script
reindex();
