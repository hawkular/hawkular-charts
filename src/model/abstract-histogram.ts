import { ChartOptions } from './chart-options'
import { IChartType } from './chart-type'
import { NumericBucketPoint } from './types'
import { calcBarXPos, calcBarWidthAdjusted } from '../util/utility'

export abstract class AbstractHistogramChart implements IChartType {

  public name = 'histogram';

  public drawChart(chartOptions: ChartOptions, stacked = false) {

    const barClass = stacked ? 'leaderBar' : 'histogram';

    const rectHistogram = chartOptions.svg.selectAll('rect.' + barClass).data(chartOptions.chartData);

    function buildBars(selection: d3.Selection<any>) {
      selection
        .attr('class', barClass)
        .on('mouseover', (d: NumericBucketPoint, i) => {
          chartOptions.tip.show(d, i);
        }).on('mouseout', () => {
          chartOptions.tip.hide();
        })
        .transition()
        .attr('x', (d: NumericBucketPoint, i) => calcBarXPos(d, i, 100/*FIXME*/, chartOptions.timeScale, chartOptions.chartData.length))
        .attr('width', (d: NumericBucketPoint, i) => calcBarWidthAdjusted(i, 100/*FIXME*/, chartOptions.chartData.length))
        .attr('y', (d: NumericBucketPoint) => d.isEmpty() ? 0 : chartOptions.yScale(d.avg))
        .attr('height', (d: NumericBucketPoint) => chartOptions.modifiedInnerChartHeight - chartOptions.yScale(d.isEmpty() ?
            chartOptions.yScale(chartOptions.visuallyAdjustedMax) : d.avg))
        .attr('opacity', stacked ? '.6' : '1')
        .attr('fill', (d: NumericBucketPoint) => d.isEmpty() ? 'url(#noDataStripes)' : (stacked ? '#D3D3D6' : '#C0C0C0'))
        .attr('stroke', '#777')
        .attr('stroke-width', '0')
        .attr('data-hawkular-value', (d: NumericBucketPoint) => d.avg || 0);
    }

    function buildHighBar(selection: d3.Selection<any>) {
      selection
        .attr('class', (d: NumericBucketPoint) => d.min === d.max ? 'singleValue' : 'high')
        .attr('x', (d: NumericBucketPoint, i) => calcBarXPos(d, i, 100/*FIXME*/, chartOptions.timeScale, chartOptions.chartData.length))
        .attr('y', (d: NumericBucketPoint) => isNaN(d.max || NaN) ? chartOptions.yScale(chartOptions.visuallyAdjustedMax)
          : chartOptions.yScale(d.max))
        .attr('height', (d: NumericBucketPoint) => d.isEmpty() ? 0 : (chartOptions.yScale(d.avg) - chartOptions.yScale(d.max) || 2))
        .attr('width', (d: NumericBucketPoint, i) => calcBarWidthAdjusted(i, 100/*FIXME*/, chartOptions.chartData.length))
        .attr('opacity', 0.9)
        .on('mouseover', (d: NumericBucketPoint, i) => chartOptions.tip.show(d, i))
        .on('mouseout', () => chartOptions.tip.hide());
    }

    function buildLowerBar(selection: d3.Selection<any>) {
      selection
        .attr('class', 'low')
        .attr('x', (d: NumericBucketPoint, i) => calcBarXPos(d, i, 100/*FIXME*/, chartOptions.timeScale, chartOptions.chartData.length))
        .attr('y', (d: NumericBucketPoint) => isNaN(d.avg || NaN) ? chartOptions.height : chartOptions.yScale(d.avg))
        .attr('height', (d: NumericBucketPoint) => d.isEmpty() ? 0 : (chartOptions.yScale(d.min) - chartOptions.yScale(d.avg)))
        .attr('width', (d: NumericBucketPoint, i) => calcBarWidthAdjusted(i, 100/*FIXME*/, chartOptions.chartData.length))
        .attr('opacity', 0.9)
        .on('mouseover', (d: NumericBucketPoint, i) => chartOptions.tip.show(d, i))
        .on('mouseout', () => chartOptions.tip.hide());
    }

    function buildTopStem(selection: d3.Selection<any>) {
      selection
        .attr('class', 'histogramTopStem')
        .filter((d: NumericBucketPoint) => !d.isEmpty())
        .attr('x1', (d: NumericBucketPoint) => chartOptions.timeScale(d.timestampSupplier()))
        .attr('x2', (d: NumericBucketPoint) => chartOptions.timeScale(d.timestampSupplier()))
        .attr('y1', (d: NumericBucketPoint) => chartOptions.yScale(d.max))
        .attr('y2', (d: NumericBucketPoint) => chartOptions.yScale(d.avg))
        .attr('stroke', 'red')
        .attr('stroke-opacity', 0.6);
    }

    function buildLowStem(selection: d3.Selection<any>) {
      selection
        .filter((d: NumericBucketPoint) => !d.isEmpty())
        .attr('class', 'histogramBottomStem')
        .attr('x1', (d: NumericBucketPoint) => chartOptions.timeScale(d.timestampSupplier()))
        .attr('x2', (d: NumericBucketPoint) => chartOptions.timeScale(d.timestampSupplier()))
        .attr('y1', (d: NumericBucketPoint) => chartOptions.yScale(d.avg))
        .attr('y2', (d: NumericBucketPoint) => chartOptions.yScale(d.min))
        .attr('stroke', 'red')
        .attr('stroke-opacity', 0.6);
    }

    function buildTopCross(selection: d3.Selection<any>) {
      selection
        .filter((d: NumericBucketPoint) => !d.isEmpty())
        .attr('class', 'histogramTopCross')
        .attr('x1', (d: NumericBucketPoint) => chartOptions.timeScale(d.timestampSupplier()) - 3)
        .attr('x2', (d: NumericBucketPoint) => chartOptions.timeScale(d.timestampSupplier()) + 3)
        .attr('y1', (d: NumericBucketPoint) => chartOptions.yScale(d.max))
        .attr('y2', (d: NumericBucketPoint) => chartOptions.yScale(d.max))
        .attr('stroke', 'red')
        .attr('stroke-width', '0.5')
        .attr('stroke-opacity', 0.6);
    }

    function buildBottomCross(selection: d3.Selection<any>) {
      selection
        .filter((d: NumericBucketPoint) => !d.isEmpty())
        .attr('class', 'histogramBottomCross')
        .attr('x1', (d: NumericBucketPoint) => chartOptions.timeScale(d.timestampSupplier()) - 3)
        .attr('x2', (d: NumericBucketPoint) => chartOptions.timeScale(d.timestampSupplier()) + 3)
        .attr('y1', (d: NumericBucketPoint) => chartOptions.yScale(d.min))
        .attr('y2', (d: NumericBucketPoint) => chartOptions.yScale(d.min))
        .attr('stroke', 'red')
        .attr('stroke-width', '0.5')
        .attr('stroke-opacity', 0.6);
    }

    function createStackedHistogramHighLowValues(svg: any, chartData: NumericBucketPoint[]) {
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
    }

    function createUnstackedHistogramHighLowValues(svg: any, chartData: NumericBucketPoint[]) {
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

    // update existing
    rectHistogram.call(buildBars);

    // add new ones
    rectHistogram.enter()
      .append('rect')
      .call(buildBars);

    // remove old ones
    rectHistogram.exit().remove();

    if (!chartOptions.hideHighLowValues) {
      if (stacked) {
        createStackedHistogramHighLowValues(chartOptions.svg, <NumericBucketPoint[]>chartOptions.chartData);
      } else {
        createUnstackedHistogramHighLowValues(chartOptions.svg, <NumericBucketPoint[]>chartOptions.chartData);
      }
    } else {
      // we should hide high-low values.. or remove if existing
      chartOptions.svg
        .selectAll('.histogramTopStem, .histogramBottomStem, .histogramTopCross, .histogramBottomCross').remove();
    }

  }
}
