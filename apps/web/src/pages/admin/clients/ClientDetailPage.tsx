/**
 * /admin/clients/:id — Détail client avec 5 onglets.
 */

import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganizations';
import { useTrafficManagers } from '@/hooks/useTrafficManagers';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { ClientInfoTab } from './tabs/ClientInfoTab';
import { ClientFinancialTab } from './tabs/ClientFinancialTab';
import { ClientAdAccountsTab } from './tabs/ClientAdAccountsTab';
import { ClientTariffOverridesTab } from './tabs/ClientTariffOverridesTab';
import { ClientSubAccountsTab } from './tabs/ClientSubAccountsTab';

export function ClientDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: org, isLoading, error } = useOrganization(id);
  const { data: tms } = useTrafficManagers();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <Alert variant="error" title="Client introuvable">
        {error instanceof Error ? error.message : 'Cette organisation n\'existe pas ou a été supprimée.'}
      </Alert>
    );
  }

  const tm = tms?.find((t) => t.id === org.assignedTmId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/clients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-textPrimary">{org.name}</h1>
              {org.sandboxMode ? (
                <Badge variant="warning">Sandbox</Badge>
              ) : (
                <Badge variant="success">Actif</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-textSecondary">
              {org.legalName ?? '—'} · {org.wilaya ?? 'Wilaya non renseignée'} ·{' '}
              {tm ? `TM : ${tm.fullName ?? tm.email}` : 'Sans TM'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Infos</TabsTrigger>
          <TabsTrigger value="financial">Financier</TabsTrigger>
          <TabsTrigger value="ad-accounts">Ad accounts</TabsTrigger>
          <TabsTrigger value="overrides">Tarifs spéciaux</TabsTrigger>
          <TabsTrigger value="team">Équipe</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <ClientInfoTab organization={org} />
        </TabsContent>

        <TabsContent value="financial">
          <ClientFinancialTab organizationId={org.id} />
        </TabsContent>

        <TabsContent value="ad-accounts">
          <ClientAdAccountsTab organizationId={org.id} />
        </TabsContent>

        <TabsContent value="overrides">
          <ClientTariffOverridesTab organizationId={org.id} />
        </TabsContent>

        <TabsContent value="team">
          <ClientSubAccountsTab organization={org} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
