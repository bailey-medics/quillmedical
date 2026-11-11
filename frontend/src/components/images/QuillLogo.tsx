/**
 * Quill Logo Component
 *
 * Renders Quill Medical logo image with configurable height and styling.
 * Automatically detects Storybook context and adjusts image path accordingly.
 * Under another brand's theme, it shows that brand's logo.
 */

import Image from "@components/images/Image";
import publicAsset from "@lib/publicAsset";
import { useComputedColorScheme, useMantineTheme } from "@mantine/core";
import React from "react";

/** Available logo colour variants */
type LogoColour = "auto" | "default" | "light-grey" | "white";

const logoFileMap: Record<Exclude<LogoColour, "auto">, string> = {
  default: "/quill-logo.png",
  "light-grey": "/quill-logo-light-grey.png",
  white: "/quill-logo-white.png",
};

type Props = {
  /** Alt text for accessibility (default: "Quill", or the brand's name) */
  alt?: string;
  /** Logo colour variant (default: "auto") */
  colour?: LogoColour;
  /** Logo height in rem (default: 8) */
  height?: number | string;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
};

/**
 * Quill Logo
 *
 * Displays Quill Medical logo image. Auto-detects Storybook environment
 * and adjusts image path to work correctly in both Storybook and app.
 *
 * When the theme around it carries another brand's logo, it shows that
 * instead, at the same height, and `colour` is ignored: a brand has one
 * logo file for light and dark. A brand whose logo would be lost on its
 * own colours draws it on a tile.
 *
 * @param props - Component props
 * @returns Logo image component
 */
export default function QuillLogo({
  alt,
  colour = "auto",
  height = 8,
  className,
  style,
}: Props) {
  const { other } = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");

  // Quill's theme carries no logo: its own are the files above
  const brandLogo = other.logo;
  const resolved: Exclude<LogoColour, "auto"> =
    colour === "auto" ? (colorScheme === "dark" ? "white" : "default") : colour;
  const src = publicAsset(brandLogo ?? logoFileMap[resolved]);
  const brandAlt =
    brandLogo !== undefined
      ? (other.wordmark?.alt ?? other.brand ?? "Logo")
      : "Quill";
  // The tile is read from the theme around the logo, like the logo
  // itself, so it shows wherever that theme is. The logo file's own
  // transparent margin is the tile's padding, so the height is kept.
  const tile = brandLogo !== undefined ? other.logoTile : undefined;
  const tiledStyle: React.CSSProperties | undefined =
    tile === undefined
      ? style
      : {
          backgroundColor: tile,
          borderRadius: "var(--mantine-radius-md)",
          ...style,
        };

  return (
    <Image
      src={src}
      alt={alt ?? brandAlt}
      height={height}
      className={className}
      style={tiledStyle}
    />
  );
}
