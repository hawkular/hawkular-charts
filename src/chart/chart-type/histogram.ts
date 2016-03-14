/// <reference path='../../../typings/tsd.d.ts' />
namespace Charts {
  'use strict';

  export const BAR_OFFSET = 2;

  export class HistogramChart implements IChartType {

    public name = 'histogram';

    public drawChart(chartOptions: Charts.ChartOptions, optionalBoolean = false) {

      const barClass = optionalBoolean ? 'leaderBar' : 'histogram';

      const rectHistogram = chartOptions.svg.selectAll('rect.' + barClass).data(chartOptions.chartData);

      function buildBars(selection: d3.Selection<any>) {
        selection
          .attr('class', barClass)
          .on('mouseover', (d, i) => {
            chartOptions.tip.show(d, i);
          }).on('mouseout', () => {
            chartOptions.tip.hide();
          })
          .transition()
          .attr('x', (d, i) => {
            return calcBarXPos(d, i, chartOptions.timeScale, chartOptions.chartData.length);
          })
          .attr('width', (d, i) => {
            return calcBarWidthAdjusted(i, chartOptions.chartData.length);
          })
          .attr('y', (d) => {
            return isEmptyDataPoint(d) ? 0 : chartOptions.yScale(d.avg);
          })
          .attr('height', (d) => {
            return chartOptions.modifiedInnerChartHeight - chartOptions.yScale(isEmptyDataPoint(d) ?
              chartOptions.yScale(chartOptions.visuallyAdjustedMax) : d.avg);
          })
          .attr('opacity', chartOptions.stacked ? '.6' : '1')
          .attr('fill', (d) => {
            return isEmptyDataPoint(d) ? 'url(#noDataStripes)' : (chartOptions.stacked ? '#D3D3D6' : '#C0C0C0');
          })
          .attr('stroke', (d) => {
            return '#777';
          })
          .attr('stroke-width', (d) => {
            return '0';
          })
          .attr('data-hawkular-value', (d) => {
            return d.avg;
          });

      }

      function buildHighBar(selection: d3.Selection<any>) {
        selection
          .attr('class', (d) => {
            return d.min === d.max ? 'singleValue' : 'high';
          })
          .attr('x', function(d, i) {
            return calcBarXPos(d, i, chartOptions.timeScale, chartOptions.chartData.length);
          })
          .attr('y', (d) => {
            return isNaN(d.max) ? chartOptions.yScale(chartOptions.visuallyAdjustedMax) : chartOptions.yScale(d.max);
          })
          .attr('height', (d) => {
            return isEmptyDataPoint(d) ? 0 : (chartOptions.yScale(d.avg) - chartOptions.yScale(d.max) || 2);
          })
          .attr('width', (d, i) => {
            return calcBarWidthAdjusted(i, chartOptions.chartData.length);
          })
          .attr('opacity', 0.9)
          .on('mouseover', (d, i) => {
            chartOptions.tip.show(d, i);
          }).on('mouseout', () => {
            chartOptions.tip.hide();
          });
      }

      function buildLowerBar(selection: d3.Selection<any>) {
        selection
          .attr('class', 'low')
          .attr('x', (d, i) => {
            return calcBarXPos(d, i, chartOptions.timeScale, chartOptions.chartData.length);
          })
          .attr('y', (d) => {
            return isNaN(d.avg) ? chartOptions.height : chartOptions.yScale(d.avg);
          })
          .attr('height', (d) => {
            return isEmptyDataPoint(d) ? 0 : (chartOptions.yScale(d.min) - chartOptions.yScale(d.avg));
          })
          .attr('width', (d, i) => {
            return calcBarWidthAdjusted(i, chartOptions.chartData.length);
          })
          .attr('opacity', 0.9)
          .on('mouseover', (d, i) => {
            chartOptions.tip.show(d, i);
          }).on('mouseout', () => {
            chartOptions.tip.hide();
          });

      }

      function buildTopStem(selection: d3.Selection<any>) {
        selection
          .attr('class', 'histogramTopStem')
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
            return chartOptions.yScale(d.max);
          })
          .attr('y2', (d) => {
            return chartOptions.yScale(d.avg);
          })
          .attr('stroke', (d) => {
            return 'red';
          })
          .attr('stroke-opacity', (d) => {
            return 0.6;
          });
      }

      function buildLowStem(selection: d3.Selection<any>) {
        selection
          .filter((d) => {
            return !isEmptyDataPoint(d);
          })
          .attr('class', 'histogramBottomStem')
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
            return 'red';
          }).attr('stroke-opacity', (d) => {
            return 0.6;
          });

      }

      function buildTopCross(selection: d3.Selection<any>) {
        selection
          .filter((d) => {
            return !isEmptyDataPoint(d);
          })
          .attr('class', 'histogramTopCross')
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
            return 'red';
          })
          .attr('stroke-width', (d) => {
            return '0.5';
          })
          .attr('stroke-opacity', (d) => {
            return 0.6;
          });
      }

      function buildBottomCross(selection: d3.Selection<any>) {
        selection
          .filter((d) => {
            return !isEmptyDataPoint(d);
          })
          .attr('class', 'histogramBottomCross')
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
            return 'red';
          })
          .attr('stroke-width', (d) => {
            return '0.5';
          })
          .attr('stroke-opacity', (d) => {
            return 0.6;
          });
      }

      function createHistogramHighLowValues(svg: any, chartData: IChartDataPoint[], stacked?: boolean) {
        if (stacked) {
          // upper portion representing avg to high
          const rectHigh = svg.selectAll('rect.high, rect.singleValue').data(chartData);

          // update existing
          rectHigh.call(buildHighBar);

          // add new ones
          rectHigh
            .enter()
            .append('rect')
            .call(buildHighBar);

          // remove old ones
          rectHigh.exit().remove();

          // lower portion representing avg to low
          const rectLow = svg.selectAll('rect.low').data(chartOptions.chartData);

          // update existing
          rectLow.call(buildLowerBar);

          // add new ones
          rectLow
            .enter()
            .append('rect')
            .call(buildLowerBar);

          // remove old ones
          rectLow.exit().remove();
        } else {

          const lineHistoHighStem = svg.selectAll('.histogramTopStem').data(chartOptions.chartData);

          // update existing
          lineHistoHighStem.call(buildTopStem);

          // add new ones
          lineHistoHighStem
            .enter()
            .append('line')
            .call(buildTopStem);

          // remove old ones
          lineHistoHighStem.exit().remove();

          const lineHistoLowStem = svg.selectAll('.histogramBottomStem').data(chartOptions.chartData);

          // update existing
          lineHistoLowStem.call(buildLowStem);

          // add new ones
          lineHistoLowStem
            .enter()
            .append('line')
            .call(buildLowStem);

          // remove old ones
          lineHistoLowStem.exit().remove();

          const lineHistoTopCross = svg.selectAll('.histogramTopCross').data(chartOptions.chartData);

          // update existing
          lineHistoTopCross.call(buildTopCross);

          // add new ones
          lineHistoTopCross
            .enter()
            .append('line')
            .call(buildTopCross);

          // remove old ones
          lineHistoTopCross.exit().remove();

          const lineHistoBottomCross = svg.selectAll('.histogramBottomCross').data(chartOptions.chartData);
          // update existing
          lineHistoBottomCross.call(buildBottomCross);

          // add new ones
          lineHistoBottomCross
            .enter()
            .append('line')
            .call(buildBottomCross);

          // remove old ones
          lineHistoBottomCross.exit().remove();
        }
      }

      // update existing
      rectHistogram.call(buildBars);

      // add new ones
      rectHistogram.enter()
        .append('rect')
        .call(buildBars);

      // remove old ones
      rectHistogram.exit().remove();

      if (!chartOptions.hideHighLowValues) {
        createHistogramHighLowValues(chartOptions.svg, chartOptions.chartData, chartOptions.stacked);
      } else {
        // we should hide high-low values.. or remove if existing
        chartOptions.svg
          .selectAll('.histogramTopStem, .histogramBottomStem, .histogramTopCross, .histogramBottomCross').remove();
      }

    }
  }

}
