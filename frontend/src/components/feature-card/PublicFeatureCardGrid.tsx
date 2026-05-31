/**
 * PublicFeatureCardGrid Component
 *
 * Responsive grid layout for PublicFeatureCard components.
 * Renders 1 column on mobile, 2 on tablet, and 3 on desktop.
 */

import { SimpleGrid } from "@mantine/core";
import type { ReactNode } from "react";

export interface PublicFeatureCardGridProps {
  children: ReactNode;
}

export default function PublicFeatureCardGrid({
  children,
}: PublicFeatureCardGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing={11}>
      {children}
    </SimpleGrid>
  );
}
