import { sendJson } from '../src/http.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Metoda nije dozvoljena' });
  }
  return sendJson(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY ?? '' });
}
