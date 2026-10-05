import { describe, expect, it } from "vitest";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "./links";

describe("legal links", () => {
  it("points at the published pages on the public site", () => {
    expect(TERMS_OF_SERVICE_URL).toBe(
      "https://quill-medical.com/terms-of-service",
    );
    expect(PRIVACY_POLICY_URL).toBe("https://quill-medical.com/privacy-policy");
  });
});
