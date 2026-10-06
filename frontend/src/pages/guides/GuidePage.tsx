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
 * A signed-in guide's pictures come through the API, and the browser asks
 * for a picture as an image, which gets none of the API client's renewing
 * of a session whose fifteen-minute cookie has run out. Somebody who sat
 * on a page and then opened a guide saw each picture's description in a
 * box. So the page makes one call through the client first, which renews
 * the session if it needs it, and draws the guide once that has answered.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import PageHeader from "@/components/page-header";
import { MarkdownView, TextLink } from "@/components/typography";
import { useAuth } from "@/auth/AuthContext";
import { guideBody } from "@/guides/content";
import { GUIDE_PRIVATE_ASSETS_PATH, guideImageBase } from "@/guides/registry";
import { api } from "@/lib/api";
import { useReadableGuide } from "@lib/guides/useGuideTier";

/**
 * Whether the session has been renewed for this guide, where its pictures
 * need one.
 *
 * True straight away for a guide whose pictures are public. Otherwise it
 * asks `/auth/me` through the API client, once for each guide opened, and
 * is true when that has answered. A failure counts as an answer: the
 * guide's words are still worth reading, and the client has already sent
 * somebody whose session is over to sign in.
 *
 * @param slug - The guide being read, if there is one
 * @param needed - Whether its pictures come through the API
 * @returns Whether the guide may be drawn
 */
function useRenewedSession(slug: string | undefined, needed: boolean): boolean {
  const [renewedFor, setRenewedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!needed || slug === undefined) return;
    let current = true;
    api
      .get("/auth/me")
      .catch(() => undefined)
      .finally(() => {
        if (current) setRenewedFor(slug);
      });
    return () => {
      current = false;
    };
  }, [slug, needed]);

  return !needed || renewedFor === slug;
}

export function Component() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { state } = useAuth();
  const guide = useReadableGuide(slug);
  const body = guide ? guideBody(guide.slug) : undefined;
  const imageBase = guide ? guideImageBase(guide) : undefined;
  const mayDraw = useRenewedSession(
    guide?.slug,
    imageBase === GUIDE_PRIVATE_ASSETS_PATH,
  );

  if (!guide || body === undefined || imageBase === undefined) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title={guide.title} />
      {mayDraw && (
        <MarkdownView
          source={body}
          imageBase={imageBase}
          onLinkClick={(href) => {
            // A link to a page of Quill moves within the app, keeping what
            // is loaded. Anything else is left to the browser.
            if (href.startsWith("/")) void navigate(href);
            else window.location.assign(href);
          }}
        />
      )}
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
