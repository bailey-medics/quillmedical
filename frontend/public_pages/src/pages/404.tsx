import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1>404</h1>
      <p>These are not the pages you are looking for</p>
    </main>
  </MantineProvider>
);
