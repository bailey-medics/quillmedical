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
            <PublicTitle title="External referrals made easy" c="white" />
            <PublicText size="lg">
              Referring a patient should not mean printing a letter, posting it,
              and hoping for the best. With Quill, a referral gives the
              receiving clinician immediate, structured access to the relevant
              parts of the patient record — securely and with full audit.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>

      <LightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="No faxes, no lost letters" c="white" />
            <PublicText size="lg">
              When you refer a patient, the receiving clinician sees exactly
              what they need: relevant history, current medications, recent
              investigations, and the reason for referral — all structured and
              immediately accessible.
            </PublicText>
            <PublicText size="lg">
              No more repeating the entire history at every handover. No more
              illegible faxes. No more letters lost in the post. The referral
              pathway becomes a seamless extension of the clinical record.
            </PublicText>
          </Stack>
        </Container>
      </LightBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Secure and auditable" c="white" />
            <PublicText size="lg">
              Every referral is logged with full governance metadata — who
              referred, who received, what was shared, and when. Access is
              time-limited and scoped to the clinical context of the referral.
            </PublicText>
            <PublicText size="lg">
              Cross-organisation referrals respect both sending and receiving
              governance policies. CBAC ensures the receiving clinician has
              appropriate competencies to view the shared data, and the sending
              organisation retains visibility over what was accessed.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
