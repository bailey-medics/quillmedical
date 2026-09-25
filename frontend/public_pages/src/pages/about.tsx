import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
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
            <PublicTitle title="About Quill Medical" />
            <PublicBodyText justify="centre">
              Quill Medical is a clinician-led software company building online
              learning and assessment for clinicians. We started because we
              believed clinical software could be better: more thoughtful, and
              more aligned with how clinicians really learn and work.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Built by clinicians" size="md" c="white" />
            <PublicBodyText justify="centre">
              Our team brings genuine clinical experience to every line of code.
              We have trained, examined and taught, and we know what a fair,
              trustworthy assessment looks like from both sides of the desk.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              The same team is building a{" "}
              <Anchor
                href="/clinical-records"
                c="secondary.5"
                underline="always"
              >
                clinical record
              </Anchor>{" "}
              on open standards, alongside the learning and assessment platform.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Our commitment" size="md" c="white" />
            <PublicBodyText justify="centre">
              We are committed to assessments that are fair to every candidate,
              to accessibility, and to keeping your data in the UK.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Quill is what a clinical team builds when they refuse to settle.
              Every feature is carefully considered and built to the standard
              clinicians expect.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
