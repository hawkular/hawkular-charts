import { Range, Ranges, IMultiDataPoint, INumericDataPoint } from '../model/types'
import { ComputedChartAxis } from '../model/computed-chart-axis'
import { xAxisTimeFormats } from './utility'
import { ChartLayout } from '../model/chart-layout'

declare let d3: any;

type MaybeRange = Range | undefined;

function determineMultiDataMinMax(multiDataPoints: IMultiDataPoint[]): MaybeRange {
  let range: MaybeRange;
  multiDataPoints.forEach((series) => {
    series.values.forEach(datapoint => {
      const value = datapoint.valueSupplier();
      if (value) {
        if (range === undefined) {
          range = new Range(value, value);
        } else if (range.low > value) {
          range.low = value;
        } else if (range.high < value) {
          range.high = value;
        }
      }
    });
  });
  return range;
}

function setupFilteredMultiData(multiDataPoints: IMultiDataPoint[], useZeroMinValue: boolean, alertValue?: number): Ranges {
  let alertPeak: number,
    highPeak: number;

  const dataRange: Range = determineMultiDataMinMax(multiDataPoints) || new Range(0, 1);
  const amplitude = dataRange.amplitude();

  const low = useZeroMinValue ? 0 : dataRange.low - (dataRange.low * 0.05);
  let high: number;
  if (alertValue) {
    alertPeak = alertValue * 1.2;
    highPeak = dataRange.high + (amplitude * 0.2);
    high = alertPeak > highPeak ? alertPeak : highPeak;
  } else {
    high = dataRange.high + (amplitude * 0.2);
  }

  return {
    dataRange: dataRange,
    chartRange: new Range(low, high)
  };
}

export function determineMultiScale(
          multiDataPoints: IMultiDataPoint[],
          xTicks: number,
          yTicks: number,
          useZeroMinValue: boolean,
          chartLayout: ChartLayout,
          alertValue?: number): ComputedChartAxis {

  const ranges = setupFilteredMultiData(multiDataPoints, useZeroMinValue, alertValue);

  const yScale = d3.scale.linear()
    .clamp(true)
    .rangeRound([chartLayout.modifiedInnerChartHeight, 0])
    .domain(ranges.chartRange.asD3Range());

  const yAxis = d3.svg.axis()
    .scale(yScale)
    .ticks(yTicks)
    .tickSize(4, 4, 0)
    .orient('left');

  const timeScale = d3.time.scale()
    .range([0, chartLayout.innerChartWidth])
    .domain([d3.min(multiDataPoints, (d: IMultiDataPoint) => d3.min(d.values, (p: INumericDataPoint) => p.timestampSupplier())),
    d3.max(multiDataPoints, (d: IMultiDataPoint) => d3.max(d.values, (p: INumericDataPoint) => p.timestampSupplier()))]);

  const xAxis = d3.svg.axis()
    .scale(timeScale)
    .ticks(xTicks)
    .tickFormat(xAxisTimeFormats())
    .tickSize(4, 4, 0)
    .orient('bottom');

  return {
    dataRange: ranges.dataRange,
    chartRange: ranges.chartRange,
    yScale: yScale,
    yAxis: yAxis,
    timeScale: timeScale,
    xAxis: xAxis
  };
}
