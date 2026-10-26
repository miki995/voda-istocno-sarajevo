const LATIN_TO_CYRILLIC = {
  a: 'а', b: 'б', c: 'ц', č: 'ч', ć: 'ћ', d: 'д', đ: 'ђ', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к',
  l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', š: 'ш', t: 'т', u: 'у', v: 'в', z: 'з', ž: 'ж',
  lj: 'љ', nj: 'њ', dž: 'џ',
};

const CYRILLIC_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj',
  м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č',
  џ: 'dž', ш: 'š',
};

const LATIN_PATTERN = /lj|nj|dž|[a-zčćđšž]/giu;
const CYRILLIC_PATTERN = /[Ѐ-ӿ]/gu;
// Zone and housing-block numerals ("Zona II", "Dobrinja IV") and product names stay in Latin letters in Cyrillic text too.
const ROMAN_NUMERAL = /(?<![\p{L}\d])(?:[IVX]+|iPhone|Safari|Chrome|Instagram|Facebook|Viber)(?![\p{L}\d])/gu;

function matchCase(source, converted) {
  return source[0] === source[0].toLowerCase() ? converted : converted.toUpperCase();
}

function convertWords(text) {
  return text.replace(LATIN_PATTERN, match => {
    const mapped = LATIN_TO_CYRILLIC[match.toLowerCase()];
    return mapped ? matchCase(match, mapped) : match;
  });
}

export function toCyrillic(value) {
  const text = String(value ?? '').normalize('NFC');
  const numerals = [...text.matchAll(ROMAN_NUMERAL)];
  let result = '';
  let cursor = 0;
  for (const numeral of numerals) {
    result += convertWords(text.slice(cursor, numeral.index)) + numeral[0];
    cursor = numeral.index + numeral[0].length;
  }
  return result + convertWords(text.slice(cursor));
}

export function toLatin(value) {
  return String(value ?? '').replace(CYRILLIC_PATTERN, char => {
    const mapped = CYRILLIC_TO_LATIN[char.toLowerCase()];
    if (!mapped) return char;
    return char === char.toLowerCase() ? mapped : mapped[0].toUpperCase() + mapped.slice(1);
  });
}
