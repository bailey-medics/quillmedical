import { describe, expect, it } from "vitest";
import { registrationAuthorities } from "./registrationAuthorities";

describe("registrationAuthorities", () => {
  it("offers the UK bodies the backend accepts, by id", () => {
    expect(registrationAuthorities().map((option) => option.value)).toEqual([
      "GMC",
      "NMC",
      "GPhC",
      "HCPC",
    ]);
  });

  it("names each body in full", () => {
    expect(registrationAuthorities()[0].label).toBe(
      "GMC — General Medical Council",
    );
  });
});
