export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = await new Promise((resolve) => {
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => resolve(data));
    });

    const parsedBody = JSON.parse(body);

    const response = await fetch(
      "https://mstrak.app.n8n.cloud/webhook/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedBody)
      }
    );

    const text = await response.text();

    if (!response.ok) {
      console.error("n8n error:", text);
      return res.status(500).json({ error: "n8n error", raw: text });
    }

    return res.status(200).send(text);

  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ error: "Proxy failed", details: error.message });
  }
}