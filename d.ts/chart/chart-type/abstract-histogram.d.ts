/// <reference path="../../../typings/tsd.d.ts" />
declare namespace Charts {
    const BAR_OFFSET: number;
    abstract class AbstractHistogramChart implements IChartType {
        name: string;
        drawChart(chartOptions: Charts.ChartOptions, stacked?: boolean): void;
    }
}
