import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function ClientDashboard(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">{t('nav.dashboard')}</h1>
        <p className="text-sm text-textSecondary mt-1">Mon espace client</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Bienvenue</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-textSecondary">
          <p>Ton espace client est prêt. Crée ton premier devis pour commencer.</p>
        </CardContent>
      </Card>
    </div>
  );
}
