/**
 * CommandPalette — Recherche globale Cmd+K.
 *
 * Cherche dans : devis (number), campagnes (name+number), clients (name), factures (number).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Megaphone, Users, Receipt, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';

export function CommandPaletteTrigger(): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-textSecondary hover:bg-card/70"
      >
        <Search className="h-3 w-3" />
        <span>Rechercher</span>
        <kbd className="ml-2 rounded bg-background px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}

interface SearchResult {
  type: 'quote' | 'campaign' | 'client' | 'invoice';
  id: string;
  label: string;
  sublabel?: string;
  url: string;
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data: results } = useQuery({
    queryKey: ['command-palette', query],
    enabled: query.trim().length >= 2,
    queryFn: async (): Promise<SearchResult[]> => {
      const q = query.trim();
      const baseRoute = isStaff ? '/admin' : '/client';

      const [quotes, campaigns, clients, invoices] = await Promise.all([
        supabase.from('quotes').select('id, number, total_dzd').ilike('number', `%${q}%`).is('deleted_at', null).limit(5),
        supabase.from('campaigns').select('id, number, name').or(`number.ilike.%${q}%,name.ilike.%${q}%`).limit(5),
        isStaff ? supabase.from('organizations').select('id, name, nif').ilike('name', `%${q}%`).is('deleted_at', null).limit(5) : Promise.resolve({ data: [] }),
        supabase.from('invoices').select('id, number, total_dzd').ilike('number', `%${q}%`).limit(5),
      ]);

      const out: SearchResult[] = [];
      for (const row of quotes.data ?? []) {
        const r = row as { id: string; number: string; total_dzd: number };
        out.push({ type: 'quote', id: r.id, label: r.number, sublabel: 'Devis', url: `${baseRoute}/quotes/${r.id}` });
      }
      for (const row of campaigns.data ?? []) {
        const r = row as { id: string; number: string; name: string };
        out.push({ type: 'campaign', id: r.id, label: `${r.number} — ${r.name}`, sublabel: 'Campagne', url: `${baseRoute}/campaigns/${r.id}` });
      }
      for (const row of clients.data ?? []) {
        const r = row as { id: string; name: string; nif: string | null };
        out.push({ type: 'client', id: r.id, label: r.name, sublabel: r.nif ? `NIF ${r.nif}` : 'Client', url: `/admin/clients/${r.id}` });
      }
      for (const row of invoices.data ?? []) {
        const r = row as { id: string; number: string };
        out.push({ type: 'invoice', id: r.id, label: r.number, sublabel: 'Facture', url: `${baseRoute}/invoices/${r.id}` });
      }
      return out;
    },
  });

  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIdx(0);
    }
  }, [open]);

  const handleSelect = (result: SearchResult) => {
    navigate(result.url);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    }
  };

  const ICONS = { quote: FileText, campaign: Megaphone, client: Users, invoice: Receipt };

  return (
    <Dialog open={open} onClose={onClose} title="Recherche globale">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="DEV-2026, CAM-2026, nom client..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {query.length < 2 && (
          <p className="py-6 text-center text-xs text-textSecondary">Tape au moins 2 caractères</p>
        )}

        {query.length >= 2 && results && results.length === 0 && (
          <p className="py-6 text-center text-xs text-textSecondary">Aucun résultat</p>
        )}

        {results && results.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {results.map((result, idx) => {
              const Icon = ICONS[result.type];
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                    idx === selectedIdx ? 'bg-accent/10 text-textPrimary' : 'hover:bg-background/40 text-textPrimary',
                  )}
                >
                  <Icon className="h-4 w-4 text-textSecondary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{result.label}</p>
                    {result.sublabel && <p className="text-xs text-textSecondary">{result.sublabel}</p>}
                  </div>
                  <ArrowRight className="h-3 w-3 text-textSecondary" />
                </button>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-textSecondary text-center">
          ↑↓ pour naviguer · ↵ pour ouvrir · Esc pour fermer
        </p>
      </div>
    </Dialog>
  );
}
