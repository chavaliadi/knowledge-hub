import express from "express";
import cors from "cors";
import "./src/lib/env";
import { authMiddleware } from "./src/middleware/auth";
import entriesRouter from "./src/routes/entries";
import tagsRouter from "./src/routes/tags";
import searchRouter from "./src/routes/search";
import collectionsRouter from "./src/routes/collections";
import chatRouter from "./src/routes/chat";
import intelligenceRouter from "./src/routes/intelligence";
import graphRouter from "./src/routes/graph";
import { warmupReranker } from "./src/lib/reranker";

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for frontend client
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));

// Body parser
app.use(express.json());

// Public healthcheck route
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'KnowledgeHub API Server' });
});

// Mount protected API routes
app.use('/entries', authMiddleware as any, entriesRouter);
app.use('/tags', authMiddleware as any, tagsRouter);
app.use('/search', authMiddleware as any, searchRouter);
app.use('/collections', authMiddleware as any, collectionsRouter);
app.use('/chat', authMiddleware as any, chatRouter);
app.use('/intelligence', authMiddleware as any, intelligenceRouter);
app.use('/graph', authMiddleware as any, graphRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error occurred' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  // Asynchronously warm up the ONNX Cross-Encoder model in the background
  warmupReranker();
});
