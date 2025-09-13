import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Preview } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";

const preview: Preview = {
  decorators: [
    (Story) => (
      <MantineProvider defaultColorScheme="light">
        <MemoryRouter>
          <div style={{ padding: 0 }}>
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
