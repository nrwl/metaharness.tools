import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryDistill } from './MemoryDistill';

const meta = {
  title: 'Animations/MemoryDistill',
  component: MemoryDistill,
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
} satisfies Meta<typeof MemoryDistill>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Sessions orbit and are distilled into the glowing memory blurb, on a loop. */
export const Default: Story = {};

/** Frozen on a single frame (mid-distill). */
export const Paused: Story = {
  args: { paused: true },
};
