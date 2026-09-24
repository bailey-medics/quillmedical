import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import {
  recordRoute,
  resetBreadcrumbsForTests,
} from "@/lib/error-reporting/breadcrumbs";
import {
  resetCurrentRouteForTests,
  setCurrentRoute,
} from "@/lib/error-reporting/currentRoute";
import { buildFeedbackBody, sendFeedback } from "./sendFeedback";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}));

beforeEach(() => {
  resetCurrentRouteForTests();
  resetBreadcrumbsForTests();
  vi.mocked(api.post).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildFeedbackBody", () => {
  it("carries what was typed, trimmed", () => {
    const body = buildFeedbackBody({
      category: "inaccurate",
      message: "  The dose is wrong \n",
    });

    expect(body.category).toBe("inaccurate");
    expect(body.message).toBe("The dose is wrong");
  });

  it("captures the matched route pattern, not the URL", () => {
    setCurrentRoute("/teaching/:bankId");

    const body = buildFeedbackBody({ category: null, message: "x" });

    expect(body.route).toBe("/teaching/:bankId");
  });

  it("captures the breadcrumb trail", () => {
    recordRoute("/teaching");
    recordRoute("/teaching/:bankId");

    const body = buildFeedbackBody({ category: null, message: "x" });

    expect(body.breadcrumbs.map((c) => c.type)).toEqual(["route", "route"]);
  });

  it("captures the viewport as width by height", () => {
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);

    const body = buildFeedbackBody({ category: null, message: "x" });

    expect(body.viewport).toBe("390x844");
  });

  it("sends only the keys the server accepts", () => {
    const body = buildFeedbackBody({ category: null, message: "x" });

    expect(Object.keys(body).sort()).toEqual([
      "breadcrumbs",
      "category",
      "message",
      "release",
      "route",
      "user_agent",
      "viewport",
    ]);
  });
});

describe("sendFeedback", () => {
  it("posts to /feedback through the api client", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 7 });

    const result = await sendFeedback({ category: null, message: "Hello" });

    expect(result).toEqual({ id: 7 });
    expect(api.post).toHaveBeenCalledWith(
      "/feedback",
      expect.objectContaining({ message: "Hello" }),
    );
  });

  it("rejects when the server refuses, so the caller can say so", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("HTTP 500"));

    await expect(
      sendFeedback({ category: null, message: "Hello" }),
    ).rejects.toThrow("HTTP 500");
  });
});
