/* eslint-disable no-restricted-syntax */
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicNotFound from "@/components/layouts/PublicNotFound";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicNotFound />
    </PublicLayout>
  </PublicMantineProvider>,
);
