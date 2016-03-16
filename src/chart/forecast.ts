/// <reference path='../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';

  function createForecastLine(newInterpolation, timeScale, yScale) {
    let interpolate = newInterpolation || 'monotone',
      line = d3.svg.line()
        .interpolate(interpolate)
        .x((d: any) => {
          return timeScale(d.timestamp);
        })
        .y((d: any) => {
          return yScale(d.value);
        });

    return line;
  }

  export function showForecastData(forecastData: IPredictiveMetric[], chartOptions: ChartOptions) {
    let existsMinOrMax,
      lastForecastPoint = forecastData[forecastData.length - 1];

    existsMinOrMax = lastForecastPoint.min || lastForecastPoint.max;

    if (existsMinOrMax) {
      let
        maxArea = d3.svg.area()
          .interpolate(chartOptions.interpolation)
          .defined((d: any) => {
            return !isEmptyDataPoint(d);
          })
          .x((d: any) => {
            return chartOptions.timeScale(d.timestamp);
          })
          .y((d: any) => {
            return chartOptions.yScale(d.max);
          })
          .y0((d: any) => {
            return chartOptions.yScale(d.min);
          });

      let
        predictiveConeAreaPath = chartOptions.svg.selectAll('path.ConeArea').data([forecastData]);
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

    let forecastPathLine = chartOptions.svg.selectAll('.forecastLine').data([forecastData]);
    // update existing
    forecastPathLine.attr('class', 'forecastLine')
      .attr('d', createForecastLine('monotone', chartOptions.timeScale, chartOptions.yScale));
    // add new ones
    forecastPathLine.enter().append('path')
      .attr('class', 'forecastLine')
      .attr('d', createForecastLine('monotone', chartOptions.timeScale, chartOptions.yScale));
    // remove old ones
    forecastPathLine.exit().remove();

  }

}
