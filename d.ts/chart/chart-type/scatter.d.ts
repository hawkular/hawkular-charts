/// <reference path="../../../typings/tsd.d.ts" />
declare namespace Charts {
    class ScatterChart implements IChartType {
        name: string;
        drawChart(chartOptions: Charts.ChartOptions): void;
    }
}
