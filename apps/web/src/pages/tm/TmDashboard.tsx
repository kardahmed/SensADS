import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function TmDashboard(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">{t('nav.dashboard')}</h1>
        <p className="text-sm text-textSecondary mt-1">Espace Traffic Manager</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { title: 'Mes clients', value: '0' },
          { title: 'Campagnes à valider', value: '0' },
          { title: 'KPIs à saisir', value: '0' },
        ].map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-textSecondary">{stat.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-textPrimary">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
