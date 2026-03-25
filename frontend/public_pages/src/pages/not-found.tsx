/* eslint-disable no-restricted-syntax */
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicNotFound from "@/components/layouts/PublicNotFound";
import { theme } from "@/theme";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <PublicNotFound />
    </PublicLayout>
  </MantineProvider>,
);
