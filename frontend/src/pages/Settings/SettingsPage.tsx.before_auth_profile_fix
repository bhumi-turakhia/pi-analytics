import React, { useState } from 'react';
import {
  Sliders,
  User,
  Building,
  KeyRound,
  Database,
  Shield,
  Check,
  Server,
  Lock,
  Save,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { PiByThreeLogo } from '../../components/brand/Logo';
import { CURRENT_USER } from '../../constants/mockData';
import { NavigationPage } from '../../types';

export const SettingsPage: React.FC<{ onNavigate: (page: NavigationPage) => void }> = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'profile' | 'workspace' | 'auth' | 'security' | 'database'>('general');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const tabs = [
    { id: 'general', label: 'General', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'profile', label: 'Profile', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'workspace', label: 'Workspace & Brand', icon: <Building className="w-3.5 h-3.5" /> },
    { id: 'auth', label: 'Authentication & SSO', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { id: 'database', label: 'Platform Architecture', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'security', label: 'Security & Audit', icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6 text-black">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight font-sans">Settings</h1>
          <p className="text-xs text-neutral-600 font-medium mt-1">
            Configure application metadata preferences, authentication providers, branding, and data platform defaults.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          leftIcon={savedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Save className="w-3.5 h-3.5" />}
        >
          {savedSuccess ? 'Changes Saved' : 'Save Changes'}
        </Button>
      </div>

      {/* Main Settings Split: Sidebar Tabs on left, Content on right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Settings Navigation (3 cols) */}
        <div className="md:col-span-3">
          <Card padding="none" className="overflow-hidden border border-neutral-300 shadow-xs bg-white">
            <div className="p-2 space-y-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors text-left select-none cursor-pointer ${
                      isActive
                        ? 'bg-black text-white shadow-xs'
                        : 'text-black hover:bg-neutral-100'
                    }`}
                  >
                    <span className={isActive ? 'text-white' : 'text-neutral-600'}>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Settings Content (9 cols) */}
        <div className="md:col-span-9 space-y-5">
          {/* TAB 1: General */}
          {activeTab === 'general' && (
            <Card className="space-y-4 border border-neutral-300 bg-white shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-black">General Platform Settings</h3>
                <p className="text-xs text-neutral-600 font-medium">Global timezone, warehouse defaults, and cache TTL settings.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-200">
                <Input
                  label="Platform Organization"
                  defaultValue="Acme Global Operations"
                />
                <Select label="Default UTC Reporting Timezone" defaultValue="UTC">
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Default Snowflake Discovery Warehouse"
                  defaultValue="COMPUTE_WH_XL"
                  helperText="Warehouse utilized during automatic scheduled schema polling"
                />
                <Select label="Redis Cache Metadata TTL" defaultValue="3600">
                  <option value="900">15 minutes (High freshness)</option>
                  <option value="3600">1 hour (Recommended default)</option>
                  <option value="86400">24 hours</option>
                </Select>
              </div>
            </Card>
          )}

          {/* TAB 2: Profile */}
          {activeTab === 'profile' && (
            <Card className="space-y-4 border border-neutral-300 bg-white shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-black">User Profile</h3>
                <p className="text-xs text-neutral-600 font-medium">Identity details registered in PostgreSQL auth table.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-200">
                <Input label="Full Name" defaultValue={CURRENT_USER.name} />
                <Input label="Email Address" defaultValue={CURRENT_USER.email} disabled />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Assigned Role" defaultValue={CURRENT_USER.role} disabled />
                <Input label="Department" defaultValue={CURRENT_USER.department} />
              </div>
            </Card>
          )}

          {/* TAB 3: Workspace & Brand */}
          {activeTab === 'workspace' && (
            <Card className="space-y-5 border border-neutral-300 bg-white shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-black">Workspace &amp; Brand Identity</h3>
                <p className="text-xs text-neutral-600 font-medium">Official platform brand assets and workspace configuration.</p>
              </div>

              {/* Official Brand Asset Card */}
              <div className="p-4 bg-[#fafaf9] rounded-lg border border-neutral-300 space-y-3">
                <span className="text-[11px] font-bold text-black uppercase tracking-wider">
                  Official Brand Logo
                </span>
                <div className="p-4 bg-white rounded-md border border-neutral-200 inline-block shadow-2xs">
                  <PiByThreeLogo size="lg" showTagline={true} />
                </div>
                <p className="text-[11px] text-neutral-600 font-medium">
                  Official π by 3 emblem: &quot;Transforming Enterprises for Future&quot;.
                </p>
              </div>

              <div className="p-3 bg-[#fafaf9] rounded border border-neutral-200 text-xs font-mono-code space-y-2 font-medium">
                <div className="flex justify-between">
                  <span className="text-neutral-600 font-sans">Workspace ID:</span>
                  <span className="font-bold text-black">ws_acme_enterprise_prod_01</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 font-sans">Active Enterprise Connectors:</span>
                  <span className="text-black font-bold">Snowflake &amp; Salesforce</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 font-sans">Databricks Lakehouse:</span>
                  <span className="text-neutral-600 font-bold">Preview / Phase 2</span>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 4: Auth */}
          {activeTab === 'auth' && (
            <Card className="space-y-4 border border-neutral-300 bg-white shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-black">Authentication &amp; Single Sign-On</h3>
                <p className="text-xs text-neutral-600 font-medium">Manage corporate identity provider federation.</p>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-950">SAML 2.0 Okta Enterprise SSO</div>
                  <div className="text-[11px] text-emerald-800 font-medium mt-0.5">
                    Federated with Acme Corp Identity Provider (Enforced)
                  </div>
                </div>
                <Badge variant="black">Enforced</Badge>
              </div>
            </Card>
          )}

          {/* TAB 5: Platform Architecture */}
          {activeTab === 'database' && (
            <Card className="space-y-4 border border-neutral-300 bg-white shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-black">Application Architecture Specification</h3>
                <p className="text-xs text-neutral-600 font-medium">Backend components, data stores, and cache infrastructure.</p>
              </div>

              <div className="space-y-3 pt-2 text-xs">
                <div className="p-3 bg-[#fafaf9] rounded border border-neutral-200">
                  <div className="font-bold text-black flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-black" />
                    <span>Primary Data Platform: Snowflake Native &amp; Salesforce</span>
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-1 font-medium">
                    Connects directly to Snowflake virtual warehouses to introspect information schema catalogs, table schemas, and execute analytical discovery queries.
                  </p>
                </div>

                <div className="p-3 bg-[#fafaf9] rounded border border-neutral-200">
                  <div className="font-bold text-black flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-black" />
                    <span>Application Metadata: PostgreSQL 16</span>
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-1 font-medium">
                    Stores application user accounts, connection encrypted credentials (AWS KMS), schema catalog snapshot history, tags, and audit trails.
                  </p>
                </div>

                <div className="p-3 bg-[#fafaf9] rounded border border-neutral-200">
                  <div className="font-bold text-black flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-black" />
                    <span>Distributed Cache: Redis 7.2</span>
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-1 font-medium">
                    Accelerates column metadata lookups, schema hierarchy trees, and session authentication states.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 6: Security */}
          {activeTab === 'security' && (
            <Card className="space-y-4 border border-neutral-300 bg-white shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-black">Security, Audit &amp; Encryption</h3>
                <p className="text-xs text-neutral-600 font-medium">Key management, RBAC enforcement, and compliance controls.</p>
              </div>

              <div className="divide-y divide-neutral-200 text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-black">Encrypted Credentials Storage</div>
                    <div className="text-[11px] text-neutral-600 font-medium">AES-GCM-256 with AWS KMS Envelope Encryption</div>
                  </div>
                  <Badge variant="black">Active</Badge>
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-black">Audit Trail Immutability</div>
                    <div className="text-[11px] text-neutral-600 font-medium">PostgreSQL append-only audit event logging</div>
                  </div>
                  <Badge variant="black">Enabled (365d)</Badge>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
