import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1>Features</h1>
      <ul>
        <li>Clinician-first workflows. 22</li>
        <li>Git-backed history</li>
        <li>Argon2 password hashing</li>
      </ul>
      <p>
        <a href="/">← Back home</a>
      </p>
    </main>
  </MantineProvider>
);
