import { readFile } from "node:fs/promises";
import path from "node:path";

export async function serveAppAsset(pathname, response, method, distDir) {
  const normalized = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = safeJoinDist(distDir, normalized);
  if (filePath) {
    const asset = await tryReadFile(filePath);
    if (asset) {
      return file(response, 200, asset, getMimeType(filePath), method);
    }
  }

  if (path.extname(pathname)) {
    return false;
  }

  const indexPath = path.join(distDir, "index.html");
  const asset = await tryReadFile(indexPath);
  if (!asset) {
    return false;
  }

  return file(response, 200, asset, "text/html; charset=utf-8", method);
}

function safeJoinDist(distDir, relativePath) {
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = path.join(distDir, safePath);
  if (!candidate.startsWith(distDir)) {
    return null;
  }
  return candidate;
}

async function tryReadFile(filePath) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

function file(response, status, payload, contentType, method) {
  response.writeHead(status, {
    "Content-Type": contentType,
  });
  if (method === "HEAD") {
    response.end();
    return true;
  }
  response.end(payload);
  return true;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}
