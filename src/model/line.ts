import { ChartOptions } from './chart-options'
import { IChartType } from './chart-type'
import { INumericDataPoint } from './types'

declare const d3: any;

export class LineChart implements IChartType {

  public name = 'line';

  public drawChart(chart: ChartOptions) {

    const metricChartLine = d3.svg.line()
      .interpolate(chart.interpolation || 'monotone')
      .defined((d: INumericDataPoint) => !d.isEmpty())
      .x((d: INumericDataPoint) => chart.axis.timeScale(d.timestampSupplier()))
      .y((d: INumericDataPoint) => chart.axis.yScale(d.valueSupplier()!));

    const pathMetric = chart.svg.selectAll('path.metricLine').data([chart.data]);
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
