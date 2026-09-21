import React, { useState, useEffect } from 'react';
import {
  Search,
  Bell,
  Menu,
  ChevronRight,
  Sparkles,
  LogOut,
  Sliders,
  Database,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { PiByThreeIcon } from '../brand/Logo';
import { NavigationPage } from '../../types';
import { CURRENT_USER } from '../../constants/mockData';

export interface HeaderProps {
  currentPage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  onOpenCommandPalette: () => void;
  onToggleMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  onOpenCommandPalette,
  onToggleMobileMenu,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const getPageTitle = () => {
    switch (currentPage) {
      case 'overview':
      case 'dynamic-dashboard':
        return 'Dashboard & AI Copilot';
      case 'sources':
        return 'Data Sources';
      case 'catalog':
        return 'Data Catalog';
      case 'explorer':
        return 'SQL Explorer';
      case 'analytics':
        return 'Metric Studio';
      case 'activity':
        return 'Activity Audit';
      case 'settings':
        return 'Settings';
      default:
        return 'Pi-Analytics';
    }
  };

  const notifications = [
    {
      id: 1,
      title: 'Snowflake schema synchronized',
      desc: 'RETAIL_ANALYTICS.SALES catalog indexed 48 tables and 624 columns.',
      time: '3 mins ago',
      unread: !notificationsRead,
    },
    {
      id: 2,
      title: 'Redis cache optimized',
      desc: 'Table metadata queries now responding in <15ms average latency.',
      time: '24 mins ago',
      unread: !notificationsRead,
    },
    {
      id: 3,
      title: 'Warehouse auto-resume notice',
      desc: 'COMPUTE_WH_XL scaled down after 15 minutes idle time.',
      time: '1 hr ago',
      unread: false,
    },
  ];

  return (
    <header className="h-14 bg-white border-b border-neutral-200 px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      {/* Left: Mobile hamburger & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-1.5 rounded-md text-black hover:bg-neutral-100 focus:outline-none"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Enterprise Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-neutral-600 select-none">
          <div
            className="flex items-center hover:opacity-80 transition-opacity cursor-pointer"
            onClick={() => onNavigate('overview')}
            title="Dashboard Overview"
          >
            <PiByThreeIcon size={24} />
          </div>
          <ChevronRight className="w-3 h-3 text-neutral-400" />
          <span className="text-black font-bold">{getPageTitle()}</span>
        </nav>
      </div>

      {/* Right: Global Search, Sync status, Notifications, User */}
      <div className="flex items-center gap-2.5">
        {/* Quick Search Bar / Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs text-black bg-[#fafaf9] hover:bg-neutral-100 border border-neutral-300 rounded-md transition-colors w-56 justify-between cursor-pointer font-medium"
        >
          <span className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-neutral-600">Quick search...</span>
          </span>
          <kbd className="text-[10px] font-mono-code font-bold bg-white px-1.5 py-0.5 rounded border border-neutral-300 text-black">
            ⌘K
          </kbd>
        </button>

        {/* Live Freshness Indicator */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-neutral-100 rounded-md border border-neutral-300 text-[11px] text-black font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
          <span>Snowflake Live</span>
          <span className="text-neutral-600 font-mono-code text-[10px]">98.4% Sync</span>
        </div>

        {/* Fullscreen Mode Toggle */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-md text-black hover:bg-neutral-100 transition-colors cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Presentation Mode'}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-1.5 rounded-md text-black hover:bg-neutral-100 transition-colors relative cursor-pointer"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {!notificationsRead && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-black ring-2 ring-white" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-neutral-300 py-2 z-50 animate-in fade-in-50 duration-100 text-black">
              <div className="px-3 py-2 border-b border-neutral-200 flex items-center justify-between">
                <span className="text-xs font-bold text-black">System Notifications</span>
                <button
                  onClick={() => setNotificationsRead(true)}
                  className="text-[10px] font-bold text-black hover:underline cursor-pointer"
                >
                  Mark all read
                </button>
              </div>

              <div className="divide-y divide-neutral-100 max-h-72 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 text-xs hover:bg-neutral-50 cursor-pointer ${
                      n.unread ? 'bg-neutral-50/70 font-medium' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-black">{n.title}</span>
                      <span className="text-[10px] text-neutral-500 font-mono-code">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-neutral-600 mt-1">{n.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1 rounded-md hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center">
              MV
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-neutral-300 py-1.5 z-50 text-xs text-black">
              <div className="px-3 py-2 border-b border-neutral-200">
                <p className="font-bold text-black">{CURRENT_USER.name}</p>
                <p className="text-[11px] text-neutral-600">{CURRENT_USER.email}</p>
                <span className="inline-block mt-1 text-[10px] font-bold bg-neutral-100 text-black px-1.5 py-0.5 rounded border border-neutral-300">
                  {CURRENT_USER.role}
                </span>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onNavigate('settings');
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 flex items-center gap-2 font-medium"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Account Settings
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onNavigate('sources');
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 flex items-center gap-2 font-medium"
                >
                  <Database className="w-3.5 h-3.5" />
                  Manage Data Sources
                </button>
              </div>

              <div className="border-t border-neutral-200 pt-1">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onNavigate('auth-login');
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-700 font-bold flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
