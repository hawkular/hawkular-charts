import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input } from '@angular/core';
import { Http, RequestOptions, Headers } from '@angular/http';

import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { IntervalObservable } from 'rxjs/observable/IntervalObservable';
import 'rxjs/add/observable/from';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/toArray';

import { BaseMetricChartComponent } from './base-metric-chart.component';

import {
  NumericDataPoint, NumericBucketPoint, INamedMetric, TimeInMillis, MetricId, UrlType, FixedTimeRange, isFixedTimeRange,
  getFixedTimeRange
} from '../model/types'

@Component({
  selector: 'hk-metric-chart-dyn',
  template: `<div #target class='hawkular-charts'></div>`
})
export class MetricChartDynComponent extends BaseMetricChartComponent implements OnInit, OnDestroy, OnChanges {

  @Input() metricUrl: UrlType;
  @Input() metricIds: MetricId[] = [];
  @Input() metricTenantId = '';
  @Input() authHeader: string;
  @Input() refreshIntervalInSeconds = 30;
  @Input() buckets = 60;

  refreshObservable?: Subscription;

  constructor(private http: Http) {
    super();
  }

  ngOnInit(): void {
    this.resetRefreshLoop();
  }

  ngOnDestroy(): void {
    if (this.refreshObservable) {
      this.refreshObservable.unsubscribe();
    }
  }

  /**
   * Load metrics data directly from a running Hawkular-Metrics server
   * This function assumes the server is configured
   */
  loadStandAloneMetrics() {
    if (this.metricIds.length === 0) {
      return;
    }

    const timeRange = getFixedTimeRange(this.timeRange);
    const params: any = {
      start: timeRange.start,
      end: timeRange.end,
      order: 'ASC'
    };

    const headers = new Headers({ 'Hawkular-Tenant': this.metricTenantId });
    if (this.authHeader) {
      headers.append('Authorization', this.authHeader);
    }

    const isRaw = this.buckets <= 0;
    if (!isRaw) {
      params.buckets = this.buckets;
    }

    if (this.metricIds.length === 1) {
      const endpoint = isRaw ? 'raw' : 'stats';
      const options = new RequestOptions({
        headers: headers,
        params: params
      });

      // sample url:
      // http://localhost:8080/hawkular/metrics/gauges/45b2256eff19cb982542b167b3957036.status.duration/stats?
      // buckets=120&end=1436831797533&start=1436828197533'
      this.http.get(`${this.metricUrl}/${this.metricIds[0].type}s/${encodeURIComponent(this.metricIds[0].name)}/${endpoint}`, options)
        .map((response) => response.json() || [])
        .subscribe((json) => {
          if (isRaw) {
            const rawData: NumericDataPoint[] = json.map((datapoint: any) => new NumericDataPoint(datapoint));
            this.renderRaw(rawData);
          } else {
            const statsData: NumericBucketPoint[] = json.map((datapoint: any) => new NumericBucketPoint(datapoint));
            this.renderStats(statsData);
          }
        }, (err) => {
          throw new Error('Error Loading Chart Data:' + status + ', ' + err);
        });
    } else {
      // Multiline: different kinds of endpoints are used for raw or stats
      if (isRaw) {
        // several calls: one per metric type
        const options = new RequestOptions({ headers: headers });
        const types = Array.from(new Set(this.metricIds.map(m => m.type)));
        Observable.from(types).mergeMap((type: string) => {
          params.ids = this.metricIds.filter(m => m.type === type).map(m => m.name);
          return this.http.post(`${this.metricUrl}/${type}s/raw/query`, params, options)
            // This mergeMap transforms 1 query call response into Observable<INamedMetric> with multiple INamedMetric for a single type
            .mergeMap((response) => {
              const namedMetrics: INamedMetric[] = response.json().map((metric: any) => {
                return {
                  key: `[${type}] ${metric.id}`,
                  values: metric.data.map((datapoint: any) => new NumericDataPoint(datapoint))
                };
              });
              return Observable.from(namedMetrics);
            });
        }).toArray().subscribe((metrics: INamedMetric[]) => {
          this.renderMulti(metrics);
        });
      } else {
        // use /metrics/stats/query POST endpoint
        const options = new RequestOptions({ headers: headers });
        delete params.order;
        params.types = Array.from(new Set(this.metricIds.map(m => m.type)));
        params.metrics = {};
        params.types.forEach((t: string) => {
          params.metrics[t] = this.metricIds.filter(m => m.type === t).map(m => m.name);
        });
        this.http.post(`${this.metricUrl}/metrics/stats/query`, params, options)
          .map((response) => response.json())
          .subscribe((json) => {
            // Response example:
            // {"gauge": {"my_metric": [
            //    {start:1234, end:5678, avg:100.0, min:90.0, max:110.0, (...)}
            // ]}}
            const multiData: INamedMetric[] = [];
            params.types.forEach((t: string) => {
              if (json.hasOwnProperty(t)) {
                const typeJson = json[t];
                params.metrics[t].forEach((m: string) => {
                  if (typeJson.hasOwnProperty(m)) {
                    const statsData: NumericBucketPoint[] = typeJson[m].map((datapoint: any) => new NumericBucketPoint(datapoint))
                      .filter((bucket: NumericBucketPoint) => !bucket.empty);
                    multiData.push({
                      key: `[${t}] ${m}`,
                      values: statsData
                    });
                  }
                });
              }
            });
            this.renderMulti(multiData);
          }, (err) => {
            throw new Error('Error Loading Chart Data:' + status + ', ' + err);
          });
      }
    }
  }

  resetRefreshLoop(): void {
    if (this.refreshObservable) {
      this.refreshObservable.unsubscribe();
      this.refreshObservable = undefined;
    }
    let needRefresh = true;
    if (isFixedTimeRange(this.timeRange)) {
      needRefresh = ((<FixedTimeRange>this.timeRange).end === undefined);
    }

    if (this.refreshIntervalInSeconds && this.refreshIntervalInSeconds > 0 && needRefresh) {
      this.refreshObservable = IntervalObservable.create(this.refreshIntervalInSeconds * 1000)
        .subscribe(() => this.loadStandAloneMetrics());
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.resetRefreshLoop();
    this.loadStandAloneMetrics();
  }

  setTimeRange(startTime: TimeInMillis, endTime?: TimeInMillis) {
    this.timeRange = {
      start: startTime,
      end: endTime
    }
    this.resetRefreshLoop();
    this.loadStandAloneMetrics();
  }
}
