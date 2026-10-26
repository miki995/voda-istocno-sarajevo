const HEALTH_KEY = 'health';
const PERSIST_MS = 30 * 60 * 1000;
const REPEAT_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECIPIENT = 'miroslavmaksimovic95@gmail.com';

async function sendMail(env, subject, text) {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set, cannot send:', subject);
    return false;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.ALERT_FROM ?? 'Voda ISA <onboarding@resend.dev>',
      to: [env.ALERT_EMAIL ?? DEFAULT_RECIPIENT],
      subject,
      text,
    }),
  });
  if (!response.ok) {
    console.error('mail was not accepted', response.status);
  }
  return response.ok;
}

// Mails only when the same problem has lasted half an hour (so a blip is ignored) and at most once a day,
// then once more when everything is back to normal.
export async function checkHealth(store, env, problem, now) {
  const state = (await store.get(HEALTH_KEY)) ?? {};
  if (!problem) {
    if (state.kind) {
      await store.set(HEALTH_KEY, {});
      if (state.alertedAt) {
        await sendMail(env, '[Voda ISA] Izvor podataka ponovo radi', 'Sajt vikis.info se ponovo čita bez problema.');
      }
    }
    return 'ok';
  }
  const since = state.kind === problem.kind ? state.since : now;
  let alertedAt = state.kind === problem.kind ? state.alertedAt : undefined;
  const due = now - since >= PERSIST_MS && (!alertedAt || now - alertedAt >= REPEAT_MS);
  if (due && (await sendMail(env, `[Voda ISA] Problem sa izvorom podataka (${problem.kind})`, `${problem.detail}\n\nProblem traje od ${new Date(since).toISOString()}.\nSajt: https://vikis.info/`))) {
    alertedAt = now;
  }
  await store.set(HEALTH_KEY, { kind: problem.kind, since, alertedAt });
  return problem.kind;
}
