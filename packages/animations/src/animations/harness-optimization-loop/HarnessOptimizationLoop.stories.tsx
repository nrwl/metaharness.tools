import type { Meta, StoryObj } from '@storybook/react-vite';
import { HarnessOptimizationLoop, CYCLE } from './HarnessOptimizationLoop';

const meta = {
  title: 'Animations/HarnessOptimizationLoop',
  component: HarnessOptimizationLoop,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    seek: { control: { type: 'range', min: 0, max: CYCLE, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 860 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HarnessOptimizationLoop>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Three search laps (v2..v4), then the loop settles on the best variant. */
export const Default: Story = {};

/** Frozen on the end hold. Drag `seek` to scrub. */
export const Seek: Story = {
  args: { seek: CYCLE - 40 },
};
