/**
 * Tests for what is awaiting a decision, and the dates a keep asks
 * again on.
 */

import { describe, it, expect, vi } from "vitest";
import * as apiLib from "@/lib/api";
import {
  isRecords,
  listRetentionReviews,
  tomorrow,
  type RetentionAccount,
  type RetentionReview,
} from "./retentionReviews";

const account: RetentionAccount = {
  id: 9,
  user_id: 44,
  full_name: "Cat Example",
  email: "cat@example.nhs.uk",
  closed_at: "2028-01-14T09:00:00Z",
  due_on: "2030-01-14T09:00:00Z",
  listed_at: "2030-01-15T03:30:00Z",
};

const records: RetentionReview = {
  ...account,
  id: 1,
  org_unit_id: 3,
  organisation: "Example Training Academy",
  attempts: 3,
  enrolments: 1,
};

describe("isRecords", () => {
  it("is true for records and false for an account", () => {
    expect(isRecords(records)).toBe(true);
    expect(isRecords(account)).toBe(false);
  });
});

describe("listRetentionReviews", () => {
  it("gives the records and the accounts", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      reviews: [records],
      accounts: [account],
    });

    expect(await listRetentionReviews()).toEqual({
      reviews: [records],
      accounts: [account],
    });
  });

  it("gives no accounts when the server sends none", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ reviews: [records] });

    expect(await listRetentionReviews()).toEqual({
      reviews: [records],
      accounts: [],
    });
  });
});

describe("tomorrow", () => {
  it("is the next day", () => {
    expect(tomorrow(new Date(2030, 6, 15))).toBe("2030-07-16");
  });

  it("rolls over the end of a month and a year", () => {
    expect(tomorrow(new Date(2030, 11, 31))).toBe("2031-01-01");
  });
});
