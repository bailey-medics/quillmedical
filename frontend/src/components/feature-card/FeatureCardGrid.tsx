import { SimpleGrid } from "@mantine/core";
import type { ReactNode } from "react";

export interface FeatureCardGridProps {
  children: ReactNode;
}

export default function FeatureCardGrid({ children }: FeatureCardGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing={3}>
      {children}
    </SimpleGrid>
  );
}
