/**
 * No Access Layout Component
 *
 * Friendly fallback page shown when an authenticated user lacks access
 * to a feature (e.g. teaching). Displays a welcoming message instead
 * of a confusing 404, with guidance to contact their administrator.
 */

import { Container, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconShieldCheck } from "@/components/icons/appIcons";

interface NoAccessLayoutProps {
  /** Name of the feature the user lacks access to */
  feature: string;
}

/**
 * No Access Layout
 *
 * Renders a centered message explaining the user doesn't have access
 * yet, with instructions to contact their organisation administrator.
 *
 * @returns No access information page layout
 */
export default function NoAccessLayout({ feature }: NoAccessLayoutProps) {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Welcome to Quill" />
        <StateMessage
          icon={<IconShieldCheck />}
          title="No access"
          description={
            <>
              Your account does not have access to the{" "}
              <span style={{ fontWeight: 900 }}>{feature}</span> feature. If you
              need access to this feature, please email{" "}
              <a
                href="mailto:info@quill-medical.com"
                style={{ color: "white" }}
              >
                info@quill-medical.com
              </a>{" "}
              for assistance.
            </>
          }
        />
      </Stack>
    </Container>
  );
}
