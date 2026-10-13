import { afterEach, describe, expect, it } from "vitest";
import { arrowKeysAreSpokenFor } from "./arrowKeys";

/**
 * One element on the page, inside whatever is named before it: the last
 * of `tags` is the one a key is pressed in. Each entry is a tag, or a
 * tag and the attributes to give it.
 */
type Part = string | [tag: string, attributes: Record<string, string>];

function pressedIn(...parts: Part[]): Element {
  let inside: Element = document.body;

  for (const part of parts) {
    const [tag, attributes] = typeof part === "string" ? [part, {}] : part;
    const element = document.createElement(tag);

    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }

    inside.appendChild(element);
    inside = element;
  }

  return inside;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("arrowKeysAreSpokenFor", () => {
  it.each<[string, Part[]]>([
    ["a video", ["video"]],
    ["something inside a video's own controls", ["video", "span"]],
    ["an audio player", ["audio"]],
    ["a text box", ["input"]],
    ["a longer text box", ["textarea"]],
    ["a drop-down", ["select"]],
    ["text that can be edited", [["div", { contenteditable: "true" }]]],
    ["a slider", [["div", { role: "slider" }]]],
    ["a seek bar inside a player", [["div", { role: "slider" }], "i"]],
  ])("is true in %s", (_name, parts) => {
    expect(arrowKeysAreSpokenFor(pressedIn(...parts))).toBe(true);
  });

  it.each<[string, Part[]]>([
    ["the page", ["main"]],
    ["a button", ["button"]],
    ["a link", [["a", { href: "#" }]]],
    ["text marked as not editable", [["div", { contenteditable: "false" }]]],
  ])("is false on %s", (_name, parts) => {
    expect(arrowKeysAreSpokenFor(pressedIn(...parts))).toBe(false);
  });

  it("is false on a heading beside a video, not inside it", () => {
    const beside = pressedIn("div");
    beside.appendChild(document.createElement("video"));
    const heading = document.createElement("h1");
    beside.appendChild(heading);

    expect(arrowKeysAreSpokenFor(heading)).toBe(false);
  });

  it("is false where a key press has no element behind it", () => {
    expect(arrowKeysAreSpokenFor(null)).toBe(false);
    expect(arrowKeysAreSpokenFor(window)).toBe(false);
  });
});
