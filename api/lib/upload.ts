import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR || "data/uploads",
);

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export function ensureUploadDir(userId: number): string {
  const userDir = path.join(UPLOAD_DIR, String(userId));
  fs.mkdirSync(userDir, { recursive: true });
  return userDir;
}

function validateFileName(name: string): void {
  if (!name || name.length > 255) {
    throw new Error("Invalid file name");
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("File name contains path traversal characters");
  }
}

export function validateUploadedFile(file: File): {
  ext: string;
  type: string;
} {
  if (!file || !(file instanceof File)) {
    throw new Error("No file provided");
  }
  if (file.size <= 0) {
    throw new Error("File is empty");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error(`File too large. Max allowed size is ${MAX_UPLOAD_SIZE / 1024 / 1024} MB`);
  }

  const fileName = file.name || "";
  const fileExt = path.extname(fileName).toLowerCase();
  const detectedType = file.type ? file.type.toLowerCase() : "";

  // Prefer the declared MIME type when it is in the allow list
  if (ALLOWED_MIME_TYPES.has(detectedType)) {
    return { ext: MIME_TO_EXT[detectedType], type: detectedType };
  }

  // Fallback: allow files whose extension maps to an allowed MIME type
  // (e.g. HEIC uploads may arrive as application/octet-stream)
  const mimeFromExt = fileExt ? EXT_TO_MIME[fileExt] : undefined;
  if (mimeFromExt) {
    return { ext: fileExt, type: mimeFromExt };
  }

  throw new Error(
    `File type not allowed. Allowed types: ${Object.keys(EXT_TO_MIME).join(", ")}`,
  );
}

export async function saveUploadedFile(
  userId: number,
  file: File,
): Promise<{ fileName: string; storagePath: string; fileUrl: string }> {
  const { ext } = validateUploadedFile(file);
  const userDir = ensureUploadDir(userId);
  const safeName = `${Date.now()}-${nanoid(8)}${ext}`;
  const storagePath = `${userId}/${safeName}`;
  const fullPath = path.join(userDir, safeName);

  validateFileName(safeName);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);

  return {
    fileName: file.name,
    storagePath,
    fileUrl: `/api/uploads/${storagePath}`,
  };
}

export function getFilePath(storagePath: string): string | null {
  if (!storagePath || storagePath.includes("..") || storagePath.includes("\\")) {
    return null;
  }

  const full = path.resolve(UPLOAD_DIR, storagePath);
  // Ensure the resolved path is still inside the upload directory
  if (!full.startsWith(UPLOAD_DIR + path.sep)) {
    return null;
  }
  if (!fs.existsSync(full)) {
    return null;
  }
  return full;
}

export function readFileAsBase64(storagePath: string): string | null {
  const full = getFilePath(storagePath);
  if (!full) return null;
  return fs.readFileSync(full).toString("base64");
}
