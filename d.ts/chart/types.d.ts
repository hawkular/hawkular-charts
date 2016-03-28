/// <reference path="../../typings/tsd.d.ts" />
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
    /**
     * Simplest Metric data type
     */
    interface ISimpleMetric {
        timestamp: TimeInMillis;
        value: MetricValue;
    }
    /**
     * Data for predictive 'cone'
     */
    interface IPredictiveMetric extends ISimpleMetric {
        min: MetricValue;
        max: MetricValue;
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
        keyHash?: string;
        color?: string;
        values: IChartDataPoint[];
    }
    /**
     *
     */
    class ChartOptions {
        svg: any;
        timeScale: any;
        yScale: any;
        chartData: IChartDataPoint[];
        multiChartData: IMultiDataPoint[];
        modifiedInnerChartHeight: number;
        height: number;
        tip: any;
        visuallyAdjustedMax: number;
        hideHighLowValues: boolean;
        interpolation: string;
        constructor(svg: any, timeScale: any, yScale: any, chartData: IChartDataPoint[], multiChartData: IMultiDataPoint[], modifiedInnerChartHeight: number, height: number, tip?: any, visuallyAdjustedMax?: number, hideHighLowValues?: boolean, interpolation?: string);
    }
}
