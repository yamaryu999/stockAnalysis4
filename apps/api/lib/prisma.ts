import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Resolve relative SQLite path (e.g. file:./prisma/dev.db) to a real file
// when running inside a workspace (apps/api) during development.
function resolveDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith("file:")) return url;
  const p = url.slice("file:".length);
  // If already absolute (file:/abs/path), leave as is
  if (p.startsWith("/")) return url;
  // Try a few candidate bases to locate the db file
  const candidates = [
    path.resolve(process.cwd(), p),
    path.resolve(process.cwd(), "..", p),
    path.resolve(process.cwd(), "..", "..", p)
  ];
  const found = candidates.find((cand) => fs.existsSync(cand));
  if (found) {
    let rel = path.relative(process.cwd(), found);
    if (!rel.startsWith(".")) rel = `./${rel}`;
    // Use a relative file: URL to avoid absolute path issues
    return `file:${rel.replace(/\\/g, "/")}`;
  }
  // Fall back to resolving from repo root two levels up
  let fallback = path.resolve(process.cwd(), "..", "..", p);
  let rel = path.relative(process.cwd(), fallback);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return `file:${rel.replace(/\\/g, "/")}`;
}

const resolvedUrl = resolveDatabaseUrl(process.env.DATABASE_URL);
const options: Prisma.PrismaClientOptions | undefined = resolvedUrl
  ? { datasources: { db: { url: resolvedUrl } } }
  : undefined;
// eslint-disable-next-line no-console
if (resolvedUrl) console.log("[api] Prisma datasource:", resolvedUrl);

export const prisma = global.prisma || new PrismaClient(options);

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
