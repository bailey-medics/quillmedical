import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
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
              Quill Medical is a clinician-led software company building the
              tools that clinical teams actually need. We started because we
              believed healthcare technology could be better — more thoughtful,
              more aligned with how clinicians really work, and built on open
              standards that put patients and providers first.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Built by clinicians" c="white" />
            <PublicBodyText justify="centre">
              Our team brings genuine clinical experience to every line of code.
              We have trained, examined, referred, prescribed, and taught. We
              know the frustration of systems that slow you down when you need
              to move fast, and the quiet satisfaction of a tool that just works
              at the bedside.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              That clinical insight shapes every decision — from the data
              architecture (FHIR R4, OpenEHR) to the access model
              (competency-based, not role-based) to the deployment philosophy
              (modular, so you only run what you need).
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Our commitment" c="white" />
            <PublicBodyText justify="centre">
              We are committed to clinical safety (DCB 0129 certified), data
              sovereignty (UK/EU hosted on GCP European region), and open
              standards that prevent vendor lock-in. Your data remains yours,
              portable and interoperable.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Quill is what a clinical team builds when they refuse to settle.
              Every feature is carefully considered, clinically validated, and
              built to the standard that patients deserve and clinicians expect.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
