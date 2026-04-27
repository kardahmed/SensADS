import { NotificationsBell } from './NotificationsBell';
import { UserMenu } from './UserMenu';
import { CommandPaletteTrigger } from './CommandPalette';

export function Header(): JSX.Element {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <CommandPaletteTrigger />
      </div>
      <div className="flex items-center gap-2">
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}
