import DarkBackground from "@/components/background/DarkBackground";
import HeroBackground from "@/components/background/HeroBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/page-header/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Anchor, Container, MantineProvider, Stack } from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <HeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Contact us" />
            <PublicText size="lg">
              Whether you are a clinician interested in early access, an
              organisation exploring clinical software options, or just curious
              about what we are building — we would love to hear from you.
            </PublicText>
          </Stack>
        </Container>
      </HeroBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Get in touch" c="white" />
            <PublicText size="lg">
              A contact form is coming soon. In the meantime, you can reach us
              at{" "}
              <Anchor
                href="mailto:info@quill-medical.com"
                c="inherit"
                underline="always"
              >
                info@quill-medical.com
              </Anchor>
              .
            </PublicText>
            <PublicText size="lg">
              We aim to respond to all enquiries within two working days.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
