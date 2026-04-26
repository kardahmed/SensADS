import { useState } from 'react';
import { Plus, Trash2, Pencil, Wifi, WifiOff, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PLATFORMS, formatDateTime, getPlatform } from '@sensads/core';
import {
  useAdAccounts,
  useCreateAdAccount,
  useUpdateAdAccount,
  useArchiveAdAccount,
  type AdAccount,
} from '@/hooks/useAdAccounts';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { AdAccountDialog } from './AdAccountDialog';

interface Props {
  organizationId: string;
}

export function ClientAdAccountsTab({ organizationId }: Props): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { data: accounts, isLoading } = useAdAccounts(organizationId);
  const archive = useArchiveAdAccount();
  const toast = useToast();

  const [editingAccount, setEditingAccount] = useState<AdAccount | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleArchive = async (account: AdAccount) => {
    if (!confirm(`Archiver l'ad account "${account.accountName ?? account.externalAccountId}" ?`))
      return;
    try {
      await archive.mutateAsync({ id: account.id, organizationId });
      toast.show({ variant: 'success', title: 'Ad account archivé' });
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  };

  const handleEdit = (account: AdAccount) => {
    setEditingAccount(account);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingAccount(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-textSecondary">
          Comptes publicitaires du client par plateforme + tracking pixel/GA4.
        </p>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (!accounts || accounts.length === 0) && (
        <EmptyState
          icon={<Wifi className="h-8 w-8" />}
          title="Aucun ad account"
          description="Ajoute le 1er ad account du client (Meta, Google, TikTok, etc.)"
          action={
            <Button className="mt-2" onClick={handleNew}>
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          }
        />
      )}

      {!isLoading && accounts && accounts.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {accounts.map((account) => {
            const platform = getPlatform(account.platform);
            return (
              <Card key={account.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-md text-sm font-bold text-white"
                        style={{ backgroundColor: platform?.color ?? '#9CA3AF' }}
                      >
                        {platform?.iconText ?? '?'}
                      </div>
                      <div>
                        <CardTitle className="text-sm">
                          {account.accountName ?? platform?.name ?? account.platform}
                        </CardTitle>
                        <p className="text-xs text-textSecondary">
                          ID : <code className="font-mono">{account.externalAccountId}</code>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(account)} aria-label="Modifier">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleArchive(account)} aria-label="Archiver">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{account.accountCurrency}</Badge>
                    {account.isConnected ? (
                      <Badge variant="success" className="gap-1">
                        <Wifi className="h-3 w-3" />
                        Connecté API
                      </Badge>
                    ) : (
                      <Badge variant="neutral" className="gap-1">
                        <WifiOff className="h-3 w-3" />
                        Manuel
                      </Badge>
                    )}
                    {account.pixelId && (
                      <Badge variant="info" className="gap-1">
                        <Tag className="h-3 w-3" />
                        {account.pixelType ?? 'pixel'}
                      </Badge>
                    )}
                  </div>
                  {account.pixelId && (
                    <p className="text-textSecondary">
                      <span className="font-medium">Pixel :</span> <code className="font-mono">{account.pixelId}</code>
                    </p>
                  )}
                  {account.ga4MeasurementId && (
                    <p className="text-textSecondary">
                      <span className="font-medium">GA4 :</span>{' '}
                      <code className="font-mono">{account.ga4MeasurementId}</code>
                    </p>
                  )}
                  {account.gtmContainerId && (
                    <p className="text-textSecondary">
                      <span className="font-medium">GTM :</span>{' '}
                      <code className="font-mono">{account.gtmContainerId}</code>
                    </p>
                  )}
                  {account.lastSyncAt && (
                    <p className="text-textSecondary/60">
                      Dernier sync : {formatDateTime(account.lastSyncAt, lang)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AdAccountDialog
        organizationId={organizationId}
        account={editingAccount}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      <div className="hidden">{PLATFORMS.length} plateformes</div>
    </div>
  );
}
