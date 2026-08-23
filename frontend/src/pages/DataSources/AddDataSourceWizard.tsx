import React, { useState } from 'react';
import {
  Check,
  Server,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Cloud,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { PlatformBadge } from '../../components/status/ConnectionStatusBadge';
import { dataSourceApi, CreateDataSourcePayload, TestConnectionResult } from '../../services/api';
import { DataSource, PlatformType } from '../../types';

export interface AddDataSourceWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newSource: DataSource) => void;
}

export const AddDataSourceWizard: React.FC<AddDataSourceWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [platform, setPlatform] = useState<PlatformType>('snowflake');
  const [formData, setFormData] = useState<CreateDataSourcePayload>({
    name: 'Sales & Revenue Warehouse (Snowflake)',
    platform: 'snowflake',
    environment: 'production',
    accountIdentifier: 'xy94821.us-east-1',
    warehouse: 'COMPUTE_WH_XL',
    database: 'RETAIL_ANALYTICS',
    defaultSchema: 'SALES',
    username: 'SVC_PI_ANALYTICS_RO',
    password: '',
    role: 'DATA_DISCOVERY_ROLE',
    autoSyncEnabled: true,
    syncIntervalMinutes: 30,
  });

  // Test Connection State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSelectPlatform = (selected: PlatformType) => {
    setPlatform(selected);
    if (selected === 'salesforce') {
      setFormData({
        name: 'Salesforce Enterprise CRM',
        platform: 'salesforce',
        environment: 'production',
        accountIdentifier: 'https://acmeprod.my.salesforce.com',
        warehouse: 'SALES_CLOUD_PROD',
        database: 'SALESFORCE_REVENUE_DB',
        defaultSchema: 'PIPELINE',
        username: 'api_integration@acmecorp.com',
        password: '••••••••••••',
        role: 'REST_API_ADMIN',
        autoSyncEnabled: true,
        syncIntervalMinutes: 15,
      });
    } else if (selected === 'snowflake') {
      setFormData({
        name: 'Sales & Revenue Warehouse (Snowflake)',
        platform: 'snowflake',
        environment: 'production',
        accountIdentifier: 'xy94821.us-east-1',
        warehouse: 'COMPUTE_WH_XL',
        database: 'RETAIL_ANALYTICS',
        defaultSchema: 'SALES',
        username: 'SVC_PI_ANALYTICS_RO',
        password: '••••••••••••',
        role: 'DATA_DISCOVERY_ROLE',
        autoSyncEnabled: true,
        syncIntervalMinutes: 30,
      });
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await dataSourceApi.testConnection({
        ...formData,
        platform,
      });
      setTestResult(result);
    } catch (e: any) {
      setTestResult({
        success: false,
        latencyMs: 300,
        message: e?.message || 'Connection failed. Please verify credentials.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleNextStep = () => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (platform === 'databricks') {
        newErrors.platform = 'Databricks connector is scheduled for Phase 2 roadmap.';
        setErrors(newErrors);
        return;
      }
    } else if (step === 2) {
      if (!formData.name.trim()) newErrors.name = 'Connection name is required';
      if (!formData.accountIdentifier.trim()) newErrors.accountIdentifier = 'Instance identifier is required';
      if (!formData.username.trim()) newErrors.username = 'Service username is required';

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    }
    setErrors({});
    setStep((prev) => Math.min(4, prev + 1) as any);
  };

  const handlePrevStep = () => {
    setErrors({});
    setStep((prev) => Math.max(1, prev - 1) as any);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const created = await dataSourceApi.create({
        ...formData,
        platform,
      });
      onSuccess(created);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepsList = [
    { num: 1, label: 'Platform' },
    { num: 2, label: 'Credentials' },
    { num: 3, label: 'Configuration' },
    { num: 4, label: 'Review & Connect' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Enterprise Data Source"
      subtitle="Establish live schema introspection and generate your real-time AI dashboard"
      maxWidth="2xl"
    >
      <div className="space-y-6 text-black">
        {/* Step Indicator Bar */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          {stepsList.map((s, idx) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold select-none ${
                  step === s.num
                    ? 'bg-black text-white'
                    : step > s.num
                    ? 'bg-emerald-100 text-emerald-950 font-bold'
                    : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {step > s.num ? <Check className="w-3.5 h-3.5 text-emerald-800" /> : s.num}
              </div>
              <span
                className={`text-xs ${
                  step === s.num ? 'text-black font-bold' : 'text-neutral-500 font-medium'
                }`}
              >
                {s.label}
              </span>
              {idx < stepsList.length - 1 && (
                <div className="w-8 sm:w-12 h-[1px] bg-neutral-200 mx-1 sm:mx-2" />
              )}
            </div>
          ))}
        </div>

        {/* STEP 1: Select Platform */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-xs text-neutral-600 font-medium">
              Select your enterprise data source. Connecting a source will immediately provision schema metadata and generate an AI-powered analytical dashboard.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Snowflake Option */}
              <div
                onClick={() => handleSelectPlatform('snowflake')}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  platform === 'snowflake'
                    ? 'border-black bg-neutral-50 shadow-xs'
                    : 'border-neutral-200 hover:border-neutral-400 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded bg-[#f0f7fc] border border-[#d2e8f8] flex items-center justify-center text-[#29b5e8]">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0L14 8L22 10L15 14L18 22L12 17L6 22L9 14L2 10L10 8L12 0Z" />
                    </svg>
                  </div>
                  <Badge variant="black" size="xs">
                    Live Active
                  </Badge>
                </div>
                <h4 className="mt-3 text-xs font-bold text-black">Snowflake Native</h4>
                <p className="text-[11px] text-neutral-600 mt-1 leading-snug font-medium">
                  Micro-partition introspection, schema discovery, and low-latency analytical queries.
                </p>
              </div>

              {/* Salesforce Option */}
              <div
                onClick={() => handleSelectPlatform('salesforce')}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  platform === 'salesforce'
                    ? 'border-black bg-neutral-50 shadow-xs'
                    : 'border-neutral-200 hover:border-neutral-400 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded bg-[#eef7ff] border border-[#bcdcfc] flex items-center justify-center text-[#00A1E0]">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <Badge variant="black" size="xs">
                    Live Active
                  </Badge>
                </div>
                <h4 className="mt-3 text-xs font-bold text-black">Salesforce Cloud</h4>
                <p className="text-[11px] text-neutral-600 mt-1 leading-snug font-medium">
                  Pipeline ARR, opportunity velocity, win rates, and customer accounts.
                </p>
              </div>

              {/* Databricks (Coming Soon) */}
              <div
                onClick={() => {
                  setPlatform('databricks');
                  setErrors({ platform: 'Databricks connector is scheduled for Phase 2 roadmap.' });
                }}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all opacity-80 ${
                  platform === 'databricks'
                    ? 'border-black bg-neutral-50'
                    : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-500">
                    <Server className="w-4 h-4" />
                  </div>
                  <Badge variant="neutral" size="xs">
                    Phase 2
                  </Badge>
                </div>
                <h4 className="mt-3 text-xs font-bold text-neutral-700">Databricks</h4>
                <p className="text-[11px] text-neutral-500 mt-1 leading-snug">
                  Unity Catalog Lakehouse connector in development.
                </p>
              </div>
            </div>

            {errors.platform && (
              <p className="text-xs text-amber-950 bg-amber-50 p-2.5 rounded border border-amber-300 font-medium">
                {errors.platform}
              </p>
            )}
          </div>
        )}

        {/* STEP 2: Connection Credentials */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Connection Nickname"
                placeholder={platform === 'salesforce' ? 'Salesforce Enterprise CRM' : 'Sales & Revenue Warehouse'}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={errors.name}
              />

              <Select
                label="Environment"
                value={formData.environment}
                onChange={(e) => setFormData({ ...formData, environment: e.target.value as any })}
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label={platform === 'salesforce' ? 'Salesforce Instance URL' : 'Snowflake Account Identifier'}
                placeholder={platform === 'salesforce' ? 'https://acme.my.salesforce.com' : 'xy94821.us-east-1'}
                value={formData.accountIdentifier}
                onChange={(e) => setFormData({ ...formData, accountIdentifier: e.target.value })}
                error={errors.accountIdentifier}
              />

              <Input
                label={platform === 'salesforce' ? 'Connected Service / Instance' : 'Virtual Warehouse'}
                placeholder={platform === 'salesforce' ? 'SALES_CLOUD_PROD' : 'COMPUTE_WH_XL'}
                value={formData.warehouse}
                onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label={platform === 'salesforce' ? 'CRM Target Database / Scope' : 'Database'}
                placeholder={platform === 'salesforce' ? 'SALESFORCE_REVENUE_DB' : 'RETAIL_ANALYTICS'}
                value={formData.database}
                onChange={(e) => setFormData({ ...formData, database: e.target.value })}
              />

              <Input
                label="Default Schema"
                placeholder={platform === 'salesforce' ? 'PIPELINE' : 'SALES'}
                value={formData.defaultSchema}
                onChange={(e) => setFormData({ ...formData, defaultSchema: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <Input
                label="Service User / Client ID"
                placeholder="SVC_PI_ANALYTICS_RO"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                error={errors.username}
              />

              <Input
                type="password"
                label="Secret Key / Token"
                placeholder="••••••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                helperText="Encrypted via KMS in PostgreSQL"
              />

              <Input
                label="Role / Permission Set"
                placeholder={platform === 'salesforce' ? 'REST_API_ADMIN' : 'DATA_DISCOVERY_ROLE'}
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              />
            </div>

            {/* Test Connection Button */}
            <div className="pt-2 border-t border-neutral-200">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={isTesting}
                  onClick={handleTestConnection}
                  leftIcon={<KeyRound className="w-3.5 h-3.5" />}
                >
                  Test Connection &amp; Handshake
                </Button>
                <span className="text-[11px] text-neutral-500 font-medium">
                  Verify SSL handshake and warehouse authorization
                </span>
              </div>

              {testResult && (
                <div
                  className={`mt-3 p-3 rounded-md text-xs border ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium'
                      : 'bg-rose-50 border-rose-300 text-rose-950 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                    <span className="ml-auto font-mono-code text-[10px] font-normal">
                      {testResult.latencyMs}ms latency
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Configuration */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-xs text-neutral-600 font-medium">
              Configure introspection intervals, automatic AI dashboard generation, and Redis caching.
            </div>

            <div className="p-4 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-black">Auto-Generate AI Intelligence Dashboard</h4>
                  <p className="text-[11px] text-neutral-600 font-medium mt-0.5">
                    Automatically construct real-time executive KPI metrics, charts, and co-pilot chat upon connection.
                  </p>
                </div>
                <Badge variant="black">Enabled</Badge>
              </div>

              <div className="border-t border-neutral-200 pt-3">
                <Select
                  label="Metadata Synchronization Frequency"
                  value={formData.syncIntervalMinutes}
                  onChange={(e) => setFormData({ ...formData, syncIntervalMinutes: Number(e.target.value) })}
                >
                  <option value={15}>Every 15 minutes (High Freshness)</option>
                  <option value={30}>Every 30 minutes (Recommended)</option>
                  <option value={60}>Every 1 hour</option>
                  <option value={360}>Every 6 hours</option>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Review & Provision */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="text-xs text-neutral-600 font-medium">
              Please review your connection parameters before final registration.
            </div>

            <div className="p-4 rounded-lg bg-[#fafaf9] border border-neutral-200 divide-y divide-neutral-200 text-xs">
              <div className="py-2 flex justify-between">
                <span className="text-neutral-600 font-medium">Platform:</span>
                <PlatformBadge platform={platform} />
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-neutral-600 font-medium">Connection Name:</span>
                <span className="font-bold text-black">{formData.name}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-neutral-600 font-medium">Endpoint:</span>
                <span className="font-mono-code text-black font-semibold">{formData.accountIdentifier}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-neutral-600 font-medium">Target Entities:</span>
                <span className="font-mono-code text-black font-semibold">
                  {formData.database}.{formData.defaultSchema || 'ALL'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 rounded border border-emerald-300 text-[11px] text-emerald-950 flex items-center gap-2 font-medium">
              <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Connecting this source will immediately create your live analytics dashboard with Pi AI Copilot right on the main page.
              </span>
            </div>
          </div>
        )}

        {/* Wizard Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrevStep}
              leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            >
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleNextStep}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Next Step
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleSubmit}
              leftIcon={<Check className="w-3.5 h-3.5" />}
            >
              Connect &amp; Open Dashboard
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
