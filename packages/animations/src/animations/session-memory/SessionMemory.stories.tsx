import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionMemory } from './SessionMemory';

const meta = {
  title: 'Animations/SessionMemory',
  component: SessionMemory,
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
} satisfies Meta<typeof SessionMemory>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive switch, auto-cycling before<->after until you take over. */
export const Default: Story = {};

/** Pinned to the "before" state: sessions build, dissolve, are forgotten. */
export const Before: Story = {
  args: { mode: 'before' },
};

/** Pinned to the "after" state: sessions dock into a persistent memory band. */
export const After: Story = {
  args: { mode: 'after' },
};

/** Frozen on a single frame. */
export const Paused: Story = {
  args: { paused: true },
};
