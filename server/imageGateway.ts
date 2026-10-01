import { sniffImageMagicBytes, ImageInspectionResult } from '../src/lib/imageSecurity';
import { requireAuthenticatedCaller } from './firebaseAdmin';

export interface VerifyImagePayload {
  data: string; // base64 data URL or raw base64 string
  filename?: string;
  declaredMimeType?: string;
}

export interface VerifyImageResult extends ImageInspectionResult {
  filename?: string;
  byteLength?: number;
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

  // 4. Verify Against Declared MIME (Anti-Spoofing)
  if (declaredMime && inspection.detectedFormat) {
    const isJpegMatch = inspection.detectedFormat === 'jpeg' && (declaredMime === 'image/jpeg' || declaredMime === 'image/jpg');
    if (!declaredMime.includes(inspection.detectedFormat) && !isJpegMatch) {
      const err = new Error(`MIME type spoofing detected: Declared '${declaredMime}' does not match binary format '${inspection.detectedFormat}'`) as any;
      err.statusCode = 400;
      throw err;
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
