/// <reference path='../../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';

  import IChartDataPoint = Charts.IChartDataPoint;

  export class AreaChart implements IChartType {

    public name = 'area';

    public drawChart(chartOptions: Charts.ChartOptions): void {

      let
        highArea = d3.svg.area()
          .interpolate(chartOptions.interpolation)
          .defined((d: any) => {
            return !isEmptyDataPoint(d);
          })
          .x((d: any) => {
            return chartOptions.timeScale(d.timestamp);
          })
          .y((d: any) => {
            return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.max);
          })
          .y0((d: any) => {
            return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
          })
        ,

        avgArea = d3.svg.area()
          .interpolate(chartOptions.interpolation)
          .defined((d: any) => {
            return !isEmptyDataPoint(d);
          })
          .x((d: any) => {
            return chartOptions.timeScale(d.timestamp);
          })
          .y((d: any) => {
            return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
          }).y0((d: any) => {
            return chartOptions.hideHighLowValues ? chartOptions.height : chartOptions.yScale(d.min);
          })
        ,

        lowArea = d3.svg.area()
          .interpolate(chartOptions.interpolation)
          .defined((d: any) => {
            return !isEmptyDataPoint(d);
          })
          .x((d: any) => {
            return chartOptions.timeScale(d.timestamp);
          })
          .y((d: any) => {
            return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.min);
          })
          .y0(() => {
            return chartOptions.modifiedInnerChartHeight;
          });

      if (!chartOptions.hideHighLowValues) {
        let
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

        let
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

      let
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

}
