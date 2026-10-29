import { describe, it, expect } from "vitest";
import {
  NO_CLINICAL_LEAD,
  clinicalLeadOptions,
  fromLeadChoice,
  toLeadChoice,
} from "./clinicalLead";

describe("clinicalLeadOptions", () => {
  it("opens with no clinical lead, then each person", () => {
    const options = clinicalLeadOptions([
      { id: 7, username: "dr.lead", email: "lead@example.com" },
    ]);

    expect(options).toEqual([
      { value: NO_CLINICAL_LEAD, label: "No clinical lead" },
      { value: "7", label: "dr.lead (lead@example.com)" },
    ]);
  });

  it("still offers no clinical lead when there is nobody to choose", () => {
    expect(clinicalLeadOptions([])).toEqual([
      { value: NO_CLINICAL_LEAD, label: "No clinical lead" },
    ]);
  });
});

describe("toLeadChoice", () => {
  it("shows a vacant post as no clinical lead", () => {
    expect(toLeadChoice(null)).toBe(NO_CLINICAL_LEAD);
  });

  it("shows a lead as that person", () => {
    expect(toLeadChoice("7")).toBe("7");
  });
});

describe("fromLeadChoice", () => {
  it("keeps no clinical lead as a vacant post", () => {
    expect(fromLeadChoice(NO_CLINICAL_LEAD)).toBeNull();
  });

  it("keeps nothing chosen as a vacant post", () => {
    expect(fromLeadChoice(null)).toBeNull();
  });

  it("keeps a person as that person", () => {
    expect(fromLeadChoice("7")).toBe("7");
  });
});
