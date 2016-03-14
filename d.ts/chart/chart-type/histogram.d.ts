/// <reference path="../../../typings/tsd.d.ts" />
declare namespace Charts {
    const BAR_OFFSET: number;
    class HistogramChart implements IChartType {
        name: string;
        drawChart(chartOptions: Charts.ChartOptions, optionalBoolean?: boolean): void;
    }
}
