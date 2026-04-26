import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ForbiddenPage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error/10 text-error">
          <ShieldOff className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-textPrimary">403 — Accès refusé</h1>
        <p className="text-sm text-textSecondary">
          Tu n&apos;as pas les droits nécessaires pour accéder à cette page.
        </p>
        <Link to="/">
          <Button>Retour au tableau de bord</Button>
        </Link>
      </div>
    </div>
  );
}
