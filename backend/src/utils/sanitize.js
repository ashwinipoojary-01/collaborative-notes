import sanitizeHtml from 'sanitize-html';

const options = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 's', 'u', 'code', 'pre',
    'blockquote', 'hr', 'ul', 'ol', 'li', 'label', 'input', 'span', 'div',
  ],
  allowedAttributes: {
    ul: ['data-type'],
    li: ['data-type', 'data-checked'],
    input: ['type', 'checked', 'disabled'],
    ol: ['start'],
  },
  allowedSchemes: [],
  exclusiveFilter: (frame) => frame.tag === 'input' && frame.attribs.type !== 'checkbox',
};

export function sanitizeContent(html) {
  return sanitizeHtml(String(html ?? ''), options);
}

export function htmlToText(html) {
  return sanitizeHtml(String(html ?? '').replace(/<\/(p|h[1-3]|li|div|blockquote|pre)>/gi, '$& '), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
