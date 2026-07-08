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

// Polygraph brand lockup (amber mark + white wordmark) for the dark card.
const POLYGRAPH_LOCKUP = `data:image/svg+xml;base64,${Buffer.from(
  readFileSync(
    path.join(REPO, 'apps/website/public/images/polygraph-lockup-dark-bg.svg'),
  ),
).toString('base64')}`;

const W = 1200;
const H = 630;
const C = {
  bg: '#0a0a0a',
  text: '#f5f5f5',
  muted: '#a3a3a3',
  dim: '#737373',
  line: '#262626',
  accent: '#d8b878',
  // Layered-diagram surfaces + borders (nested Meta-harness > Harness > LLM),
  // matching the site's MetaHarnessLayers "simple" variant on a dark card.
  textHeader: '#e5e5e5',
  textLabel: '#a3a3a3',
  metaBorder: '#2c2c2c',
  metaFill: '#0f0f0f',
  harnessBorder: '#3a3a3a',
  harnessFill: '#141414',
  llmBorder: '#2c2c2c',
  llmFill: '#191919',
  openai: '#d4d4d4',
};

// Brand marks rendered inside the LLM node, reused verbatim from
// packages/animations/.../MetaHarnessLayers.tsx (Simple Icons, 24x24 viewBox).
const CLAUDE_ICON_PATH =
  'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z';
const OPENAI_ICON_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

function iconImg(pathD: string, color: string, size: number): El {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${pathD}" fill="${color}"/></svg>`;
  return el('img', {
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    width: size,
    height: size,
    style: { width: size, height: size },
  });
}

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

// Nested layer header (title + sublabel), pinned to the top-left of a layer.
function layerHeader(
  title: string,
  sub: string,
  titleSize: number,
  subSize: number,
): El {
  return box(
    { position: 'absolute', top: 15, left: 17, flexDirection: 'column' },
    [
      txt(
        {
          fontFamily: 'Inter',
          fontWeight: 600,
          fontSize: titleSize,
          lineHeight: 1,
          color: C.textHeader,
        },
        title,
      ),
      txt(
        {
          fontFamily: 'Inter',
          fontWeight: 400,
          fontSize: subSize,
          lineHeight: 1,
          color: C.textLabel,
          marginTop: 7,
        },
        sub,
      ),
    ],
  );
}

const META = { w: 440, h: 284 };
const HARNESS = { w: 238, h: 158 };
const LLM_BOX = { w: 100, h: 80 };

// The site's MetaHarnessLayers "simple" variant: Meta-harness wraps Harness
// wraps the bare LLM node (Claude spark + OpenAI knot). Concentric, right side.
function diagram() {
  return box(
    {
      position: 'absolute',
      right: 66,
      top: 286,
      width: META.w,
      height: META.h,
      border: `1px solid ${C.metaBorder}`,
      borderRadius: 18,
      background: C.metaFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    [
      layerHeader('Meta-harness', 'Capability augmentation layer', 16, 12),
      box(
        {
          position: 'relative',
          width: HARNESS.w,
          height: HARNESS.h,
          border: `1px solid ${C.harnessBorder}`,
          borderRadius: 14,
          background: C.harnessFill,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 46,
        },
        [
          layerHeader('Harness', 'Claude Code / Codex', 14, 11),
          box(
            {
              width: LLM_BOX.w,
              height: LLM_BOX.h,
              border: `1px solid ${C.llmBorder}`,
              borderRadius: 11,
              background: C.llmFill,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            },
            [
              box({ alignItems: 'center', gap: 9 }, [
                iconImg(CLAUDE_ICON_PATH, C.accent, 18),
                iconImg(OPENAI_ICON_PATH, C.openai, 18),
              ]),
              txt(
                {
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  fontSize: 14,
                  color: C.textHeader,
                },
                'LLM',
              ),
            ],
          ),
        ],
      ),
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
      justifyContent: 'flex-start',
      padding: '74px 78px 66px',
      background: C.bg,
      color: C.text,
      fontFamily: 'Inter',
    },
    [
      diagram(),
      box({ flexDirection: 'column', gap: 30, maxWidth: 720, marginTop: 30 }, [
        txt(
          {
            fontFamily: 'JetBrains Mono',
            fontWeight: 700,
            fontSize: 20,
            color: C.accent,
            letterSpacing: 5,
          },
          'THE META-HARNESS MANUAL',
        ),
        box({ width: 156, height: 2, background: C.accent }),
        txt(
          {
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: 66,
            lineHeight: 1.03,
            color: C.text,
            maxWidth: 720,
          },
          'The Connected Agent',
        ),
        txt(
          {
            fontFamily: 'Inter',
            fontWeight: 400,
            fontSize: 29,
            lineHeight: 1.35,
            color: C.muted,
            maxWidth: 500,
          },
          'Meta-harnesses fill the gaps your harness leaves.',
        ),
      ]),
      box(
        {
          position: 'absolute',
          left: 78,
          bottom: 48,
          alignItems: 'center',
          gap: 12,
        },
        [
          txt(
            {
              fontFamily: 'Inter',
              fontWeight: 400,
              fontSize: 22,
              color: C.muted,
            },
            'Made with love by',
          ),
          el('img', {
            src: POLYGRAPH_LOCKUP,
            width: 139,
            height: 28,
            style: { width: 139, height: 28 },
          }),
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
