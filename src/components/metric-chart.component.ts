import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { Http, RequestOptions, Headers, Response } from '@angular/http';

import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { IntervalObservable } from 'rxjs/observable/IntervalObservable';
import 'rxjs/add/operator/map';

import {
  INumericDataPoint, NumericDataPoint, NumericBucketPoint, IMultiDataPoint, IPredictiveMetric,
  TimeInMillis, MetricId, UrlType, TimeRange, FixedTimeRange, TimeRangeFromNow, isFixedTimeRange,
  Range, Ranges, IAnnotation
} from '../model/types'
import { ChartLayout } from '../model/chart-layout'
import { ChartOptions } from '../model/chart-options'
import { ComputedChartAxis } from '../model/computed-chart-axis'
import { EventNames } from '../model/event-names'
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
import { annotateChart } from '../util/annotations'
import {
  determineXAxisTicksFromScreenWidth, determineYAxisTicksFromScreenHeight,
  xAxisTimeFormats, determineYAxisGridLineTicksFromScreenHeight
} from '../util/utility'
import { createAlertBoundsArea, createAlertLine } from '../util/alerts'
import { createDataPoints } from '../util/features'
import { showForecastData } from '../util/forecast'
import { initTip } from '../util/metric-tip'

declare const d3: any;
declare const console: any;

const debug = false;

const X_AXIS_HEIGHT = 25; // with room for label
const MARGIN = { top: 20, right: 0, bottom: 20, left: 35 };

@Component({
  selector: 'hk-metric-chart',
  template: `<div #target class='hawkular-charts'></div>`
})
export class MetricChartComponent implements OnInit, OnDestroy, OnChanges {

  @ViewChild('target') target: any;

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
  @Input() yAxisTickFormat: string;
  @Input() rawData?: NumericDataPoint[];
  @Input() statsData?: NumericBucketPoint[];
  @Input() multiData: IMultiDataPoint[];
  @Input() forecastData: IPredictiveMetric[];
  @Input() showDataPoints = true;
  @Input() previousRangeData = [];
  @Input() annotationData: IAnnotation[] = [];
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

  chartLayout: ChartLayout;
  chartData: INumericDataPoint[];
  computedChartAxis: ComputedChartAxis;
  tip: any;
  brush: any;
  brushGroup: any;
  chart: any; // d3.Selection<any>
  chartParent: any; // d3.Selection<any>
  svg: any; // d3.Selection<any>
  ranges: Ranges;
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
          this.avgLabel,
          idx => {
            if (idx > 0) {
              return this.chartData[idx - 1].timestampSupplier();
            }
          });

    // a placeholder for the alerts
    this.svg.append('g').attr('class', 'alertHolder');
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
      endpoint = 'raw';
    } else {
      endpoint = 'stats';
      params.buckets = this.buckets;
    }
    const options = new RequestOptions({
      headers: new Headers({ 'Hawkular-Tenant': this.metricTenantId }),
      params: params
    });

    // sample url:
    // http://localhost:8080/hawkular/metrics/gauges/45b2256eff19cb982542b167b3957036.status.duration/stats?
    // buckets=120&end=1436831797533&start=1436828197533'
    this.http.get(`${this.metricUrl}/${this.metricType}s/${encodeURIComponent(this.metricId)}/${endpoint}`, options)
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

  createYAxisGridLines() {
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

  createXandYAxes() {
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
        this.forecastData = [];

        const chartOptions: ChartOptions = new ChartOptions(this.svg, this.chartLayout, this.computedChartAxis, this.chartData,
          this.multiData, this.tip, this.hideHighLowValues, this.interpolation);

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

  createPreviousRangeOverlay(prevRangeData: INumericDataPoint[]) {
    if (prevRangeData) {
      this.svg.append('path')
        .datum(prevRangeData)
        .attr('class', 'prevRangeAvgLine')
        .style('stroke-dasharray', ('9,3'))
        .attr('d', this.createCenteredLine('linear'));
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

    const xTicks = determineXAxisTicksFromScreenWidth(this.chartLayout.innerChartWidth),
      yTicks = determineYAxisTicksFromScreenHeight(this.chartLayout.modifiedInnerChartHeight);

    if (this.rawData || this.statsData) {
      this.chartData = this.rawData || this.statsData!;
      const timeRange = this.getFixedTimeRange();
      this.computedChartAxis = determineScale(this.chartData, timeRange, xTicks, yTicks, this.useZeroMinValue,
          this.yAxisTickFormat, this.chartLayout, this.forecastData, this.alertValue);
    } else {
      // multiDataPoints exist
      this.computedChartAxis = determineMultiScale(this.multiData, xTicks, yTicks, this.useZeroMinValue,
          this.yAxisTickFormat, this.chartLayout);
    }

    const chartOptions: ChartOptions = new ChartOptions(this.svg, this.chartLayout, this.computedChartAxis, this.chartData,
      this.multiData, this.tip, this.hideHighLowValues, this.interpolation);

    const hasAlertInRange = this.alertValue && this.computedChartAxis.chartRange.contains(this.alertValue);
    if (hasAlertInRange) {
      createAlertBoundsArea(chartOptions, this.alertValue, this.computedChartAxis.chartRange.high);
    }

    this.createXAxisBrush();
    this.createYAxisGridLines();
    this.determineChartTypeAndDraw(this.chartType, chartOptions);

    if (this.showDataPoints) {
      createDataPoints(this.svg, this.computedChartAxis.timeScale, this.computedChartAxis.yScale, this.tip, this.chartData);
    }
    this.createPreviousRangeOverlay(this.previousRangeData);
    this.createXandYAxes();
    if (this.showAvgLine) {
      this.createAvgLines();
    }

    if (hasAlertInRange) {
      // NOTE: this alert line has higher precedence from alert area above
      createAlertLine(chartOptions, this.alertValue, 'alertLine');
    }

    if (this.annotationData) {
      annotateChart(this.annotationData, chartOptions);
    }
    if (this.forecastData && this.forecastData.length > 0) {
      showForecastData(this.forecastData, chartOptions);
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
    let needRefresh = true;
    if (isFixedTimeRange(this.timeRangeValue)) {
      needRefresh = ((<FixedTimeRange>this.timeRangeValue).end === undefined);
    }

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
