/// <reference path="../../../typings/tsd.d.ts" />
declare namespace Charts {
    class RhqBarChart extends AbstractHistogramChart {
        name: string;
        drawChart(chartOptions: Charts.ChartOptions, stacked?: boolean): void;
    }
}
