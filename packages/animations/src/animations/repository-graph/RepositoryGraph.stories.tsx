import type { Meta, StoryObj } from '@storybook/react-vite';
import { RepositoryGraph } from './RepositoryGraph';

const meta = {
  title: 'Animations/RepositoryGraph',
  component: RepositoryGraph,
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
} satisfies Meta<typeof RepositoryGraph>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Center-out reveal of the repo cloud while the camera zooms out to fit. */
export const Default: Story = {};

/** Frozen on a single frame. */
export const Paused: Story = {
  args: { paused: true },
};
