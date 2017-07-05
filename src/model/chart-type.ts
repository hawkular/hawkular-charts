import { ChartOptions } from './chart-options'

export interface IChartType {
  name: string;
  drawChart(chartOptions: ChartOptions, optionalBoolean?: boolean): void;
}
