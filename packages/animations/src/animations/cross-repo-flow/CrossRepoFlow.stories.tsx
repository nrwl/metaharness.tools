import type { Meta, StoryObj } from '@storybook/react-vite';
import { CrossRepoFlow } from './CrossRepoFlow';

const meta = {
  title: 'Animations/CrossRepoFlow',
  component: CrossRepoFlow,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    mode: {
      control: { type: 'inline-radio' },
      options: ['auto', 'before', 'after'],
    },
    paused: { control: 'boolean' },
    width: { control: { type: 'number' } },
    height: { control: { type: 'number' } },
  },
  args: {
    mode: 'auto',
    paused: false,
  },
} satisfies Meta<typeof CrossRepoFlow>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive switch, auto-cycling before<->after until you take over. */
export const Default: Story = {};

/** Pinned to the isolated, caged-agent "before" state. */
export const Before: Story = {
  args: { mode: 'before' },
};

/** Pinned to the connected, roaming-agent "after" state. */
export const After: Story = {
  args: { mode: 'after' },
};

/** Frozen on a single frame. */
export const Paused: Story = {
  args: { paused: true },
};
