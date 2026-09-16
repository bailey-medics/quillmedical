/**
 * Tests for the org unit client.
 *
 * The addresses live here so they appear once rather than in a dozen
 * screens. That only helps if they are right, so these check the exact
 * path and body of every call, and that a missing list comes back as an
 * empty one rather than undefined.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "@/lib/api";
import { orgUnits } from "@/domains/orgUnit";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listing places", () => {
  it("asks for every place when nothing is narrowed", async () => {
    mocked.get.mockResolvedValue({ org_units: [] });

    await orgUnits.list();

    expect(mocked.get).toHaveBeenCalledWith("/org-units");
  });

  it("asks only for the organisations", async () => {
    mocked.get.mockResolvedValue({ org_units: [] });

    await orgUnits.list({ roots: true });

    expect(mocked.get).toHaveBeenCalledWith("/org-units?roots=true");
  });

  it("asks only for the places inside one", async () => {
    mocked.get.mockResolvedValue({ org_units: [] });

    await orgUnits.list({ parentId: 7 });

    expect(mocked.get).toHaveBeenCalledWith("/org-units?parent_id=7");
  });

  it("can ask for both at once", async () => {
    mocked.get.mockResolvedValue({ org_units: [] });

    await orgUnits.list({ roots: false, parentId: 7 });

    expect(mocked.get).toHaveBeenCalledWith(
      "/org-units?roots=false&parent_id=7",
    );
  });

  it("gives back an empty list when the answer has none", async () => {
    mocked.get.mockResolvedValue({});

    expect(await orgUnits.list()).toEqual([]);
  });

  it("gives back what it was told", async () => {
    const place = { id: 1, name: "Ward 1" };
    mocked.get.mockResolvedValue({ org_units: [place] });

    expect(await orgUnits.list()).toEqual([place]);
  });
});

describe("one place", () => {
  it("reads it", async () => {
    mocked.get.mockResolvedValue({ id: 3 });

    await orgUnits.get(3);

    expect(mocked.get).toHaveBeenCalledWith("/org-units/3");
  });

  it("creates one", async () => {
    mocked.post.mockResolvedValue({ id: 4 });

    await orgUnits.create({ name: "Ward 9", type: "ward", parent_id: 2 });

    expect(mocked.post).toHaveBeenCalledWith("/org-units", {
      name: "Ward 9",
      type: "ward",
      parent_id: 2,
    });
  });

  it("changes one", async () => {
    mocked.put.mockResolvedValue({ id: 4 });

    await orgUnits.update(4, { name: "Renamed" });

    expect(mocked.put).toHaveBeenCalledWith("/org-units/4", {
      name: "Renamed",
    });
  });

  it("puts one out of use", async () => {
    mocked.patch.mockResolvedValue({ id: 4 });

    await orgUnits.setActive(4, false);

    expect(mocked.patch).toHaveBeenCalledWith("/org-units/4/active", {
      is_active: false,
    });
  });

  it("deletes one", async () => {
    mocked.del.mockResolvedValue({ status: "deleted" });

    await orgUnits.remove(4);

    expect(mocked.del).toHaveBeenCalledWith("/org-units/4");
  });
});

describe("who is there", () => {
  it("lists them", async () => {
    mocked.get.mockResolvedValue({ members: [] });

    await orgUnits.members(5);

    expect(mocked.get).toHaveBeenCalledWith("/org-units/5/members");
  });

  it("gives back an empty list when the answer has none", async () => {
    mocked.get.mockResolvedValue({});

    expect(await orgUnits.members(5)).toEqual([]);
  });

  it("adds somebody, with the grant in the same call", async () => {
    mocked.post.mockResolvedValue({ status: "added" });

    await orgUnits.addMember(5, {
      user_id: 9,
      capacity: "staff",
      base_profession: "consultant",
    });

    expect(mocked.post).toHaveBeenCalledWith("/org-units/5/members", {
      user_id: 9,
      capacity: "staff",
      base_profession: "consultant",
    });
  });

  it("takes somebody off", async () => {
    mocked.del.mockResolvedValue({ status: "removed" });

    await orgUnits.removeMember(5, 9);

    expect(mocked.del).toHaveBeenCalledWith("/org-units/5/members/9");
  });
});

describe("what a place carries", () => {
  it("lists the features", async () => {
    mocked.get.mockResolvedValue({ features: [] });

    await orgUnits.features(6);

    expect(mocked.get).toHaveBeenCalledWith("/org-units/6/features");
  });

  it("switches one on", async () => {
    mocked.put.mockResolvedValue({ status: "enabled" });

    await orgUnits.setFeature(6, "teaching", true);

    expect(mocked.put).toHaveBeenCalledWith("/org-units/6/features/teaching", {
      enabled: true,
    });
  });

  it("adds a patient", async () => {
    mocked.post.mockResolvedValue({ status: "added" });

    await orgUnits.addPatient(6, "patient-1");

    expect(mocked.post).toHaveBeenCalledWith("/org-units/6/patients", {
      patient_id: "patient-1",
    });
  });

  it("removes a patient", async () => {
    mocked.del.mockResolvedValue({ status: "removed" });

    await orgUnits.removePatient(6, "patient-1");

    expect(mocked.del).toHaveBeenCalledWith("/org-units/6/patients/patient-1");
  });
});

describe("relationships that are not ownership", () => {
  it("lists them", async () => {
    mocked.get.mockResolvedValue({ links: [] });

    await orgUnits.links(8);

    expect(mocked.get).toHaveBeenCalledWith("/org-units/8/links");
  });

  it("records one", async () => {
    mocked.post.mockResolvedValue({ links: [] });

    await orgUnits.addLink(8, { target_id: 9, relation: "teaches_at" });

    expect(mocked.post).toHaveBeenCalledWith("/org-units/8/links", {
      target_id: 9,
      relation: "teaches_at",
    });
  });

  it("removes one, and gives back what is left", async () => {
    mocked.del.mockResolvedValue({ links: [{ id: 2 }] });

    const left = await orgUnits.removeLink(8, 1);

    expect(mocked.del).toHaveBeenCalledWith("/org-units/8/links/1");
    expect(left).toEqual([{ id: 2 }]);
  });
});
