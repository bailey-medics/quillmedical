/**
 * PassportFrameworksCard Component
 *
 * The settings card for a passport holder, titled "Clinician passport":
 * the frameworks they work to, how their passport home page lays out the
 * record, and the way to their CPD date ranges.
 *
 * A composition of `ActionCard`, `FrameworkField`, `RadioField` and
 * `ActionCardButton`.
 * `ActionCard`'s `action` slot replaces its button, so the field and the
 * button share that slot in a `Stack`. Only rendered for somebody who has
 * a passport; the settings page decides that.
 *
 * **The frameworks decide what the passport offers.** A holder is offered
 * the competencies in their frameworks and no others, so this is where
 * somebody who cannot find a competency comes to add the framework it
 * belongs to.
 *
 * **Dropping a framework removes nothing already recorded**, and the
 * card says so, because that is the first thing somebody about to remove
 * one will worry about.
 *
 * **The button stays enabled on a read-only passport**, because the page
 * it opens still shows the ranges, and says why they cannot be changed.
 *
 * **So does the home page choice**, because it changes how the record is
 * shown and never the record. `disabled` reaches the frameworks alone.
 *
 * @example
 * ```tsx
 * <PassportFrameworksCard
 *   options={useFrameworkChoices(true)}
 *   value={frameworks}
 *   onChange={saveFrameworks}
 *   landingView="by_competency"
 *   onLandingViewChange={saveLandingView}
 *   disabled={!canWrite}
 * />
 * ```
 */

import { Stack } from "@mantine/core";
import ActionCard from "@/components/action-card";
import ActionCardButton from "@/components/button/ActionCardButton";
import RadioField from "@/components/form/RadioField";
import { IconEPassport } from "@/components/icons/appIcons";
import type { FrameworkOption } from "@lib/passport/frameworks";
import type { LandingView } from "@lib/passport";
import FrameworkField from "./FrameworkField";

export interface PassportFrameworksCardProps {
  /** The frameworks to offer, in the order to offer them */
  options: FrameworkOption[];
  /** The holder's framework ids */
  value: string[];
  /** Called with the new list of ids */
  onChange: (value: string[]) => void;
  /** True while the passport is read-only, as after an entitlement ends */
  disabled?: boolean;
  /** Why the last change was not saved */
  error?: string;
  /** How the passport home page lays out the record */
  landingView: LandingView;
  /** Called with the view chosen */
  onLandingViewChange: (value: LandingView) => void;
  /** Why the last change of view was not saved */
  landingViewError?: string;
}

/** The two ways the home page can lay out the record, default first. */
const LANDING_VIEW_OPTIONS: { value: LandingView; label: string }[] = [
  { value: "by_competency", label: "By competency" },
  { value: "by_record", label: "By record" },
];

/** Narrows the radio group's string to a view, ignoring anything else. */
function isLandingView(value: string): value is LandingView {
  return LANDING_VIEW_OPTIONS.some((option) => option.value === value);
}

export default function PassportFrameworksCard({
  options,
  value,
  onChange,
  disabled = false,
  error,
  landingView,
  onLandingViewChange,
  landingViewError,
}: PassportFrameworksCardProps) {
  return (
    <ActionCard
      icon={<IconEPassport />}
      title="Clinician passport"
      action={
        <Stack gap="md">
          <FrameworkField
            options={options}
            description={
              disabled
                ? "Your passport is read-only at the moment, so this cannot be changed."
                : "Your passport offers the competencies in these. Removing one keeps everything already recorded under it."
            }
            value={value}
            onChange={onChange}
            error={error}
            disabled={disabled}
          />
          <RadioField
            label="Passport home page"
            description="By competency shows a table for each framework. By record lists every record, newest first."
            options={LANDING_VIEW_OPTIONS}
            value={landingView}
            onChange={(value) => {
              if (isLandingView(value)) onLandingViewChange(value);
            }}
            error={landingViewError}
          />
          <ActionCardButton
            label="CPD date ranges"
            url="/settings/cpd-date-ranges"
          />
        </Stack>
      }
    />
  );
}
