import type { Meta, StoryObj } from '@storybook/react-vite';
import { MetaHarnessLayers } from './MetaHarnessLayers';

const meta = {
  title: 'Animations/MetaHarnessLayers',
  component: MetaHarnessLayers,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    paused: { control: 'boolean' },
    stage: {
      control: { type: 'inline-radio' },
      options: ['auto', 0, 1, 2],
    },
    variant: {
      control: { type: 'inline-radio' },
      options: ['full', 'simple'],
    },
    width: { control: { type: 'number' } },
    height: { control: { type: 'number' } },
  },
  args: {
    paused: false,
    stage: 'auto',
    variant: 'full',
  },
} satisfies Meta<typeof MetaHarnessLayers>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Full self-running build-up: LLM -> harness -> meta-harness, then loop.
 * Click the Sessions or Repositories chip once reified to open the
 * corresponding network in an in-context panel; Esc, clicking the chip again,
 * or clicking outside the panel closes it.
 */
export const Default: Story = {};

/**
 * Reduced variant for an earlier page section: just the layering (compact
 * empty harness rect + meta-harness with reifying chips), no LLM, no harness
 * chips, no interactivity. Runs on its own compressed cycle.
 */
export const Simple: Story = {
  args: { variant: 'simple' },
};

/** Stage 0 pinned: the bare LLM node, idle. */
export const StageLLM: Story = {
  args: { stage: 0 },
};

/** Stage 1 pinned: LLM + harness with feed pulses, settled. */
export const StageHarness: Story = {
  args: { stage: 1 },
};

/** Stage 2 pinned: full diagram, meta-harness chips reified. */
export const StageMetaHarness: Story = {
  args: { stage: 2 },
};

/** Frozen on a single frame. */
export const Paused: Story = {
  args: { paused: true },
};
