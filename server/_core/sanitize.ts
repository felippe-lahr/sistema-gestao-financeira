/**
 * Sanitization utilities to prevent XSS attacks
 */

// Simple HTML sanitizer without external dependencies
// For production, consider using DOMPurify or similar library

const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'link', 'style', 'meta', 'form', 'input', 'button'];
const DANGEROUS_ATTRS = ['onclick', 'onerror', 'onload', 'onmouseover', 'onmouseout', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup'];

/**
 * Sanitize HTML string to prevent XSS attacks
 * Removes dangerous tags and attributes
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  let sanitized = html;

  // Remove dangerous tags
  DANGEROUS_TAGS.forEach(tag => {
    const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove dangerous attributes
  DANGEROUS_ATTRS.forEach(attr => {
    const regex = new RegExp(`\\s${attr}\\s*=\\s*["\']?[^"\'\\s>]*["\']?`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove event handlers in attributes
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

  return sanitized;
}

/**
 * Sanitize plain text to prevent XSS
 * Escapes HTML special characters
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'\/]/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Sanitize URL to prevent javascript: and data: protocols
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return '';
  }

  return url;
}

/**
 * Validate and sanitize JSON input
 */
export function sanitizeJson(data: any): any {
  if (typeof data === 'string') {
    return sanitizeText(data);
  }

  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      return data.map(item => sanitizeJson(item));
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeJson(value);
    }
    return sanitized;
  }

  return data;
}
