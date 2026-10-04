/**
 * AdminAllDelegatesPage tests
 *
 * The results are for one module at a time, and the module select appears
 * only when the organisation has more than one module with an assessment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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

function delegate(name: string, result: "pass" | "fail" | null) {
  return {
    id: name.length,
    name,
    email: `${name}@example.test`,
    site_name: "Ward 1",
    clinical_lead: null,
    learning_completed: null,
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

  it("says when the delegates cannot be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("HTTP 500"));

    renderWithRouter(<AdminAllDelegatesPage />);

    await waitFor(() =>
      expect(screen.getByText("Error loading delegates")).toBeInTheDocument(),
    );
  });
});
