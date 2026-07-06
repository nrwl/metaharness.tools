// Public entry point. The site imports animation components from here, e.g.
//   import { Template } from '@metaharness/animations';
//
// Add a re-export line per animation as they are built.
export { Template } from './animations/_template';
export type { TemplateProps } from './animations/_template';

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
