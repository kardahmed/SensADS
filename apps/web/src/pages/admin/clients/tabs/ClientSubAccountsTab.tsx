import { Users, Crown, Mail, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate, type Organization } from '@sensads/core';
import { useOrgMembers, useSubAccountRequests } from '@/hooks/useOrgMembers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';

interface Props {
  organization: Organization;
}

export function ClientSubAccountsTab({ organization }: Props): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { data: members, isLoading } = useOrgMembers(organization.id);
  const { data: requests } = useSubAccountRequests(organization.id);

  const owner = members?.find((m) => m.role === 'client_owner');
  const subAccounts = members?.filter((m) => m.role === 'client_member') ?? [];
  const usedSlots = subAccounts.length;
  const remainingSlots = organization.maxSubAccounts - usedSlots;
  const pendingRequests = requests?.filter((r) => r.status === 'pending') ?? [];

  return (
    <div className="space-y-6">
      {/* Stats quota */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-textSecondary">Sous-comptes utilisés</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-textPrimary">
              {usedSlots} / {organization.maxSubAccounts}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-textSecondary">Slots disponibles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-textPrimary">{Math.max(0, remainingSlots)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-textSecondary">Demandes en attente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-textPrimary">{pendingRequests.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Demandes en attente */}
      {pendingRequests.length > 0 && (
        <Alert variant="warning" title={`${pendingRequests.length} demande(s) de sous-comptes`}>
          <ul className="mt-2 space-y-1 text-sm">
            {pendingRequests.map((req) => (
              <li key={req.id}>
                +{req.requestedCount} comptes — {req.reason} ({formatDate(req.createdAt, lang)})
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Owner */}
      {isLoading && <Skeleton className="h-20 w-full" />}

      {!isLoading && owner && (
        <Card>
          <CardHeader>
            <CardTitle>Propriétaire</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-textPrimary">{owner.fullName ?? '—'}</p>
                  <p className="text-xs text-textSecondary flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {owner.email}
                  </p>
                </div>
              </div>
              <Badge variant="default">client_owner</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sous-comptes */}
      <Card>
        <CardHeader>
          <CardTitle>Sous-comptes ({subAccounts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : subAccounts.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="Aucun sous-compte"
              description="Le propriétaire peut inviter des membres depuis son espace client."
            />
          ) : (
            <div className="space-y-2">
              {subAccounts.map((member) => {
                const accessVariant =
                  member.accessLevel === 'full'
                    ? 'success'
                    : member.accessLevel === 'campaigns_only'
                    ? 'info'
                    : 'neutral';
                const accessLabel =
                  member.accessLevel === 'full'
                    ? 'Accès complet'
                    : member.accessLevel === 'campaigns_only'
                    ? 'Campagnes uniquement'
                    : 'Lecture seule';
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet/10 text-violet">
                        <Shield className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-textPrimary">{member.fullName ?? member.email}</p>
                        <p className="text-xs text-textSecondary">{member.email}</p>
                      </div>
                    </div>
                    <Badge variant={accessVariant}>{accessLabel}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-textSecondary">
        💡 Les invitations de sous-comptes se font depuis l&apos;espace client
        (<code className="font-mono">/client/team</code>) — pas encore implémenté en S3.
      </p>
    </div>
  );
}
