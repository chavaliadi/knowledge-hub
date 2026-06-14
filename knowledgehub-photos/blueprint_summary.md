# KnowledgeHub Development Blueprint & Roadmap Summary

This document summarizes the requirements, features, database schemas, and user interfaces shown across the 15 project screenshots inside the `knowledgehub-photos` directory. It acts as the blueprint for the entire application's lifecycle.

---

## 1. Project Overview & Architecture
* **Application**: KnowledgeHub (a personal knowledge base and developer bookmark manager).
* **Architecture**: Decoupled Monorepo.
  * **Backend**: Node.js + Express (`packages/server` running on port `3000`).
  * **Frontend**: React + Vite + TypeScript + Tailwind CSS (`packages/client` running on port `5173`).
  * **Database, Auth & Storage**: Supabase (auth services, postgres database, file buckets).
* **Design Aesthetic**: Premium glassmorphic dark-slate theme withOutfit/Inter fonts, glowing accents, and smooth hover micro-animations.

---

## 2. Phase 1 & 2: Core & Collections (Implemented)
These stages cover the foundation of the app, which is fully built and verified:

### Database Tables & RLS Policies:
* **`entries` Table**:
  * Fields: `id` (uuid, PK), `user_id` (uuid, FK), `title` (text), `content` (text, optional), `type` (constrained to `note | bookmark | snippet | idea | resource`), `url` (text, optional), `is_favorite` (boolean), `collection_id` (uuid, FK, optional), `is_pinned` (boolean), `created_at` (timestamptz), `updated_at` (timestamptz).
  * RLS policies ensure insert/select/update/delete are restricted strictly to the authenticated creator (`auth.uid() = user_id`).
* **`tags` Table**:
  * Fields: `id` (uuid, PK), `user_id` (uuid, FK), `name` (text, unique per user).
* **`entry_tags` Join Table**:
  * Many-to-many link between entries and tags with cascade deletes.
* **`collections` Table**:
  * Fields: `id` (uuid, PK), `user_id` (uuid, FK), `name` (text, unique per user).
  * Entries can be organized in a single collection. If a collection is deleted, related entries have their `collection_id` set to `null` instead of being cascadingly deleted.

---

## 3. Phase 3: File Uploads & Documents (Planned)
This phase introduces uploading document files (PDFs) and images to knowledge entries.

### Backend & Database Requirements:
* **`attachments` Table**:
  * Fields: `id` (uuid, PK), `user_id` (uuid, FK), `entry_id` (uuid, FK referencing entries with cascade delete), `file_path` (text storage key), `file_name` (text), `file_size` (integer bytes), `mime_type` (text), `created_at` (timestamptz).
  * RLS policies enabled to restrict operations to the owner (`auth.uid() = user_id`).
* **Supabase Storage**:
  * A private storage bucket named `knowledgehub-files` where uploads are organized by user folders (`auth.uid() + '/*'`).
* **API Endpoints**:
  * Express server routes will return nested file metadata under `attachments: Attachment[]` inside entry detail queries.

### Frontend UI & Features:
* **Drag-and-Drop Dropzone**: Added to the entry form with visual upload progress feedback.
* **Image Viewer**: Render thumbnails on cards and support a click-to-zoom interactive lightbox.
* **PDF Viewer**: Embed an inline PDF frame previewer in the detail pane to read document pages without leaving the workspace.

---

## 4. Phase 4: AI Semantic Search (Planned)
This phase upgrades the simple query search (`q` text ILIKE matching) to AI-powered semantic matching.

### Backend & Database Requirements:
* **Vector Extensions**: Enable pgvector (`create extension if not exists vector`).
* **Vector Embeddings Column**: Add an `embedding vector(1536)` column to the `entries` table.
* **Database Index**: Set up an HNSW index on the vector column (`using hnsw (embedding vector_cosine_ops)`) for fast similarity checking.
* **OpenAI Embedding Service**:
  * Integrate OpenAI API to generate embeddings for entries during creation/updates.
  * Form query text input: `Title: {title}\nType: {type}\nContent: {content}`.
* **Similarity Search RPC**: Define a PostgreSQL function `match_entries` to perform cosine similarity calculations on vectors, returning entries sorted by highest match score.

### Frontend UI & Features:
* **AI Search Mode Toggle**: Add a glowing Sparkles icon button inside the SearchBar. Hitting it triggers purple shadow glow transitions.
* **Concept Match Badges**: Display a match confidence score pill (e.g. `94% Match`) on cards when searching in AI Mode.