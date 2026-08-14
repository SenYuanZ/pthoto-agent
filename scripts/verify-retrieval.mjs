// Retrieval hit-rate check for the production knowledge base pipeline.
// Usage: npm run build && node scripts/verify-retrieval.mjs
// Loads built-in seed docs + committed custom-documents.json (dist copy),
// chunks them exactly like KnowledgeService, indexes with SimpleVectorStore
// (BM25), and for a set of typical user questions reports whether the
// expected knowledge doc is hit in the top-1 / top-3 / top-6 chunk results
// (chat uses RAG_TOP_K=6).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { SimpleVectorStore } from '../dist/knowledge/local-vector-store.js';
import { seedDocuments } from '../dist/knowledge/data/seed-documents.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const customDocuments = JSON.parse(
  readFileSync(path.join(root, '..', 'dist', 'knowledge', 'data', 'custom-documents.json'), 'utf8'),
);

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 100,
  separators: ['\n## ', '\n**', '\n- ', '\n\n', '\n', '。', '，', ' '],
});

const store = new SimpleVectorStore();
let chunkCounter = 0;

async function addSource(content, source, category) {
  const splitDocs = await splitter.createDocuments([content], [{ source, category }]);
  const docs = splitDocs.map((d) => ({
    ...d,
    metadata: { ...d.metadata, source, category, chunkId: `${source}#c${chunkCounter++}` },
  }));
  await store.addDocuments(docs);
}

for (const doc of seedDocuments) {
  await addSource(doc.content, doc.metadata.source, doc.metadata.category);
}
for (const doc of customDocuments) {
  await addSource(doc.content, doc.source, doc.category);
}

// Each query maps to the custom-documents.json docs that SHOULD be retrieved.
const cases = [
  ['女生拍照怎么站好看', ['女生人像拍照姿势大全', '摄影通用体态']],
  ['怎么摆姿势拍照自然', ['摄影通用体态', '女生人像拍照姿势大全']],
  ['漫展拍照用什么灯', ['漫展单灯', '单灯游场', '双灯系统', '三灯标准', '四灯布光', '五灯顶配', 'COS角色专属']],
  ['婚纱照怎么拍好看', ['婚纱婚礼人像拍照姿势合集']],
  ['儿童拍照怎么引导', ['儿童拍照姿势引导技巧']],
  ['汉服拍照有什么姿势', ['汉服古风拍照全套姿势指南']],
  ['男生拍照怎么摆姿势', ['男生人像拍照姿势与技巧']],
  ['两个人合照怎么摆姿势', ['情侣双人合照姿势参考']],
  ['拍照片显脸小', ['女生人像拍照姿势大全', '摄影通用体态']],
  ['cosplay摆什么动作', ['Cosplay二次元拍照姿势大全']],
  // 新增知识库文档的命中检查
  ['手机拍照有什么技巧', ['手机摄影基础技巧']],
  ['手机怎么拍夜景人像', ['手机人像与夜景拍摄']],
  ['证件照有什么要求', ['证件照拍摄技巧']],
  ['夜景人像怎么拍', ['夜景人像拍摄']],
  ['逆光人像怎么拍', ['逆光人像拍摄']],
  ['无人机航拍要注意什么', ['无人机航拍基础']],
  ['视频怎么拍才稳定', ['视频拍摄基础']],
  ['黑白照片怎么拍', ['黑白摄影入门']],
  ['相机怎么清洁保养', ['相机清洁与保养']],
  ['延时摄影怎么拍', ['延时摄影入门']],
  ['窗户光人像怎么拍', ['窗户光人像']],
  ['闪光灯怎么用', ['闪光灯使用技巧']],
  ['写真人像拍摄流程', ['写真拍摄全流程']],
  ['焦段怎么选', ['焦段与透视']],
];

const TOP_K = 6;
let top1Hits = 0;
let top3Hits = 0;
let topKHits = 0;
for (const [q, expected] of cases) {
  const results = await store.similaritySearchWithScores(q, TOP_K);
  const hit = (rank) => expected.some((e) => results[rank]?.document?.metadata?.source.includes(e));
  const hit1 = hit(0);
  const hit3 = results.slice(0, 3).some((r) => expected.some((e) => r.document?.metadata?.source.includes(e)));
  const hitK = results.some((r) => expected.some((e) => r.document?.metadata?.source.includes(e)));
  if (hit1) top1Hits++;
  if (hit3) top3Hits++;
  if (hitK) topKHits++;
  console.log(`Q: ${q}  ${hit1 ? 'TOP1-HIT' : 'top1-MISS'}  top6=${hitK ? 'HIT' : 'MISS'}`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`   #${i + 1}  ${r.score.toFixed(2).padStart(6)}  ${r.document?.metadata?.source}`);
  }
}
console.log(`\nTotal chunks indexed: ${store.size}`);
console.log(`Top-1 hit: ${top1Hits}/${cases.length}   Top-3 hit: ${top3Hits}/${cases.length}   Top-${TOP_K} hit: ${topKHits}/${cases.length}`);
