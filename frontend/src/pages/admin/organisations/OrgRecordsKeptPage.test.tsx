/**
 * OrgRecordsKeptPage Tests
 *
 * Setting how long one organisation's records outlast a closed account:
 * that an empty field clears the period, and that a number out of range
 * is never sent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiLib from "@/lib/api";
import OrgRecordsKeptPage from "./OrgRecordsKeptPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const kept = { org_unit_id: 3, organisation: "Example Academy", months: 42 };

function renderPage() {
  renderWithRouter(<OrgRecordsKeptPage />, {
    routePath: "/admin/organisations/:id/retention",
    initialRoute: "/admin/organisations/3/retention",
  });
}

async function field(): Promise<HTMLElement> {
  return screen.findByLabelText(/Months kept after an account is closed/);
}

describe("OrgRecordsKeptPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("names the organisation and shows its period", async () => {
    const get = vi.spyOn(apiLib.api, "get").mockResolvedValue(kept);

    renderPage();

    expect(await field()).toHaveValue("42");
    expect(
      screen.getByRole("heading", {
        name: "Record retention: Example Academy",
      }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/retention/periods/3");
  });

  it("shows an empty field when no period is set", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ ...kept, months: null });

    renderPage();

    expect(await field()).toHaveValue("");
  });

  it("says that changing it deletes nothing", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue(kept);

    renderPage();

    expect(
      await screen.findByText(/Changing this deletes nothing/),
    ).toBeInTheDocument();
  });

  it("sends the months that were typed", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ ...kept, months: null });
    const put = vi.spyOn(apiLib.api, "put").mockResolvedValue(kept);

    renderPage();
    await user.type(await field(), "42");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/retention/periods/3", { months: 42 }),
    );
    expect(
      await screen.findByText("Record retention updated"),
    ).toBeInTheDocument();
  });

  it("sends null when the field is emptied", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(kept);
    const put = vi
      .spyOn(apiLib.api, "put")
      .mockResolvedValue({ ...kept, months: null });

    renderPage();
    await user.clear(await field());
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/retention/periods/3", {
        months: null,
      }),
    );
  });

  it.each(["0", "601", "3.5", "-4", "soon"])(
    "does not send %s, and says what is allowed",
    async (typed) => {
      const user = userEvent.setup();
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ ...kept, months: null });
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue(kept);

      renderPage();
      await user.type(await field(), typed);
      await user.click(screen.getByTestId("submit-button"));

      expect(
        await screen.findByText(/Give whole months, from 1 to 600/),
      ).toBeInTheDocument();
      expect(put).not.toHaveBeenCalled();
    },
  );

  it("says so when the period cannot be saved", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ ...kept, months: null });
    vi.spyOn(apiLib.api, "put").mockRejectedValue(new Error("Forbidden"));

    renderPage();
    await user.type(await field(), "12");
    await user.click(screen.getByTestId("submit-button"));

    expect(await screen.findByText("Period not saved")).toBeInTheDocument();
  });

  it("says so when the period cannot be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("Not found"));

    renderPage();

    expect(
      await screen.findByText("Error loading record retention"),
    ).toBeInTheDocument();
  });

  it("goes back to the organisation on cancel", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(kept);

    renderPage();
    await field();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/3");
  });
});
