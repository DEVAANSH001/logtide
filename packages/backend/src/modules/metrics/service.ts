import { reservoir } from '../../database/reservoir.js';
import type {
  MetricRecord,
  AggregationInterval,
  MetricAggregationFn,
} from '@logtide/reservoir';

export class MetricsService {
  async ingestMetrics(
    records: MetricRecord[],
    projectId: string,
    organizationId: string,
  ): Promise<number> {
    if (records.length === 0) return 0;

    const enriched = records.map((r) => ({
      ...r,
      projectId,
      organizationId,
    }));

    const result = await reservoir.ingestMetrics(enriched);
    return result.ingested;
  }

  async listMetricNames(projectId: string | string[], from?: Date, to?: Date) {
    return reservoir.getMetricNames({ projectId, from, to });
  }

  async getLabelKeys(projectId: string | string[], metricName: string, from?: Date, to?: Date) {
    return reservoir.getMetricLabelKeys({ projectId, metricName, from, to });
  }

  async getLabelValues(
    projectId: string | string[],
    metricName: string,
    labelKey: string,
    from?: Date,
    to?: Date,
  ) {
    return reservoir.getMetricLabelValues({ projectId, metricName, from, to }, labelKey);
  }

  async queryMetrics(params: {
    projectId: string | string[];
    metricName?: string | string[];
    from: Date;
    to: Date;
    attributes?: Record<string, string>;
    limit?: number;
    offset?: number;
    includeExemplars?: boolean;
  }) {
    return reservoir.queryMetrics({
      projectId: params.projectId,
      metricName: params.metricName,
      from: params.from,
      to: params.to,
      attributes: params.attributes,
      limit: params.limit,
      offset: params.offset,
      includeExemplars: params.includeExemplars,
    });
  }

  async aggregateMetrics(params: {
    projectId: string | string[];
    metricName: string;
    from: Date;
    to: Date;
    interval: AggregationInterval;
    aggregation: MetricAggregationFn;
    groupBy?: string[];
    attributes?: Record<string, string>;
    serviceName?: string;
  }) {
    return reservoir.aggregateMetrics({
      projectId: params.projectId,
      metricName: params.metricName,
      from: params.from,
      to: params.to,
      interval: params.interval,
      aggregation: params.aggregation,
      groupBy: params.groupBy,
      attributes: params.attributes,
      serviceName: params.serviceName,
    });
  }

  async getOverview(params: {
    projectId: string | string[];
    from: Date;
    to: Date;
    serviceName?: string;
  }) {
    return reservoir.getMetricsOverview({
      projectId: params.projectId,
      from: params.from,
      to: params.to,
      serviceName: params.serviceName,
    });
  }
}

export const metricsService = new MetricsService();
