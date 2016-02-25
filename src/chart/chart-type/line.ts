/// <reference path='../../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';

  import IChartDataPoint = Charts.IChartDataPoint;

  export function createLineChart(chartOptions: Charts.ChartOptions) {

    let metricChartLine = d3.svg.line()
      .interpolate(chartOptions.interpolation)
      .defined((d: any) => {
        return !isEmptyDataPoint(d);
      })
      .x((d: any) => {
        return chartOptions.timeScale(d.timestamp);
      })
      .y((d: any) => {
        return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
      });

    let pathMetric = chartOptions.svg.selectAll('path.metricLine').data([chartOptions.chartData]);
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
