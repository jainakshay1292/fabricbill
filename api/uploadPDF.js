// ─────────────────────────────────────────────
// api/uploadPDF.js
// Vercel Serverless Function
// Receives a PDF (base64) from frontend,
// uploads it to Vercel Blob,
// returns a public URL for AiSensy to use.
//
// Place in: root/api/uploadPDF.js
// ─────────────────────────────────────────────

import { put } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { base64, filename } = req.body;

  if (!base64 || !filename) {
    return res.status(400).json({ error: "Missing base64 or filename" });
  }

  try {
    // Convert base64 string to Buffer
    const buffer = Buffer.from(base64, "base64");

    // Upload to Vercel Blob (public read)
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "application/pdf",
    });

    // blob.url is the public URL AiSensy needs
    return res.status(200).json({ success: true, url: blob.url });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
