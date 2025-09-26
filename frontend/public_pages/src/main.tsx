import ReactDOM from "react-dom/client";

// If your shared components rely on Mantine, keep these:
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

// Example: reuse an app component via "@/components/*" (works if alias set)
/// import { Hero } from "@/components/Hero";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
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
