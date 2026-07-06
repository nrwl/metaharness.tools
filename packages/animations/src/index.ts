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

// Shared canvas utilities, exposed for consumers that build their own canvases.
export {
  setupCanvas,
  useCanvasAnimation,
  useInView,
} from './lib/canvas';
export type {
  CanvasFrame,
  UseCanvasAnimationOptions,
  UseInViewOptions,
} from './lib/canvas';
