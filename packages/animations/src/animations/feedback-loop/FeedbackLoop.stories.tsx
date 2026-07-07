import type { Meta, StoryObj } from '@storybook/react-vite';
import { FeedbackLoop, CYCLE } from './FeedbackLoop';

const meta = {
  title: 'Animations/FeedbackLoop',
  component: FeedbackLoop,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    seek: { control: { type: 'range', min: 0, max: CYCLE, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 760 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FeedbackLoop>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The goal loop: work → check → back to work, then break out to "Loop ends". */
export const Default: Story = {};

/** Frozen at the winning check. Drag `seek` to scrub. */
export const Seek: Story = {
  args: { seek: CYCLE - 40 },
};
