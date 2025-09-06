import { useEffect, useState } from "react";

export default function Home() {
  const [message, setMessage] = useState<string>("…");

  useEffect(() => {
    const url =
      (process.env.NEXT_PUBLIC_API_URL || "/api") + "/hello?name=Quill";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setMessage(d.message))
      .catch(() => setMessage("Could not reach API"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Quill</h1>
      <p>Frontend talking to the backend through Caddy.</p>
      <p>
        <strong>API says:</strong> {message}
      </p>
      <p>
        Health check: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
