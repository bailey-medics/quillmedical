import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import Icon from "@/components/icons/Icon";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { colours } from "@/styles/colours";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { IconPhoneRinging } from "@tabler/icons-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <div style={{ color: colours.amber }}>
              <Icon icon={<IconPhoneRinging />} size="xl" />
            </div>
            <PublicTitle title="External referrals made easy" c="white" />
            <PublicText size="lg">
              Referring a patient should not mean printing a letter, posting it,
              and hoping for the best. With Quill, a referral gives the
              receiving clinician immediate, structured access to the relevant
              parts of the patient record — securely and with full audit.
            </PublicText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
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
      </PublicLightBackground>

      <PublicDarkBackground>
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
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
