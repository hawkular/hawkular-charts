import { FixedTimeRange, Range, Ranges, INumericDataPoint, PredictiveMetric } from '../model/types'
import { ComputedChartAxis } from '../model/computed-chart-axis'
import { xAxisTimeFormats } from './utility'
import { ChartLayout } from '../model/chart-layout'

declare const d3: any;

function setupFilteredData(chartData: INumericDataPoint[], useZeroMinValue: boolean, alertValue?: number): Ranges {
  const values = chartData.filter((d) => !d.isEmpty()).map((d) => d.valueSupplier()!);
  const dataRange = new Range(d3.min(values) || 0, d3.max(values) || 1);

  // lets adjust the min and max to add some visual spacing between it and the axes
  let visuallyAdjustedMin = useZeroMinValue ? 0 : dataRange.low * .95;
  let visuallyAdjustedMax = dataRange.high + (dataRange.amplitude() * 0.2);

  // check if we need to adjust high/low bound to fit alert value
  if (alertValue) {
    visuallyAdjustedMax = Math.max(visuallyAdjustedMax, alertValue * 1.2);
    visuallyAdjustedMin = Math.min(visuallyAdjustedMin, alertValue * .95);
  }

  return {
    dataRange: dataRange,
    chartRange: new Range(visuallyAdjustedMin, visuallyAdjustedMax)
  }
}

export function determineScale(
          chartData: INumericDataPoint[],
          timeRange: FixedTimeRange,
          xTicks: number,
          yTicks: number,
          useZeroMinValue: boolean,
          yAxisTickFormat: string,
          chartLayout: ChartLayout,
          forecastDataPoints: PredictiveMetric[],
          alertValue?: number): ComputedChartAxis {

  const ranges = setupFilteredData(chartData, useZeroMinValue, alertValue);

  const yScale = d3.scale.linear()
    .clamp(true)
    .rangeRound([chartLayout.modifiedInnerChartHeight, 0])
    .domain(ranges.chartRange.asD3Range());

  const yAxis = d3.svg.axis()
    .scale(yScale)
    .ticks(yTicks)
    .tickSize(4, 4, 0)
    .tickFormat(yAxisTickFormat ? d3.format(yAxisTickFormat) : null)
    .orient('left');

  let timeScaleMax;
  if (forecastDataPoints && forecastDataPoints.length > 0) {
    timeScaleMax = forecastDataPoints[forecastDataPoints.length - 1].timestamp;
  } else {
    timeScaleMax = timeRange.end || Date.now();
  }

  const timeScale = d3.time.scale()
    .range([0, chartLayout.innerChartWidth])
    .nice()
    .domain([timeRange.start, timeScaleMax]);

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
