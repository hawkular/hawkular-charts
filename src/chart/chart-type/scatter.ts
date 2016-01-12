/// <reference path='../../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

  declare let d3:any;

  export function createScatterChart(svg:any,
                                     timeScale:any,
                                     yScale:any,
                                     chartData:IChartDataPoint[],
                                     height?:number,
                                     interpolation?:string,
                                     hideHighLowValues?:boolean) {

    if (!hideHighLowValues) {

      let highDotCircle = svg.selectAll('.highDot').data(chartData);
      // update existing
      highDotCircle.attr('class', 'highDot')
        .filter((d) => {
          return !isEmptyDataPoint(d);
        })
        .attr('r', 3)
        .attr('cx', (d) => {
          return xMidPointStartPosition(d, timeScale);
        })
        .attr('cy', (d) => {
          return isRawMetric(d) ? yScale(d.value) : yScale(d.max);
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
          return xMidPointStartPosition(d, timeScale);
        })
        .attr('cy', (d) => {
          return isRawMetric(d) ? yScale(d.value) : yScale(d.max);
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

      let lowDotCircle = svg.selectAll('.lowDot').data(chartData);
      // update existing
      lowDotCircle.attr('class', 'lowDot')
        .filter((d) => {
          return !isEmptyDataPoint(d);
        })
        .attr('r', 3)
        .attr('cx', (d) => {
          return xMidPointStartPosition(d, timeScale);
        })
        .attr('cy', (d) => {
          return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
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
          return xMidPointStartPosition(d, timeScale);
        })
        .attr('cy', (d) => {
          return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
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
    }
    else {
      // we should hide high-low values.. or remove if existing
      svg.selectAll('.highDot, .lowDot').remove();
    }

    let avgDotCircle = svg.selectAll('.avgDot').data(chartData);
    // update existing
    avgDotCircle.attr('class', 'avgDot')
      .filter((d) => {
        return !isEmptyDataPoint(d);
      })
      .attr('r', 3)
      .attr('cx', (d) => {
        return xMidPointStartPosition(d, timeScale);
      })
      .attr('cy', (d) => {
        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
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
        return xMidPointStartPosition(d, timeScale);
      })
      .attr('cy', (d) => {
        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
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
