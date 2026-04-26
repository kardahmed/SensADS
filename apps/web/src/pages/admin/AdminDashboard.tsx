import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function AdminDashboard(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">{t('nav.dashboard')}</h1>
        <p className="text-sm text-textSecondary mt-1">Vue admin SensADS</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Clients actifs', value: '0', hint: 'Aucune donnée pour le moment' },
          { title: 'Devis en cours', value: '0', hint: 'Aucune donnée' },
          { title: 'Campagnes actives', value: '0', hint: 'Aucune donnée' },
          { title: 'Factures en attente', value: '0', hint: 'Aucune donnée' },
        ].map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-textSecondary">{stat.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-textPrimary">{stat.value}</p>
              <p className="mt-1 text-xs text-textSecondary">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bienvenue sur SensADS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-textSecondary">
          <p>Le backend est opérationnel : 28+ tables, 53 tarifs seedés, RLS activée partout.</p>
          <p>Phases suivantes (voir ROADMAP.md) :</p>
          <ul className="ml-5 list-disc">
            <li>S2 : Layout + Tarifs + KPIs schema</li>
            <li>S3 : Clients + pricing.ts blindé</li>
            <li>S4 : Devis + numérotation + Domain Events</li>
            <li>S5 : BDC + Storage hardening</li>
            <li>S6 : Wizard Campagne 5 étapes</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
