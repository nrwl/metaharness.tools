import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionDurability } from './SessionDurability';
import { CYCLE } from './kernel';

const meta = {
  title: 'Animations/SessionDurability',
  component: SessionDurability,
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
} satisfies Meta<typeof SessionDurability>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Full loop: parked dots expand into sessions, collect into the store, then one resumes. */
export const Default: Story = {};

/** Frozen mid-collection. Drag `seek` to scrub the whole timeline. */
export const Seek: Story = {
  args: { seek: 120 },
};
