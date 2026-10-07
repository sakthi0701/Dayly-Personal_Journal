
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // This allows you to save these in Vercel WITHOUT the NEXT_PUBLIC_ prefix to bypass the security warning.
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  /* config options here */
  // Removed webpack config to avoid conflict with Next.js 16 Turbopack default
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
    'zeroentropy',
    'weaviate-client',
    'chromadb',
    'mongodb',
    'cassandra-driver',
    '@pinecone-database/pinecone',
    '@aws-sdk/client-s3vectors',
    '@turbopuffer/turbopuffer',
    '@upstash/vector',
    '@elastic/elasticsearch',
    '@opensearch-project/opensearch',
    'cohere-ai',
    'fastembed',
    '@google-cloud/aiplatform',
    '@huggingface/transformers',
    'iovalkey',
    'oracledb',
    'pg',
    'natural',
    '@aws-sdk/client-bedrock-runtime',
    '@aws-sdk/client-neptune-graph',
    '@databricks/sql',
    '@zilliz/milvus2-sdk-node',
    'mysql2',
    '@mochow/mochow-sdk-node'
  ],
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(zeroentropy|weaviate-client|chromadb|mongodb|cassandra-driver|@pinecone-database\/pinecone|@aws-sdk\/client-s3vectors|@turbopuffer\/turbopuffer|@upstash\/vector|@elastic\/elasticsearch|@opensearch-project\/opensearch|cohere-ai|fastembed|@google-cloud\/aiplatform|@huggingface\/transformers|iovalkey|oracledb|pg|natural|@aws-sdk\/client-bedrock-runtime|@aws-sdk\/client-neptune-graph|@databricks\/sql|@zilliz\/milvus2-sdk-node|mysql2|@mochow\/mochow-sdk-node)$/
      })
    );
    return config;
  },
};

export default nextConfig;
