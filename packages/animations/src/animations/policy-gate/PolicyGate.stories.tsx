import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyGate, CYCLE } from './PolicyGate';

const meta = {
  title: 'Animations/PolicyGate',
  component: PolicyGate,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    seek: { control: { type: 'range', min: 0, max: CYCLE, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 820 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PolicyGate>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The full loop: the agent proposes actions, the hook checks each one. */
export const Default: Story = {};

/** Frozen on a denied action being pushed back for a re-plan. Drag `seek`. */
export const Seek: Story = {
  args: { seek: 130 },
};
