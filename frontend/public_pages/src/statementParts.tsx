/**
 * Building blocks for long public pages written as sections, such as the
 * accessibility statement. Kept out of the page entry file because a page
 * entry exports nothing, which fast refresh needs components to do.
 */

import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Anchor, Stack } from "@mantine/core";
import type { ReactNode } from "react";

/** One section of the statement: a heading and its paragraphs. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="sm">
      <PublicTitle title={title} size="md" ta="left" c="white" />
      {children}
    </Stack>
  );
}

/** A bulleted list, in body text. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <PublicBodyText>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </PublicBodyText>
  );
}

/** An inline link, underlined so it is not told apart by colour alone. */
export function Link({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Anchor href={href} c="inherit" underline="always">
      {children}
    </Anchor>
  );
}
