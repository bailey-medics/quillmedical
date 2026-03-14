import { Image, Skeleton, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

export interface DocumentThumbnailProps {
  src: string;
  alt: string;
  loading?: boolean;
}

export function DocumentThumbnail({
  src,
  alt,
  loading = false,
}: DocumentThumbnailProps) {
  const theme = useMantineTheme();
  const isSmall = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const width = isSmall ? 50 : 100;
  const height = Math.round(width * 1.4);

  if (loading) {
    return <Skeleton width={width} height={height} radius="sm" />;
  }

  return <Image src={src} alt={alt} w={width} fit="contain" radius="sm" />;
}
