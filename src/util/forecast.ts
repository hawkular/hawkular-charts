import { IPredictiveMetric } from '../model/types'
import { ChartOptions } from '../model/chart-options'

declare const d3: any;

function createForecastLine(interpolate: string,
          timeScale: any/*d3.time.Scale<number, number>*/,
          yScale: any/*d3.scale.Linear<number, number>*/) {
  return d3.svg.line()
      .interpolate(interpolate)
      .x((d: IPredictiveMetric) => timeScale(d.timestampSupplier()))
      .y((d: IPredictiveMetric) => yScale(d.valueSupplier()));
}

export function showForecastData(forecastData: IPredictiveMetric[], chartOptions: ChartOptions) {
  const lastForecastPoint = forecastData[forecastData.length - 1];
  const existsMinOrMax = lastForecastPoint.min || lastForecastPoint.max;

  if (existsMinOrMax) {
    const maxArea = d3.svg.area()
        .interpolate(chartOptions.interpolation || 'monotone')
        .defined((d: IPredictiveMetric) => !d.isEmpty())
        .x((d: IPredictiveMetric) => chartOptions.axis.timeScale(d.timestampSupplier()))
        .y((d: IPredictiveMetric) => chartOptions.axis.yScale(d.max))
        .y0((d: IPredictiveMetric) => chartOptions.axis.yScale(d.min));

    const predictiveConeAreaPath = chartOptions.svg.selectAll('path.ConeArea').data([forecastData]);
    // update existing
    predictiveConeAreaPath.attr('class', 'coneArea')
      .attr('d', maxArea);
    // add new ones
    predictiveConeAreaPath.enter().append('path')
      .attr('class', 'coneArea')
      .attr('d', maxArea);
    // remove old ones
    predictiveConeAreaPath.exit().remove();

  }

  const forecastPathLine = chartOptions.svg.selectAll('.forecastLine').data([forecastData]);
  // update existing
  forecastPathLine.attr('class', 'forecastLine')
    .attr('d', createForecastLine('monotone', chartOptions.axis.timeScale, chartOptions.axis.yScale));
  // add new ones
  forecastPathLine.enter().append('path')
    .attr('class', 'forecastLine')
    .attr('d', createForecastLine('monotone', chartOptions.axis.timeScale, chartOptions.axis.yScale));
  // remove old ones
  forecastPathLine.exit().remove();

}
