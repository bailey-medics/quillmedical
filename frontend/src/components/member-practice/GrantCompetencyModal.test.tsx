/**
 * Grant competency modal tests.
 *
 * Covers that nothing can be granted until something is chosen, that the
 * choice is what gets granted, that it says the grant reaches everywhere,
 * and that a failed grant leaves the modal open.
 */

import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import GrantCompetencyModal from "./GrantCompetencyModal";

const options = [
  { id: "certify_death", name: "Certify Death" },
  { id: "manage_users", name: "Manage User Accounts" },
];

function renderModal(
  overrides: Partial<Parameters<typeof GrantCompetencyModal>[0]> = {},
) {
  const props = {
    opened: true,
    onClose: vi.fn(),
    onGrant: vi.fn().mockResolvedValue(undefined),
    options,
    username: "a.patel",
    orgUnitName: "Ward A",
    ...overrides,
  };
  renderWithMantine(<GrantCompetencyModal {...props} />);
  return props;
}

async function acceptButton() {
  const dialog = await screen.findByRole("dialog");
  return within(dialog).getByRole("button", { name: "Grant and authorise" });
}

describe("GrantCompetencyModal", () => {
  it("says the grant reaches everywhere they work", async () => {
    renderModal();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "This gives a.patel the competency everywhere they work, not only at Ward A",
    );
  });

  it("grants nothing until a competency is chosen", async () => {
    const user = userEvent.setup();
    const { onGrant } = renderModal();

    const accept = await acceptButton();
    expect(accept).toHaveAttribute("aria-disabled", "true");
    await user.click(accept);

    expect(onGrant).not.toHaveBeenCalled();
  });

  it("grants the chosen competency, then closes", async () => {
    const user = userEvent.setup();
    const { onGrant, onClose } = renderModal();

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Certify Death" }),
    );
    await user.click(await acceptButton());

    expect(onGrant).toHaveBeenCalledWith("certify_death");
    expect(onClose).toHaveBeenCalled();
  });

  it("starts with the given competency chosen", async () => {
    const user = userEvent.setup();
    const { onGrant } = renderModal({ initial: "manage_users" });

    expect(screen.getByRole("combobox")).toHaveValue("Manage User Accounts");
    await user.click(await acceptButton());

    expect(onGrant).toHaveBeenCalledWith("manage_users");
  });

  it("stays open when the grant fails", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({
      initial: "certify_death",
      onGrant: vi.fn().mockRejectedValue(new Error("nope")),
    });

    await user.click(await acceptButton());

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveValue("Certify Death");
  });

  it("closes on cancel without granting", async () => {
    const user = userEvent.setup();
    const { onGrant, onClose } = renderModal();

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(onGrant).not.toHaveBeenCalled();
  });
});
