import DarkBackground from "@/components/background/DarkBackground";
import LightBackground from "@/components/background/LightBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/page-header/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Container, MantineProvider, Stack } from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Modular deployment" c="white" />
            <PublicText size="lg">
              Not every organisation needs every feature on day one. Quill is
              modular by design — deploy it as a full electronic patient record,
              or activate only the modules your team actually needs right now.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>

      <LightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Grow at your own pace" c="white" />
            <PublicText size="lg">
              Runtime feature gating means you can enable new capabilities
              without redeploying. Start with clinical messaging and patient
              records, then add structured documentation, letters, or referrals
              when your workflows are ready.
            </PublicText>
            <PublicText size="lg">
              Each module is independently useful but designed to work together.
              Enable clinical messaging alongside structured records and
              suddenly your messages carry clinical context. Add letters and
              your discharge summaries pre-populate from the record.
            </PublicText>
          </Stack>
        </Container>
      </LightBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="No vendor lock-in" c="white" />
            <PublicText size="lg">
              Built on open standards (FHIR R4, OpenEHR) and open-source
              infrastructure (HAPI FHIR, EHRbase), Quill avoids the proprietary
              trap. Your data remains portable, your architecture remains
              transparent, and your organisation retains control.
            </PublicText>
            <PublicText size="lg">
              Deploy on your own infrastructure or use our managed hosting on
              GCP&apos;s European region — the choice is yours, and switching is
              straightforward.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
