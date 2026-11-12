/**
 * Quill Name Component
 *
 * Renders "Quill Medical" text logo image with configurable height.
 * Used in top navigation ribbon and headers. Under another brand's theme,
 * it shows that brand's wordmark instead.
 */

import Image from "@components/images/Image";
import publicAsset from "@lib/publicAsset";
import { useMantineTheme } from "@mantine/core";
import React from "react";

/** White for a dark background such as the ribbon, dark for a light one */
export type NameColour = "white" | "dark";

/**
 * QuillName Props
 */
type Props = {
  /** Alt text for accessibility (default: "Quill Medical", or the
   * brand's own) */
  alt?: string;
  /** Which version of the name (default: "white") */
  colour?: NameColour;
  /** Logo height in rem (default: 1.5) */
  height?: number | string;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
};

/**
 * Quill Name
 *
 * Displays "Quill Medical" text logo. Standard height is 1.5rem for
 * navigation bars.
 *
 * When the theme around it carries another brand's wordmark, it shows
 * that image instead, at the same height, so the ribbon around it does
 * not move. A brand with no dark wordmark shows its white one for
 * `colour="dark"` too.
 *
 * @param props - Component props
 * @returns Text logo image component
 */
export default function QuillName({
  alt,
  colour = "white",
  height = 2.1,
  className,
  style = { marginRight: "0.5rem" },
}: Props) {
  const { wordmark } = useMantineTheme().other;

  const quill = colour === "dark" ? "/quill-name.png" : "/quill-name-white.png";
  const brandSrc =
    colour === "dark" ? (wordmark?.darkSrc ?? wordmark?.src) : wordmark?.src;

  const src = publicAsset(brandSrc ?? quill);
  const brandAlt = wordmark?.alt ?? "Quill Medical";

  return (
    <Image
      src={src}
      alt={alt ?? brandAlt}
      height={height}
      className={className}
      style={style}
    />
  );
}
