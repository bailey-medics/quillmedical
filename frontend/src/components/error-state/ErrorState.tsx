/**
 * ErrorState Component
 *
 * What a user is shown when something has failed. One design in two sizes:
 * `page` replaces the view, `inline` sits inside the layout where a section
 * failed to load.
 *
 * **It does not accept an error object, and that is the point.** Pages pass a
 * message somebody wrote for a person to read. The alternative — handing it
 * `err.message` — puts whatever the backend returned on screen, which for a
 * long time meant raw text from EHRbase, HAPI FHIR or the database appearing
 * in front of whoever was standing there. That is fixed at the source now, but
 * the restriction stays structural rather than advisory, because a convention
 * is exactly what the pages that hand-rolled this already broke.
 *
 * The error `code` is welcome, and shown in small print. It is a fixed
 * vocabulary, it discloses nothing, and it is what a support call can be
 * matched against in the logs.
 */

import { Alert, Center, Stack } from "@mantine/core";
import { IconAlertTriangle } from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import IconTextButton from "@/components/button/IconTextButton";
import iconTextButtonIcons from "@/components/button/iconTextButtonIcons";
import { BodyText, FieldDescription, Heading } from "@/components/typography";

type IconName = keyof typeof iconTextButtonIcons;

export interface ErrorStateAction {
  /** Button label, e.g. "Try again" or "Reload page" */
  label: string;
  /** Registered icon name. Defaults to a refresh arrow. */
  icon?: IconName;
  onClick: () => void;
}

export interface ErrorStateProps {
  /**
   * What went wrong, written for a person to read.
   *
   * Never `err.message`: see the note above. If you find yourself without
   * anything to say here, that is the question this component exists to
   * force, not a reason to pass the error through.
   */
  message: string;
  /** Heading above the message. Defaults to "Something went wrong". */
  title?: string;
  /** Backend error code, shown small so a support call can be traced. */
  code?: string;
  /** Optional recovery action. Omit when there is nothing useful to offer. */
  action?: ErrorStateAction;
  /**
   * `page` replaces the view and is right for a crash or a view that cannot
   * render at all. `inline` sits in the layout and is right for a section
   * that failed to load, or a form submission that failed — blanking the page
   * there would throw away whatever the user had typed.
   */
  variant?: "page" | "inline";
}

export default function ErrorState({
  message,
  title = "Something went wrong",
  code,
  action,
  variant = "inline",
}: ErrorStateProps) {
  const body = (
    <Stack align={variant === "page" ? "center" : "flex-start"} gap="md">
      <Icon
        icon={<IconAlertTriangle />}
        size="xl"
        colour="var(--alert-color)"
      />
      <Heading>{title}</Heading>
      <BodyText c="gray.5">{message}</BodyText>
      {code ? <FieldDescription>Reference: {code}</FieldDescription> : null}
      {action ? (
        <IconTextButton
          icon={action.icon ?? "refresh"}
          label={action.label}
          onClick={action.onClick}
        />
      ) : null}
    </Stack>
  );

  if (variant === "page") {
    return (
      <Center mih="60vh" data-testid="error-state">
        {body}
      </Center>
    );
  }

  return (
    <Alert
      variant="light"
      color="var(--alert-color)"
      data-testid="error-state"
      role="alert"
    >
      {body}
    </Alert>
  );
}
