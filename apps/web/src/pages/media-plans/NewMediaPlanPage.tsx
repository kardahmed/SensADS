/**
 * /admin/media-plans/new & /client/media-plans/new — Création d'un plan média.
 *
 * Le créateur (client OU staff) choisit le BDC d'attache, donne un titre et une période,
 * puis est redirigé vers la page détail pour ajouter les items (campagnes).
 *
 * Direction auto-déduite :
 *   - Client connecté → createdByRole = 'client' (sera soumis à l'agence)
 *   - Staff connecté  → createdByRole = 'agency' (sera soumis au client)
 */

import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCreateMediaPlan } from '@/hooks/useMediaPlans';
import { useOrganizations } from '@/hooks/useOrganizations';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';

export function NewMediaPlanPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isStaff, profile } = useAuth();
  const toast = useToast();
  const create = useCreateMediaPlan();

  // Si BDC pré-sélectionné via querystring (?bdcId=xxx)
  const preselectedBdcId = params.get('bdcId') ?? '';

  const orgsQ = useOrganizations({ pageSize: 200 });
  const [orgId, setOrgId] = useState<string>(profile?.organizationId ?? '');
  const posQ = usePurchaseOrders({
    organizationId: orgId || undefined,
    pageSize: 100,
  });

  const [bdcId, setBdcId] = useState(preselectedBdcId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const baseRoute = isStaff ? '/admin/media-plans' : '/client/media-plans';

  const eligibleBdcs = useMemo(
    () => (posQ.data?.data ?? []).filter((p) => p.status === 'active' && p.remainingAmountDzd > 0),
    [posQ.data],
  );

  const handleSubmit = async (): Promise<void> => {
    if (!orgId || !bdcId || !title) {
      toast.show({ variant: 'error', title: 'Tous les champs obligatoires doivent être remplis' });
      return;
    }
    try {
      const plan = await create.mutateAsync({
        organizationId: orgId,
        bdcId,
        title,
        description: description || undefined,
        startDate,
        endDate,
        createdByRole: isStaff ? 'agency' : 'client',
      });
      toast.show({ variant: 'success', title: 'Plan créé', message: plan.number });
      navigate(`${baseRoute}/${plan.id}`);
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(baseRoute)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-textPrimary">
            <ClipboardList className="h-6 w-6 text-accent" /> Nouveau Plan Média
          </h1>
          <p className="text-sm text-textSecondary">
            {isStaff
              ? 'Tu crées un plan POUR le client. Il devra le valider avant conversion en campagnes.'
              : 'Tu crées un brief qui sera soumis à l\'agence pour validation.'}
          </p>
        </div>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isStaff && (
            <div className="space-y-1.5">
              <Label htmlFor="org">Client *</Label>
              <Select
                id="org"
                value={orgId}
                onChange={(e) => {
                  setOrgId(e.target.value);
                  setBdcId('');
                }}
              >
                <option value="">— Choisir un client —</option>
                {(orgsQ.data?.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bdc">BDC d'attache *</Label>
            <Select
              id="bdc"
              value={bdcId}
              onChange={(e) => setBdcId(e.target.value)}
              disabled={!orgId}
            >
              <option value="">— Choisir un BDC actif —</option>
              {eligibleBdcs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.number} — Restant : {b.remainingAmountDzd.toLocaleString('fr-FR')} DZD
                </option>
              ))}
            </Select>
            {orgId && eligibleBdcs.length === 0 && (
              <p className="text-xs text-warning">
                Aucun BDC actif avec budget restant pour ce client. Crée d'abord un BDC depuis un devis.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Titre du plan *</Label>
            <Input
              id="title"
              placeholder="ex: Plan média Q2 2026 — Lancement produit X"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sd">Début *</Label>
              <Input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed">Fin *</Label>
              <Input id="ed" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description / contexte</Label>
            <Textarea
              id="desc"
              rows={3}
              placeholder="Briefing global, contexte produit, KPIs cibles, contraintes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={() => navigate(baseRoute)}>
              Annuler
            </Button>
            <Button onClick={() => void handleSubmit()} isLoading={create.isPending} disabled={!orgId || !bdcId || !title}>
              Créer le plan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
