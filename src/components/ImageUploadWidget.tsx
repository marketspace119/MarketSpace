import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { imageUploadService } from '../services/imageUploadService';

interface ImageUploadWidgetProps {
  value?: string;
  onChange: (url: string) => void;
  sellerId: string;
  folder?: string;
  label?: string;
  aspectRatio?: 'square' | 'video' | 'banner';
}

export const ImageUploadWidget: React.FC<ImageUploadWidgetProps> = ({
  value,
  onChange,
  sellerId,
  folder = 'products',
  label = 'صورة الصنف / المنتج',
  aspectRatio = 'square',
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [useUrlInput, setUseUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUpload(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processUpload(file);
  };

  const processUpload = async (file: File) => {
    setError(null);
    const validation = imageUploadService.validateFile(file);
    if (!validation.isValid) {
      setError(validation.error || 'الملف غير صالح');
      return;
    }

    try {
      setIsUploading(true);
      setProgress(10);
      const res = await imageUploadService.uploadImage(
        file,
        sellerId || 'anonymous_seller',
        folder,
        percent => {
          setProgress(percent);
        }
      );
      onChange(res.downloadUrl);
      setIsUploading(false);
    } catch (err: any) {
      setError(err.message || 'فشل رفع الصورة');
      setIsUploading(false);
    }
  };

  const aspectClass =
    aspectRatio === 'banner'
      ? 'aspect-[21/9]'
      : aspectRatio === 'video'
      ? 'aspect-video'
      : 'aspect-square max-h-48';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setUseUrlInput(!useUrlInput)}
          className="text-[11px] text-[#0E11B7] dark:text-blue-400 hover:underline"
        >
          {useUrlInput ? 'استخدام رفع الملفات' : 'إدخال رابط URL مباشرة'}
        </button>
      </div>

      {useUrlInput ? (
        <div>
          <input
            type="url"
            placeholder="https://images.unsplash.com/..."
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
          />
        </div>
      ) : (
        <div>
          {value ? (
            <div className={`relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 ${aspectClass} bg-gray-100 dark:bg-gray-800 group`}>
              <img
                src={value}
                alt="Uploaded asset"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white/90 hover:bg-white text-gray-900 px-3 py-1.5 rounded-lg text-xs font-bold shadow"
                >
                  تغيير الصورة
                </button>
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg shadow"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-[#0E11B7] dark:hover:border-blue-500 bg-gray-50/60 dark:bg-gray-800/40 transition flex flex-col items-center justify-center gap-2 ${aspectClass}`}
            >
              {isUploading ? (
                <div className="w-full max-w-xs space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0E11B7] mx-auto" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                    جاري رفع الصورة... {progress}%
                  </span>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0E11B7] h-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#0E11B7] flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-[#0E11B7] hover:underline">اضغط لاختيار صورة</span> أو اسحبها إلى هنا
                  </div>
                  <span className="text-[10px] text-gray-400">
                    JPG, PNG, WEBP حتى 5 ميجابايت
                  </span>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-red-500 text-xs mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
