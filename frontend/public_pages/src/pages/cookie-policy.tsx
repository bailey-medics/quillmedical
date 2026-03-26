import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Container, MantineProvider, Stack } from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Cookie policy" />
            <PublicText size="lg">
              This page will outline how Quill Medical uses cookies and similar
              technologies on our website.
            </PublicText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Further details" c="white" />
            <PublicText size="lg">
              Our complete cookie policy is currently being finalised. Please
              check back soon or contact us if you have any questions in the
              meantime.
            </PublicText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
