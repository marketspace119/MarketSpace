import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/firebase';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface UploadProgressCallback {
  (progressPercent: number): void;
}

export const imageUploadService = {
  /**
   * Validates file MIME type and size boundaries
   */
  validateFile(file: File): { isValid: boolean; error?: string } {
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

    return { isValid: true };
  },

  /**
   * Uploads an image file to Firebase Storage with strict seller path segregation
   */
  async uploadImage(
    file: File,
    sellerId: string,
    subfolder = 'products',
    onProgress?: UploadProgressCallback
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    const validation = this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid image file');
    }

    // Path segregation: sellers/{sellerId}/{subfolder}/{timestamp}_{sanitizedName}
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `sellers/${sellerId}/${subfolder}/${Date.now()}_${cleanFileName}`;
    const storageRef = ref(storage, storagePath);

    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      uploadTask.on(
        'state_changed',
        snapshot => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(Math.round(progress));
          }
        },
        error => {
          console.error('[ImageUpload:Error] Firebase storage upload failed:', error);
          reject(new Error(`فشل رفع الصورة إلى خادم التخزين السحابي: ${error.message || 'Storage upload error'}`));
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({ downloadUrl, storagePath });
          } catch (err: any) {
            console.error('[ImageUpload:Error] Failed to retrieve download URL:', err);
            reject(new Error(`فشل استخراج رابط الصورة المعتمد من السحابة: ${err?.message || err}`));
          }
        }
      );
    });
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
