import React, { useEffect, useState } from 'react';
import { ToastProvider } from './components/ui/Toast';
import { AppShell } from './components/layout/AppShell';
import { MainDashboardPage } from './pages/Dashboard/MainDashboardPage';
import { DataSourcesPage } from './pages/DataSources/DataSourcesPage';
import { CatalogPage } from './pages/Catalog/CatalogPage';
import { ExplorerPage } from './pages/Explorer/ExplorerPage';
import { AnalyticsPage } from './pages/Analytics/AnalyticsPage';
import { ActivityPage } from './pages/Activity/ActivityPage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import {
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
} from './pages/Auth/AuthPages';
import { Error404Page, Error500Page, Error403Page } from './pages/Error/ErrorPages';
import { NavigationPage } from './types';
import { authApi } from './services/api';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('auth-login');
  const [navigationContext, setNavigationContext] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkAuthentication = async () => {
      const user = await authApi.getCurrentUser();

      if (!mounted) {
        return;
      }

      setCurrentPage(user ? 'overview' : 'auth-login');
      setIsCheckingAuth(false);
    };

    checkAuthentication();

    return () => {
      mounted = false;
    };
  }, []);

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
        return (
          <ExplorerPage
            onNavigate={handleNavigate}
            initialContext={navigationContext}
          />
        );

      case 'analytics':
        return <AnalyticsPage onNavigate={handleNavigate} />;

      case 'activity':
        return <ActivityPage onNavigate={handleNavigate} />;

      case 'settings':
        return <SettingsPage onNavigate={handleNavigate} />;

      case 'auth-login':
        return <LoginPage onNavigate={handleNavigate} />;

      case 'auth-register':
        return <RegisterPage onNavigate={handleNavigate} />;

      case 'auth-forgot':
        return <ForgotPasswordPage onNavigate={handleNavigate} />;

      case 'error-404':
        return <Error404Page onNavigate={handleNavigate} />;

      case 'error-500':
        return <Error500Page onNavigate={handleNavigate} />;

      case 'error-403':
        return <Error403Page onNavigate={handleNavigate} />;

      default:
        return <LoginPage onNavigate={handleNavigate} />;
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center text-sm text-neutral-600">
        Checking authentication...
      </div>
    );
  }

  const isAuthPage =
    currentPage === 'auth-login' ||
    currentPage === 'auth-register' ||
    currentPage === 'auth-forgot' ||
    currentPage === 'auth-reset';

  return (
    <ToastProvider>
      {isAuthPage ? (
        renderContent()
      ) : (
        <AppShell currentPage={currentPage} onNavigate={handleNavigate}>
          {renderContent()}
        </AppShell>
      )}
    </ToastProvider>
  );
}
