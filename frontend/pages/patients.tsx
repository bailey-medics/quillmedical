import { useState } from "react";

const api = (p: string) => (process.env.NEXT_PUBLIC_API_URL || "/api") + p;
const hostGitLab =
  process.env.NEXT_PUBLIC_GIT_WEB_BASE || "http://localhost:3001";
const gitOwner = process.env.NEXT_PUBLIC_GIT_OWNER || "";

export default function Patients() {
  const [patientId, setPatientId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    repo?: string;
    patient_id?: string;
    error?: string;
  } | null>(null);

  // Generate a 22-character URL-safe ID from 128 bits of randomness (base64url, no padding)
  const id22 = () => {
    try {
      const bytes = new Uint8Array(16);
      (globalThis as any).crypto?.getRandomValues?.(bytes);
      let bin = "";
      for (let i = 0; i < bytes.length; i++)
        bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
      return b64; // length 22
    } catch {
      const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      let id = "";
      for (let i = 0; i < 22; i++)
        id += alphabet[Math.floor(Math.random() * alphabet.length)];
      return id;
    }
  };

  const createRepo = async () => {
    setBusy(true);
    setResult(null);
    try {
      const newId = id22();
      setPatientId(newId);
      const res = await fetch(api("/patients"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: newId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create");

      // Upsert minimal demographics (first/last name only)
      const demoRes = await fetch(
        api(`/patients/${encodeURIComponent(newId)}/demographics`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            given_name: firstName.trim(),
            family_name: lastName.trim(),
          }),
        }
      );
      if (!demoRes.ok) {
        const d = await demoRes.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to save demographics");
      }

      setResult({ repo: data.repo, patient_id: newId });
    } catch (e: any) {
      setResult({ error: e.message || "Unknown error" });
    } finally {
      setBusy(false);
    }
  };

  const repoUrl =
    result?.repo && gitOwner
      ? `${hostGitLab}/${encodeURIComponent(gitOwner)}/${encodeURIComponent(
          result.repo
        )}`
      : "";

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <h1>Create patient repository</h1>
      <p style={{ color: "#555" }}>
        Enter the patient's name. We'll generate a non-identifying 22-character
        ID and create their repo.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          First name222
          <input
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              marginTop: 6,
            }}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Jane"
            autoComplete="given-name"
          />
        </label>

        <label>
          Last name
          <input
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              marginTop: 6,
            }}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Smith"
            autoComplete="family-name"
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={createRepo}
            disabled={busy || !firstName.trim() || !lastName.trim()}
            style={{ padding: "8px 12px" }}
          >
            {busy ? "Creating…" : "Create repo"}
          </button>
        </div>

        {result?.repo && (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 12,
              background: "#f7fff7",
            }}
          >
            <strong>Created:</strong> <code>{result.repo}</code>
            {result.patient_id && (
              <div style={{ marginTop: 6 }}>
                Patient ID: <code>{result.patient_id}</code>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              View in Gitea:{" "}
              <a href={repoUrl} target="_blank" rel="noreferrer">
                {repoUrl}
              </a>
            </div>
          </div>
        )}

        {result?.error && (
          <div
            style={{
              border: "1px solid #f5c2c7",
              borderRadius: 8,
              padding: 12,
              background: "#fff5f5",
              color: "#b00020",
            }}
          >
            {result.error}
          </div>
        )}
      </div>
    </main>
  );
}
