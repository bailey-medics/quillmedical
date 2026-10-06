/**
 * One guide.
 *
 * A guide that does not exist, or that is written for somebody above the
 * reader, is a 404, as every guard here answers. That hides nothing that
 * matters (see `useGuideTier`), and it keeps the page from offering
 * instructions for a screen the reader cannot open.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import PageHeader from "@/components/page-header";
import { MarkdownView } from "@/components/typography";
import { guideBody } from "@/guides/content";
import { useVisibleGuides } from "@lib/guides/useGuideTier";

export function Component() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const guide = useVisibleGuides().find((item) => item.slug === slug);
  const body = guide ? guideBody(guide.slug) : undefined;

  if (!guide || body === undefined) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title={guide.title} />
      <MarkdownView
        source={body}
        onLinkClick={(href) => {
          // A link to a page of Quill moves within the app, keeping what
          // is loaded. Anything else is left to the browser.
          if (href.startsWith("/")) void navigate(href);
          else window.location.assign(href);
        }}
      />
    </Stack>
  );
}
