/// <reference path="../../vendor/vendor.d.ts" />
declare namespace Charts {
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
}
