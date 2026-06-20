import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR || "data/uploads",
);

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export function ensureUploadDir(userId: number): string {
  const userDir = path.join(UPLOAD_DIR, String(userId));
  fs.mkdirSync(userDir, { recursive: true });
  return userDir;
}

export async function saveUploadedFile(
  userId: number,
  file: File,
): Promise<{ fileName: string; storagePath: string; fileUrl: string }> {
  const userDir = ensureUploadDir(userId);
  const ext = path.extname(file.name) || ".bin";
  const safeName = `${Date.now()}-${nanoid(8)}${ext}`;
  const storagePath = `${userId}/${safeName}`;
  const fullPath = path.join(userDir, safeName);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);

  return {
    fileName: file.name,
    storagePath,
    fileUrl: `/api/uploads/${storagePath}`,
  };
}

export function getFilePath(storagePath: string): string | null {
  const full = path.join(UPLOAD_DIR, storagePath);
  // Prevent directory traversal
  if (!full.startsWith(UPLOAD_DIR)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

export function readFileAsBase64(storagePath: string): string | null {
  const full = getFilePath(storagePath);
  if (!full) return null;
  return fs.readFileSync(full).toString("base64");
}
