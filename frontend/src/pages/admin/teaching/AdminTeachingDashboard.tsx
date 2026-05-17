/**
 * AdminTeachingDashboard Page
 *
 * Landing page for admin teaching section. Shows action cards
 * linking to modules management and all delegates view.
 */

import { Container, SimpleGrid, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import ActionCard from "@/components/action-card/ActionCard";
import { IconStack2, IconUserCheck } from "@/components/icons/appIcons";

export default function AdminTeachingDashboard() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Teaching" />

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ActionCard
            icon={<IconStack2 />}
            title="Modules"
            subtitle="Manage question banks, sync status, and organisation settings for each teaching module."
            buttonLabel="View modules"
            buttonUrl="/admin/teaching/modules"
          />
          <ActionCard
            icon={<IconUserCheck />}
            title="All delegates"
            subtitle="View delegate progress, assessment results, and filter by trust or clinical lead."
            buttonLabel="View delegates"
            buttonUrl="/admin/teaching/all-delegates"
          />
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
