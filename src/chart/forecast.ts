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

  export function showForecastData(forecastData: ISimpleMetric[], chartOptions: ChartOptions) {
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
