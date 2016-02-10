/// <reference path='../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';

  /* tslint:disable:no-bitwise */

  export function calcBarWidth(width:number, length:number, barOffset = BAR_OFFSET) {
    return (width / length - barOffset);
  }

  // Calculates the bar width adjusted so that the first and last are half-width of the others
  // see https://issues.jboss.org/browse/HAWKULAR-809 for info on why this is needed
  export function calcBarWidthAdjusted(i, length:number) {
    return (i === 0 || i === length - 1) ? calcBarWidth(width, length, BAR_OFFSET) / 2 :
      calcBarWidth(width, length, BAR_OFFSET);
  }

  // Calculates the bar X position. When using calcBarWidthAdjusted, it is required to push bars
  // other than the first half bar to the left, to make up for the first being just half width
  export function calcBarXPos(d, i, timeScale:any, length:number) {
    return timeScale(d.timestamp) - (i === 0 ? 0 : calcBarWidth(width, length, BAR_OFFSET) / 2);
  }

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
      ['.%L', (d) => {
        return d.getMilliseconds();
      }],
      [':%S', (d) => {
        return d.getSeconds();
      }],
      ['%H:%M', (d) => {
        return d.getMinutes();
      }],
      ['%H:%M', (d) => {
        return d.getHours();
      }],
      ['%a %d', (d) => {
        return d.getDay() && d.getDate() !== 1;
      }],
      ['%b %d', (d) => {
        return d.getDate() !== 1;
      }],
      ['%B', (d) => {
        return d.getMonth();
      }],
      ['%Y', () => {
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

  export function xMidPointStartPosition(d, timeScale:any) {
    return timeScale(d.timestamp);
  }

  // adapted from http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
  export function hashString(str:string):number {
    let hash = 0, i, chr, len;
    if (str.length === 0) {
      return hash;
    }
    for (i = 0, len = str.length; i < len; i++) {
      chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  export function determineXAxisTicksFromScreenWidth(widthInPixels: number):number {
    let xTicks;
    if (widthInPixels <= 350) {
      xTicks = 4;
    } else {
      xTicks = 9;
    }
    return xTicks;
  }

  export function determineYAxisTicksFromScreenHeight(heightInPixels: number):number {
    let yTicks;
    if (heightInPixels <= 120) {
      yTicks = 3;
    } else {
      yTicks = 9;
    }
    return yTicks;
  }

}
