import { ChartOptions } from './chart-options'
import { AbstractHistogramChart } from './abstract-histogram';

export class RhqBarChart extends AbstractHistogramChart {

  public name = 'rhqbar';

  public drawChart(chartOptions: ChartOptions, stacked = true) {
    super.drawChart(chartOptions, stacked);
  }
}
