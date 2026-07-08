import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import wawoff2 from 'wawoff2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../../..');
const OUT_FILE = path.join(REPO, 'apps/website/public/og.png');
const require = createRequire(import.meta.url);

const W = 1200;
const H = 630;
const C = {
  bg: '#0a0a0a',
  text: '#f5f5f5',
  muted: '#a3a3a3',
  dim: '#737373',
  line: '#262626',
  accent: '#d8b878',
};

type El = { type: string; props: Record<string, unknown> };

const el = (type: string, props: Record<string, unknown>): El => ({
  type,
  props,
});
const box = (style: Record<string, unknown>, children?: unknown) =>
  el('div', { style: { display: 'flex', ...style }, children });
const txt = (style: Record<string, unknown>, children: string) =>
  el('div', { style: { display: 'flex', ...style }, children });

function fontFile(packageName: string, family: string, weight: number) {
  const packageRoot = path.dirname(
    require.resolve(`${packageName}/package.json`),
  );
  return path.join(
    packageRoot,
    'files',
    `${family}-latin-${weight}-normal.woff2`,
  );
}

async function woff2(packageName: string, family: string, weight: number) {
  return Buffer.from(
    await wawoff2.decompress(
      readFileSync(fontFile(packageName, family, weight)),
    ),
  );
}

async function loadFonts() {
  const inter400 = await woff2('@fontsource/inter', 'inter', 400);
  const inter600 = await woff2('@fontsource/inter', 'inter', 600);
  const inter700 = await woff2('@fontsource/inter', 'inter', 700);
  const mono500 = await woff2(
    '@fontsource/jetbrains-mono',
    'jetbrains-mono',
    500,
  );
  const mono700 = await woff2(
    '@fontsource/jetbrains-mono',
    'jetbrains-mono',
    700,
  );

  return [
    {
      name: 'Inter',
      data: inter400,
      weight: 400 as const,
      style: 'normal' as const,
    },
    {
      name: 'Inter',
      data: inter600,
      weight: 600 as const,
      style: 'normal' as const,
    },
    {
      name: 'Inter',
      data: inter700,
      weight: 700 as const,
      style: 'normal' as const,
    },
    {
      name: 'JetBrains Mono',
      data: mono500,
      weight: 500 as const,
      style: 'normal' as const,
    },
    {
      name: 'JetBrains Mono',
      data: mono700,
      weight: 700 as const,
      style: 'normal' as const,
    },
  ];
}

function mark() {
  return box(
    {
      position: 'absolute',
      right: 72,
      top: 70,
      width: 260,
      height: 260,
      border: `1px solid ${C.line}`,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    [
      box({
        position: 'absolute',
        width: 190,
        height: 190,
        border: `1px solid ${C.line}`,
        borderRadius: 999,
      }),
      box({
        position: 'absolute',
        width: 120,
        height: 120,
        border: `1px solid ${C.accent}`,
        borderRadius: 999,
        opacity: 0.55,
      }),
      box({
        width: 10,
        height: 10,
        borderRadius: 999,
        background: C.accent,
      }),
    ],
  );
}

function tree() {
  return box(
    {
      width: W,
      height: H,
      position: 'relative',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '74px 78px 66px',
      background: C.bg,
      color: C.text,
      fontFamily: 'Inter',
    },
    [
      mark(),
      box({ flexDirection: 'column', gap: 34, maxWidth: 860 }, [
        txt(
          {
            fontFamily: 'JetBrains Mono',
            fontWeight: 700,
            fontSize: 20,
            color: C.accent,
            letterSpacing: 5,
          },
          'AI AGENT META-HARNESSES',
        ),
        box({ width: 156, height: 2, background: C.accent }),
        txt(
          {
            fontFamily: 'JetBrains Mono',
            fontWeight: 700,
            fontSize: 54,
            lineHeight: 1,
            color: C.text,
          },
          'metaharness.tools',
        ),
        txt(
          {
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: 72,
            lineHeight: 1.04,
            color: C.text,
            maxWidth: 920,
          },
          'The Meta-Harness',
        ),
        txt(
          {
            fontFamily: 'Inter',
            fontWeight: 400,
            fontSize: 31,
            lineHeight: 1.35,
            color: C.muted,
            maxWidth: 780,
          },
          'Elevating your harness for the new era of agentic work.',
        ),
      ]),
      box(
        {
          borderTop: `1px solid ${C.line}`,
          paddingTop: 24,
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        [
          txt(
            {
              fontFamily: 'JetBrains Mono',
              fontWeight: 500,
              fontSize: 22,
              color: C.dim,
            },
            'Nx',
          ),
          txt(
            {
              fontFamily: 'JetBrains Mono',
              fontWeight: 500,
              fontSize: 18,
              color: C.dim,
              letterSpacing: 2,
            },
            'REPOS · SESSIONS · MEMORY',
          ),
        ],
      ),
    ],
  );
}

async function main() {
  const fonts = await loadFonts();
  const svg = await satori(tree() as never, { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } })
    .render()
    .asPng();

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, png);
  console.log('generated apps/website/public/og.png');
}

await main();
