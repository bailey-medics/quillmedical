/**
 * Passport API client tests.
 *
 * `api.ts` is mocked rather than `fetch`: these functions are thin
 * wrappers, so what is worth pinning is the path each one builds and the
 * verb it chooses. The transport beneath — credentials, CSRF, the 401
 * retry — is `api.test.ts`'s job and is not re-tested here.
 *
 * The path assertions are the point of the file. A mistyped path is
 * invisible in review, compiles perfectly, and surfaces as a 404 in front
 * of a user; `PASSPORT_PATHS` against the backend's own `EXPECTED_PATHS`
 * catches the same class of mistake for routes nothing else calls yet.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PASSPORT_PATHS,
  acceptAssessorInvite,
  addCertificate,
  addCpdEntry,
  addLogbookEntry,
  addReflection,
  amendCertificate,
  amendCpdEntry,
  amendLogbookEntry,
  amendReflection,
  createPassport,
  declineSignOff,
  fetchCertificates,
  fetchCpdYear,
  fetchInbox,
  fetchLogbook,
  fetchMyPassport,
  fetchPassport,
  fetchReflections,
  fetchSignOff,
  previewAssessorInvite,
  removeCertificate,
  removeCpdEntry,
  removeLogbookEntry,
  removeReflection,
  requestSignOff,
  searchAssessors,
  revokeAssessorMembership,
  signOff,
  verifySignOff,
  withdrawSignOff,
} from "./api";
import { api } from "@lib/api";

vi.mock("@lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    del: vi.fn().mockResolvedValue({}),
  },
}));

const PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309";
const COMPETENCY = "perform_bronchoscopy";
const SIGNOFF_ID = "20260314T143207.000Z-abc";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("passport paths", () => {
  it("mirrors the backend's EXPECTED_PATHS, with the /api prefix stripped", () => {
    // Copied verbatim from EXPECTED_PATHS in
    // backend/tests/test_passport_api_contract.py. `api.ts` adds the
    // /api prefix itself, so the client's own paths omit it.
    const backendPaths = [
      "/api/passport",
      "/api/passport/me",
      "/api/passport/assessor-invites/accept",
      "/api/passport/assessor-invites/preview",
      "/api/passport/assessors/{assessor_user_id}/membership",
      "/api/passport/requests/inbox",
      "/api/passport/{passport_id}",
      "/api/passport/{passport_id}/assessor-invites",
      "/api/passport/{passport_id}/certificates",
      "/api/passport/{passport_id}/certificates/{name}",
      "/api/passport/{passport_id}/competencies/{competency_id}",
      "/api/passport/{passport_id}/competencies/{competency_id}/requests",
      "/api/passport/{passport_id}/cpd",
      "/api/passport/{passport_id}/cpd/{year}",
      "/api/passport/{passport_id}/cpd/{year}/{stem}",
      "/api/passport/{passport_id}/logbook",
      "/api/passport/{passport_id}/logbook/{competency_id}",
      "/api/passport/{passport_id}/logbook/{competency_id}/{stem}",
      "/api/passport/{passport_id}/reflections",
      "/api/passport/{passport_id}/evidence",
      "/api/passport/{passport_id}/export.md",
      "/api/passport/{passport_id}/export.pdf",
      "/api/passport/{passport_id}/export.zip",
      "/api/passport/{passport_id}/reflections/{name}",
      "/api/passport/{passport_id}/sign-offs/{signoff_id}",
      "/api/passport/{passport_id}/sign-offs/{signoff_id}/decline",
      "/api/passport/{passport_id}/sign-offs/{signoff_id}/sign-off",
      "/api/passport/{passport_id}/sign-offs/{signoff_id}/verify",
      "/api/passport/{passport_id}/sign-offs/{signoff_id}/withdraw",
    ].map((path) => path.replace(/^\/api/, ""));

    expect([...PASSPORT_PATHS].sort()).toEqual(backendPaths.sort());
  });
});

describe("passport", () => {
  it("creates a passport", async () => {
    await createPassport();
    expect(api.post).toHaveBeenCalledWith("/passport");
  });

  it("fetches the caller's own passport", async () => {
    await fetchMyPassport();
    expect(api.get).toHaveBeenCalledWith("/passport/me");
  });

  it("fetches a passport by id", async () => {
    await fetchPassport(PASSPORT_ID);
    expect(api.get).toHaveBeenCalledWith(`/passport/${PASSPORT_ID}`);
  });
});

describe("sign-offs", () => {
  it("fetches the assessor inbox", async () => {
    await fetchInbox();
    expect(api.get).toHaveBeenCalledWith("/passport/requests/inbox");
  });

  it("searches for an assessor, escaping what was typed", async () => {
    // A name holds a space and an address holds an @; both change what
    // the query string means if they are passed through raw.
    await searchAssessors("amara okonkwo@example.nhs.uk");
    expect(api.get).toHaveBeenCalledWith(
      "/passport/assessors/search?q=amara%20okonkwo%40example.nhs.uk",
    );
  });

  it("requests a sign-off against a competency", async () => {
    const body = {
      assessor_email: "amara.okonkwo@example.nhs.uk",
      observed_on: "2026-03-14",
    };
    await requestSignOff(PASSPORT_ID, COMPETENCY, body);
    expect(api.post).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/competencies/${COMPETENCY}/requests`,
      body,
    );
  });

  it("fetches one sign-off", async () => {
    await fetchSignOff(PASSPORT_ID, SIGNOFF_ID);
    expect(api.get).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/sign-offs/${SIGNOFF_ID}`,
    );
  });

  it("signs off, passing the declaration through", async () => {
    const body = {
      meaning: "directly observed" as const,
      declaration_confirmed: true,
    };
    await signOff(PASSPORT_ID, SIGNOFF_ID, body);
    expect(api.post).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/sign-offs/${SIGNOFF_ID}/sign-off`,
      body,
    );
  });

  it("declines with a reason", async () => {
    await declineSignOff(PASSPORT_ID, SIGNOFF_ID, { reason: "Not observed" });
    expect(api.post).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/sign-offs/${SIGNOFF_ID}/decline`,
      { reason: "Not observed" },
    );
  });

  it("withdraws without a body", async () => {
    await withdrawSignOff(PASSPORT_ID, SIGNOFF_ID);
    expect(api.post).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/sign-offs/${SIGNOFF_ID}/withdraw`,
    );
  });

  it("verifies a sign-off", async () => {
    await verifySignOff(PASSPORT_ID, SIGNOFF_ID);
    expect(api.get).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/sign-offs/${SIGNOFF_ID}/verify`,
    );
  });
});

describe("certificates", () => {
  const certificate = {
    title: "Bronchoscopy course",
    issuer: "Bristol Royal Infirmary",
    awarded_on: "2025-11-04",
  };

  it("adds one", async () => {
    await addCertificate(PASSPORT_ID, certificate);
    expect(api.post).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/certificates`,
      certificate,
    );
  });

  it("lists them", async () => {
    await fetchCertificates(PASSPORT_ID);
    expect(api.get).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/certificates`,
    );
  });

  it("amends one with PATCH, since self-declared records are editable", async () => {
    await amendCertificate(PASSPORT_ID, "2025-11-04-course", certificate);
    expect(api.patch).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/certificates/2025-11-04-course`,
      certificate,
    );
  });

  it("removes one with DELETE", async () => {
    await removeCertificate(PASSPORT_ID, "2025-11-04-course");
    expect(api.del).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/certificates/2025-11-04-course`,
    );
  });
});

describe("logbook", () => {
  const entry = { performed_on: "2026-03-12" };

  it("adds an entry under its competency", async () => {
    await addLogbookEntry(PASSPORT_ID, COMPETENCY, entry);
    expect(api.post).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/logbook/${COMPETENCY}`,
      entry,
    );
  });

  it("fetches a competency's logbook", async () => {
    await fetchLogbook(PASSPORT_ID, COMPETENCY);
    expect(api.get).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/logbook/${COMPETENCY}`,
    );
  });

  it("amends an entry by stem", async () => {
    await amendLogbookEntry(
      PASSPORT_ID,
      COMPETENCY,
      "2026-03-14-143207",
      entry,
    );
    expect(api.patch).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/logbook/${COMPETENCY}/2026-03-14-143207`,
      entry,
    );
  });

  it("removes an entry by stem", async () => {
    await removeLogbookEntry(PASSPORT_ID, COMPETENCY, "2026-03-14-143207");
    expect(api.del).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/logbook/${COMPETENCY}/2026-03-14-143207`,
    );
  });
});

describe("reflections", () => {
  const reflection = {
    title: "Difficult airway",
    written_on: "2026-03-14",
    body: "...",
    anonymised_confirmed: true,
  };

  it("adds one", async () => {
    await addReflection(PASSPORT_ID, reflection);
    expect(api.post).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/reflections`,
      reflection,
    );
  });

  it("lists them", async () => {
    await fetchReflections(PASSPORT_ID);
    expect(api.get).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/reflections`,
    );
  });

  it("amends one", async () => {
    await amendReflection(PASSPORT_ID, "2026-03-14-airway", reflection);
    expect(api.patch).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/reflections/2026-03-14-airway`,
      reflection,
    );
  });

  it("removes one", async () => {
    await removeReflection(PASSPORT_ID, "2026-03-14-airway");
    expect(api.del).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/reflections/2026-03-14-airway`,
    );
  });
});

describe("cpd", () => {
  const activity = {
    activity_on: "2026-02-11",
    title: "Grand round",
    activity_type: "grand round" as const,
  };

  it("adds an activity", async () => {
    await addCpdEntry(PASSPORT_ID, activity);
    expect(api.post).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/cpd`,
      activity,
    );
  });

  it("fetches a year", async () => {
    await fetchCpdYear(PASSPORT_ID, 2026);
    expect(api.get).toHaveBeenCalledWith(`/passport/${PASSPORT_ID}/cpd/2026`);
  });

  it("amends an activity within its year", async () => {
    await amendCpdEntry(PASSPORT_ID, 2026, "2026-02-11-171930", activity);
    expect(api.patch).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/cpd/2026/2026-02-11-171930`,
      activity,
    );
  });

  it("removes an activity", async () => {
    await removeCpdEntry(PASSPORT_ID, 2026, "2026-02-11-171930");
    expect(api.del).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/cpd/2026/2026-02-11-171930`,
    );
  });
});

describe("assessors", () => {
  it("previews an invitation by token in the query string", async () => {
    await previewAssessorInvite("tok123");
    expect(api.get).toHaveBeenCalledWith(
      "/passport/assessor-invites/preview?token=tok123",
    );
  });

  it("encodes a token carrying URL-significant characters", async () => {
    await previewAssessorInvite("a+b/c=d&e");
    expect(api.get).toHaveBeenCalledWith(
      "/passport/assessor-invites/preview?token=a%2Bb%2Fc%3Dd%26e",
    );
  });

  it("accepts an invitation", async () => {
    await acceptAssessorInvite({ token: "tok123" });
    expect(api.post).toHaveBeenCalledWith("/passport/assessor-invites/accept", {
      token: "tok123",
    });
  });

  it("revokes a membership with DELETE", async () => {
    await revokeAssessorMembership(42);
    expect(api.del).toHaveBeenCalledWith("/passport/assessors/42/membership");
  });
});

describe("path segment encoding", () => {
  it("encodes a record name so a stray slash cannot address another route", async () => {
    await removeCertificate(PASSPORT_ID, "odd/name");
    expect(api.del).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/certificates/odd%2Fname`,
    );
  });

  it("encodes a query-significant character in a record name", async () => {
    await removeReflection(PASSPORT_ID, "draft?v=2");
    expect(api.del).toHaveBeenCalledWith(
      `/passport/${PASSPORT_ID}/reflections/draft%3Fv%3D2`,
    );
  });
});
