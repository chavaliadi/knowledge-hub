import { Entry, Tag } from './types';

export const MOCK_TAGS: Tag[] = [
  { id: 'tag_1', name: 'redis' },
  { id: 'tag_2', name: 'bullmq' },
  { id: 'tag_3', name: 'backend' },
  { id: 'tag_4', name: 'system-design' },
  { id: 'tag_5', name: 'ai' },
  { id: 'tag_6', name: 'dsa' },
  { id: 'tag_7', name: 'typescript' },
  { id: 'tag_8', name: 'database' }
];

export const INITIAL_MOCK_ENTRIES: Entry[] = [
  {
    id: 'entry_1',
    user_id: 'user_default',
    title: 'Redis Queue Architecture',
    content: 'Redis can be used as a cache, queue, session store... Specifically, we can use Redis Lists (LPUSH/RPOPLPUSH) or Streams (XADD/XREAD) for message delivery. Redis Lists are simple but lack acknowledgment mechanisms. Streams support consumer groups and message safety.',
    type: 'note',
    url: null,
    is_favorite: true,
    tags: [MOCK_TAGS[0]!, MOCK_TAGS[2]!, MOCK_TAGS[3]!], // redis, backend, system-design
    created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(), // 3 days ago
    updated_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString()
  },
  {
    id: 'entry_2',
    user_id: 'user_default',
    title: 'BullMQ Crash Course',
    content: 'An excellent YouTube course detailing how BullMQ handles jobs, workers, queues, parent-child job dependencies, and repeatable jobs on top of a Redis instance.',
    type: 'bookmark',
    url: 'https://youtube.com/bullmq-tutorial',
    is_favorite: false,
    tags: [MOCK_TAGS[1]!, MOCK_TAGS[0]!, MOCK_TAGS[2]!], // bullmq, redis, backend
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(), // 2 days ago
    updated_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString()
  },
  {
    id: 'entry_3',
    user_id: 'user_default',
    title: 'BullMQ Queue Init',
    content: `import { Queue } from 'bullmq';\nimport IORedis from 'ioredis';\n\nconst connection = new IORedis({ maxRetriesPerRequest: null });\nconst queue = new Queue('jobs', { connection });\n\nconsole.log('Queue initialized: ' + queue.name);`,
    type: 'snippet',
    url: null,
    is_favorite: true,
    tags: [MOCK_TAGS[1]!, MOCK_TAGS[2]!, MOCK_TAGS[6]!], // bullmq, backend, typescript
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(), // 12 hours ago
    updated_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'entry_4',
    user_id: 'user_default',
    title: 'Vector DB from Scratch',
    content: 'Build a simple HNSW index in TypeScript. First implement brute-force cosine similarity using dot product and normalization, then write an IVF (Inverted File Index) flat clustering to group similar vectors and run comparisons only inside the matching cluster.',
    type: 'idea',
    url: null,
    is_favorite: true,
    tags: [MOCK_TAGS[4]!, MOCK_TAGS[6]!, MOCK_TAGS[7]!], // ai, typescript, database
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(), // 5 hours ago
    updated_at: new Date(Date.now() - 3600000 * 5).toISOString()
  },
  {
    id: 'entry_5',
    user_id: 'user_default',
    title: 'System Design Roadmap',
    content: 'A comprehensive visual guide detailing system design topics: Load Balancers, Caching, Databases (SQL vs NoSQL), Sharding, Replication, Consistency Models, and System Design Interview mock walk-throughs.',
    type: 'resource',
    url: 'https://roadmap.sh/system-design',
    is_favorite: false,
    tags: [MOCK_TAGS[3]!, MOCK_TAGS[2]!], // system-design, backend
    created_at: new Date(Date.now() - 3600000 * 24 * 7).toISOString(), // 7 days ago
    updated_at: new Date(Date.now() - 3600000 * 24 * 7).toISOString()
  },
  {
    id: 'entry_6',
    user_id: 'user_default',
    title: 'Dynamic Programming: Knapsack Pattern',
    content: 'The 0/1 Knapsack problem is the foundation of multiple DP patterns. You either take an item or leave it. Formula:\ndp[i][w] = max(dp[i-1][w], val[i-1] + dp[i-1][w-wt[i-1]])\nOptimize space complexity from O(N*W) to O(W) using a 1D array traversed backwards.',
    type: 'note',
    url: null,
    is_favorite: false,
    tags: [MOCK_TAGS[5]!], // dsa
    created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(), // 5 days ago
    updated_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString()
  }
];
