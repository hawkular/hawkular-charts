/// <reference path='../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

  /**
   * An empty datapoint has 'empty' attribute set to true. Used to distinguish from real 0 values.
   * @param d
   * @returns {boolean}
   */
  export function isEmptyDataPoint(d:IChartDataPoint):boolean {
    return d.empty;
  }

  /**
   * Raw metrics have a 'value' set instead of avg/min/max of aggregates
   * @param d
   * @returns {boolean}
   */
  export function isRawMetric(d:IChartDataPoint):boolean {
    return typeof d.avg === 'undefined';
  }

  export function xAxisTimeFormats() {
    return d3.time.format.multi([
      [".%L", (d) => {
        return d.getMilliseconds();
      }],
      [":%S", (d) => {
        return d.getSeconds();
      }],
      ["%H:%M", (d) => {
        return d.getMinutes()
      }],
      ["%H:%M", (d) => {
        return d.getHours();
      }],
      ["%a %d", (d) => {
        return d.getDay() && d.getDate() != 1;
      }],
      ["%b %d", (d) => {
        return d.getDate() != 1;
      }],
      ["%B", (d) => {
        return d.getMonth();
      }],
      ["%Y", () => {
        return true;
      }]
    ]);
  }

  export function createSvgDefs(chart) {

    let defs = chart.append('defs');

    defs.append('pattern')
      .attr('id', 'noDataStripes')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('x', '0')
      .attr('y', '0')
      .attr('width', '6')
      .attr('height', '3')
      .append('path')
      .attr('d', 'M 0 0 6 0')
      .attr('style', 'stroke:#CCCCCC; fill:none;');

    defs.append('pattern')
      .attr('id', 'unknownStripes')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('x', '0')
      .attr('y', '0')
      .attr('width', '6')
      .attr('height', '3')
      .attr('style', 'stroke:#2E9EC2; fill:none;')
      .append('path').attr('d', 'M 0 0 6 0');

    defs.append('pattern')
      .attr('id', 'downStripes')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('x', '0')
      .attr('y', '0')
      .attr('width', '6')
      .attr('height', '3')
      .attr('style', 'stroke:#ff8a9a; fill:none;')
      .append('path').attr('d', 'M 0 0 6 0');

  }


}
