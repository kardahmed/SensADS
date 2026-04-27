/**
 * /admin/audit-logs — Journal d'audit (super_admin only).
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@sensads/core';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { supabase } from '@/lib/supabase';

interface AuditLogRow {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: unknown;
  new_values: unknown;
  ip_address: string | null;
  metadata: unknown;
  created_at: string;
}

export function AuditLogsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, search],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (search.trim()) {
        query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%`);
      }
      const { data: rows, count, error } = await query;
      if (error) throw error;
      return {
        rows: (rows ?? []) as AuditLogRow[],
        total: count ?? 0,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">{t('nav.audit')}</h1>
        <p className="mt-1 text-sm text-textSecondary">Journal des actions sensibles (immutable).</p>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
          <Input className="pl-9" placeholder="Action ou entité..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </Card>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {!isLoading && data && data.rows.length === 0 && (
        <EmptyState icon={<ScrollText className="h-8 w-8" />} title="Aucun log" description="Le journal est vide pour ce filtre." />
      )}

      {!isLoading && data && data.rows.length > 0 && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/40 text-left">
                    <th className="p-3 font-medium text-textSecondary">Date</th>
                    <th className="p-3 font-medium text-textSecondary">Action</th>
                    <th className="p-3 font-medium text-textSecondary">Entité</th>
                    <th className="p-3 font-medium text-textSecondary">User</th>
                    <th className="p-3 font-medium text-textSecondary">IP</th>
                    <th className="p-3 text-right font-medium text-textSecondary"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((log) => (
                    <tr key={log.id} className="border-b border-border/40 last:border-0 hover:bg-background/40">
                      <td className="p-3 text-xs font-mono">{formatDateTime(log.created_at, lang)}</td>
                      <td className="p-3"><Badge variant="neutral">{log.action}</Badge></td>
                      <td className="p-3 text-textSecondary text-xs">{log.entity_type}{log.entity_id ? ` (${log.entity_id.slice(0, 8)})` : ''}</td>
                      <td className="p-3 text-textSecondary text-xs">{log.user_id ? log.user_id.slice(0, 8) : 'system'}</td>
                      <td className="p-3 text-textSecondary text-xs">{log.ip_address ?? '—'}</td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => setSelected(log)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <PaginationControls
            currentPage={page}
            totalPages={Math.ceil(data.total / pageSize)}
            totalCount={data.total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog open={!!selected} onClose={() => setSelected(null)} title="Détail audit log" size="lg">
        {selected && (
          <div className="space-y-3 text-sm">
            <div><span className="text-textSecondary">Date :</span> {formatDateTime(selected.created_at, lang)}</div>
            <div><span className="text-textSecondary">Action :</span> <code className="font-mono">{selected.action}</code></div>
            <div><span className="text-textSecondary">Entité :</span> {selected.entity_type} <code className="font-mono">{selected.entity_id ?? ''}</code></div>
            <div><span className="text-textSecondary">User ID :</span> <code className="font-mono">{selected.user_id ?? '—'}</code></div>
            {selected.organization_id && <div><span className="text-textSecondary">Org ID :</span> <code className="font-mono">{selected.organization_id}</code></div>}
            {selected.old_values && (
              <div>
                <span className="text-textSecondary">Old values :</span>
                <pre className="mt-1 rounded-md bg-background p-2 text-xs overflow-x-auto">{JSON.stringify(selected.old_values, null, 2)}</pre>
              </div>
            )}
            {selected.new_values && (
              <div>
                <span className="text-textSecondary">New values :</span>
                <pre className="mt-1 rounded-md bg-background p-2 text-xs overflow-x-auto">{JSON.stringify(selected.new_values, null, 2)}</pre>
              </div>
            )}
            {selected.metadata && Object.keys(selected.metadata as object).length > 0 && (
              <div>
                <span className="text-textSecondary">Metadata :</span>
                <pre className="mt-1 rounded-md bg-background p-2 text-xs overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
