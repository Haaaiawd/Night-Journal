import { z } from "zod";
import { createRouter, authedQuery } from "../middleware";

/**
 * Upload router
 *
 * In a production app, this would generate presigned URLs for direct-to-OSS
 * uploads (e.g., Aliyun OSS, AWS S3, MinIO). The client uploads directly to
 * the object store, then reports the file info back to the backend via
 * `entries.createAttachment` (called from the entries router).
 *
 * For now, this returns a mock URL structure that the client can use.
 * Implement actual presigned URL generation when OSS credentials are configured.
 */

export const uploadRouter = createRouter({
  getUrl: authedQuery
    .input(
      z.object({
        fileName: z.string().min(1),
        fileType: z.string().min(1),
        // Optional: for multipart uploads
        partCount: z.number().int().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { fileName } = input;

      // Generate a unique path for the file
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).slice(2, 10);
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `uploads/${ctx.user.id}/${timestamp}-${randomStr}-${sanitizedFileName}`;

      // TODO: When OSS (e.g., Aliyun OSS, S3, MinIO) is configured:
      // 1. Generate a presigned PUT URL using OSS SDK
      // 2. Return the URL + key to the client
      // 3. Client uploads directly to the URL
      // 4. Client calls entries.createAttachment with the stored path
      //
      // Example with Aliyun OSS:
      // const presignedUrl = await ossClient.signatureUrl('PUT', key, { expires: 300 });
      // return { uploadUrl: presignedUrl, fileUrl: `https://cdn.example.com/${key}`, storagePath: key };

      // Placeholder response — implement with real OSS credentials
      const mockUploadUrl = `/api/upload/placeholder?key=${encodeURIComponent(key)}`;
      const mockFileUrl = `/api/files/${key}`;

      return {
        uploadUrl: mockUploadUrl,
        fileUrl: mockFileUrl,
        storagePath: key,
        expiresIn: 300, // 5 minutes
      };
    }),
});
