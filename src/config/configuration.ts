export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  longcat: {
    apiKey:
      process.env.AGNES_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.LONGCAT_API_KEY ||
      '',
    baseUrl:
      process.env.AGNES_BASE_URL ||
      process.env.DEEPSEEK_BASE_URL ||
      'https://apihub.agnes-ai.com/v1',
    model: process.env.AGNES_MODEL || process.env.LONGCAT_MODEL || 'agnes-2.5-flash',
    imageModel: process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.1-flash',
    embeddingModel:
      process.env.AGNES_EMBEDDING_MODEL ||
      process.env.LONGCAT_EMBEDDING_MODEL ||
      'text-embedding-3-small',
  },
  rag: {
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '800', 10),
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '100', 10),
    topK: parseInt(process.env.RAG_TOP_K || '4', 10),
    temperature: parseFloat(process.env.RAG_TEMPERATURE || '0.3'),
  },
});
