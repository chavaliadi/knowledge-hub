import { chunkText } from '../lib/chunker';

const sampleText = `
# Markdown Header

This is a paragraph talking about databases. PostgreSQL is a powerful, open-source object-relational database system with more than 35 years of active development that has earned it a strong reputation for reliability, feature robustness, and performance.

It supports vector data types using the pgvector extension. The extension enables storing and searching embeddings within PostgreSQL.

## Section 2: Code Snippets

Here is a block of code demonstrating connection configuration:
\`\`\`ts
import { Client } from 'pg';
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
await client.connect();
\`\`\`

We can check how the recursive chunker divides this content into pieces when target size is small (e.g. 200 characters) and overlap is 50.
`;

console.log('Testing Chunker...');
const chunks = chunkText(sampleText, { chunkSize: 200, chunkOverlap: 50 });

console.log(`Generated ${chunks.length} chunks:`);
chunks.forEach((chunk, i) => {
  console.log(`\n--- CHUNK ${i + 1} (len: ${chunk.length}) ---`);
  console.log(chunk);
});
