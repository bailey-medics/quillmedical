import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { MemoryRouter } from "react-router-dom";
import type { Preview } from "storybook";

const preview: Preview = {
  decorators: [
    (Story) => (
      <MantineProvider defaultColorScheme="light">
        <MemoryRouter>
          <div style={{ padding: 16 }}>
            <Story />
          </div>
        </MemoryRouter>
      </MantineProvider>
    ),
  ],
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: { expanded: true },
    layout: "fullscreen",
  },
};

export default preview;
