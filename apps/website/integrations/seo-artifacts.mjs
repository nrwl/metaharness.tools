import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const SITE = 'https://metaharness.tools';
const SUMMARY =
  'An educational reference on AI agent meta-harnesses: the layer above your harnesses that spans repos, sessions, and time.';

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

const SKIP_SELECTORS = [
  'script',
  'style',
  'svg',
  'canvas',
  'nav',
  'header',
  'footer',
  'astro-island',
  '[aria-hidden="true"]',
  '.rail-hidden',
  '#section-rail',
];

function distPath(dir) {
  return dir instanceof URL ? fileURLToPath(dir) : dir;
}

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeInline(text) {
  return normalize(text)
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');
}

function cleanBlankLines(markdown) {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripChrome(root) {
  for (const selector of SKIP_SELECTORS) {
    for (const node of root.querySelectorAll(selector)) {
      node.remove();
    }
  }
}

function tagName(node) {
  return node?.rawTagName?.toLowerCase?.() ?? '';
}

function isTextNode(node) {
  return node.nodeType === 3;
}

function inlineText(node, { links = true } = {}) {
  if (!node) return '';
  if (isTextNode(node)) return node.text ?? node.rawText ?? '';

  const tag = tagName(node);
  if (['script', 'style', 'svg', 'canvas', 'astro-island'].includes(tag)) {
    return '';
  }
  if (tag === 'br') return '\n';
  if (tag === 'img') {
    return normalize(node.getAttribute('alt') ?? '');
  }

  // Light/dark image pairs repeat the same alt text; keep only the first.
  const parts = [];
  let lastImgAlt;
  for (const child of node.childNodes) {
    if (tagName(child) === 'img') {
      const alt = normalize(child.getAttribute('alt') ?? '');
      if (!alt || alt === lastImgAlt) continue;
      lastImgAlt = alt;
      parts.push(alt);
      continue;
    }
    if (!isTextNode(child)) lastImgAlt = undefined;
    parts.push(inlineText(child, { links }));
  }
  const text = normalizeInline(parts.join(' '));
  if (!text) return '';

  if (links && tag === 'a') {
    const href = node.getAttribute('href');
    return href ? `[${text}](${href})` : text;
  }

  return text;
}

function elementSiblings(node) {
  const siblings =
    node.parentNode?.childNodes?.filter((child) => !isTextNode(child)) ?? [];
  const index = siblings.indexOf(node);
  return { prev: siblings[index - 1], next: siblings[index + 1] };
}

// Vendor eyebrows ("By Nx") render above product headings; fold them into the
// heading itself so the extracted text keeps the attribution.
function eyebrowFor(node) {
  if (tagName(node) !== 'p') return undefined;
  const text = inlineText(node, { links: false });
  return /^By\s+\S/.test(text) ? text : undefined;
}

function blockMarkdown(node) {
  if (!node) return '';
  if (isTextNode(node)) return '';

  const tag = tagName(node);
  if (['script', 'style', 'svg', 'canvas', 'astro-island'].includes(tag)) {
    return '';
  }

  if (/^h[1-3]$/.test(tag)) {
    let text = inlineText(node);
    if (!text) return '';
    const eyebrow = eyebrowFor(elementSiblings(node).prev);
    if (eyebrow) text += ` (${eyebrow.replace(/^By\b/, 'by')})`;
    return `${'#'.repeat(Number(tag.slice(1)))} ${text}`;
  }

  if (tag === 'h4') {
    const text = inlineText(node);
    return text ? `**${text}**` : '';
  }

  if (tag === 'p' || tag === 'figcaption') {
    if (tag === 'p') {
      const { next } = elementSiblings(node);
      if (eyebrowFor(node) && /^h[1-4]$/.test(tagName(next))) return '';
    }
    return inlineText(node);
  }

  if (tag === 'figure' || tag === 'blockquote') {
    return node.childNodes.map(blockMarkdown).filter(Boolean).join('\n\n');
  }

  if (tag === 'li') {
    const nested = node.childNodes
      .filter((child) => BLOCK_TAGS.has(tagName(child)))
      .map(blockMarkdown)
      .filter(Boolean);
    const text = normalize(
      node.childNodes
        .filter((child) => !BLOCK_TAGS.has(tagName(child)))
        .map(inlineText)
        .join(' '),
    );
    // Decorative step numbers ("01") duplicate the ordered-list position.
    const firstLine = (/^\d{1,2}$/.test(text) ? '' : text) || nested.shift() || '';
    return [
      `- ${firstLine}`,
      ...nested.map((line) => line.replace(/^/gm, '  ')),
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (tag === 'ul' || tag === 'ol') {
    const items = node.childNodes.map(blockMarkdown).filter(Boolean);
    if (tag === 'ol') {
      return items
        .map((item, index) => item.replace(/^- /, `${index + 1}. `))
        .join('\n');
    }
    return items.join('\n');
  }

  return node.childNodes.map(blockMarkdown).filter(Boolean).join('\n\n');
}

function headingAnchor(heading) {
  let current = heading;
  while (current) {
    const id = current.getAttribute?.('id');
    if (id) return id;
    current = current.parentNode;
  }
  return undefined;
}

function getSections(main) {
  const seen = new Set();
  const sections = [];

  for (const heading of main.querySelectorAll('h1,h2,h3')) {
    const text = inlineText(heading);
    const id = headingAnchor(heading);
    if (!text || !id || seen.has(id)) continue;
    seen.add(id);
    sections.push({ text, href: `/#${id}` });
  }

  return sections;
}

function getResources(main) {
  const seen = new Set();
  const resources = [];

  for (const link of main.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    const label = link.querySelector('span');
    const text = inlineText(label ?? link, { links: false });
    if (!href?.startsWith('http') || !text || seen.has(href)) continue;
    seen.add(href);
    resources.push({ text, href });
  }

  return resources;
}

function renderLlmsIndex(sections, resources) {
  return cleanBlankLines(`
# metaharness.tools

> ${SUMMARY}

metaharness.tools explains what AI agent meta-harnesses are, why the layer is emerging, and which capabilities it can add above individual agent harnesses.

## Sections

${sections.map((section) => `- [${section.text}](${section.href})`).join('\n')}

## Full Content

- [Full page text](/llms-full.txt)

## Resources

${resources.map((resource) => `- [${resource.text}](${resource.href})`).join('\n')}
`);
}

function renderLlmsFull(body) {
  return cleanBlankLines(`
# metaharness.tools

> ${SUMMARY}

${body}
`);
}

async function writeRobots(outDir) {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${SITE}/sitemap-index.xml`,
    '',
  ].join('\n');

  await fs.writeFile(path.join(outDir, 'robots.txt'), body);
}

async function writeLlms(outDir) {
  const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  const root = parse(html);
  const main = root.querySelector('main');

  if (!main) {
    throw new Error('Could not find <main> in built index.html');
  }

  stripChrome(main);

  const body = cleanBlankLines(blockMarkdown(main));
  const sections = getSections(main);
  const resources = getResources(main);

  await Promise.all([
    fs.writeFile(
      path.join(outDir, 'llms.txt'),
      `${renderLlmsIndex(sections, resources)}\n`,
    ),
    fs.writeFile(
      path.join(outDir, 'llms-full.txt'),
      `${renderLlmsFull(body)}\n`,
    ),
  ]);
}

export default function seoArtifacts() {
  return {
    name: 'seo-artifacts',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const outDir = distPath(dir);

        await writeRobots(outDir);
        await writeLlms(outDir);
      },
    },
  };
}
