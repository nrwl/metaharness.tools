import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryCorrection } from './MemoryCorrection';

const meta = {
  title: 'Animations/MemoryCorrection',
  component: MemoryCorrection,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 620 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MemoryCorrection>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Static transcript: a confident P0, then the session that overturns it. */
export const Default: Story = {};
