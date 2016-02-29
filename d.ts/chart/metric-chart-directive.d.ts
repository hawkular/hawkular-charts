/// <reference path="../../typings/tsd.d.ts" />
declare namespace Charts {
    const DEFAULT_Y_SCALE: number;
    const X_AXIS_HEIGHT: number;
    const HOVER_DATE_TIME_FORMAT: string;
    const margin: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    let width: any;
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
        stacked: boolean;
        interpolation: string;
        constructor(svg: any, timeScale: any, yScale: any, chartData: IChartDataPoint[], multiChartData: IMultiDataPoint[], modifiedInnerChartHeight: number, height: number, tip?: any, visuallyAdjustedMax?: number, hideHighLowValues?: boolean, stacked?: boolean, interpolation?: string);
    }
}
