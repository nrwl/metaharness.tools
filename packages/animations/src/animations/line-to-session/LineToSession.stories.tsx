import type { Meta, StoryObj } from '@storybook/react-vite';
import { LineToSession } from './LineToSession';

const meta = {
  title: 'Animations/LineToSession',
  component: LineToSession,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div style={{ width: 860 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LineToSession>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One line of code, its sha, and the session that produced it. */
export const Default: Story = {};
