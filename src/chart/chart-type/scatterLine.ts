/// <reference path='../../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';

  import IChartDataPoint = Charts.IChartDataPoint;

  export function createScatterLineChart(chartOptions: Charts.ChartOptions) {

    let lineScatterTopStem = chartOptions.svg.selectAll('.scatterLineTopStem').data(chartOptions.chartData);
    // update existing
    lineScatterTopStem.attr('class', 'scatterLineTopStem')
      .filter((d: any) => {
        return !isEmptyDataPoint(d);
      })
      .attr('x1', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('x2', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('y1', (d) => {
        return chartOptions.yScale(d.max);
      })
      .attr('y2', (d) => {
        return chartOptions.yScale(d.avg);
      })
      .attr('stroke', (d) => {
        return '#000';
      });
    // add new ones
    lineScatterTopStem.enter().append('line')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('class', 'scatterLineTopStem')
      .attr('x1', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('x2', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('y1', (d) => {
        return chartOptions.yScale(d.max);
      })
      .attr('y2', (d) => {
        return chartOptions.yScale(d.avg);
      })
      .attr('stroke', (d) => {
        return '#000';
      });
    // remove old ones
    lineScatterTopStem.exit().remove();

    let lineScatterBottomStem = chartOptions.svg.selectAll('.scatterLineBottomStem').data(chartOptions.chartData);
    // update existing
    lineScatterBottomStem.attr('class', 'scatterLineBottomStem')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('x1', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('x2', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('y1', (d) => {
        return chartOptions.yScale(d.avg);
      })
      .attr('y2', (d) => {
        return chartOptions.yScale(d.min);
      })
      .attr('stroke', (d) => {
        return '#000';
      });
    // add new ones
    lineScatterBottomStem.enter().append('line')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('class', 'scatterLineBottomStem')
      .attr('x1', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('x2', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('y1', (d) => {
        return chartOptions.yScale(d.avg);
      })
      .attr('y2', (d) => {
        return chartOptions.yScale(d.min);
      })
      .attr('stroke', (d) => {
        return '#000';
      });
    // remove old ones
    lineScatterBottomStem.exit().remove();

    let lineScatterTopCross = chartOptions.svg.selectAll('.scatterLineTopCross').data(chartOptions.chartData);
    // update existing
    lineScatterTopCross.attr('class', 'scatterLineTopCross')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('x1', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale) - 3;
      })
      .attr('x2', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale) + 3;
      })
      .attr('y1', (d) => {
        return chartOptions.yScale(d.max);
      })
      .attr('y2', (d) => {
        return chartOptions.yScale(d.max);
      })
      .attr('stroke', (d) => {
        return '#000';
      })
      .attr('stroke-width', (d) => {
        return '0.5';
      });
    // add new ones
    lineScatterTopCross.enter().append('line')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('class', 'scatterLineTopCross')
      .attr('x1', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale) - 3;
      })
      .attr('x2', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale) + 3;
      })
      .attr('y1', (d) => {
        return chartOptions.yScale(d.max);
      })
      .attr('y2', (d) => {
        return chartOptions.yScale(d.max);
      })
      .attr('stroke', (d) => {
        return '#000';
      })
      .attr('stroke-width', (d) => {
        return '0.5';
      });
    // remove old ones
    lineScatterTopCross.exit().remove();

    let lineScatterBottomCross = chartOptions.svg.selectAll('.scatterLineBottomCross').data(chartOptions.chartData);
    // update existing
    lineScatterBottomCross.attr('class', 'scatterLineBottomCross')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('x1', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale) - 3;
      })
      .attr('x2', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale) + 3;
      })
      .attr('y1', (d) => {
        return chartOptions.yScale(d.min);
      })
      .attr('y2', (d) => {
        return chartOptions.yScale(d.min);
      })
      .attr('stroke', (d) => {
        return '#000';
      })
      .attr('stroke-width', (d) => {
        return '0.5';
      });
    // add new ones
    lineScatterBottomCross.enter().append('line')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('class', 'scatterLineBottomCross')
      .attr('x1', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale) - 3;
      })
      .attr('x2', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale) + 3;
      })
      .attr('y1', (d) => {
        return chartOptions.yScale(d.min);
      })
      .attr('y2', (d) => {
        return chartOptions.yScale(d.min);
      })
      .attr('stroke', (d) => {
        return '#000';
      })
      .attr('stroke-width', (d) => {
        return '0.5';
      });
    // remove old ones
    lineScatterBottomCross.exit().remove();

    let circleScatterDot = chartOptions.svg.selectAll('.scatterDot').data(chartOptions.chartData);
    // update existing
    circleScatterDot.attr('class', 'scatterDot')
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
        return '#70c4e2';
      })
      .style('opacity', () => {
        return '1';
      }).on('mouseover', (d, i) => {
        //tip.show(d, i);
      }).on('mouseout', () => {
        //tip.hide();
      });
    // add new ones
    circleScatterDot.enter().append('circle')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('class', 'scatterDot')
      .attr('r', 3)
      .attr('cx', (d) => {
        return xMidPointStartPosition(d, chartOptions.timeScale);
      })
      .attr('cy', (d) => {
        return isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
      })
      .style('fill', () => {
        return '#70c4e2';
      })
      .style('opacity', () => {
        return '1';
      }).on('mouseover', (d, i) => {
        //tip.show(d, i);
      }).on('mouseout', () => {
        //tip.hide();
      });
    // remove old ones
    circleScatterDot.exit().remove();

  }

}
