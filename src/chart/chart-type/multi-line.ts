/// <reference path='../../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';

  import IChartDataPoint = Charts.IChartDataPoint;

  export class MultiLineChart implements IChartType {

    public name = 'multiline';

    public drawChart(chartOptions: Charts.ChartOptions) {

      let colorScale = <any>d3.scale.category10(),
        g = 0;

      if (chartOptions.multiChartData) {
        // before updating, let's remove those missing from datapoints (if any)
        chartOptions.svg.selectAll('path[id^=\'multiLine\']')[0].forEach((existingPath: any) => {
          let stillExists = false;
          chartOptions.multiChartData.forEach((singleChartData: any) => {
            singleChartData.keyHash = singleChartData.keyHash
              || ('multiLine' + hashString(singleChartData.key));
            if (existingPath.getAttribute('id') === singleChartData.keyHash) {
              stillExists = true;
            }
          });
          if (!stillExists) {
            existingPath.remove();
          }
        });

        chartOptions.multiChartData.forEach((singleChartData: any) => {
          if (singleChartData && singleChartData.values) {
            singleChartData.keyHash = singleChartData.keyHash
              || ('multiLine' + hashString(singleChartData.key));
            let pathMultiLine = chartOptions.svg.selectAll('path#' + singleChartData.keyHash)
              .data([singleChartData.values]);
            // update existing
            pathMultiLine.attr('id', singleChartData.keyHash)
              .attr('class', 'multiLine')
              .attr('fill', 'none')
              .attr('stroke', () => {
                return singleChartData.color || colorScale(g++);
              })
              .transition()
              .attr('d', this.createLine('linear', chartOptions.timeScale, chartOptions.yScale));
            // add new ones
            pathMultiLine.enter().append('path')
              .attr('id', singleChartData.keyHash)
              .attr('class', 'multiLine')
              .attr('fill', 'none')
              .attr('stroke', () => {
                if (singleChartData.color) {
                  return singleChartData.color;
                } else {
                  return colorScale(g++);
                }
              })
              .transition()
              .attr('d', this.createLine('linear', chartOptions.timeScale, chartOptions.yScale));
            // remove old ones
            pathMultiLine.exit().remove();
          }
        });
      } else {
        console.warn('No multi-data set for multiline chart');
      }

    }

    private createLine(newInterpolation, timeScale, yScale) {
      let interpolate = newInterpolation || 'monotone',
        line = d3.svg.line()
          .interpolate(interpolate)
          .defined((d: any) => {
            return !isEmptyDataPoint(d);
          })
          .x((d: any) => {
            return timeScale(d.timestamp);
          })
          .y((d: any) => {
            return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
          });

      return line;
    }

  }
}
