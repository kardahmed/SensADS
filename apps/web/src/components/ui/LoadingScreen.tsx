import { Spinner } from './Spinner';

export function LoadingScreen(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner size="lg" />
    </div>
  );
}
