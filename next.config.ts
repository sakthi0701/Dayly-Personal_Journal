import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // This allows you to save these in Vercel WITHOUT the NEXT_PUBLIC_ prefix to bypass the security warning.
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  serverExternalPackages: [
    'sqlite3',
    '@langchain/core',
    '@mistralai/mistralai',
    '@qdrant/js-client-rest',
    'cloudflare',
    'neo4j-driver',
    'ollama',
    'redis',
    '@azure/search-documents',
    '@azure/identity',
    '@google/genai',
    '@anthropic-ai/sdk',
  ],
  turbopack: {
    resolveAlias: {
      'better-sqlite3': './lib/empty-module.js',
      'cassandra-driver': './lib/empty-module.js',
      'chromadb': './lib/empty-module.js',
      'cohere-ai': './lib/empty-module.js',
      'fastembed': './lib/empty-module.js',
      'iovalkey': './lib/empty-module.js',
      'mongodb': './lib/empty-module.js',
      'mysql2/promise': './lib/empty-module.js',
      'mysql2': './lib/empty-module.js',
      'oracledb': './lib/empty-module.js',
      'pg': './lib/empty-module.js',
      'weaviate-client': './lib/empty-module.js',
      'zeroentropy': './lib/empty-module.js',
      '@pinecone-database/pinecone': './lib/empty-module.js',
      '@aws-sdk/client-s3vectors': './lib/empty-module.js',
      '@turbopuffer/turbopuffer': './lib/empty-module.js',
      '@upstash/vector': './lib/empty-module.js',
      '@elastic/elasticsearch': './lib/empty-module.js',
      '@opensearch-project/opensearch': './lib/empty-module.js',
      '@google-cloud/aiplatform': './lib/empty-module.js',
      '@huggingface/transformers': './lib/empty-module.js',
      '@aws-sdk/client-bedrock-runtime': './lib/empty-module.js',
      '@aws-sdk/client-neptune-graph': './lib/empty-module.js',
      '@databricks/sql': './lib/empty-module.js',
      '@zilliz/milvus2-sdk-node': './lib/empty-module.js',
      '@mochow/mochow-sdk-node': './lib/empty-module.js',
    },
  },
};

export default nextConfig;
