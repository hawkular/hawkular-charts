/// <reference path='../../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

  declare let d3:any;

  export function createAreaChart(svg:any,
                                  timeScale:any,
                                  yScale:any,
                                  chartData:IChartDataPoint[],
                                  height?:number,
                                  interpolation?:string,
                                  hideHighLowValues?:boolean) {

    console.log('Creating Area Chart');

    let highArea = d3.svg.area()
      .interpolate(interpolation)
      .defined((d) => {
        return !isEmptyDataPoint(d);
      })
      .x((d) => {
        return timeScale(d);
      })
      .y((d) => {
        return isRawMetric(d) ? yScale(d.value) : yScale(d.max);
      })
      .y0((d) => {
        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
      }),

      avgArea = d3.svg.area()
        .interpolate(interpolation)
        .defined((d) => {
          return !isEmptyDataPoint(d);
        })
        .x((d) => {
          return timeScale(d);
        })
        .y((d) => {
          return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
        }).y0((d) => {
          return hideHighLowValues ? height : yScale(d.min);
        }),

      lowArea = d3.svg.area()
        .interpolate(interpolation)
        .defined((d) => {
          return !isEmptyDataPoint(d);
        })
        .x((d) => {
          return timeScale(d);
        })
        .y((d) => {
          return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
        })
        .y0(() => {
          return height;
        });


    if (!hideHighLowValues) {
      let highAreaPath = svg.selectAll('path.highArea').data(chartData);
      // update existing
      highAreaPath.attr('class', 'highArea')
        .attr('d', highArea);
      // add new ones
      highAreaPath.enter().append('path')
        .attr('class', 'highArea')
        .attr('d', highArea);
      // remove old ones
      highAreaPath.exit().remove();

      let lowAreaPath = svg.selectAll('path.lowArea').data(chartData);
      // update existing
      lowAreaPath.attr('class', 'lowArea')
        .attr('d', lowArea);
      // add new ones
      lowAreaPath.enter().append('path')
        .attr('class', 'lowArea')
        .attr('d', lowArea);
      // remove old ones
      lowAreaPath.exit().remove();
    }

    let avgAreaPath = svg.selectAll('path.avgArea').data(chartData);
    // update existing
    avgAreaPath.attr('class', 'avgArea')
      .transition()
      .attr('d', avgArea);
    // add new ones
    avgAreaPath.enter().append('path')
      .attr('class', 'avgArea')
      .transition()
      .attr('d', avgArea);
    // remove old ones
    avgAreaPath.exit().remove();
  }


}
