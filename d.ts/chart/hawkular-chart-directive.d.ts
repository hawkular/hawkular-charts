/// <reference path="../../vendor/vendor.d.ts" />
declare namespace Charts {
    type AlertThreshold = number;
    type TimeInMillis = number;
    type UrlType = number;
    type MetricId = string;
    type MetricValue = number;
    /**
     * Metrics Response from Hawkular Metrics
     */
    interface IMetricsResponseDataPoint {
        start: TimeInMillis;
        end: TimeInMillis;
        value?: MetricValue;
        avg?: MetricValue;
        min?: MetricValue;
        max?: MetricValue;
        median?: MetricValue;
        percentile95th?: MetricValue;
        empty: boolean;
    }
    interface IBaseChartDataPoint {
        timestamp: TimeInMillis;
        start?: TimeInMillis;
        end?: TimeInMillis;
        value?: MetricValue;
        avg: MetricValue;
        empty: boolean;
    }
    /**
     * Representation of data ready to be consumed by charts.
     */
    interface IChartDataPoint extends IBaseChartDataPoint {
        date?: Date;
        min: MetricValue;
        max: MetricValue;
        percentile95th: MetricValue;
        median: MetricValue;
    }
    /**
     * Data structure for a Multi-Metric chart. Composed of IChartDataDataPoint[].
     */
    interface IMultiDataPoint {
        key: string;
        color?: string;
        values: IChartDataPoint[];
    }
}
