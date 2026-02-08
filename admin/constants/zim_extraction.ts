
export const HTML_SELECTORS_TO_REMOVE = [
    'script',
    'style',
    'nav',
    'header',
    'footer',
    'noscript',
    'iframe',
    'svg',
    '.navbox',
    '.sidebar',
    '.infobox',
    '.mw-editsection',
    '.reference',
    '.reflist',
    '.toc',
    '.noprint',
    '.mw-jump-link',
    '.mw-headline-anchor',
    '[role="navigation"]',
    '.navbar',
    '.hatnote',
    '.ambox',
    '.sistersitebox',
    '.portal',
    '#coordinates',
    '.geo-nondefault',
    '.authority-control',
]

// Common heading names that usually don't have meaningful content under them
export const NON_CONTENT_HEADING_PATTERNS = [
    /^see also$/i,
    /^references$/i,
    /^external links$/i,
    /^further reading$/i,
    /^notes$/i,
    /^bibliography$/i,
    /^navigation$/i,
]

/**
 * Batch size for processing ZIM articles to prevent lock timeout errors.
 * Processing 50 articles at a time balances throughput with job duration.
 * Typical processing time: 2-5 minutes per batch depending on article complexity.
 */
export const ZIM_BATCH_SIZE = 50