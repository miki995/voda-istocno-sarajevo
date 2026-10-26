import { toLatin } from './translit.js';

// The contact form is only for collaboration and business offers. The same rules run in the form (for quick feedback)
// and on the server (which is the one that counts).
const COLLABORATION = /\b(saradnj\w*|ponud\w*|projekt\w*|poslovn\w*|sponzor\w*|partner\w*|ugovor\w*|sastanc\w*|firm\w*|kompanij\w*|preduzec\w*|reklam\w*|integracij\w*|licenc\w*|investic\w*|agencij\w*|collaborat\w*|cooperat\w*|sponsor\w*|freelanc\w*|opportunit\w*|projekat|sastanak|partnership|proposal|offer|business|hire|hiring|agency)\b/g;
const WATER_QUESTION = /(kad(a)? (ce|cu|ce li|ce nam|ima|se vrac|dolazi)|zasto (nema|nije)|nema vode|nije bilo vode|bez vode (je|sam|smo)|moja ulica|moj kvar|prijav\w* kvar|kvar\w* (na|u)|racun|dug za|ocitavanj\w*|vodomjer|vodomer|pritisak|mutna|prljava|brojilo|when will|why is there no|no water)/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LINK = /https?:\/\/|www\./gi;

export const LIMITS = { nameMin: 2, nameMax: 80, emailMax: 80, companyMax: 80, messageMin: 40, messageMax: 2000, links: 2 };

function plain(value) {
  return toLatin(String(value ?? ''))
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Returns null when the message can go through, otherwise a short reason: 'name', 'email', 'company', 'short',
// 'long', 'links', 'confirm' or 'offtopic'.
export function checkContactMessage({ name, email, company, message, confirmed }) {
  const cleanName = String(name ?? '').trim();
  if (cleanName.length < LIMITS.nameMin || cleanName.length > LIMITS.nameMax) return 'name';
  if (!EMAIL.test(String(email ?? '').trim()) || String(email).trim().length > LIMITS.emailMax) return 'email';
  if (String(company ?? '').trim().length > LIMITS.companyMax) return 'company';
  const text = String(message ?? '').trim();
  if (text.length < LIMITS.messageMin) return 'short';
  if (text.length > LIMITS.messageMax) return 'long';
  if ((text.match(LINK) ?? []).length > LIMITS.links) return 'links';
  if (confirmed !== true) return 'confirm';
  const folded = plain(text);
  const collaboration = (folded.match(COLLABORATION) ?? []).length;
  if (collaboration === 0) return 'offtopic';
  if (WATER_QUESTION.test(folded) && collaboration < 2) return 'offtopic';
  return null;
}
