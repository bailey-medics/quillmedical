/**
 * Quill Name Component
 *
 * Renders "Quill Medical" text logo image with configurable height.
 * Used in top navigation ribbon and headers.
 */

import Image from "@components/images/Image";
import React from "react";
import quillName from "/quill-name.png";

/**
 * QuillName Props
 */
type Props = {
  /** Alt text for accessibility (default: "Quill Medical") */
  alt?: string;
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
 * @param props - Component props
 * @returns Text logo image component
 */
export default function QuillName({
  alt = "Quill Medical",
  height = 1.5,
  className,
  style = { marginRight: "0.5rem" },
}: Props) {
  return (
    <Image
      src={quillName}
      alt={alt}
      height={height}
      className={className}
      style={style}
    />
  );
}
