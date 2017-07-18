import { ChartOptions } from './chart-options'
import { IChartType } from './chart-type'
import { INumericDataPoint, NumericDataPoint, NumericBucketPoint } from './types';

export class ScatterLineChart implements IChartType {

  public name = 'scatterline';

  public drawChart(chartOptions: ChartOptions) {

    const lineScatterTopStem = chartOptions.svg.selectAll('.scatterLineTopStem').data(chartOptions.data);
    // update existing
    lineScatterTopStem.attr('class', 'scatterLineTopStem')
      .filter((d: NumericBucketPoint) => !d.isEmpty())
      .attr('x1', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('x2', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('y1', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.max!))
      .attr('y2', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.avg!))
      .attr('stroke', '#000');
    // add new ones
    lineScatterTopStem.enter().append('line')
      .filter((d: NumericBucketPoint) => !d.isEmpty())
      .attr('class', 'scatterLineTopStem')
      .attr('x1', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('x2', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('y1', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.max!))
      .attr('y2', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.avg!))
      .attr('stroke', '#000');
    // remove old ones
    lineScatterTopStem.exit().remove();

    const lineScatterBottomStem = chartOptions.svg.selectAll('.scatterLineBottomStem').data(chartOptions.data);
    // update existing
    lineScatterBottomStem.attr('class', 'scatterLineBottomStem')
      .filter((d: NumericBucketPoint) => !d.isEmpty())
      .attr('x1', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('x2', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('y1', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.avg!))
      .attr('y2', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.min!))
      .attr('stroke', '#000');
    // add new ones
    lineScatterBottomStem.enter().append('line')
      .filter((d: NumericBucketPoint) => !d.isEmpty())
      .attr('class', 'scatterLineBottomStem')
      .attr('x1', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('x2', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('y1', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.avg!))
      .attr('y2', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.min!))
      .attr('stroke', '#000');
    // remove old ones
    lineScatterBottomStem.exit().remove();

    const lineScatterTopCross = chartOptions.svg.selectAll('.scatterLineTopCross').data(chartOptions.data);
    // update existing
    lineScatterTopCross.attr('class', 'scatterLineTopCross')
      .filter((d: NumericBucketPoint) => !d.isEmpty())
      .attr('x1', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()) - 3)
      .attr('x2', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()) + 3)
      .attr('y1', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.max!))
      .attr('y2', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.max!))
      .attr('stroke', '#000')
      .attr('stroke-width', '0.5');
    // add new ones
    lineScatterTopCross.enter().append('line')
      .filter((d: NumericBucketPoint) => !d.isEmpty())
      .attr('class', 'scatterLineTopCross')
      .attr('x1', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()) - 3)
      .attr('x2', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()) + 3)
      .attr('y1', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.max!))
      .attr('y2', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.max!))
      .attr('stroke', '#000')
      .attr('stroke-width', '0.5');
    // remove old ones
    lineScatterTopCross.exit().remove();

    const lineScatterBottomCross = chartOptions.svg.selectAll('.scatterLineBottomCross').data(chartOptions.data);
    // update existing
    lineScatterBottomCross.attr('class', 'scatterLineBottomCross')
      .filter((d: NumericBucketPoint) => !d.isEmpty())
      .attr('x1', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()) - 3)
      .attr('x2', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()) + 3)
      .attr('y1', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.min!))
      .attr('y2', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.min!))
      .attr('stroke', '#000')
      .attr('stroke-width', '0.5');
    // add new ones
    lineScatterBottomCross.enter().append('line')
      .filter((d: NumericBucketPoint) => !d.isEmpty())
      .attr('class', 'scatterLineBottomCross')
      .attr('x1', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()) - 3)
      .attr('x2', (d: NumericBucketPoint) => chartOptions.axis.timeScale(d.timestampSupplier()) + 3)
      .attr('y1', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.min!))
      .attr('y2', (d: NumericBucketPoint) => chartOptions.axis.yScale(d.min!))
      .attr('stroke', '#000')
      .attr('stroke-width', '0.5');
    // remove old ones
    lineScatterBottomCross.exit().remove();

    const circleScatterDot = chartOptions.svg.selectAll('.scatterDot').data(chartOptions.data);
    // update existing
    circleScatterDot.attr('class', 'scatterDot')
      .filter((d: INumericDataPoint) => !d.isEmpty())
      .attr('r', 3)
      .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.valueSupplier()!))
      .style('fill', '#70c4e2')
      .style('opacity', '1')
      .on('mouseover', (d: INumericDataPoint, i: number) => {
        // tip.show(d, i);
      }).on('mouseout', () => {
        // tip.hide();
      });
    // add new ones
    circleScatterDot.enter().append('circle')
      .filter((d: INumericDataPoint) => !d.isEmpty())
      .attr('class', 'scatterDot')
      .attr('r', 3)
      .attr('cx', (d: INumericDataPoint) => chartOptions.axis.timeScale(d.timestampSupplier()))
      .attr('cy', (d: INumericDataPoint) => chartOptions.axis.yScale(d.valueSupplier()!))
      .style('fill', '#70c4e2')
      .style('opacity', '1')
      .on('mouseover', (d: INumericDataPoint, i: number) => {
        // tip.show(d, i);
      }).on('mouseout', () => {
        // tip.hide();
      });
    // remove old ones
    circleScatterDot.exit().remove();

  }
}
