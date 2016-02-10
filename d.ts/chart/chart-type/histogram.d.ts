/// <reference path="../../../typings/tsd.d.ts" />
declare namespace Charts {
    const BAR_OFFSET: number;
    function createHistogramChart(svg: any, timeScale: any, yScale: any, chartData: IChartDataPoint[], tip: any, height?: number, stacked?: boolean, visuallyAdjustedMax?: number, hideHighLowValues?: boolean): void;
}
