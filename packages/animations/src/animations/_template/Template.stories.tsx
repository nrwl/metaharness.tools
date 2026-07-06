import type { Meta, StoryObj } from '@storybook/react-vite';
import { Template } from './Template';

const meta = {
  title: 'Animations/Template',
  component: Template,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    paused: { control: 'boolean' },
  },
  args: {
    paused: false,
  },
} satisfies Meta<typeof Template>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Paused: Story = {
  args: { paused: true },
};
