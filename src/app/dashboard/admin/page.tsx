'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLang } from '@/lib/LanguageContext';
import { Mail, Users, UserPlus, ShieldAlert, Trash2, Coins, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminUsersPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-users'], queryFn: api.getAdminUsers });
  const { data: prices, isLoading: pricesLoading } = useQuery({ queryKey: ['admin-prices'], queryFn: api.getServicePrices });
  const { data: packages, isLoading: packagesLoading } = useQuery({ queryKey: ['admin-packages'], queryFn: api.getCreditPackages });

  const updateUser = useMutation({
    mutationFn: ({ id, credits }: { id: string; credits: number }) => api.updateAdminUser(id, { credits }),
    onSuccess: () => {
      toast.success('User credits updated');
      return qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update user'),
  });

  const deleteUser = useMutation({
    mutationFn: api.deleteAdminUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const updatePrice = useMutation({
    mutationFn: api.updateServicePrice,
    onSuccess: () => {
      toast.success('Price updated successfully');
      return qc.invalidateQueries({ queryKey: ['admin-prices'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update price'),
  });

  const updatePackage = useMutation({
    mutationFn: api.updateCreditPackage,
    onSuccess: () => {
      toast.success('Package updated successfully');
      return qc.invalidateQueries({ queryKey: ['admin-packages'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update package'),
  });

  const users = useMemo(() => data ?? [], [data]);
  const createdToday = useMemo(() => {
    const today = new Date();
    return users.filter((user) => {
      if (!user.created_at) return false;
      const d = new Date(user.created_at);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    }).length;
  }, [users]);


  return (
    <div>
      <div className="page-header">
        <h1 className="text-heading">{t('page_admin_title')}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.94rem', marginTop: 4 }}>
          {t('page_admin_sub')}
        </p>
      </div>

      <div className="page-body" style={{ display: 'grid', gap: 20 }}>
        <div className="grid-3">
          <div className="stat-card">
            <div className="stat-label"><Users size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Total Users</div>
            <div className="stat-value">{users.length}</div>
            <div className="stat-sub">Accounts in system</div>
          </div>
          <div className="stat-card">
            <div className="stat-label"><UserPlus size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Created Today</div>
            <div className="stat-value">{createdToday}</div>
            <div className="stat-sub">New registrations</div>
          </div>
          <div className="stat-card">
            <div className="stat-label"><Mail size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Email Coverage</div>
            <div className="stat-value">{users.filter((u) => !!u.email).length}</div>
            <div className="stat-sub">Users with valid email</div>
          </div>
        </div>


        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 className="text-subhead">{t('admin_users_list')}</h2>
            <span className="badge badge-gray">{users.length} users</span>
          </div>
          {isLoading ? <p>{t('loading')}</p> : null}
          {error ? <p style={{ color: 'var(--color-error)' }}>{(error as Error).message}</p> : null}
          {!isLoading && !error ? (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('label_email')}</th>
                    <th>{t('admin_name_col')}</th>
                    <th>Credits</th>
                    <th>{t('admin_created_col')}</th>
                    <th>{t('col_action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>{user.name}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="form-input"
                          style={{ width: 80 }}
                          defaultValue={user.credits ?? 0}
                          onBlur={(e) => {
                            const newCredits = Number(e.target.value);
                            if (newCredits !== (user.credits ?? 0) && newCredits >= 0) {
                              updateUser.mutate({ id: user.id, credits: newCredits });
                            }
                          }}
                        />
                      </td>
                      <td>{user.created_at ? new Date(user.created_at).toLocaleString() : '-'}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            if (confirm(`Delete ${user.email}?`)) deleteUser.mutate(user.id);
                          }}
                          disabled={deleteUser.isPending}
                        >
                          <Trash2 size={12} />
                          {t('admin_delete_btn')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>
                        {t('admin_empty')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Coins size={18} />
            <h2 className="text-subhead">Service Prices (Credits)</h2>
          </div>
          {pricesLoading ? <p>{t('loading')}</p> : null}
          {!pricesLoading && prices ? (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Service Name</th>
                    <th>Price (Credits)</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span style={{ fontWeight: 500 }}>
                          {({
                            generate_text: 'Generate Text',
                            generate_image: 'Generate Image',
                            generate_full_post: 'Generate Full Post',
                            generate_video: 'Generate Video',
                            idea_generation: 'Idea Generation',
                            studio_erase: '🖌️ Studio AI Erase',
                          } as Record<string, string>)[item.service_name] ?? item.service_name}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{item.service_name}</span>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          style={{ width: 100 }}
                          defaultValue={item.price}
                          onBlur={(e) => {
                            const newPrice = Number(e.target.value);
                            if (newPrice !== item.price && newPrice > 0) {
                              updatePrice.mutate({ service_name: item.service_name, price: newPrice });
                            }
                          }}
                        />
                      </td>
                      <td>
                        {updatePrice.isPending && updatePrice.variables?.service_name === item.service_name ? (
                          <Loader2 size={16} className="spin" style={{ color: 'var(--color-accent)' }} />
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Auto-saves on blur</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {prices.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ color: 'var(--color-text-muted)' }}>
                        No services found
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Coins size={18} />
            <h2 className="text-subhead">Credit Packages (Checkout)</h2>
          </div>
          {packagesLoading ? <p>{t('loading')}</p> : null}
          {!packagesLoading && packages ? (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Package Name</th>
                    <th>Credits</th>
                    <th>Price</th>
                    <th>Paymob URL</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg) => (
                    <tr key={pkg.id}>
                      <td>{pkg.name}</td>
                      <td>{pkg.credits}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          style={{ width: 100 }}
                          defaultValue={pkg.price_usd}
                          onBlur={(e) => {
                            const newPrice = Number(e.target.value);
                            if (newPrice !== pkg.price_usd && newPrice >= 0) {
                              updatePackage.mutate({ id: pkg.id, price_usd: newPrice });
                            }
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="https://..."
                          style={{ width: 300 }}
                          defaultValue={pkg.paymob_url || ''}
                          onBlur={(e) => {
                            const newUrl = e.target.value;
                            if (newUrl !== (pkg.paymob_url || '')) {
                              updatePackage.mutate({ id: pkg.id, paymob_url: newUrl });
                            }
                          }}
                        />
                      </td>
                      <td>
                        {updatePackage.isPending && updatePackage.variables?.id === pkg.id ? (
                          <Loader2 size={16} className="spin" style={{ color: 'var(--color-accent)' }} />
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Auto-saves on blur</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {packages.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>
                        No packages found
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
