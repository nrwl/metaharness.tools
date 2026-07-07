import type { Meta, StoryObj } from '@storybook/react-vite';
import { CrossRepoShip, CYCLE } from './CrossRepoShip';

const meta = {
  title: 'Animations/CrossRepoShip',
  component: CrossRepoShip,
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
} satisfies Meta<typeof CrossRepoShip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Full loop: work + diffs, commit & push all repos, coordinated PRs open together. */
export const Default: Story = {};

/** Frozen once the PRs have opened. Drag `seek` to scrub. */
export const Seek: Story = {
  args: { seek: 430 },
};
