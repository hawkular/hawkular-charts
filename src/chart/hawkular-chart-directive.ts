/// <reference path="../../vendor/vendor.d.ts" />

module Charts {
  'use strict';

  declare var d3:any;
  declare var numeral:any;
  declare var console:any;

  export interface IContextChartDataPoint {
    timestamp: number;
    start?: number;
    end?: number;
    value?: any; /// Only for Raw data (no buckets or aggregates)
    avg: number; /// most of the time this is the useful value
    empty: boolean; /// will show up in the chart as blank - set this when you have NaN
  }

  export type AlertThreshold = number;
  export type TimeInMillis = number;

   class AlertBound {
     public startDate:Date;
     public endDate:Date;

    constructor(public startTimestamp, public endTimestamp:number, public alertValue:number)
    {
      this.startDate = new Date(startTimestamp);
      this.endDate = new Date(endTimestamp);
    }

  }

  export interface IMultiDataPoint {
    key: string;
    color?: string; /// #fffeee
    values: IChartDataPoint[];
  }

  export interface IChartDataPoint extends IContextChartDataPoint {
    date: Date;
    min: number;
    max: number;
    percentile95th: number;
    median: number;
  }

  /**
   * @ngdoc directive
   * @name hawkularChart
   * @description A d3 based charting direction to provide charting using various styles of charts.
   *
   */
  angular.module('hawkular.charts')
    .directive('hawkularChart', ['$rootScope', '$http', '$interval', '$log',
      function ($rootScope:ng.IRootScopeService, $http:ng.IHttpService, $interval:ng.IIntervalService, $log:ng.ILogService):ng.IDirective {

      /// only for the stand alone charts
      var BASE_URL = '/hawkular/metrics';

      function link(scope, element, attrs) {

        // data specific vars
        var dataPoints:IChartDataPoint[] = [],
          multiDataPoints:IMultiDataPoint[],
          dataUrl = attrs.metricUrl,
          metricId = attrs.metricId || '',
          timeRangeInSeconds = +attrs.timeRangeInSeconds || 43200,
          refreshIntervalInSeconds = +attrs.refreshIntervalInSeconds || 3600,
          alertValue = +attrs.alertValue,
          interpolation = attrs.interpolation || 'monotone',
          endTimestamp = Date.now(),
          startTimestamp = endTimestamp - timeRangeInSeconds,
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
        var margin = {top: 10, right: 5, bottom: 5, left: 90},
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

        function xMidPointStartPosition(d) {
          return timeScale(d.timestamp) + (calcBarWidth() / 2);
        }

        function getChartWidth():number {
          //return angular.element("#" + chartContext.chartHandle).width();
          return 760;
        }

        function useSmallCharts():boolean {
          return getChartWidth() <= smallChartThresholdInPixels;
        }


        function oneTimeChartSetup():void {
          $log.info("Charts: OneTimeChartSetup");
          // destroy any previous charts
          if (chart) {
            chartParent.selectAll('*').remove();
          }
          chartParent = d3.select(element[0]);
          chart = chartParent.append("svg");

          createSvgDefs(chart);

          tip = d3.tip()
            .attr('class', 'd3-tip')
            .offset([-10, 0])
            .html((d, i) => {
              return buildHover(d, i);
            });

          svg = chart.append("g")
            .attr("width", width + margin.left + margin.right)
            .attr("height", innerChartHeight)
            .attr("transform", "translate(" + margin.left + "," + (adjustedChartHeight2) + ")");


          svg.call(tip);

        }


        function setupFilteredData(dataPoints:IChartDataPoint[]):void {
          var alertPeak:number,
              highPeak:number;

          function determineMultiMetricMinMax() {
            var currentMax:number,
              currentMin:number,
              seriesMax:number,
              seriesMin:number,
              maxList = [],
              minList = [];

            angular.forEach(multiChartOverlayData, (series) => {
              currentMax = d3.max(series.map((d) => {
                return !d.empty ? d.avg : 0;
              }));
              maxList.push(currentMax);
              currentMin = d3.min(series.map((d) => {
                return !d.empty ? d.avg : Number.MAX_VALUE;
              }));
              minList.push(currentMin);

            });
            seriesMax = d3.max(maxList);
            seriesMin = d3.min(minList);
            return [seriesMin, seriesMax];
          }


          if (multiChartOverlayData) {
            var minMax = determineMultiMetricMinMax();
            peak = minMax[1];
            min = minMax[0];
          }

          if(dataPoints){
            peak = d3.max(dataPoints.map((d) => {
              return !d.empty ? d.max : 0;
            }));

            min = d3.min(dataPoints.map((d)  => {
              return !d.empty ? d.min : undefined;
            }));
          }

          lowBound = useZeroMinValue ? 0 : min - (min * 0.05);
          if (alertValue) {
            alertPeak =  (alertValue  * 1.2);
            highPeak = peak + ((peak - min) * 0.2);
            highBound =  alertPeak > highPeak ? alertPeak : highPeak;
          } else {
            highBound = peak + ((peak - min) * 0.2);
          }
        }

        function determineScale(dataPoints) {
          var xTicks, xTickSubDivide, numberOfBarsForSmallGraph = 20;

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
              .tickSubdivide(1)
              .ticks(5)
              .tickSize(4, 4, 0)
              .orient("left");

            timeScale = d3.time.scale()
              .range([0, width])
              .domain(d3.extent(chartData, (d:IChartDataPoint) => { return d.timestamp; }));

            if (contextData) {
              timeScaleForContext = d3.time.scale()
                .range([0, width])
                .domain(d3.extent(contextData, (d:IChartDataPoint) => { return d.timestamp; }));
            } else {
              timeScaleForBrush = d3.time.scale()
                .range([0, width])
                .domain(d3.extent(chartData, (d:IChartDataPoint) => { return d.timestamp; }));

            }

            xAxis = d3.svg.axis()
              .scale(timeScale)
              .ticks(xTicks)
              .tickFormat(d3.time.format("%H:%M"))
              .tickSubdivide(xTickSubDivide)
              .tickSize(4, 4, 0)
              .orient("bottom");

          }
        }


        function setupFilteredMultiData(multiDataPoints:IMultiDataPoint[]):any {
          var alertPeak:number,
            highPeak:number,
            highbound:number,
            lowbound:number;

          function determineMultiDataMinMax() {
            var currentMax:number,
              currentMin:number,
              seriesMax:number,
              seriesMin:number,
              maxList: number[] = [],
              minList: number[] = [];

            angular.forEach(multiDataPoints, (series) => {
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


          var minMax = determineMultiDataMinMax();
          peak = minMax[1];
          min = minMax[0];

          lowBound = useZeroMinValue ? 0 : min - (min * 0.05);
          if (alertValue) {
            alertPeak =  (alertValue  * 1.2);
            highPeak = peak + ((peak - min) * 0.2);
            highBound =  alertPeak > highPeak ? alertPeak : highPeak;
          } else {
            highBound = peak + ((peak - min) * 0.2);
          }

          return [lowBound, highBound];
        }


        function determineMultiScale(multiDataPoints) {
          var xTicks = 9,
            xTickSubDivide =5,
            firstDataArray;

          if (multiDataPoints) {

            firstDataArray = multiDataPoints[0].values;

            var lowHigh = setupFilteredMultiData(multiDataPoints);
            lowBound = lowHigh[0];
            highBound = lowHigh[1]

            yScale = d3.scale.linear()
              .clamp(true)
              .rangeRound([height, 0])
              .domain([lowBound, highBound]);

            yAxis = d3.svg.axis()
              .scale(yScale)
              .tickSubdivide(1)
              .ticks(5)
              .tickSize(4, 4, 0)
              .orient("left");


            timeScale = d3.time.scale()
              .range([0, width])
              .domain(d3.extent(firstDataArray, (d:IChartDataPoint) => { return d.timestamp; }));


            xAxis = d3.svg.axis()
              .scale(timeScale)
              .ticks(xTicks)
              .tickFormat(d3.time.format("%H:%M"))
              .tickSubdivide(xTickSubDivide)
              .tickSize(4, 4, 0)
              .orient("bottom");

          }
        }

        function getBaseUrl():string {
          var baseUrl = dataUrl || 'http://' + $rootScope.$storage.server.replace(/['"]+/g, '') + ':' + $rootScope.$storage.port + BASE_URL;
          return baseUrl;
        }


        function loadMetricsForTimeRange(url, metricId, startTimestamp, endTimestamp, buckets) {
          $log.info('-- Retrieving metrics data for urlData: ' + metricId);
          $log.info('-- Date Range: ' + new Date(startTimestamp) + ' - ' + new Date(endTimestamp));

          var numBuckets = buckets || 60,
            searchParams =
            {
              params: {
                start: startTimestamp,
                end: endTimestamp,
                buckets: numBuckets
              }
            };

          if (startTimestamp >= endTimestamp) {
            $log.warn('Start date was after end date');
          }

          $http.get(url + metricId, searchParams).success((response) => {

            processedNewData = formatBucketedChartOutput(response);
            ///console.info("DataPoints from standalone URL: ");
            ///console.table(processedNewData);
            scope.render(processedNewData, processedPreviousRangeData);

          }).error((reason, status) => {
            $log.error('Error Loading Chart Data:' + status + ", " + reason);
          });

        }

        function formatBucketedChartOutput(response) {
          //  The schema is different for bucketed output
          return response.map((point:IChartDataPoint) => {
            return {
              timestamp: point.timestamp,
              date: new Date(point.timestamp),
              value: !angular.isNumber(point.value) ? 0 : point.value,
              avg: (point.empty) ? 0 : point.avg,
              min: !angular.isNumber(point.min) ? 0 : point.min,
              max: !angular.isNumber(point.max) ? 0 : point.max,
              empty: point.empty
            };
          });
        }


        function isEmptyDataBar(d) {
          return d.empty;
        }

        function isRawMetric(d) {
          return d.value;
        }


        function buildHover(d, i) {
          var hover,
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
            hover = "<div class='chartHover'><small class='chartHoverLabel'>" + noDataLabel + "</small>" +
              "<div><small><span class='chartHoverLabel'>" + durationLabel + "</span><span>: </span><span class='chartHoverValue'>" + barDuration + "</span></small> </div>" +
              "<hr/>" +
              "<div><small><span class='chartHoverLabel'>" + timestampLabel + "</span><span>: </span><span class='chartHoverValue'>" + formattedDateTime + "</span></small></div></div>";
          } else {
            if (isRawMetric(d)) {
              // raw single value from raw table
              hover = "<div class='chartHover'><div><small><span class='chartHoverLabel'>" + timestampLabel + "</span><span>: </span><span class='chartHoverValue'>" + formattedDateTime + "</span></small></div>" +
                "<div><small><span class='chartHoverLabel'>" + durationLabel + "</span><span>: </span><span class='chartHoverValue'>" + barDuration + "</span></small> </div>" +
                "<hr/>" +
                "<div><small><span class='chartHoverLabel'>" + singleValueLabel + "</span><span>: </span><span class='chartHoverValue'>" + numeral(d.value).format('0,0.0') + "</span></small> </div></div> ";
            } else {
              // aggregate with min/avg/max
              hover = "<div class='chartHover'><div><small><span class='chartHoverLabel'>" + timestampLabel + "</span><span>: </span><span class='chartHoverValue'>" + formattedDateTime + "</span></small></div>" +
                "<div><small><span class='chartHoverLabel'>" + durationLabel + "</span><span>: </span><span class='chartHoverValue'>" + barDuration + "</span></small> </div>" +
                "<hr/>" +
                "<div><small><span class='chartHoverLabel'>" + maxLabel + "</span><span>: </span><span class='chartHoverValue'>" + numeral(d.max).format('0,0.0') + "</span></small> </div> " +
                "<div><small><span class='chartHoverLabel'>" + avgLabel + "</span><span>: </span><span class='chartHoverValue'>" + numeral(d.avg).format('0,0.0') + "</span></small> </div> " +
                "<div><small><span class='chartHoverLabel'>" + minLabel + "</span><span>: </span><span class='chartHoverValue'>" + numeral(d.min).format('0,0.0') + "</span></small> </div></div> ";
            }
          }
          return hover;

        }

        function createHeader(titleName) {
          var title = chart.append("g").append("rect")
            .attr("class", "title")
            .attr("x", 30)
            .attr("y", margin.top)
            .attr("height", titleHeight)
            .attr("width", width + 30 + margin.left)
            .attr("fill", "none");

          chart.append("text")
            .attr("class", "titleName")
            .attr("x", 40)
            .attr("y", 37)
            .text(titleName);

          return title;

        }

        function createSvgDefs(chart) {

          var defs = chart.append("defs");

          defs.append("pattern")
            .attr("id", "noDataStripes")
            .attr("patternUnits", "userSpaceOnUse")
            .attr("x", "0")
            .attr("y", "0")
            .attr("width", "6")
            .attr("height", "3")
            .append("path")
            .attr("d", "M 0 0 6 0")
            .attr("style", "stroke:#CCCCCC; fill:none;");

          defs.append("pattern")
            .attr("id", "unknownStripes")
            .attr("patternUnits", "userSpaceOnUse")
            .attr("x", "0")
            .attr("y", "0")
            .attr("width", "6")
            .attr("height", "3")
            .attr("style", "stroke:#2E9EC2; fill:none;")
            .append("path").attr("d", "M 0 0 6 0");

          defs.append("pattern")
            .attr("id", "downStripes")
            .attr("patternUnits", "userSpaceOnUse")
            .attr("x", "0")
            .attr("y", "0")
            .attr("width", "6")
            .attr("height", "3")
            .attr("style", "stroke:#ff8a9a; fill:none;")
            .append("path").attr("d", "M 0 0 6 0");

        }


        function createStackedBars(lowBound, highBound) {

          // The gray bars at the bottom leading up
          svg.selectAll("rect.leaderBar")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "leaderBar")
            .attr("x", (d) => {
              return timeScale(d.timestamp);
            })
            .attr("y", (d) => {
              if (!isEmptyDataBar(d)) {
                return yScale(d.min);
              }
              else {
                return 0;
              }
            })
            .attr("height", (d) => {
              if (isEmptyDataBar(d)) {
                return height - yScale(highBound);
              }
              else {
                return height - yScale(d.min);
              }
            })
            .attr("width", () => {
              return calcBarWidth();
            })

            .attr("opacity", ".6")
            .attr("fill", (d) => {
              if (isEmptyDataBar(d)) {
                return "url(#noDataStripes)";
              }
              else {
                return "#d3d3d6";
              }
            }).on("mouseover", (d, i) => {
              tip.show(d, i);
            }).on("mouseout", () => {
              tip.hide();
            });


          // upper portion representing avg to high
          svg.selectAll("rect.high")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "high")
            .attr("x", (d) => {
              return timeScale(d.timestamp);
            })
            .attr("y", (d) => {
              return isNaN(d.max) ? yScale(lowBound) : yScale(d.max);
            })
            .attr("height", (d) => {
              if (isEmptyDataBar(d)) {
                return 0;
              }
              else {
                return yScale(d.avg) - yScale(d.max);
              }
            })
            .attr("width", () => {
              return calcBarWidth();
            })
            .attr("data-rhq-value", (d) => {
              return d.max;
            })
            .attr("opacity", 0.9)
            .on("mouseover", (d, i) => {
              tip.show(d, i);
            }).on("mouseout", () => {
              tip.hide();
            });


          // lower portion representing avg to low
          svg.selectAll("rect.low")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "low")
            .attr("x", (d) => {
              return timeScale(d.timestamp);
            })
            .attr("y", (d) => {
              return isNaN(d.avg) ? height : yScale(d.avg);
            })
            .attr("height", (d) => {
              if (isEmptyDataBar(d)) {
                return 0;
              }
              else {
                return yScale(d.min) - yScale(d.avg);
              }
            })
            .attr("width", () => {
              return calcBarWidth();
            })
            .attr("opacity", 0.9)
            .attr("data-rhq-value", (d) => {
              return d.min;
            })
            .on("mouseover", (d, i) => {
              tip.show(d, i);
            }).on("mouseout", () => {
              tip.hide();
            });

          // if high == low put a "cap" on the bar to show raw value, non-aggregated bar
          svg.selectAll("rect.singleValue")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "singleValue")
            .attr("x", (d) => {
              return timeScale(d.timestamp);
            })
            .attr("y", (d) => {
              return isNaN(d.value) ? height : yScale(d.value) - 2;
            })
            .attr("height", (d) => {
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
            .attr("width", () => {
              return calcBarWidth();
            })
            .attr("opacity", 0.9)
            .attr("data-rhq-value", (d) => {
              return d.value;
            })
            .attr("fill", (d) => {
              if (d.min === d.max) {
                return "#50505a";
              }
              else {
                return "#70c4e2";
              }
            }).on("mouseover", (d, i) => {
              tip.show(d, i);
            }).on("mouseout", () => {
              tip.hide();
            });
        }

        function createCandleStickChart() {

          // upper portion representing avg to high
          svg.selectAll("rect.candlestick.up")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "candleStickUp")
            .attr("x", (d) => {
              return timeScale(d.timestamp);
            })
            .attr("y", (d) => {
              return isNaN(d.max) ? yScale(lowBound) : yScale(d.max);
            })
            .attr("height", (d) => {
              if (isEmptyDataBar(d)) {
                return 0;
              }
              else {
                return yScale(d.avg) - yScale(d.max);
              }
            })
            .attr("width", () => {
              return calcBarWidth();
            })
            .style("fill", (d, i) => {
              return fillCandleChart(d, i);
            })

            .on("mouseover", (d, i) => {
              tip.show(d, i);
            }).on("mouseout", () => {
              tip.hide();
            });


          // lower portion representing avg to low
          svg.selectAll("rect.candlestick.down")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "candleStickDown")
            .attr("x", (d) => {
              return timeScale(d.timestamp);
            })
            .attr("y", (d) => {
              return isNaN(d.avg) ? height : yScale(d.avg);
            })
            .attr("height", (d) => {
              if (isEmptyDataBar(d)) {
                return 0;
              }
              else {
                return yScale(d.min) - yScale(d.avg);
              }
            })
            .attr("width", () => {
              return calcBarWidth();
            })
            .attr("data-rhq-value", (d) => {
              return d.min;
            })
            .style("fill", (d, i) => {
              return fillCandleChart(d, i);
            })
            .on("mouseover", (d, i) => {
              tip.show(d, i);
            }).on("mouseout", () => {
              tip.hide();
            });

          function fillCandleChart(d, i) {
            if (i > 0 && chartData[i].avg > chartData[i - 1].avg) {
              return "green";
            } else if (i === 0) {
              return "none";
            } else {
              return "#ff0705";
            }
          }

        }


        function createHistogramChart() {
          var strokeOpacity = "0.6";

          // upper portion representing avg to high
          svg.selectAll("rect.histogram")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "histogram")
            .attr("x", (d) => {
              return timeScale(d.timestamp);
            })
            .attr("width", () => {
              return calcBarWidth();
            })
            .attr("y", (d) => {
              if (!isEmptyDataBar(d)) {
                return yScale(d.avg);
              }
              else {
                return 0;
              }
            })
            .attr("height", (d) => {
              if (isEmptyDataBar(d)) {
                return height - yScale(highBound);
              }
              else {
                return height - yScale(d.avg);
              }
            })
            .attr("fill", (d, i) => {
              if (isEmptyDataBar(d)) {
                return 'url(#noDataStripes)';
              }
              else if (i % 5 === 0) {
                return '#989898';
              }
              else {
                return '#C0C0C0';
              }
            })
            .attr("stroke", (d) => {
              return '#777';
            })
            .attr("stroke-width", (d) => {
              if (isEmptyDataBar(d)) {
                return '0';
              }
              else {
                return '0';
              }
            })
            .attr("data-rhq-value", (d) => {
              return d.avg;
            }).on("mouseover", (d, i) => {
              tip.show(d, i);
            }).on("mouseout", () => {
              tip.hide();
            });

          if (hideHighLowValues === false) {

            svg.selectAll(".histogram.top.stem")
              .data(chartData)
              .enter().append("line")
              .attr("class", "histogramTopStem")
              .attr("x1", (d) => {
                return xMidPointStartPosition(d);
              })
              .attr("x2", (d) => {
                return xMidPointStartPosition(d);
              })
              .attr("y1", (d) => {
                return yScale(d.max);
              })
              .attr("y2", (d) => {
                return yScale(d.avg);
              })
              .attr("stroke", (d) => {
                return "red";
              })
              .attr("stroke-opacity", (d) => {
                return strokeOpacity;
              });

            svg.selectAll(".histogram.bottom.stem")
              .data(chartData)
              .enter().append("line")
              .attr("class", "histogramBottomStem")
              .attr("x1", (d) => {
                return xMidPointStartPosition(d);
              })
              .attr("x2", (d)  => {
                return xMidPointStartPosition(d);
              })
              .attr("y1", (d) => {
                return yScale(d.avg);
              })
              .attr("y2", (d)  => {
                return yScale(d.min);
              })
              .attr("stroke", (d) => {
                return "red";
              }).attr("stroke-opacity", (d) => {
                return strokeOpacity;
              });

            svg.selectAll(".histogram.top.cross")
              .data(chartData)
              .enter().append("line")
              .attr("class", "histogramTopCross")
              .attr("x1", function (d) {
                return xMidPointStartPosition(d) - 3;
              })
              .attr("x2", function (d) {
                return xMidPointStartPosition(d) + 3;
              })
              .attr("y1", function (d) {
                return yScale(d.max);
              })
              .attr("y2", function (d) {
                return yScale(d.max);
              })
              .attr("stroke", function (d) {
                return "red";
              })
              .attr("stroke-width", function (d) {
                return "0.5";
              })
              .attr("stroke-opacity", function (d) {
                return strokeOpacity;
              });

            svg.selectAll(".histogram.bottom.cross")
              .data(chartData)
              .enter().append("line")
              .attr("class", "histogramBottomCross")
              .attr("x1", function (d) {
                return xMidPointStartPosition(d) - 3;
              })
              .attr("x2", function (d) {
                return xMidPointStartPosition(d) + 3;
              })
              .attr("y1", function (d) {
                return yScale(d.min);
              })
              .attr("y2", function (d) {
                return yScale(d.min);
              })
              .attr("stroke", function (d) {
                return "red";
              })
              .attr("stroke-width", function (d) {
                return "0.5";
              })
              .attr("stroke-opacity", function (d) {
                return strokeOpacity;
              });

          }

        }



        function createHawkularLineChart() {
          var chartLine = d3.svg.line()
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
          svg.append("path")
            .datum(chartData)
            .attr("class", "avgLine")
            .attr("d", chartLine);

        }


        function createHawkularMetricChart() {

          var metricChartLine = d3.svg.line()
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

          svg.append("path")
            .datum(chartData)
            .attr("class", "metricLine")
            .attr("d", metricChartLine);

        }

        function createMultiLineChart(multiDataPoints:IMultiDataPoint[]) {
          var colorScale = d3.scale.category10(),
            g = 0;

          if (multiDataPoints) {
            angular.forEach(multiDataPoints, (singleChartData) => {
              //$log.debug("Processing data for: "+singleChartData.key);
              //console.dir(singleChartData.values);
              svg.append("path")
                .datum(singleChartData.values)
                .attr("class", "multiLine")
                .attr("fill", "none")
                .attr("stroke", () => {
                  if(singleChartData.color){
                    return singleChartData.color;
                  }else {
                    return colorScale(g);
                  }
                })
                .attr("d", createLine("linear"));
              g++;

            });
          } else {
            $log.warn("No multi-data set for multiline chart");
          }

        }

        function createAreaChart() {
          var highArea = d3.svg.area()
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

            svg.append("path")
              .datum(chartData)
              .attr("class", "highArea")
              .attr("d", highArea);

            svg.append("path")
              .datum(chartData)
              .attr("class", "lowArea")
              .attr("d", lowArea);
          }

          svg.append("path")
            .datum(chartData)
            .attr("class", "avgArea")
            .attr("d", avgArea);

        }

        function createScatterChart() {
          if (hideHighLowValues === false) {

            svg.selectAll(".highDot")
              .data(chartData)
              .enter().append("circle")
              .attr("class", "highDot")
              .attr("r", 3)
              .attr("cx", function (d) {
                return xMidPointStartPosition(d);
              })
              .attr("cy", function (d) {
                return isRawMetric(d) ? yScale(d.value) : yScale(d.max);
              })
              .style("fill", function () {
                return "#ff1a13";
              }).on("mouseover", function (d, i) {
                tip.show(d, i);
              }).on("mouseout", function () {
                tip.hide();
              });


            svg.selectAll(".lowDot")
              .data(chartData)
              .enter().append("circle")
              .attr("class", "lowDot")
              .attr("r", 3)
              .attr("cx", function (d) {
                return xMidPointStartPosition(d);
              })
              .attr("cy", function (d) {
                return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
              })
              .style("fill", function () {
                return "#70c4e2";
              }).on("mouseover", function (d, i) {
                tip.show(d, i);
              }).on("mouseout", function () {
                tip.hide();
              });
          }

          svg.selectAll(".avgDot")
            .data(chartData)
            .enter().append("circle")
            .attr("class", "avgDot")
            .attr("r", 3)
            .attr("cx", function (d) {
              return xMidPointStartPosition(d);
            })
            .attr("cy", function (d) {
              return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
            })
            .style("fill", function () {
              return "#FFF";
            }).on("mouseover", function (d, i) {
              tip.show(d, i);
            }).on("mouseout", function () {
              tip.hide();
            });
        }

        function createScatterLineChart() {


          svg.selectAll(".scatterline.top.stem")
            .data(chartData)
            .enter().append("line")
            .attr("class", "scatterLineTopStem")
            .attr("x1", function (d) {
              return xMidPointStartPosition(d);
            })
            .attr("x2", function (d) {
              return xMidPointStartPosition(d);
            })
            .attr("y1", function (d) {
              return yScale(d.max);
            })
            .attr("y2", function (d) {
              return yScale(d.avg);
            })
            .attr("stroke", function (d) {
              return "#000";
            });

          svg.selectAll(".scatterline.bottom.stem")
            .data(chartData)
            .enter().append("line")
            .attr("class", "scatterLineBottomStem")
            .attr("x1", function (d) {
              return xMidPointStartPosition(d);
            })
            .attr("x2", function (d) {
              return xMidPointStartPosition(d);
            })
            .attr("y1", function (d) {
              return yScale(d.avg);
            })
            .attr("y2", function (d) {
              return yScale(d.min);
            })
            .attr("stroke", function (d) {
              return "#000";
            });

          svg.selectAll(".scatterline.top.cross")
            .data(chartData)
            .enter().append("line")
            .attr("class", "scatterLineTopCross")
            .attr("x1", function (d) {
              return xMidPointStartPosition(d) - 3;
            })
            .attr("x2", function (d) {
              return xMidPointStartPosition(d) + 3;
            })
            .attr("y1", function (d) {
              return yScale(d.max);
            })
            .attr("y2", function (d) {
              return yScale(d.max);
            })
            .attr("stroke", function (d) {
              return "#000";
            })
            .attr("stroke-width", function (d) {
              return "0.5";
            });

          svg.selectAll(".scatterline.bottom.cross")
            .data(chartData)
            .enter().append("line")
            .attr("class", "scatterLineBottomCross")
            .attr("x1", function (d) {
              return xMidPointStartPosition(d) - 3;
            })
            .attr("x2", function (d) {
              return xMidPointStartPosition(d) + 3;
            })
            .attr("y1", function (d) {
              return yScale(d.min);
            })
            .attr("y2", function (d) {
              return yScale(d.min);
            })
            .attr("stroke", function (d) {
              return "#000";
            })
            .attr("stroke-width", function (d) {
              return "0.5";
            });

          svg.selectAll(".scatterDot")
            .data(chartData)
            .enter().append("circle")
            .attr("class", "avgDot")
            .attr("r", 3)
            .attr("cx", function (d) {
              return xMidPointStartPosition(d);
            })
            .attr("cy", function (d) {
              return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
            })
            .style("fill", function () {
              return "#70c4e2";
            })
            .style("opacity", function () {
              return "1";
            }).on("mouseover", function (d, i) {
              tip.show(d, i);
            }).on("mouseout", function () {
              tip.hide();
            });


        }


        function createYAxisGridLines() {
          // create the y axis grid lines
          svg.append("g").classed("grid y_grid", true)
            .call(d3.svg.axis()
              .scale(yScale)
              .orient("left")
              .ticks(10)
              .tickSize(-width, 0, 0)
              .tickFormat("")
          );
        }

        function createXandYAxes() {
          var xAxisGroup;

          svg.selectAll('g.axis').remove();


          // create x-axis
          xAxisGroup = svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis);

          xAxisGroup.append("g")
            .attr("class", "x brush")
            .call(brush)
            .selectAll("rect")
            .attr("y", -6)
            .attr("height", 30);

          // create y-axis
          svg.append("g")
            .attr("class", "y axis")
            .call(yAxis)
            .append("text")
            .attr("transform", "rotate(-90),translate( -70,-40)")
            .attr("y", -30)
            .style("text-anchor", "end")
            .text(attrs.yAxisUnits === "NONE" ? "" : attrs.yAxisUnits);

        }

        function createCenteredLine(newInterpolation) {
          var interpolate = newInterpolation || 'monotone',
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
          var interpolate = newInterpolation || 'monotone',
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
          if(chartType === 'bar' || chartType === 'scatterline') {
            svg.append("path")
              .datum(chartData)
              .attr("class", "barAvgLine")
              .attr("d", createCenteredLine("monotone"));
          }
        }

        function createAlertLineDef(alertValue:number) {
          var line = d3.svg.line()
            .interpolate("monotone")
            .x((d) => {
              return timeScale(d.timestamp);
            })
            .y((d) => {
              return yScale(alertValue);
            });

          return line;
        }

        function createAlertLine(alertValue:number) {
          svg.append("path")
            .datum(chartData)
            .attr("class", "alertLine")
            .attr("d", createAlertLineDef(alertValue));
        }


        function extractAlertRanges(chartData:IChartDataPoint[], threshold:AlertThreshold):AlertBound[]{
          var alertBoundAreaItem:AlertBound;
          var alertBoundAreaItems:AlertBound[];
          var startPoints:number[] ;
          var firstChartPoint:IChartDataPoint = chartData[0];
          var lastChartPoint:IChartDataPoint = chartData[chartData.length - 1];

          function findStartPoints(chartData:IChartDataPoint[], threshold:AlertThreshold) {
            var startPoints = [];
            var prevItem:IChartDataPoint;

            chartData.forEach((chartItem:IChartDataPoint, i:number) => {
              if (i >= 1) {
                prevItem = chartData[i -1];
              }

              if (prevItem && prevItem.avg <= threshold && chartItem.avg > threshold) {
                startPoints.push(i);
              }
            });
            return startPoints;
          }

        function findEndPointsForStartPointIndex(startPoints:number[], threshold:AlertThreshold): AlertBound[] {
          var alertBoundAreaItems:AlertBound[] = [];
          var currentItem:IChartDataPoint;
          var nextItem:IChartDataPoint;
          var startItem:IChartDataPoint;

          startPoints.forEach((startPointIndex:number) => {
              startItem = chartData[startPointIndex];

              for (var j = startPointIndex; j < chartData.length - 1; j++) {
                currentItem = chartData[j];
                nextItem = chartData[j + 1];

                if (currentItem.avg > threshold && nextItem.avg <= threshold) {
                  if(startItem.timestamp === currentItem.timestamp){
                    /// case for when there is only one point above the threshold
                    alertBoundAreaItems.push(new AlertBound(startItem.timestamp, nextItem.timestamp, threshold))
                  }else {
                    alertBoundAreaItems.push(new AlertBound(startItem.timestamp, currentItem.timestamp, threshold))
                  }
                  break;
                }
              }
          });

          return alertBoundAreaItems
        }

          startPoints = findStartPoints(chartData, threshold);

          /// handle the case where first chart point is above threshold
          if(firstChartPoint.avg > threshold){
            startPoints.push(0);
          }

          alertBoundAreaItems = findEndPointsForStartPointIndex(startPoints, threshold);

          /// handle the case where last chart point is above threshold
          if(lastChartPoint.avg > threshold){
            for(var k = chartData.length - 1 ; k >= 1; k--){
              var currentItem =  chartData[k];
              var nextItem =  chartData[k - 1];

              if(currentItem.avg > threshold && nextItem.avg <= threshold){
                alertBoundAreaItems.push(new AlertBound(nextItem.timestamp, lastChartPoint.timestamp, threshold));
                break;
              }
            }
          }


          /// Handle special case where all items are above threshold
          var allItemsAboveThreshold = chartData.every((chartItem:IChartDataPoint) => {  return chartItem.avg > threshold});
          if( allItemsAboveThreshold){
            alertBoundAreaItem = new AlertBound(chartData[0].timestamp, chartData[chartData.length -1].timestamp, threshold);
            alertBoundAreaItems.push(alertBoundAreaItem);
          }

          return alertBoundAreaItems;

        }

        function createAlertBoundsArea(alertBounds:AlertBound[]) {
          svg.selectAll("rect.alert")
            .data(alertBounds)
            .enter().append("rect")
            .attr("class", "alertBounds")
            .attr("x", (d) => {
              return timeScale(d.startTimestamp);
            })
            .attr("y", (d) => {
              return yScale(highBound);
            })
            .attr("height", (d) => {
              ///@todo: make the height adjustable
              return 185;
              //return yScale(0) - height;
            })
            .attr("width", (d) => {
              return timeScale(d.endTimestamp) - timeScale(d.startTimestamp);
            });

        }

        function createXAxisBrush() {

          brush = d3.svg.brush()
            .x(timeScaleForBrush)
            .on("brushstart", brushStart)
            .on("brush", brushMove)
            .on("brushend", brushEnd);

          //brushGroup = svg.append("g")
          //    .attr("class", "brush")
          //    .call(brush);
          //
          //brushGroup.selectAll(".resize").append("path");
          //
          //brushGroup.selectAll("rect")
          //    .attr("height", height);

          function brushStart() {
            svg.classed("selecting", true);
          }

          function brushMove() {
            //useful for showing the daterange change dynamically while selecting
            var extent = brush.extent();
            scope.$emit('DateRangeMove', extent);
          }

          function brushEnd() {
            var extent = brush.extent(),
              startTime = Math.round(extent[0].getTime()),
              endTime = Math.round(extent[1].getTime()),
              dragSelectionDelta = endTime - startTime >= 60000;

            svg.classed("selecting", !d3.event.target.empty());
            // ignore range selections less than 1 minute
            if (dragSelectionDelta) {
              scope.$emit('DateRangeChanged', extent);
            }
          }

        }

        function createPreviousRangeOverlay(prevRangeData) {
          if (prevRangeData) {
            $log.debug("Running PreviousRangeOverlay");
            svg.append("path")
              .datum(prevRangeData)
              .attr("class", "prevRangeAvgLine")
              .style("stroke-dasharray", ("9,3"))
              .attr("d", createCenteredLine("linear"));
          }

        }

        function createMultiMetricOverlay() {
          var colorScale = d3.scale.category20();

          if (multiChartOverlayData) {
            $log.warn("Running MultiChartOverlay for %i metrics", multiChartOverlayData.length);

            angular.forEach(multiChartOverlayData, (singleChartData) => {

              svg.append("path")
                .datum(singleChartData)
                .attr("class", "multiLine")
                .attr("fill", (d, i) => {
                  return colorScale(i);
                })
                .attr("stroke", (d, i) => {
                  return colorScale(i);
                })
                .attr("stroke-width", "1")
                .attr("stroke-opacity", ".8")
                .attr("d", createCenteredLine("linear"));
            });
          }

        }



        function annotateChart(annotationData) {
          if (annotationData) {
            svg.selectAll(".annotationDot")
              .data(annotationData)
              .enter().append("circle")
              .attr("class", "annotationDot")
              .attr("r", 5)
              .attr("cx", (d) => {
                return timeScale(d.timestamp);
              })
              .attr("cy", () => {
                return height - yScale(highBound);
              })
              .style("fill", (d) => {
                if (d.severity === '1') {
                  return "red";
                } else if (d.severity === '2') {
                  return "yellow";
                } else {
                  return "white";
                }
              });
          }
        }

        function createDataPoints(dataPoints:IChartDataPoint[]) {
          var radius = 1;
          svg.selectAll(".dataPointDot")
            .data(dataPoints)
            .enter().append("circle")
            .attr("class", "dataPointDot")
            .attr("r", radius)
            .attr("cx", function (d) {
              return timeScale(d.timestamp);
            })
            .attr("cy", function (d) {
              return d.avg ? yScale(d.avg) : -9999999;
            }).on("mouseover", function (d, i) {
              tip.show(d, i);
            }).on("mouseout", function () {
              tip.hide();
            });
        }

        scope.$watch('data', (newData) => {
          if (newData) {
            $log.debug('Chart Data Changed');
            processedNewData = angular.fromJson(newData);
            scope.render(processedNewData, processedPreviousRangeData);
          }
        }, true);

        scope.$watch('multiData', (newMultiData) => {
          if (newMultiData) {
            $log.debug('MultiData Chart Data Changed');
            multiDataPoints = angular.fromJson(newMultiData);
            scope.render(processedNewData, processedPreviousRangeData);
          }
        }, true);


        scope.$watch('availData', (newAvailData) => {
          if (newAvailData) {
            $log.debug('Avail Data Changed');
            processedNewData = angular.fromJson(newAvailData);
            scope.render(processedNewData, processedPreviousRangeData);
          }
        }, true);

        scope.$watch('previousRangeData', (newPreviousRangeValues) => {
          if (newPreviousRangeValues) {
            $log.debug("Previous Range data changed");
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

        scope.$watch('alertValue', (newAlert) => {
          if (newAlert) {
            alertValue = newAlert;
            scope.render(processedNewData, processedPreviousRangeData);
          }
        });

        scope.$watch('chartType', (newChartType) => {
          if (newChartType) {
            chartType = newChartType;
            scope.render(processedNewData, processedPreviousRangeData);
          }
        });

        function loadMetricsTimeRangeFromNow() {
          endTimestamp = Date.now();
          startTimestamp = moment().subtract('seconds', timeRangeInSeconds).valueOf();
          loadMetricsForTimeRange(getBaseUrl(), metricId, startTimestamp, endTimestamp, 60);
        }

        scope.$watch('dataUrl', (newUrlData) => {
          if (newUrlData) {
            $log.debug('dataUrl has changed: ' + newUrlData);
            dataUrl = newUrlData;
          }
        });

        scope.$watch('metricId', (newMetricId) => {
          if (newMetricId) {
            $log.debug('metricId has changed: ' + newMetricId);
            metricId = newMetricId;
            loadMetricsTimeRangeFromNow();
          }
        });

        scope.$watch('refreshIntervalInSeconds', (newRefreshInterval) => {
          if (newRefreshInterval) {
            refreshIntervalInSeconds = +newRefreshInterval;
            var startIntervalPromise = $interval(() => {
              loadMetricsTimeRangeFromNow();
            }, refreshIntervalInSeconds * 1000);
          }
        });

        scope.$watch('timeRangeInSeconds', (newTimeRange) => {
          if (newTimeRange) {
            $log.debug("timeRangeInSeconds changed.");
            timeRangeInSeconds = newTimeRange;
          }
        });

        scope.$watch('showAvgLine', (newShowAvgLine) => {
          if (newShowAvgLine) {
            showAvgLine = newShowAvgLine;
            scope.render(processedNewData, processedPreviousRangeData);
          }
        });


        scope.$watch('hideHighLowValues', (newHideHighLowValues) => {
          if (newHideHighLowValues) {
            hideHighLowValues = newHideHighLowValues;
            scope.render(processedNewData, processedPreviousRangeData);
          }
        });

        scope.$watch('useZeroMinValue', (newUseZeroMinValue) => {
          if (newUseZeroMinValue) {
            useZeroMinValue = newUseZeroMinValue;
            scope.render(processedNewData, processedPreviousRangeData);
          }
        });

        scope.$on('DateRangeDragChanged', (event, extent) => {
          scope.$emit('GraphTimeRangeChangedEvent', extent);
        });


        function determineChartType(chartType:string) {
          switch (chartType) {
            case 'rhqbar' :
              createStackedBars(lowBound, highBound);
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
            case 'candlestick' :
              createCandleStickChart();
              break;
            default:
              $log.warn('chart-type is not valid. Must be in [bar,area,line,scatter,candlestick,histogram,hawkularline,hawkularmetric,availability]');

          }
        }

        scope.render = (dataPoints, previousRangeDataPoints) => {
          console.group('Render Chart');
          console.time('chartRender');
          //NOTE: layering order is important!
          oneTimeChartSetup();
          if (dataPoints) {
            determineScale(dataPoints);
          }

          if(multiDataPoints){
            determineMultiScale(multiDataPoints);
          }

          createHeader(attrs.chartTitle);
          createXAxisBrush();

          if (alertValue && (alertValue > lowBound && alertValue < highBound)) {
            createAlertBoundsArea(extractAlertRanges(chartData, alertValue));
          }

          createYAxisGridLines();
          determineChartType(chartType);
          if(showDataPoints){
            createDataPoints(chartData);
          }
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
          console.timeEnd('chartRender');
          console.groupEnd('Render Chart');
        };
      }

      return {
        link: link,
        restrict: 'EA',
        replace: true,
        scope: {
          data: '@',
          multiData: '@',
          availData: '@',
          metricUrl: '@',
          metricId: '@',
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
    }]
  );
}
