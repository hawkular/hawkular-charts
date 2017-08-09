import { INumericDataPoint } from '../model/types'
import { ChartOptions } from '../model/chart-options'

/**
 * Create data points along the line to show the actual values.
 * @param chartOptions
 */
export function createDataPoints(chartOptions: ChartOptions) {
  const radius = 3;
  let dotDatapoint;
  if (chartOptions.multiData) {
    // Currently feature not available in multi-line charts. Tip with previous datapoint seeker must be updated for that.
    return;
    // const flatten = [].concat.apply([], chartOptions.multiData.map(s => s.values));
    // dotDatapoint = chartOptions.svg.selectAll('.dataPointDot').data(flatten);
  } else {
    dotDatapoint = chartOptions.svg.selectAll('.dataPointDot').data(chartOptions.data);
  }

  // update existing
  dotDatapoint.attr('class', 'dataPointDot')
    .attr('r', radius)
    .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
    .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.valueSupplier() || -9999999))
    .on('mouseover', (d: INumericDataPoint, i: number) => chartOptions.tip.show(d, i))
    .on('mouseout', (d: INumericDataPoint, i: number) => chartOptions.tip.hide());

  // add new ones
  dotDatapoint.enter().append('circle')
    .attr('class', 'dataPointDot')
    .attr('r', radius)
    .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
    .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.valueSupplier() || -9999999))
    .on('mouseover', (d: INumericDataPoint, i: number) => chartOptions.tip.show(d, i))
    .on('mouseout', (d: INumericDataPoint, i: number) => chartOptions.tip.hide());

  // remove old ones
  dotDatapoint.exit().remove();
}
