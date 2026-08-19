import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionDurability } from './SessionDurability';
import { CAPTURE_CYCLE, RESUME_CYCLE } from './kernel';

const meta = {
  title: 'Animations/SessionDurability',
  component: SessionDurability,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    seek: { control: { type: 'range', min: 0, max: RESUME_CYCLE, step: 1 } },
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

/** Resume loop: opens on an indexed store wired to three machines, then resumes one. */
export const Default: Story = {};

/** Frozen mid-resume. Drag `seek` to scrub the resume timeline (0..RESUME_CYCLE). */
export const Seek: Story = {
  args: { seek: 120 },
};

/** Capture half only: sessions collect into the store, no slide-aside and no resume. */
export const CaptureOnly: Story = {
  args: { captureOnly: true },
};

/** Frozen inside the capture-only loop (0..CAPTURE_CYCLE). */
export const CaptureOnlySeek: Story = {
  args: { captureOnly: true, seek: Math.round(CAPTURE_CYCLE * 0.7) },
};
