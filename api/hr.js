import { handleHrXlsx } from "../src/http-handlers.js";

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Nur POST." }));
    return;
  }
  await handleHrXlsx(req, res);
}
