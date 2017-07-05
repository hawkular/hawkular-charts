import { ChartOptions } from './chart-options'
import { AbstractHistogramChart } from './abstract-histogram';

export class HistogramChart extends AbstractHistogramChart {

  public name = 'histogram';

  public drawChart(chartOptions: ChartOptions, stacked = false) {
    super.drawChart(chartOptions, stacked);
  }
}
