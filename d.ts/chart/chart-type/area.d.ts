/// <reference path="../../../typings/tsd.d.ts" />
declare namespace Charts {
    class AreaChart implements IChartType {
        name: string;
        drawChart(chartOptions: Charts.ChartOptions): void;
    }
}
