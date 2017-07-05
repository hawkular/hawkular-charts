import { INumericDataPoint } from '../model/types'

/**
 * Create data points along the line to show the actual values.
 * @param svg
 * @param timeScale
 * @param yScale
 * @param tip
 * @param dataPoints
 */
export function createDataPoints(svg: any, timeScale: any, yScale: any, tip: any, dataPoints: INumericDataPoint[]) {
  const radius = 1;
  const dotDatapoint = svg.selectAll('.dataPointDot').data(dataPoints);

  // update existing
  dotDatapoint.attr('class', 'dataPointDot')
    .attr('r', radius)
    .attr('cx', (d: INumericDataPoint) => timeScale(d.timestampSupplier()))
    .attr('cy', (d: INumericDataPoint) => yScale(d.valueSupplier() || -9999999))
    .on('mouseover', (d: INumericDataPoint, i: number) => tip.show(d, i))
    .on('mouseout', (d: INumericDataPoint, i: number) => tip.hide());

  // add new ones
  dotDatapoint.enter().append('circle')
    .attr('class', 'dataPointDot')
    .attr('r', radius)
    .attr('cx', (d: INumericDataPoint) => timeScale(d.timestampSupplier()))
    .attr('cy', (d: INumericDataPoint) => yScale(d.valueSupplier() || -9999999))
    .on('mouseover', (d: INumericDataPoint, i: number) => tip.show(d, i))
    .on('mouseout', (d: INumericDataPoint, i: number) => tip.hide());

  // remove old ones
  dotDatapoint.exit().remove();
}
