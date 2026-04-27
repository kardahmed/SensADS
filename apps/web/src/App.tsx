/**
 * App.tsx — Routes principales SensADS.
 *
 * Structure :
 *  - /auth/* : pages publiques (login, reset)
 *  - / : redirige vers le dashboard du rôle
 *  - /admin/* : super_admin + admin
 *  - /tm/* : traffic_manager
 *  - /client/* : client_owner + client_member
 *  - /403, /* : ForbiddenPage, NotFoundPage
 */

import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import '@/lib/i18n';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RoleRouter } from '@/components/auth/RoleRouter';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { UpdatePasswordPage } from '@/pages/auth/UpdatePasswordPage';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { TariffsPage } from '@/pages/admin/tariffs/TariffsPage';
import { ClientsPage } from '@/pages/admin/clients/ClientsPage';
import { NewClientPage } from '@/pages/admin/clients/NewClientPage';
import { ClientDetailPage } from '@/pages/admin/clients/ClientDetailPage';
import { QuotesPage } from '@/pages/quotes/QuotesPage';
import { NewQuotePage } from '@/pages/quotes/NewQuotePage';
import { TmDashboard } from '@/pages/tm/TmDashboard';
import { ClientDashboard } from '@/pages/client/ClientDashboard';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <Routes>
                {/* Public auth routes */}
                <Route path="/auth/login" element={<LoginPage />} />
                <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
                <Route path="/auth/update-password" element={<UpdatePasswordPage />} />

                {/* Role-based redirect from / */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<RoleRouter />} />
                </Route>

                {/* ADMIN */}
                <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/admin/clients" element={<ClientsPage />} />
                    <Route path="/admin/clients/new" element={<NewClientPage />} />
                    <Route path="/admin/clients/:id" element={<ClientDetailPage />} />
                    <Route path="/admin/tariffs" element={<TariffsPage />} />
                    <Route path="/admin/benchmarks" element={<PlaceholderPage title="Benchmarks" phase="S2" />} />
                    <Route path="/admin/quotes" element={<QuotesPage />} />
                    <Route path="/admin/quotes/new" element={<NewQuotePage />} />
                    <Route path="/admin/quotes/:id" element={<PlaceholderPage title="Détail devis" phase="3.3" />} />
                    <Route path="/admin/invoices" element={<PlaceholderPage title="Factures" phase="S8" />} />
                  </Route>
                </Route>

                {/* SUPER ADMIN ONLY */}
                <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/admin/audit-logs" element={<PlaceholderPage title="Journal d'audit" phase="S10" />} />
                    <Route path="/admin/settings" element={<PlaceholderPage title="Paramètres app" phase="S5" />} />
                  </Route>
                </Route>

                {/* TM */}
                <Route element={<ProtectedRoute allowedRoles={['traffic_manager']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/tm" element={<TmDashboard />} />
                    <Route path="/tm/campaigns" element={<PlaceholderPage title="Campagnes" phase="S6" />} />
                    <Route path="/tm/kpis" element={<PlaceholderPage title="Saisie KPIs" phase="S7" />} />
                    <Route path="/tm/forecasts" element={<PlaceholderPage title="Prévisions" phase="S11" />} />
                  </Route>
                </Route>

                {/* CLIENT */}
                <Route element={<ProtectedRoute allowedRoles={['client_owner', 'client_member']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/client" element={<ClientDashboard />} />
                    <Route path="/client/quotes" element={<QuotesPage />} />
                    <Route path="/client/quotes/new" element={<NewQuotePage />} />
                    <Route path="/client/quotes/:id" element={<PlaceholderPage title="Détail devis" phase="3.3" />} />
                    <Route path="/client/campaigns" element={<PlaceholderPage title="Mes campagnes" phase="S6" />} />
                    <Route path="/client/invoices" element={<PlaceholderPage title="Mes factures" phase="S8" />} />
                    <Route path="/client/reports" element={<PlaceholderPage title="Rapports" phase="S9" />} />
                  </Route>
                </Route>

                {/* CLIENT OWNER ONLY */}
                <Route element={<ProtectedRoute allowedRoles={['client_owner']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/client/team" element={<PlaceholderPage title="Équipe" phase="S3" />} />
                    <Route path="/client/webhooks" element={<PlaceholderPage title="Webhooks" phase="S10" />} />
                  </Route>
                </Route>

                {/* Account (all authenticated) */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/account" element={<PlaceholderPage title="Mon profil" phase="S1" />} />
                    <Route path="/account/security" element={<PlaceholderPage title="Sécurité (2FA)" phase="S1" />} />
                  </Route>
                </Route>

                {/* Errors */}
                <Route path="/403" element={<ForbiddenPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
