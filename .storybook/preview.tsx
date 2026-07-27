import type { Preview } from '@storybook/react-vite'
// Load Tailwind + our design tokens so stories match the real app.
import '../src/index.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        surface: { name: 'surface', value: '#0f1115' },
        panel: { name: 'panel', value: '#171717' },
      },
    },
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
  initialGlobals: {
    backgrounds: { value: 'surface' },
  },
};

export default preview;