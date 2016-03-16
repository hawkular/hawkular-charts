/// <reference path="../../typings/tsd.d.ts" />
declare namespace Charts {
    /**
     * Defines an individual alert bounds  to be visually highlighted in a chart
     * that an alert was above/below a threshold.
     */
    class AlertBound {
        startTimestamp: TimeInMillis;
        endTimestamp: TimeInMillis;
        alertValue: number;
        startDate: Date;
        endDate: Date;
        constructor(startTimestamp: TimeInMillis, endTimestamp: TimeInMillis, alertValue: number);
    }
    function createAlertLine(chartOptions: ChartOptions, alertValue: number, cssClassName: string): void;
    function createAlertBoundsArea(chartOptions: ChartOptions, alertValue: number, highBound: number): void;
}
