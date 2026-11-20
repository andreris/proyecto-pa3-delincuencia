/**
 * Sanitizes external text before rendering in UI components.
 * Strips HTML tags and control characters to prevent XSS.
 */
export function sanitizeExternalText(input: string, maxLength = 320): string {
  if (!input || typeof input !== 'string') return '';
  const cleaned = input
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Ensures external source URLs use HTTPS and valid trusted domains (x.com / twitter.com / rpp.pe).
 */
export function getSafeExternalUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isAllowed =
      host === 'x.com' ||
      host === 'www.x.com' ||
      host === 'twitter.com' ||
      host === 'www.twitter.com' ||
      host === 'rpp.pe' ||
      host.endsWith('.rpp.pe');

    if (parsed.protocol === 'https:' && isAllowed) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Ensures optional news thumbnail URLs use HTTPS (upgrading http to https safely).
 */
export function getSafeImageUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
