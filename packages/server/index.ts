import express from "express";
import type { Request, Response } from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(process.env.OPENAI_API_KEY ?? 'OPENAI_API_KEY not set');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
})

