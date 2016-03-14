/// <reference path="../../../typings/tsd.d.ts" />
declare namespace Charts {
    class MultiLineChart implements IChartType {
        name: string;
        drawChart(chartOptions: Charts.ChartOptions): void;
        private createLine(newInterpolation, timeScale, yScale);
    }
}
