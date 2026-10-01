/**
 * EoEETA Logo Component
 *
 * Renders the East of England Endoscopy Training Academy logo on a white
 * panel. The logo is dark lettering on a transparent background, so on the
 * navy public pages it is unreadable without a light surface behind it.
 */

import BaseCard from "@components/base-card/BaseCard";
import Image from "@components/images/Image";
import publicAsset from "@lib/publicAsset";

/** The same file the branded emails use, so there is one copy to replace. */
const LOGO_PATH = "/email/partners/eoeeta.png";

type Props = {
  /** Alt text for accessibility (default: the academy's full name) */
  alt?: string;
  /** Logo height in rem (default: 6) */
  height?: number | string;
};

/**
 * EoEETA Logo
 *
 * Displays the partner logo inside a white card, so it reads the same on
 * every public background.
 *
 * @param props - Component props
 * @returns Logo image on a white panel
 */
export default function EoeetaLogo({
  alt = "East of England Endoscopy Training Academy",
  height = 6,
}: Props) {
  return (
    <BaseCard bg="white">
      <Image src={publicAsset(LOGO_PATH)} alt={alt} height={height} />
    </BaseCard>
  );
}
