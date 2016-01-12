/// <reference path='../../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

  declare let d3:any;


  export function createLineChart(svg:any,
                                  timeScale:any,
                                  yScale:any,
                                  chartData:IChartDataPoint[],
                                  height?:number,
                                  interpolation?:string) {

    let metricChartLine = d3.svg.line()
      .interpolate(interpolation)
      .defined((d) => {
        return !isEmptyDataPoint(d);
      })
      .x((d) => {
        return timeScale(d.timestamp);
      })
      .y((d) => {
        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
      });

    let pathMetric = svg.selectAll('path.metricLine').data([chartData]);
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
