/**
 * LegalNotice Component
 *
 * The sentence shown above the submit button on a form that creates an
 * account, linking to the terms of service and the privacy policy.
 *
 * It is a notice, not a question: there is no box to tick. The privacy
 * policy only has to be given at the moment the data is collected, and
 * the terms are accepted by carrying on past a clear sentence.
 */

import { BodyText, ExternalTextLink } from "@components/typography";
import {
  PRIVACY_POLICY_LABEL,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_LABEL,
  TERMS_OF_SERVICE_URL,
} from "@lib/legal/links";

/**
 * Renders the legal sentence with both policies linked.
 *
 * @returns One paragraph of body text
 */
export default function LegalNotice() {
  return (
    <BodyText>
      By creating an account you agree to our{" "}
      <ExternalTextLink href={TERMS_OF_SERVICE_URL}>
        {TERMS_OF_SERVICE_LABEL}
      </ExternalTextLink>{" "}
      and have read our{" "}
      <ExternalTextLink href={PRIVACY_POLICY_URL}>
        {PRIVACY_POLICY_LABEL}
      </ExternalTextLink>
      .
    </BodyText>
  );
}
