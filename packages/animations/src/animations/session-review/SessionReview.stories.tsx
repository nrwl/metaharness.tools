import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionReview } from './SessionReview';

const meta = {
  title: 'Animations/SessionReview',
  component: SessionReview,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div style={{ width: 860 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionReview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The diff, and the options the session shows it beat. */
export const Default: Story = {};
