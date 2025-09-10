import { useEffect, useState } from "react";

const api = (p: string) => (process.env.NEXT_PUBLIC_API_URL || "/api") + p;

type Patient = {
  repo: string;
  demographics: Record<string, any> | null;
};

export default function PatientsList() {
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(api("/patients"));
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to load patients");
        }
        const data = await res.json();
        if (mounted) setPatients(data.patients || []);
      } catch (e: any) {
        if (mounted) setError(e.message || "Unknown error");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <h1>All patients</h1>

      {loading && <div>Loading…</div>}
      {error && (
        <div
          style={{
            color: "#b00020",
            background: "#fff5f5",
            padding: 12,
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      {!loading && patients.length === 0 && <div>No patients found</div>}

      {!loading && patients.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            marginTop: 16,
            display: "grid",
            gap: 12,
          }}
        >
          {patients.map((p) => (
            <li
              key={p.repo}
              style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}
            >
              <div>
                <strong>{p.repo}</strong>
              </div>
              {p.demographics ? (
                <div style={{ marginTop: 8, color: "#333" }}>
                  <div>
                    Name:{" "}
                    <strong>
                      {(p.demographics.given_name || "").trim()}{" "}
                      {(p.demographics.family_name || "").trim()}
                    </strong>
                  </div>
                  {p.demographics.date_of_birth && (
                    <div>DOB: {p.demographics.date_of_birth}</div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 8, color: "#666" }}>
                  No demographics
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
