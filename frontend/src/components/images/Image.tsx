// frontend/src/components/ui/Image.tsx
import React from "react";

type Props = {
  src?: string; // imported URL or path
  alt: string; // required for accessibility
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "eager" | "lazy";
  fallback?: string;
};

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
  const imgProps = alt === "" ? { "aria-hidden": true, role: "img", alt: "" } : { alt };

  return (
    <img
      src={resolvedSrc}
      {...imgProps}
      width={width}
      height={height}
      loading={loading}
      className={className}
      style={style}
    />
  );
}
