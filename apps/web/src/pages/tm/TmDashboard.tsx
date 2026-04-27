import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, BarChart3, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';

export function TmDashboard(): JSX.Element {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['tm-stats', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      if (!profile?.id) return null;
      const [orgs, toReview, active, completed] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('assigned_tm_id', profile.id).is('deleted_at', null),
        supabase.from('campaigns').select('id, organizations!inner(assigned_tm_id)', { count: 'exact', head: true }).eq('status', 'in_review').eq('organizations.assigned_tm_id', profile.id),
        supabase.from('campaigns').select('id, organizations!inner(assigned_tm_id)', { count: 'exact', head: true }).eq('status', 'active').eq('organizations.assigned_tm_id', profile.id),
        supabase.from('campaigns').select('id, organizations!inner(assigned_tm_id)', { count: 'exact', head: true }).eq('status', 'completed').eq('organizations.assigned_tm_id', profile.id),
      ]);
      return {
        myClients: orgs.count ?? 0,
        toReview: toReview.count ?? 0,
        active: active.count ?? 0,
        completed: completed.count ?? 0,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">{t('nav.dashboard')}</h1>
        <p className="mt-1 text-sm text-textSecondary">Espace Traffic Manager</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} title="Mes clients" value={data?.myClients ?? 0} loading={isLoading} />
        <StatCard icon={<AlertCircle className="h-4 w-4" />} title="À valider" value={data?.toReview ?? 0} loading={isLoading} action={data?.toReview ? () => navigate('/tm/campaigns') : undefined} />
        <StatCard icon={<Megaphone className="h-4 w-4" />} title="Actives" value={data?.active ?? 0} loading={isLoading} />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} title="Terminées" value={data?.completed ?? 0} loading={isLoading} />
      </div>

      {(data?.toReview ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle>Actions requises</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/tm/campaigns')}>
              Voir les {data?.toReview} campagne(s) à valider
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, title, value, loading, action }: { icon: React.ReactNode; title: string; value: number; loading: boolean; action?: () => void }) {
  return (
    <Card className={action ? 'cursor-pointer hover:bg-card/70' : ''} onClick={action}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-textSecondary">{title}</CardTitle>
        <span className="text-textSecondary">{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold text-textPrimary">{value}</p>}
      </CardContent>
    </Card>
  );
}
