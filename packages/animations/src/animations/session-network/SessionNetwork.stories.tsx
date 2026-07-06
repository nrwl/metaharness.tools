import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionNetwork } from './SessionNetwork';

const meta = {
  title: 'Animations/SessionNetwork',
  component: SessionNetwork,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    paused: { control: 'boolean' },
    width: { control: { type: 'number' } },
    height: { control: { type: 'number' } },
  },
  args: {
    paused: false,
  },
} satisfies Meta<typeof SessionNetwork>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Sessions build at a focal spot, attach to repos, then dock as memories. */
export const Default: Story = {};

/** Frozen on a single frame. */
export const Paused: Story = {
  args: { paused: true },
};
