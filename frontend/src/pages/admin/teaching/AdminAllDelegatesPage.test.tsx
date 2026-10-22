/**
 * AdminAllDelegatesPage tests
 *
 * The results are for one module at a time, and the module select appears
 * only when the organisation has more than one module with an assessment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiLib from "@/lib/api";
import AdminAllDelegatesPage from "./AdminAllDelegatesPage";

const MODULES_PATH = "/teaching/admin/delegates/modules";

const real = { bank_id: "colonoscopy", title: "Colonoscopy" };
const practice = {
  bank_id: "colonoscopy practice",
  title: "Colonoscopy (practice)",
};

function delegate(
  name: string,
  result: "pass" | "fail" | null,
  sites: { name: string; clinical_lead: string | null }[] = [
    { name: "Ward 1", clinical_lead: null },
  ],
) {
  return {
    id: name.length,
    name,
    email: `${name}@example.test`,
    sites,
    assessment_result: result,
    assessment_date: result ? "2026-10-01T10:00:00Z" : null,
    first_time_pass: result === "pass",
  };
}

/** Answer the modules call with `modules`, and each results call by path. */
function mockApi(
  modules: { bank_id: string; title: string }[],
  results: Record<string, ReturnType<typeof delegate>[]>,
) {
  return vi.spyOn(apiLib.api, "get").mockImplementation((path: string) => {
    if (path === MODULES_PATH) return Promise.resolve(modules);
    const found = results[path];
    return found
      ? Promise.resolve(found)
      : Promise.reject(new Error(`Unexpected call to ${path}`));
  });
}

describe("AdminAllDelegatesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a module select when there is more than one module", async () => {
    mockApi([real, practice], {
      "/teaching/admin/delegates?bank_id=colonoscopy": [
        delegate("ada", "pass"),
      ],
    });

    renderWithRouter(<AdminAllDelegatesPage />);

    expect(await screen.findByText("ada")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Module" })).toHaveValue(
      "Colonoscopy",
    );
  });

  it("shows another module's results when it is chosen", async () => {
    const user = userEvent.setup();
    const get = mockApi([real, practice], {
      "/teaching/admin/delegates?bank_id=colonoscopy": [
        delegate("ada", "pass"),
      ],
      "/teaching/admin/delegates?bank_id=colonoscopy%20practice": [
        delegate("grace", "fail"),
      ],
    });

    renderWithRouter(<AdminAllDelegatesPage />);

    await user.click(await screen.findByRole("combobox", { name: "Module" }));
    await user.click(
      await screen.findByRole("option", { name: "Colonoscopy (practice)" }),
    );

    expect(await screen.findByText("grace")).toBeInTheDocument();
    expect(screen.queryByText("ada")).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/teaching/admin/delegates?bank_id=colonoscopy%20practice",
    );
  });

  it("has no module select for a single module, and asks for it alone", async () => {
    const get = mockApi([real], {
      "/teaching/admin/delegates?bank_id=colonoscopy": [
        delegate("ada", "pass"),
      ],
    });

    renderWithRouter(<AdminAllDelegatesPage />);

    expect(await screen.findByText("ada")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Module" }),
    ).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/teaching/admin/delegates?bank_id=colonoscopy",
    );
  });

  it("says when nobody has attempted the module", async () => {
    mockApi([real], {
      "/teaching/admin/delegates?bank_id=colonoscopy": [],
    });

    renderWithRouter(<AdminAllDelegatesPage />);

    expect(
      await screen.findByText("Nobody has attempted this module yet"),
    ).toBeInTheDocument();
  });

  it("lists delegates without a module when there is none", async () => {
    const get = mockApi([], {
      "/teaching/admin/delegates": [delegate("ada", null)],
    });

    renderWithRouter(<AdminAllDelegatesPage />);

    expect(await screen.findByText("ada")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Module" }),
    ).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/teaching/admin/delegates");
  });

  describe("somebody at several sites", () => {
    const moves = delegate("ben", "pass", [
      { name: "Northfield", clinical_lead: "Dr Kowalski" },
      { name: "Riverside", clinical_lead: "Dr Hughes" },
      { name: "Day unit", clinical_lead: null },
    ]);
    const stays = delegate("ada", "pass", [
      { name: "Northfield", clinical_lead: "Dr Kowalski" },
    ]);

    function showBoth() {
      mockApi([real], {
        "/teaching/admin/delegates?bank_id=colonoscopy": [moves, stays],
      });
      renderWithRouter(<AdminAllDelegatesPage />);
    }

    it("is shown at every site, each beside its clinical lead", async () => {
      showBoth();

      const row = (await screen.findByText("ben")).closest("tr");
      expect(row).not.toBeNull();
      const cells = within(row as HTMLElement).getAllByRole("cell");

      // The second and third columns, a line for each site.
      expect(cells[1]?.innerHTML.split("<br>")).toHaveLength(3);
      expect(cells[1]).toHaveTextContent("NorthfieldRiversideDay unit");
      expect(cells[2]).toHaveTextContent("Dr KowalskiDr Hughes-");
    });

    it("is found by filtering on their second site's clinical lead", async () => {
      const user = userEvent.setup();
      showBoth();

      await user.click(await screen.findByLabelText("Filter delegates"));
      await user.click(await screen.findByRole("combobox"));
      await user.click(
        await screen.findByRole("option", { name: "Dr Hughes" }),
      );

      await waitFor(() =>
        expect(screen.queryByText("ada")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("ben")).toBeInTheDocument();
    });

    it("is found by searching for any of their sites", async () => {
      const user = userEvent.setup();
      showBoth();

      await user.click(await screen.findByLabelText("Open search"));
      await user.type(screen.getByLabelText("Search"), "Riverside");

      expect(screen.getByText("ben")).toBeInTheDocument();
      expect(screen.queryByText("ada")).not.toBeInTheDocument();
    });
  });

  it("says when the delegates cannot be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("HTTP 500"));

    renderWithRouter(<AdminAllDelegatesPage />);

    await waitFor(() =>
      expect(screen.getByText("Error loading delegates")).toBeInTheDocument(),
    );
  });
});
