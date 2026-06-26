# 003. Deterministic Health Score vs AI-Generated Number

## Problem
KnowledgeHub's Intelligence Dashboard provides a "Knowledge Health Score" (0–100) indicating the quality and activity of a developer's secondary brain. We need to decide whether to have Google Gemini evaluate the notes and assign an arbitrary score, or compute a transparent, deterministic score inside the Express application code.

## Options considered

### Option A: Let Gemini Evaluate and Generate the Score
* **Pros**:
  - The model can evaluate depth, language quality, and semantic connections directly.
  - Less code math to maintain in the backend.
* **Cons**:
  - Non-deterministic: the same set of notes might yield a score of `85` one day and `78` the next due to LLM variance.
  - Opaque: no clear explanation for the score value can be presented to the user other than natural language summaries.
  - Higher API costs and slower loading: calculating a score on every refresh requires transmitting all user document metrics into the LLM context, consuming significant tokens.

### Option B: Deterministic Code Formula with AI Qualitative Insights
* **Pros**:
  - Fully explainable and reproducible. Users can see the exact breakdown of their score (e.g. Domain Spread 30% / Content Depth 25% / Tag Density 20% / Recency 25%).
  - Fast and cheap: score computation occurs instantly in database/CPU logic with zero token costs. Gemini is only called to generate the text insights and next study topics.
  - Supports caching and fallback: if Gemini fails, the deterministic score and empty-domain backup suggestions are still returned.
* **Cons**:
  - Static heuristics: the parameters (e.g., expecting 1000+ characters for depth, 3+ tags for density, and 10+ monthly updates for recency) are hardcoded assumptions that may require tuning.

## Decision
We chose **Option B (Deterministic Code Formula)**. 

## Trade-offs
* Hardcoded thresholds represent arbitrary baseline goals that might not map perfectly to every developer's writing style. These coefficients will need to be calibrated and made customizable as more usage statistics are gathered.
