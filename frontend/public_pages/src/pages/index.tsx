import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1>Quill Medical</h1>
      <p>Digital notes that behave. Safety by design.</p>
      <p>
        <a href="/features.html">See features →</a>
      </p>
      <p>
        <a href="/app/">Open the app</a>
      </p>
    </main>
  </MantineProvider>
);
