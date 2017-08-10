import { Component, OnChanges, SimpleChanges, Input } from '@angular/core';

import { BaseMetricChartComponent } from './base-metric-chart.component';
import {
  INumericDataPoint, NumericDataPoint, NumericBucketPoint, INamedMetric, PredictiveMetric,
  TimeInMillis, IAnnotation
} from '../model/types'
import { ChartOptions } from '../model/chart-options'
import { annotateChart } from '../util/annotations'
import { showForecastData } from '../util/forecast'

@Component({
  selector: 'hk-metric-chart',
  template: `<div #target class='hawkular-charts'></div>`
})
export class MetricChartStaticComponent extends BaseMetricChartComponent implements OnChanges {

  @Input() rawData?: NumericDataPoint[];
  @Input() statsData?: NumericBucketPoint[];
  @Input() multiData: INamedMetric[];
  @Input() forecastData: PredictiveMetric[];
  @Input() previousRangeData = [];
  @Input() annotationData: IAnnotation[] = [];

  constructor() {
    super();
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
    let forceEndTime: TimeInMillis | undefined;
    if (this.forecastData && this.forecastData.length > 0) {
      forceEndTime = this.forecastData[this.forecastData.length - 1].timestamp;
    }
    let chartOptions: ChartOptions;
    if (this.rawData) {
      chartOptions = this.renderRaw(this.rawData, forceEndTime);
    } else if (this.statsData) {
      chartOptions = this.renderStats(this.statsData, forceEndTime);
    } else if (this.multiData) {
      chartOptions = this.renderMulti(this.multiData);
    } else {
      return;
    }

    this.createPreviousRangeOverlay(this.previousRangeData);
    if (this.annotationData) {
      annotateChart(this.annotationData, chartOptions);
    }
    if (this.forecastData && this.forecastData.length > 0) {
      showForecastData(this.forecastData, chartOptions);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rawData'] || changes['statsData'] || changes['forecastData'] || changes['multiData']) {
      this.normalizeInputDataPoints();
    }
    this.render();
  }

  setTimeRange(startTime: TimeInMillis, endTime?: TimeInMillis) {
    this.forecastData = [];
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
    this.render();
  }

  normalizeInputDataPoints() {
    // Input got from static JSON may not satisfy class definition in regards to class methods; so normalize that
    if (this.rawData) {
      this.rawData = this.rawData.map(dp => new NumericDataPoint(dp));
    }
    if (this.statsData) {
      this.statsData = this.statsData.map(dp => new NumericBucketPoint(dp));
    }
    if (this.forecastData) {
      this.forecastData = this.forecastData.map(dp => new PredictiveMetric(dp));
    }
    if (this.multiData) {
      this.multiData.forEach((series: INamedMetric) => {
        const raw = series.values.length > 0 && series.values[0].hasOwnProperty('value');
        if (raw) {
          series.values = series.values.map(dp => new NumericDataPoint(<NumericDataPoint>dp));
        } else {
          series.values = series.values.map(dp => new NumericBucketPoint(<NumericBucketPoint>dp));
        }
      });
    }
  }
}
