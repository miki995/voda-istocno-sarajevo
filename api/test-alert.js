import { sendTestMail } from '../src/health.js';
import { isAuthorized, sendJson } from '../src/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  try {
    const result = await sendTestMail(process.env);
    return sendJson(res, result.ok ? 200 : 502, result);
  } catch (error) {
    return sendJson(res, 500, { ok: false, detail: error.message });
  }
}
