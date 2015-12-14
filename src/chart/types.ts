/// <reference path='../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

// Type values and ID types
  export type AlertThreshold = number;
  export type TimeInMillis = number;
  export type UrlType = number;
  export type MetricId = string;
  export type MetricValue = number;

  /**
   * Metrics Response from Hawkular Metrics
   */
  export interface IMetricsResponseDataPoint {
    start: TimeInMillis;
    end: TimeInMillis;
    value?: MetricValue; /// Only for Raw data (no buckets or aggregates)
    avg?: MetricValue; /// when using buckets or aggregates
    min?: MetricValue; /// when using buckets or aggregates
    max?: MetricValue; /// when using buckets or aggregates
    median?: MetricValue; /// when using buckets or aggregates
    percentile95th?: MetricValue; /// when using buckets or aggregates
    empty: boolean;
  }

  export interface IBaseChartDataPoint {
    timestamp: TimeInMillis;
    start?: TimeInMillis;
    end?: TimeInMillis;
    value?: MetricValue; /// Only for Raw data (no buckets or aggregates)
    avg: MetricValue; /// most of the time this is the useful value for aggregates
    empty: boolean; /// will show up in the chart as blank - set this when you have NaN
  }

  /**
   * Representation of data ready to be consumed by charts.
   */
  export interface IChartDataPoint extends IBaseChartDataPoint {
    date?: Date;
    min: MetricValue;
    max: MetricValue;
    percentile95th: MetricValue;
    median: MetricValue;
  }


  /**
   * Data structure for a Multi-Metric chart. Composed of IChartDataDataPoint[].
   */
  export interface IMultiDataPoint {
    key: string;
    keyHash?: string; // for using as valid html id
    color?: string; /// #fffeee
    values: IChartDataPoint[];
  }
}
