import React, { useState } from 'react';
import { ToastProvider } from './components/ui/Toast';
import { AppShell } from './components/layout/AppShell';
import { MainDashboardPage } from './pages/Dashboard/MainDashboardPage';
import { DataSourcesPage } from './pages/DataSources/DataSourcesPage';
import { CatalogPage } from './pages/Catalog/CatalogPage';
import { ExplorerPage } from './pages/Explorer/ExplorerPage';
import { AnalyticsPage } from './pages/Analytics/AnalyticsPage';
import { ActivityPage } from './pages/Activity/ActivityPage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { LoginPage, ForgotPasswordPage } from './pages/Auth/AuthPages';
import { Error404Page, Error500Page, Error403Page } from './pages/Error/ErrorPages';
import { NavigationPage } from './types';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('overview');
  const [navigationContext, setNavigationContext] = useState<any>(null);

  const handleNavigate = (page: NavigationPage, context?: any) => {
    setCurrentPage(page);
    setNavigationContext(context || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'overview':
      case 'dynamic-dashboard':
        return (
          <MainDashboardPage
            source={navigationContext?.source}
            onNavigate={handleNavigate}
          />
        );
      case 'sources':
        return (
          <DataSourcesPage
            onNavigate={handleNavigate}
            openWizardInitial={Boolean(navigationContext?.openWizard)}
          />
        );
      case 'catalog':
        return (
          <CatalogPage
            onNavigate={handleNavigate}
            initialTableId={navigationContext?.tableId}
          />
        );
      case 'explorer':
        return <ExplorerPage onNavigate={handleNavigate} />;
      case 'analytics':
        return <AnalyticsPage onNavigate={handleNavigate} />;
      case 'activity':
        return <ActivityPage onNavigate={handleNavigate} />;
      case 'settings':
        return <SettingsPage onNavigate={handleNavigate} />;
      case 'auth-login':
        return <LoginPage onNavigate={handleNavigate} />;
      case 'auth-forgot':
        return <ForgotPasswordPage onNavigate={handleNavigate} />;
      case 'error-404':
        return <Error404Page onNavigate={handleNavigate} />;
      case 'error-500':
        return <Error500Page onNavigate={handleNavigate} />;
      case 'error-403':
        return <Error403Page onNavigate={handleNavigate} />;
      default:
        return (
          <MainDashboardPage
            source={navigationContext?.source}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  return (
    <ToastProvider>
      <AppShell currentPage={currentPage} onNavigate={handleNavigate}>
        {renderContent()}
      </AppShell>
    </ToastProvider>
  );
}
