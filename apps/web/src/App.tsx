/**
 * App.tsx — Stub minimal du dashboard.
 *
 * Phase 1 (S1) implémentera : Auth + Layout + ProtectedRoute.
 * Voir ROADMAP.md.
 */

import { APP_NAME, APP_COMPANY } from '@sensads/core';

export function App(): JSX.Element {
  return (
    <main className="min-h-screen bg-[#0A0E1A] text-[#F9FAFB] flex items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl font-bold">{APP_NAME}</h1>
        <p className="text-[#9CA3AF]">by {APP_COMPANY}</p>
        <p className="text-sm text-[#9CA3AF]">
          Backend ready · Frontend en cours d&apos;implémentation (S1+)
        </p>
        <p className="text-xs text-[#6366F1]">
          Voir ROADMAP.md
        </p>
      </div>
    </main>
  );
}
