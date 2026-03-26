import { SimpleGrid } from "@mantine/core";
import type { ReactNode } from "react";

export interface PublicFeatureCardGridProps {
  children: ReactNode;
}

export default function PublicFeatureCardGrid({
  children,
}: PublicFeatureCardGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing={3}>
      {children}
    </SimpleGrid>
  );
}
