/**
 * No Access Layout Component
 *
 * Friendly fallback page shown when an authenticated user lacks access
 * to a feature (e.g. teaching). Displays a welcoming message instead
 * of a confusing 404, with guidance to contact their administrator.
 */

import { Center, Container, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import StateMessage from "@/components/message-cards/StateMessage";

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
        <Center mih="50vh">
          <StateMessage type="no-access" />
        </Center>
      </Stack>
    </Container>
  );
}
