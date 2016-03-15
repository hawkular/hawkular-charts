/// <reference path="../../typings/tsd.d.ts" />
declare namespace Charts {
    /**
     * Create data points along the line to show the actual values.
     * @param svg
     * @param timeScale
     * @param yScale
     * @param tip
     * @param dataPoints
     */
    function createDataPoints(svg: any, timeScale: any, yScale: any, tip: any, dataPoints: IChartDataPoint[]): void;
}
