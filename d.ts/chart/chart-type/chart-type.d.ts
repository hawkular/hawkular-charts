/// <reference path="../../../typings/tsd.d.ts" />
import ChartOptions = Charts.ChartOptions;
interface IChartType {
    name: string;
    drawChart(chartOptions: ChartOptions, optionalBoolean?: boolean): void;
}
