# AGENTS.md

## Cursor Cloud specific instructions

This is an [Nx](https://nx.dev) monorepo (Astro + Tailwind v4 + React 19) for the `metaharness.tools` marketing/educational site. Node 22 (`.nvmrc`) and pnpm 11 are required. The update script runs `corepack enable pnpm` + `pnpm install --frozen-lockfile`, so dependencies are already installed before an agent starts.

Two runnable pieces (both dev servers, see `README.md` and `package.json` for the canonical commands):

| Piece | What it is | Dev command | URL |
| --- | --- | --- | --- |
| `apps/website` | Astro static site (the product) | `pnpm dev` (`nx dev website`) | http://localhost:4321/ |
| `packages/animations` | Canvas animations, developed in isolation | `pnpm storybook` (`nx storybook animations`) | http://localhost:6006/ |

Checks / build (what CI runs is `nx affected -t check build`):

- Type-check website: `pnpm exec nx check website` (runs `astro check`).
- Type-check animations: `pnpm exec nx typecheck animations` (runs `tsc --noEmit`).
- Build website: `pnpm exec nx build website` → output in `apps/website/dist`.

Non-obvious notes:

- pnpm resolves to v11 via Corepack (driven by `packageManagerDependencies` in `pnpm-lock.yaml`). If a shell reports pnpm 10.x, run `corepack enable pnpm` first; installs still succeed on 10 (lockfile is v9.0) but the repo targets 11.
- There is no ESLint config and no `lint` script; `nx check`/`typecheck` are the type-safety gates. `prettier --check .` currently reports pre-existing formatting warnings in several files and is not wired into CI — do not mass-reformat.
- The website build is affected by the `COMING_SOON` env var (see `netlify.toml` and `apps/website/package.json` nx `build.inputs`). It is unset in local dev, which renders the full site.
