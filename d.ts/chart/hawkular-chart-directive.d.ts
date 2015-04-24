/// <reference path="../../vendor/vendor.d.ts" />
declare module Charts {
    interface IContextChartDataPoint {
        timestamp: number;
        start?: number;
        end?: number;
        value: any;
        avg: number;
        empty: boolean;
    }
    interface IChartDataPoint extends IContextChartDataPoint {
        date: Date;
        min: number;
        max: number;
        percentile95th: number;
        median: number;
    }
}
