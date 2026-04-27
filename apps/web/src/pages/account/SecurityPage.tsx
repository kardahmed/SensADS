/**
 * /account/security — 2FA TOTP enrollment.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';

export function SecurityPage(): JSX.Element {
  const { profile, refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeUri, setQrCodeUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: factors } = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data;
    },
  });

  const totpVerified = factors?.totp?.find((f) => f.status === 'verified');

  const startEnroll = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setFactorId(data.id);
      setQrCodeUri(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrolling(true);
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    } finally {
      setLoading(false);
    }
  };

  const verifyEnroll = async () => {
    if (!factorId || code.length !== 6) {
      toast.show({ variant: 'error', title: 'Code à 6 chiffres requis' });
      return;
    }
    setLoading(true);
    try {
      const { data: challenge, error: chError } = await supabase.auth.mfa.challenge({ factorId });
      if (chError) throw chError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      await supabase.from('profiles').update({ two_factor_enabled: true }).eq('id', profile?.id);
      toast.show({ variant: 'success', title: '2FA activée' });
      setEnrolling(false);
      setCode('');
      void qc.invalidateQueries({ queryKey: ['mfa-factors'] });
      await refresh();
    } catch (err) {
      toast.show({ variant: 'error', title: 'Code invalide', message: err instanceof Error ? err.message : 'Inconnu' });
    } finally {
      setLoading(false);
    }
  };

  const unenroll = async () => {
    if (!totpVerified) return;
    if (!confirm('Désactiver la 2FA ? Ton compte sera moins sécurisé.')) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: totpVerified.id });
      if (error) throw error;
      await supabase.from('profiles').update({ two_factor_enabled: false }).eq('id', profile?.id);
      toast.show({ variant: 'success', title: '2FA désactivée' });
      void qc.invalidateQueries({ queryKey: ['mfa-factors'] });
      await refresh();
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">Sécurité</h1>
        <p className="mt-1 text-sm text-textSecondary">Gère ton 2FA et la sécurité de ton compte.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />Authentification à deux facteurs (2FA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {totpVerified && !enrolling ? (
            <>
              <Alert variant="success" title="2FA active">
                Ton compte est protégé par TOTP. À chaque connexion, tu devras entrer un code à 6 chiffres généré par ton app d&apos;authentification.
              </Alert>
              <div className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <span className="text-sm">Facteur TOTP</span>
                  <Badge variant="success">Actif</Badge>
                </div>
                <Button variant="danger" size="sm" onClick={unenroll} isLoading={loading}>
                  <ShieldOff className="h-4 w-4" />Désactiver
                </Button>
              </div>
            </>
          ) : enrolling ? (
            <>
              <Alert variant="info" title="Étape 1 — Scanner le QR code">
                Ouvre ton app d&apos;authentification (Google Authenticator, Authy, 1Password, etc.) et scanne ce QR code.
              </Alert>
              {qrCodeUri && (
                <div className="flex justify-center">
                  <img src={qrCodeUri} alt="QR code 2FA" className="rounded-lg border border-border bg-white p-4" />
                </div>
              )}
              {secret && (
                <div>
                  <p className="text-xs text-textSecondary">Ou saisir manuellement :</p>
                  <code className="block mt-1 rounded-md border border-border bg-background p-2 font-mono text-xs break-all">{secret}</code>
                </div>
              )}
              <Alert variant="info" title="Étape 2 — Vérifier">
                Entre le code à 6 chiffres généré par ton app pour confirmer l&apos;activation.
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="totpCode">Code à 6 chiffres</Label>
                <Input
                  id="totpCode"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setEnrolling(false); setCode(''); }}>
                  Annuler
                </Button>
                <Button onClick={verifyEnroll} isLoading={loading} disabled={code.length !== 6}>
                  Vérifier et activer
                </Button>
              </div>
            </>
          ) : (
            <>
              <Alert variant="warning" title="2FA désactivée">
                {profile?.role === 'super_admin'
                  ? 'En tant que super_admin, la 2FA est FORTEMENT recommandée.'
                  : 'Active la 2FA pour renforcer la sécurité de ton compte.'}
              </Alert>
              <Button onClick={startEnroll} isLoading={loading}>
                <Shield className="h-4 w-4" />Activer la 2FA
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
