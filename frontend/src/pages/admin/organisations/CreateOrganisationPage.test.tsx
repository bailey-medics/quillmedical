/**
 * CreateOrganisationPage Component Tests
 *
 * Tests for the create organisation page including:
 * - Form rendering
 * - Validation
 * - Successful submission
 * - Error handling
 * - Navigation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import CreateOrganisationPage from "./CreateOrganisationPage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("CreateOrganisationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Form rendering", () => {
    it("renders the page header", () => {
      renderWithRouter(<CreateOrganisationPage />);
      expect(
        screen.getByRole("heading", { name: "Create organisation" }),
      ).toBeInTheDocument();
    });

    it("renders name input", () => {
      renderWithRouter(<CreateOrganisationPage />);
      expect(screen.getByLabelText(/organisation name/i)).toBeInTheDocument();
    });

    it("renders type select", () => {
      renderWithRouter(<CreateOrganisationPage />);
      expect(
        screen.getByRole("textbox", { name: /organisation type/i }),
      ).toBeInTheDocument();
    });

    it("renders location input", () => {
      renderWithRouter(<CreateOrganisationPage />);
      expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    });

    it("renders submit and cancel buttons", () => {
      renderWithRouter(<CreateOrganisationPage />);
      expect(
        screen.getByRole("button", { name: /create organisation/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /cancel/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Validation", () => {
    it("shows error when name is empty", async () => {
      const user = userEvent.setup();
      renderWithRouter(<CreateOrganisationPage />);

      await user.click(
        screen.getByRole("button", { name: /create organisation/i }),
      );

      expect(
        screen.getByText("Organisation name is required"),
      ).toBeInTheDocument();
    });

    it("shows error when type is not selected", async () => {
      const user = userEvent.setup();
      renderWithRouter(<CreateOrganisationPage />);

      await user.type(
        screen.getByRole("textbox", { name: /organisation name/i }),
        "Test Hospital",
      );
      await user.click(
        screen.getByRole("button", { name: /create organisation/i }),
      );

      expect(
        screen.getByText("Organisation type is required"),
      ).toBeInTheDocument();
    });
  });

  describe("Submission", () => {
    it("submits form data to API", async () => {
      const user = userEvent.setup();
      const postSpy = vi.spyOn(apiLib.api, "post").mockResolvedValue({
        id: 1,
        name: "Test Hospital",
        type: "hospital_team",
        location: "London",
      });

      renderWithRouter(<CreateOrganisationPage />);

      await user.type(
        screen.getByRole("textbox", { name: /organisation name/i }),
        "Test Hospital",
      );
      await user.click(
        screen.getByRole("textbox", { name: /organisation type/i }),
      );
      await user.click(screen.getByText("Hospital team"));
      await user.type(screen.getByLabelText(/location/i), "London");
      await user.click(
        screen.getByRole("button", { name: /create organisation/i }),
      );

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith("/organizations", {
          name: "Test Hospital",
          type: "hospital_team",
          location: "London",
        });
      });
    });

    it("shows success message after creation", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiLib.api, "post").mockResolvedValue({
        id: 1,
        name: "Test Hospital",
        type: "hospital_team",
      });

      renderWithRouter(<CreateOrganisationPage />);

      await user.type(
        screen.getByRole("textbox", { name: /organisation name/i }),
        "Test Hospital",
      );
      await user.click(
        screen.getByRole("textbox", { name: /organisation type/i }),
      );
      await user.click(screen.getByText("Hospital team"));
      await user.click(
        screen.getByRole("button", { name: /create organisation/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Organisation created")).toBeInTheDocument();
      });
    });

    it("displays error on API failure", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiLib.api, "post").mockRejectedValue(new Error("Server error"));

      renderWithRouter(<CreateOrganisationPage />);

      await user.type(
        screen.getByRole("textbox", { name: /organisation name/i }),
        "Test Hospital",
      );
      await user.click(
        screen.getByRole("textbox", { name: /organisation type/i }),
      );
      await user.click(screen.getByText("Hospital team"));
      await user.click(
        screen.getByRole("button", { name: /create organisation/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeInTheDocument();
      });
    });
  });

  describe("Navigation", () => {
    it("navigates back on cancel", async () => {
      const user = userEvent.setup();
      renderWithRouter(<CreateOrganisationPage />);

      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations");
    });
  });
});
