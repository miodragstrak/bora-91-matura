export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await fetch(
      "https://mstrak.app.n8n.cloud/webhook/anegdote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return res.status(500).json({ error: "n8n error", raw: text });
    }

    return res.status(200).send(text);

  } catch (error) {
    return res.status(500).json({ error: "Proxy failed" });
  }
}