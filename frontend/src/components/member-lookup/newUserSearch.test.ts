import { describe, it, expect } from "vitest";
import { newUserSearch } from "./newUserSearch";

describe("newUserSearch", () => {
  it("sends an address as the email", () => {
    expect(newUserSearch("new.person@example.org", "4")).toBe(
      "email=new.person%40example.org&org_unit=4",
    );
  });

  it("sends anything else as the username", () => {
    expect(newUserSearch("new.person", "4")).toBe(
      "username=new.person&org_unit=4",
    );
  });
});
