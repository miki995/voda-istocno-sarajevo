import { toLatin } from '../public/translit.js';

export function fold(value) {
  return toLatin(value)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/dj/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mentions(text, needle) {
  const folded = fold(needle);
  return folded.length >= 3 && ` ${fold(text)} `.includes(` ${folded} `);
}
