import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-6xl font-bold text-accent">404</h1>
        <p className="text-textSecondary">Cette page n&apos;existe pas.</p>
        <Link to="/">
          <Button>Retour</Button>
        </Link>
      </div>
    </div>
  );
}
