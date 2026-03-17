// ─────────────────────────────────────────────
// api/sendWhatsApp.js
// Vercel Serverless Function
// Sends WhatsApp message via AiSensy.
// Supports both TEXT and FILE (PDF) templates.
//
// Place in: root/api/sendWhatsApp.js
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { phone, templateName, variables, mediaUrl, mediaFilename } = req.body;

  if (!phone || !templateName || !variables) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Build media object — only for FILE type templates
    const media = mediaUrl
      ? {
          url:      mediaUrl,
          filename: mediaFilename || "Invoice.pdf",
        }
      : {};

    const response = await fetch("https://backend.aisensy.com/campaign/t1/api/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey:         process.env.AISENSY_API_KEY,
        campaignName:   templateName,
        destination:    "91" + phone,
        userName:       "FabricBill",
        templateParams: variables,
        media,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || "AiSensy error");

    return res.status(200).json({ success: true, data });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
