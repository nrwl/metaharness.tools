// Public entry point. The site imports animation components from here, e.g.
//   import { Template } from '@metaharness/animations';
//
// Add a re-export line per animation as they are built.
export { Template } from './animations/_template';
export type { TemplateProps } from './animations/_template';

export { MetaHarnessLayers } from './animations/meta-harness-layers';
export type { MetaHarnessLayersProps } from './animations/meta-harness-layers';

export {
  SessionNetwork,
  drawSessionNetwork,
  SESSION_NETWORK_CYCLE,
} from './animations/session-network';
export type { SessionNetworkProps } from './animations/session-network';

export {
  RepositoryGraph,
  drawRepositoryGraph,
  REPOSITORY_GRAPH_CYCLE,
} from './animations/repository-graph';
export type { RepositoryGraphProps } from './animations/repository-graph';

export { CrossRepoFlow, drawCrossRepoFlow } from './animations/cross-repo-flow';
export type { CrossRepoFlowProps } from './animations/cross-repo-flow';

export {
  SessionMemory,
  drawSessionMemory,
  SESSION_MEMORY_CYCLE,
} from './animations/session-memory';
export type { SessionMemoryProps } from './animations/session-memory';

export {
  SingleRepoCube,
  drawSingleRepoCube,
  SINGLE_REPO_CUBE_CYCLE,
} from './animations/single-repo-cube';
export type { SingleRepoCubeProps } from './animations/single-repo-cube';

export {
  MultiRepoCubes,
  drawMultiRepoCubes,
  MULTI_REPO_CUBES_CYCLE,
} from './animations/multi-repo-cubes';
export type { MultiRepoCubesProps } from './animations/multi-repo-cubes';

export {
  SessionDissolve,
  drawSessionDissolve,
  SESSION_DISSOLVE_CYCLE,
} from './animations/session-dissolve';
export type { SessionDissolveProps } from './animations/session-dissolve';

export {
  IsolatedSessions,
  drawIsolatedSessions,
  ISOLATED_SESSIONS_CYCLE,
} from './animations/isolated-sessions';
export type { IsolatedSessionsProps } from './animations/isolated-sessions';

// Shared canvas utilities, exposed for consumers that build their own canvases.
export {
  setupCanvas,
  useCanvasAnimation,
  useInView,
  useMorphToggle,
} from './lib/canvas';
export type {
  CanvasFrame,
  UseCanvasAnimationOptions,
  UseInViewOptions,
  UseMorphToggleOptions,
  MorphToggle,
  MorphMode,
} from './lib/canvas';
export { MorphSwitch } from './lib/MorphSwitch';
export type { MorphSwitchProps } from './lib/MorphSwitch';
