import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import QuillSpinner from "./QuillSpinner";
import stylesheet from "./QuillSpinner.module.css?raw";

describe("QuillSpinner", () => {
  it("tells screen readers it is loading", () => {
    renderWithMantine(<QuillSpinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("can say what is loading", () => {
    renderWithMantine(<QuillSpinner label="Loading Quill" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading Quill");
  });

  it("hides the quill graphic itself from assistive technology", () => {
    const { container } = renderWithMantine(<QuillSpinner />);
    const hidden = container.querySelector('[aria-hidden="true"]');

    expect(hidden?.querySelectorAll("svg")).toHaveLength(3);
    expect(container.querySelectorAll("svg")).toHaveLength(3);
  });

  it("draws the same quill three times: plain, lit and in shadow", () => {
    const { container } = renderWithMantine(<QuillSpinner />);
    const outlines = [...container.querySelectorAll("svg path")].map((path) =>
      path.getAttribute("d"),
    );

    expect(outlines).toHaveLength(3);
    expect(outlines[0]).toMatch(/^M0 0C.+Z$/);
    expect(new Set(outlines).size).toBe(1);
  });

  it("is 4rem square unless told otherwise", () => {
    renderWithMantine(<QuillSpinner />);
    const box = screen.getByRole("status").parentElement;

    expect(box?.style.width).toContain("4rem");
    expect(box?.style.height).toContain("4rem");
  });

  it("takes a size", () => {
    renderWithMantine(<QuillSpinner size="8rem" />);
    const box = screen.getByRole("status").parentElement;

    expect(box?.style.width).toContain("8rem");
    expect(box?.style.height).toContain("8rem");
  });
});

// jsdom runs no animation and answers no media query, so what the
// stylesheet promises is read from the stylesheet.
describe("QuillSpinner stylesheet", () => {
  it("stops the spin for somebody who has asked for less motion", () => {
    const reducedMotion = stylesheet.split(
      "@media (prefers-reduced-motion: reduce)",
    )[1];

    expect(reducedMotion).toMatch(
      /\.spin,\s*\.lit,\s*\.shadow,[^{]*dark[^{]*\.shadow\s*{\s*animation:\s*none;/,
    );
  });

  // A browser ignores a custom property given as the curve at a step of
  // an animation and falls back to its default, with no warning. That
  // made the whole turn lurch for a while before anybody measured it.
  it("writes every curve out, never as a custom property", () => {
    const curves = [
      ...stylesheet.matchAll(/animation-timing-function:([^;]+);/g),
    ].map(([, curve]) => curve);

    expect(curves.length).toBeGreaterThanOrEqual(6);
    expect(curves.filter((curve) => curve?.includes("var("))).toEqual([]);
  });

  // The spinner shows while the app starts, when the page's own thread is
  // busy. Transform and opacity are the two properties a browser animates
  // without it; anything else stutters.
  it("animates nothing but transform and opacity", () => {
    const animated = [...stylesheet.matchAll(/@keyframes[^{]+{([\s\S]*?)\n}/g)]
      .flatMap(([, body]) => [...(body ?? "").matchAll(/^\s+([a-z-]+):/gm)])
      .map(([, property]) => property);

    expect(new Set(animated)).toEqual(
      new Set(["transform", "opacity", "animation-timing-function"]),
    );
  });

  it("has its own colours for dark mode, where the page is navy", () => {
    expect(stylesheet).toMatch(
      /\[data-mantine-color-scheme="dark"\]\)\s*\.spinner\s*{[^}]*--quill-spinner-face/,
    );
  });

  it("keeps the colours the animation was drawn with", () => {
    expect(stylesheet).toContain(
      "--quill-spinner-face: var(--mantine-color-primary-8);",
    );
    expect(stylesheet).toContain(
      "--quill-spinner-lit: var(--mantine-color-primary-2);",
    );
    expect(stylesheet).toContain("--quill-spinner-shadow: #000a17;");
  });
});
