/**
 * IMAGE CONTENT SECURITY & BINARY MAGIC-BYTE SNIFFER
 * Enforces deep inspection of file headers to prevent Content-Type spoofing,
 * polyglot payloads, SVG/HTML XSS vectors, and disguised executables.
 */

export type SupportedImageFormat = 'png' | 'jpeg' | 'webp' | 'gif';

export interface ImageInspectionResult {
  isValid: boolean;
  detectedFormat?: SupportedImageFormat;
  mimeType?: string;
  error?: string;
  byteSignature?: string;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function sniffImageMagicBytes(
  input: Uint8Array | ArrayBuffer | Buffer
): ImageInspectionResult {
  const bytes = input instanceof Uint8Array
    ? input
    : (typeof Buffer !== 'undefined' && Buffer.isBuffer(input))
      ? new Uint8Array(input)
      : new Uint8Array(input);

  if (!bytes || bytes.length === 0) {
    return { isValid: false, error: 'Empty file payload' };
  }

  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `Image file size (${(bytes.length / (1024 * 1024)).toFixed(2)}MB) exceeds 5MB limit`,
    };
  }

  if (bytes.length < 12) {
    return { isValid: false, error: 'File header too small to verify legitimate image structure' };
  }

  // 1. Disguised Executable Check (MZ / PE for Windows, ELF for Linux, Mach-O for macOS)
  if (bytes[0] === 0x4D && bytes[1] === 0x5A) {
    return { isValid: false, error: 'Security violation: Executable Windows/DOS binary (MZ) detected' };
  }
  if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
    return { isValid: false, error: 'Security violation: Executable Linux binary (ELF) detected' };
  }
  if (
    (bytes[0] === 0xFE && bytes[1] === 0xED && bytes[2] === 0xFA && (bytes[3] === 0xCE || bytes[3] === 0xCF)) ||
    (bytes[0] === 0xCF && bytes[1] === 0xFA && bytes[2] === 0xED && bytes[3] === 0xFE)
  ) {
    return { isValid: false, error: 'Security violation: Executable macOS Mach-O binary detected' };
  }

  // 2. Disguised Script / HTML / XML / SVG & Polyglot Payload Check (Anti-XSS / SUSPECT-01)
  // Scan up to 64KB of the binary payload for embedded PHP, HTML/JS scripts, SVG, or executable shell payloads
  const scanLen = Math.min(bytes.length, 65536);
  let asciiWindow = '';
  for (let i = 0; i < scanLen; i++) {
    const b = bytes[i];
    asciiWindow += (b >= 32 && b <= 126) ? String.fromCharCode(b) : ' ';
  }
  const lowerWindow = asciiWindow.toLowerCase();

  if (
    lowerWindow.includes('<svg') ||
    lowerWindow.includes('xmlns="http://www.w3.org/2000/svg"')
  ) {
    return {
      isValid: false,
      error: 'SVG vector graphics are prohibited. Only raster PNG, JPEG, and WebP images are permitted.',
    };
  }

  const polyglotPatterns = [
    '<html',
    '<!doctype',
    '<script',
    '<iframe',
    '<object',
    '<embed',
    '<?php',
    '<%=',
    'javascript:',
    'onerror=',
    'onload=',
    '#!/bin/sh',
    '#!/bin/bash',
    'eval(',
    'base64_decode(',
    'system(',
    'shell_exec(',
  ];

  for (const sig of polyglotPatterns) {
    if (lowerWindow.includes(sig)) {
      return {
        isValid: false,
        error: `Security violation: HTML/script or executable polyglot payload (${sig}) detected inside image file`,
      };
    }
  }

  // 3. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 && // 'P'
    bytes[2] === 0x4E && // 'N'
    bytes[3] === 0x47 && // 'G'
    bytes[4] === 0x0D &&
    bytes[5] === 0x0A &&
    bytes[6] === 0x1A &&
    bytes[7] === 0x0A
  ) {
    return {
      isValid: true,
      detectedFormat: 'png',
      mimeType: 'image/png',
      byteSignature: 'PNG_89504E47',
    };
  }

  // 4. JPEG / JFIF / EXIF: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return {
      isValid: true,
      detectedFormat: 'jpeg',
      mimeType: 'image/jpeg',
      byteSignature: 'JPEG_FFD8FF',
    };
  }

  // 5. WebP: 52 49 46 46 (RIFF) + offset 8: 57 45 42 50 (WEBP)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return {
      isValid: true,
      detectedFormat: 'webp',
      mimeType: 'image/webp',
      byteSignature: 'WEBP_RIFF_WEBP',
    };
  }

  // 6. GIF: GIF87a or GIF89a (47 49 46 38 37 61 or 47 49 46 38 39 61)
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return {
      isValid: true,
      detectedFormat: 'gif',
      mimeType: 'image/gif',
      byteSignature: 'GIF_474946',
    };
  }

  // Malformed or unrecognized
  return {
    isValid: false,
    error: 'Unrecognized image format: File header does not match valid PNG, JPEG, WebP, or GIF magic bytes',
  };
}

/**
 * Validates a file's binary content in the browser or Node environment.
 */
export async function inspectFileContent(file: File | Blob): Promise<ImageInspectionResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `Image file size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds 5MB limit`,
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = sniffImageMagicBytes(arrayBuffer);
    if (!result.isValid) return result;

    // Cross-verify against declared mime type if available
    if (file.type && !file.type.includes(result.detectedFormat || '')) {
      // Allow image/jpeg vs image/jpg
      const isJpegMatch = result.detectedFormat === 'jpeg' && (file.type === 'image/jpeg' || file.type === 'image/jpg');
      if (!isJpegMatch) {
        return {
          isValid: false,
          error: `MIME type spoofing detected: Declared '${file.type}' does not match binary format '${result.detectedFormat}'`,
        };
      }
    }

    return result;
  } catch (err: any) {
    return {
      isValid: false,
      error: `Failed to inspect file binary content: ${err.message || err}`,
    };
  }
}
