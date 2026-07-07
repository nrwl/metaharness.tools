import type { Meta, StoryObj } from '@storybook/react-vite';
import { IsolatedSessions } from './IsolatedSessions';

const meta = {
  title: 'Animations/IsolatedSessions',
  component: IsolatedSessions,
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
} satisfies Meta<typeof IsolatedSessions>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Teammates' sessions come and go on their own machines, never linking up. */
export const Default: Story = {};

/** Frozen on a single frame. */
export const Paused: Story = {
  args: { paused: true },
};
