import { checkContactMessage } from '../public/contact-rules.js';
import { sendContactMail } from '../src/health.js';
import { allowStrict, refund } from '../src/ratelimit.js';
import { getStore } from '../src/store.js';
import { dayKey } from '../src/time.js';
import { readBody, sendJson } from '../src/http.js';

// Only delivered messages use up the day, so robots that are turned away cannot lock real people out.
const DAILY_LIMIT = 40;
const PER_PERSON_PER_HOUR = 3;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  const body = readBody(req);
  if (!body) {
    return sendJson(res, 400, { ok: false, reason: 'invalid' });
  }
  // The hidden field is empty for people; robots fill it in. They are told it worked and nothing is sent.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return sendJson(res, 200, { ok: true });
  }
  const input = {
    name: String(body.name ?? '').trim(),
    email: String(body.email ?? '').trim(),
    company: String(body.company ?? '').trim(),
    message: String(body.message ?? '').trim(),
    confirmed: body.confirmed === true,
  };
  const problem = checkContactMessage(input);
  if (problem) {
    return sendJson(res, 422, { ok: false, reason: problem });
  }
  const now = Date.now();
  try {
    const store = getStore();
    if (!(await allowStrict(store, 'contact', req, PER_PERSON_PER_HOUR, 3600, now))) {
      return sendJson(res, 429, { ok: false, reason: 'rate' });
    }
    // The place for today is reserved first (one atomic step, so two messages at once cannot both take the last one)
    // and handed back if the mail was not sent, so only delivered messages use up the day.
    const key = `contact:${dayKey(now)}`;
    const reserved = await store.incr(key);
    if (reserved === 1) {
      await store.expire(key, 2 * 24 * 60 * 60);
    }
    if (reserved > DAILY_LIMIT) {
      await store.decr(key);
      await refund(store, 'contact', req, 3600, now);
      return sendJson(res, 429, { ok: false, reason: 'rate' });
    }
    const result = await sendContactMail(process.env, input).catch(() => ({ ok: false }));
    if (!result.ok) {
      // A failed mail never uses up the day. The person gets the try back only when the fault is clearly ours
      // (no key or address set up, status 0, or the mail service answering 5xx); a refusal of the message itself
      // or a network error still counts, so a caller cannot make requests fail on purpose and keep trying.
      await store.decr(key);
      if (result.status === 0 || result.status >= 500) {
        await refund(store, 'contact', req, 3600, now);
      }
    }
    return sendJson(res, result.ok ? 200 : 502, { ok: result.ok });
  } catch {
    return sendJson(res, 503, { ok: false, reason: 'failed' });
  }
}
