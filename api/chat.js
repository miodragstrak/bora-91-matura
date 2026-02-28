export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await fetch(
      "https://mstrak.app.n8n.cloud/webhook/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      }
    );

    const text = await response.text();
  const parsed = JSON.parse(text);

  let reply = "Razredni AI se zbunio 😄";

  if (parsed.output && parsed.output.length > 0) {
    const first = parsed.output[0];

    if (first.content && Array.isArray(first.content) && first.content.length > 0) {
      const item = first.content[0];

      if (typeof item === "string") {
        reply = item;
      } else if (item.text) {
        reply = item.text;
      }
    }
  }

  return res.status(200).json({ reply });

  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ error: "Proxy failed" });
  }
}