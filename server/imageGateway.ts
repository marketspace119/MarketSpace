import { sniffImageMagicBytes, ImageInspectionResult } from '../src/lib/imageSecurity';
import { requireAuthenticatedCaller, getAdminStorage } from './firebaseAdmin';

export interface VerifyImagePayload {
  data: string; // base64 data URL or raw base64 string
  filename?: string;
  declaredMimeType?: string;
}

export interface VerifyImageResult extends ImageInspectionResult {
  filename?: string;
  byteLength?: number;
}

export interface UploadImagePayload {
  data: string; // base64 data URL or raw base64 string
  filename: string;
  sellerId?: string;
  userId?: string;
  subfolder?: string;
  declaredMimeType?: string;
}

export interface UploadImageResult {
  success: boolean;
  downloadUrl: string;
  storagePath: string;
  mimeType: string;
  detectedFormat: string;
  byteLength: number;
}

/**
 * Authoritative Server-side Image Verification Gateway
 * Enforces deep binary inspection on the backend before any image is accepted.
 */
export async function processImageVerificationGateway(
  payload: VerifyImagePayload,
  authHeader?: string
): Promise<VerifyImageResult> {
  // 1. Authoritative caller authentication
  await requireAuthenticatedCaller(authHeader);

  if (!payload || !payload.data) {
    throw new Error('Image data payload is required');
  }

  // 2. Decode base64
  let base64Data = payload.data;
  let declaredMime = payload.declaredMimeType;

  // Extract from data:image/xxx;base64,... header if present
  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      declaredMime = matches[1];
      base64Data = matches[2];
    } else {
      throw new Error('Invalid data URI format');
    }
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch (err: any) {
    throw new Error(`Failed to decode base64 image data: ${err.message}`);
  }

  if (buffer.length === 0) {
    throw new Error('Decoded image payload is empty');
  }

  // 3. Perform Deep Binary Magic-Byte Inspection
  const inspection = sniffImageMagicBytes(buffer);

  if (!inspection.isValid) {
    const errorMsg = inspection.error || 'Binary content inspection failed: Not a valid image';
    const err = new Error(errorMsg) as any;
    err.statusCode = 400;
    throw err;
  }

  // 4. Verify Against Declared MIME & Filename Extension (Anti-Spoofing)
  if (declaredMime && inspection.detectedFormat) {
    const isJpegMatch = inspection.detectedFormat === 'jpeg' && (declaredMime === 'image/jpeg' || declaredMime === 'image/jpg');
    if (!declaredMime.includes(inspection.detectedFormat) && !isJpegMatch) {
      const err = new Error(`MIME type spoofing detected: Declared '${declaredMime}' does not match binary format '${inspection.detectedFormat}'`) as any;
      err.statusCode = 400;
      throw err;
    }
  }

  if (payload.filename && inspection.detectedFormat) {
    const extMatch = payload.filename.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (extMatch) {
      const ext = extMatch[1];
      const allowedExts: Record<string, string[]> = {
        png: ['png'],
        jpeg: ['jpg', 'jpeg'],
        webp: ['webp'],
        gif: ['gif'],
      };
      const expected = allowedExts[inspection.detectedFormat] || [];
      if (!expected.includes(ext)) {
        const err = new Error(`Extension spoofing detected: Filename '${payload.filename}' (.${ext}) does not match binary format '${inspection.detectedFormat}'`) as any;
        err.statusCode = 400;
        throw err;
      }
    }
  }

  return {
    isValid: true,
    detectedFormat: inspection.detectedFormat,
    mimeType: inspection.mimeType,
    byteSignature: inspection.byteSignature,
    filename: payload.filename,
    byteLength: buffer.length,
  };
}

/**
 * Authoritative Server-side Image Upload Gateway (V3-02 Remediation)
 * Mediates all image uploads to guarantee magic-byte validation before persistence.
 */
export async function processImageUploadGateway(
  payload: UploadImagePayload,
  authHeader?: string
): Promise<UploadImageResult> {
  // 1. Authoritative caller authentication & tenant access check
  const caller = await requireAuthenticatedCaller(authHeader);

  if (!payload || !payload.data) {
    const err = new Error('Image data payload is required') as any;
    err.statusCode = 400;
    throw err;
  }

  const targetOwner = payload.sellerId || payload.userId || caller.uid;
  if (!caller.isPlatformAdmin && caller.uid !== targetOwner) {
    const err = new Error('Forbidden: You can only upload images to your own tenant directory') as any;
    err.statusCode = 403;
    throw err;
  }

  // 2. Decode base64
  let base64Data = payload.data;
  let declaredMime = payload.declaredMimeType;

  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      declaredMime = matches[1];
      base64Data = matches[2];
    } else {
      const err = new Error('Invalid data URI format') as any;
      err.statusCode = 400;
      throw err;
    }
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch (err: any) {
    const e = new Error(`Failed to decode base64 image data: ${err.message}`) as any;
    e.statusCode = 400;
    throw e;
  }

  if (buffer.length === 0) {
    const err = new Error('Decoded image payload is empty') as any;
    err.statusCode = 400;
    throw err;
  }

  // 3. Perform Deep Binary Magic-Byte Inspection
  const inspection = sniffImageMagicBytes(buffer);
  if (!inspection.isValid) {
    const errorMsg = inspection.error || 'Binary content inspection failed: Not a valid image';
    const err = new Error(errorMsg) as any;
    err.statusCode = 400;
    throw err;
  }

  // 4. Anti-Spoofing check (MIME + Filename Extension)
  if (declaredMime && inspection.detectedFormat) {
    const isJpegMatch = inspection.detectedFormat === 'jpeg' && (declaredMime === 'image/jpeg' || declaredMime === 'image/jpg');
    if (!declaredMime.includes(inspection.detectedFormat) && !isJpegMatch) {
      const err = new Error(`MIME type spoofing detected: Declared '${declaredMime}' does not match binary format '${inspection.detectedFormat}'`) as any;
      err.statusCode = 400;
      throw err;
    }
  }

  if (payload.filename && inspection.detectedFormat) {
    const extMatch = payload.filename.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (extMatch) {
      const ext = extMatch[1];
      const allowedExts: Record<string, string[]> = {
        png: ['png'],
        jpeg: ['jpg', 'jpeg'],
        webp: ['webp'],
        gif: ['gif'],
      };
      const expected = allowedExts[inspection.detectedFormat] || [];
      if (!expected.includes(ext)) {
        const err = new Error(`Extension spoofing detected: Filename '${payload.filename}' (.${ext}) does not match binary format '${inspection.detectedFormat}'`) as any;
        err.statusCode = 400;
        throw err;
      }
    }
  }

  // 5. Generate safe storage path
  const subfolder = (payload.subfolder || 'products').replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanName = (payload.filename || 'image.png').replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  const storagePath = payload.sellerId
    ? `sellers/${targetOwner}/${subfolder}/${timestamp}_${cleanName}`
    : `users/${targetOwner}/${timestamp}_${cleanName}`;

  let downloadUrl: string;

  try {
    const adminStorage = getAdminStorage();
    const bucket = adminStorage.bucket();
    const file = bucket.file(storagePath);
    await file.save(buffer, {
      metadata: {
        contentType: inspection.mimeType,
        metadata: {
          uploadedBy: caller.uid,
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  } catch (err: any) {
    console.error('[ImageGateway:Upload] Fatal Storage write failure (Fail-Closed):', err?.message || err);
    const storageErr = new Error(`Storage upload failed (Fail-Closed): ${err?.message || 'Unable to persist image to storage bucket'}`) as any;
    storageErr.statusCode = 503;
    throw storageErr;
  }

  return {
    success: true,
    downloadUrl,
    storagePath,
    mimeType: inspection.mimeType || 'image/png',
    detectedFormat: inspection.detectedFormat || 'png',
    byteLength: buffer.length,
  };
}

