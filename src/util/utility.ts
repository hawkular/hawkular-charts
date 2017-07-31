import { INumericDataPoint } from '../model/types'

declare const d3: any;

const BAR_OFFSET = 2;

export function calcBarWidth(width: number, length: number, barOffset = BAR_OFFSET) {
  return (width / length - barOffset);
}

// Calculates the bar width adjusted so that the first and last are half-width of the others
// see https://issues.jboss.org/browse/HAWKULAR-809 for info on why this is needed
export function calcBarWidthAdjusted(i: number, width: number, length: number) {
  return (i === 0 || i === length - 1) ? calcBarWidth(width, length, BAR_OFFSET) / 2 :
    calcBarWidth(width, length, BAR_OFFSET);
}

// Calculates the bar X position. When using calcBarWidthAdjusted, it is required to push bars
// other than the first half bar to the left, to make up for the first being just half width
export function calcBarXPos(d: INumericDataPoint, i: number, width: number, timeScale: any, length: number) {
  return timeScale(d.timestampSupplier()) - (i === 0 ? 0 : calcBarWidth(width, length, BAR_OFFSET) / 2);
}

export function xAxisTimeFormats() {
  return d3.time.format.multi([
    ['.%L', (d: any) => d.getMilliseconds()],
    [':%S', (d: any) => d.getSeconds()],
    ['%H:%M', (d: any) => d.getMinutes()],
    ['%H:%M', (d: any) => d.getHours()],
    ['%a %d', (d: any) => d.getDay() && d.getDate() !== 1],
    ['%b %d', (d: any) => d.getDate() !== 1],
    ['%B', (d: any) => d.getMonth()],
    ['%Y', () => true]
  ]);
}

export function createSvgDefs(chart: any) {

  const defs = chart.append('defs');

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

// adapted from http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
export function hashString(str: string): number {
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

export function determineXAxisTicksFromScreenWidth(widthInPixels: number): number {
  let xTicks;
  if (widthInPixels <= 200) {
    xTicks = 2;
  } else if (widthInPixels <= 350 && widthInPixels > 200) {
    xTicks = 4;
  } else {
    xTicks = 9;
  }
  return xTicks;
}

export function determineYAxisTicksFromScreenHeight(heightInPixels: number): number {
  let yTicks;
  if (heightInPixels <= 120) {
    yTicks = 3;
  } else {
    yTicks = 9;
  }
  return yTicks;
}

export function determineYAxisGridLineTicksFromScreenHeight(heightInPixels: number): number {
  let yTicks;
  if (heightInPixels <= 60) {
    yTicks = 0;
  } else {
    yTicks = 10;
  }
  return yTicks;
}
