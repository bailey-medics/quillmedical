import { Button, Paper, Title, Text } from "@mantine/core";
import { useEffect, useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("…");
  useEffect(() => {
    fetch((process.env.NEXT_PUBLIC_API_URL || "/api") + "/hello?name=Quill")
      .then((r) => r.json())
      .then((d) => setMessage(d.message))
      .catch(() => setMessage("Could not reach API"));
  }, []);

  return (
    <Paper p="lg" radius="md" withBorder>
      <Title order={1}>Quill</Title>
      <Text mb="sm">Frontend talking to the backend through Caddy.</Text>
      <Text fw={700}>API says: {message}</Text>
      <Button mt="md" onClick={() => location.assign("/api/health")}>
        Check API health
      </Button>
      <p style={{ marginTop: 16 }}>
        Create a patient repo: <a href="/patients">/patients</a>
      </p>
    </Paper>
  );
}
