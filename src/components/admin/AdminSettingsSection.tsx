import React, { useState, useEffect } from 'react';
import { Settings, Shield, ShieldAlert, Lock, Save, DollarSign, CheckCircle2, AlertTriangle, CreditCard, ToggleLeft, ToggleRight } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { PlatformSettings, User } from '../../types';
import { platformSettingsService } from '../../services/platformSettingsService';

interface AdminSettingsSectionProps {
  currentUser: User;
  onRefresh: () => void;
}

export const AdminSettingsSection: React.FC<AdminSettingsSectionProps> = ({ currentUser, onRefresh }) => {
  const { t, isRtl } = useLanguage();

  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const s = await platformSettingsService.getSettings();
      const normalized: PlatformSettings = {
        ...s,
        mobileMoneyAccounts: s.mobileMoneyAccounts || {
          evcPlus: { accountNumber: s.evcPlusMerchantNumber || '+252 612 4949 52', accountName: 'MarketSpace HQ EVC' },
          zaad: { accountNumber: s.zaadMerchantNumber || '+252 634 1122 33', accountName: 'MarketSpace HQ Zaad' },
          sahall: { accountNumber: s.sahalMerchantNumber || '+252 907 8899 00', accountName: 'MarketSpace HQ Sahal' },
        },
        autoApproveSellers: s.autoApproveSellers ?? false,
        autoApproveProducts: s.autoApproveProducts ?? false,
        maintenanceMode: s.maintenanceMode ?? false,
      };
      setSettings(normalized);
    };
    load();
  }, []);

  if (!settings) {
    return (
      <div className="p-8 text-center text-xs text-gray-500">
        Loading platform governance settings...
      </div>
    );
  }

  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await platformSettingsService.updateSettings(settings, currentUser.id, currentUser.role);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onRefresh();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavSettings')}</h3>
            <p className="text-xs text-gray-500">
              Platform fees, payment rails & governance parameters
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{t('saveSettings')}</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Platform settings successfully saved and audited to security ledger.</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded-2xl flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Commission & Fees */}
      <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span>{t('commissionSettings')}</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Default Platform Commission (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={settings.defaultCommissionRate}
              onChange={(e) =>
                setSettings({ ...settings, defaultCommissionRate: Number(e.target.value) })
              }
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Applied automatically to all vendor sub-orders unless overridden per store.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Minimum Payout Threshold ($)
            </label>
            <input
              type="number"
              min="5"
              step="5"
              value={settings.minimumPayoutAmount}
              onChange={(e) =>
                setSettings({ ...settings, minimumPayoutAmount: Number(e.target.value) })
              }
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Minimum balance required before a vendor can submit a payout request.
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Money Rails Configuration */}
      <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-600" />
          <span>Somalia Mobile Money Merchant Accounts (MANUAL_TRANSFER)</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* EVC Plus */}
          <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
            <h5 className="font-bold text-gray-900">EVC Plus (Hormuud)</h5>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Merchant Dial / Account #</label>
              <input
                type="text"
                value={settings.mobileMoneyAccounts.evcPlus.accountNumber}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mobileMoneyAccounts: {
                      ...settings.mobileMoneyAccounts,
                      evcPlus: { ...settings.mobileMoneyAccounts.evcPlus, accountNumber: e.target.value },
                    },
                  })
                }
                className="w-full p-2 text-xs bg-white border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Account Name</label>
              <input
                type="text"
                value={settings.mobileMoneyAccounts.evcPlus.accountName}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mobileMoneyAccounts: {
                      ...settings.mobileMoneyAccounts,
                      evcPlus: { ...settings.mobileMoneyAccounts.evcPlus, accountName: e.target.value },
                    },
                  })
                }
                className="w-full p-2 text-xs bg-white border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          {/* Zaad */}
          <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
            <h5 className="font-bold text-gray-900">Zaad (Telesom)</h5>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Merchant Account #</label>
              <input
                type="text"
                value={settings.mobileMoneyAccounts.zaad.accountNumber}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mobileMoneyAccounts: {
                      ...settings.mobileMoneyAccounts,
                      zaad: { ...settings.mobileMoneyAccounts.zaad, accountNumber: e.target.value },
                    },
                  })
                }
                className="w-full p-2 text-xs bg-white border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Account Name</label>
              <input
                type="text"
                value={settings.mobileMoneyAccounts.zaad.accountName}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mobileMoneyAccounts: {
                      ...settings.mobileMoneyAccounts,
                      zaad: { ...settings.mobileMoneyAccounts.zaad, accountName: e.target.value },
                    },
                  })
                }
                className="w-full p-2 text-xs bg-white border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          {/* Sahal */}
          <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
            <h5 className="font-bold text-gray-900">Sahal (Golis)</h5>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Merchant Account #</label>
              <input
                type="text"
                value={settings.mobileMoneyAccounts.sahall.accountNumber}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mobileMoneyAccounts: {
                      ...settings.mobileMoneyAccounts,
                      sahall: { ...settings.mobileMoneyAccounts.sahall, accountNumber: e.target.value },
                    },
                  })
                }
                className="w-full p-2 text-xs bg-white border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Account Name</label>
              <input
                type="text"
                value={settings.mobileMoneyAccounts.sahall.accountName}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mobileMoneyAccounts: {
                      ...settings.mobileMoneyAccounts,
                      sahall: { ...settings.mobileMoneyAccounts.sahall, accountName: e.target.value },
                    },
                  })
                }
                className="w-full p-2 text-xs bg-white border border-gray-200 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Credit / Debit Card Gate Policy */}
      <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-3">
        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-gray-400" />
          <span>Card Payment Gateway (Visa / Mastercard)</span>
        </h4>
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <p className="font-bold text-gray-700">Cards Gateway Integration Status: DISABLED</p>
            <p className="text-gray-500">
              {t('cardDisabledNotice')}
            </p>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-bold bg-gray-200 text-gray-600 rounded-md">
            LOCKED (PCI-DSS)
          </span>
        </div>
      </div>

      {/* Governance & Moderation Rules */}
      <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-600" />
          <span>Catalog & Marketplace Governance</span>
        </h4>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="font-bold text-gray-900">Auto-Approve Seller Registrations</p>
              <p className="text-gray-500">When false, sellers remain pending until admin review.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings({ ...settings, autoApproveSellers: !settings.autoApproveSellers })
              }
              className={`p-1 rounded-lg transition-colors ${
                settings.autoApproveSellers ? 'text-indigo-600' : 'text-gray-400'
              }`}
            >
              {settings.autoApproveSellers ? (
                <ToggleRight className="w-8 h-8" />
              ) : (
                <ToggleLeft className="w-8 h-8" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="font-bold text-gray-900">Auto-Approve Product Listings</p>
              <p className="text-gray-500">When false, new products require admin inspection before going live.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings({ ...settings, autoApproveProducts: !settings.autoApproveProducts })
              }
              className={`p-1 rounded-lg transition-colors ${
                settings.autoApproveProducts ? 'text-indigo-600' : 'text-gray-400'
              }`}
            >
              {settings.autoApproveProducts ? (
                <ToggleRight className="w-8 h-8" />
              ) : (
                <ToggleLeft className="w-8 h-8" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="font-bold text-gray-900">Platform Maintenance Mode</p>
              <p className="text-gray-500">Temporarily disables checkout for maintenance (Super Admin only).</p>
            </div>
            <button
              type="button"
              disabled={!isSuperAdmin}
              onClick={() =>
                setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })
              }
              className={`p-1 rounded-lg transition-colors ${
                settings.maintenanceMode ? 'text-red-600' : 'text-gray-400'
              } disabled:opacity-30`}
            >
              {settings.maintenanceMode ? (
                <ToggleRight className="w-8 h-8" />
              ) : (
                <ToggleLeft className="w-8 h-8" />
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
};
