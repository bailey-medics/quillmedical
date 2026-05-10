import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Anchor, Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Contact us" />
            <PublicBodyText justify="centre">
              Whether you are a clinician interested in early access, an
              organisation exploring clinical software options, or just curious
              about what we are building — we would love to hear from you.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Get in touch" c="white" />
            <PublicBodyText justify="centre">
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
            </PublicBodyText>
            <PublicBodyText justify="centre">
              We aim to respond to all enquiries within two working days.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
