import React, { useState } from 'react';
import { Package, Eye, EyeOff, CheckCircle2, XCircle, AlertTriangle, Layers } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Product, User } from '../../types';
import { productService } from '../../services/productService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminProductsSectionProps {
  products: Product[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminProductsSection: React.FC<AdminProductsSectionProps> = ({
  products,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl, language } = useLanguage();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [actionStatus, setActionStatus] = useState<'approved' | 'rejected' | 'hidden' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const getProductDisplayName = (p: Product | null | undefined, lang: string = 'ar'): string => {
    if (!p) return '';
    const loc = p.title || p.name;
    if (typeof loc === 'string') return loc;
    if (loc && typeof loc === 'object') {
      return (loc as any)[lang] || loc.ar || loc.en || loc.so || 'Product';
    }
    return p.id || 'Product';
  };

  const filteredProducts = products.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const loc = p.title || p.name;
      const titleAr = typeof loc === 'object' && loc?.ar ? loc.ar.toLowerCase() : '';
      const titleEn = typeof loc === 'object' && loc?.en ? loc.en.toLowerCase() : '';
      const titleStr = typeof (loc as any) === 'string' ? (loc as any).toLowerCase() : '';
      const matchTitle = titleAr.includes(q) || titleEn.includes(q) || titleStr.includes(q);
      const matchCat = p.category ? p.category.toLowerCase().includes(q) : false;
      const matchId = p.id ? p.id.toLowerCase().includes(q) : false;
      if (!matchTitle && !matchCat && !matchId) return false;
    }

    const currentStatus = p.status || (p.isPublished === false ? 'hidden' : 'approved');
    if (statusFilter !== 'all' && currentStatus !== statusFilter) return false;

    return true;
  });

  const handleAction = (product: Product, status: 'approved' | 'rejected' | 'hidden') => {
    setTargetProduct(product);
    setActionStatus(status);
  };

  const handleConfirm = async () => {
    if (!targetProduct || !actionStatus) return;
    setIsProcessing(true);
    try {
      productService.updateProductStatus(
        targetProduct.id,
        actionStatus,
        currentUser.id,
        currentUser.role
      );
      setTargetProduct(null);
      setActionStatus(null);
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavProducts')}</h3>
            <p className="text-xs text-gray-500">
              {filteredProducts.length} of {products.length} products listed
            </p>
          </div>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">{t('statusAll')}</option>
          <option value="approved">Approved & Active</option>
          <option value="pending">Pending Review</option>
          <option value="hidden">Hidden / Archived</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category / Mode</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock Level</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Moderation Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const pName = getProductDisplayName(p, language);
                  const currentStatus = p.status || (p.isPublished === false ? 'hidden' : 'approved');
                  const isHidden = currentStatus === 'hidden' || p.isPublished === false;
                  const isApproved = currentStatus === 'approved';
                  const prodId = String(p.id || '');

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100'}
                            alt={pName}
                            className="w-9 h-9 rounded-xl object-cover bg-gray-100 border border-gray-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <p className="font-semibold text-gray-900 truncate max-w-xs">{pName}</p>
                            <p className="text-[11px] text-gray-400 font-mono">ID: {prodId ? prodId.slice(-8) : '--------'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium text-[11px] capitalize">
                          {p.category} {p.inventoryMode ? `• ${p.inventoryMode}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        ${Number(p.price).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                            p.stock > 10
                              ? 'bg-emerald-50 text-emerald-700'
                              : p.stock > 0
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {p.stock} units
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isApproved
                              ? 'bg-emerald-100 text-emerald-800'
                              : isHidden
                              ? 'bg-gray-200 text-gray-700'
                              : currentStatus === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {currentStatus.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isHidden ? (
                            <button
                              onClick={() => handleAction(p, 'approved')}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t('restore')}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAction(p, 'hidden')}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>{t('hide')}</span>
                            </button>
                          )}

                          {currentStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleAction(p, 'approved')}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                              >
                                {t('approve')}
                              </button>
                              <button
                                onClick={() => handleAction(p, 'rejected')}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg"
                              >
                                {t('reject')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminConfirmModal
        isOpen={!!targetProduct && !!actionStatus}
        title="Confirm Product Moderation"
        message={`Are you sure you want to set "${getProductDisplayName(targetProduct, language)}" to "${actionStatus?.toUpperCase()}"?`}
        confirmLabel={t('confirmAction')}
        isDestructive={actionStatus === 'hidden' || actionStatus === 'rejected'}
        isLoading={isProcessing}
        onConfirm={handleConfirm}
        onCancel={() => {
          setTargetProduct(null);
          setActionStatus(null);
        }}
      />
    </div>
  );
};
