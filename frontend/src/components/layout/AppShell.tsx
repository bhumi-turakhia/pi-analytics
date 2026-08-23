import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';
import { NavigationPage } from '../../types';

export interface AppShellProps {
  currentPage: NavigationPage;
  onNavigate: (page: NavigationPage, context?: any) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentPage, onNavigate, children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Standalone full-screen pages
  const isStandAlone = currentPage.startsWith('auth-') || currentPage.startsWith('error-');

  if (isStandAlone) {
    return <div className="min-h-screen bg-[#fafaf9] text-black">{children}</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#fafaf9] text-black">
      {/* Desktop & Mobile Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          currentPage={currentPage}
          onNavigate={onNavigate}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-7 bg-[#fafaf9]">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
};
