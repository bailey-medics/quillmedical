/**
 * RegisterPage tests
 *
 * The first step of joining: choose a module and name a clinical lead.
 * Only a teaching deployment lets somebody register for themselves.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { api } from "@/lib/api";
import RegisterPage from "./RegisterPage";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue({ modules: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("asks for a module and a clinical lead on a teaching deployment", async () => {
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "false");

    renderWithRouter(<RegisterPage />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Register for Quill Teaching",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Clinical lead email address")).toBeInTheDocument();
  });

  it("links to the guide to joining", async () => {
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "false");

    renderWithRouter(<RegisterPage />);

    expect(
      await screen.findByRole("link", { name: "How to join a course" }),
    ).toHaveAttribute("href", "/guides/join-a-course");
  });

  it("offers no registration on a clinical deployment", () => {
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "true");

    renderWithRouter(<RegisterPage />);

    expect(
      screen.queryByRole("heading", { name: "Register for Quill Teaching" }),
    ).not.toBeInTheDocument();
  });
});
