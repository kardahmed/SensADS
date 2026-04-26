import { useEffect, useRef, useState } from 'react';
import { LogOut, User as UserIcon, Languages, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { setLanguage } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export function UserMenu(): JSX.Element {
  const { profile, signOut, isSuperAdmin } = useAuth();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!profile) return <div />;

  const initials = (profile.fullName ?? profile.email)
    .split(/[\s@]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth/login');
  };

  const toggleLanguage = () => {
    const next = i18n.language === 'fr' ? 'en' : 'fr';
    setLanguage(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-card"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
          {initials}
        </div>
        <div className="hidden text-left md:block">
          <p className="text-xs font-medium text-textPrimary">{profile.fullName ?? profile.email}</p>
          <p className="text-[10px] uppercase tracking-wider text-textSecondary">{profile.role}</p>
        </div>
      </button>

      {open && (
        <div className={cn(
          'absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-card shadow-lg',
        )}>
          <div className="border-b border-border p-3">
            <p className="text-sm font-medium text-textPrimary truncate">{profile.fullName ?? '—'}</p>
            <p className="text-xs text-textSecondary truncate">{profile.email}</p>
          </div>
          <ul className="py-1">
            <li>
              <button
                onClick={() => { setOpen(false); navigate('/account'); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-textPrimary hover:bg-background"
              >
                <UserIcon className="h-4 w-4" />
                Profil
              </button>
            </li>
            {isSuperAdmin && (
              <li>
                <button
                  onClick={() => { setOpen(false); navigate('/account/security'); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-textPrimary hover:bg-background"
                >
                  <Shield className="h-4 w-4" />
                  Sécurité (2FA)
                </button>
              </li>
            )}
            <li>
              <button
                onClick={toggleLanguage}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-textPrimary hover:bg-background"
              >
                <Languages className="h-4 w-4" />
                {i18n.language === 'fr' ? 'English' : 'Français'}
              </button>
            </li>
            <li className="border-t border-border">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error hover:bg-background"
              >
                <LogOut className="h-4 w-4" />
                {t('auth.logout')}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
