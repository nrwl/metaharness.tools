import type { Preview, Decorator } from '@storybook/react-vite';

// Site background. Applied via a decorator so the canvas sits on #0a0a0a
// regardless of the backgrounds addon API, matching the live site (bg-neutral-950).
const SITE_BG = '#0a0a0a';

const withDarkCanvas: Decorator = (Story) => (
  <div
    style={{
      background: SITE_BG,
      padding: '2rem',
      borderRadius: 8,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <Story />
  </div>
);

const preview: Preview = {
  decorators: [withDarkCanvas],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: SITE_BG },
        { name: 'light', value: '#ffffff' },
      ],
    },
  },
};

export default preview;
