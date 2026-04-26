import { Bell } from 'lucide-react';
import { UserMenu } from './UserMenu';

export function Header(): JSX.Element {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        {/* Search Cmd+K placeholder — sera implémenté en S10 */}
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-textSecondary">
          <kbd className="rounded bg-background px-1.5 py-0.5 text-[10px]">Ctrl</kbd>
          <kbd className="rounded bg-background px-1.5 py-0.5 text-[10px]">K</kbd>
          <span>pour rechercher</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-textSecondary hover:bg-card hover:text-textPrimary"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
