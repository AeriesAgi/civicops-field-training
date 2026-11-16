'use strict';
/**
 * POST /api/instructor/ask  { messages: [{ role, content }] }  ->  { text }
 *
 * Server-side Meta AI instructor for CivicOps Field Training. The API key comes only from the
 * META_API_KEY app setting on the Static Web App. It is never logged, echoed or returned.
 * Optional settings: LLAMA_BASE_URL (default https://api.meta.ai/v1) and LLAMA_MODEL
 * (default muse-spark-1.3). The hosted default is Meta AI Muse Spark. Those setting
 * names are historical; they can point the function at another OpenAI-compatible endpoint.
 */
const { handle } = require('./handler.js');

module.exports = async function (context, req) {
  context.res = await handle(req, process.env);
};
