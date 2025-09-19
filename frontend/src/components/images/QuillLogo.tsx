import Image from "@components/images/Image";
import React from "react";
import quillLogo from "/quill-logo.png";

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
  return (
    <Image
      src={quillLogo}
      alt={alt}
      height={height}
      className={className}
      style={style}
    />
  );
}
