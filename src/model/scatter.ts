import { ChartOptions } from './chart-options';
import { IChartType } from './chart-type';
import { INumericDataPoint, NumericDataPoint, NumericBucketPoint } from './types';

export class ScatterChart implements IChartType {

  public name = 'scatter';

  public drawChart(chartOptions: ChartOptions) {

    if (!chartOptions.hideHighLowValues) {

      const highDotCircle = chartOptions.svg.selectAll('.highDot').data(chartOptions.data);
      // update existing
      highDotCircle.attr('class', 'highDot')
        .filter((d: INumericDataPoint) => !d.isEmpty())
        .attr('r', 3)
        .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
        .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.isRaw() ? (<NumericDataPoint>d).value
          : (<NumericBucketPoint>d).max!))
        .style('fill', '#ff1a13')
        .on('mouseover', (d: INumericDataPoint, i: number) => {
          // tip.show(d, i);
        }).on('mouseout', () => {
          // tip.hide();
        });
      // add new ones
      highDotCircle.enter().append('circle')
        .filter((d: INumericDataPoint) => !d.isEmpty())
        .attr('class', 'highDot')
        .attr('r', 3)
        .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
        .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.isRaw() ? (<NumericDataPoint>d).value
          : (<NumericBucketPoint>d).max!))
        .style('fill', '#ff1a13')
        .on('mouseover', (d: INumericDataPoint, i: number) => {
          // tip.show(d, i);
        }).on('mouseout', () => {
          // tip.hide();
        });
      // remove old ones
      highDotCircle.exit().remove();

      const lowDotCircle = chartOptions.svg.selectAll('.lowDot').data(chartOptions.data);
      // update existing
      lowDotCircle.attr('class', 'lowDot')
        .filter((d: INumericDataPoint) => !d.isEmpty())
        .attr('r', 3)
        .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
        .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.isRaw() ? (<NumericDataPoint>d).value
          : (<NumericBucketPoint>d).min!))
        .style('fill', '#70c4e2')
        .on('mouseover', (d: INumericDataPoint, i: number) => {
          // tip.show(d, i);
        }).on('mouseout', () => {
          // tip.hide();
        });
      // add new ones
      lowDotCircle.enter().append('circle')
        .filter((d: INumericDataPoint) => !d.isEmpty())
        .attr('class', 'lowDot')
        .attr('r', 3)
        .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
        .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.isRaw() ? (<NumericDataPoint>d).value
          : (<NumericBucketPoint>d).min!))
        .style('fill', '#70c4e2')
        .on('mouseover', (d: INumericDataPoint, i: number) => {
          // tip.show(d, i);
        }).on('mouseout', () => {
          // tip.hide();
        });
      // remove old ones
      lowDotCircle.exit().remove();

    } else {
      // we should hide high-low values.. or remove if existing
      chartOptions.svg.selectAll('.highDot, .lowDot').remove();
    }

    const avgDotCircle = chartOptions.svg.selectAll('.avgDot').data(chartOptions.data);
    // update existing
    avgDotCircle.attr('class', 'avgDot')
      .filter((d: INumericDataPoint) => !d.isEmpty())
      .attr('r', 3)
      .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.valueSupplier()!))
      .style('fill', '#FFF')
      .on('mouseover', (d: INumericDataPoint, i: number) => {
        // tip.show(d, i);
      }).on('mouseout', () => {
        // tip.hide();
      });
    // add new ones
    avgDotCircle.enter().append('circle')
      .filter((d: INumericDataPoint) => !d.isEmpty())
      .attr('class', 'avgDot')
      .attr('r', 3)
      .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.valueSupplier()!))
      .style('fill', () => {
        return '#FFF';
      }).on('mouseover', (d: INumericDataPoint, i: number) => {
        // tip.show(d, i);
      }).on('mouseout', () => {
        // tip.hide();
      });
    // remove old ones
    avgDotCircle.exit().remove();
  }
}
