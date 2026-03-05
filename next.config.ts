
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    '@anthropic-ai/sdk'
  ],
};

export default nextConfig;
