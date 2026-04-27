/**
 * /client/campaigns/new — Wizard campagne 5 étapes.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save, Send, Check, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  PLATFORMS,
  formatAmount,
  formatPercentage,
  generateUTM,
  appendUTM,
  getPlatform,
} from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useAdAccounts } from '@/hooks/useAdAccounts';
import { useCreateCampaign } from '@/hooks/useCampaigns';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { initialWizardState, type WizardAdSet, type WizardState } from './types';

const STEPS = [
  { id: 1, label: 'Plateforme & BDC' },
  { id: 2, label: 'Objectif & budget' },
  { id: 3, label: 'Ad sets' },
  { id: 4, label: 'Annonces' },
  { id: 5, label: 'Récap & soumission' },
];

export function CampaignWizard(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile, isStaff } = useAuth();

  const [orgId, setOrgId] = useState<string>(profile?.organizationId ?? '');
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(initialWizardState);

  const { data: orgsData } = useOrganizations({ page: 1, pageSize: 100 });
  const { data: pos } = usePurchaseOrders({ organizationId: orgId, status: 'active' });
  const { data: adAccounts } = useAdAccounts(orgId);
  const create = useCreateCampaign();
  const draft = useWizardDraft(profile?.id, orgId);

  // Load draft once at mount
  useEffect(() => {
    const loaded = draft.load();
    if (loaded) {
      setState(loaded);
      toast.show({ variant: 'info', title: 'Brouillon récupéré', message: 'Vos modifications ont été restaurées' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save state on change
  useEffect(() => {
    draft.save(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const setField = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const updateAdSet = (id: string, updates: Partial<WizardAdSet>) => {
    setState((prev) => ({
      ...prev,
      adSets: prev.adSets.map((as) => (as.id === id ? { ...as, ...updates } : as)),
    }));
  };

  const platform = state.platform ? getPlatform(state.platform) : null;
  const selectedPo = pos?.data.find((p) => p.id === state.poId);

  // ABO validation
  const adSetsBudgetSum = state.adSets.reduce((sum, as) => sum + (as.budgetDzd ?? 0), 0);
  const aboValid = state.budgetMode !== 'abo' || adSetsBudgetSum <= state.budgetDzd;
  const aboWarning = state.budgetMode === 'abo' && adSetsBudgetSum > state.budgetDzd * 0.95 && aboValid;

  // Step validation
  const canGoNext = (() => {
    if (step === 1) return !!state.poId;
    if (step === 2) {
      const baseValid =
        state.name.length >= 3 &&
        state.platform &&
        state.optimizationGoal &&
        state.budgetDzd > 0 &&
        state.startDate &&
        state.adAccountId;
      const disclaimerOk =
        state.specialAdCategory !== 'social_issues_elections' || state.disclaimerText.length > 0;
      const budgetOk = !selectedPo || state.budgetDzd <= selectedPo.remainingAmountDzd;
      return baseValid && disclaimerOk && budgetOk;
    }
    if (step === 3) {
      return state.adSets.length > 0 && aboValid && state.adSets.every((as) => as.name && as.startDate);
    }
    if (step === 4) {
      return state.adSets.every((as) => as.ads.length > 0 && as.ads.every((ad) => ad.name && ad.mediaUrl && ad.destinationUrl));
    }
    return true;
  })();

  const handleSubmit = async () => {
    try {
      const campaignId = await create.mutateAsync({
        organizationId: orgId,
        poId: state.poId,
        name: state.name,
        platform: state.platform,
        optimizationGoal: state.optimizationGoal,
        budgetDzd: state.budgetDzd,
        budgetMode: state.budgetMode,
        startDate: state.startDate,
        endDate: state.endDate || null,
        adAccountId: state.adAccountId,
        specialAdCategory: state.specialAdCategory,
        disclaimerText: state.disclaimerText || null,
        adSets: state.adSets.map((as) => ({
          name: as.name,
          budgetDzd: as.budgetDzd,
          startDate: as.startDate,
          endDate: as.endDate || null,
          optimizationGoal: as.optimizationGoal,
          targetingAgeMin: as.targetingAgeMin,
          targetingAgeMax: as.targetingAgeMax,
          targetingGender: as.targetingGender,
          targetingLocations: as.targetingLocations,
          targetingInterests: as.targetingInterests,
          ads: as.ads.map((ad) => ({
            name: ad.name,
            format: ad.format,
            mediaUrl: ad.mediaUrl,
            destinationUrl: ad.destinationUrl,
            primaryText: ad.primaryText,
            headline: ad.headline,
            description: ad.description,
            callToAction: ad.callToAction,
            // UTM auto-générés (à régénérer avec le numéro de campagne final)
            utmSource: state.platform,
            utmMedium: 'cpc',
            utmContent: `${as.name}_${ad.name}`.toLowerCase().replace(/\s+/g, '-'),
            utmTerm: state.optimizationGoal,
          })),
        })),
      });
      draft.clear();
      toast.show({ variant: 'success', title: 'Campagne soumise pour validation' });
      const baseRoute = isStaff ? '/admin/campaigns' : '/client/campaigns';
      navigate(`${baseRoute}/${campaignId}`);
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur création',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Nouvelle campagne</h1>
          <p className="text-sm text-textSecondary">Wizard 5 étapes — auto-save activé</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => s.id < step && setStep(s.id)}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                s.id === step && 'bg-accent text-white',
                s.id < step && 'bg-success text-white cursor-pointer hover:opacity-80',
                s.id > step && 'bg-card text-textSecondary border border-border',
              )}
            >
              {s.id < step ? <Check className="h-4 w-4" /> : s.id}
            </button>
            <span className={cn('text-xs', s.id === step ? 'font-semibold text-textPrimary' : 'text-textSecondary')}>
              {s.label}
            </span>
            {idx < STEPS.length - 1 && <div className={cn('h-px flex-1', s.id < step ? 'bg-success' : 'bg-border')} />}
          </div>
        ))}
      </div>

      {/* Org picker (staff only) */}
      {isStaff && !orgId && (
        <Card>
          <CardHeader><CardTitle>Sélectionner le client</CardTitle></CardHeader>
          <CardContent>
            <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">—</option>
              {orgsData?.data.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </Select>
          </CardContent>
        </Card>
      )}

      {orgId && (
        <>
          {/* STEP 1 */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Étape 1 — BDC source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-textSecondary">
                  Sélectionne le BDC actif sur lequel imputer le budget de cette campagne.
                </p>
                {!pos?.data.length && (
                  <Alert variant="warning">
                    Aucun BDC actif disponible. Convertis d&apos;abord un devis accepté en BDC.
                  </Alert>
                )}
                <div className="space-y-2">
                  {pos?.data.map((po) => (
                    <button
                      key={po.id}
                      type="button"
                      onClick={() => setField('poId', po.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                        state.poId === po.id ? 'border-accent bg-accent/10' : 'border-border hover:bg-card',
                      )}
                    >
                      <div>
                        <p className="font-mono text-sm font-medium">{po.number}</p>
                        <p className="text-xs text-textSecondary">
                          Restant : {formatAmount(po.remainingAmountDzd, lang)} sur {formatAmount(po.amountTtcDzd, lang)}
                        </p>
                      </div>
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-success"
                          style={{ width: `${(po.remainingAmountDzd / po.amountTtcDzd) * 100}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Étape 2 — Plateforme, objectif & budget</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaignName">Nom de la campagne *</Label>
                  <Input id="campaignName" value={state.name} onChange={(e) => setField('name', e.target.value)} placeholder="Ex: Black Friday 2026" />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Plateforme *</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {PLATFORMS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setField('platform', p.id)}
                          className={cn(
                            'flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors',
                            state.platform === p.id ? 'border-accent bg-accent/10' : 'border-border hover:bg-card',
                          )}
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded text-xs font-bold text-white" style={{ backgroundColor: p.color }}>
                            {p.iconText}
                          </div>
                          <span className="text-[10px]">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="optimizationGoal">Objectif d&apos;optimisation *</Label>
                      <Select id="optimizationGoal" value={state.optimizationGoal} onChange={(e) => setField('optimizationGoal', e.target.value)} disabled={!platform}>
                        <option value="">—</option>
                        {platform?.supportedObjectives.map((g) => (
                          <option key={g} value={g}>{g.toUpperCase()}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adAccount">Ad account *</Label>
                      <Select id="adAccount" value={state.adAccountId} onChange={(e) => setField('adAccountId', e.target.value)}>
                        <option value="">—</option>
                        {adAccounts?.filter((a) => a.platform === state.platform).map((a) => (
                          <option key={a.id} value={a.externalAccountId}>
                            {a.accountName ?? a.externalAccountId} ({a.accountCurrency})
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="budget">Budget total DZD *</Label>
                    <Input id="budget" type="number" min="0" step="100" value={state.budgetDzd || ''} onChange={(e) => setField('budgetDzd', Number(e.target.value) || 0)} />
                    {selectedPo && state.budgetDzd > selectedPo.remainingAmountDzd && (
                      <p className="text-xs text-error">Dépasse le solde BDC ({formatAmount(selectedPo.remainingAmountDzd, lang)})</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budgetMode">Mode budget</Label>
                    <Select id="budgetMode" value={state.budgetMode} onChange={(e) => setField('budgetMode', e.target.value as 'cbo' | 'abo')}>
                      <option value="cbo">CBO (campaign budget)</option>
                      <option value="abo">ABO (ad set budget)</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="specialCat">Catégorie spéciale</Label>
                    <Select id="specialCat" value={state.specialAdCategory} onChange={(e) => setField('specialAdCategory', e.target.value as never)}>
                      <option value="none">Aucune</option>
                      <option value="employment">Emploi</option>
                      <option value="housing">Logement</option>
                      <option value="credit">Crédit</option>
                      <option value="social_issues_elections">Social / Élections</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Date début *</Label>
                    <Input id="startDate" type="date" value={state.startDate} onChange={(e) => setField('startDate', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Date fin</Label>
                    <Input id="endDate" type="date" value={state.endDate} onChange={(e) => setField('endDate', e.target.value)} />
                  </div>
                </div>

                {state.specialAdCategory === 'social_issues_elections' && (
                  <div className="space-y-2">
                    <Label htmlFor="disclaimer">Disclaimer obligatoire *</Label>
                    <Textarea id="disclaimer" rows={2} value={state.disclaimerText} onChange={(e) => setField('disclaimerText', e.target.value)} placeholder="Mention obligatoire pour catégorie social/élections" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Étape 3 — Ad sets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {state.budgetMode === 'abo' && (
                  <Alert variant={aboValid ? (aboWarning ? 'warning' : 'info') : 'error'}>
                    Mode ABO : {formatAmount(adSetsBudgetSum, lang)} / {formatAmount(state.budgetDzd, lang)} alloués
                    {!aboValid && ' — DÉPASSÉ'}
                    {aboWarning && ' — proche limite (>95%)'}
                  </Alert>
                )}

                {state.adSets.map((adSet, idx) => (
                  <Card key={adSet.id} className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-semibold">Ad set #{idx + 1}</h4>
                      <Button variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, adSets: prev.adSets.filter((a) => a.id !== adSet.id) }))}>
                        Supprimer
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input placeholder="Nom" value={adSet.name} onChange={(e) => updateAdSet(adSet.id, { name: e.target.value })} />
                      {state.budgetMode === 'abo' && (
                        <Input type="number" placeholder="Budget DZD" value={adSet.budgetDzd ?? ''} onChange={(e) => updateAdSet(adSet.id, { budgetDzd: Number(e.target.value) || 0 })} />
                      )}
                      <Input type="date" value={adSet.startDate} onChange={(e) => updateAdSet(adSet.id, { startDate: e.target.value })} />
                      <Input type="date" value={adSet.endDate} onChange={(e) => updateAdSet(adSet.id, { endDate: e.target.value })} />
                      <Select value={adSet.targetingGender} onChange={(e) => updateAdSet(adSet.id, { targetingGender: e.target.value as never })}>
                        <option value="all">Tous genres</option>
                        <option value="male">Hommes</option>
                        <option value="female">Femmes</option>
                      </Select>
                      <div className="flex gap-2">
                        <Input type="number" placeholder="Age min" min="13" max="65" value={adSet.targetingAgeMin || ''} onChange={(e) => updateAdSet(adSet.id, { targetingAgeMin: Number(e.target.value) || 18 })} />
                        <Input type="number" placeholder="Age max" min="13" max="65" value={adSet.targetingAgeMax || ''} onChange={(e) => updateAdSet(adSet.id, { targetingAgeMax: Number(e.target.value) || 65 })} />
                      </div>
                    </div>
                  </Card>
                ))}

                <Button
                  variant="outline"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      adSets: [...prev.adSets, {
                        id: crypto.randomUUID(),
                        name: '',
                        budgetDzd: state.budgetMode === 'abo' ? 0 : null,
                        startDate: state.startDate,
                        endDate: state.endDate,
                        optimizationGoal: state.optimizationGoal,
                        targetingAgeMin: state.specialAdCategory !== 'none' ? 18 : 18,
                        targetingAgeMax: 65,
                        targetingGender: state.specialAdCategory !== 'none' ? 'all' : 'all',
                        targetingLocations: [],
                        targetingInterests: [],
                        ads: [],
                      }],
                    }))
                  }
                >
                  + Ajouter un ad set
                </Button>
              </CardContent>
            </Card>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Étape 4 — Annonces</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {state.adSets.map((adSet) => (
                  <div key={adSet.id} className="rounded-lg border border-border p-4">
                    <h4 className="mb-3 font-semibold">{adSet.name || 'Ad set sans nom'}</h4>
                    {adSet.ads.map((ad, idx) => {
                      const utm = generateUTM({
                        platform: state.platform,
                        optimizationGoal: state.optimizationGoal,
                        campaignNumber: 'CAM-PREVIEW',
                        adsetName: adSet.name,
                        adName: ad.name,
                      });
                      const finalUrl = ad.destinationUrl ? appendUTM(ad.destinationUrl, utm) : '';
                      return (
                        <Card key={ad.id} className="mb-2 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs text-textSecondary">Annonce #{idx + 1}</p>
                            <Button variant="ghost" size="sm" onClick={() => updateAdSet(adSet.id, { ads: adSet.ads.filter((a) => a.id !== ad.id) })}>
                              Supprimer
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <Input placeholder="Nom de l'annonce" value={ad.name} onChange={(e) => updateAdSet(adSet.id, { ads: adSet.ads.map((a) => a.id === ad.id ? { ...a, name: e.target.value } : a) })} />
                            <Select value={ad.format} onChange={(e) => updateAdSet(adSet.id, { ads: adSet.ads.map((a) => a.id === ad.id ? { ...a, format: e.target.value as never } : a) })}>
                              <option value="image">Image</option>
                              <option value="video">Vidéo</option>
                              <option value="carousel">Carousel</option>
                              <option value="collection">Collection</option>
                            </Select>
                            <Input placeholder="URL média (image/vidéo)" value={ad.mediaUrl} onChange={(e) => updateAdSet(adSet.id, { ads: adSet.ads.map((a) => a.id === ad.id ? { ...a, mediaUrl: e.target.value } : a) })} />
                            <Input placeholder="URL destination" value={ad.destinationUrl} onChange={(e) => updateAdSet(adSet.id, { ads: adSet.ads.map((a) => a.id === ad.id ? { ...a, destinationUrl: e.target.value } : a) })} />
                            <Input placeholder="Titre (headline)" value={ad.headline} onChange={(e) => updateAdSet(adSet.id, { ads: adSet.ads.map((a) => a.id === ad.id ? { ...a, headline: e.target.value } : a) })} />
                            <Input placeholder="CTA (ex: En savoir plus)" value={ad.callToAction} onChange={(e) => updateAdSet(adSet.id, { ads: adSet.ads.map((a) => a.id === ad.id ? { ...a, callToAction: e.target.value } : a) })} />
                          </div>
                          <Textarea className="mt-2" rows={2} placeholder="Texte principal" value={ad.primaryText} onChange={(e) => updateAdSet(adSet.id, { ads: adSet.ads.map((a) => a.id === ad.id ? { ...a, primaryText: e.target.value } : a) })} />
                          {finalUrl && (
                            <div className="mt-2 rounded-md bg-card p-2 text-xs">
                              <p className="text-textSecondary">URL avec UTM auto :</p>
                              <code className="break-all text-accent">{finalUrl}</code>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                    <Button variant="outline" size="sm" onClick={() => updateAdSet(adSet.id, { ads: [...adSet.ads, { id: crypto.randomUUID(), name: '', format: 'image', mediaUrl: '', destinationUrl: '', primaryText: '', headline: '', description: '', callToAction: 'En savoir plus' }] })}>
                      + Ajouter annonce
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* STEP 5 */}
          {step === 5 && (
            <Card>
              <CardHeader>
                <CardTitle>Étape 5 — Récapitulatif</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-textSecondary">Nom</p><p className="font-medium">{state.name}</p></div>
                  <div><p className="text-textSecondary">Plateforme</p><p className="font-medium">{platform?.name}</p></div>
                  <div><p className="text-textSecondary">Objectif</p><p className="font-medium">{state.optimizationGoal.toUpperCase()}</p></div>
                  <div><p className="text-textSecondary">Mode budget</p><p className="font-medium">{state.budgetMode.toUpperCase()}</p></div>
                  <div><p className="text-textSecondary">Budget total</p><p className="font-medium">{formatAmount(state.budgetDzd, lang)}</p></div>
                  <div><p className="text-textSecondary">Période</p><p className="font-medium">{state.startDate} → {state.endDate || 'sans fin'}</p></div>
                  <div><p className="text-textSecondary">Ad sets</p><p className="font-medium">{state.adSets.length}</p></div>
                  <div><p className="text-textSecondary">Annonces totales</p><p className="font-medium">{state.adSets.reduce((sum, as) => sum + as.ads.length, 0)}</p></div>
                </div>

                {state.specialAdCategory !== 'none' && (
                  <Alert variant="warning">
                    <Badge variant="warning">Catégorie spéciale : {state.specialAdCategory}</Badge>
                  </Alert>
                )}

                <Alert variant="info">
                  <p>
                    <strong>Soumission</strong> : la campagne passera en statut &quot;in_review&quot;.
                    Le TM la validera et créera le draft Meta API (si applicable) ou l&apos;activera (manuel).
                  </p>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* Nav */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="flex items-center gap-2 text-xs text-textSecondary">
              <Save className="h-3 w-3" />
              <span>Brouillon auto-sauvegardé</span>
            </div>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="h-4 w-4" />
                  Précédent
                </Button>
              )}
              {step < 5 && (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canGoNext}>
                  Suivant
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 5 && (
                <Button onClick={handleSubmit} isLoading={create.isPending}>
                  <Send className="h-4 w-4" />
                  Soumettre la campagne
                </Button>
              )}
            </div>
          </div>

          {!canGoNext && step < 5 && (
            <Alert variant="warning">
              <AlertCircle className="inline h-4 w-4 mr-1" />
              Certains champs obligatoires sont manquants ou invalides.
              {step === 2 && state.specialAdCategory === 'social_issues_elections' && !state.disclaimerText && ' Disclaimer requis.'}
              {step === 2 && selectedPo && state.budgetDzd > selectedPo.remainingAmountDzd && ` Budget excède solde BDC (${formatPercentage(state.budgetDzd / selectedPo.remainingAmountDzd, lang)} > 100%).`}
              {step === 3 && state.budgetMode === 'abo' && !aboValid && ' Mode ABO : somme des ad sets dépasse le budget campagne.'}
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
