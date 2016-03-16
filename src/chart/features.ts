/// <reference path='../../typings/tsd.d.ts' />
namespace Charts {
  'use strict';

  /**
   * Create data points along the line to show the actual values.
   * @param svg
   * @param timeScale
   * @param yScale
   * @param tip
   * @param dataPoints
   */
  export function createDataPoints(svg: any,
    timeScale: any,
    yScale: any,
    tip: any,
    dataPoints: IChartDataPoint[]) {
    let radius = 1;
    let dotDatapoint = svg.selectAll('.dataPointDot').data(dataPoints);
    // update existing
    dotDatapoint.attr('class', 'dataPointDot')
      .attr('r', radius)
      .attr('cx', function(d) {
        return timeScale(d.timestamp);
      })
      .attr('cy', function(d) {
        return d.avg ? yScale(d.avg) : -9999999;
      }).on('mouseover', function(d, i) {
        tip.show(d, i);
      }).on('mouseout', function() {
        tip.hide();
      });
    // add new ones
    dotDatapoint.enter().append('circle')
      .attr('class', 'dataPointDot')
      .attr('r', radius)
      .attr('cx', function(d) {
        return timeScale(d.timestamp);
      })
      .attr('cy', function(d) {
        return d.avg ? yScale(d.avg) : -9999999;
      }).on('mouseover', function(d, i) {
        tip.show(d, i);
      }).on('mouseout', function() {
        tip.hide();
      });
    // remove old ones
    dotDatapoint.exit().remove();
  }

}
