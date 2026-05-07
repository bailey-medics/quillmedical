/**
 * No Access Layout Component
 *
 * Friendly fallback page shown when an authenticated user lacks access
 * to a feature (e.g. teaching). Displays a welcoming message instead
 * of a confusing 404, with guidance to contact their administrator.
 */

import { Center, Container, Stack } from "@mantine/core";
import { Heading, BodyText } from "@/components/typography";
import Icon from "@/components/icons/Icon";
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
      <Center mih="60vh">
        <Stack align="center" gap="lg">
          <Icon icon={<IconShieldCheck />} size="xl" colour="gray.5" />
          <Heading>Welcome to Quill</Heading>
          <BodyText c="gray.5" ta="center">
            Your account doesn't have access to this feature yet. Please contact
            your organisation administrator for assistance.
          </BodyText>
        </Stack>
      </Center>
    </Container>
  );
}
