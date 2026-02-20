/**
 * PageHeader Component
 *
 * Consistent page header component with title and optional description.
 * Provides standardized sizing and spacing across all pages.
 *
 * Features:
 * - Three size variants: sm, md, lg
 * - Responsive: lg size automatically becomes md on small screens
 * - Optional description text
 * - Consistent spacing and styling
 *
 * @module PageHeader
 */

import { Box, Text, Title } from "@mantine/core";
import classes from "./PageHeader.module.css";

/**
 * PageHeader Props
 */
export interface PageHeaderProps {
  /** Page title text */
  title: string;
  /** Optional description/subtitle text */
  description?: string;
  /** Size variant - defaults to lg */
  size?: "sm" | "md" | "lg";
  /** Bottom margin - defaults to "xl" */
  mb?: string | number;
}

/**
 * PageHeader Component
 *
 * Renders a consistent page header with title and optional description.
 * Large headers automatically scale down on smaller screens for better mobile experience.
 *
 * @param props - Component props
 * @returns Page header element
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Messages"
 *   description="View and manage all patient conversations"
 * />
 * ```
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Account Settings"
 *   size="md"
 * />
 * ```
 */
export default function PageHeader({
  title,
  description,
  size = "lg",
  mb = "xl",
}: PageHeaderProps) {
  // Map size to Title order
  const orderMap = {
    sm: 3,
    md: 2,
    lg: 1,
  } as const;

  const order = orderMap[size];

  return (
    <Box mb={mb}>
      <Title
        order={order}
        mb={description ? "xs" : undefined}
        className={
          size === "lg"
            ? classes.lgTitle
            : size === "md"
              ? classes.mdTitle
              : undefined
        }
      >
        {title}
      </Title>
      {description && (
        <Text c="dimmed" size="md">
          {description}
        </Text>
      )}
    </Box>
  );
}
