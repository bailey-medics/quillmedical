/**
 * Quill Logo Component
 *
 * Renders Quill Medical logo image with configurable height and styling.
 * Automatically detects Storybook context and adjusts image path accordingly.
 */

import Image from "@components/images/Image";
import detectStorybook from "@lib/urlUpdate";
import React from "react";

/** Available logo colour variants */
type LogoColour = "default" | "light-grey" | "white";

const logoFileMap: Record<LogoColour, string> = {
  default: "/quill-logo.png",
  "light-grey": "/quill-logo-light-grey.png",
  white: "/quill-logo-white.png",
};

/**
 * QuillLogo Props
 */
type Props = {
  /** Alt text for accessibility (default: "Quill") */
  alt?: string;
  /** Logo colour variant (default: "default") */
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
 * @param props - Component props
 * @returns Logo image component
 */
export default function QuillLogo({
  alt = "Quill",
  colour = "default",
  height = 8,
  className,
  style,
}: Props) {
  const src = detectStorybook(logoFileMap[colour]);

  return (
    <Image
      src={src}
      alt={alt}
      height={height}
      className={className}
      style={style}
    />
  );
}
