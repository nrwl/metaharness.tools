import { addons } from 'storybook/manager-api';
import { themes } from 'storybook/theming';

// Dark Storybook UI to match the site.
addons.setConfig({
  theme: themes.dark,
});
