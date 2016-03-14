/// <reference path='../../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';

  import IChartDataPoint = Charts.IChartDataPoint;

  export class ScatterChart implements IChartType {

    public name = 'scatter';

    public drawChart(chartOptions: Charts.ChartOptions) {

      if (!chartOptions.hideHighLowValues) {

        let highDotCircle = chartOptions.svg.selectAll('.highDot').data(chartOptions.chartData);
        // update existing
        highDotCircle.attr('class', 'highDot')
          .filter((d: any) => {
            return !isEmptyDataPoint(d);
          })
          .attr('r', 3)
          .attr('cx', (d) => {
            return xMidPointStartPosition(d, chartOptions.timeScale);
          })
          .attr('cy', (d) => {
            return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.max);
          })
          .style('fill', () => {
            return '#ff1a13';
          }).on('mouseover', (d, i) => {
            //tip.show(d, i);
          }).on('mouseout', () => {
            //tip.hide();
          });
        // add new ones
        highDotCircle.enter().append('circle')
          .filter((d) => {
            return !isEmptyDataPoint(d);
          })
          .attr('class', 'highDot')
          .attr('r', 3)
          .attr('cx', (d) => {
            return xMidPointStartPosition(d, chartOptions.timeScale);
          })
          .attr('cy', (d) => {
            return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.max);
          })
          .style('fill', () => {
            return '#ff1a13';
          }).on('mouseover', (d, i) => {
            //tip.show(d, i);
          }).on('mouseout', () => {
            //tip.hide();
          });
        // remove old ones
        highDotCircle.exit().remove();

        let lowDotCircle = chartOptions.svg.selectAll('.lowDot').data(chartOptions.chartData);
        // update existing
        lowDotCircle.attr('class', 'lowDot')
          .filter((d) => {
            return !isEmptyDataPoint(d);
          })
          .attr('r', 3)
          .attr('cx', (d) => {
            return xMidPointStartPosition(d, chartOptions.timeScale);
          })
          .attr('cy', (d) => {
            return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.min);
          })
          .style('fill', () => {
            return '#70c4e2';
          }).on('mouseover', (d, i) => {
            //tip.show(d, i);
          }).on('mouseout', () => {
            //tip.hide();
          });
        // add new ones
        lowDotCircle.enter().append('circle')
          .filter((d) => {
            return !isEmptyDataPoint(d);
          })
          .attr('class', 'lowDot')
          .attr('r', 3)
          .attr('cx', (d) => {
            return xMidPointStartPosition(d, chartOptions.timeScale);
          })
          .attr('cy', (d) => {
            return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.min);
          })
          .style('fill', () => {
            return '#70c4e2';
          }).on('mouseover', (d, i) => {
            //tip.show(d, i);
          }).on('mouseout', () => {
            //tip.hide();
          });
        // remove old ones
        lowDotCircle.exit().remove();

      } else {
        // we should hide high-low values.. or remove if existing
        chartOptions.svg.selectAll('.highDot, .lowDot').remove();
      }

      let avgDotCircle = chartOptions.svg.selectAll('.avgDot').data(chartOptions.chartData);
      // update existing
      avgDotCircle.attr('class', 'avgDot')
        .filter((d) => {
          return !isEmptyDataPoint(d);
        })
        .attr('r', 3)
        .attr('cx', (d) => {
          return xMidPointStartPosition(d, chartOptions.timeScale);
        })
        .attr('cy', (d) => {
          return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
        })
        .style('fill', () => {
          return '#FFF';
        }).on('mouseover', (d, i) => {
          //tip.show(d, i);
        }).on('mouseout', () => {
          //tip.hide();
        });
      // add new ones
      avgDotCircle.enter().append('circle')
        .filter((d) => {
          return !isEmptyDataPoint(d);
        })
        .attr('class', 'avgDot')
        .attr('r', 3)
        .attr('cx', (d) => {
          return xMidPointStartPosition(d, chartOptions.timeScale);
        })
        .attr('cy', (d) => {
          return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
        })
        .style('fill', () => {
          return '#FFF';
        }).on('mouseover', (d, i) => {
          //tip.show(d, i);
        }).on('mouseout', () => {
          //tip.hide();
        });
      // remove old ones
      avgDotCircle.exit().remove();

    }
  }

}
