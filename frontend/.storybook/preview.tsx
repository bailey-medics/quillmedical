import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Preview } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/auth/AuthContext";

const decorators = [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Story: any) => (
    <AuthProvider>
      <MantineProvider defaultColorScheme="light">
        <MemoryRouter>
          <div style={{ padding: 0 }}>{Story()}</div>
        </MemoryRouter>
      </MantineProvider>
    </AuthProvider>
  ),
];

const preview: Preview = {
  decorators,
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: { expanded: true },
    layout: "fullscreen",
  },
};

export default preview;
