/**
 * @name  hawkular-charts
 *
 * @description
 *   Base module for rhq-metrics-charts.
 *
 */
angular.module('hawkular.charts', []);

/// <reference path="../../vendor/vendor.d.ts" />
var Charts;
(function (Charts) {
    'use strict';
    var TransformedAvailDataPoint = (function () {
        function TransformedAvailDataPoint(start, end, value, startDate, endDate, duration, message) {
            this.start = start;
            this.end = end;
            this.value = value;
            this.startDate = startDate;
            this.endDate = endDate;
            this.duration = duration;
            this.message = message;
            this.duration = moment(end).from(moment(start), true);
            this.startDate = new Date(start);
            this.endDate = new Date(end);
        }
        return TransformedAvailDataPoint;
    })();
    Charts.TransformedAvailDataPoint = TransformedAvailDataPoint;
    /**
     * @ngdoc directive
     * @name availability-chart
     * @description A d3 based charting directive for charting availability.
     *
     */
    var hawkularCharts = angular.module('hawkular.charts')
        .directive('availabilityChart', function () {
        return new Charts.AvailabilityChartDirective();
    });
    var AvailabilityChartDirective = (function () {
        function AvailabilityChartDirective() {
            this.restrict = 'EA';
            this.replace = true;
            this.scope = {
                data: '@',
                startTimestamp: '@',
                endTimestamp: '@',
                chartHeight: '@',
                timeLabel: '@',
                dateLabel: '@',
                noDataLabel: '@',
                chartTitle: '@'
            };
            this.link = function (scope, element, attrs) {
                // data specific vars
                var dataPoints = [], startTimestamp = +attrs.startTimestamp, endTimestamp = +attrs.endTimestamp, transformedDataPoints, chartHeight = +attrs.chartHeight || 150, noDataLabel = attrs.noDataLabel || 'No Data';
                // chart specific vars
                var margin = { top: 10, right: 5, bottom: 5, left: 90 }, width = 750 - margin.left - margin.right, adjustedChartHeight = chartHeight - 50, height = adjustedChartHeight - margin.top - margin.bottom, titleHeight = 30, titleSpace = 10, innerChartHeight = height + margin.top - titleHeight - titleSpace, adjustedChartHeight2 = +titleHeight + titleSpace + margin.top, yScale, timeScale, yAxis, xAxis, brush, tip, timeScaleForBrush, chart, chartParent, svg;
                function getChartWidth() {
                    ///return angular.element("#" + chartContext.chartHandle).width();
                    return 760;
                }
                function buildAvailHover(d) {
                    return "<div class='chartHover'><div><small><span class='chartHoverLabel'>Status: </span><span>: </span><span class='chartHoverValue'>" + d.value.toUpperCase() + "</span></small></div>" +
                        "<div><small><span class='chartHoverLabel'>Duration</span><span>: </span><span class='chartHoverValue'>" + d.duration + "</span></small> </div>";
                }
                function oneTimeChartSetup() {
                    console.log("OneTimeChartSetup");
                    // destroy any previous charts
                    if (chart) {
                        chartParent.selectAll('*').remove();
                    }
                    chartParent = d3.select(element[0]);
                    chart = chartParent.append("svg");
                    tip = d3.tip()
                        .attr('class', 'd3-tip')
                        .offset([-10, 0])
                        .html(function (d) {
                        return buildAvailHover(d);
                    });
                    svg = chart.append("g")
                        .attr("width", width + margin.left + margin.right)
                        .attr("height", innerChartHeight)
                        .attr("transform", "translate(" + margin.left + "," + (adjustedChartHeight2) + ")");
                    svg.call(tip);
                }
                function determineAvailScale(dataPoints) {
                    var adjustedTimeRange = [];
                    var oneHourAgo = +moment().subtract('hours', 1);
                    if (dataPoints) {
                        // Data points only have the start
                        if (dataPoints.length > 1) {
                            adjustedTimeRange[0] = d3.min(dataPoints, function (d) {
                                return d.start;
                            });
                            // Provide "now" as end // TODO adjust to date range picker
                            adjustedTimeRange[1] = +moment();
                        }
                        else {
                            adjustedTimeRange = [+moment(), oneHourAgo]; // default to 1 hour same as graph
                        }
                        yScale = d3.scale.linear()
                            .clamp(true)
                            .rangeRound([innerChartHeight, 0])
                            .domain([0, 175]);
                        yAxis = d3.svg.axis()
                            .scale(yScale)
                            .ticks(0)
                            .tickSize(0, 0)
                            .orient("left");
                        timeScale = d3.time.scale()
                            .range([0, width])
                            .domain(adjustedTimeRange);
                        xAxis = d3.svg.axis()
                            .scale(timeScale)
                            .tickSize(-70, 0)
                            .orient("top");
                    }
                }
                function isUp(d) {
                    return d.value === 'up';
                }
                function isDown(d) {
                    return d.value === 'down';
                }
                function isUnknown(d) {
                    return d.value === 'unknown';
                }
                function formatTransformedDataPoints(inAvailData) {
                    var outputData = [];
                    var itemCount = inAvailData.length;
                    if (inAvailData && itemCount > 0 && inAvailData[0].timestamp) {
                        var now = new Date().getTime();
                        if (itemCount === 1) {
                            var availItem = inAvailData[0];
                            // we only have one item with start time. Assume unknown for the time before (last 1h) TODO adjust to time picker
                            outputData.push(new TransformedAvailDataPoint(now - 60 * 60 * 1000, availItem.timestamp, 'unknown'));
                            // and the determined value up until the end.
                            outputData.push(new TransformedAvailDataPoint(availItem.timestamp, now, availItem.value));
                        }
                        else {
                            var backwardsEndTime;
                            var i;
                            backwardsEndTime = now;
                            for (i = inAvailData.length; i > 0; i--) {
                                outputData.push(new TransformedAvailDataPoint(inAvailData[i - 1].timestamp, backwardsEndTime, inAvailData[i - 1].value));
                                backwardsEndTime = inAvailData[i - 1].timestamp;
                            }
                        }
                    }
                    return outputData;
                }
                function createSideYAxisLabels() {
                    svg.append("text")
                        .attr("class", "availUpLabel")
                        .attr("x", -10)
                        .attr("y", 25)
                        .style("font-family", "Arial, Verdana, sans-serif;")
                        .style("font-size", "12px")
                        .attr("fill", "#999")
                        .style("text-anchor", "end")
                        .text("Up");
                    svg.append("text")
                        .attr("class", "availDownLabel")
                        .attr("x", -10)
                        .attr("y", 55)
                        .style("font-family", "Arial, Verdana, sans-serif;")
                        .style("font-size", "12px")
                        .attr("fill", "#999")
                        .style("text-anchor", "end")
                        .text("Down");
                }
                function createAvailabilityChart(dataPoints) {
                    var xAxisMin = d3.min(dataPoints, function (d) {
                        return +d.start;
                    }), xAxisMax = d3.max(dataPoints, function (d) {
                        return +d.end;
                    });
                    var availTimeScale = d3.time.scale()
                        .range([0, width])
                        .domain([xAxisMin, xAxisMax]), yScale = d3.scale.linear()
                        .clamp(true)
                        .range([height, 0])
                        .domain([0, 4]), availXAxis = d3.svg.axis()
                        .scale(availTimeScale)
                        .ticks(8)
                        .tickSize(13, 0)
                        .orient("top");
                    function calcBarY(d) {
                        var offset;
                        if (isUp(d) || isUnknown(d)) {
                            offset = 0;
                        }
                        else {
                            offset = 35;
                        }
                        return height - yScale(0) + offset;
                    }
                    function calcBarHeight(d) {
                        var height;
                        if (isUnknown(d)) {
                            height = 15;
                        }
                        else {
                            height = 50;
                        }
                        return yScale(0) - height;
                    }
                    function calcBarFill(d) {
                        if (isUp(d)) {
                            return "#4AA544"; // green
                        }
                        else if (isUnknown(d)) {
                            return "#B5B5B5"; // gray
                        }
                        else {
                            return "#E52527"; // red
                        }
                    }
                    svg.selectAll("rect.availBars")
                        .data(dataPoints)
                        .enter().append("rect")
                        .attr("class", "availBars")
                        .attr("x", function (d) {
                        return availTimeScale(+d.start);
                    })
                        .attr("y", function (d) {
                        return calcBarY(d);
                    })
                        .attr("height", function (d) {
                        return calcBarHeight(d);
                    })
                        .attr("width", function (d) {
                        return availTimeScale(+d.end) - availTimeScale(+d.start);
                    })
                        .attr("fill", function (d) {
                        return calcBarFill(d);
                    })
                        .on("mouseover", function (d, i) {
                        tip.show(d, i);
                    }).on("mouseout", function () {
                        tip.hide();
                    });
                    // create x-axis
                    svg.append("g")
                        .attr("class", "x axis")
                        .call(availXAxis);
                    var bottomYAxisLine = d3.svg.line()
                        .x(function (d) {
                        return timeScale(d.start);
                    })
                        .y(function (d) {
                        return height - yScale(0) + 70;
                    });
                    svg.append("path")
                        .datum(dataPoints)
                        .attr("class", "availYAxisLine")
                        .attr("d", bottomYAxisLine);
                    createSideYAxisLabels();
                }
                function createXandYAxes() {
                    var xAxisGroup;
                    svg.selectAll('g.axis').remove();
                    // create x-axis
                    xAxisGroup = svg.append("g")
                        .attr("class", "x axis")
                        .call(xAxis);
                    //xAxisGroup.append("g")
                    //  .attr("class", "x brush")
                    //  .call(brush)
                    //  .selectAll("rect")
                    //  .attr("y", -6)
                    //  .attr("height", 30);
                    // create y-axis
                    svg.append("g")
                        .attr("class", "y axis")
                        .call(yAxis);
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
                        //scope.$emit('DateRangeMove', extent);
                    }
                    function brushEnd() {
                        var extent = brush.extent(), startTime = Math.round(extent[0].getTime()), endTime = Math.round(extent[1].getTime()), dragSelectionDelta = endTime - startTime >= 60000;
                        svg.classed("selecting", !d3.event.target.empty());
                        // ignore range selections less than 1 minute
                        if (dragSelectionDelta) {
                            scope.$emit('DateRangeChanged', extent);
                        }
                    }
                }
                scope.$watch('data', function (newData) {
                    console.debug('Avail Chart Data Changed');
                    if (newData) {
                        transformedDataPoints = formatTransformedDataPoints(angular.fromJson(newData));
                        console.dir(transformedDataPoints);
                        scope.render(transformedDataPoints);
                    }
                }, true);
                scope.$watch('startTimestamp', function (newStartTimestap) {
                    console.debug('Avail Chart Start Timestamp Changed');
                    if (newStartTimestap) {
                        startTimestamp = newStartTimestap;
                        scope.render(transformedDataPoints);
                    }
                }, false);
                scope.$watch('endTimestamp', function (newEndTimestap) {
                    console.debug('Avail Chart End Timestamp Changed');
                    if (newEndTimestap) {
                        endTimestamp = newEndTimestap;
                        scope.render(transformedDataPoints);
                    }
                }, false);
                scope.render = function (dataPoints) {
                    console.debug("Starting Avail Chart Directive Render");
                    console.group('Render Avail Chart');
                    if (dataPoints) {
                        console.time('availChartRender');
                        //NOTE: layering order is important!
                        console.dir(dataPoints);
                        oneTimeChartSetup();
                        determineAvailScale(dataPoints);
                        createXAxisBrush();
                        createAvailabilityChart(dataPoints);
                        createXandYAxes();
                        console.timeEnd('availChartRender');
                    }
                    console.groupEnd();
                };
            };
        }
        return AvailabilityChartDirective;
    })();
    Charts.AvailabilityChartDirective = AvailabilityChartDirective;
})(Charts || (Charts = {}));

/// <reference path="../../vendor/vendor.d.ts" />
var Charts;
(function (Charts) {
    'use strict';
    var AlertBound = (function () {
        function AlertBound(startTimestamp, endTimestamp, alertValue) {
            this.startTimestamp = startTimestamp;
            this.endTimestamp = endTimestamp;
            this.alertValue = alertValue;
            this.startDate = new Date(startTimestamp);
            this.endDate = new Date(endTimestamp);
        }
        return AlertBound;
    })();
    /**
     * @ngdoc directive
     * @name hawkularChart
     * @description A d3 based charting direction to provide charting using various styles of charts.
     *
     */
    angular.module('hawkular.charts')
        .directive('hawkularChart', ['$rootScope', '$http', '$interval', '$log',
        function ($rootScope, $http, $interval, $log) {
            /// only for the stand alone charts
            var BASE_URL = '/hawkular/metrics';
            function link(scope, element, attrs) {
                // data specific vars
                var dataPoints = [], multiDataPoints, dataUrl = attrs.metricUrl, metricId = attrs.metricId || '', metricTenantId = attrs.metricTenantId || '', metricType = attrs.metricType || 'gauge', timeRangeInSeconds = +attrs.timeRangeInSeconds || 43200, refreshIntervalInSeconds = +attrs.refreshIntervalInSeconds || 3600, alertValue = +attrs.alertValue, interpolation = attrs.interpolation || 'monotone', endTimestamp = Date.now(), startTimestamp = endTimestamp - timeRangeInSeconds, previousRangeDataPoints = [], annotationData = [], contextData = [], multiChartOverlayData = [], chartHeight = +attrs.chartHeight || 250, chartType = attrs.chartType || 'hawkularline', timeLabel = attrs.timeLabel || 'Time', dateLabel = attrs.dateLabel || 'Date', singleValueLabel = attrs.singleValueLabel || 'Raw Value', noDataLabel = attrs.noDataLabel || 'No Data', aggregateLabel = attrs.aggregateLabel || 'Aggregate', startLabel = attrs.startLabel || 'Start', endLabel = attrs.endLabel || 'End', durationLabel = attrs.durationLabel || 'Interval', minLabel = attrs.minLabel || 'Min', maxLabel = attrs.maxLabel || 'Max', avgLabel = attrs.avgLabel || 'Avg', timestampLabel = attrs.timestampLabel || 'Timestamp', showAvgLine = true, showDataPoints = false, hideHighLowValues = false, useZeroMinValue = false, chartHoverDateFormat = attrs.chartHoverDateFormat || '%m/%d/%y', chartHoverTimeFormat = attrs.chartHoverTimeFormat || '%I:%M:%S %p', buttonBarDateTimeFormat = attrs.buttonbarDatetimeFormat || 'MM/DD/YYYY h:mm a';
                // chart specific vars
                var margin = { top: 10, right: 5, bottom: 5, left: 90 }, contextMargin = { top: 150, right: 5, bottom: 5, left: 90 }, xAxisContextMargin = { top: 190, right: 5, bottom: 5, left: 90 }, width = 750 - margin.left - margin.right, adjustedChartHeight = chartHeight - 50, height = adjustedChartHeight - margin.top - margin.bottom, smallChartThresholdInPixels = 600, titleHeight = 30, titleSpace = 10, innerChartHeight = height + margin.top - titleHeight - titleSpace + margin.bottom, adjustedChartHeight2 = +titleHeight + titleSpace + margin.top, barOffset = 2, chartData, calcBarWidth, yScale, timeScale, yAxis, xAxis, tip, brush, brushGroup, timeScaleForBrush, timeScaleForContext, chart, chartParent, context, contextArea, svg, lowBound, highBound, avg, peak, min, processedNewData, processedPreviousRangeData;
                dataPoints = attrs.data;
                showDataPoints = attrs.showDataPoints;
                previousRangeDataPoints = attrs.previousRangeData;
                multiChartOverlayData = attrs.multiChartOverlayData;
                annotationData = attrs.annotationData;
                contextData = attrs.contextData;
                function xMidPointStartPosition(d) {
                    return timeScale(d.timestamp) + (calcBarWidth() / 2);
                }
                function getChartWidth() {
                    //return angular.element("#" + chartContext.chartHandle).width();
                    return 760;
                }
                function useSmallCharts() {
                    return getChartWidth() <= smallChartThresholdInPixels;
                }
                function oneTimeChartSetup() {
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
                        .html(function (d, i) {
                        return buildHover(d, i);
                    });
                    svg = chart.append("g")
                        .attr("width", width + margin.left + margin.right)
                        .attr("height", innerChartHeight)
                        .attr("transform", "translate(" + margin.left + "," + (adjustedChartHeight2) + ")");
                    svg.call(tip);
                }
                function setupFilteredData(dataPoints) {
                    var alertPeak, highPeak;
                    function determineMultiMetricMinMax() {
                        var currentMax, currentMin, seriesMax, seriesMin, maxList = [], minList = [];
                        angular.forEach(multiChartOverlayData, function (series) {
                            currentMax = d3.max(series.map(function (d) {
                                return !d.empty ? d.avg : 0;
                            }));
                            maxList.push(currentMax);
                            currentMin = d3.min(series.map(function (d) {
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
                    if (dataPoints) {
                        peak = d3.max(dataPoints.map(function (d) {
                            return !d.empty ? d.max : 0;
                        }));
                        min = d3.min(dataPoints.map(function (d) {
                            return !d.empty ? d.min : undefined;
                        }));
                    }
                    lowBound = useZeroMinValue ? 0 : min - (min * 0.05);
                    if (alertValue) {
                        alertPeak = (alertValue * 1.2);
                        highPeak = peak + ((peak - min) * 0.2);
                        highBound = alertPeak > highPeak ? alertPeak : highPeak;
                    }
                    else {
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
                        calcBarWidth = function () {
                            return (width / chartData.length - barOffset);
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
                            .domain(d3.extent(chartData, function (d) {
                            return d.timestamp;
                        }));
                        if (contextData) {
                            timeScaleForContext = d3.time.scale()
                                .range([0, width])
                                .domain(d3.extent(contextData, function (d) {
                                return d.timestamp;
                            }));
                        }
                        else {
                            timeScaleForBrush = d3.time.scale()
                                .range([0, width])
                                .domain(d3.extent(chartData, function (d) {
                                return d.timestamp;
                            }));
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
                function setupFilteredMultiData(multiDataPoints) {
                    var alertPeak, highPeak, highbound, lowbound;
                    function determineMultiDataMinMax() {
                        var currentMax, currentMin, seriesMax, seriesMin, maxList = [], minList = [];
                        angular.forEach(multiDataPoints, function (series) {
                            currentMax = d3.max(series.values.map(function (d) {
                                return !d.empty ? d.avg : 0;
                            }));
                            maxList.push(currentMax);
                            currentMin = d3.min(series.values.map(function (d) {
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
                        alertPeak = (alertValue * 1.2);
                        highPeak = peak + ((peak - min) * 0.2);
                        highBound = alertPeak > highPeak ? alertPeak : highPeak;
                    }
                    else {
                        highBound = peak + ((peak - min) * 0.2);
                    }
                    return [lowBound, highBound];
                }
                function determineMultiScale(multiDataPoints) {
                    var xTicks = 9, xTickSubDivide = 5, firstDataArray;
                    if (multiDataPoints) {
                        firstDataArray = multiDataPoints[0].values;
                        var lowHigh = setupFilteredMultiData(multiDataPoints);
                        lowBound = lowHigh[0];
                        highBound = lowHigh[1];
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
                            .domain(d3.extent(firstDataArray, function (d) {
                            return d.timestamp;
                        }));
                        xAxis = d3.svg.axis()
                            .scale(timeScale)
                            .ticks(xTicks)
                            .tickFormat(d3.time.format("%H:%M"))
                            .tickSubdivide(xTickSubDivide)
                            .tickSize(4, 4, 0)
                            .orient("bottom");
                    }
                }
                function getBaseUrl() {
                    var baseUrl = dataUrl || 'http://' + $rootScope.$storage.server.replace(/['"]+/g, '') + ':' + $rootScope.$storage.port + BASE_URL;
                    return baseUrl;
                }
                function loadMetricsForTimeRange(url, metricId, startTimestamp, endTimestamp, buckets) {
                    $log.debug('-- Retrieving metrics data for urlData: ' + metricId);
                    $log.debug('-- Date Range: ' + new Date(startTimestamp) + ' - ' + new Date(endTimestamp));
                    $log.debug('-- TenantId: ' + metricTenantId);
                    var numBuckets = buckets || 60;
                    var requestConfig = {
                        headers: {
                            'Hawkular-Tenant': metricTenantId
                        },
                        params: {
                            start: startTimestamp,
                            end: endTimestamp,
                            buckets: numBuckets
                        }
                    };
                    if (startTimestamp >= endTimestamp) {
                        $log.warn('Start date was after end date');
                    }
                    /// sample url:
                    /// http://localhost:8080/hawkular/metrics/gauges/45b2256eff19cb982542b167b3957036.status.duration/data?buckets=120&end=1436831797533&start=1436828197533' -H 'Hawkular-Tenant: 28026b36-8fe4-4332-84c8-524e173a68bf'     -H 'Accept: application/json'
                    $http.get(url + "/" + metricType + "s/" + metricId + "/data", requestConfig).success(function (response) {
                        processedNewData = formatBucketedChartOutput(response);
                        console.info("DataPoints from standalone URL: ");
                        console.table(processedNewData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }).error(function (reason, status) {
                        $log.error('Error Loading Chart Data:' + status + ", " + reason);
                    });
                }
                function formatBucketedChartOutput(response) {
                    //  The schema is different for bucketed output
                    if (response) {
                        return response.map(function (point) {
                            var timestamp = point.start + (point.end - point.start) / 2;
                            return {
                                timestamp: timestamp,
                                date: new Date(timestamp),
                                value: !angular.isNumber(point.value) ? 0 : point.value,
                                avg: (point.empty) ? 0 : point.avg,
                                min: !angular.isNumber(point.min) ? 0 : point.min,
                                max: !angular.isNumber(point.max) ? 0 : point.max,
                                empty: point.empty
                            };
                        });
                    }
                }
                function isEmptyDataBar(d) {
                    return d.empty;
                }
                function isRawMetric(d) {
                    return d.value;
                }
                function buildHover(d, i) {
                    var hover, prevTimestamp, currentTimestamp = d.timestamp, barDuration, formattedDateTime = moment(d.timestamp).format(buttonBarDateTimeFormat);
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
                    }
                    else {
                        if (isRawMetric(d)) {
                            // raw single value from raw table
                            hover = "<div class='chartHover'><div><small><span class='chartHoverLabel'>" + timestampLabel + "</span><span>: </span><span class='chartHoverValue'>" + formattedDateTime + "</span></small></div>" +
                                "<div><small><span class='chartHoverLabel'>" + durationLabel + "</span><span>: </span><span class='chartHoverValue'>" + barDuration + "</span></small> </div>" +
                                "<hr/>" +
                                "<div><small><span class='chartHoverLabel'>" + singleValueLabel + "</span><span>: </span><span class='chartHoverValue'>" + numeral(d.value).format('0,0.0') + "</span></small> </div></div> ";
                        }
                        else {
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
                        .attr("x", function (d) {
                        return timeScale(d.timestamp);
                    })
                        .attr("y", function (d) {
                        if (!isEmptyDataBar(d)) {
                            return yScale(d.min);
                        }
                        else {
                            return 0;
                        }
                    })
                        .attr("height", function (d) {
                        if (isEmptyDataBar(d)) {
                            return height - yScale(highBound);
                        }
                        else {
                            return height - yScale(d.min);
                        }
                    })
                        .attr("width", function () {
                        return calcBarWidth();
                    })
                        .attr("opacity", ".6")
                        .attr("fill", function (d) {
                        if (isEmptyDataBar(d)) {
                            return "url(#noDataStripes)";
                        }
                        else {
                            return "#d3d3d6";
                        }
                    }).on("mouseover", function (d, i) {
                        tip.show(d, i);
                    }).on("mouseout", function () {
                        tip.hide();
                    });
                    // upper portion representing avg to high
                    svg.selectAll("rect.high")
                        .data(chartData)
                        .enter().append("rect")
                        .attr("class", "high")
                        .attr("x", function (d) {
                        return timeScale(d.timestamp);
                    })
                        .attr("y", function (d) {
                        return isNaN(d.max) ? yScale(lowBound) : yScale(d.max);
                    })
                        .attr("height", function (d) {
                        if (isEmptyDataBar(d)) {
                            return 0;
                        }
                        else {
                            return yScale(d.avg) - yScale(d.max);
                        }
                    })
                        .attr("width", function () {
                        return calcBarWidth();
                    })
                        .attr("data-rhq-value", function (d) {
                        return d.max;
                    })
                        .attr("opacity", 0.9)
                        .on("mouseover", function (d, i) {
                        tip.show(d, i);
                    }).on("mouseout", function () {
                        tip.hide();
                    });
                    // lower portion representing avg to low
                    svg.selectAll("rect.low")
                        .data(chartData)
                        .enter().append("rect")
                        .attr("class", "low")
                        .attr("x", function (d) {
                        return timeScale(d.timestamp);
                    })
                        .attr("y", function (d) {
                        return isNaN(d.avg) ? height : yScale(d.avg);
                    })
                        .attr("height", function (d) {
                        if (isEmptyDataBar(d)) {
                            return 0;
                        }
                        else {
                            return yScale(d.min) - yScale(d.avg);
                        }
                    })
                        .attr("width", function () {
                        return calcBarWidth();
                    })
                        .attr("opacity", 0.9)
                        .attr("data-rhq-value", function (d) {
                        return d.min;
                    })
                        .on("mouseover", function (d, i) {
                        tip.show(d, i);
                    }).on("mouseout", function () {
                        tip.hide();
                    });
                    // if high == low put a "cap" on the bar to show raw value, non-aggregated bar
                    svg.selectAll("rect.singleValue")
                        .data(chartData)
                        .enter().append("rect")
                        .attr("class", "singleValue")
                        .attr("x", function (d) {
                        return timeScale(d.timestamp);
                    })
                        .attr("y", function (d) {
                        return isNaN(d.value) ? height : yScale(d.value) - 2;
                    })
                        .attr("height", function (d) {
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
                        .attr("width", function () {
                        return calcBarWidth();
                    })
                        .attr("opacity", 0.9)
                        .attr("data-rhq-value", function (d) {
                        return d.value;
                    })
                        .attr("fill", function (d) {
                        if (d.min === d.max) {
                            return "#50505a";
                        }
                        else {
                            return "#70c4e2";
                        }
                    }).on("mouseover", function (d, i) {
                        tip.show(d, i);
                    }).on("mouseout", function () {
                        tip.hide();
                    });
                }
                function createCandleStickChart() {
                    // upper portion representing avg to high
                    svg.selectAll("rect.candlestick.up")
                        .data(chartData)
                        .enter().append("rect")
                        .attr("class", "candleStickUp")
                        .attr("x", function (d) {
                        return timeScale(d.timestamp);
                    })
                        .attr("y", function (d) {
                        return isNaN(d.max) ? yScale(lowBound) : yScale(d.max);
                    })
                        .attr("height", function (d) {
                        if (isEmptyDataBar(d)) {
                            return 0;
                        }
                        else {
                            return yScale(d.avg) - yScale(d.max);
                        }
                    })
                        .attr("width", function () {
                        return calcBarWidth();
                    })
                        .style("fill", function (d, i) {
                        return fillCandleChart(d, i);
                    })
                        .on("mouseover", function (d, i) {
                        tip.show(d, i);
                    }).on("mouseout", function () {
                        tip.hide();
                    });
                    // lower portion representing avg to low
                    svg.selectAll("rect.candlestick.down")
                        .data(chartData)
                        .enter().append("rect")
                        .attr("class", "candleStickDown")
                        .attr("x", function (d) {
                        return timeScale(d.timestamp);
                    })
                        .attr("y", function (d) {
                        return isNaN(d.avg) ? height : yScale(d.avg);
                    })
                        .attr("height", function (d) {
                        if (isEmptyDataBar(d)) {
                            return 0;
                        }
                        else {
                            return yScale(d.min) - yScale(d.avg);
                        }
                    })
                        .attr("width", function () {
                        return calcBarWidth();
                    })
                        .attr("data-rhq-value", function (d) {
                        return d.min;
                    })
                        .style("fill", function (d, i) {
                        return fillCandleChart(d, i);
                    })
                        .on("mouseover", function (d, i) {
                        tip.show(d, i);
                    }).on("mouseout", function () {
                        tip.hide();
                    });
                    function fillCandleChart(d, i) {
                        if (i > 0 && chartData[i].avg > chartData[i - 1].avg) {
                            return "green";
                        }
                        else if (i === 0) {
                            return "none";
                        }
                        else {
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
                        .attr("x", function (d) {
                        return timeScale(d.timestamp);
                    })
                        .attr("width", function () {
                        return calcBarWidth();
                    })
                        .attr("y", function (d) {
                        if (!isEmptyDataBar(d)) {
                            return yScale(d.avg);
                        }
                        else {
                            return 0;
                        }
                    })
                        .attr("height", function (d) {
                        if (isEmptyDataBar(d)) {
                            return height - yScale(highBound);
                        }
                        else {
                            return height - yScale(d.avg);
                        }
                    })
                        .attr("fill", function (d, i) {
                        if (isEmptyDataBar(d)) {
                            return 'url(#noDataStripes)';
                        }
                        else {
                            return '#C0C0C0';
                        }
                    })
                        .attr("stroke", function (d) {
                        return '#777';
                    })
                        .attr("stroke-width", function (d) {
                        if (isEmptyDataBar(d)) {
                            return '0';
                        }
                        else {
                            return '0';
                        }
                    })
                        .attr("data-rhq-value", function (d) {
                        return d.avg;
                    }).on("mouseover", function (d, i) {
                        tip.show(d, i);
                    }).on("mouseout", function () {
                        tip.hide();
                    });
                    if (hideHighLowValues === false) {
                        svg.selectAll(".histogram.top.stem")
                            .data(chartData)
                            .enter().append("line")
                            .attr("class", "histogramTopStem")
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
                            return "red";
                        })
                            .attr("stroke-opacity", function (d) {
                            return strokeOpacity;
                        });
                        svg.selectAll(".histogram.bottom.stem")
                            .data(chartData)
                            .enter().append("line")
                            .attr("class", "histogramBottomStem")
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
                            return "red";
                        }).attr("stroke-opacity", function (d) {
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
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
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
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
                        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                    });
                    svg.append("path")
                        .datum(chartData)
                        .attr("class", "metricLine")
                        .attr("d", metricChartLine);
                }
                function createMultiLineChart(multiDataPoints) {
                    var colorScale = d3.scale.category10(), g = 0;
                    if (multiDataPoints) {
                        angular.forEach(multiDataPoints, function (singleChartData) {
                            //$log.debug("Processing data for: "+singleChartData.key);
                            //console.dir(singleChartData.values);
                            svg.append("path")
                                .datum(singleChartData.values)
                                .attr("class", "multiLine")
                                .attr("fill", "none")
                                .attr("stroke", function () {
                                if (singleChartData.color) {
                                    return singleChartData.color;
                                }
                                else {
                                    return colorScale(g);
                                }
                            })
                                .attr("d", createLine("linear"));
                            g++;
                        });
                    }
                    else {
                        $log.warn("No multi-data set for multiline chart");
                    }
                }
                function createAreaChart() {
                    var highArea = d3.svg.area()
                        .interpolate(interpolation)
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return xMidPointStartPosition(d);
                    })
                        .y(function (d) {
                        return isRawMetric(d) ? yScale(d.value) : yScale(d.max);
                    })
                        .y0(function (d) {
                        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                    }), avgArea = d3.svg.area()
                        .interpolate(interpolation)
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return xMidPointStartPosition(d);
                    })
                        .y(function (d) {
                        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                    }).
                        y0(function (d) {
                        return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
                    }), lowArea = d3.svg.area()
                        .interpolate(interpolation)
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return xMidPointStartPosition(d);
                    })
                        .y(function (d) {
                        return isRawMetric(d) ? yScale(d.value) : yScale(d.min);
                    })
                        .y0(function () {
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
                    if (yScale) {
                        svg.append("g").classed("grid y_grid", true)
                            .call(d3.svg.axis()
                            .scale(yScale)
                            .orient("left")
                            .ticks(10)
                            .tickSize(-width, 0, 0)
                            .tickFormat(""));
                    }
                }
                function createXandYAxes() {
                    var xAxisGroup;
                    if (yAxis) {
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
                }
                function createCenteredLine(newInterpolation) {
                    var interpolate = newInterpolation || 'monotone', line = d3.svg.line()
                        .interpolate(interpolate)
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp) + (calcBarWidth() / 2);
                    })
                        .y(function (d) {
                        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                    });
                    return line;
                }
                function createLine(newInterpolation) {
                    var interpolate = newInterpolation || 'monotone', line = d3.svg.line()
                        .interpolate(interpolate)
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
                        return isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                    });
                    return line;
                }
                function createAvgLines() {
                    if (chartType === 'bar' || chartType === 'scatterline') {
                        svg.append("path")
                            .datum(chartData)
                            .attr("class", "barAvgLine")
                            .attr("d", createCenteredLine("monotone"));
                    }
                }
                function createAlertLineDef(alertValue) {
                    var line = d3.svg.line()
                        .interpolate("monotone")
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
                        return yScale(alertValue);
                    });
                    return line;
                }
                function createAlertLine(alertValue) {
                    svg.append("path")
                        .datum(chartData)
                        .attr("class", "alertLine")
                        .attr("d", createAlertLineDef(alertValue));
                }
                function extractAlertRanges(chartData, threshold) {
                    var alertBoundAreaItem;
                    var alertBoundAreaItems;
                    var startPoints;
                    var firstChartPoint = chartData[0];
                    var lastChartPoint = chartData[chartData.length - 1];
                    function findStartPoints(chartData, threshold) {
                        var startPoints = [];
                        var prevItem;
                        chartData.forEach(function (chartItem, i) {
                            if (i >= 1) {
                                prevItem = chartData[i - 1];
                            }
                            if (prevItem && prevItem.avg <= threshold && chartItem.avg > threshold) {
                                startPoints.push(i);
                            }
                        });
                        return startPoints;
                    }
                    function findEndPointsForStartPointIndex(startPoints, threshold) {
                        var alertBoundAreaItems = [];
                        var currentItem;
                        var nextItem;
                        var startItem;
                        startPoints.forEach(function (startPointIndex) {
                            startItem = chartData[startPointIndex];
                            for (var j = startPointIndex; j < chartData.length - 1; j++) {
                                currentItem = chartData[j];
                                nextItem = chartData[j + 1];
                                if (currentItem.avg > threshold && nextItem.avg <= threshold) {
                                    if (startItem.timestamp === currentItem.timestamp) {
                                        /// case for when there is only one point above the threshold
                                        alertBoundAreaItems.push(new AlertBound(startItem.timestamp, nextItem.timestamp, threshold));
                                    }
                                    else {
                                        alertBoundAreaItems.push(new AlertBound(startItem.timestamp, currentItem.timestamp, threshold));
                                    }
                                    break;
                                }
                            }
                        });
                        return alertBoundAreaItems;
                    }
                    startPoints = findStartPoints(chartData, threshold);
                    /// handle the case where first chart point is above threshold
                    if (firstChartPoint.avg > threshold) {
                        startPoints.push(0);
                    }
                    alertBoundAreaItems = findEndPointsForStartPointIndex(startPoints, threshold);
                    /// handle the case where last chart point is above threshold
                    if (lastChartPoint.avg > threshold) {
                        for (var k = chartData.length - 1; k >= 1; k--) {
                            var currentItem = chartData[k];
                            var nextItem = chartData[k - 1];
                            if (currentItem.avg > threshold && nextItem.avg <= threshold) {
                                alertBoundAreaItems.push(new AlertBound(nextItem.timestamp, lastChartPoint.timestamp, threshold));
                                break;
                            }
                        }
                    }
                    /// Handle special case where all items are above threshold
                    var allItemsAboveThreshold = chartData.every(function (chartItem) {
                        return chartItem.avg > threshold;
                    });
                    if (allItemsAboveThreshold) {
                        alertBoundAreaItem = new AlertBound(chartData[0].timestamp, chartData[chartData.length - 1].timestamp, threshold);
                        alertBoundAreaItems.push(alertBoundAreaItem);
                    }
                    return alertBoundAreaItems;
                }
                function createAlertBoundsArea(alertBounds) {
                    svg.selectAll("rect.alert")
                        .data(alertBounds)
                        .enter().append("rect")
                        .attr("class", "alertBounds")
                        .attr("x", function (d) {
                        return timeScale(d.startTimestamp);
                    })
                        .attr("y", function (d) {
                        return yScale(highBound);
                    })
                        .attr("height", function (d) {
                        ///@todo: make the height adjustable
                        return 185;
                        //return yScale(0) - height;
                    })
                        .attr("width", function (d) {
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
                        var extent = brush.extent(), startTime = Math.round(extent[0].getTime()), endTime = Math.round(extent[1].getTime()), dragSelectionDelta = endTime - startTime >= 60000;
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
                        angular.forEach(multiChartOverlayData, function (singleChartData) {
                            svg.append("path")
                                .datum(singleChartData)
                                .attr("class", "multiLine")
                                .attr("fill", function (d, i) {
                                return colorScale(i);
                            })
                                .attr("stroke", function (d, i) {
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
                            .attr("cx", function (d) {
                            return timeScale(d.timestamp);
                        })
                            .attr("cy", function () {
                            return height - yScale(highBound);
                        })
                            .style("fill", function (d) {
                            if (d.severity === '1') {
                                return "red";
                            }
                            else if (d.severity === '2') {
                                return "yellow";
                            }
                            else {
                                return "white";
                            }
                        });
                    }
                }
                function createDataPoints(dataPoints) {
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
                scope.$watch('data', function (newData) {
                    if (newData) {
                        $log.debug('Chart Data Changed');
                        processedNewData = angular.fromJson(newData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                }, true);
                scope.$watch('multiData', function (newMultiData) {
                    if (newMultiData) {
                        $log.debug('MultiData Chart Data Changed');
                        multiDataPoints = angular.fromJson(newMultiData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                }, true);
                scope.$watch('availData', function (newAvailData) {
                    if (newAvailData) {
                        $log.debug('Avail Data Changed');
                        processedNewData = angular.fromJson(newAvailData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                }, true);
                scope.$watch('previousRangeData', function (newPreviousRangeValues) {
                    if (newPreviousRangeValues) {
                        $log.debug("Previous Range data changed");
                        processedPreviousRangeData = angular.fromJson(newPreviousRangeValues);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                }, true);
                scope.$watch('annotationData', function (newAnnotationData) {
                    if (newAnnotationData) {
                        annotationData = angular.fromJson(newAnnotationData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                }, true);
                scope.$watch('contextData', function (newContextData) {
                    if (newContextData) {
                        contextData = angular.fromJson(newContextData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                }, true);
                scope.$on('MultiChartOverlayDataChanged', function (event, newMultiChartData) {
                    $log.log('Handling MultiChartOverlayDataChanged in Chart Directive');
                    if (newMultiChartData) {
                        multiChartOverlayData = angular.fromJson(newMultiChartData);
                    }
                    else {
                        // same event is sent with no data to clear it
                        multiChartOverlayData = [];
                    }
                    scope.render(processedNewData, processedPreviousRangeData);
                });
                scope.$watch('alertValue', function (newAlert) {
                    if (newAlert) {
                        alertValue = newAlert;
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                });
                scope.$watch('chartType', function (newChartType) {
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
                scope.$watch('dataUrl', function (newUrlData) {
                    if (newUrlData) {
                        $log.debug('dataUrl has changed: ' + newUrlData);
                        dataUrl = newUrlData;
                    }
                });
                scope.$watch('metricId', function (newMetricId) {
                    if (newMetricId) {
                        $log.debug('metricId has changed: ' + newMetricId);
                        metricId = newMetricId;
                        loadMetricsTimeRangeFromNow();
                    }
                });
                scope.$watch('metricTenantId', function (newMetricTenantId) {
                    if (newMetricTenantId) {
                        $log.debug('metricTenantId has changed: ' + newMetricTenantId);
                        metricTenantId = newMetricTenantId;
                    }
                });
                scope.$watch('refreshIntervalInSeconds', function (newRefreshInterval) {
                    if (newRefreshInterval) {
                        refreshIntervalInSeconds = +newRefreshInterval;
                        var startIntervalPromise = $interval(function () {
                            loadMetricsTimeRangeFromNow();
                        }, refreshIntervalInSeconds * 1000);
                    }
                });
                scope.$watch('timeRangeInSeconds', function (newTimeRange) {
                    if (newTimeRange) {
                        $log.debug("timeRangeInSeconds changed.");
                        timeRangeInSeconds = newTimeRange;
                    }
                });
                scope.$watch('showAvgLine', function (newShowAvgLine) {
                    if (newShowAvgLine) {
                        showAvgLine = newShowAvgLine;
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                });
                scope.$watch('hideHighLowValues', function (newHideHighLowValues) {
                    if (newHideHighLowValues) {
                        hideHighLowValues = newHideHighLowValues;
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                });
                scope.$watch('useZeroMinValue', function (newUseZeroMinValue) {
                    if (newUseZeroMinValue) {
                        useZeroMinValue = newUseZeroMinValue;
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                });
                scope.$on('DateRangeDragChanged', function (event, extent) {
                    scope.$emit('GraphTimeRangeChangedEvent', extent);
                });
                function determineChartType(chartType) {
                    switch (chartType) {
                        case 'rhqbar':
                            createStackedBars(lowBound, highBound);
                            break;
                        case 'histogram':
                            createHistogramChart();
                            break;
                        case 'hawkularline':
                            createHawkularLineChart();
                            break;
                        case 'hawkularmetric':
                            createHawkularMetricChart();
                            break;
                        case 'multiline':
                            createMultiLineChart(multiDataPoints);
                            break;
                        case 'area':
                            createAreaChart();
                            break;
                        case 'scatter':
                            createScatterChart();
                            break;
                        case 'scatterline':
                            createScatterLineChart();
                            break;
                        case 'candlestick':
                            createCandleStickChart();
                            break;
                        default:
                            $log.warn('chart-type is not valid. Must be in [bar,area,line,scatter,candlestick,histogram,hawkularline,hawkularmetric,availability] chart type: ' + chartType);
                    }
                }
                scope.render = function (dataPoints, previousRangeDataPoints) {
                    console.group('Render Chart');
                    console.time('chartRender');
                    //NOTE: layering order is important!
                    oneTimeChartSetup();
                    if (dataPoints) {
                        determineScale(dataPoints);
                    }
                    if (multiDataPoints) {
                        determineMultiScale(multiDataPoints);
                    }
                    createHeader(attrs.chartTitle);
                    createXAxisBrush();
                    if (alertValue && (alertValue > lowBound && alertValue < highBound)) {
                        createAlertBoundsArea(extractAlertRanges(chartData, alertValue));
                    }
                    ///createYAxisGridLines();
                    determineChartType(chartType);
                    if (showDataPoints) {
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
        }]);
})(Charts || (Charts = {}));
