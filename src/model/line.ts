import { ChartOptions } from './chart-options'
import { IChartType } from './chart-type'
import { INumericDataPoint } from './types'

declare const d3: any;

export class LineChart implements IChartType {

  public name = 'line';

  public drawChart(chartOptions: ChartOptions) {

    const metricChartLine = d3.svg.line()
      .interpolate(chartOptions.interpolation || 'monotone')
      .defined((d: INumericDataPoint) => !d.isEmpty())
      .x((d: INumericDataPoint) => chartOptions.timeScale(d.timestampSupplier()))
      .y((d: INumericDataPoint) => chartOptions.yScale(d.valueSupplier()));

    const pathMetric = chartOptions.svg.selectAll('path.metricLine').data([chartOptions.chartData]);
    // update existing
    pathMetric.attr('class', 'metricLine')
      .transition()
      .attr('d', metricChartLine);

    // add new ones
    pathMetric.enter().append('path')
      .attr('class', 'metricLine')
      .transition()
      .attr('d', metricChartLine);

    // remove old ones
    pathMetric.exit().remove();
  }
}
