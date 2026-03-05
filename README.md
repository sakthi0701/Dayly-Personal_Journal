
# Dayly - Active Memory Journal

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Ensure `dayly/.env.local` exists with:
    - `GROQ_API_KEY`
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3.  **Database Setup**:
    - Go to your Supabase Dashboard -> SQL Editor.
    - Run the contents of `lib/schema.sql`.
    - This enables `pgvector` and creates the `entries` table.

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features (Phase 1)

-   **Smart Editor**: Write and save entries.
-   **The Gardener**: Automatically generates vector embeddings for every entry using a local model (`all-MiniLM-L6-v2`) via Transformers.js.
-   **Privacy**: Embeddings are generated validly on the server (or user's machine if moved to client), no OpenAI dependency for memory.
