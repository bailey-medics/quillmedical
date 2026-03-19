import PublicLayout from "@/components/public-layout/PublicLayout";
import { theme } from "@/theme";
import {
  Anchor,
  Container,
  MantineProvider,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import ReactDOM from "react-dom/client";

// Import the component from your app's shared code
import SearchField from "@/components/search/SearchFields";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Title order={1}>Storybook test</Title>
          <Text>
            This page is rendering a component imported from the app's code:
          </Text>
          <SearchField />
          <Anchor href="/">← Back home</Anchor>
        </Stack>
      </Container>
    </PublicLayout>
  </MantineProvider>,
);
