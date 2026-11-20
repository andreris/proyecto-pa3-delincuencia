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
 * Ensures external source URLs use HTTPS and valid domains (x.com / twitter.com).
 */
export function getSafeExternalUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'x.com' ||
        parsed.hostname === 'www.x.com' ||
        parsed.hostname === 'twitter.com' ||
        parsed.hostname === 'www.twitter.com')
    ) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
