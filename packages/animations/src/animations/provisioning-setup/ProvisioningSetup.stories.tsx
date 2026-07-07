import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProvisioningSetup, CYCLE } from './ProvisioningSetup';

const meta = {
  title: 'Animations/ProvisioningSetup',
  component: ProvisioningSetup,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    seek: { control: { type: 'range', min: 0, max: CYCLE, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProvisioningSetup>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The full loop: type the task, transform, clone the repos, land ready. */
export const Default: Story = {};

/** Frozen mid-way through the provisioning clone. Drag `seek` to scrub. */
export const Seek: Story = {
  args: { seek: 200 },
};
