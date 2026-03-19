import ReactDOM from "react-dom/client";

import { theme } from "@/theme";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1>Quill Medical</h1>
      <p>Digital notes that behave. Safety by design.</p>
      <p>
        <a href="/app/">Open the app</a>
      </p>
      {/* <Hero ... /> */}
    </main>
  </MantineProvider>,
);
