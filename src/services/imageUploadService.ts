import { ref, deleteObject } from 'firebase/storage';
import { storage, auth } from '../lib/firebase';
import { sniffImageMagicBytes, inspectFileContent } from '../lib/imageSecurity';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface UploadProgressCallback {
  (progressPercent: number): void;
}

export const imageUploadService = {
  /**
   * Validates file MIME type, size boundaries, and binary magic bytes
   */
  async validateFile(file: File): Promise<{ isValid: boolean; error?: string }> {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        isValid: false,
        error: 'Only JPG, PNG, WEBP, and GIF images are allowed.',
      };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        isValid: false,
        error: 'Image file size exceeds the 5MB limit.',
      };
    }

    // Binary content inspection (Magic-Byte verification)
    const inspection = await inspectFileContent(file);
    if (!inspection.isValid) {
      return {
        isValid: false,
        error: inspection.error || 'Invalid or malformed image binary structure.',
      };
    }

    return { isValid: true };
  },

  /**
   * Synchronous validation for buffer or when binary array is provided directly
   */
  validateBuffer(buffer: Uint8Array | ArrayBuffer): { isValid: boolean; error?: string } {
    const inspection = sniffImageMagicBytes(buffer);
    return {
      isValid: inspection.isValid,
      error: inspection.error,
    };
  },

  /**
   * Uploads an image file mediated by the authoritative server verification gateway (V3-02 Remediation)
   */
  async uploadImage(
    file: File,
    sellerId: string,
    subfolder = 'products',
    onProgress?: UploadProgressCallback
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    const validation = await this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid image file');
    }

    if (onProgress) onProgress(20);

    // Convert file to base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

    if (onProgress) onProgress(50);

    // Get Auth token if user is signed in
    let token = '';
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        token = await currentUser.getIdToken();
      }
    } catch {}

    const res = await fetch('/api/images/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        data: base64Data,
        filename: file.name,
        sellerId,
        subfolder,
        declaredMimeType: file.type,
      }),
    });

    if (onProgress) onProgress(90);

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Image upload rejected by backend verification gateway');
    }

    if (onProgress) onProgress(100);

    return {
      downloadUrl: data.downloadUrl,
      storagePath: data.storagePath,
    };
  },

  /**
   * Deletes an image from Firebase Storage by path or URL
   */
  async deleteImage(storagePathOrUrl: string): Promise<void> {
    if (!storagePathOrUrl || storagePathOrUrl.startsWith('blob:') || storagePathOrUrl.startsWith('data:')) {
      return;
    }

    try {
      const storageRef = ref(storage, storagePathOrUrl);
      await deleteObject(storageRef);
    } catch (err) {
      console.warn('Could not delete image from Firebase Storage (may be external URL):', err);
    }
  },
};
