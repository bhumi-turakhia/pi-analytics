import { catalogApi, QueryExecutionRequest, QueryExecutionResponse, QueryResultColumn } from './catalogApi';

export interface QueryExecuteParams extends QueryExecutionRequest {}

export const queryApi = {
  /**
   * Execute real read-only queries against connected data source.
   * POST /api/query/execute
   */
  execute: (params: QueryExecuteParams): Promise<QueryExecutionResponse> => {
    return catalogApi.executeQuery(params);
  },
};

export type { QueryExecutionRequest, QueryExecutionResponse, QueryResultColumn };
