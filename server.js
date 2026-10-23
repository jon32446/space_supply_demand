import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/economy.js", ["economy.js", "text/javascript; charset=utf-8"]],
]);
const port = Number(process.env.PORT || 3000);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const file = files.get(path);
  if (!file || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const contents = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    console.error("Unable to serve file:", error);
    response.writeHead(500).end("Unable to load application");
  }
});
server.on("error", error => {
  console.error("Server failed:", error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => console.log(`Market lab: http://localhost:${server.address().port}`));
