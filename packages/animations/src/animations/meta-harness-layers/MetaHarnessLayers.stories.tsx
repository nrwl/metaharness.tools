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
    width: { control: { type: 'number' } },
    height: { control: { type: 'number' } },
  },
  args: {
    paused: false,
    stage: 'auto',
  },
} satisfies Meta<typeof MetaHarnessLayers>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Full self-running build-up: LLM -> harness -> meta-harness, then loop. */
export const Default: Story = {};

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
