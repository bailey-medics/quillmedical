import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import Icon from "@/components/icons/Icon";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { IconStack2 } from "@tabler/icons-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <div style={{ color: "var(--mantine-color-secondary-5)" }}>
              <Icon icon={<IconStack2 />} size="xl" />
            </div>
            <PublicTitle title="Modular deployment" c="white" />
            <PublicBodyText justify="centre">
              Not every organisation needs every feature on day one. Quill is
              modular by design — deploy it as a full electronic patient record,
              or activate only the modules your team actually needs right now.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Grow at your own pace" c="white" />
            <PublicBodyText justify="centre">
              Runtime feature gating means you can enable new capabilities
              without redeploying. Start with clinical messaging and patient
              records, then add structured documentation, letters, or referrals
              when your workflows are ready.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Each module is independently useful but designed to work together.
              Enable clinical messaging alongside structured records and
              suddenly your messages carry clinical context. Add letters and
              your discharge summaries pre-populate from the record.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="No vendor lock-in" c="white" />
            <PublicBodyText justify="centre">
              Built on open standards (FHIR R4, OpenEHR) and open-source
              infrastructure (HAPI FHIR, EHRbase), Quill avoids the proprietary
              trap. Your data remains portable, your architecture remains
              transparent, and your organisation retains control.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Deploy on your own infrastructure or use our managed hosting on
              GCP&apos;s European region — the choice is yours, and switching is
              straightforward.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
