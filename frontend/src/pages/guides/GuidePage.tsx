/**
 * One guide.
 *
 * A guide that does not exist, or that is written for somebody above the
 * reader, is a 404, as every guard here answers. That hides nothing that
 * matters (see `useGuideTier`), and it keeps the page from offering
 * instructions for a screen the reader cannot open.
 *
 * Somebody who is not signed in reaches this page too, through
 * `GuideShell`, and is shown the guides marked `public` and a way to
 * sign in. Everything else is the same 404 to them.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import PageHeader from "@/components/page-header";
import { MarkdownView, TextLink } from "@/components/typography";
import { useAuth } from "@/auth/AuthContext";
import { guideBody } from "@/guides/content";
import { GUIDE_ASSETS_PATH } from "@/guides/registry";
import { useReadableGuide } from "@lib/guides/useGuideTier";

export function Component() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { state } = useAuth();
  const guide = useReadableGuide(slug);
  const body = guide ? guideBody(guide.slug) : undefined;

  if (!guide || body === undefined) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title={guide.title} />
      <MarkdownView
        source={body}
        imageBase={GUIDE_ASSETS_PATH}
        onLinkClick={(href) => {
          // A link to a page of Quill moves within the app, keeping what
          // is loaded. Anything else is left to the browser.
          if (href.startsWith("/")) void navigate(href);
          else window.location.assign(href);
        }}
      />
      {/* A signed-in reader has the menu. Anybody else has only this page,
          so it gives them the way on. */}
      {state.status === "unauthenticated" && (
        <TextLink standalone to="/login">
          Sign in to Quill
        </TextLink>
      )}
    </Stack>
  );
}
