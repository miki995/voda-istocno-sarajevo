const HEALTH_KEY = 'health';
const PERSIST_MS = 30 * 60 * 1000;
const REPEAT_MS = 24 * 60 * 60 * 1000;

async function deliver(env, subject, text, extra = {}) {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set, cannot send:', subject);
    return { ok: false, status: 0, detail: 'RESEND_API_KEY nije podešen na serveru' };
  }
  if (!env.ALERT_EMAIL) {
    console.error('ALERT_EMAIL is not set, cannot send:', subject);
    return { ok: false, status: 0, detail: 'ALERT_EMAIL nije podešen na serveru' };
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.ALERT_FROM ?? 'Voda ISA <onboarding@resend.dev>',
      to: [env.ALERT_EMAIL],
      subject,
      text,
      ...extra,
    }),
  });
  if (!response.ok) {
    console.error('mail was not accepted', response.status);
  }
  return { ok: response.ok, status: response.status, detail: response.ok ? 'poslato' : (await response.text()).slice(0, 300) };
}

async function sendMail(env, subject, text) {
  return (await deliver(env, subject, text)).ok;
}

// A message from the collaboration form. The reply goes to the sender, the sender never sees where it was delivered.
export async function sendContactMail(env, { name, email, company, message }) {
  const oneLine = value => String(value).replace(/[\r\n]+/g, ' ').slice(0, 80);
  const text = [`Ime: ${oneLine(name)}`, `Mejl: ${oneLine(email)}`, company ? `Firma/projekat: ${oneLine(company)}` : null, '', message].filter(line => line !== null).join('\n');
  return deliver(env, `[Voda ISA] Saradnja: ${oneLine(name)}`, text, { reply_to: oneLine(email) });
}

export async function sendTestMail(env, now = Date.now()) {
  return deliver(env, '[Voda ISA] Probni mejl', `Ovo je probni mejl iz aplikacije Voda ISA, poslat ${new Date(now).toISOString()}.\nAko ga vidiš, upozorenja o problemu s izvorom podataka stižu na ovu adresu.`);
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
