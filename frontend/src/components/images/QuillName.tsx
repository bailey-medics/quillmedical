import Image from "@components/images/Image";
import React from "react";
import quillName from "/quill-name.png";

type Props = {
  alt?: string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
};

export default function QuillName({
  alt = "Quill Medical",
  height = 24,
  className,
  style = { marginRight: 8 },
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
