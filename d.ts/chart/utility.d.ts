/// <reference path="../../typings/tsd.d.ts" />
declare namespace Charts {
    function calcBarWidth(width: number, length: number, barOffset?: number): number;
    function calcBarWidthAdjusted(i: any, length: number): number;
    function calcBarXPos(d: any, i: any, timeScale: any, length: number): number;
    /**
     * An empty datapoint has 'empty' attribute set to true. Used to distinguish from real 0 values.
     * @param d
     * @returns {boolean}
     */
    function isEmptyDataPoint(d: IChartDataPoint): boolean;
    /**
     * Raw metrics have a 'value' set instead of avg/min/max of aggregates
     * @param d
     * @returns {boolean}
     */
    function isRawMetric(d: IChartDataPoint): boolean;
    function xAxisTimeFormats(): d3.time.Format;
    function createSvgDefs(chart: any): void;
    function xMidPointStartPosition(d: any, timeScale: any): any;
    function hashString(str: string): number;
    function determineXAxisTicksFromScreenWidth(widthInPixels: number): number;
    function determineYAxisTicksFromScreenHeight(heightInPixels: number): number;
    function determineYAxisGridLineTicksFromScreenHeight(heightInPixels: number): number;
}
