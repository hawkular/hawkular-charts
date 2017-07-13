import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { Http, RequestOptions, Headers, Response } from '@angular/http';

import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { IntervalObservable } from 'rxjs/observable/IntervalObservable';
import 'rxjs/add/operator/map';

import {
  INumericDataPoint, NumericDataPoint, NumericBucketPoint, IMultiDataPoint, IPredictiveMetric,
  TimeInMillis, MetricId, UrlType, TimeRange, FixedTimeRange, TimeRangeFromNow, isFixedTimeRange
} from '../model/types'
import { ChartOptions } from '../model/chart-options'
import { EventNames } from '../model/event-names'
import { IChartType } from '../model/chart-type'
import { LineChart } from '../model/line'
import { AreaChart } from '../model/area'
import { ScatterChart } from '../model/scatter'
import { ScatterLineChart } from '../model/scatterLine'
import { HistogramChart } from '../model/histogram'
import { RhqBarChart } from '../model/rhq-bar'
import { MultiLineChart } from '../model/multi-line'
import {
  determineXAxisTicksFromScreenWidth, determineYAxisTicksFromScreenHeight,
  xAxisTimeFormats, determineYAxisGridLineTicksFromScreenHeight
} from '../util/utility'
import { createAlertBoundsArea, createAlertLine } from '../util/alerts'
import { createDataPoints } from '../util/features'
import { showForecastData } from '../util/forecast'

declare let moment: any;
declare let d3: any;
declare let console: any;

const debug = false;

const DEFAULT_Y_SCALE = 10;
const X_AXIS_HEIGHT = 25; // with room for label
const HOVER_DATE_TIME_FORMAT = 'MM/DD/YYYY h:mm:ss a';
const MARGIN = { top: 0, right: 0, bottom: 0, left: 0 }; // left margin room for label

@Component({
  selector: 'hk-metric-chart',
  template: `<div #target class='hawkular-charts'></div>`
})
export class MetricChartComponent implements OnInit, OnDestroy, OnChanges {

  @ViewChild('target') target: any;
  // the scale to use for y-axis when all values are 0, [0, DEFAULT_Y_SCALE]
  @Input() metricUrl: UrlType;
  @Input() metricId = '';
  @Input() metricTenantId = '';
  @Input() metricType = 'gauge';
  @Input() refreshIntervalInSeconds = 5;
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
  @Input() rawData?: NumericDataPoint[];
  @Input() statsData?: NumericBucketPoint[];
  @Input() multiData: IMultiDataPoint[];
  @Input() forecastDataPoints: IPredictiveMetric[];
  @Input() showDataPoints = true;
  @Input() previousRangeData = [];
  @Input() annotationData = [];
  @Input() yAxisUnits: string;
  @Input() raw: false;
  @Input() buckets = 60;
  @Output() timeRangeChange = new EventEmitter();
  timeRangeValue: TimeRange = 43200;
  @Input()
  get timeRange(): TimeRange {
    return this.timeRangeValue;
  }
  set timeRange(val: TimeRange) {
    this.timeRangeValue = val;
    this.timeRangeChange.emit(this.timeRangeValue);
  }

  showAvgLine = true;
  hideHighLowValues = false;
  useZeroMinValue = false;

  width: number;
  height: number;
  modifiedInnerChartHeight: number;
  innerChartHeight: number;
  chartData: INumericDataPoint[];
  yScale: any;
  timeScale: any;
  yAxis: any;
  xAxis: any;
  tip: any;
  brush: any;
  brushGroup: any;
  chart: any;
  chartParent: any;
  svg: any;
  visuallyAdjustedMin: number;
  visuallyAdjustedMax: number;
  peak: number;
  min: number;
  refreshObservable?: Subscription;

  readonly registeredChartTypes: IChartType[] = [
    new LineChart(),
    new AreaChart(),
    new ScatterChart(),
    new ScatterLineChart(),
    new HistogramChart(),
    new RhqBarChart(),
    new MultiLineChart(),
  ];

  constructor(private http: Http) {
  }

  ngOnInit(): void {
    this.resetRefreshLoop();
  }

  ngOnDestroy(): void {
    if (this.refreshObservable) {
      this.refreshObservable.unsubscribe();
    }
  }

  resize(): void {
    // destroy any previous charts
    if (this.chart) {
      this.chartParent.selectAll('*').remove();
    }

    this.chartParent = d3.select(this.target.nativeElement);
    const parentNode = this.target.nativeElement.parentNode.parentNode;

    this.width = parentNode.clientWidth || 800;
    this.height = parentNode.clientHeight || 600;

    this.modifiedInnerChartHeight = this.height - MARGIN.top - MARGIN.bottom - X_AXIS_HEIGHT;

    this.innerChartHeight = this.height + MARGIN.top;

    this.chart = this.chartParent.append('svg')
      .attr('width', this.width + MARGIN.left + MARGIN.right)
      .attr('height', this.innerChartHeight);

    // createSvgDefs(chart);

    this.svg = this.chart.append('g')
      .attr('transform', 'translate(' + MARGIN.left + ',' + (MARGIN.top) + ')');

    if (this.tip) {
      this.tip.hide();
    }
    this.tip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html((d: INumericDataPoint, i: number) => this.buildHover(d, i));
    this.svg.call(this.tip);

    // a placeholder for the alerts
    this.svg.append('g').attr('class', 'alertHolder');
  }

  setupFilteredData(): void {
    const values = this.chartData.filter((d) => !d.isEmpty()).map((d) => d.valueSupplier());

    this.peak = d3.max(values) || 1;
    this.min = d3.min(values) || 0;

    // lets adjust the min and max to add some visual spacing between it and the axes
    this.visuallyAdjustedMin = this.useZeroMinValue ? 0 : this.min * .95;
    this.visuallyAdjustedMax = this.peak + ((this.peak - this.min) * 0.2);

    // check if we need to adjust high/low bound to fit alert value
    if (this.alertValue) {
      this.visuallyAdjustedMax = Math.max(this.visuallyAdjustedMax, this.alertValue * 1.2);
      this.visuallyAdjustedMin = Math.min(this.visuallyAdjustedMin, this.alertValue * .95);
    }

    // use default Y scale in case high and low bound are 0 (ie, no values or all 0)
    this.visuallyAdjustedMax = !!!this.visuallyAdjustedMax && !!!this.visuallyAdjustedMin ? DEFAULT_Y_SCALE :
      this.visuallyAdjustedMax;
  }

  getYScale(): any {
    return d3.scale.linear()
      .clamp(true)
      .rangeRound([this.modifiedInnerChartHeight, 0])
      .domain([this.visuallyAdjustedMin, this.visuallyAdjustedMax]);
  }

  determineScale() {
    const xTicks = determineXAxisTicksFromScreenWidth(this.width - MARGIN.left - MARGIN.right),
      yTicks = determineYAxisTicksFromScreenHeight(this.modifiedInnerChartHeight);

    this.setupFilteredData();
    this.yScale = this.getYScale();

    this.yAxis = d3.svg.axis()
      .scale(this.yScale)
      .ticks(yTicks)
      .tickSize(4, 4, 0)
      .orient('left');

    const timeRange = this.getFixedTimeRange();

    let timeScaleMax;
    if (this.forecastDataPoints && this.forecastDataPoints.length > 0) {
      timeScaleMax = this.forecastDataPoints[this.forecastDataPoints.length - 1].timestamp;
    } else {
      timeScaleMax = timeRange.end || Date.now();
    }

    this.timeScale = d3.time.scale()
      .range([0, this.width - MARGIN.left - MARGIN.right])
      .nice()
      .domain([timeRange.start, timeScaleMax]);

    this.xAxis = d3.svg.axis()
      .scale(this.timeScale)
      .ticks(xTicks)
      .tickFormat(xAxisTimeFormats())
      .tickSize(4, 4, 0)
      .orient('bottom');

  }

  setupFilteredMultiData(multiDataPoints: IMultiDataPoint[]): any {
    let alertPeak: number,
      highPeak: number;

    function determineMultiDataMinMax() {
      let currentMax: number,
        currentMin: number,
        seriesMax: number,
        seriesMin: number;

      const maxList: number[] = [],
        minList: number[] = [];

      multiDataPoints.forEach((series) => {
        currentMax = d3.max(series.values.map((d) => d.isEmpty() ? 0 : d.valueSupplier()));
        maxList.push(currentMax);
        currentMin = d3.min(series.values.map((d) => d.isEmpty() ? Number.MAX_VALUE : d.valueSupplier()));
        minList.push(currentMin);

      });
      seriesMax = d3.max(maxList);
      seriesMin = d3.min(minList);
      return [seriesMin, seriesMax];
    }

    const minMax = determineMultiDataMinMax();
    this.peak = minMax[1];
    this.min = minMax[0];

    this.visuallyAdjustedMin = this.useZeroMinValue ? 0 : this.min - (this.min * 0.05);
    if (this.alertValue) {
      alertPeak = (this.alertValue * 1.2);
      highPeak = this.peak + ((this.peak - this.min) * 0.2);
      this.visuallyAdjustedMax = alertPeak > highPeak ? alertPeak : highPeak;
    } else {
      this.visuallyAdjustedMax = this.peak + ((this.peak - this.min) * 0.2);
    }

    return [this.visuallyAdjustedMin, !!!this.visuallyAdjustedMax && !!!this.visuallyAdjustedMin ? DEFAULT_Y_SCALE :
      this.visuallyAdjustedMax];
  }

  determineMultiScale(multiDataPoints: IMultiDataPoint[]) {
    const xTicks = determineXAxisTicksFromScreenWidth(this.width - MARGIN.left - MARGIN.right),
      yTicks = determineXAxisTicksFromScreenWidth(this.modifiedInnerChartHeight);

    if (multiDataPoints && multiDataPoints[0] && multiDataPoints[0].values) {

      const lowHigh = this.setupFilteredMultiData(multiDataPoints);
      this.visuallyAdjustedMin = lowHigh[0];
      this.visuallyAdjustedMax = lowHigh[1];

      this.yScale = d3.scale.linear()
        .clamp(true)
        .rangeRound([this.modifiedInnerChartHeight, 0])
        .domain([this.visuallyAdjustedMin, this.visuallyAdjustedMax]);

      this.yAxis = d3.svg.axis()
        .scale(this.yScale)
        .ticks(yTicks)
        .tickSize(4, 4, 0)
        .orient('left');

      this.timeScale = d3.time.scale()
        .range([0, this.width - MARGIN.left - MARGIN.right])
        .domain([d3.min(multiDataPoints, (d: IMultiDataPoint) => d3.min(d.values, (p: INumericDataPoint) => p.timestampSupplier())),
        d3.max(multiDataPoints, (d: IMultiDataPoint) => d3.max(d.values, (p: INumericDataPoint) => p.timestampSupplier()))]);

      this.xAxis = d3.svg.axis()
        .scale(this.timeScale)
        .ticks(xTicks)
        .tickFormat(xAxisTimeFormats())
        .tickSize(4, 4, 0)
        .orient('bottom');

    }
  }

  isServerConfigured(): boolean {
    return this.metricUrl !== undefined
      && this.metricType !== undefined
      && this.metricId !== undefined
      && this.metricTenantId !== undefined;
  }

  getFixedTimeRange(): FixedTimeRange {
    if (isFixedTimeRange(this.timeRangeValue)) {
      return <FixedTimeRange>this.timeRangeValue;
    } else {
      return {
        start: Date.now() - 1000 * <TimeRangeFromNow>this.timeRangeValue
      }
    }
  }

  /**
   * Load metrics data directly from a running Hawkular-Metrics server
   * This function assumes the server is configured
   */
  loadStandAloneMetrics() {
    const timeRange = this.getFixedTimeRange();
    const params: any = {
      start: timeRange.start,
      end: timeRange.end,
      order: 'ASC'
    };

    let endpoint: string;
    if (this.raw) {
      endpoint = '/raw';
    } else {
      endpoint = '/stats';
      params.buckets = this.buckets;
    }
    const options = new RequestOptions({
      headers: new Headers({ 'Hawkular-Tenant': this.metricTenantId }),
      params: params
    });

    // sample url:
    // http://localhost:8080/hawkular/metrics/gauges/45b2256eff19cb982542b167b3957036.status.duration/stats?
    // buckets=120&end=1436831797533&start=1436828197533'
    this.http.get(this.metricUrl + '/' + this.metricType + 's/' + this.metricId + endpoint, options)
      .map((response) => response.json() || [])
      .subscribe((json) => {
        if (this.raw) {
          this.statsData = undefined;
          this.rawData = json.map((datapoint: any) => new NumericDataPoint(datapoint));
        } else {
          this.statsData = json.map((datapoint: any) => new NumericBucketPoint(datapoint));
          this.rawData = undefined;
        }
        this.render();
      }, (err) => {
        console.error('Error Loading Chart Data:' + status + ', ' + err);
      });
  }

  buildHover(dataPoint: INumericDataPoint, i: number) {
    const currentTimestamp = dataPoint.timestampSupplier();
    let hover,
      prevTimestamp,
      barDuration;

    const formattedDateTime = moment(currentTimestamp).format(HOVER_DATE_TIME_FORMAT);

    if (i > 0) {
      prevTimestamp = this.chartData[i - 1].timestampSupplier();
      barDuration = moment(currentTimestamp).from(moment(prevTimestamp), true);
    }

    if (dataPoint.isEmpty()) {
      // nodata
      hover = `<div class='chartHover'>
        <small class='chartHoverLabel'>${this.noDataLabel}</small>
        <div><small><span class='chartHoverLabel'>${this.durationLabel}</span><span>:
        </span><span class='chartHoverValue'>${barDuration}</span></small> </div>
        <hr/>
        <div><small><span class='chartHoverLabel'>${this.timestampLabel}</span><span>:
        </span><span class='chartHoverValue'>${formattedDateTime}</span></small></div>
        </div>`;
    } else {
      if (dataPoint.isRaw()) {
        // raw single value from raw table
        hover = `<div class='chartHover'>
        <div><small><span class='chartHoverLabel'>${this.timestampLabel}</span><span>: </span>
        <span class='chartHoverValue'>${formattedDateTime}</span></small></div>
        <hr/>
        <div><small><span class='chartHoverLabel'>${this.singleValueLabel}</span><span>: </span>
        <span class='chartHoverValue'>${d3.round(dataPoint.valueSupplier(), 2)}</span></small> </div>
        </div> `;
      } else {
        // aggregate with min/avg/max
        const bucketDP: NumericBucketPoint = <NumericBucketPoint>dataPoint;
        hover = `<div class='chartHover'>
            <div class='info-item'>
              <span class='chartHoverLabel'>${this.timestampLabel}:</span>
              <span class='chartHoverValue'>${formattedDateTime}</span>
            </div>
            <div class='info-item before-separator'>
              <span class='chartHoverLabel'>${this.durationLabel}:</span>
              <span class='chartHoverValue'>${barDuration}</span>
            </div>
            <div class='info-item separator'>
              <span class='chartHoverLabel'>${this.maxLabel}:</span>
              <span class='chartHoverValue'>${d3.round(bucketDP.max, 2)}</span>
            </div>
            <div class='info-item'>
              <span class='chartHoverLabel'>${this.avgLabel}:</span>
              <span class='chartHoverValue'>${d3.round(bucketDP.avg, 2)}</span>
            </div>
            <div class='info-item'>
              <span class='chartHoverLabel'>${this.minLabel}:</span>
              <span class='chartHoverValue'>${d3.round(bucketDP.min, 2)}</span>
            </div>
          </div> `;
      }
    }
    return hover;
  }

  createYAxisGridLines() {
    // create the y axis grid lines
    const numberOfYAxisGridLines = determineYAxisGridLineTicksFromScreenHeight(this.modifiedInnerChartHeight);

    this.yScale = this.getYScale();

    if (this.yScale) {
      let yAxis = this.svg.selectAll('g.grid.y_grid');
      if (!yAxis[0].length) {
        yAxis = this.svg.append('g').classed('grid y_grid', true);
      }
      yAxis
        .call(d3.svg.axis()
          .scale(this.yScale)
          .orient('left')
          .ticks(numberOfYAxisGridLines)
          .tickSize(-this.width, 0)
          .tickFormat('')
        );
    }
  }

  createXandYAxes() {
    function axisTransition(selection: any) {
      selection
        .transition()
        .delay(250)
        .duration(750)
        .attr('opacity', 1.0);
    }

    if (this.yAxis) {

      this.svg.selectAll('g.axis').remove();

      /* tslint:disable:no-unused-variable */

      // create x-axis
      const xAxisGroup = this.svg.append('g')
        .attr('class', 'x axis')
        .attr('transform', 'translate(0,' + this.modifiedInnerChartHeight + ')')
        .attr('opacity', 0.3)
        .call(this.xAxis)
        .call(axisTransition);

      // create y-axis
      const yAxisGroup = this.svg.append('g')
        .attr('class', 'y axis')
        .attr('opacity', 0.3)
        .call(this.yAxis)
        .call(axisTransition);

      if (this.modifiedInnerChartHeight >= 150 && this.yAxisUnits) {
        this.svg.append('text').attr('class', 'yAxisUnitsLabel')
          .attr('transform', 'rotate(-90),translate(-20,-50)')
          .attr('x', -this.modifiedInnerChartHeight / 2)
          .style('text-anchor', 'center')
          .text(this.yAxisUnits === 'NONE' ? '' : this.yAxisUnits)
          .attr('opacity', 0.3)
          .call(axisTransition);
      }
    }
  }

  createCenteredLine(interpolate: string) {
    return d3.svg.line()
      .interpolate(interpolate)
      .defined((d: INumericDataPoint) => !d.isEmpty())
      .x((d: INumericDataPoint) => this.timeScale(d.timestampSupplier()))
      .y((d: INumericDataPoint) => this.yScale(d.valueSupplier()));
  }

  createAvgLines() {
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

  createXAxisBrush() {
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
        this.forecastDataPoints = [];

        const chartOptions: ChartOptions = new ChartOptions(this.svg, this.timeScale, this.yScale, this.chartData, this.multiData,
          this.modifiedInnerChartHeight, this.height, this.tip, this.visuallyAdjustedMax,
          this.hideHighLowValues, this.interpolation);

        // If timerange is "xx from now" and the end bound hasn't changed, then continue in "xx from now" mode and ignore end time.
        const previousEnd = this.timeScale.domain()[1].getTime();
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
      .x(this.timeScale)
      .on('brushstart', brushStart)
      .on('brushend', brushEnd);

    this.brushGroup.call(this.brush);
    this.brushGroup.selectAll('.resize')
      .append('path');
    this.brushGroup.selectAll('rect')
      .attr('height', this.modifiedInnerChartHeight);
  }

  createPreviousRangeOverlay(prevRangeData: INumericDataPoint[]) {
    if (prevRangeData) {
      this.svg.append('path')
        .datum(prevRangeData)
        .attr('class', 'prevRangeAvgLine')
        .style('stroke-dasharray', ('9,3'))
        .attr('d', this.createCenteredLine('linear'));
    }

  }

  annotateChart() {
    d3.scale.linear()
      .clamp(true)
      .rangeRound([this.modifiedInnerChartHeight, 0])
      .domain([this.visuallyAdjustedMin, this.visuallyAdjustedMax]);

    if (this.annotationData) {
      this.svg.selectAll('.annotationDot')
        .data(this.annotationData)
        .enter().append('circle')
        .attr('class', 'annotationDot')
        .attr('r', 5)
        .attr('cx', (d: any/*FIXME: typing?*/) => {
          return this.timeScale(d.timestamp);
        })
        .attr('cy', () => {
          return this.height - this.yScale(this.visuallyAdjustedMax);
        })
        .style('fill', (d: any/*FIXME: typing?*/) => {
          if (d.severity === '1') {
            return 'red';
          } else if (d.severity === '2') {
            return 'yellow';
          } else {
            return 'white';
          }
        });
    }
  }

  render() {
    // if we don't have data, don't bother..
    if (!this.rawData && !this.statsData && !this.multiData) {
      return;
    }

    if (debug) {
      console.group('Render Chart');
      console.time('chartRender');
    }
    // NOTE: layering order is important!
    this.resize();

    if (this.rawData) {
      this.chartData = this.rawData;
      this.determineScale();
    } else if (this.statsData) {
      this.chartData = this.statsData;
      this.determineScale();
    } else {
      // multiDataPoints exist
      this.determineMultiScale(this.multiData);
    }

    const chartOptions: ChartOptions = new ChartOptions(this.svg, this.timeScale, this.yScale, this.chartData, this.multiData,
      this.modifiedInnerChartHeight, this.height, this.tip, this.visuallyAdjustedMax,
      this.hideHighLowValues, this.interpolation);

    if (this.alertValue && (this.alertValue > this.visuallyAdjustedMin && this.alertValue < this.visuallyAdjustedMax)) {
      createAlertBoundsArea(chartOptions, this.alertValue, this.visuallyAdjustedMax);
    }

    this.createXAxisBrush();
    this.createYAxisGridLines();
    this.determineChartTypeAndDraw(this.chartType, chartOptions);

    if (this.showDataPoints) {
      createDataPoints(this.svg, this.timeScale, this.yScale, this.tip, this.chartData);
    }
    this.createPreviousRangeOverlay(this.previousRangeData);
    this.createXandYAxes();
    if (this.showAvgLine) {
      this.createAvgLines();
    }

    if (this.alertValue && (this.alertValue > this.visuallyAdjustedMin && this.alertValue < this.visuallyAdjustedMax)) {
      // NOTE: this alert line has higher precedence from alert area above
      createAlertLine(chartOptions, this.alertValue, 'alertLine');
    }

    if (this.annotationData) {
      this.annotateChart();
    }
    if (this.forecastDataPoints && this.forecastDataPoints.length > 0) {
      showForecastData(this.forecastDataPoints, chartOptions);
    }
    if (debug) {
      console.timeEnd('chartRender');
      console.groupEnd('Render Chart');
    }
  }

  determineChartTypeAndDraw(chartType: string, chartOptions: ChartOptions) {
    // @todo: add in multiline and rhqbar chart types
    // @todo: add validation if not in valid chart types
    this.registeredChartTypes.forEach((aChartType) => {
      if (aChartType.name === chartType) {
        aChartType.drawChart(chartOptions);
      }
    });
  }

  resetRefreshLoop(): void {
    if (this.refreshObservable) {
      this.refreshObservable.unsubscribe();
      this.refreshObservable = undefined;
    }
    let needRefresh = false;
    isFixedTimeRange(this.timeRangeValue,
      (fixed) => needRefresh = (fixed.end == undefined),
      (fromNow) => needRefresh = true);

    if (this.refreshIntervalInSeconds && this.refreshIntervalInSeconds > 0 && needRefresh && this.isServerConfigured()) {
      this.refreshObservable = IntervalObservable.create(this.refreshIntervalInSeconds * 1000)
        .subscribe(() => this.loadStandAloneMetrics());
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.refresh();
  }

  refresh(): void {
    this.resetRefreshLoop();
    if (this.isServerConfigured()) {
      this.loadStandAloneMetrics();
    } else {
      this.render();
    }
  }

  setTimeRange(startTime: TimeInMillis, endTime?: TimeInMillis) {
    const filter = (d: INumericDataPoint) => {
      const timestamp = d.timestampSupplier();
      return timestamp >= startTime && (endTime === undefined || timestamp <= endTime);
    };
    // We will set this.end only if it's not "now". Else, we don't set it so that it will keep refreshing with latest values
    if (this.rawData) {
      this.rawData = this.rawData.filter(filter);
    } else if (this.statsData) {
      this.statsData = this.statsData.filter(filter);
    } else {
      // multiDataPoints
      this.multiData.forEach(series => {
        series.values = series.values.filter(filter);
      });
    }
    this.timeRange = {
      start: startTime,
      end: endTime
    }
    this.refresh();
  }
}
