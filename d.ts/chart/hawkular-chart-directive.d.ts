/// <reference path="../../vendor/vendor.d.ts" />
declare namespace Charts {
    interface IContextChartDataPoint {
        timestamp: number;
        start?: number;
        end?: number;
        value?: any;
        avg: number;
        empty: boolean;
    }
    type AlertThreshold = number;
    type TimeInMillis = number;
    interface IMultiDataPoint {
        key: string;
        color?: string;
        values: IChartDataPoint[];
    }
    interface IChartDataPoint extends IContextChartDataPoint {
        date: Date;
        min: number;
        max: number;
        percentile95th: number;
        median: number;
    }
}
