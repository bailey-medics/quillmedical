type Props = {
  /** National identifier value */
  nationalNumber: string;
  /** FHIR system URL to determine formatting and label */
  nationalNumberSystem?: string;
};

/**
 * Format NHS number in standard format: 123 456 7890
 */
function formatNHSNumber(number: string): string {
  // Remove any existing spaces or non-digits
  const digits = number.replace(/\D/g, "");

  // NHS numbers are 10 digits: format as 123 456 7890
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  }

  // Return as-is if not 10 digits
  return number;
}

/**
 * NationalNumber Component
 *
 * Displays a national health identifier.
 * For NHS numbers: shows "NHS 123 456 7890" format.
 * For other systems: shows the number as-is without any prefix or formatting.
 */
export default function NationalNumber({
  nationalNumber,
  nationalNumberSystem,
}: Props) {
  // If NHS system, format with spaces and add NHS prefix
  if (nationalNumberSystem?.includes("nhs.uk")) {
    const formattedNumber = formatNHSNumber(nationalNumber);
    return <>NHS {formattedNumber}</>;
  }

  // For all other systems, return number as-is (no prefix, no formatting)
  return <>{nationalNumber}</>;
}
