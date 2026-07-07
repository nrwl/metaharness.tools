import type { Meta, StoryObj } from '@storybook/react-vite';
import { MultiRepoCubes } from './MultiRepoCubes';

const meta = {
  title: 'Animations/MultiRepoCubes',
  component: MultiRepoCubes,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    paused: { control: 'boolean' },
  },
  args: {
    paused: false,
  },
} satisfies Meta<typeof MultiRepoCubes>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Paused: Story = {
  args: { paused: true },
};
