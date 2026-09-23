export type { PipelineRun } from '../../types';
import { PipelineRun } from '../../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface BackendPipelineRun {
  id: number;
  source_id: number;
  status: string;
  started_at: string;
  completed_at: string;
  rows_processed: number;
}

export function mapBackendPipelineRun(run: BackendPipelineRun): PipelineRun {
  return {
    id: run.id,
    sourceId: run.source_id,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    rowsProcessed: run.rows_processed,
  };
}

export const pipelineRunApi = {
  /**
   * Fetch all pipeline runs from FastAPI backend.
   * GET http://127.0.0.1:8000/api/pipeline-runs/
   */
  async getAll(): Promise<PipelineRun[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/pipeline-runs/`);
      if (!response.ok) {
        throw new Error(`Failed to fetch pipeline runs: HTTP ${response.status}`);
      }
      const data: BackendPipelineRun[] = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid response received from pipeline runs API.');
      }
      return data.map(mapBackendPipelineRun);
    } catch (error) {
      console.error('Failed to load pipeline runs:', error);
      throw error;
    }
  },

  async getById(id: number): Promise<PipelineRun | null> {
    const runs = await this.getAll();
    return runs.find((r) => r.id === id) ?? null;
  },
};
