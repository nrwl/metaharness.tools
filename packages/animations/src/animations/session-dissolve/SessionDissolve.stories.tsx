import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionDissolve } from './SessionDissolve';

const meta = {
  title: 'Animations/SessionDissolve',
  component: SessionDissolve,
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
} satisfies Meta<typeof SessionDissolve>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Looping single-player amnesia: build context, connect, dissolve, repeat. */
export const Default: Story = {};

/** Frozen on a single frame. */
export const Paused: Story = {
  args: { paused: true },
};
