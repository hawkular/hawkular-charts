import { ChartOptions } from './chart-options'
import { IChartType } from './chart-type'
import { INumericDataPoint, NumericDataPoint, NumericBucketPoint } from './types'

declare const d3: any;

export class AreaChart implements IChartType {

  public name = 'area';

  public drawChart(chartOptions: ChartOptions): void {

    const
      highArea = d3.svg.area()
        .interpolate(chartOptions.interpolation || 'monotone')
        .defined((d: INumericDataPoint) => !d.isEmpty())
        .x((d: INumericDataPoint) => chartOptions.timeScale(d.timestampSupplier()))
        .y((d: INumericDataPoint) => {
          return d.isRaw ? chartOptions.yScale((<NumericDataPoint>d).value) : chartOptions.yScale((<NumericBucketPoint>d).max);
        })
        .y0((d: INumericDataPoint) => chartOptions.yScale(d.valueSupplier()))
      ,

      avgArea = d3.svg.area()
        .interpolate(chartOptions.interpolation || 'monotone')
        .defined((d: INumericDataPoint) => !d.isEmpty())
        .x((d: INumericDataPoint) => chartOptions.timeScale(d.timestampSupplier()))
        .y((d: INumericDataPoint) => chartOptions.yScale(d.valueSupplier()))
        .y0((d: INumericDataPoint) => {
          return chartOptions.hideHighLowValues ? chartOptions.height
           : (d.isRaw ? chartOptions.yScale((<NumericDataPoint>d).value) : chartOptions.yScale((<NumericBucketPoint>d).min))
        })
      ,

      lowArea = d3.svg.area()
        .interpolate(chartOptions.interpolation || 'monotone')
        .defined((d: INumericDataPoint) => !d.isEmpty())
        .x((d: INumericDataPoint) => chartOptions.timeScale(d.timestampSupplier()))
        .y((d: INumericDataPoint) => {
          return d.isRaw ? chartOptions.yScale((<NumericDataPoint>d).value) : chartOptions.yScale((<NumericBucketPoint>d).min);
        })
        .y0(() => chartOptions.modifiedInnerChartHeight);

    if (!chartOptions.hideHighLowValues) {
      const
        highAreaPath = chartOptions.svg.selectAll('path.highArea').data([chartOptions.chartData]);
      // update existing
      highAreaPath
        .attr('class', 'highArea')
        .attr('d', highArea);
      // add new ones
      highAreaPath
        .enter()
        .append('path')
        .attr('class', 'highArea')
        .attr('d', highArea);
      // remove old ones
      highAreaPath
        .exit()
        .remove();

      const
        lowAreaPath = chartOptions.svg.selectAll('path.lowArea').data([chartOptions.chartData]);
      // update existing
      lowAreaPath
        .attr('class', 'lowArea')
        .attr('d', lowArea);
      // add new ones
      lowAreaPath
        .enter()
        .append('path')
        .attr('class', 'lowArea')
        .attr('d', lowArea);
      // remove old ones
      lowAreaPath
        .exit()
        .remove();
    }

    const
      avgAreaPath = chartOptions.svg.selectAll('path.avgArea').data([chartOptions.chartData]);
    // update existing
    avgAreaPath.attr('class', 'avgArea')
      .attr('d', avgArea);
    // add new ones
    avgAreaPath.enter().append('path')
      .attr('class', 'avgArea')
      .attr('d', avgArea);
    // remove old ones
    avgAreaPath.exit().remove();
  }

}
