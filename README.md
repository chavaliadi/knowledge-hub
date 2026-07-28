# 🧠 KnowledgeHub

KnowledgeHub is a premium, developer-focused, AI-powered personal knowledge base and bookmark manager. It is designed to act as a secondary brain for engineers, helping to organize notes, code snippets, bookmarks, project ideas, and raw files (like PDFs and images). It features concept-based semantic search, automated AI summary and tag generation, and a real-time conversational RAG (Retrieval-Augmented Generation) chat assistant.

---

## 🚀 Key Features

* **Multi-type Categorization**: Separate your entries into `notes`, `bookmarks`, `snippets`, `ideas`, and `resources` for customized styling and metadata.
* **Intelligent File Attachments**:
  * **Image OCR / Diagram Transcription**: Google's Gemini-2.5-Flash API performs OCR on screenshots or diagrams (like database schemas or system architecture charts) and appends the description directly to the search vector.
  * **Local PDF Text Extraction**: Reads contents of uploaded PDFs locally via `pdf-parse` to maintain privacy and offline indexability.
  * **Interactive Document Views**: Built-in full-screen image lightboxes and embedded inline frame PDF reader pages.
* **Chunk-Level Indexing (V3)**: Documents and attachment OCR texts are split into overlapping semantic chunks (1000 characters, 200 overlap) recursively rather than embedding whole files. This prevents vector dilution and guarantees precise retrieval focus.
* **Hybrid Search & Reciprocal Rank Fusion (V3)**: Search queries retrieve matches from both pgvector chunk cosine similarity and PostgreSQL full-text keyword searches, merging their rankings using a **Reciprocal Rank Fusion (RRF)** ranking formula ($k=60$).
* **Cross-Encoder Neural Reranking (V3)**: The SSE RAG chat pipeline retrieves a broad pool of candidates, reranks them locally using a CPU-friendly, fast ONNX model (`Xenova/bge-reranker-base`), and selects the top 5 highest-relevance passages.
* **Interactive Knowledge Concept Graph (V3)**: Ingested documents are analyzed via Gemini to extract relationships (`depends_on`, `implements`, `relates_to`, `alternative_to`) to other entries. Rendered as a zero-dependency, physics-simulated, drag-and-zoom SVG interactive concept network on the frontend.
* **SSE Conversational RAG Chat & Fallover**: Chat with your files! Retrieves relevant documents, reranks matches, feeds clean system prompts to Gemini-2.5-Flash, and streams Markdown-compatible answers using Server-Sent Events (SSE). If Gemini fails or hits rate limits, it transparently triggers a failover stream via Groq.
* **Resilient Multi-Provider LLM Layer**: Text generation tasks automatically fall back from Gemini-2.5-Flash to Groq (`openai/gpt-oss-120b`) on transient rate limits (429) or server errors (5xx). Client/config errors (400/403) are thrown directly. Spatial vector calculations remain locked to `gemini-embedding-001` to prevent database index poisoning.
* **Browser Clipper Extension with Tag & Collection support**: Save active tab titles, URLs, selected page text, or custom notes in one click. Discovers active local client JSON Web Tokens (JWT) for instant single sign-on (SSO), loads tags/collections dynamically from the backend, and saves folders and labels at capturing time.
* **Related Entry Discovery (V2)**: Automatically finds and displays similar entries in the detail pane based on vector cosine similarity (using a tuned threshold of `0.75`).
* **Submit-Time Duplicate Warning (V2)**: Runs a synchronous duplicate check during form submission using the specific card type (note, bookmark, snippet) and presents a modal warning if content matches existing saves above `0.92` similarity.
* **AI Intelligence Dashboard (V2)**: Auto-classifies saves into 6 domains, calculates a weighted overall "Knowledge Health Score" (balancing domain coverage, entry character lengths, tag density, and update recency), and displays Gemini-generated next-step study suggestions with expandable rationale lists.
* **Inline AI Explainer (V2)**: Pre-populates and fires the RAG chat assistant with context-specific prompts directly from the active entry detail panel.
* **Metadata Markdown Export (V2)**: Instantly compiles entry details, collections, tags list, summaries, and file indexes to Markdown (`.md`) format downloads.

---

## 💡 Technology Stack Rationale

Why is KnowledgeHub built with this specific stack?

1. **Bun Runtime**: Bun replaces Node.js to offer significantly faster startup times, native TypeScript compilation out of the box, and a highly optimized package manager. This guarantees rapid API responses and ultra-fast hot reloading.
2. **Supabase & PostgreSQL**: Provides a enterprise-grade relational database coupled with Row-Level Security (RLS) policies. Using Supabase's native Go/JS client handles authentication flows and bucket storage securely, removing the need for a separate IAM service.
3. **pgvector extension**: Enables high-dimensional vector search natively inside PostgreSQL. We calculate similarity scores using standard SQL queries, avoiding the maintenance overhead, latency, and synchronization issues of external vector databases.
4. **Google Gemini-2.5-Flash & Groq GPT-OSS Failover**: Primary generation runs on Gemini 2.5 Flash for high context capability and markdown structure. If Gemini errors out or hits limits, text tasks transparently failover to Groq (`openai/gpt-oss-120b`) to maximize backend availability.
5. **React, Tailwind CSS & Glassmorphism styling**: Tailored for developer ergonomics. Features custom animations, smooth transitions, card elevation, and glowing dark-mode indicators representing search similarity.

---

## 🏛️ System Architecture

KnowledgeHub is built as a highly decoupled Monorepo, bridging React, Express, Supabase, and Google Gemini.

```mermaid
graph TD
    subgraph Client ["Client (React + Vite + Tailwind CSS)"]
        UI[User Interface Components]
        API_C[API Client Service]
        Auth_C[Supabase Auth Client]
    end

    subgraph ChromeExtension ["Chrome Extension Clipper"]
        ClipUI[Popup Interface]
        AuthHandshake[Local Token Discovery]
    end

    subgraph Server ["Server (Express API on Bun)"]
        Routes[API Router Layer]
        Auth_M[JWT Verification Middleware]
        DocParse[PDF / OCR Extraction Engine]
        GeminiService[Gemini API Adapter]
        Chunker[Recursive Text Chunker]
        RerankService[BGE Cross-Encoder Reranker]
    end

    subgraph DB ["Database & Storage (Supabase)"]
        Postgres[(PostgreSQL DB + pgvector + entry_chunks + concept_links)]
        RLS[Row Level Security Engine]
        StorageBucket[(Supabase Storage Bucket)]
    end

    %% Client Interactions
    UI --> API_C
    UI --> Auth_C
    API_C -->|Bearer JWT Header| Routes
    Auth_C -->|Sign In / Verify| DB
    
    %% Clipper Extension Interactions
    ClipUI -->|Dispatches Save Payload| Routes
    AuthHandshake -->|Reads LocalStorage Session| UI
    
    %% Server Interactions
    Routes --> Auth_M
    Auth_M -->|Verifies Token| Postgres
    Routes --> DocParse
    Routes --> Chunker
    Routes --> GeminiService
    Routes --> RerankService
    DocParse -->|Download Buffer| StorageBucket
    GeminiService -->|Generate Embeddings / Streaming Chat| GoogleGeminiAPI[Google Gemini Developer Platform]
    RerankService -->|Load ONNX model CPU| ONNX[Local ONNX CPU Runtime]
    
    %% Database/Storage Interactions
    Routes -->|Read / Write SQL| RLS
    RLS --> Postgres
    UI -->|Direct Upload / Download Links| StorageBucket
```

---

## 🔄 Core Workflows

### 1. Save Entry, OCR Extraction, Chunking & Vectorization
This diagram illustrates the lifecycle of creating a new entry with file attachments, extracting text, dividing it into recursive chunks, generating chunk-level vector embeddings, and computing semantic links to other notes.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Developer
    participant Client as Frontend Client
    participant Server as Express Server
    participant Storage as Supabase Storage
    participant Gemini as Gemini API Service
    participant DB as Supabase PostgreSQL

    User->>Client: Selects Files & Submits Form
    activate Client
    Client->>Storage: Upload Raw File Binaries
    Storage-->>Client: Return Storage Path Key
    Client->>Server: POST /entries (Title, Content, Type, File Paths)
    activate Server

    Note over Server: Identify File Type
    alt File is PDF
        Server->>Storage: Download PDF Buffer
        Storage-->>Server: Return Binary Buffer
        Server->>Server: Local PDF text extraction (pdf-parse)
    else File is Image
        Server->>Storage: Download Image Buffer
        Storage-->>Server: Return Binary Buffer
        Server->>Gemini: OCR & Diagram Transcription Request (Gemini-2.5-Flash)
        Gemini-->>Server: Return Transcribed Text / Schema Flows
    end

    Server->>Gemini: Request Title/Content Summary & Auto-Tags
    Gemini-->>Server: Return JSON (summary, tags)
    
    Server->>Gemini: Generate Embedding Vector for Entry
    Gemini-->>Server: Return 768-Dimension Float Array
    
    Server->>DB: Insert Entry Row (entries, attachments, entry_tags)
    DB-->>Server: Confirm SQL Insert Status (Returns entry_id)

    Server->>Server: Split text into overlapping segments (1000 chars, 200 overlap)
    loop For each chunk
        Server->>Gemini: Generate Chunk Embedding Vector
        Gemini-->>Server: Return 768-Dimension Float Array
        Server->>DB: Insert chunk into entry_chunks table
    end

    Server->>DB: Query other entries titles for this user
    DB-->>Server: Return list of entry IDs and titles
    Server->>Gemini: Determine relationship linkages to existing entries
    Gemini-->>Server: Return JSON array of links (targetId, type)
    Server->>DB: Save concept links in concept_links table

    Server-->>Client: Return Saved Entry JSON (201 Created)
    deactivate Server
    Client-->>User: Render Card on UI Dashboard
    deactivate Client
```

### 2. Conversational RAG Chat, Hybrid Pool, & Cross-Encoder Rerank
The chat panel retrieves candidate chunks, builds a hybrid pool with keyword search, ranks them using the local ONNX Cross-Encoder, and streams citation-anchored answers.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Developer
    participant Panel as Chat Panel Component
    participant Server as Express Server
    participant DB as Supabase PostgreSQL
    participant Rerank as BGE Cross-Encoder
    participant Gemini as Gemini API Service

    User->>Panel: Submits Chat Prompt
    activate Panel
    Panel->>Server: POST /chat { message }
    activate Server
    
    Server->>Gemini: Generate Embeddings for Query
    Gemini-->>Server: Return 768-d Query Vector
    
    Server->>DB: Call match_chunks RPC (Query Vector, Threshold, Limit=30)
    DB-->>Server: Return Top 30 Vector Chunks
    
    Server->>DB: Query entry_chunks using ILIKE (Keyword matches)
    DB-->>Server: Return Top 15 Keyword Chunks
    
    Server->>Server: Merge and deduplicate pool of chunks
    
    Server->>Rerank: Compute relevance scores for pool chunks
    activate Rerank
    Note over Rerank: Local CPU ONNX inference (Xenova/bge-reranker-base)
    Rerank-->>Server: Return Float Scores corresponding to chunks
    deactivate Rerank

    Server->>Server: Sort chunks by score & select Top 5
    Server->>DB: Fetch parent entries details for Top 5 chunks
    DB-->>Server: Return Entry details (ID, Title, Type, URL)
    
    Server->>Panel: Write Event: citations [Unique parent entries]
    Panel-->>User: Renders Citation Badge Placeholders
    
    Server->>Gemini: streamGenerateContent (Sys Prompt + Query + Top 5 Chunks Context)
    activate Gemini
    loop Streaming Output
        Gemini-->>Server: Text Chunk Output
        Server->>Panel: Write SSE Event: chunk text ("...")
        Panel-->>User: Progressively render streaming answer response
    end
    deactivate Gemini
    
    Server->>Panel: Write Event: done (true)
    deactivate Server
    deactivate Panel
```

### 3. AI Intelligence Dashboard & Health Score Computation
The intelligence dashboard compiles analytics, checks for cached reports, computes custom metadata scores, and requests Gemini to outline learning opportunities.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Developer
    participant Client as Frontend Dashboard
    participant Server as Express Server
    participant DB as Supabase PostgreSQL
    participant Gemini as Gemini API Service

    User->>Client: Navigates to Intelligence tab
    activate Client
    Client->>Server: GET /intelligence
    activate Server
    
    Server->>DB: Check for cached report (< 24 hrs old)
    alt Cache exists & is fresh
        DB-->>Server: Return cached knowledge report row
        Server-->>Client: Return report JSON (200 OK)
    else Cache missing or stale
        Server->>DB: Fetch user entries (id, content, domains, tags, attachments)
        DB-->>Server: Return raw items list
        
        Note over Server: Calculate Health Score components:<br/>- Domain Spread (30%)<br/>- Content Depth (25%)<br/>- Tag Density (20%)<br/>- Recency (25%)
        
        Server->>Gemini: Request insight analysis & domain-specific suggestions
        Gemini-->>Server: Return JSON (insight text, structured missing topics array)
        
        Server->>DB: INSERT into knowledge_reports (score, domain scores, suggestions, insights)
        DB-->>Server: Confirm SQL Insert
        Server-->>Client: Return newly generated report JSON (200 OK)
    end
    deactivate Server
    Client-->>User: Render interactive metrics, radar chart & recommendation cards
    deactivate Client
```

### 4. Interactive Knowledge Graph Fetching & Layout
The interactive network graph plots saved topics as nodes and extracted relationship linkages as directed edges in a real-time Verlet physics canvas.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Developer
    participant Graph as Interactive Graph Component
    participant Server as Express Server
    participant DB as Supabase PostgreSQL

    User->>Graph: Navigates to Knowledge Graph tab
    activate Graph
    Graph->>Server: GET /graph
    activate Server
    Server->>DB: Fetch user entries (nodes)
    DB-->>Server: Return ID, Title, Type
    Server->>DB: Fetch concept links (edges)
    DB-->>Server: Return source_id, target_id, type
    Server-->>Graph: Return JSON payload { nodes, links }
    deactivate Server
    
    Note over Graph: Run SVG Verlet Integration physics simulation loop<br/>- Repulsive node forces<br/>- Attractive link forces<br/>- Friction and boundary limits
    Graph-->>User: Renders glowing nodes, curved edges, and interactive panning/dragging
    deactivate Graph
```

---

## 🗄️ Database Schema Reference

KnowledgeHub implements a relational PostgreSQL schema in Supabase with pgvector and Row-Level Security.

```
                    +-------------------+
                    |    collections    |
                    +-------------------+
                    | PK  id (uuid)     |
                    | FK  user_id (uuid)|<---------+
                    |     name (text)   |          |
                    +-------------------+          |
                              | 1                  |
                              |                    |
                              | 0..N               |
+---------------+  |   +-------------------+      |   +-------------------+
|  attachments  |  |   |      entries      |      |   |       tags        |
+---------------+  |   +-------------------+      |   +-------------------+
| PK id (uuid)  |  |   | PK  id (uuid)     |      |   | PK  id (uuid)     |
| FK user_id    |--+   | FK  user_id (uuid)|      +---| FK  user_id (uuid)|
| FK entry_id   |-----+| FK  col_id (uuid) |          |     name (text)   |
|    file_path  |    1 |     title (text)  |          +-------------------+
|    file_name  |      |     content (text)|                    | 1
|    file_size  |      |     type (text)   |                    |
|    mime_type  |      |     is_fav (bool) |                    |
+---------------+      |     pinned (bool) |                    |
                       |     embedding (v) |                    |
                       |     summary (text)|                    |
                       |     ai_tags (text)|                    |
                       |     domains (txt[])|                   |
                       +-------------------+                    |
                                 | 1                            |
                                 |                              |
                                 | 0..N                         | 0..N
                       +-------------------+                    |
                       |    entry_tags     |                    |
                       +-------------------+                    |
                       | PK,FK entry_id    |                    |
                       | PK,FK tag_id      |<-------------------+
                       +-------------------+

+--------------------------------------+
|          knowledge_reports           |
+--------------------------------------+
| PK  id (uuid)                        |
| FK  user_id (uuid)                   |
|     generated_at (timestamptz)       |
|     overall_score (integer)          |
|     domain_scores (jsonb)            |
|     missing_topics (jsonb)           |
|     insights (text)                  |
+--------------------------------------+

+--------------------------------------+
|             entry_chunks             |
+--------------------------------------+
| PK  id (uuid)                        |
| FK  entry_id (uuid)                  |
|     chunk_index (integer)            |
|     content (text)                   |
|     embedding (vector)               |
+--------------------------------------+

+--------------------------------------+
|            concept_links             |
+--------------------------------------+
| PK  id (uuid)                        |
| FK  source_id (uuid)                 |
| FK  target_id (uuid)                 |
|     relationship_type (text)         |
+--------------------------------------+
```

### Table Definitions

1. **`entries`**: Core resource cards. Contains content details, favorites flags, vector weights, summaries, and pinning configurations. Also holds a `domains text[]` array denoting classified focus areas (e.g. `Backend`, `AI/ML`).
2. **`tags`**: Unique keywords matching user accounts to categorise resources.
3. **`entry_tags`**: Many-to-many lookup table linking tags and entries. Contains cascading deletes.
4. **`collections`**: Parent grouping directories. Deleting a collection clears the references in `entries` without deleting the cards.
5. **`attachments`**: Meta indexes for files. References physical items stored inside the Supabase storage system.
6. **`knowledge_reports`**: Caches calculated stats and AI analysis insight summaries per developer account to speed up dashboard re-renders and save Gemini API token usage.
7. **`entry_chunks`**: Stores recursive text chunks of documents and attachments along with 768-dimensional chunk embeddings. Connected to `entries` via cascade delete.
8. **`concept_links`**: Stores directed conceptual relationship edges between entries, automatically extracted via Gemini (`depends_on`, `implements`, `relates_to`, `alternative_to`).

### RLS Policies
All tables enforce explicit Row-Level Security policies to protect private workspace accounts:
* **Entries**: `auth.uid() = user_id`
* **Tags**: `auth.uid() = user_id`
* **Collections**: `auth.uid() = user_id`
* **Attachments**: `auth.uid() = user_id`
* **Knowledge Reports**: `auth.uid() = user_id`
* **Entry Chunks**: `auth.uid() = user_id`
* **Concept Links**: `auth.uid() = user_id`
* **Entry Tags Join**: Evaluated by looking up if the associated entry has `public.entries.user_id = auth.uid()`.

---

## 📡 API Endpoints Directory

All routes below require authentication headers: `Authorization: Bearer <Supabase_JWT_Token>`.

### Entries (`/entries`)
* `GET /entries`: Retrieve cards. Filters: `?type=note&tag=postgres&collectionId=uuid`.
* `GET /entries/:id`: Retrieve details on a single item, including nested `attachments` metadata array.
* `POST /entries`: Creates entry. Receives upload records and computes summary, tags, and embeddings vector fields.
* `PUT /entries/:id`: Update fields. Triggers vector recalculations if content or title has changed.
* `DELETE /entries/:id`: Deletes entry. Cascade deletes entry tags and attachments.
* `GET /entries/:id/related` **(V2)**: Returns up to 5 similar cards (with `similarity` weights) matching the active document's embedding vector (tuned threshold >= `0.75`).
* `POST /entries/check-duplicate` **(V2)**: Checks if a post under consideration is near-identical to an existing card using a strict match threshold >= `0.92`. Returns duplicate details if a match is found.

### Tags (`/tags`)
* `GET /tags`: Returns all tag groups registered by the active user.
* `POST /tags`: Register a new text tag. `Body: { name: "react" }`.
* `DELETE /tags/:id`: Deletes tag.

### Collections (`/collections`)
* `GET /collections`: List collections.
* `POST /collections`: Create a folder namespace. `Body: { name: "System Design" }`.
* `DELETE /collections/:id`: Remove folder. Nullifies related entry links.

### Search Engine (`/search`)
* `GET /search?q=query_text`: 
  * Keyword Search Mode (Default): Runs a regex ILIKE text check.
  * AI Search Mode (`&ai=true`): Runs **Hybrid Search** with **RRF**. Vectorizes the query, retrieves candidate chunks from `entry_chunks` and keyword matches from `entries`, merges them using Reciprocal Rank Fusion, and returns sorted entries.

### RAG Assistant (`/chat`)
* `POST /chat`: RAG Conversational assistant endpoint. Expects `Body: { message: "query" }` and returns a stream of events:
  - `event: message \n data: { citations: [...] }`
  - `event: message \n data: { text: "chunk" }` (repeated)
  - `event: message \n data: { done: true }`

### Intelligence Dashboard (`/intelligence`) **(V2)**
* `GET /intelligence`: Fetches the current intelligence report. By default, it returns a cached report if it is less than 24 hours old.
  * Query Parameter `?refresh=true` bypasses the cache to recalculate metrics and query Gemini fresh.

### Knowledge Graph (`/graph`) **(V3)**
* `GET /graph`: Fetches the complete conceptual relationship edges (`concept_links`) and nodes (`entries`) registered by the authenticated user to render the network.

---

## 📈 Score Calculation Mechanics (V2)

The **Knowledge Health Score** is calculated out of 100 based on four primary metrics to motivate consistent, deep developer study habits:

| Metric | Weight | Formula / Rules |
| :--- | :--- | :--- |
| **Domain Spread** | 30% | `(Active Domains / 6) * 100`. Assesses category coverage across the 6 standard developer domains (Backend, Frontend, AI/ML, System Design, Databases, DevOps/Cloud). |
| **Content Depth** | 25% | `Min((Average Character Length / 1000) * 100, 100)`. Rewards detailed writeups and files, reaching maximum marks at an average of 1,000+ characters per entry. |
| **Tag Density** | 20% | `Min((Average Tags per Entry / 3) * 100, 100)`. Encourages classification hygiene; maximum marks are awarded when entries average 3 or more tags. |
| **Study Recency** | 25% | `Min((Updates in last 30 Days / 10) * 100, 100)`. Tracks engagement consistency. Requires 10 or more saves/edits in the past month for full marks. |

---

## 📂 Project Directory Structure

```
├── packages
│   ├── client                             # React 18 + Vite + TypeScript Client
│   │   ├── src
│   │   │   ├── components
│   │   │   │   ├── ChatPanel.tsx          # RAG Chat Stream Assistant Panel
│   │   │   │   ├── EntryCard.tsx          # Card display, similarity indicators, favorites
│   │   │   │   ├── EntryDetail.tsx        # Detail Panel, PDF Preview frame, Lightbox zoom, related saves
│   │   │   │   ├── EntryForm.tsx          # Create/Edit Entry form, File Dropzone, duplicate warning modal
│   │   │   │   ├── SearchBar.tsx          # Sparkles AI search toggle input box
│   │   │   │   ├── Sidebar.tsx            # Folders, Tags, and Favorites navigation
│   │   │   │   ├── TagBadge.tsx           # Tag rendering
│   │   │   │   └── TypeFilter.tsx         # Filters: Note, Bookmark, Snippet, Idea, Resource
│   │   │   ├── lib
│   │   │   │   ├── api.ts                 # Main REST communication wrapper
│   │   │   │   ├── supabase.ts            # Client Supabase configuration
│   │   │   │   └── types.ts               # TS Interfaces
│   │   │   └── pages
│   │   │       ├── Auth.tsx               # Login & Registration Page
│   │   │       ├── Dashboard.tsx          # Main Application Dashboard
│   │   │       ├── IntelligenceDashboard.tsx # V2 Analytics view: radar scores, suggestions list
│   │   │       └── GraphView.tsx          # V3 Interactive force-directed knowledge graph page
│   │   └── index.html
│   ├── server                             # Express Server + TypeScript
│   │   ├── index.ts                       # Server bootstrapping and routing entries
│   │   └── src
│   │       ├── lib
│   │       │   ├── attachments.ts         # OCR transcription and PDF extract helpers
│   │       │   ├── gemini.ts              # Gemini API embeddings / summary / domains / insights
│   │       │   ├── chunker.ts             # V3 Recursive character text splitter utility
│   │       │   ├── chunks.ts              # V3 Chunk embeddings rebuilding database helper
│   │       │   ├── graph.ts               # V3 Concept edge linkages rebuilding database helper
│   │       │   ├── reranker.ts            # V3 Local CPU Cross-Encoder relevance score pipeline
│   │       │   ├── llm.ts                 # Unified multi-provider LLM failover engine (V2)
│   │       │   └── supabase.ts            # Supabase Admin client
│   │       ├── middleware
│   │       │   └── auth.ts                # Token checking and User extraction
│   │       ├── routes
│   │       │   ├── chat.ts                # SSE Streaming Chat assistant
│   │       │   ├── collections.ts         # Folder management routes
│   │       │   ├── entries.ts             # Card CRUD routes (including duplicate/related checks)
│   │       │   ├── intelligence.ts        # Health metric routes & Gemini advice cache
│   │       │   ├── search.ts              # Semantic or string query routes
│   │       │   ├── graph.ts               # V3 Graph edges / nodes server endpoints
│   │       │   └── tags.ts                # Tag routing
│   │       └── scripts
│   │           ├── reindex.ts             # Batched metadata generator recovery script
│   │           ├── test-duplicate-check.ts # Duplicate warning math regression check (V2)
│   │           ├── test-failover.ts       # Rate limit (429) simulated interception test (V2)
│   │           ├── test-reindex-e2e.ts    # Positive reindexing path E2E database verification (V2)
│   │           ├── test-phase1-e2e.ts     # V3 Chunks & Hybrid search verification script
│   │           ├── test-phase2-e2e.ts     # V3 Local Cross-Encoder verification script
│   │           └── test-phase3-e2e.ts     # V3 Concept Graph edges verification script
│   └── clipper-extension                  # Chrome Browser Extension Clipper
│       ├── manifest.json                  # Manifest configuration (Manifest V3)
│       ├── popup.html                     # Extension clipper window layout
│       └── popup.js                       # Active page text parsing and local token SSO
├── package.json                           # Monorepo configuration scripts
└── README.md                              # Global developer documentation
```

---

## ⚙️ Installation & Setup

### 1. Prerequisites
Ensure you have the [Bun JavaScript Runtime](https://bun.sh/) installed:
```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Configure Supabase Environment
Set up a PostgreSQL database in Supabase and run the migration scripts in the SQL editor in sequential order:
1. Run [schema.sql](packages/server/schema.sql) (Core schema).
2. Run [schema_v2.sql](packages/server/schema_v2.sql) (Pinning & Collections).
3. Run [schema_v3.sql](packages/server/schema_v3.sql) (Attachments metadata).
4. Run [schema_v4.sql](packages/server/schema_v4.sql) (pgvector functions).
5. Run [schema_v5.sql](packages/server/schema_v5.sql) (Summary & AI Auto-tag tables).
6. Run [schema_v6.sql](packages/server/schema_v6.sql) (Domains classifications & Cached analytics report table).
7. Run [schema_v7.sql](packages/server/schema_v7.sql) (Chunk-level indexing & match_chunks function).
8. Run [schema_v8.sql](packages/server/schema_v8.sql) (Semantic concept linkages/edges).

**Automated Migration (Alternative):** If you have `psql` installed and a direct database connection string, you can apply all migrations at once:
```bash
# Set the direct connection string in .env:
# SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
./scripts/migrate.sh
```

**Verify Migrations:** After applying migrations (manually or via script), confirm all tables and functions exist:
```bash
bun run --cwd packages/server verify:migrations
```

*Note: Create a storage bucket inside your Supabase Storage dashboard named `Knowledge-Hub`.*

### 3. Clone Repository & Install Dependencies
Run the installation command in the project root:
```bash
bun install
```

### 4. Configure Environmental Keys
Create a `.env` file in the **root directory**:
```env
# Backend Keys
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key  # Required for admin/reindexer scripts to bypass RLS. Throws loudly if missing.
PORT=3000
GEMINI_API_KEY=your-google-gemini-developer-api-key
GROQ_API_KEY=your-groq-api-key                            # Fallback provider key

# Frontend Client Keys
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-public-anon-key
```

---

## 🏃 Running the Project

### Development Server
Start the client and server concurrently from the root directory:
```bash
bun run dev
```
* **Client App**: served on `http://localhost:5173`
* **API Server**: runs on `http://localhost:3000`

### Run Reindexing Script
To backfill and generate missing AI summaries, auto-tags, vector embeddings, or domain classifications for pre-existing database entries:
```bash
bun run --cwd packages/server reindex
```

### Running Test Verification Scripts
A suite of validation scripts is available to test core features and regressions:

* **Duplicate Check Test**: Validates vector distance scoring logic and thresholds for entries and code snippets.
  ```bash
  bun run --cwd packages/server test:duplicate
  ```
* **LLM Failover Test**: Simulates Gemini rate limits (intercepting network calls with HTTP 429) to verify transparent fallback to Groq completions and ensures client config errors (400/403) are thrown rather than swallowed.
  ```bash
  bun run --cwd packages/server test:failover
  ```
* **Reindexer E2E Verification**: Inserts a raw note, triggers reindexing, asserts successful vector and AI metadata updates, and cleans up.
  ```bash
  bun run --cwd packages/server test:reindex
  ```
* **Phase 1 Chunks & Hybrid Search Test (V3)**: Verifies recursive document chunking limits, `entry_chunks` table schemas, and vector similarity querying.
  ```bash
  bun run --cwd packages/server src/scripts/test-phase1-e2e.ts
  ```
* **Phase 2 Cross-Encoder Reranker Test (V3)**: Verifies local CPU ONNX runtime execution of the sequence classifier (`bge-reranker-base`) on test documents and sorting logic.
  ```bash
  bun run --cwd packages/server src/scripts/test-phase2-e2e.ts
  ```
* **Phase 3 Concept Graph Connection Test (V3)**: Verifies directed relationship edge extraction via Gemini and insertion into the database.
  ```bash
  bun run --cwd packages/server src/scripts/test-phase3-e2e.ts
  ```

### Deploying the Chrome Extension
1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** (top-left).
4. Select the folder `/packages/clipper-extension`.
5. Open your local frontend client (`http://localhost:5173`) and sign in; the extension will automatically connect to your session token for Single Sign-On (SSO) and fetch tags/collections.
