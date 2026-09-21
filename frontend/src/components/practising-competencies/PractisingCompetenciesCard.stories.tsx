/**
 * Practising competencies card stories.
 *
 * The card reads its rows from the API, so these stories stub
 * `orgUnits.practisingCompetencies` rather than passing rows in. That
 * keeps the component honest about where its data comes from.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { orgUnits } from "@/domains/orgUnit";
import type { OrgUnitMember, PractisingCompetency } from "@/domains/orgUnit";
import { StoryNote } from "@/stories/variants";
import PractisingCompetenciesCard from "./PractisingCompetenciesCard";

const members: OrgUnitMember[] = [
  {
    id: 1,
    username: "a.patel",
    email: "a.patel@example.nhs.uk",
    full_name: "Anita Patel",
    capacity: "staff",
  },
  {
    id: 2,
    username: "j.okafor",
    email: "j.okafor@example.nhs.uk",
    full_name: "Joseph Okafor",
    capacity: "staff",
  },
];

const rows: PractisingCompetency[] = [
  {
    user_id: 1,
    username: "a.patel",
    full_name: "Anita Patel",
    competency: "perform_venepuncture",
    authorised_at: "2026-09-01T09:00:00Z",
    authorised_by: 9,
  },
  {
    user_id: 2,
    username: "j.okafor",
    full_name: "Joseph Okafor",
    competency: "certify_death",
    authorised_at: "2026-09-02T09:00:00Z",
    authorised_by: 9,
  },
];

/** Answer the card's one request with a fixed list. */
function stub(list: PractisingCompetency[]) {
  orgUnits.practisingCompetencies = async () => list;
}

const meta: Meta<typeof PractisingCompetenciesCard> = {
  title: "Cards/Practising competencies",
  component: PractisingCompetenciesCard,
  parameters: { layout: "padded" },
  args: { orgUnitId: 1, members },
};
export default meta;

type Story = StoryObj<typeof PractisingCompetenciesCard>;

/** Two people authorised at this org_unit. */
export const Default: Story = {
  render: (args) => {
    stub(rows);
    return <PractisingCompetenciesCard {...args} />;
  },
};

/** The common state at first: nothing authorised here yet. */
export const Empty: Story = {
  render: (args) => {
    stub([]);
    return (
      <>
        <PractisingCompetenciesCard {...args} />
        <StoryNote>
          Most org_units start here. Nothing is inherited, so a new ward shows
          nothing even when its trust has authorisations.
        </StoryNote>
      </>
    );
  },
};

/** One person authorised for several things, listed one row each. */
export const SeveralForOnePerson: Story = {
  render: (args) => {
    stub([
      rows[0],
      {
        ...rows[0],
        competency: "certify_death",
        authorised_at: "2026-09-03T09:00:00Z",
      },
    ]);
    return (
      <>
        <PractisingCompetenciesCard {...args} />
        <StoryNote>
          Flattened rather than grouped, because withdrawal is per competency
          and the screen needs something to withdraw.
        </StoryNote>
      </>
    );
  },
};
