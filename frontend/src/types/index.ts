export type PlatformType = 'snowflake' | 'salesforce' | 'databricks' | 'postgresql';

export type ConnectionStatus = 'healthy' | 'syncing' | 'warning' | 'disconnected' | 'error';

export type EnvironmentType = 'production' | 'staging' | 'development';

export interface DataSource {
  id: string;
  name: string;
  platform: PlatformType;
  environment: EnvironmentType;
  status: ConnectionStatus;
  accountIdentifier: string;
  warehouse: string;
  database: string;
  defaultSchema: string;
  username: string;
  role: string;
  lastSyncAt: string;
  tableCount: number;
  schemaCount: number;
  recordCountEstimate: string;
  storageSizeGb: number;
  region: string;
  createdAt: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  errorMessage?: string;
}

export interface CatalogColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey?: boolean;
  foreignKeyTarget?: string;
  description: string;
  sampleValues: (string | number | boolean)[];
  distinctCount?: number;
  nullPercentage?: number;
}

export interface CatalogTable {
  id: string;
  name: string;
  database: string;
  schema: string;
  sourceId: string;
  sourceName: string;
  description: string;
  owner: string;
  rowCount: number;
  sizeBytes: number;
  sizeFormatted: string;
  lastModifiedAt: string;
  lastSyncedAt: string;
  columns: CatalogColumn[];
  tags: string[];
  downstreamDashboards?: string[];
  ddl: string;
}

export interface CatalogSchema {
  name: string;
  database: string;
  tableCount: number;
  tables: CatalogTable[];
}

export interface CatalogDatabase {
  name: string;
  sourceId: string;
  sourceName: string;
  schemaCount: number;
  tableCount: number;
  schemas: CatalogSchema[];
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  user: {
    name: string;
    email: string;
    avatar?: string;
    role: string;
  };
  action: string;
  resource: string;
  targetType: 'connection' | 'schema' | 'table' | 'query' | 'auth' | 'system';
  status: 'success' | 'warning' | 'failure' | 'info';
  details?: string;
  ipAddress: string;
}

export interface PipelineRun {
  id: number;
  sourceId: number;
  status: string;
  startedAt: string;
  completedAt: string;
  rowsProcessed: number;
}

export interface OverviewKPIs {
  connectedSources: number;
  healthyConnections: number;
  catalogedTables: number;
  availableSchemas: number;
  totalRecordsEstimate: string;
  storageUsageGb: number;
  syncFreshnessPercentage: number;
  cacheHitRatio: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'Platform Admin' | 'Data Architect' | 'Data Analyst' | 'Viewer';
  department: string;
  organization: string;
  avatarUrl?: string;
  lastLogin: string;
}

export interface DashboardKPI {
  id: string;
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  subtext: string;
  sparkline?: number[];
  category?: string;
}

export interface DashboardChartPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  category?: string;
}

export interface DashboardChartConfig {
  id: string;
  title: string;
  subtitle: string;
  chartType: 'line' | 'bar' | 'area';
  data: DashboardChartPoint[];
  unit: string;
  secondaryLabel?: string;
  showMovingAverage?: boolean;
}

export interface DashboardTableConfig {
  title: string;
  subtitle: string;
  columns: { key: string; header: string; isMonospace?: boolean; align?: 'left' | 'center' | 'right' }[];
  rows: Record<string, any>[];
}

export interface DashboardState {
  sourceId: string;
  sourceName: string;
  platform: PlatformType;
  title: string;
  subtitle: string;
  activeFilter: string;
  regionFilter: string;
  kpis: DashboardKPI[];
  primaryChart: DashboardChartConfig;
  secondaryChart: DashboardChartConfig;
  dataTable: DashboardTableConfig;
  insights: string[];
  lastPromptExecuted?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  content: string;
  sqlQuery?: string;
  appliedChanges?: string[];
  suggestedFollowUps?: string[];
  visualization?: any;
  columns?: any[];
  rows?: Record<string, any>[];
  rowCount?: number;
  executionTimeMs?: number;
  canAddToDashboard?: boolean;
  isAddedToDashboard?: boolean;
}

export type NavigationPage = 
  | 'overview'
  | 'sources'
  | 'catalog'
  | 'explorer'
  | 'analytics'
  | 'activity'
  | 'settings'
  | 'dynamic-dashboard'
  | 'auth-login'
  | 'auth-forgot'
  | 'auth-reset'
  | 'error-404'
  | 'error-500'
  | 'error-403';
