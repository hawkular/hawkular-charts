/// <reference path='../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

  declare let d3:any;
  declare let console:any;

  let debug:boolean = false;

  // the scale to use for y-axis when all values are 0, [0, DEFAULT_Y_SCALE]
  const DEFAULT_Y_SCALE = 10;

  // Type values and ID types
  export type AlertThreshold = number;
  export type TimeInMillis = number;
  export type UrlType = number;
  export type MetricId = string;
  export type MetricValue = number;

  /**
   * Metrics Response from Hawkular Metrics
   */
  export interface IMetricsResponseDataPoint {
    start: TimeInMillis;
    end: TimeInMillis;
    value?: MetricValue; /// Only for Raw data (no buckets or aggregates)
    avg?: MetricValue; /// when using buckets or aggregates
    min?: MetricValue; /// when using buckets or aggregates
    max?: MetricValue; /// when using buckets or aggregates
    median?: MetricValue; /// when using buckets or aggregates
    percentile95th?: MetricValue; /// when using buckets or aggregates
    empty: boolean;
  }

  export interface IBaseChartDataPoint {
    timestamp: TimeInMillis;
    start?: TimeInMillis;
    end?: TimeInMillis;
    value?: MetricValue; /// Only for Raw data (no buckets or aggregates)
    avg: MetricValue; /// most of the time this is the useful value for aggregates
    empty: boolean; /// will show up in the chart as blank - set this when you have NaN
  }

  /**
   * Representation of data ready to be consumed by charts.
   */
  export interface IChartDataPoint extends IBaseChartDataPoint {
    date?: Date;
    min: MetricValue;
    max: MetricValue;
    percentile95th: MetricValue;
    median: MetricValue;
  }

  /**
   * Defines an individual alert bounds  to be visually highlighted in a chart
   * that an alert was above/below a threshold.
   */
  class AlertBound {
    public startDate:Date;
    public endDate:Date;

    constructor(public startTimestamp:TimeInMillis,
                public endTimestamp:TimeInMillis,
                public alertValue:number) {
      this.startDate = new Date(startTimestamp);
      this.endDate = new Date(endTimestamp);
    }

  }

  /**
   * Data structure for a Multi-Metric chart. Composed of IChartDataDataPoint[].
   */
  export interface IMultiDataPoint {
    key: string;
    color?: string; /// #fffeee
    values: IChartDataPoint[];
  }


  /**
   * @ngdoc directive
   * @name hawkularChart
   * @description A d3 based charting direction to provide charting using various styles of charts.
   *
   */
  angular.module('hawkular.charts')
    .directive('hawkularChart', ['$rootScope', '$http', '$interval', '$log',
      function ($rootScope:ng.IRootScopeService,
                $http:ng.IHttpService,
                $interval:ng.IIntervalService,
                $log:ng.ILogService):ng.IDirective {

        /// only for the stand alone charts
        const BASE_URL = '/hawkular/metrics';

        function link(scope, element, attrs) {

          // data specific vars
          let dataPoints:IChartDataPoint[] = [],
            multiDataPoints:IMultiDataPoint[],
            dataUrl = attrs.metricUrl,
            metricId = attrs.metricId || '',
            metricTenantId = attrs.metricTenantId || '',
            metricType = attrs.metricType || 'gauge',
            timeRangeInSeconds = +attrs.timeRangeInSeconds || 43200,
            refreshIntervalInSeconds = +attrs.refreshIntervalInSeconds || 3600,
            alertValue = +attrs.alertValue,
            interpolation = attrs.interpolation || 'monotone',
            endTimestamp:TimeInMillis = Date.now(),
            startTimestamp:TimeInMillis = endTimestamp - timeRangeInSeconds,
            previousRangeDataPoints = [],
            annotationData = [],
            contextData = [],
            multiChartOverlayData = [],
            chartHeight = +attrs.chartHeight || 250,
            chartType = attrs.chartType || 'hawkularline',
            timeLabel = attrs.timeLabel || 'Time',
            dateLabel = attrs.dateLabel || 'Date',
            singleValueLabel = attrs.singleValueLabel || 'Raw Value',
            noDataLabel = attrs.noDataLabel || 'No Data',
            aggregateLabel = attrs.aggregateLabel || 'Aggregate',
            startLabel = attrs.startLabel || 'Start',
            endLabel = attrs.endLabel || 'End',
            durationLabel = attrs.durationLabel || 'Interval',
            minLabel = attrs.minLabel || 'Min',
            maxLabel = attrs.maxLabel || 'Max',
            avgLabel = attrs.avgLabel || 'Avg',
            timestampLabel = attrs.timestampLabel || 'Timestamp',
            showAvgLine = true,
            showDataPoints = false,
            hideHighLowValues = false,
            useZeroMinValue = false,
            chartHoverDateFormat = attrs.chartHoverDateFormat || '%m/%d/%y',
            chartHoverTimeFormat = attrs.chartHoverTimeFormat || '%I:%M:%S %p',
            buttonBarDateTimeFormat = attrs.buttonbarDatetimeFormat || 'MM/DD/YYYY h:mm a';

          // chart specific vars
          let margin = {top: 10, right: 5, bottom: 5, left: 90},
            contextMargin = {top: 150, right: 5, bottom: 5, left: 90},
            xAxisContextMargin = {top: 190, right: 5, bottom: 5, left: 90},
            width = 750 - margin.left - margin.right,
            adjustedChartHeight = chartHeight - 50,
            height = adjustedChartHeight - margin.top - margin.bottom,
            smallChartThresholdInPixels = 600,
            titleHeight = 30, titleSpace = 10,
            innerChartHeight = height + margin.top - titleHeight - titleSpace + margin.bottom,
            adjustedChartHeight2 = +titleHeight + titleSpace + margin.top,
            barOffset = 2,
            chartData,
            calcBarWidth,
            yScale,
            timeScale,
            yAxis,
            xAxis,
            tip,
            brush,
            brushGroup,
            timeScaleForBrush,
            timeScaleForContext,
            chart,
            chartParent,
            context,
            contextArea,
            svg,
            lowBound,
            highBound,
            avg,
            peak,
            min,
            processedNewData,
            processedPreviousRangeData;

          dataPoints = attrs.data;
          showDataPoints = attrs.showDataPoints;
          previousRangeDataPoints = attrs.previousRangeData;
          multiChartOverlayData = attrs.multiChartOverlayData;
          annotationData = attrs.annotationData;
          contextData = attrs.contextData;

          let startIntervalPromise;

          function xMidPointStartPosition(d) {
            return timeScale(d.timestamp) + (calcBarWidth() / 2);
          }

          function getChartWidth():number {
            //return angular.element('#' + chartContext.chartHandle).width();
            return 760;
          }

          function useSmallCharts():boolean {
            return getChartWidth() <= smallChartThresholdInPixels;
          }


          function initialization():void {
            // destroy any previous charts
            if (chart) {
              chartParent.selectAll('*').remove();
            }
            chartParent = d3.select(element[0]);
            chart = chartParent.append('svg')
              .attr('viewBox', '0 0 760 ' + (chartHeight + 25)).attr('preserveAspectRatio', 'xMinYMin meet');

            createSvgDefs(chart);

            tip = d3.tip()
              .attr('class', 'd3-tip')
              .offset([-10, 0])
              .html((d, i) => {
                return buildHover(d, i);
              });

            svg = chart.append('g')
              .attr('width', width + margin.left + margin.right)
              .attr('height', innerChartHeight)
              .attr('transform', 'translate(' + margin.left + ',' + (adjustedChartHeight2) + ')');


            svg.call(tip);

          }


          function setupFilteredData(dataPoints:IChartDataPoint[]):void {
            let alertPeak:number,
              highPeak:number;

            function determineMultiMetricMinMax() {
              let currentMax:number,
                currentMin:number,
                seriesMax:number,
                seriesMin:number,
                maxList = [],
                minList = [];

              multiChartOverlayData.forEach((series) => {
                currentMax = d3.max(series.map((d) => {
                  return !d.empty ? (d.avg || d.value) : 0;
                }));
                maxList.push(currentMax);
                currentMin = d3.min(series.map((d) => {
                  return !d.empty ? (d.avg || d.value) : Number.MAX_VALUE;
                }));
                minList.push(currentMin);

              });
              seriesMax = d3.max(maxList);
              seriesMin = d3.min(minList);
              return [seriesMin, seriesMax];
            }


            if (multiChartOverlayData) {
              let minMax = determineMultiMetricMinMax();
              peak = minMax[1];
              min = minMax[0];
            }

            if (dataPoints) {
              peak = d3.max(dataPoints.map((d) => {
                return !d.empty ? (d.avg || d.value) : 0;
              }));

              min = d3.min(dataPoints.map((d)  => {
                return !d.empty ? (d.avg || d.value) : undefined;
              }));
            }

            lowBound = useZeroMinValue ? 0 : min - (min * 0.05);
            if (alertValue) {
              alertPeak = (alertValue * 1.2);
              highPeak = peak + ((peak - min) * 0.2);
              highBound = alertPeak > highPeak ? alertPeak : highPeak;
            } else {
              highBound = peak + ((peak - min) * 0.2);
            }
            highBound = !!!highBound && !!!lowBound ? DEFAULT_Y_SCALE : highBound;
          }

          function determineScale(dataPoints:IChartDataPoint[]) {
            let xTicks, xTickSubDivide, numberOfBarsForSmallGraph = 20;

            if (dataPoints.length > 0) {

              // if window is too small server up small chart
              if (useSmallCharts()) {
                width = 250;
                xTicks = 3;
                xTickSubDivide = 2;
                chartData = dataPoints.slice(dataPoints.length - numberOfBarsForSmallGraph, dataPoints.length);
              }
              else {
                //  we use the width already defined above
                xTicks = 9;
                xTickSubDivide = 5;
                chartData = dataPoints;
              }

              setupFilteredData(dataPoints);

              calcBarWidth = () => {
                return (width / chartData.length - barOffset  );
              };

              yScale = d3.scale.linear()
                .clamp(true)
                .rangeRound([height, 0])
                .domain([lowBound, highBound]);

              yAxis = d3.svg.axis()
                .scale(yScale)
                .ticks(5)
                .tickSize(4, 4, 0)
                .orient('left');

              timeScale = d3.time.scale()
                .range([0, width])
                .domain(d3.extent(chartData, (d:IChartDataPoint) => {
                  return d.timestamp;
                }));

              if (contextData) {
                timeScaleForContext = d3.time.scale()
                  .range([0, width])
                  .domain(d3.extent(contextData, (d:IChartDataPoint) => {
                    return d.timestamp;
                  }));
              } else {
                timeScaleForBrush = d3.time.scale()
                  .range([0, width])
                  .domain(d3.extent(chartData, (d:IChartDataPoint) => {
                    return d.timestamp;
                  }));

              }

              xAxis = d3.svg.axis()
                .scale(timeScale)
                .ticks(xTicks)
                .tickFormat(d3.time.format('%H:%M'))
                .tickSize(4, 4, 0)
                .orient('bottom');

            }
          }


          function setupFilteredMultiData(multiDataPoints:IMultiDataPoint[]):any {
            let alertPeak:number,
              highPeak:number,
              highbound:number,
              lowbound:number;

            function determineMultiDataMinMax() {
              let currentMax:number,
                currentMin:number,
                seriesMax:number,
                seriesMin:number,
                maxList:number[] = [],
                minList:number[] = [];

              multiDataPoints.forEach((series) => {
                currentMax = d3.max(series.values.map((d) => {
                  return !d.empty ? d.avg : 0;
                }));
                maxList.push(currentMax);
                currentMin = d3.min(series.values.map((d) => {
                  return !d.empty ? d.avg : Number.MAX_VALUE;
                }));
                minList.push(currentMin);

              });
              seriesMax = d3.max(maxList);
              seriesMin = d3.min(minList);
              return [seriesMin, seriesMax];
            }


            const minMax = determineMultiDataMinMax();
            peak = minMax[1];
            min = minMax[0];

            lowBound = useZeroMinValue ? 0 : min - (min * 0.05);
            if (alertValue) {
              alertPeak = (alertValue * 1.2);
              highPeak = peak + ((peak - min) * 0.2);
              highBound = alertPeak > highPeak ? alertPeak : highPeak;
            } else {
              highBound = peak + ((peak - min) * 0.2);
            }

            return [lowBound, !!!highBound && !!!lowBound ? DEFAULT_Y_SCALE : highBound];
          }


          function determineMultiScale(multiDataPoints:IMultiDataPoint[]) {
            const xTicks = 9,
              xTickSubDivide = 5;

            let firstDataArray;

            if (multiDataPoints && multiDataPoints[0] && multiDataPoints[0].values) {

              firstDataArray = multiDataPoints[0].values;

              let lowHigh = setupFilteredMultiData(multiDataPoints);
              lowBound = lowHigh[0];
              highBound = lowHigh[1]

              yScale = d3.scale.linear()
                .clamp(true)
                .rangeRound([height, 0])
                .domain([lowBound, highBound]);

              yAxis = d3.svg.axis()
                .scale(yScale)
                .ticks(5)
                .tickSize(4, 4, 0)
                .orient('left');


              timeScale = d3.time.scale()
                .range([0, width])
                .domain(d3.extent(firstDataArray, (d:IChartDataPoint) => {
                  return d.timestamp;
                }));


              xAxis = d3.svg.axis()
                .scale(timeScale)
                .ticks(xTicks)
                .tickFormat(d3.time.format('%H:%M'))
                .tickSize(4, 4, 0)
                .orient('bottom');

            }
          }


          /**
           * Load metrics data directly from a running Hawkular-Metrics server
           * @param url
           * @param metricId
           * @param startTimestamp
           * @param endTimestamp
           * @param buckets
           */
          function loadStandAloneMetricsForTimeRange(url:UrlType,
                                                     metricId:MetricId,
                                                     startTimestamp:TimeInMillis,
                                                     endTimestamp:TimeInMillis,
                                                     buckets = 60) {
            ///$log.debug('-- Retrieving metrics data for urlData: ' + metricId);
            ///$log.debug('-- Date Range: ' + new Date(startTimestamp) + ' - ' + new Date(endTimestamp));
            ///$log.debug('-- TenantId: ' + metricTenantId);

            //let numBuckets = buckets || 60;
            let requestConfig:ng.IRequestConfig = <any> {
              headers: {
                'Hawkular-Tenant': metricTenantId
              },
              params: {
                start: startTimestamp,
                end: endTimestamp,
                buckets: buckets
              }
            };

            if (startTimestamp >= endTimestamp) {
              $log.log('Start date was after end date');
            }


            if (url && metricType && metricId) {

              let metricTypeAndData = metricType.split('-');
              /// sample url:
              /// http://localhost:8080/hawkular/metrics/gauges/45b2256eff19cb982542b167b3957036.status.duration/data?
              // buckets=120&end=1436831797533&start=1436828197533'
              $http.get(url + '/' + metricTypeAndData[0] + 's/' + metricId + '/' + (metricTypeAndData[1] || 'data'),
                requestConfig).success((response) => {

                  processedNewData = formatBucketedChartOutput(response);
                  scope.render(processedNewData, processedPreviousRangeData);

                }).error((reason, status) => {
                  $log.error('Error Loading Chart Data:' + status + ', ' + reason);
                });
            }

          }

          /**
           * Transform the raw http response from Metrics to one usable in charts
           * @param response
           * @returns transformed response to IChartDataPoint[], ready to be charted
           */
          function formatBucketedChartOutput(response):IChartDataPoint[] {
            //  The schema is different for bucketed output
            if (response) {
              return response.map((point:IChartDataPoint) => {
                let timestamp:TimeInMillis = point.timestamp || (point.start + (point.end - point.start) / 2);
                return {
                  timestamp: timestamp,
                  date: new Date(timestamp),
                  value: !angular.isNumber(point.value) ? undefined : point.value,
                  avg: (point.empty) ? undefined : point.avg,
                  min: !angular.isNumber(point.min) ? undefined : point.min,
                  max: !angular.isNumber(point.max) ? undefined : point.max,
                  empty: point.empty
                };
              });
            }
          }


          /**
           * An empty value overrides any other values.
           * @param d
           * @returns {boolean|any|function(): JQueryCallback|function(): JQuery|function(): void|function(): boolean}
           */
          function isEmptyDataBar(d:IChartDataPoint):boolean {
            return d.empty;
          }

          /**
           * Raw metrics have a 'value' set instead of avg/min/max of aggregates
           * @param d
           * @returns {boolean}
           */
          function isRawMetric(d:IChartDataPoint):boolean {
            return typeof d.avg === 'undefined';
          }


          function buildHover(d:IChartDataPoint, i:number) {
            let hover,
              prevTimestamp,
              currentTimestamp = d.timestamp,
              barDuration,
              formattedDateTime = moment(d.timestamp).format(buttonBarDateTimeFormat);

            if (i > 0) {
              prevTimestamp = chartData[i - 1].timestamp;
              barDuration = moment(currentTimestamp).from(moment(prevTimestamp), true);
            }

            if (isEmptyDataBar(d)) {
              // nodata
              hover = `<div class='chartHover'>
                <small class='chartHoverLabel'>${noDataLabel}</small>
                <div><small><span class='chartHoverLabel'>${durationLabel}</span><span>: </span><span class='chartHoverValue'>${barDuration}</span></small> </div>
                <hr/>
                <div><small><span class='chartHoverLabel'>${timestampLabel}</span><span>: </span><span class='chartHoverValue'>${formattedDateTime}</span></small></div>
                </div>`;
            } else {
              if (isRawMetric(d)) {
                // raw single value from raw table
                hover = `<div class='chartHover'>
                <div><small><span class='chartHoverLabel'>${timestampLabel}</span><span>: </span><span class='chartHoverValue'>${formattedDateTime}</span></small></div>
                  <div><small><span class='chartHoverLabel'>${durationLabel}</span><span>: </span><span class='chartHoverValue'>${barDuration}</span></small></div>
                  <hr/>
                  <div><small><span class='chartHoverLabel'>${singleValueLabel}</span><span>: </span><span class='chartHoverValue'>${d3.round(d.value, 2)}</span></small> </div>
                  </div> `;
              } else {
                // aggregate with min/avg/max
                hover = `<div class='chartHover'>
                <small>
                  <span class='chartHoverLabel'>${timestampLabel}</span><span>: </span><span class='chartHoverValue'>${formattedDateTime}</span>
                </small>
                  <div><small><span class='chartHoverLabel'>${durationLabel}</span><span>: </span><span class='chartHoverValue'>${barDuration}</span></small> </div>
                  <hr/>
                  <div><small><span class='chartHoverLabel'>${maxLabel}</span><span>: </span><span class='chartHoverValue'>${d3.round(d.max, 2)}</span></small> </div>
                  <div><small><span class='chartHoverLabel'>${avgLabel}</span><span>: </span><span class='chartHoverValue'>${d3.round(d.avg, 2)}</span></small> </div>
                  <div><small><span class='chartHoverLabel'>${minLabel}</span><span>: </span><span class='chartHoverValue'>${d3.round(d.min, 2)}</span></small> </div>
                  </div> `;
              }
            }
            return hover;

          }

          function createHeader(titleName:string) {
            let title = chart.append('g').append('rect')
              .attr('class', 'title')
              .attr('x', 30)
              .attr('y', margin.top)
              .attr('height', titleHeight)
              .attr('width', width + 30 + margin.left)
              .attr('fill', 'none');

            chart.append('text')
              .attr('class', 'titleName')
              .attr('x', 40)
              .attr('y', 37)
              .text(titleName);

            return title;

          }

          function createSvgDefs(chart) {

            let defs = chart.append('defs');

            defs.append('pattern')
              .attr('id', 'noDataStripes')
              .attr('patternUnits', 'userSpaceOnUse')
              .attr('x', '0')
              .attr('y', '0')
              .attr('width', '6')
              .attr('height', '3')
              .append('path')
              .attr('d', 'M 0 0 6 0')
              .attr('style', 'stroke:#CCCCCC; fill:none;');

            defs.append('pattern')
              .attr('id', 'unknownStripes')
              .attr('patternUnits', 'userSpaceOnUse')
              .attr('x', '0')
              .attr('y', '0')
              .attr('width', '6')
              .attr('height', '3')
              .attr('style', 'stroke:#2E9EC2; fill:none;')
              .append('path').attr('d', 'M 0 0 6 0');

            defs.append('pattern')
              .attr('id', 'downStripes')
              .attr('patternUnits', 'userSpaceOnUse')
              .attr('x', '0')
              .attr('y', '0')
              .attr('width', '6')
              .attr('height', '3')
              .attr('style', 'stroke:#ff8a9a; fill:none;')
              .append('path').attr('d', 'M 0 0 6 0');

          }


          function createRhqStackedBars(lowBound:number, highBound:number) {

            // The gray bars at the bottom leading up
            svg.selectAll('rect.leaderBar')
              .data(chartData)
              .enter().append('rect')
              .attr('class', 'leaderBar')
              .attr('x', (d) => {
                return timeScale(d.timestamp);
              })
              .attr('y', (d) => {
                if (!isEmptyDataBar(d)) {
                  return yScale(d.min);
                }
                else {
                  return 0;
                }
              })
              .attr('height', (d) => {
                if (isEmptyDataBar(d)) {
                  return height - yScale(highBound);
                }
                else {
                  return height - yScale(d.min);
                }
              })
              .attr('width', () => {
                return calcBarWidth();
              })

              .attr('opacity', '.6')
              .attr('fill', (d) => {
                if (isEmptyDataBar(d)) {
                  return 'url(#noDataStripes)';
                }
                else {
                  return '#d3d3d6';
                }
              }).on('mouseover', (d, i) => {
                tip.show(d, i);
              }).on('mouseout', () => {
                tip.hide();
              });


            // upper portion representing avg to high
            svg.selectAll('rect.high')
              .data(chartData)
              .enter().append('rect')
              .attr('class', 'high')
              .attr('x', (d) => {
                return timeScale(d.timestamp);
              })
              .attr('y', (d) => {
                return isNaN(d.max) ? yScale(lowBound) : yScale(d.max);
              })
              .attr('height', (d) => {
                if (isEmptyDataBar(d)) {
                  return 0;
                }
                else {
                  return yScale(d.avg) - yScale(d.max);
                }
              })
              .attr('width', () => {
                return calcBarWidth();
              })
              .attr('data-rhq-value', (d) => {
                return d.max;
              })
              .attr('opacity', 0.9)
              .on('mouseover', (d, i) => {
                tip.show(d, i);
              }).on('mouseout', () => {
                tip.hide();
              });


            // lower portion representing avg to low
            svg.selectAll('rect.low')
              .data(chartData)
              .enter().append('rect')
              .attr('class', 'low')
              .attr('x', (d) => {
                return timeScale(d.timestamp);
              })
              .attr('y', (d) => {
                return isNaN(d.avg) ? height : yScale(d.avg);
              })
              .attr('height', (d) => {
                if (isEmptyDataBar(d)) {
                  return 0;
                }
                else {
                  return yScale(d.min) - yScale(d.avg);
                }
              })
              .attr('width', () => {
                return calcBarWidth();
              })
              .attr('opacity', 0.9)
              .attr('data-rhq-value', (d) => {
                return d.min;
              })
              .on('mouseover', (d, i) => {
                tip.show(d, i);
              }).on('mouseout', () => {
                tip.hide();
              });

            // if high == low put a 'cap' on the bar to show raw value, non-aggregated bar
            svg.selectAll('rect.singleValue')
              .data(chartData)
              .enter().append('rect')
              .attr('class', 'singleValue')
              .attr('x', (d) => {
                return timeScale(d.timestamp);
              })
              .attr('y', (d) => {
                return isNaN(d.value) ? height : yScale(d.value) - 2;
              })
              .attr('height', (d) => {
                if (isEmptyDataBar(d)) {
                  return 0;
                }
                else {
                  if (d.min === d.max) {
                    return yScale(d.min) - yScale(d.value) + 2;
                  }
                  else {
                    return 0;
                  }
                }
              })
              .attr('width', () => {
                return calcBarWidth();
              })
              .attr('opacity', 0.9)
              .attr('data-rhq-value', (d) => {
                return d.value;
              })
              .attr('fill', (d) => {
                if (d.min === d.max) {
                  return '#50505a';
                }
                else {
                  return '#70c4e2';
                }
              }).on('mouseover', (d, i) => {
                tip.show(d, i);
              }).on('mouseout', () => {
                tip.hide();
              });
          }


          function createHistogramChart() {
            let strokeOpacity = '0.6';

            // upper portion representing avg to high
            svg.selectAll('rect.histogram')
              .data(chartData)
              .enter().append('rect')
              .attr('class', 'histogram')
              .attr('x', (d) => {
                return timeScale(d.timestamp);
              })
              .attr('width', () => {
                return calcBarWidth();
              })
              .attr('y', (d) => {
                if (!isEmptyDataBar(d)) {
                  return yScale(d.avg);
                }
                else {
                  return 0;
                }
              })
              .attr('height', (d) => {
                if (isEmptyDataBar(d)) {
                  return height - yScale(highBound);
                }
                else {
                  return height - yScale(d.avg);
                }
              })
              .attr('fill', (d, i) => {
                if (isEmptyDataBar(d)) {
                  return 'url(#noDataStripes)';
                }
                else {
                  return '#C0C0C0';
                }
              })
              .attr('stroke', (d) => {
                return '#777';
              })
              .attr('stroke-width', (d) => {
                if (isEmptyDataBar(d)) {
                  return '0';
                }
                else {
                  return '0';
                }
              })
              .attr('data-hawkular-value', (d) => {
                return d.avg;
              }).on('mouseover', (d, i) => {
                tip.show(d, i);
              }).on('mouseout', () => {
                tip.hide();
              });

            if (hideHighLowValues === false) {

              svg.selectAll('.histogram.top.stem')
                .data(chartData)
                .enter().append('line')
                .attr('class', 'histogramTopStem')
                .attr('x1', (d) => {
                  return xMidPointStartPosition(d);
                })
                .attr('x2', (d) => {
                  return xMidPointStartPosition(d);
                })
                .attr('y1', (d) => {
                  return yScale(d.max);
                })
                .attr('y2', (d) => {
                  return yScale(d.avg);
                })
                .attr('stroke', (d) => {
                  return 'red';
                })
                .attr('stroke-opacity', (d) => {
                  return strokeOpacity;
                });

              svg.selectAll('.histogram.bottom.stem')
                .data(chartData)
                .enter().append('line')
                .attr('class', 'histogramBottomStem')
                .attr('x1', (d) => {
                  return xMidPointStartPosition(d);
                })
                .attr('x2', (d)  => {
                  return xMidPointStartPosition(d);
                })
                .attr('y1', (d) => {
                  return yScale(d.avg);
                })
                .attr('y2', (d)  => {
                  return yScale(d.min);
                })
                .attr('stroke', (d) => {
                  return 'red';
                }).attr('stroke-opacity', (d) => {
                  return strokeOpacity;
                });

              svg.selectAll('.histogram.top.cross')
                .data(chartData)
                .enter().append('line')
                .attr('class', 'histogramTopCross')
                .attr('x1', function (d) {
                  return xMidPointStartPosition(d) - 3;
                })
                .attr('x2', function (d) {
                  return xMidPointStartPosition(d) + 3;
                })
                .attr('y1', function (d) {
                  return yScale(d.max);
                })
                .attr('y2', function (d) {
                  return yScale(d.max);
                })
                .attr('stroke', function (d) {
                  return 'red';
                })
                .attr('stroke-width', function (d) {
                  return '0.5';
                })
                .attr('stroke-opacity', function (d) {
                  return strokeOpacity;
                });

              svg.selectAll('.histogram.bottom.cross')
                .data(chartData)
                .enter().append('line')
                .attr('class', 'histogramBottomCross')
                .attr('x1', function (d) {
                  return xMidPointStartPosition(d) - 3;
                })
                .attr('x2', function (d) {
                  return xMidPointStartPosition(d) + 3;
                })
                .attr('y1', function (d) {
                  return yScale(d.min);
                })
                .attr('y2', function (d) {
                  return yScale(d.min);
                })
                .attr('stroke', function (d) {
                  return 'red';
                })
                .attr('stroke-width', function (d) {
                  return '0.5';
                })
                .attr('stroke-opacity', function (d) {
                  return strokeOpacity;
                });

            }

          }


          function createHawkularLineChart() {
            let chartLine = d3.svg.line()
              .interpolate(interpolation)
              .defined((d) => {
                return !d.empty;
              })
              .x((d) => {
                return timeScale(d.timestamp);
              })
              .y((d) => {
                return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
              });


            // Bar avg line
            svg.append('path')
              .datum(chartData)
              .attr('class', 'avgLine')
              .attr('d', chartLine);

          }


          function createHawkularMetricChart() {

            let metricChartLine = d3.svg.line()
              .interpolate(interpolation)
              .defined((d) => {
                return !d.empty;
              })
              .x((d) => {
                return timeScale(d.timestamp);
              })
              .y((d) => {
                return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
              });

            svg.append('path')
              .datum(chartData)
              .attr('class', 'metricLine')
              .attr('d', metricChartLine);

          }

          function createMultiLineChart(multiDataPoints:IMultiDataPoint[]) {
            let colorScale = d3.scale.category10(),
              g = 0;

            if (multiDataPoints) {
              multiDataPoints.forEach((singleChartData) => {
                if (singleChartData && singleChartData.values) {

                  svg.append('path')
                    .datum(singleChartData.values)
                    .attr('class', 'multiLine')
                    .attr('fill', 'none')
                    .attr('stroke', () => {
                      if (singleChartData.color) {
                        return singleChartData.color;
                      } else {
                        return colorScale(g);
                      }
                    })
                    .attr('d', createLine('linear'));
                  g++;

                }
              });
            } else {
              $log.warn('No multi-data set for multiline chart');
            }

          }

          function createAreaChart() {
            let highArea = d3.svg.area()
                .interpolate(interpolation)
                .defined((d) => {
                  return !d.empty;
                })
                .x((d) => {
                  return xMidPointStartPosition(d);
                })
                .y((d) => {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.max);
                })
                .y0((d) => {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                }),

              avgArea = d3.svg.area()
                .interpolate(interpolation)
                .defined((d) => {
                  return !d.empty;
                })
                .x((d) => {
                  return xMidPointStartPosition(d);
                })
                .y((d) => {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                }).
                y0((d) => {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
                }),

              lowArea = d3.svg.area()
                .interpolate(interpolation)
                .defined((d) => {
                  return !d.empty;
                })
                .x((d) => {
                  return xMidPointStartPosition(d);
                })
                .y((d) => {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
                })
                .y0(() => {
                  return height;
                });


            if (hideHighLowValues === false) {

              svg.append('path')
                .datum(chartData)
                .attr('class', 'highArea')
                .attr('d', highArea);

              svg.append('path')
                .datum(chartData)
                .attr('class', 'lowArea')
                .attr('d', lowArea);
            }

            svg.append('path')
              .datum(chartData)
              .attr('class', 'avgArea')
              .attr('d', avgArea);

          }

          function createScatterChart() {
            if (hideHighLowValues === false) {

              svg.selectAll('.highDot')
                .data(chartData)
                .enter().append('circle')
                .attr('class', 'highDot')
                .attr('r', 3)
                .attr('cx', (d) => {
                  return xMidPointStartPosition(d);
                })
                .attr('cy', (d) => {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.max);
                })
                .style('fill', () => {
                  return '#ff1a13';
                }).on('mouseover', (d, i) => {
                  tip.show(d, i);
                }).on('mouseout', () => {
                  tip.hide();
                });


              svg.selectAll('.lowDot')
                .data(chartData)
                .enter().append('circle')
                .attr('class', 'lowDot')
                .attr('r', 3)
                .attr('cx', (d) => {
                  return xMidPointStartPosition(d);
                })
                .attr('cy', (d) => {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
                })
                .style('fill', () => {
                  return '#70c4e2';
                }).on('mouseover', (d, i) => {
                  tip.show(d, i);
                }).on('mouseout', () => {
                  tip.hide();
                });
            }

            svg.selectAll('.avgDot')
              .data(chartData)
              .enter().append('circle')
              .attr('class', 'avgDot')
              .attr('r', 3)
              .attr('cx', (d) => {
                return xMidPointStartPosition(d);
              })
              .attr('cy', (d) => {
                return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
              })
              .style('fill', () => {
                return '#FFF';
              }).on('mouseover', (d, i) => {
                tip.show(d, i);
              }).on('mouseout', () => {
                tip.hide();
              });
          }

          function createScatterLineChart() {

            svg.selectAll('.scatterline.top.stem')
              .data(chartData)
              .enter().append('line')
              .attr('class', 'scatterLineTopStem')
              .attr('x1', (d) => {
                return xMidPointStartPosition(d);
              })
              .attr('x2', (d) => {
                return xMidPointStartPosition(d);
              })
              .attr('y1', (d) => {
                return yScale(d.max);
              })
              .attr('y2', (d) => {
                return yScale(d.avg);
              })
              .attr('stroke', (d) => {
                return '#000';
              });

            svg.selectAll('.scatterline.bottom.stem')
              .data(chartData)
              .enter().append('line')
              .attr('class', 'scatterLineBottomStem')
              .attr('x1', (d) => {
                return xMidPointStartPosition(d);
              })
              .attr('x2', (d) => {
                return xMidPointStartPosition(d);
              })
              .attr('y1', (d) => {
                return yScale(d.avg);
              })
              .attr('y2', (d) => {
                return yScale(d.min);
              })
              .attr('stroke', (d) => {
                return '#000';
              });

            svg.selectAll('.scatterline.top.cross')
              .data(chartData)
              .enter().append('line')
              .attr('class', 'scatterLineTopCross')
              .attr('x1', (d) => {
                return xMidPointStartPosition(d) - 3;
              })
              .attr('x2', (d) => {
                return xMidPointStartPosition(d) + 3;
              })
              .attr('y1', (d) => {
                return yScale(d.max);
              })
              .attr('y2', (d) => {
                return yScale(d.max);
              })
              .attr('stroke', (d) => {
                return '#000';
              })
              .attr('stroke-width', (d) => {
                return '0.5';
              });

            svg.selectAll('.scatterline.bottom.cross')
              .data(chartData)
              .enter().append('line')
              .attr('class', 'scatterLineBottomCross')
              .attr('x1', (d) => {
                return xMidPointStartPosition(d) - 3;
              })
              .attr('x2', (d) => {
                return xMidPointStartPosition(d) + 3;
              })
              .attr('y1', (d) => {
                return yScale(d.min);
              })
              .attr('y2', (d) => {
                return yScale(d.min);
              })
              .attr('stroke', (d) => {
                return '#000';
              })
              .attr('stroke-width', (d) => {
                return '0.5';
              });

            svg.selectAll('.scatterDot')
              .data(chartData)
              .enter().append('circle')
              .attr('class', 'avgDot')
              .attr('r', 3)
              .attr('cx', (d) => {
                return xMidPointStartPosition(d);
              })
              .attr('cy', (d) => {
                return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
              })
              .style('fill', () => {
                return '#70c4e2';
              })
              .style('opacity', () => {
                return '1';
              }).on('mouseover', (d, i) => {
                tip.show(d, i);
              }).on('mouseout', () => {
                tip.hide();
              });


          }


          function createYAxisGridLines() {
            // create the y axis grid lines
            if (yScale) {
              svg.append('g').classed('grid y_grid', true)
                .call(d3.svg.axis()
                  .scale(yScale)
                  .orient('left')
                  .ticks(10)
                  .tickSize(-width, 0)
                  .tickFormat('')
              );
            }
          }

          function createXandYAxes() {
            let xAxisGroup;

            if (yAxis) {

              svg.selectAll('g.axis').remove();


              // create x-axis
              xAxisGroup = svg.append('g')
                .attr('class', 'x axis')
                .attr('transform', 'translate(0,' + height + ')')
                .call(xAxis);

              xAxisGroup.append('g')
                .attr('class', 'x brush')
                .call(brush)
                .selectAll('rect')
                .attr('y', -6)
                .attr('height', 30);

              // create y-axis
              svg.append('g')
                .attr('class', 'y axis')
                .call(yAxis)
                .append('text')
                .attr('transform', 'rotate(-90),translate(0,-50)')
                .attr('x',-chartHeight/2)
                .style('text-anchor', 'start')
                .text(attrs.yAxisUnits === 'NONE' ? '' : attrs.yAxisUnits);
            }

          }

          function createCenteredLine(newInterpolation) {
            let interpolate = newInterpolation || 'monotone',
              line = d3.svg.line()
                .interpolate(interpolate)
                .defined((d) => {
                  return !d.empty;
                })
                .x((d) => {
                  return timeScale(d.timestamp) + (calcBarWidth() / 2)
                })
                .y((d)=> {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                });

            return line;
          }

          function createLine(newInterpolation) {
            let interpolate = newInterpolation || 'monotone',
              line = d3.svg.line()
                .interpolate(interpolate)
                .defined((d) => {
                  return !d.empty;
                })
                .x((d) => {
                  return timeScale(d.timestamp);
                })
                .y((d)=> {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                });

            return line;
          }

          function createAvgLines() {
            if (chartType === 'bar' || chartType === 'scatterline') {
              svg.append('path')
                .datum(chartData)
                .attr('class', 'barAvgLine')
                .attr('d', createCenteredLine('monotone'));
            }
          }

          function createAlertLineDef(alertValue:number) {
            let line = d3.svg.line()
              .interpolate('monotone')
              .x((d) => {
                return timeScale(d.timestamp);
              })
              .y((d) => {
                return yScale(alertValue);
              });

            return line;
          }

          function createAlertLine(alertValue:number) {
            svg.append('path')
              .datum(chartData)
              .attr('class', 'alertLine')
              .attr('d', createAlertLineDef(alertValue));
          }


          function extractAlertRanges(chartData:IChartDataPoint[], threshold:AlertThreshold):AlertBound[] {
            let alertBoundAreaItem:AlertBound;
            let alertBoundAreaItems:AlertBound[];
            let startPoints:number[];
            let firstChartPoint:IChartDataPoint = chartData[0];
            let lastChartPoint:IChartDataPoint = chartData[chartData.length - 1];

            function findStartPoints(chartData:IChartDataPoint[], threshold:AlertThreshold) {
              let startPoints = [];
              let prevItem:IChartDataPoint;

              chartData.forEach((chartItem:IChartDataPoint, i:number) => {
                if (i === 0 && chartItem.avg > threshold) {
                  startPoints.push(i);
                }
                else {
                  prevItem = chartData[i - 1];
                  if (chartItem.avg > threshold && prevItem && (!prevItem.avg || prevItem.avg <= threshold)) {
                    startPoints.push(prevItem.avg ? (i - 1) : i);
                  }
                }

              });
              return startPoints;
            }

            function findEndPointsForStartPointIndex(startPoints:number[], threshold:AlertThreshold):AlertBound[] {
              let alertBoundAreaItems:AlertBound[] = [];
              let currentItem:IChartDataPoint;
              let nextItem:IChartDataPoint;
              let startItem:IChartDataPoint;

              startPoints.forEach((startPointIndex:number) => {
                startItem = chartData[startPointIndex];


                for (let j = startPointIndex; j < chartData.length - 1; j++) {
                  currentItem = chartData[j];
                  nextItem = chartData[j + 1];

                  if ((currentItem.avg > threshold && nextItem.avg <= threshold)
                    || (currentItem.avg > threshold && !nextItem.avg)) {
                    alertBoundAreaItems.push(new AlertBound(startItem.timestamp,
                      nextItem.avg ? nextItem.timestamp : currentItem.timestamp, threshold));
                    break;
                  }
                }
              });

              /// means the last piece data is all above threshold, use last data point
              if (alertBoundAreaItems.length === (startPoints.length - 1)) {
                alertBoundAreaItems.push(new AlertBound(chartData[startPoints[startPoints.length - 1]].timestamp,
                  chartData[chartData.length - 1].timestamp, threshold));
              }

              return alertBoundAreaItems
            }

            startPoints = findStartPoints(chartData, threshold);

            alertBoundAreaItems = findEndPointsForStartPointIndex(startPoints, threshold);

            return alertBoundAreaItems;

          }

          function createAlertBoundsArea(alertBounds:AlertBound[]) {
            svg.selectAll('rect.alert')
              .data(alertBounds)
              .enter().append('rect')
              .attr('class', 'alertBounds')
              .attr('x', (d:AlertBound) => {
                return timeScale(d.startTimestamp);
              })
              .attr('y', () => {
                return yScale(highBound);
              })
              .attr('height', (d:AlertBound) => {
                ///@todo: make the height adjustable
                return 185;
                //return yScale(0) - height;
              })
              .attr('width', (d:AlertBound) => {
                return timeScale(d.endTimestamp) - timeScale(d.startTimestamp);
              });

          }

          function createXAxisBrush() {

            brush = d3.svg.brush()
              .x(timeScale)
              .on('brushstart', brushStart)
              .on('brushend', brushEnd);

            brushGroup = svg.append('g')
              .attr('class', 'brush')
              .call(brush);

            brushGroup.selectAll('.resize').append('path');

            brushGroup.selectAll('rect')
              .attr('height', height);

            function brushStart() {
              svg.classed('selecting', true);
            }

            function brushEnd() {
              let extent = brush.extent(),
                startTime = Math.round(extent[0].getTime()),
                endTime = Math.round(extent[1].getTime()),
                dragSelectionDelta = endTime - startTime;

              svg.classed('selecting', !d3.event.target.empty());
              // ignore range selections less than 1 minute
              if (dragSelectionDelta >= 60000) {
                scope.$emit(EventNames.CHART_TIMERANGE_CHANGED, extent);
              }
            }

          }

          function createPreviousRangeOverlay(prevRangeData) {
            if (prevRangeData) {
              svg.append('path')
                .datum(prevRangeData)
                .attr('class', 'prevRangeAvgLine')
                .style('stroke-dasharray', ('9,3'))
                .attr('d', createCenteredLine('linear'));
            }

          }

          function createMultiMetricOverlay() {
            let colorScale = d3.scale.category20();

            if (multiChartOverlayData) {
              $log.log('Running MultiChartOverlay for %i metrics', multiChartOverlayData.length);

              multiChartOverlayData.forEach((singleChartData) => {

                svg.append('path')
                  .datum(singleChartData)
                  .attr('class', 'multiLine')
                  .attr('fill', (d, i) => {
                    return colorScale(i);
                  })
                  .attr('stroke', (d, i) => {
                    return colorScale(i);
                  })
                  .attr('stroke-width', '1')
                  .attr('stroke-opacity', '.8')
                  .attr('d', createCenteredLine('linear'));
              });
            }

          }


          function annotateChart(annotationData) {
            if (annotationData) {
              svg.selectAll('.annotationDot')
                .data(annotationData)
                .enter().append('circle')
                .attr('class', 'annotationDot')
                .attr('r', 5)
                .attr('cx', (d) => {
                  return timeScale(d.timestamp);
                })
                .attr('cy', () => {
                  return height - yScale(highBound);
                })
                .style('fill', (d) => {
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

          function createDataPoints(dataPoints:IChartDataPoint[]) {
            let radius = 1;
            svg.selectAll('.dataPointDot')
              .data(dataPoints)
              .enter().append('circle')
              .attr('class', 'dataPointDot')
              .attr('r', radius)
              .attr('cx', function (d) {
                return timeScale(d.timestamp);
              })
              .attr('cy', function (d) {
                return d.avg ? yScale(d.avg) : -9999999;
              }).on('mouseover', function (d, i) {
                tip.show(d, i);
              }).on('mouseout', function () {
                tip.hide();
              });
          }

          scope.$watchCollection('data', (newData) => {
            if (newData) {
              processedNewData = angular.fromJson(newData);
              scope.render(processedNewData, processedPreviousRangeData);
            }
          } );

          scope.$watch('multiData', (newMultiData) => {
            if (newMultiData) {
              multiDataPoints = angular.fromJson(newMultiData);
              scope.render(processedNewData, processedPreviousRangeData);
            }
          }, true);


          scope.$watch('previousRangeData', (newPreviousRangeValues) => {
            if (newPreviousRangeValues) {
              //$log.debug('Previous Range data changed');
              processedPreviousRangeData = angular.fromJson(newPreviousRangeValues);
              scope.render(processedNewData, processedPreviousRangeData);
            }
          }, true);

          scope.$watch('annotationData', (newAnnotationData) => {
            if (newAnnotationData) {
              annotationData = angular.fromJson(newAnnotationData);
              scope.render(processedNewData, processedPreviousRangeData);
            }
          }, true);


          scope.$watch('contextData', (newContextData) => {
            if (newContextData) {
              contextData = angular.fromJson(newContextData);
              scope.render(processedNewData, processedPreviousRangeData);
            }
          }, true);

          scope.$on('MultiChartOverlayDataChanged', (event, newMultiChartData) => {
            $log.log('Handling MultiChartOverlayDataChanged in Chart Directive');
            if (newMultiChartData) {
              multiChartOverlayData = angular.fromJson(newMultiChartData);
            } else {
              // same event is sent with no data to clear it
              multiChartOverlayData = [];
            }
            scope.render(processedNewData, processedPreviousRangeData);
          });

          scope.$watchGroup(['alertValue', 'chartType', 'hideHighLowValues', 'useZeroMinValue', 'showAvgLine'],
            (chartAttrs) => {
              alertValue = chartAttrs[0] || alertValue;
              chartType = chartAttrs[1] || chartType;
              hideHighLowValues = chartAttrs[2] || hideHighLowValues;
              useZeroMinValue = chartAttrs[3] || useZeroMinValue;
              showAvgLine = chartAttrs[4] || showAvgLine;
              scope.render(processedNewData, processedPreviousRangeData);
            });


          function loadStandAloneMetricsTimeRangeFromNow() {
            endTimestamp = Date.now();
            startTimestamp = moment().subtract(timeRangeInSeconds, 'seconds').valueOf();
            loadStandAloneMetricsForTimeRange(dataUrl, metricId, startTimestamp, endTimestamp, 60);
          }

          /// standalone charts attributes
          scope.$watchGroup(['metricUrl', 'metricId', 'metricType', 'metricTenantId', 'timeRangeInSeconds'],
            (standAloneParams) => {
              dataUrl = standAloneParams[0] || dataUrl;
              metricId = standAloneParams[1] || metricId;
              metricType = standAloneParams[2] || metricId;
              metricTenantId = standAloneParams[3] || metricTenantId;
              timeRangeInSeconds = standAloneParams[4] || timeRangeInSeconds;
              loadStandAloneMetricsTimeRangeFromNow();
            });

          scope.$watch('refreshIntervalInSeconds', (newRefreshInterval) => {
            if (newRefreshInterval) {
              refreshIntervalInSeconds = +newRefreshInterval;
              $interval.cancel(startIntervalPromise);
              startIntervalPromise = $interval(() => {
                loadStandAloneMetricsTimeRangeFromNow();
              }, refreshIntervalInSeconds * 1000);
            }
          });

          scope.$on('$destroy', () => {
            $interval.cancel(startIntervalPromise);
          });

          scope.$on('DateRangeDragChanged', (event, extent) => {
            scope.$emit('GraphTimeRangeChangedEvent', extent);
          });


          function determineChartType(chartType:string) {
            switch (chartType) {
              case 'rhqbar' :
                createRhqStackedBars(lowBound, highBound);
                break;
              case 'histogram' :
                createHistogramChart();
                break;
              case 'hawkularline' :
                createHawkularLineChart();
                break;
              case 'hawkularmetric' :
                createHawkularMetricChart();
                break;
              case 'multiline' :
                createMultiLineChart(multiDataPoints);
                break;
              case 'area' :
                createAreaChart();
                break;
              case 'scatter' :
                createScatterChart();
                break;
              case 'scatterline' :
                createScatterLineChart();
                break;
              default:
                $log.warn('chart-type is not valid. Must be in' +
                  ' [rhqbar,histogram,area,line,scatter,histogram,hawkularline,hawkularmetric] chart type: ' + chartType);

            }
          }

          scope.render = (dataPoints, previousRangeDataPoints) => {
            debug && console.group('Render Chart');
            debug && console.time('chartRender');
            //NOTE: layering order is important!
            initialization();
            if (dataPoints) {
              determineScale(dataPoints);
            }

            if (multiDataPoints) {
              determineMultiScale(multiDataPoints);
            }

            ///createHeader(attrs.chartTitle);

            if (alertValue && (alertValue > lowBound && alertValue < highBound)) {
              createAlertBoundsArea(extractAlertRanges(chartData, alertValue));
            }
            createXAxisBrush();

            determineChartType(chartType);
            if (showDataPoints) {
              createDataPoints(chartData);
            }
            createYAxisGridLines();
            createPreviousRangeOverlay(previousRangeDataPoints);
            createMultiMetricOverlay();
            createXandYAxes();
            if (showAvgLine) {
              createAvgLines();
            }

            if (alertValue && (alertValue > lowBound && alertValue < highBound)) {
              /// NOTE: this alert line has higher precedence from alert area above
              createAlertLine(alertValue);
            }

            if (annotationData) {
              annotateChart(annotationData);
            }
            debug && console.timeEnd('chartRender');
            debug && console.groupEnd('Render Chart');
          };
        }

        return {
          link: link,
          restrict: 'E',
          replace: true,
          scope: {
            data: '=',
            multiData: '=',
            metricUrl: '@',
            metricId: '@',
            metricType: '@',
            metricTenantId: '@',
            startTimestamp: '@',
            endTimestamp: '@',
            timeRangeInSeconds: '@',
            refreshIntervalInSeconds: '@',
            previousRangeData: '@',
            annotationData: '@',
            contextData: '@',
            showDataPoints: '@',
            alertValue: '@',
            interpolation: '@',
            multiChartOverlayData: '@',
            chartHeight: '@',
            chartType: '@',
            yAxisUnits: '@',
            useZeroMinValue: '@',
            buttonbarDatetimeFormat: '@',
            timeLabel: '@',
            dateLabel: '@',
            chartHoverDateFormat: '@',
            chartHoverTimeFormat: '@',
            singleValueLabel: '@',
            noDataLabel: '@',
            aggregateLabel: '@',
            startLabel: '@',
            endLabel: '@',
            durationLabel: '@',
            minLabel: '@',
            maxLabel: '@',
            avgLabel: '@',
            timestampLabel: '@',
            showAvgLine: '@',
            hideHighLowValues: '@',
            chartTitle: '@'
          }
        };
      }

    ]
  )
  ;
}
