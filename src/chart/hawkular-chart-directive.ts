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
    keyHash?: string; // for using as valid html id
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

          const CHART_HEIGHT =  250,
            CHART_WIDTH = 750,
            HOVER_DATE_TIME_FORMAT = 'MM/DD/YYYY h:mm a';

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
            chartType = attrs.chartType || 'hawkularline',
            singleValueLabel = attrs.singleValueLabel || 'Raw Value',
            noDataLabel = attrs.noDataLabel || 'No Data',
            durationLabel = attrs.durationLabel || 'Interval',
            minLabel = attrs.minLabel || 'Min',
            maxLabel = attrs.maxLabel || 'Max',
            avgLabel = attrs.avgLabel || 'Avg',
            timestampLabel = attrs.timestampLabel || 'Timestamp',
            showAvgLine = true,
            showDataPoints = false,
            hideHighLowValues = false,
            useZeroMinValue = false;

          // chart specific vars
          let margin = {top: 10, right: 5, bottom: 5, left: 90},
            width = CHART_WIDTH - margin.left - margin.right,
            adjustedChartHeight = CHART_HEIGHT - 50,
            height = adjustedChartHeight - margin.top - margin.bottom,
            smallChartThresholdInPixels = 600,
            titleHeight = 30, titleSpace = 10,
            innerChartHeight = height + margin.top - titleHeight - titleSpace + margin.bottom,
            adjustedChartHeight2 = +titleHeight + titleSpace + margin.top,
            barOffset = 2,
            chartData,
            calcBarWidth,
            calcBarWidthAdjusted,
            calcBarXPos,
            yScale,
            timeScale,
            yAxis,
            xAxis,
            tip,
            brush,
            brushGroup,
            timeScaleForBrush,
            chart,
            chartParent,
            svg,
            lowBound,
            highBound,
            avg,
            peak,
            min,
            processedNewData,
            processedPreviousRangeData;

          let hasInit = false;

          dataPoints = attrs.data;
          showDataPoints = attrs.showDataPoints;
          previousRangeDataPoints = attrs.previousRangeData;
          annotationData = attrs.annotationData;

          let startIntervalPromise;

          function xMidPointStartPosition(d) {
            return timeScale(d.timestamp);
          }

          function getChartWidth():number {
            //return angular.element('#' + chartContext.chartHandle).width();
            return CHART_WIDTH;
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
              .attr('viewBox', '0 0 760 ' + (CHART_HEIGHT + 25)).attr('preserveAspectRatio', 'xMinYMin meet');

            createSvgDefs(chart);

            svg = chart.append('g')
              .attr('width', width + margin.left + margin.right)
              .attr('height', innerChartHeight)
              .attr('transform', 'translate(' + margin.left + ',' + (adjustedChartHeight2) + ')');

            tip = d3.tip()
              .attr('class', 'd3-tip')
              .offset([-10, 0])
              .html((d, i) => {
                return buildHover(d, i);
              });

            svg.call(tip);

            // a placeholder for the alerts
            svg.append('g').attr('class', 'alertHolder');

            hasInit = true;
          }


          function setupFilteredData(dataPoints:IChartDataPoint[]):void {
            let alertPeak:number,
              highPeak:number;

            if (dataPoints) {
              peak = d3.max(dataPoints.map((d) => {
                return !isEmptyDataPoint(d) ? (d.avg || d.value) : 0;
              }));

              min = d3.min(dataPoints.map((d)  => {
                return !isEmptyDataPoint(d) ? (d.avg || d.value) : undefined;
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
            let xTicks,  numberOfBarsForSmallGraph = 20;

            if (dataPoints.length > 0) {

              // if window is too small server up small chart
              if (useSmallCharts()) {
                width = 250;
                xTicks = 3;
                chartData = dataPoints.slice(dataPoints.length - numberOfBarsForSmallGraph, dataPoints.length);
              }
              else {
                //  we use the width already defined above
                xTicks = 9;
                chartData = dataPoints;
              }

              setupFilteredData(dataPoints);

              calcBarWidth = () => {
                return (width / chartData.length - barOffset);
              };

              // Calculates the bar width adjusted so that the first and last are half-width of the others
              // see https://issues.jboss.org/browse/HAWKULAR-809 for info on why this is needed
              calcBarWidthAdjusted = (i) => {
                return (i === 0  || i === chartData.length-1) ? calcBarWidth() / 2 : calcBarWidth();
              };

              // Calculates the bar X position. When using calcBarWidthAdjusted, it is required to push bars
              // other than the first half bar to the left, to make up for the first being just half width
              calcBarXPos = (d, i) => {
                return timeScale(d.timestamp) - (i === 0 ? 0 : calcBarWidth()/2);
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


              timeScaleForBrush = d3.time.scale()
                  .range([0, width])
                  .domain(d3.extent(chartData, (d:IChartDataPoint) => {
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


          function setupFilteredMultiData(multiDataPoints:IMultiDataPoint[]):any {
            let alertPeak:number,
              highPeak:number;

            function determineMultiDataMinMax() {
              let currentMax:number,
                currentMin:number,
                seriesMax:number,
                seriesMin:number,
                maxList:number[] = [],
                minList:number[] = [];

              multiDataPoints.forEach((series) => {
                currentMax = d3.max(series.values.map((d) => {
                  return isEmptyDataPoint(d) ? 0 : d.avg;
                }));
                maxList.push(currentMax);
                currentMin = d3.min(series.values.map((d) => {
                  return !isEmptyDataPoint(d) ? d.avg : Number.MAX_VALUE;
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
            const xTicks = 9;

            if (multiDataPoints && multiDataPoints[0] && multiDataPoints[0].values) {

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
                .domain([d3.min(multiDataPoints, (d) => d3.min(d.values, (p) => p.timestamp )),
                  d3.max(multiDataPoints, (d) => d3.max(d.values, (p) => p.timestamp))]);

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
           * An empty datapoint has 'empty' attribute set to true. Used to distinguish from real 0 values.
           * @param d
           * @returns {boolean}
           */
          function isEmptyDataPoint(d: IChartDataPoint): boolean {
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
              formattedDateTime = moment(d.timestamp).format(HOVER_DATE_TIME_FORMAT);

            if (i > 0) {
              prevTimestamp = chartData[i - 1].timestamp;
              barDuration = moment(currentTimestamp).from(moment(prevTimestamp), true);
            }

            if (isEmptyDataPoint(d)) {
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

          function createHistogramChart(stacked?: boolean) {

            let barClass = stacked ? 'leaderBar' : 'histogram';

            let rectHistogram = svg.selectAll('rect.' + barClass).data(chartData);
            // update existing
            rectHistogram.attr('class', barClass)
              .on('mouseover', (d, i) => {
                tip.show(d, i);
              }).on('mouseout', () => {
                tip.hide();
              })
              .transition()
              .attr('x', (d, i) => {
                return calcBarXPos(d, i);
              })
              .attr('width', (d, i) => {
                return calcBarWidthAdjusted(i);
              })
              .attr('y', (d) => {
                return isEmptyDataPoint(d) ? 0 : yScale(d.avg);
              })
              .attr('height', (d) => {
                return height - yScale(isEmptyDataPoint(d) ? yScale(highBound) : d.avg);
              })
              .attr('opacity', stacked ? '.6' : '1')
              .attr('fill', (d, i) => {
                return isEmptyDataPoint(d) ? 'url(#noDataStripes)' : (stacked ? '#D3D3D6' : '#C0C0C0');
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
            // add new ones
            rectHistogram.enter().append('rect')
              .on('mouseover', (d, i) => {
                tip.show(d, i);
              })
              .on('mouseout', () => {
                tip.hide();
              })
              .attr('class', barClass)
              .transition()
              .attr('x', (d, i) => {
                return calcBarXPos(d, i);
              })
              .attr('width', (d, i) => {
                return calcBarWidthAdjusted(i);
              })
              .attr('y', (d) => {
                return isEmptyDataPoint(d) ? 0 : yScale(d.avg);
              })
              .attr('height', (d) => {
                return height - yScale(isEmptyDataPoint(d) ? yScale(highBound) : d.avg);
              })
              .attr('opacity', stacked ? '.6' : '1')
              .attr('fill', (d, i) => {
                return isEmptyDataPoint(d) ? 'url(#noDataStripes)' : (stacked ? '#D3D3D6' : '#C0C0C0');
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
            // remove old ones
            rectHistogram.exit().remove();

            if (!hideHighLowValues) {
              createHistogramHighLowValues(stacked);
            }
            else {
              // we should hide high-low values.. or remove if existing
              svg.selectAll('.histogramTopStem, .histogramBottomStem, .histogramTopCross, .histogramBottomCross').
                remove();
            }

          }

          function createHistogramHighLowValues(stacked?: boolean) {
            if (stacked) {
              // upper portion representing avg to high
              let rectHigh = svg.selectAll('rect.high, rect.singleValue').data(chartData);
              // update existing
              rectHigh.attr('class', (d) => {
                  return d.min === d.max ? 'singleValue' : 'high';
                })
                .attr('x', (d, i) => {
                  return calcBarXPos(d, i);
                })
                .attr('y', (d) => {
                  return isNaN(d.max) ? yScale(lowBound) : yScale(d.max);
                })
                .attr('height', (d) => {
                  return isEmptyDataPoint(d) ? 0 : (yScale(d.avg) - yScale(d.max) || 2);
                })
                .attr('width', (d, i) => {
                  return calcBarWidthAdjusted(i);
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
              // add new ones
              rectHigh.enter().append('rect')
                .attr('class', (d) => {
                  return d.min === d.max ? 'singleValue' : 'high';
                })
                .attr('x', (d,i) => {
                  return calcBarXPos(d, i);
                })
                .attr('y', (d) => {
                  return isNaN(d.max) ? yScale(lowBound) : yScale(d.max);
                })
                .attr('height', (d) => {
                  return isEmptyDataPoint(d) ? 0 : (yScale(d.avg) - yScale(d.max) || 2);
                })
                .attr('width', (d, i) => {
                  return calcBarWidthAdjusted(i);
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
              // remove old ones
              rectHigh.exit().remove();


              // lower portion representing avg to low
              let rectLow = svg.selectAll('rect.low').data(chartData)
              // update existing
              rectLow.attr('class', 'low')
                .attr('x', (d, i) => {
                  return calcBarXPos(d, i);
                })
                .attr('y', (d) => {
                  return isNaN(d.avg) ? height : yScale(d.avg);
                })
                .attr('height', (d) => {
                  return isEmptyDataPoint(d) ? 0 : (yScale(d.min) - yScale(d.avg));
                })
                .attr('width', (d, i) => {
                  return calcBarWidthAdjusted(i);
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
              // add new ones
              rectLow.enter().append('rect')
                .attr('class', 'low')
                .attr('x', (d, i) => {
                  return calcBarXPos(d, i);
                })
                .attr('y', (d) => {
                  return isNaN(d.avg) ? height : yScale(d.avg);
                })
                .attr('height', (d) => {
                  return isEmptyDataPoint(d) ? 0 : (yScale(d.min) - yScale(d.avg));
                })
                .attr('width', (d, i) => {
                  return calcBarWidthAdjusted(i);
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
              // remove old ones
              rectLow.exit().remove();
            }
            else {
              let strokeOpacity = '0.6';

              let lineHistoHighStem = svg.selectAll('.histogramTopStem').data(chartData);
              // update existing
              lineHistoHighStem.attr('class', 'histogramTopStem')
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // add new ones
              lineHistoHighStem.enter().append('line')
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // remove old ones
              lineHistoHighStem.exit().remove();

              let lineHistoLowStem = svg.selectAll('.histogramBottomStem').data(chartData);
              // update existing
              lineHistoLowStem
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // add new ones
              lineHistoLowStem.enter().append('line')
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // remove old ones
              lineHistoLowStem.exit().remove();


              let lineHistoTopCross = svg.selectAll('.histogramTopCross').data(chartData);
              // update existing
              lineHistoTopCross
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // add new ones
              lineHistoTopCross.enter().append('line')
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // remove old ones
              lineHistoTopCross.exit().remove();

              let lineHistoBottomCross = svg.selectAll('.histogramBottomCross').data(chartData);
              // update existing
              lineHistoBottomCross
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // add new ones
              lineHistoBottomCross.enter().append('line')
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // remove old ones
              lineHistoBottomCross.exit().remove();
            }
          }

          function createHawkularMetricChart() {

            let metricChartLine = d3.svg.line()
              .interpolate(interpolation)
              .defined((d) => {
                return !isEmptyDataPoint(d);
              })
              .x((d) => {
                return timeScale(d.timestamp);
              })
              .y((d) => {
                return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
              });

            let pathMetric = svg.selectAll('path.metricLine').data([chartData]);
            // update existing
            pathMetric.attr('class', 'metricLine')
              .transition()
              .attr('d', metricChartLine);
            // add new ones
            pathMetric.enter().append('path')
              .attr('class', 'metricLine')
              .transition()
              .attr('d', metricChartLine);
            // remove old ones
            pathMetric.exit().remove();
          }

          function createMultiLineChart(multiDataPoints:IMultiDataPoint[]) {
            let colorScale = d3.scale.category10(),
              g = 0;

            if (multiDataPoints) {
              // before updating, let's remove those missing from datapoints (if any)
              svg.selectAll('path[id^=\'multiLine\']')[0].forEach((existingPath) => {
                let stillExists = false;
                multiDataPoints.forEach((singleChartData) => {
                  singleChartData.keyHash = singleChartData.keyHash || ('multiLine' + hashString(singleChartData.key));
                  if (existingPath.getAttribute('id') === singleChartData.keyHash) {
                    stillExists = true;
                  }
                });
                if (!stillExists) {
                  existingPath.remove();
                }
              });

              multiDataPoints.forEach((singleChartData) => {
                if (singleChartData && singleChartData.values) {
                  singleChartData.keyHash = singleChartData.keyHash || ('multiLine' + hashString(singleChartData.key));
                  let pathMultiLine = svg.selectAll('path#' + singleChartData.keyHash).data([singleChartData.values]);
                  // update existing
                  pathMultiLine.attr('id', singleChartData.keyHash)
                    .attr('class', 'multiLine')
                    .attr('fill', 'none')
                    .attr('stroke', () => {
                      return singleChartData.color || colorScale(g++);
                    })
                    .transition()
                    .attr('d', createLine('linear'));
                  // add new ones
                  pathMultiLine.enter().append('path')
                    .attr('id', singleChartData.keyHash)
                    .attr('class', 'multiLine')
                    .attr('fill', 'none')
                    .attr('stroke', () => {
                      if (singleChartData.color) {
                        return singleChartData.color;
                      } else {
                        return colorScale(g++);
                      }
                    })
                    .transition()
                    .attr('d', createLine('linear'));
                  // remove old ones
                  pathMultiLine.exit().remove();
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
                  return !isEmptyDataPoint(d);
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
                  return !isEmptyDataPoint(d);
                })
                .x((d) => {
                  return xMidPointStartPosition(d);
                })
                .y((d) => {
                  return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                }).
                y0((d) => {
                  return hideHighLowValues ? height : yScale(d.min);
                }),

              lowArea = d3.svg.area()
                .interpolate(interpolation)
                .defined((d) => {
                  return !isEmptyDataPoint(d);
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


            if (!hideHighLowValues) {
              let highAreaPath  = svg.selectAll('path.highArea').data([chartData]);
              // update existing
              highAreaPath.attr('class', 'highArea')
                .attr('d', highArea);
              // add new ones
              highAreaPath.enter().append('path')
                .attr('class', 'highArea')
                .attr('d', highArea);
              // remove old ones
              highAreaPath.exit().remove();

              let lowAreaPath  = svg.selectAll('path.lowArea').data([chartData]);
              // update existing
              lowAreaPath.attr('class', 'lowArea')
                .attr('d', lowArea);
              // add new ones
              lowAreaPath.enter().append('path')
                .attr('class', 'lowArea')
                .attr('d', lowArea);
              // remove old ones
              lowAreaPath.exit().remove();
            }

            let avgAreaPath  = svg.selectAll('path.avgArea').data([chartData]);
            // update existing
            avgAreaPath.attr('class', 'avgArea')
              .transition()
              .attr('d', avgArea);
            // add new ones
            avgAreaPath.enter().append('path')
              .attr('class', 'avgArea')
              .transition()
              .attr('d', avgArea);
            // remove old ones
            avgAreaPath.exit().remove();
          }

          function createScatterChart() {
            if (!hideHighLowValues) {

              let highDotCircle = svg.selectAll('.highDot').data(chartData);
              // update existing
              highDotCircle.attr('class', 'highDot')
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // add new ones
              highDotCircle.enter().append('circle')
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
              // add new ones
              lowDotCircle.enter().append('circle')
                .filter((d) => {
                  return !isEmptyDataPoint(d);
                })
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
            // add new ones
            avgDotCircle.enter().append('circle')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // remove old ones
            avgDotCircle.exit().remove();
          }

          function createScatterLineChart() {

            let lineScatterTopStem = svg.selectAll('.scatterLineTopStem').data(chartData);
            // update existing
            lineScatterTopStem.attr('class', 'scatterLineTopStem')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // add new ones
            lineScatterTopStem.enter().append('line')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // remove old ones
            lineScatterTopStem.exit().remove();

            let lineScatterBottomStem = svg.selectAll('.scatterLineBottomStem').data(chartData);
            // update existing
            lineScatterBottomStem.attr('class', 'scatterLineBottomStem')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // add new ones
            lineScatterBottomStem.enter().append('line')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // remove old ones
            lineScatterBottomStem.exit().remove();

            let lineScatterTopCross = svg.selectAll('.scatterLineTopCross').data(chartData);
            // update existing
            lineScatterTopCross.attr('class', 'scatterLineTopCross')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // add new ones
            lineScatterTopCross.enter().append('line')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // remove old ones
            lineScatterTopCross.exit().remove();

            let lineScatterBottomCross = svg.selectAll('.scatterLineBottomCross').data(chartData);
            // update existing
            lineScatterBottomCross.attr('class', 'scatterLineBottomCross')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // add new ones
            lineScatterBottomCross.enter().append('line')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // remove old ones
            lineScatterBottomCross.exit().remove();

            let circleScatterDot = svg.selectAll('.scatterDot').data(chartData);
            // update existing
            circleScatterDot.attr('class', 'scatterDot')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
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
            // add new ones
            circleScatterDot.enter().append('circle')
              .filter((d) => {
                return !isEmptyDataPoint(d);
              })
              .attr('class', 'scatterDot')
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
            // remove old ones
            circleScatterDot.exit().remove();
          }


          function createYAxisGridLines() {
            // create the y axis grid lines
            if (yScale) {
              let yAxis = svg.selectAll('g.grid.y_grid');
              if (!yAxis[0].length) {
                yAxis = svg.append('g').classed('grid y_grid', true);
              }
              yAxis
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
                .attr('x',-CHART_HEIGHT/2)
                .style('text-anchor', 'start')
                .text(attrs.yAxisUnits === 'NONE' ? '' : attrs.yAxisUnits);
            }

          }

          function createCenteredLine(newInterpolation) {
            let interpolate = newInterpolation || 'monotone',
              line = d3.svg.line()
                .interpolate(interpolate)
                .defined((d) => {
                  return !isEmptyDataPoint(d);
                })
                .x((d) => {
                  return timeScale(d.timestamp);
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
                  return !isEmptyDataPoint(d);
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
              let pathAvgLine = svg.selectAll('.barAvgLine').data([chartData]);
              // update existing
              pathAvgLine.attr('class', 'barAvgLine')
                .attr('d', createCenteredLine('monotone'));
              // add new ones
              pathAvgLine.enter().append('path')
                .attr('class', 'barAvgLine')
                .attr('d', createCenteredLine('monotone'));
              // remove old ones
              pathAvgLine.exit().remove();
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
            let pathAlertLine  = svg.selectAll('path.alertLine').data([chartData]);
            // update existing
            pathAlertLine.attr('class', 'alertLine')
              .attr('d', createAlertLineDef(alertValue));
            // add new ones
            pathAlertLine.enter().append('path')
              .attr('class', 'alertLine')
              .attr('d', createAlertLineDef(alertValue));
            // remove old ones
            pathAlertLine.exit().remove();
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
            let rectAlert = svg.select('g.alertHolder').selectAll('rect.alertBounds').data(alertBounds);
            // update existing
            rectAlert.attr('class', 'alertBounds')
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
            // add new ones
            rectAlert.enter().append('rect')
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
            // remove old ones
            rectAlert.exit().remove();
          }

          function createXAxisBrush() {

            brushGroup = svg.selectAll('g.brush')
            if (brushGroup.empty()) {
              brushGroup = svg.append('g').attr('class', 'brush');
            }

            brush = d3.svg.brush()
              .x(timeScale)
              .on('brushstart', brushStart)
              .on('brushend', brushEnd);

            brushGroup.call(brush);

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
                $rootScope.$broadcast(EventNames.CHART_TIMERANGE_CHANGED.toString(), extent);
              }
              // clear the brush selection
              brushGroup.call(brush.clear());
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
            let dotDatapoint = svg.selectAll('.dataPointDot').data(dataPoints);
            // update existing
            dotDatapoint.attr('class', 'dataPointDot')
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
            // add new ones
            dotDatapoint.enter().append('circle')
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
            // remove old ones
            dotDatapoint.exit().remove();
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

          scope.$watchGroup(['alertValue', 'chartType', 'hideHighLowValues', 'useZeroMinValue', 'showAvgLine'],
            (chartAttrs) => {
              alertValue = chartAttrs[0] || alertValue;
              chartType = chartAttrs[1] || chartType;
              hideHighLowValues = (typeof chartAttrs[2] !== 'undefined') ? chartAttrs[2] : hideHighLowValues;
              useZeroMinValue = (typeof chartAttrs[3] !== 'undefined') ? chartAttrs[3] : useZeroMinValue;
              showAvgLine = (typeof chartAttrs[4] !== 'undefined') ? chartAttrs[4] : showAvgLine;
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
                createHistogramChart(true);
                break;
              case 'histogram' :
                createHistogramChart(false);
                break;
              case 'line':
                createHawkularMetricChart();
                break;
              case 'hawkularmetric':
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
                  ' [rhqbar,area,multiline,scatter,scatterline,histogram] chart type: ' + chartType);

            }
          }

          // adapted from http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
          function hashString(str: string): number {
            let hash = 0, i, chr, len;
            if (str.length == 0) return hash;
            for (i = 0, len = str.length; i < len; i++) {
              chr   = str.charCodeAt(i);
              hash  = ((hash << 5) - hash) + chr;
              hash |= 0; // Convert to 32bit integer
            }
            return hash;
          }

          scope.render = (dataPoints, previousRangeDataPoints) => {
            // if we don't have data, don't bother..
            if (!dataPoints && !multiDataPoints) {
              return;
            }

            debug && console.group('Render Chart');
            debug && console.time('chartRender');
            //NOTE: layering order is important!
            if (!hasInit) {
              initialization();
            }
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

            createYAxisGridLines();
            determineChartType(chartType);
            if (showDataPoints) {
              createDataPoints(chartData);
            }
            createPreviousRangeOverlay(previousRangeDataPoints);
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
            showDataPoints: '=',
            alertValue: '@',
            interpolation: '@',
            chartType: '@',
            yAxisUnits: '@',
            useZeroMinValue: '=',
            chartHoverDateFormat: '@',
            chartHoverTimeFormat: '@',
            singleValueLabel: '@',
            noDataLabel: '@',
            durationLabel: '@',
            minLabel: '@',
            maxLabel: '@',
            avgLabel: '@',
            timestampLabel: '@',
            showAvgLine: '=',
            hideHighLowValues: '='
          }
        };
      }

    ]
  )
  ;
}
