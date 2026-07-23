<p><a href="https://metaharness.tools" target="_blank" rel="noreferrer" title="metaharness.tools"><img src="https://metaharness.tools/og.png" width="100%" alt="metaharness.tools" /></a></p>

# metaharness.tools

AI coding agents run inside a **harness** (Claude Code, Codex, and friends). A **meta-harness** is the layer that optimizes that harness: the feedback loops, distilled memory, rules, and cross-repo context that make agentic work compound over time instead of resetting every session.

[**What is a meta-harness?**](https://metaharness.tools) — metaharness.tools is an educational reference on the meta-harness (also written _metaharness_ or _meta harness_): what it is, what it optimizes, and why the layer is emerging. We try to keep it clear and objective, and we welcome pull requests if we got something wrong or left something out.

Built with [Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com), managed as an [Nx](https://nx.dev) workspace.

## Development

### Prerequisites

- Node `22` (see [`.nvmrc`](./.nvmrc))
- [pnpm](https://pnpm.io)

### Running locally

```sh
pnpm install
pnpm dev        # nx dev website — http://localhost:4321
```

### Common commands

| Command          | Description                            |
| ---------------- | -------------------------------------- |
| `pnpm dev`       | Dev server with HMR                    |
| `pnpm build`     | Production build → `apps/website/dist` |
| `pnpm preview`   | Preview the production build           |
| `pnpm storybook` | Storybook for the `animations` package |

### Structure

```
apps/website/          Astro site
  src/pages/           routes
  src/layouts/         shared layouts
  src/components/       sections & UI
  integrations/        build-time SEO artifacts (llms.txt, robots, sitemap)
  tools/og/            OG image generator (Satori → PNG)
packages/animations/   shared animated diagrams
```

## Deployment

Deployed to [Netlify](https://www.netlify.com) (see [`netlify.toml`](./netlify.toml)). Build command `pnpm exec nx build website`, publish dir `apps/website/dist`. The OG image is generated at build time by the `og` Nx target (a dependency of `build`).

## License

MIT
