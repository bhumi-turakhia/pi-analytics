import React from 'react';
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
import { NavigationPage } from '../../types';
import { CURRENT_USER } from '../../constants/mockData';

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
  const navItems: { id: NavigationPage; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, badge: 'AI Copilot' },
    { id: 'sources', label: 'Data Sources', icon: <Database className="w-4 h-4" />, badge: '5 Active' },
    { id: 'catalog', label: 'Data Catalog', icon: <Layers className="w-4 h-4" />, badge: '248 Tables' },
    { id: 'explorer', label: 'SQL Explorer', icon: <Terminal className="w-4 h-4" /> },
    { id: 'analytics', label: 'Metric Studio', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'activity', label: 'Audit Log', icon: <ActivityIcon className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-neutral-200 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand & Workspace */}
        <div className="p-4 border-b border-neutral-200">
          <div className="flex flex-col gap-1">
            {/* The new Pi by 3 Official Logo */}
            <div
              onClick={() => onNavigate('overview')}
              className="cursor-pointer hover:opacity-90 transition-opacity py-0.5"
              title="π by 3 - Transforming Enterprises for Future"
            >
              <PiByThreeLogo size="md" showTagline={true} />
            </div>
          </div>

          {/* Organization Switcher Pill */}
          <div className="mt-3 p-2 bg-[#fafaf9] rounded-md border border-neutral-200 flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              <div className="truncate">
                <p className="text-[11px] font-bold text-black truncate">Acme Global Enterprise</p>
                <p className="text-[10px] text-neutral-600 font-mono-code">org_acme_prod</p>
              </div>
            </div>
            <ShieldCheck className="w-3.5 h-3.5 text-black shrink-0" />
          </div>
        </div>

        {/* Main Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-2.5 pb-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider select-none">
            Platform Discovery
          </div>

          {navItems.map((item) => {
            const isActive = currentPage === item.id || (item.id === 'overview' && currentPage === 'dynamic-dashboard');
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-colors select-none cursor-pointer group ${
                  isActive
                    ? 'bg-black text-white shadow-xs'
                    : 'text-black hover:bg-neutral-100 hover:text-black'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`shrink-0 ${isActive ? 'text-white' : 'text-neutral-700 group-hover:text-black'}`}>
                    {item.icon}
                  </span>
                  <span className="truncate font-semibold">{item.label}</span>
                </div>
                {item.badge && !isActive && (
                  <span className="text-[10px] font-bold text-black bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-300 font-mono-code">
                    {item.badge}
                  </span>
                )}
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />}
              </button>
            );
          })}

          {/* Screen Flows for Presentation */}
          <div className="pt-4 mt-4 border-t border-neutral-200 px-2.5">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider select-none mb-1.5">
              Screen Flows
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <button
                onClick={() => onNavigate('auth-login')}
                className="text-left px-2 py-1 text-black font-medium hover:bg-neutral-100 rounded text-[11px] cursor-pointer"
              >
                Login View
              </button>
              <button
                onClick={() => onNavigate('error-404')}
                className="text-left px-2 py-1 text-black font-medium hover:bg-neutral-100 rounded text-[11px] cursor-pointer"
              >
                404 State
              </button>
              <button
                onClick={() => onNavigate('error-500')}
                className="text-left px-2 py-1 text-black font-medium hover:bg-neutral-100 rounded text-[11px] cursor-pointer"
              >
                500 Error
              </button>
              <button
                onClick={() => onNavigate('error-403')}
                className="text-left px-2 py-1 text-black font-medium hover:bg-neutral-100 rounded text-[11px] cursor-pointer"
              >
                403 Forbidden
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Section: Architecture & System Status + User */}
        <div className="p-3 border-t border-neutral-200 space-y-3 bg-[#fafaf9]">
          {/* Architecture Status Pill */}
          <div className="p-2.5 bg-white rounded-md border border-neutral-200 text-[11px] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between font-bold text-black">
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-black" />
                <span>Ecosystem Status</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-950 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-300">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" />
                Active
              </span>
            </div>
            <div className="text-[10px] text-neutral-600 font-mono-code space-y-0.5 border-t border-neutral-100 pt-1.5">
              <div className="flex justify-between">
                <span>Sources:</span>
                <span className="text-black font-bold">Snowflake &amp; Salesforce</span>
              </div>
              <div className="flex justify-between">
                <span>App DB:</span>
                <span className="text-black font-bold">PostgreSQL</span>
              </div>
              <div className="flex justify-between">
                <span>Redis:</span>
                <span className="text-black font-bold">94.2% Hit Rate</span>
              </div>
            </div>
          </div>

          {/* User Profile */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-black text-white font-bold text-xs flex items-center justify-center shrink-0">
                MV
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-black truncate">{CURRENT_USER.name}</p>
                <p className="text-[10px] text-neutral-600 font-medium truncate">{CURRENT_USER.role}</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('settings')}
              title="Open Settings"
              className="p-1 text-neutral-600 hover:text-black rounded hover:bg-neutral-200 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
