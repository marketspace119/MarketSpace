import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Home,
  Briefcase,
  Bookmark,
  ArrowRight,
  Phone,
  AlertCircle,
  Building,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { SavedAddress } from '../types';
import { addressService } from '../services/addressService';

interface AddressesPageProps {
  onNavigate: (path: string) => void;
}

export const AddressesPage: React.FC<AddressesPageProps> = ({ onNavigate }) => {
  const { language, t, isRTL } = useLanguage();
  const { user } = useAuth();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);

  // Form fields
  const [label, setLabel] = useState<'HOME' | 'WORK' | 'OTHER'>('HOME');
  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Mogadishu');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAddresses = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const list = await addressService.getUserAddresses(user.id);
      setAddresses(list);
    } catch (err) {
      console.error('Failed to load addresses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, [user]);

  const openAddModal = () => {
    setEditingAddress(null);
    setLabel('HOME');
    setRecipientName((user as any)?.displayName || user?.name || '');
    setPhone((user as any)?.phoneNumber || user?.phone || '');
    setCity('Mogadishu');
    setDistrict('');
    setAddress('');
    setLandmark('');
    setDeliveryNotes('');
    setIsDefault(addresses.length === 0);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (addr: SavedAddress) => {
    setEditingAddress(addr);
    const normalizedLabel = (addr.label || 'HOME').toUpperCase();
    setLabel(normalizedLabel === 'WORK' ? 'WORK' : normalizedLabel === 'OTHER' ? 'OTHER' : 'HOME');
    setRecipientName(addr.recipientName);
    setPhone(addr.phone);
    setCity(addr.city);
    setDistrict(addr.district || '');
    setAddress(addr.address);
    setLandmark(addr.landmark || '');
    setDeliveryNotes(addr.deliveryNotes || '');
    setIsDefault(addr.isDefault);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!recipientName.trim() || !phone.trim() || !address.trim()) {
      setFormError(
        language === 'ar'
          ? 'يرجى إدخال اسم المستلم، الهاتف، والعنوان بالتفصيل.'
          : 'Please complete all required fields.'
      );
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingAddress) {
        await addressService.updateAddress(editingAddress.id, {
          label,
          recipientName: recipientName.trim(),
          phone: phone.trim(),
          city,
          district: district.trim() || undefined,
          address: address.trim(),
          landmark: landmark.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
          isDefault,
        });
      } else {
        await addressService.createAddress({
          userId: user.id,
          label,
          recipientName: recipientName.trim(),
          phone: phone.trim(),
          city,
          district: district.trim() || undefined,
          address: address.trim(),
          landmark: landmark.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
          isDefault: isDefault || addresses.length === 0,
        });
      }

      await loadAddresses();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save address');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا العنوان؟' : 'Delete this address?')) {
      return;
    }
    try {
      await addressService.deleteAddress(id);
      await loadAddresses();
    } catch (err) {
      console.error('Failed to delete address:', err);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await addressService.setDefaultAddress(id);
      await loadAddresses();
    } catch (err) {
      console.error('Failed to set default address:', err);
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          {t('addressBook')}
        </h2>
        <p className="text-xs text-gray-500 mb-6">
          {language === 'ar' ? 'يرجى تسجيل الدخول للوصول إلى دفتر العناوين الخاص بك.' : 'Please sign in to manage your saved delivery addresses.'}
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/login')}
          className="h-10 px-6 rounded-full bg-[#0E11B7] text-white font-bold text-xs shadow-md"
        >
          {t('login')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-[#293142]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-[#0E11B7]/10 dark:bg-[#0E11B7]/20 text-[#0E11B7] dark:text-[#3B82F6] flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 dark:text-white">
                {t('addressBook')}
              </h1>
              <p className="text-xs text-gray-500">
                {language === 'ar'
                  ? 'إدارة عناوين التوصيل لاستخدامها أثناء إتمام الطلبات بكل سهولة.'
                  : 'Manage delivery addresses for fast and reliable order fulfillment.'}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="h-10 px-5 rounded-full bg-[#0E11B7] hover:bg-[#0C0EA0] text-white font-bold text-xs flex items-center gap-2 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>{t('addNewAddress')}</span>
        </button>
      </div>

      {/* Address Cards List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="h-40 rounded-3xl bg-gray-100 dark:bg-[#151A23] animate-pulse" />
          ))}
        </div>
      ) : addresses.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142]">
          <MapPin className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-1">
            {t('noSavedAddresses')}
          </h3>
          <p className="text-xs text-gray-500 mb-5">
            {language === 'ar' ? 'لم تقم بحفظ أي عناوين بعد. أضف عنوانك الأول الآن!' : 'You have not added any delivery addresses yet.'}
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="h-10 px-5 rounded-full bg-[#0E11B7] text-white font-bold text-xs"
          >
            {t('addNewAddress')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map(addr => (
            <div
              key={addr.id}
              className={`p-5 rounded-3xl border transition-all space-y-3 flex flex-col justify-between ${
                addr.isDefault
                  ? 'bg-white dark:bg-[#151A23] border-[#0E11B7] shadow-sm'
                  : 'bg-white dark:bg-[#151A23] border-gray-200 dark:border-[#293142]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-[#293142]">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-gray-100 dark:bg-[#111722] text-[#0E11B7]">
                      {addr.label === 'HOME' && <Home className="w-4 h-4" />}
                      {addr.label === 'WORK' && <Briefcase className="w-4 h-4" />}
                      {addr.label === 'OTHER' && <Bookmark className="w-4 h-4" />}
                    </span>
                    <span className="font-black text-xs text-gray-900 dark:text-white">
                      {addr.label === 'HOME' ? t('labelHome') : addr.label === 'WORK' ? t('labelWork') : t('labelOther')}
                    </span>
                  </div>

                  {addr.isDefault ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#0E11B7] dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                      {t('defaultAddressBadge')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(addr.id)}
                      className="text-[10px] font-bold text-gray-400 hover:text-[#0E11B7] transition"
                    >
                      {t('setAsDefaultAddress')}
                    </button>
                  )}
                </div>

                <div className="pt-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <p className="font-bold text-gray-900 dark:text-white text-sm">
                    {addr.recipientName}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{addr.phone}</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span>
                      {addr.city}{addr.district ? `, ${addr.district}` : ''} - {addr.address}
                    </span>
                  </p>
                  {addr.landmark && (
                    <p className="text-[11px] text-gray-500 pl-5">
                      {t('landmark')}: {addr.landmark}
                    </p>
                  )}
                  {addr.deliveryNotes && (
                    <p className="text-[11px] text-gray-500 italic pl-5">
                      "{addr.deliveryNotes}"
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-gray-100 dark:border-[#293142] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(addr)}
                  className="h-8 px-3 rounded-lg bg-gray-100 dark:bg-[#111722] hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-xs font-bold flex items-center gap-1 transition"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{t('editAddress')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(addr.id)}
                  className="h-8 px-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('deleteAddress')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#293142]">
              <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#0E11B7]" />
                <span>{editingAddress ? t('editAddress') : t('addNewAddress')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#111722] text-gray-500 hover:text-gray-900 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              {/* Label selector */}
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  {language === 'ar' ? 'تصنيف العنوان:' : 'Address Label:'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['HOME', 'WORK', 'OTHER'] as const).map(lbl => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setLabel(lbl)}
                      className={`h-9 rounded-xl font-bold border flex items-center justify-center gap-1.5 transition ${
                        label === lbl
                          ? 'bg-[#0E11B7] text-white border-[#0E11B7]'
                          : 'bg-gray-50 dark:bg-[#111722] border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {lbl === 'HOME' && <Home className="w-3.5 h-3.5" />}
                      {lbl === 'WORK' && <Briefcase className="w-3.5 h-3.5" />}
                      {lbl === 'OTHER' && <Bookmark className="w-3.5 h-3.5" />}
                      <span>{lbl === 'HOME' ? t('labelHome') : lbl === 'WORK' ? t('labelWork') : t('labelOther')}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t('fullName')} *
                </label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  placeholder="محمد أحمد عثمان"
                  className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t('phoneNumber')} *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+252 61..."
                  className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    {t('city')} *
                  </label>
                  <select
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                  >
                    <option value="Mogadishu">Mogadishu (مقديشو)</option>
                    <option value="Hargeisa">Hargeisa (هرجيسا)</option>
                    <option value="Kismayo">Kismayo (كسمايو)</option>
                    <option value="Garowe">Garowe (غاروي)</option>
                    <option value="Baidoa">Baidoa (بيدوا)</option>
                    <option value="International">International</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    {t('district')}
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={e => setDistrict(e.target.value)}
                    placeholder="حي هودن / حي وابري..."
                    className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t('deliveryAddress')} *
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="الشارع، رقم المبنى، الشقة..."
                  className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t('landmark')}
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={e => setLandmark(e.target.value)}
                  placeholder="بجوار مجمع النور / خلف فندق مكة..."
                  className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {language === 'ar' ? 'ملاحظات وتوجيهات للتوصيل' : 'Delivery Instructions'}
                </label>
                <textarea
                  rows={2}
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={language === 'ar' ? 'اتصل عند البوابة الرئيسية...' : 'Call upon arrival at the gate...'}
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={e => setIsDefault(e.target.checked)}
                  className="rounded text-[#0E11B7] focus:ring-[#0E11B7]"
                />
                <span className="font-bold text-gray-800 dark:text-gray-200">
                  {t('setAsDefaultAddress')}
                </span>
              </label>

              <div className="pt-3 border-t border-gray-100 dark:border-[#293142] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300 font-bold"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 px-6 rounded-xl bg-[#0E11B7] text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (language === 'ar' ? 'حفظ العنوان' : 'Save Address')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
