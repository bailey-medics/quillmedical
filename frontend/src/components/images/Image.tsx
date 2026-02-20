/**
 * Image Component Module
 *
 * Accessible image component with fallback support and decorative image
 * handling. Provides consistent image rendering with proper accessibility
 * attributes.
 */

// frontend/src/components/ui/Image.tsx
import React from "react";

/**
 * Image Props
 */
type Props = {
  /** Image source URL (imported or path) */
  src?: string;
  /** Alt text (required for accessibility, use "" for decorative) */
  alt: string;
  /** Image width */
  width?: number | string;
  /** Image height */
  height?: number | string;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Loading strategy (default: "eager") */
  loading?: "eager" | "lazy";
  /** Fallback image if src fails */
  fallback?: string;
};

/**
 * Image
 *
 * Renders image with accessibility support:
 * - If alt="" → treated as decorative (aria-hidden)
 * - If alt has text → proper accessibility labels
 * - Supports fallback images
 * - Configurable lazy loading
 *
 * @param props - Component props
 * @returns Accessible image element
 */
export default function Image({
  src,
  alt,
  width,
  height,
  className,
  style,
  loading = "eager",
  fallback,
}: Props) {
  const resolvedSrc = src || fallback || "";

  // Decorative image helper: if alt === "" treat as decorative (aria-hidden)
  const imgProps =
    alt === "" ? { "aria-hidden": true, role: "img", alt: "" } : { alt };

  // Convert numeric height/width to rem units in style
  const imgStyle = {
    ...style,
    ...(height !== undefined && {
      height: typeof height === "number" ? `${height}rem` : height,
    }),
    ...(width !== undefined && {
      width: typeof width === "number" ? `${width}rem` : width,
    }),
  };

  return (
    <img
      src={resolvedSrc}
      {...imgProps}
      loading={loading}
      className={className}
      style={imgStyle}
    />
  );
}
