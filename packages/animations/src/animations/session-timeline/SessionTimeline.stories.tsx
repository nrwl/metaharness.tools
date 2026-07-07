import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionTimeline } from './SessionTimeline';

const meta = {
  title: 'Animations/SessionTimeline',
  component: SessionTimeline,
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
} satisfies Meta<typeof SessionTimeline>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Sessions pop in, reorganize into a date timeline, then one is selected. */
export const Default: Story = {};

/** Frozen on a single frame. */
export const Paused: Story = {
  args: { paused: true },
};
