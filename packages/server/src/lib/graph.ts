import { extractSemanticLinks } from './gemini';

/**
 * Rebuilds semantic concept connections (edges) for a given entry.
 * 1. Fetches other entries belonging to the user.
 * 2. Queries Gemini to detect relationships between the target entry and existing ones.
 * 3. Deletes existing links originating from this entry.
 * 4. Inserts new relationships into the database.
 */
export async function rebuildEntrySemanticLinks(
  supabaseClient: any,
  entryId: string,
  userId: string,
  title: string,
  content: string | null
): Promise<void> {
  try {
    // 1. Fetch other entries titles
    const { data: otherEntries, error: fetchError } = await supabaseClient
      .from('entries')
      .select('id, title')
      .eq('user_id', userId)
      .neq('id', entryId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error(`Failed to fetch other entries for graph linking: ${fetchError.message}`);
      return;
    }

    if (!otherEntries || otherEntries.length === 0) {
      return;
    }

    // 2. Query Gemini for links
    const links = await extractSemanticLinks(title, content, otherEntries);
    console.log(`Detected ${links.length} concept links for Entry ${entryId}.`);

    // 3. Clear old links originating from this entry
    const { error: deleteError } = await supabaseClient
      .from('concept_links')
      .delete()
      .eq('source_id', entryId);

    if (deleteError) {
      console.error(`Warning: failed to clear old concept links for entry ${entryId}:`, deleteError.message);
    }

    // 4. Save new links
    if (links.length > 0) {
      const rows = links.map((link) => ({
        source_id: entryId,
        target_id: link.targetId,
        user_id: userId,
        relationship_type: link.type
      }));

      const { error: insertError } = await supabaseClient
        .from('concept_links')
        .insert(rows);

      if (insertError) {
        console.error(`Failed to save concept links: ${insertError.message}`);
      } else {
        console.log(`Successfully indexed ${links.length} concept links for entry ${entryId}.`);
      }
    }
  } catch (err: any) {
    console.error(`Graph builder pipeline failed for entry ${entryId}:`, err.message || err);
  }
}
