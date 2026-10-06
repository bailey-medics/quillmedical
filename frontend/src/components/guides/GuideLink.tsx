/**
 * GuideLink
 *
 * The link from a page to the guide that explains it: "Guide: Add a
 * delegate by hand". Somebody stuck looks at the page they are on before
 * they look at the menu, so this matters more than the Guides entry there.
 *
 * It draws the link only when the guide is one the signed-in reader is
 * shown, and nothing otherwise, so a page never offers a guide that would
 * answer with a 404.
 *
 * It takes a slug from the registry and nothing else, so a link to a
 * guide that has been removed fails the typecheck. See
 * `docs/docs/plans/2026-10-05-in-app-guides-plan.md`.
 */

import { Group } from "@mantine/core";
import { TextLink } from "@/components/typography";
import { guidePath, type GuideSlug } from "@/guides/registry";
import { useVisibleGuides } from "@lib/guides/useGuideTier";

interface GuideLinkProps {
  /** The guide to link to, by its slug in the registry */
  slug: GuideSlug;
}

/**
 * A right-aligned link to one guide, named by the guide's own title.
 *
 * @param props - Component props
 * @returns The link, on a line of its own, or nothing
 */
export default function GuideLink({ slug }: GuideLinkProps) {
  const guide = useVisibleGuides().find((shown) => shown.slug === slug);
  if (!guide) return null;

  return (
    <Group justify="flex-end">
      <TextLink standalone to={guidePath(slug)}>
        Guide: {guide.title}
      </TextLink>
    </Group>
  );
}
