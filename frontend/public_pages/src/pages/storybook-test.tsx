import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import ReactDOM from "react-dom/client";

// Import the component from your app’s shared code
import SearchField from "@/components/search/SearchFields";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1>Storybook Test</h1>
      <p>This page is rendering a component imported from the app’s code:</p>
      <SearchField />
      <p>
        <a href="/">← Back home</a>
      </p>
    </main>
  </MantineProvider>,
);
