import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Database,
  Layers,
  Terminal,
  BarChart3,
  Activity as ActivityIcon,
  Settings as SettingsIcon,
  HelpCircle,
  Server,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { PiByThreeLogo } from '../brand/Logo';
import { NavigationPage, UserProfile } from '../../types';
import { authApi } from '../../services/api/authApi';

export interface SidebarProps {
  currentPage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let mounted = true;

    authApi.getCurrentUser().then((user) => {
      if (mounted) {
        setCurrentUser(user);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const userName = currentUser?.name || 'User';
  const userRole = currentUser?.role || 'User';
  const userInitials = userName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';

  const navItems: { id: NavigationPage; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'sources', label: 'Data Sources', icon: <Database className="w-4 h-4" /> },
    { id: 'catalog', label: 'Data Catalog', icon: <Layers className="w-4 h-4" /> },
    { id: 'explorer', label: 'SQL Explorer', icon: <Terminal className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics Dashboard', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'activity', label: 'Activity', icon: <ActivityIcon className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen w-64 border-r border-neutral-200 bg-white transition-transform ${
        isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center border-b border-neutral-200 px-4">
          <PiByThreeLogo />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const active = currentPage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile?.();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-black text-white'
                    : 'text-neutral-700 hover:bg-neutral-100 hover:text-black'
                }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  {item.label}
                </span>
                {item.badge && (
                  <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] font-bold text-neutral-700">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-4 border-t border-neutral-200 p-3">
          <div className="rounded-lg bg-neutral-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-black">
              <Server className="h-3.5 w-3.5" />
              Platform
            </div>
            <div className="space-y-1 text-[10px] text-neutral-600">
              <div className="flex justify-between">
                <span>API:</span>
                <span className="font-bold text-black">FastAPI</span>
              </div>
              <div className="flex justify-between">
                <span>Database:</span>
                <span className="font-bold text-black">PostgreSQL</span>
              </div>
              <div className="flex justify-between">
                <span>Cache:</span>
                <span className="font-bold text-black">Redis Query Cache</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
                {userInitials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-black">{userName}</p>
                <p className="truncate text-[10px] font-medium text-neutral-600">{userRole}</p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('settings')}
              title="Open Settings"
              className="cursor-pointer rounded p-1 text-neutral-600 hover:bg-neutral-200 hover:text-black"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};



