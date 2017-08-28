import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';

import {
  INumericDataPoint, NumericDataPoint, NumericBucketPoint, INamedMetric, TimeInMillis, TimeRange, isFixedTimeRange,
  getFixedTimeRange
} from '../model/types'
import { ChartLayout } from '../model/chart-layout'
import { ChartOptions } from '../model/chart-options'
import { ComputedChartAxis } from '../model/computed-chart-axis'
import { IChartType } from '../model/chart-type'
import { LineChart } from '../model/line'
import { AreaChart } from '../model/area'
import { ScatterChart } from '../model/scatter'
import { ScatterLineChart } from '../model/scatterLine'
import { HistogramChart } from '../model/histogram'
import { RhqBarChart } from '../model/rhq-bar'
import { MultiLineChart } from '../model/multi-line'
import { determineScale } from '../util/singleline-scaler'
import { determineMultiScale } from '../util/multilines-scaler'
import {
  determineXAxisTicksFromScreenWidth, determineYAxisTicksFromScreenHeight, determineYAxisGridLineTicksFromScreenHeight
} from '../util/utility'
import { createAlertBoundsArea, createAlertLine } from '../util/alerts'
import { createDataPoints } from '../util/features'
import { initTip } from '../util/metric-tip'

declare const d3: any;

const X_AXIS_HEIGHT = 25; // with room for label
const MARGIN = { top: 10, right: 0, bottom: 10, left: 35 };

export abstract class BaseMetricChartComponent {

  @ViewChild('target') target: any;

  @Input() alertValue: number;
  @Input() interpolation = 'monotone';
  @Input() chartType = 'line';
  @Input() singleValueLabel = 'Raw Value';
  @Input() noDataLabel = 'No Data';
  @Input() durationLabel = 'Interval';
  @Input() minLabel = 'Min';
  @Input() maxLabel = 'Max';
  @Input() avgLabel = 'Avg';
  @Input() timestampLabel = 'Timestamp';
  @Input() yAxisTickFormat: string;
  @Input() showDataPoints = true;
  @Input() yAxisUnits: string;
  @Input() hideHighLowValues = false;
  @Output() timeRangeChange = new EventEmitter();
  private _timeRange: TimeRange = 43200;
  @Input()
  get timeRange(): TimeRange {
    return this._timeRange;
  }
  set timeRange(val: TimeRange) {
    this._timeRange = val;
    this.timeRangeChange.emit(this._timeRange);
  }

  // Move as input?
  showAvgLine = true;
  useZeroMinValue = false;

  chartLayout: ChartLayout;
  chartData: INumericDataPoint[];
  computedChartAxis: ComputedChartAxis;
  tip: any;
  brush: any;
  brushGroup: any;
  chart: any; // d3.Selection<any>
  chartParent: any; // d3.Selection<any>
  svg: any; // d3.Selection<any>

  readonly registeredChartTypes: { [name: string]: IChartType } = {};

  constructor() {
    [
      new LineChart(),
      new AreaChart(),
      new ScatterChart(),
      new ScatterLineChart(),
      new HistogramChart(),
      new RhqBarChart(),
      new MultiLineChart(),
    ].forEach(chart => {
      this.registeredChartTypes[chart.name] = chart;
    });
  }

  private resize(): void {
    // destroy any previous charts
    if (this.chart) {
      this.chartParent.selectAll('*').remove();
    }

    this.chartParent = d3.select(this.target.nativeElement);
    const parentNode = this.target.nativeElement.parentNode.parentNode;

    const width = parentNode.clientWidth || 800;
    const height = parentNode.clientHeight || 600;
    this.chartLayout = {
      width: width,
      height: height,
      modifiedInnerChartHeight: height - MARGIN.top - MARGIN.bottom - X_AXIS_HEIGHT,
      innerChartHeight: height + MARGIN.top,
      innerChartWidth: width - MARGIN.left - MARGIN.right
    }

    this.chart = this.chartParent.append('svg')
      .attr('width', width)
      .attr('height', this.chartLayout.innerChartHeight);

    this.svg = this.chart.append('g')
      .attr('transform', 'translate(' + MARGIN.left + ',' + (MARGIN.top) + ')');

    if (this.tip) {
      this.tip.hide();
    }
    this.tip = initTip(this.svg,
          this.noDataLabel,
          this.durationLabel,
          this.timestampLabel,
          this.singleValueLabel,
          this.minLabel,
          this.maxLabel,
          this.avgLabel);

    // a placeholder for the alerts
    this.svg.append('g').attr('class', 'alertHolder');
  }

  private createYAxisGridLines() {
    // create the y axis grid lines
    const numberOfYAxisGridLines = determineYAxisGridLineTicksFromScreenHeight(this.chartLayout.modifiedInnerChartHeight);
    let yAxis = this.svg.selectAll('g.grid.y_grid');
    if (!yAxis[0].length) {
      yAxis = this.svg.append('g').classed('grid y_grid', true);
    }
    yAxis
      .call(d3.svg.axis()
        .scale(this.computedChartAxis.yScale)
        .orient('left')
        .ticks(numberOfYAxisGridLines)
        .tickSize(-this.chartLayout.width, 0)
        .tickFormat('')
      );
  }

  private createXandYAxes() {
    function axisTransition(selection: any) {
      selection
        .transition()
        .delay(250)
        .duration(750)
        .attr('opacity', 1.0);
    }

    this.svg.selectAll('g.axis').remove();

    /* tslint:disable:no-unused-variable */

    // create x-axis
    const xAxisGroup = this.svg.append('g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(0,' + this.chartLayout.modifiedInnerChartHeight + ')')
      .attr('opacity', 0.3)
      .call(this.computedChartAxis.xAxis)
      .call(axisTransition);

    // create y-axis
    const yAxisGroup = this.svg.append('g')
      .attr('class', 'y axis')
      .attr('opacity', 0.3)
      .call(this.computedChartAxis.yAxis)
      .call(axisTransition);

    if (this.chartLayout.modifiedInnerChartHeight >= 150 && this.yAxisUnits) {
      this.svg.append('text').attr('class', 'yAxisUnitsLabel')
        .attr('transform', 'rotate(-90),translate(-20,-50)')
        .attr('x', -this.chartLayout.modifiedInnerChartHeight / 2)
        .style('text-anchor', 'center')
        .text(this.yAxisUnits === 'NONE' ? '' : this.yAxisUnits)
        .attr('opacity', 0.3)
        .call(axisTransition);
    }
  }

  createCenteredLine(interpolate: string) {
    return d3.svg.line()
      .interpolate(interpolate)
      .defined((d: INumericDataPoint) => !d.isEmpty())
      .x((d: INumericDataPoint) => this.computedChartAxis.timeScale(d.timestampSupplier()))
      .y((d: INumericDataPoint) => this.computedChartAxis.yScale(d.valueSupplier()!));
  }

  private createAvgLines() {
    if (this.chartType === 'bar' || this.chartType === 'scatterline') {
      const pathAvgLine = this.svg.selectAll('.barAvgLine').data([this.chartData]);
      // update existing
      pathAvgLine.attr('class', 'barAvgLine')
        .attr('d', this.createCenteredLine('monotone'));
      // add new ones
      pathAvgLine.enter().append('path')
        .attr('class', 'barAvgLine')
        .attr('d', this.createCenteredLine('monotone'));
      // remove old ones
      pathAvgLine.exit().remove();
    }
  }

  abstract setTimeRange(startTime: TimeInMillis, endTime?: TimeInMillis): void;

  private createXAxisBrush() {
    this.brushGroup = this.svg.selectAll('g.brush');
    if (this.brushGroup.empty()) {
      this.brushGroup = this.svg.append('g').attr('class', 'brush');
    }

    const brushStart = () => this.svg.classed('selecting', true);
    const brushEnd = () => {
      const extent = this.brush.extent(),
        startTime = Math.round(extent[0].getTime()),
        endTime = Math.round(extent[1].getTime()),
        dragSelectionDelta = endTime - startTime;

      this.svg.classed('selecting', !d3.event.target.empty());
      // ignore range selections less than 1 minute
      if (dragSelectionDelta >= 60000) {
        // If timerange is "xx from now" and the end bound hasn't changed, then continue in "xx from now" mode and ignore end time.
        const previousEnd = this.computedChartAxis.timeScale.domain()[1].getTime();
        if (!isFixedTimeRange(this.timeRange) && Math.abs(previousEnd - endTime) < 60000) {
          this.setTimeRange(startTime);
        } else {
          this.setTimeRange(startTime, endTime);
        }
      }
      // clear the brush selection
      this.brushGroup.call(this.brush.clear());
    }

    this.brush = d3.svg.brush()
      .x(this.computedChartAxis.timeScale)
      .on('brushstart', brushStart)
      .on('brushend', brushEnd);

    this.brushGroup.call(this.brush);
    this.brushGroup.selectAll('.resize')
      .append('path');
    this.brushGroup.selectAll('rect')
      .attr('height', this.chartLayout.modifiedInnerChartHeight);
  }

  private preRender() {
    this.resize();
    const xTicks = determineXAxisTicksFromScreenWidth(this.chartLayout.innerChartWidth),
      yTicks = determineYAxisTicksFromScreenHeight(this.chartLayout.modifiedInnerChartHeight);
    return [xTicks, yTicks];
  }

  private postRender(chartOptions: ChartOptions) {
    const hasAlertInRange = this.alertValue && this.computedChartAxis.chartRange.contains(this.alertValue);
    if (hasAlertInRange) {
      createAlertBoundsArea(chartOptions, this.alertValue, this.computedChartAxis.chartRange.high);
    }

    this.createXAxisBrush();
    this.createYAxisGridLines();
    this.determineChartTypeAndDraw(this.chartType, chartOptions);

    if (this.showDataPoints) {
      createDataPoints(chartOptions);
    }
    this.createXandYAxes();
    if (this.showAvgLine) {
      this.createAvgLines();
    }

    if (hasAlertInRange) {
      // NOTE: this alert line has higher precedence from alert area above
      createAlertLine(chartOptions, this.alertValue, 'alertLine');
    }
  }

  renderRaw(rawData: NumericDataPoint[], forceEndTime?: TimeInMillis): ChartOptions {
    const ticks = this.preRender();

    this.chartData = rawData;
    const timeRange = getFixedTimeRange(this._timeRange);
    this.computedChartAxis = determineScale(this.chartData, timeRange, ticks[0], ticks[1], this.useZeroMinValue,
        this.yAxisTickFormat, this.chartLayout, forceEndTime, this.alertValue);

    const chartOptions: ChartOptions = new ChartOptions(this.svg, this.chartLayout, this.computedChartAxis, this.chartData,
      undefined, this.tip, this.hideHighLowValues, this.interpolation);

    this.postRender(chartOptions);
    return chartOptions;
  }

  renderStats(statsData: NumericBucketPoint[], forceEndTime?: TimeInMillis): ChartOptions {
    const ticks = this.preRender();

    this.chartData = statsData;
    const timeRange = getFixedTimeRange(this._timeRange);
    this.computedChartAxis = determineScale(this.chartData, timeRange, ticks[0], ticks[1], this.useZeroMinValue,
        this.yAxisTickFormat, this.chartLayout, forceEndTime, this.alertValue);

    const chartOptions: ChartOptions = new ChartOptions(this.svg, this.chartLayout, this.computedChartAxis, this.chartData,
      undefined, this.tip, this.hideHighLowValues, this.interpolation);

    this.postRender(chartOptions);
    return chartOptions;
  }

  renderMulti(multiData: INamedMetric[]): ChartOptions {
    const ticks = this.preRender();

    this.computedChartAxis = determineMultiScale(multiData, ticks[0], ticks[1], this.useZeroMinValue,
        this.yAxisTickFormat, this.chartLayout);

    const chartOptions: ChartOptions = new ChartOptions(this.svg, this.chartLayout, this.computedChartAxis, undefined,
      multiData, this.tip, this.hideHighLowValues, this.interpolation);

    this.postRender(chartOptions);
    return chartOptions;
  }

  private determineChartTypeAndDraw(chartType: string, chartOptions: ChartOptions) {
    if (chartType === 'line' && !chartOptions.data && chartOptions.multiData) {
      chartType = 'multiline';
    }
    if (this.registeredChartTypes.hasOwnProperty(chartType)) {
      this.registeredChartTypes[chartType].drawChart(chartOptions);
    } else {
      throw new Error(`Unknown chart type '${chartType}'`);
    }
  }
}
