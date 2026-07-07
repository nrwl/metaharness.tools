import type { Meta, StoryObj } from '@storybook/react-vite';
import { SingleRepoCube } from './SingleRepoCube';

const meta = {
  title: 'Animations/SingleRepoCube',
  component: SingleRepoCube,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    paused: { control: 'boolean' },
  },
  args: {
    paused: false,
  },
} satisfies Meta<typeof SingleRepoCube>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Paused: Story = {
  args: { paused: true },
};
