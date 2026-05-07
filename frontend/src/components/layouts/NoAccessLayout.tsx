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

/**
 * No Access Layout
 *
 * Renders a centered message explaining the user doesn't have access
 * yet, with instructions to contact their organisation administrator.
 *
 * @returns No access information page layout
 */
export default function NoAccessLayout() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Welcome to Quill" />
        <StateMessage
          icon={<IconShieldCheck />}
          title="No access yet"
          description={
            <>
              Your account does not have access to this feature yet. Please
              email{" "}
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
