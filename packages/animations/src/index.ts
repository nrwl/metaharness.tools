// Public entry point. The site imports animation components from here, e.g.
//   import { Template } from '@metaharness/animations';
//
// Add a re-export line per animation as they are built.

// Shared theme palette (light/dark) consumed by every animation.
export {
  DARK_PALETTE,
  LIGHT_PALETTE,
  getPalette,
  type VizPalette,
  type ThemeMode,
} from './lib/palette';
export { usePalette, useThemeMode } from './lib/theme';

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
  SessionTimeline,
  drawSessionTimeline,
  SESSION_TIMELINE_CYCLE,
} from './animations/session-timeline';
export type { SessionTimelineProps } from './animations/session-timeline';

export {
  RepositoryGraph,
  drawRepositoryGraph,
  REPOSITORY_GRAPH_CYCLE,
} from './animations/repository-graph';
export type { RepositoryGraphProps } from './animations/repository-graph';

export { CrossRepoFlow, drawCrossRepoFlow } from './animations/cross-repo-flow';
export type { CrossRepoFlowProps } from './animations/cross-repo-flow';

export {
  CrossRepoShip,
  CROSS_REPO_SHIP_CYCLE,
} from './animations/cross-repo-ship';
export type { CrossRepoShipProps } from './animations/cross-repo-ship';

export {
  SessionMemory,
  drawSessionMemory,
  SESSION_MEMORY_CYCLE,
} from './animations/session-memory';
export type { SessionMemoryProps } from './animations/session-memory';

export {
  MemoryDistill,
  drawMemoryDistill,
  MEMORY_DISTILL_CYCLE,
} from './animations/memory-distill';
export type { MemoryDistillProps } from './animations/memory-distill';

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

export { HarnessSwapDiagram } from './animations/harness-swap-diagram';
export type { HarnessSwapDiagramProps } from './animations/harness-swap-diagram';

export {
  ProvisioningSetup,
  PROVISIONING_SETUP_CYCLE,
} from './animations/provisioning-setup';
export type { ProvisioningSetupProps } from './animations/provisioning-setup';

export { FeedbackLoop, FEEDBACK_LOOP_CYCLE } from './animations/feedback-loop';
export type { FeedbackLoopProps } from './animations/feedback-loop';

export {
  HarnessOptimizationLoop,
  HARNESS_OPTIMIZATION_LOOP_CYCLE,
} from './animations/harness-optimization-loop';
export type { HarnessOptimizationLoopProps } from './animations/harness-optimization-loop';

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

export {
  SessionDurability,
  SESSION_DURABILITY_CYCLE,
} from './animations/session-durability';
export type { SessionDurabilityProps } from './animations/session-durability';

export { PolicyGate, POLICY_GATE_CYCLE } from './animations/policy-gate';
export type { PolicyGateProps } from './animations/policy-gate';

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
