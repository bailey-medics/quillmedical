/**
 * Unsubscribe Component
 *
 * The card somebody reaches from the link in a newsletter. They may be
 * signed out, and may never have signed in on this device, so it asks
 * for nothing: the link says whose preference this is.
 *
 * It shows whether news is on and lets them change it either way, with
 * the same switch Settings has. The page owns the requests and passes
 * the state in, so each state can be shown on its own.
 */

import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@components/base-card/BaseCard";
import SolidSwitch from "@components/form/SolidSwitch";
import { IconAlertCircle, IconWifiOff } from "@components/icons/appIcons";
import { QuillLogo } from "@components/images";
import { StateMessage } from "@components/message-cards";
import { BodyText, Heading } from "@components/typography";

/**
 * Where reading the link has got to: still asking, read, refused as not
 * a real link, or not answered at all.
 */
export type UnsubscribeStatus = "loading" | "ready" | "invalid" | "unavailable";

export interface UnsubscribeProps {
  /** Where reading the link has got to */
  status: UnsubscribeStatus;
  /** The address the link is for, with most of it hidden */
  email?: string;
  /** Whether they are sent news and updates */
  wantsNews?: boolean;
  /** A change is being saved */
  saving?: boolean;
  /** They have changed the answer on this visit, and it was saved */
  saved?: boolean;
  /** Why the last change was not saved */
  error?: string;
  /** Called with the new answer when the switch is changed */
  onChange?: (wantsNews: boolean) => void;
}

const SWITCH_LABEL = "News and updates by email";

export default function Unsubscribe({
  status,
  email,
  wantsNews = false,
  saving = false,
  saved = false,
  error,
  onChange,
}: UnsubscribeProps) {
  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <BaseCard maw={380} mx="auto" mt="xl">
        <Stack>
          <PageHeader title="Email preferences" />
          {/* Nothing while loading: the answer comes back in a moment, and
              a message that flashed up and was replaced read as a fault. */}
          {status === "invalid" && (
            <StateMessage
              icon={<IconAlertCircle />}
              title="This link does not work"
              description="It may have been cut short when it was copied. Use the link in the email again, or sign in and change this in Settings."
              colour="alert"
            />
          )}
          {status === "unavailable" && (
            <StateMessage
              icon={<IconWifiOff />}
              title="We could not load your preferences"
              description="Check your connection and open the link again. Nothing has been changed."
              colour="alert"
            />
          )}
          {status === "ready" && (
            <>
              {/* A heading, not a result card: the card it sat in is
                  small, and a coloured box inside it shouted. */}
              {saved && (
                <Heading>
                  {wantsNews
                    ? "You will be sent news and updates"
                    : "You will not be sent news and updates"}
                </Heading>
              )}
              <BodyText>
                News about Quill Medical, new courses and product updates
                {email ? `, sent to ${email}.` : "."}
              </BodyText>
              <SolidSwitch
                label={SWITCH_LABEL}
                aria-label={SWITCH_LABEL}
                onLabel="On"
                offLabel="Off"
                checked={wantsNews}
                aria-busy={saving}
                error={error}
                onChange={(event) => onChange?.(event.currentTarget.checked)}
              />
              <BodyText>
                Account emails, such as password resets and certificates, are
                always sent.
              </BodyText>
            </>
          )}
        </Stack>
      </BaseCard>
    </>
  );
}
