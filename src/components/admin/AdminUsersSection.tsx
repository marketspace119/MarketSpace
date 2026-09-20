import React, { useState } from 'react';
import { Users, Shield, UserX, UserCheck, Search, Filter, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { User, UserRole } from '../../types';
import { userService } from '../../services/userService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminUsersSectionProps {
  users: User[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminUsersSection: React.FC<AdminUsersSectionProps> = ({
  users,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl } = useLanguage();

  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Confirmation modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'reactivate' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredUsers = users.filter((u) => {
    // Search query match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = String(u.displayName || '').toLowerCase().includes(q);
      const matchEmail = String(u.email || '').toLowerCase().includes(q);
      const matchPhone = String(u.phoneNumber || '').toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchPhone) return false;
    }

    // Role filter
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;

    // Status filter
    const userStatus = u.status || 'active';
    if (statusFilter !== 'all' && userStatus !== statusFilter) return false;

    return true;
  });

  const handleActionClick = (user: User, action: 'suspend' | 'reactivate') => {
    setErrorMessage(null);
    setSelectedUser(user);
    setActionType(action);
  };

  const handleConfirmAction = async () => {
    if (!selectedUser || !actionType) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const nextStatus = actionType === 'suspend' ? 'suspended' : 'active';
      await userService.updateUserStatus(
        selectedUser.id,
        nextStatus,
        currentUser.id,
        currentUser.role
      );
      setSelectedUser(null);
      setActionType(null);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Operation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Error alert if any */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filter and summary toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavUsers')}</h3>
            <p className="text-xs text-gray-500">
              {filteredUsers.length} of {users.length} accounts
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Role: All Roles</option>
            <option value="CUSTOMER">Customer</option>
            <option value="SELLER">Seller</option>
            <option value="RESTAURANT">Restaurant</option>
            <option value="SERVICE">Service</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Status: All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">User & Contact</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Registered At</th>
                <th className="px-4 py-3">Last Active</th>
                <th className="px-4 py-3 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSelf = user.id === currentUser.id;
                  const isSuperAdminTarget = user.role === 'SUPER_ADMIN';
                  const canModify =
                    !isSelf &&
                    (currentUser.role === 'SUPER_ADMIN' || !isSuperAdminTarget);
                  const isSuspended = user.status === 'suspended';

                  return (
                    <tr key={user.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 font-bold flex items-center justify-center shrink-0">
                            {user.displayName ? user.displayName[0].toUpperCase() : user.email ? user.email[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {user.displayName || 'Unnamed User'}
                              {isSelf && (
                                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 rounded">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-500">{user.email || 'No email'}</p>
                            {user.phoneNumber && (
                              <p className="text-[10px] text-gray-400 font-mono">{user.phoneNumber}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            user.role === 'SUPER_ADMIN'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : user.role === 'ADMIN'
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : user.role === 'SELLER'
                              ? 'bg-blue-100 text-blue-800'
                              : user.role === 'RESTAURANT'
                              ? 'bg-amber-100 text-amber-800'
                              : user.role === 'SERVICE_PROVIDER'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isSuspended
                              ? 'bg-red-100 text-red-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isSuspended ? t('suspend') : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canModify ? (
                          isSuspended ? (
                            <button
                              id={`reactivate-user-${user.id}`}
                              onClick={() => handleActionClick(user, 'reactivate')}
                              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>{t('reactivate')}</span>
                            </button>
                          ) : (
                            <button
                              id={`suspend-user-${user.id}`}
                              onClick={() => handleActionClick(user, 'suspend')}
                              className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>{t('suspend')}</span>
                            </button>
                          )
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">
                            {isSelf ? 'Self' : 'Protected'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AdminConfirmModal
        isOpen={!!selectedUser && !!actionType}
        title={actionType === 'suspend' ? 'Suspend User Account' : 'Reactivate User Account'}
        message={
          actionType === 'suspend'
            ? `Are you sure you want to suspend "${selectedUser?.displayName || selectedUser?.email}"? This user will be blocked from logging in, making orders, or managing vendor items. This action will be logged in the security audit trail.`
            : `Are you sure you want to reactivate "${selectedUser?.displayName || selectedUser?.email}"? Their access will be immediately restored.`
        }
        confirmLabel={actionType === 'suspend' ? 'Suspend Account' : 'Reactivate Account'}
        isDestructive={actionType === 'suspend'}
        isLoading={isProcessing}
        onConfirm={handleConfirmAction}
        onCancel={() => {
          setSelectedUser(null);
          setActionType(null);
        }}
      />
    </div>
  );
};
