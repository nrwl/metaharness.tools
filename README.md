# metaharness.tools

Website explaining what meta harnesses are. Built with [Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com), managed as an [Nx](https://nx.dev) workspace.

## Prerequisites

- Node `22` (see `.nvmrc`)
- pnpm `^11`

## Getting started

```sh
pnpm install
pnpm dev        # start the dev server (nx dev website)
```

## Common commands

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Dev server with HMR                      |
| `pnpm build`        | Production build → `dist/apps/website`   |
| `pnpm preview`      | Preview the production build             |
| `nx check website`  | Type-check the Astro project             |

## Structure

```
apps/website/        Astro site
  src/pages/         routes
  src/layouts/       shared layouts
  src/styles/        global styles (Tailwind)
```

## Deployment

Deployed to Netlify (see `netlify.toml`). Build command `pnpm exec nx build website`, publish dir `dist/apps/website`.

## License

MIT
