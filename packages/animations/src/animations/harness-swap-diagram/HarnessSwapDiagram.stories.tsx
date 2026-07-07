import type { Meta, StoryObj } from '@storybook/react-vite';
import { HarnessSwapDiagram } from './HarnessSwapDiagram';

const meta = {
  title: 'Animations/HarnessSwapDiagram',
  component: HarnessSwapDiagram,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
} satisfies Meta<typeof HarnessSwapDiagram>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
