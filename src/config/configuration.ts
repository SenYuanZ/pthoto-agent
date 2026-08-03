export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  longcat: {
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.LONGCAT_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.LONGCAT_MODEL || 'deepseek-v4-flash',
    embeddingModel: process.env.LONGCAT_EMBEDDING_MODEL || 'text-embedding-3-small',
  },
  rag: {
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '800', 10),
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '100', 10),
    topK: parseInt(process.env.RAG_TOP_K || '4', 10),
    temperature: parseFloat(process.env.RAG_TEMPERATURE || '0.3'),
  },
});
