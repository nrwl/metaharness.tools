import { useLayoutEffect } from 'react';
import type { Preview, Decorator } from '@storybook/react-vite';

const SITE_BG = {
  dark: '#0a0a0a',
  light: '#ffffff',
} as const;

const withThemedCanvas: Decorator = (Story, context) => {
  const theme = context.globals.theme === 'light' ? 'light' : 'dark';

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div
      style={{
        background: SITE_BG[theme],
        padding: '2rem',
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withThemedCanvas],
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Site theme',
      defaultValue: 'dark',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: SITE_BG.dark },
        { name: 'light', value: SITE_BG.light },
      ],
    },
  },
};

export default preview;
