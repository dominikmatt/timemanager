export function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) {
    throw new Error("Kein multipart-boundary im Content-Type.");
  }
  const boundary = match[1] || match[2];
  const raw = buffer.toString("latin1");
  const splitter = `--${boundary}`;
  const files = {};
  for (const chunk of raw.split(splitter)) {
    if (!chunk || chunk === "--" || chunk.startsWith("--")) continue;
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headers = chunk.slice(0, headerEnd);
    let body = chunk.slice(headerEnd + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);
    const name = /name="([^"]+)"/i.exec(headers)?.[1];
    if (!name) continue;
    const filename = /filename="([^"]*)"/i.exec(headers)?.[1] || "";
    if (!files[name]) files[name] = [];
    files[name].push({
      filename,
      buffer: Buffer.from(body, "latin1"),
    });
  }
  return files;
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}
