/// <reference path="../../../typings/tsd.d.ts" />
declare namespace Charts {
    import IChartDataPoint = Charts.IChartDataPoint;
    function createLineChart(svg: any, timeScale: any, yScale: any, chartData: IChartDataPoint[], height?: number, interpolation?: string): void;
}
