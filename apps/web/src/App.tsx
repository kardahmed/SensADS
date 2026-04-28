/**
 * App.tsx — Routes principales SensADS.
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
import { QuoteDetailPage } from '@/pages/quotes/QuoteDetailPage';
import { PurchaseOrdersPage } from '@/pages/purchase-orders/PurchaseOrdersPage';
import { PurchaseOrderDetailPage } from '@/pages/purchase-orders/PurchaseOrderDetailPage';
import { CampaignsPage } from '@/pages/campaigns/CampaignsPage';
import { CampaignDetailPage } from '@/pages/campaigns/CampaignDetailPage';
import { CampaignWizard } from '@/pages/wizard/CampaignWizard';
import { InvoicesPage } from '@/pages/invoices/InvoicesPage';
import { InvoiceDetailPage } from '@/pages/invoices/InvoiceDetailPage';
import { TmDashboard } from '@/pages/tm/TmDashboard';
import { TmKpisPage } from '@/pages/tm/TmKpisPage';
import { TeamPage } from '@/pages/client/TeamPage';
import { WebhooksPage } from '@/pages/client/WebhooksPage';
import { AuditLogsPage } from '@/pages/admin/AuditLogsPage';
import { AppSettingsPage } from '@/pages/admin/AppSettingsPage';
import { BenchmarksPage } from '@/pages/admin/BenchmarksPage';
import { CalculatorPage } from '@/pages/admin/CalculatorPage';
import { AgencyAdAccountsPage } from '@/pages/admin/AgencyAdAccountsPage';
import { ExchangeRatesPage } from '@/pages/admin/ExchangeRatesPage';
import { ProfitabilityPage } from '@/pages/admin/ProfitabilityPage';
import { ClientMarginHistoryPage } from '@/pages/admin/clients/ClientMarginHistoryPage';
import { MediaPlansPage } from '@/pages/media-plans/MediaPlansPage';
import { MediaPlanDetailPage } from '@/pages/media-plans/MediaPlanDetailPage';
import { NewMediaPlanPage } from '@/pages/media-plans/NewMediaPlanPage';
import { AccountPage } from '@/pages/account/AccountPage';
import { SecurityPage } from '@/pages/account/SecurityPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SuggestionsPage } from '@/pages/intelligence/SuggestionsPage';
import { ForecastsPage } from '@/pages/forecasts/ForecastsPage';
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
                <Route path="/auth/login" element={<LoginPage />} />
                <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
                <Route path="/auth/update-password" element={<UpdatePasswordPage />} />

                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<RoleRouter />} />
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/admin/clients" element={<ClientsPage />} />
                    <Route path="/admin/clients/new" element={<NewClientPage />} />
                    <Route path="/admin/clients/:id" element={<ClientDetailPage />} />
                    <Route path="/admin/tariffs" element={<TariffsPage />} />
                    <Route path="/admin/benchmarks" element={<BenchmarksPage />} />
                    <Route path="/admin/quotes" element={<QuotesPage />} />
                    <Route path="/admin/quotes/new" element={<NewQuotePage />} />
                    <Route path="/admin/quotes/:id" element={<QuoteDetailPage />} />
                    <Route path="/admin/purchase-orders" element={<PurchaseOrdersPage />} />
                    <Route path="/admin/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
                    <Route path="/admin/campaigns" element={<CampaignsPage />} />
                    <Route path="/admin/campaigns/:id" element={<CampaignDetailPage />} />
                    <Route path="/admin/invoices" element={<InvoicesPage />} />
                    <Route path="/admin/invoices/:id" element={<InvoiceDetailPage />} />
                    <Route path="/admin/reports" element={<ReportsPage />} />
                    <Route path="/admin/suggestions" element={<SuggestionsPage />} />
                    <Route path="/admin/forecasts" element={<ForecastsPage />} />
                    <Route path="/admin/calculator" element={<CalculatorPage />} />
                    <Route path="/admin/ad-accounts" element={<AgencyAdAccountsPage />} />
                    <Route path="/admin/exchange-rates" element={<ExchangeRatesPage />} />
                    <Route path="/admin/profitability" element={<ProfitabilityPage />} />
                    <Route path="/admin/clients/:id/margin-history" element={<ClientMarginHistoryPage />} />
                    <Route path="/admin/media-plans" element={<MediaPlansPage />} />
                    <Route path="/admin/media-plans/new" element={<NewMediaPlanPage />} />
                    <Route path="/admin/media-plans/:id" element={<MediaPlanDetailPage />} />
                  </Route>
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
                    <Route path="/admin/settings" element={<AppSettingsPage />} />
                  </Route>
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['traffic_manager']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/tm" element={<TmDashboard />} />
                    <Route path="/tm/campaigns" element={<CampaignsPage />} />
                    <Route path="/tm/campaigns/:id" element={<CampaignDetailPage />} />
                    <Route path="/tm/kpis" element={<TmKpisPage />} />
                    <Route path="/tm/forecasts" element={<ForecastsPage />} />
                    <Route path="/tm/suggestions" element={<SuggestionsPage />} />
                  </Route>
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['client_owner', 'client_member']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/client" element={<ClientDashboard />} />
                    <Route path="/client/quotes" element={<QuotesPage />} />
                    <Route path="/client/quotes/new" element={<NewQuotePage />} />
                    <Route path="/client/quotes/:id" element={<QuoteDetailPage />} />
                    <Route path="/client/purchase-orders" element={<PurchaseOrdersPage />} />
                    <Route path="/client/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
                    <Route path="/client/campaigns" element={<CampaignsPage />} />
                    <Route path="/client/campaigns/new" element={<CampaignWizard />} />
                    <Route path="/client/campaigns/:id" element={<CampaignDetailPage />} />
                    <Route path="/client/invoices" element={<InvoicesPage />} />
                    <Route path="/client/invoices/:id" element={<InvoiceDetailPage />} />
                    <Route path="/client/reports" element={<ReportsPage />} />
                    <Route path="/client/suggestions" element={<SuggestionsPage />} />
                    <Route path="/client/forecasts" element={<ForecastsPage />} />
                    <Route path="/client/media-plans" element={<MediaPlansPage />} />
                    <Route path="/client/media-plans/new" element={<NewMediaPlanPage />} />
                    <Route path="/client/media-plans/:id" element={<MediaPlanDetailPage />} />
                  </Route>
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['client_owner']} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/client/team" element={<TeamPage />} />
                    <Route path="/client/webhooks" element={<WebhooksPage />} />
                  </Route>
                </Route>

                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/account/security" element={<SecurityPage />} />
                  </Route>
                </Route>

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
