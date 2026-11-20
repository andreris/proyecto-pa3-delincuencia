import {
  canonicalizeWebUrl,
  sanitizeExternalText,
  sanitizeOptionalImageUrl
} from '../utils/sanitize.js';

export interface ParsedRssItem {
  externalId: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  originalUrl: string;
  imageUrl?: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  aacute: 'á',
  Aacute: 'Á',
  eacute: 'é',
  Eacute: 'É',
  iacute: 'í',
  Iacute: 'Í',
  oacute: 'ó',
  Oacute: 'Ó',
  uacute: 'ú',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  iquest: '¿',
  iexcl: '¡',
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
  ndash: '-',
  mdash: '-'
};

export function decodeXmlAndHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

function extractTagContent(block: string, tagNames: string[]): string {
  for (const tag of tagNames) {
    const escapedTag = tag.replace(/:/g, '\\:');
    const regex = new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i');
    const match = regex.exec(block);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function extractAtomLink(block: string): string {
  const linkTags = block.match(/<link\b[^>]*\/?>/gi) || [];
  for (const tag of linkTags) {
    const relMatch = /rel\s*=\s*["']([^"']*)["']/i.exec(tag);
    const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (hrefMatch && (!relMatch || relMatch[1] === 'alternate')) {
      return hrefMatch[1].trim();
    }
  }
  return '';
}

function extractImageFromBlock(block: string, rawDescription: string): string | undefined {
  // 1. <enclosure url="..." type="image/..." />
  const enclosureMatch = /<enclosure\b[^>]*>/i.exec(block);
  if (enclosureMatch) {
    const tag = enclosureMatch[0];
    const urlMatch = /url\s*=\s*["']([^"']+)["']/i.exec(tag);
    const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (urlMatch && (!typeMatch || typeMatch[1].toLowerCase().startsWith('image/'))) {
      const safe = sanitizeOptionalImageUrl(decodeXmlAndHtmlEntities(urlMatch[1]));
      if (safe) return safe;
    }
  }

  // 2. <media:content url="..." /> or <media:thumbnail url="..." />
  const mediaMatch = /<media:(?:content|thumbnail)\b[^>]*url\s*=\s*["']([^"']+)["'][^>]*>/i.exec(block);
  if (mediaMatch && mediaMatch[1]) {
    const safe = sanitizeOptionalImageUrl(decodeXmlAndHtmlEntities(mediaMatch[1]));
    if (safe) return safe;
  }

  // 3. Optional <img src="..."> inside RSS <description>
  const decodedDesc = decodeXmlAndHtmlEntities(rawDescription);
  const imgMatch = /<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/i.exec(decodedDesc);
  if (imgMatch && imgMatch[1]) {
    return sanitizeOptionalImageUrl(imgMatch[1]);
  }

  return undefined;
}

function parsePublishedDateIso(rawDate: string): string {
  if (!rawDate) return new Date().toISOString();
  const decoded = decodeXmlAndHtmlEntities(rawDate).trim();
  const parsed = new Date(decoded);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Parses an official RPP RSS 2.0 (or Atom) XML document strictly from its feed metadata:
 * reads ONLY title, brief description excerpt, canonical link, publishedAt, and optional image URL.
 * Intentionally NEVER reads or stores <content:encoded> or full article bodies.
 */
export function parseRppRssFeed(xml: string): ParsedRssItem[] {
  if (!xml || typeof xml !== 'string') {
    throw new Error('La respuesta del feed RSS está vacía.');
  }

  const trimmed = xml.trim();
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(trimmed)) {
    throw new Error('El contenido recibido no corresponde a un feed RSS/XML válido.');
  }

  const itemBlocks = trimmed.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const entryBlocks =
    itemBlocks.length > 0 ? itemBlocks : trimmed.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];

  const parsed: ParsedRssItem[] = [];

  for (const block of entryBlocks) {
    const rawTitle = decodeXmlAndHtmlEntities(extractTagContent(block, ['title']));
    const title = sanitizeExternalText(rawTitle, 220);

    const rawLink =
      decodeXmlAndHtmlEntities(extractTagContent(block, ['link'])) || extractAtomLink(block);
    const canonicalUrl = canonicalizeWebUrl(rawLink);

    if (!title || !canonicalUrl) {
      continue;
    }

    // Strictly extract brief RSS description/summary only (never <content:encoded> full article)
    const rawDescription = extractTagContent(block, ['description', 'summary']);
    const decodedDescription = decodeXmlAndHtmlEntities(rawDescription);
    const excerpt = sanitizeExternalText(decodedDescription, 360) || title;

    const rawDate = extractTagContent(block, ['pubDate', 'published', 'updated', 'dc:date']);
    const publishedAt = parsePublishedDateIso(rawDate);
    const imageUrl = extractImageFromBlock(block, rawDescription);

    parsed.push({
      externalId: canonicalUrl,
      title,
      excerpt,
      publishedAt,
      originalUrl: canonicalUrl,
      imageUrl
    });
  }

  return parsed;
}
