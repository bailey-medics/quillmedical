/**
 * Quill Logo Component
 *
 * Renders Quill Medical logo image with configurable height and styling.
 * Automatically detects Storybook context and adjusts image path accordingly.
 */

import Image from "@components/images/Image";
import detectStorybook from "@lib/urlUpdate";
import React from "react";

/**
 * QuillLogo Props
 */
type Props = {
  /** Alt text for accessibility (default: "Quill") */
  alt?: string;
  /** Logo height (default: 128px) */
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
  height = 128,
  className,
  style,
}: Props) {
  const src = detectStorybook("/quill-logo.png");

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
