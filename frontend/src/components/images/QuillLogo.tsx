import Image from "@components/images/Image";
import detectStorybook from "@lib/urlUpdate";
import React from "react";

type Props = {
  alt?: string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
};

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
