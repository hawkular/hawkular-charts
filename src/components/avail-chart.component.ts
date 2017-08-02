import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { Http, RequestOptions, Headers, Response } from '@angular/http';

import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { IntervalObservable } from 'rxjs/observable/IntervalObservable';

import { IAvailDataPoint, TransformedAvailDataPoint, UrlType, TimeRange, FixedTimeRange, getFixedTimeRange,
  isFixedTimeRange, Range, TimeInMillis } from '../model/types'
import { ChartLayout } from '../model/chart-layout'
import { ComputedChartAxis } from '../model/computed-chart-axis'
import { xAxisTimeFormats } from '../util/utility'
import { initTip } from '../util/avail-tip'

declare const d3: any;
declare const moment: any;
declare const console: any;

// TODO: remove? (was: with room for label)
const MARGIN = { top: 20, right: 0, bottom: 10, left: 45 };

@Component({
  selector: 'hk-availability-chart',
  template: `<div #target class='hawkular-charts'></div>`
})
export class AvailChartComponent implements OnInit, OnDestroy, OnChanges {

  @ViewChild('target') target: any;

  @Input() metricUrl: UrlType;
  @Input() metricId = '';
  @Input() metricTenantId = '';
  @Input() authHeader: string;
  @Input() refreshIntervalInSeconds = 5;
  @Input() data?: IAvailDataPoint[];
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

  chartLayout: ChartLayout;
  computedChartAxis: ComputedChartAxis;
  tip: any;
  brush: any;
  brushGroup: any;
  chart: any; // d3.Selection<any>
  chartParent: any; // d3.Selection<any>
  svg: any; // d3.Selection<any>
  refreshObservable?: Subscription;

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

    const width = parentNode.clientWidth || 760;
    const height = parentNode.clientHeight || 150;
    this.chartLayout = {
      width: width,
      height: height,
      modifiedInnerChartHeight: height - MARGIN.top - MARGIN.bottom,
      innerChartHeight: height + MARGIN.top,
      innerChartWidth: width - MARGIN.left - MARGIN.right
    }

    this.chart = this.chartParent.append('svg')
      .attr('width', width)
      .attr('height', this.chartLayout.innerChartHeight);

    this.svg = this.chart.append('g')
      .attr('transform', 'translate(' + MARGIN.left + ',' + MARGIN.top + ')');

    this.svg.append('defs')
      .append('pattern')
      .attr('id', 'diagonal-stripes')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'scale(0.7)')
      .attr('width', 4)
      .attr('height', 4)
      .append('path')
      .attr('d', 'M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2')
      .attr('stroke', '#B6B6B6')
      .attr('stroke-width', 1.2);

    if (this.tip) {
      this.tip.hide();
    }
    this.tip = initTip(this.svg);
  }

  isServerConfigured(): boolean {
    return this.metricUrl !== undefined
      && this.metricId !== undefined
      && this.metricTenantId !== undefined;
  }

  /**
   * Load metrics data directly from a running Hawkular-Metrics server
   * This function assumes the server is configured
   */
  loadStandAloneAvail() {
    const timeRange = getFixedTimeRange(this.timeRangeValue);
    const params: any = {
      start: timeRange.start,
      end: timeRange.end,
      order: 'ASC'
    };
    const headers = new Headers({ 'Hawkular-Tenant': this.metricTenantId });
    if (this.authHeader) {
      headers.append('Authorization', this.authHeader);
    }
    const options = new RequestOptions({
      headers: headers,
      params: params
    });

    this.http.get(`${this.metricUrl}/availability/${encodeURIComponent(this.metricId)}/raw`, options)
      .map((response) => response.json() || [])
      .subscribe((json) => {
        this.data = json;
        this.render();
      }, (err) => {
        console.error('Error Loading Chart Data:' + status + ', ' + err);
      });
  }

  determineAvailScale() {
    const yScale = d3.scale.linear()
      .rangeRound([this.chartLayout.modifiedInnerChartHeight, 0])
      .domain([0, 2]);

    const yAxis = d3.svg.axis()
      .scale(yScale)
      .ticks(0)
      .tickSize(0, 0)
      .orient('left');

    const timeRange = getFixedTimeRange(this.timeRangeValue);
    const timeScale = d3.time.scale()
      .range([0, this.chartLayout.innerChartWidth])
      .nice()
      .domain([timeRange.start, timeRange.end || Date.now()]);

    const xAxis = d3.svg.axis()
      .scale(timeScale)
      .tickSize(-this.chartLayout.modifiedInnerChartHeight, 0)
      .orient('top')
      .tickFormat(xAxisTimeFormats());

    this.computedChartAxis = {
      dataRange: new Range(0, 1), // unused
      chartRange: new Range(0, 1), // unused
      yScale: yScale,
      yAxis: yAxis,
      timeScale: timeScale,
      xAxis: xAxis
    };
  }

  transformDataPoints(rawData: IAvailDataPoint[]): TransformedAvailDataPoint[] {
    const outputData: TransformedAvailDataPoint[] = [];

    if (rawData) {
      const endTime = getFixedTimeRange(this.timeRangeValue).end || new Date().getTime();
      // Assume data is sorted in ascending order
      let prev: TransformedAvailDataPoint | null = null;
      rawData.forEach(raw => {
        if (prev == null) {
          prev = new TransformedAvailDataPoint(raw.timestamp, endTime, raw.value);
          outputData.push(prev);
        } else if (raw.value !== prev.value) {
          prev.end = raw.timestamp;
          prev = new TransformedAvailDataPoint(raw.timestamp, endTime, raw.value);
          outputData.push(prev);
        }
      });
      outputData.forEach(d => d.updateDuration());
    }
    return outputData;
  }

  createSideYAxisLabels() {
    const lineHeight = this.computedChartAxis.yScale(1);
    // @Todo: move out to stylesheet
    this.svg.append('text')
      .attr('class', 'availUpLabel')
      .attr('x', -10)
      .attr('y', 0.5 * lineHeight)
      .style('font-family', 'Arial, Verdana, sans-serif;')
      .style('font-size', '12px')
      .attr('fill', '#999')
      .style('text-anchor', 'end')
      .text('Up');

    this.svg.append('text')
      .attr('class', 'availDownLabel')
      .attr('x', -10)
      .attr('y', 1.5 * lineHeight)
      .style('font-family', 'Arial, Verdana, sans-serif;')
      .style('font-size', '12px')
      .attr('fill', '#999')
      .style('text-anchor', 'end')
      .text('Down');
  }

  createAvailabilityChart(transformedAvailDataPoint: TransformedAvailDataPoint[]) {
    const xAxisMax = d3.max(transformedAvailDataPoint, (d: TransformedAvailDataPoint) => +d.end);

    function calcBarFill(d: TransformedAvailDataPoint) {
      if (d.isUp()) {
        return '#54A24E'; // green
      } else if (d.isUnknown()) {
        return 'url(#diagonal-stripes)'; // gray stripes
      } else {
        return '#D85054'; // red
      }
    }

    this.svg.selectAll('rect.availBars')
      .data(transformedAvailDataPoint)
      .enter().append('rect')
      .attr('class', 'availBars')
      .attr('x', (d: TransformedAvailDataPoint) => this.computedChartAxis.timeScale(d.start))
      .attr('y', (d: TransformedAvailDataPoint) => this.computedChartAxis.yScale(d.isDown() ? 1 : 2))
      .attr('height', (d: TransformedAvailDataPoint) => this.computedChartAxis.yScale(d.isUnknown() ? 0 : 1))
      .attr('width', (d: TransformedAvailDataPoint) => this.computedChartAxis.timeScale(d.end) - this.computedChartAxis.timeScale(d.start))
      .attr('fill', (d: TransformedAvailDataPoint) => calcBarFill(d))
      .attr('opacity', 0.85)
      .on('mouseover', (d: any, i: any) => this.tip.show(d, i))
      .on('mouseout', () => this.tip.hide())
      .on('mousedown', () => {
        const brushElem = this.svg.select('.brush').node();
        const clickEvent: any = new Event('mousedown');
        clickEvent.pageX = d3.event.pageX;
        clickEvent.clientX = d3.event.clientX;
        clickEvent.pageY = d3.event.pageY;
        clickEvent.clientY = d3.event.clientY;
        brushElem.dispatchEvent(clickEvent);
      })
      .on('mouseup', () => {
        const brushElem = this.svg.select('.brush').node();
        const clickEvent: any = new Event('mouseup');
        clickEvent.pageX = d3.event.pageX;
        clickEvent.clientX = d3.event.clientX;
        clickEvent.pageY = d3.event.pageY;
        clickEvent.clientY = d3.event.clientY;
        brushElem.dispatchEvent(clickEvent);
      });

    // The bottom line of the availability chart
    this.svg.append('line')
      .attr('x1', 0)
      .attr('y1', this.chartLayout.modifiedInnerChartHeight)
      .attr('x2', 655)
      .attr('y2', this.chartLayout.modifiedInnerChartHeight)
      .attr('stroke-width', 0.5)
      .attr('stroke', '#D0D0D0');

    this.createSideYAxisLabels();
  }

  createXandYAxes() {
    this.svg.selectAll('g.axis').remove();

    // create x-axis
    this.svg.append('g')
      .attr('class', 'x axis')
      .call(this.computedChartAxis.xAxis);

    // create y-axis
    this.svg.append('g')
      .attr('class', 'y axis')
      .call(this.computedChartAxis.yAxis);
  }

  createXAxisBrush() {
    this.brush = d3.svg.brush()
      .x(this.computedChartAxis.timeScale)
      .on('brushstart', () => this.svg.classed('selecting', true))
      .on('brushend', () => {
        const extent = this.brush.extent(),
          startTime = Math.round(extent[0].getTime()),
          endTime = Math.round(extent[1].getTime()),
          dragSelectionDelta = endTime - startTime;

        if (dragSelectionDelta >= 60000) {
          // If timerange is "xx from now" and the end bound hasn't changed, then continue in "xx from now" mode and ignore end time.
          const previousEnd = this.computedChartAxis.timeScale.domain()[1].getTime();
          if (!isFixedTimeRange(this.timeRange) && Math.abs(previousEnd - endTime) < 60000) {
            this.setTimeRange(startTime);
          } else {
            this.setTimeRange(startTime, endTime);
          }
        }
        this.brushGroup.call(this.brush.clear());
      });

    this.brushGroup = this.svg.append('g')
      .attr('class', 'brush')
      .call(this.brush);

    this.brushGroup.selectAll('.resize').append('path');

    this.brushGroup.selectAll('rect')
      .attr('height', this.chartLayout.modifiedInnerChartHeight);
  }

  render() {
    // if we don't have data, don't bother..
    if (!this.data) {
      return;
    }

    // NOTE: layering order is important!
    this.resize();
    this.determineAvailScale();
    this.createXandYAxes();
    this.createXAxisBrush();
    const transformedDP = this.transformDataPoints(this.data);
    this.createAvailabilityChart(transformedDP);
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
        .subscribe(() => this.loadStandAloneAvail());
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.refresh();
  }

  refresh(): void {
    this.resetRefreshLoop();
    if (this.isServerConfigured()) {
      this.loadStandAloneAvail();
    } else {
      this.render();
    }
  }

  setTimeRange(startTime: TimeInMillis, endTime?: TimeInMillis) {
    // We will set this.end only if it's not "now". Else, we don't set it so that it will keep refreshing with latest values
    if (this.data) {
      this.data = this.data.filter((d: IAvailDataPoint) => {
        const timestamp = d.timestamp;
        return timestamp >= startTime && (endTime === undefined || timestamp <= endTime);
      });
    }
    this.timeRange = {
      start: startTime,
      end: endTime
    }
    this.refresh();
  }
}
