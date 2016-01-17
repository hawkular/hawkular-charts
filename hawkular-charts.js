/**
 * @name  hawkular-charts
 *
 * @description
 *   Base module for rhq-metrics-charts.
 *
 */
angular.module('hawkular.charts', []);

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    /**
     * Defines an individual alert bounds  to be visually highlighted in a chart
     * that an alert was above/below a threshold.
     */
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
    Charts.AlertBound = AlertBound;
    function createAlertLineDef(timeScale, yScale, alertValue) {
        var line = d3.svg.line()
            .interpolate('monotone')
            .x(function (d) {
            return timeScale(d.timestamp);
        })
            .y(function (d) {
            return yScale(alertValue);
        });
        return line;
    }
    function createAlertLine(svg, timeScale, yScale, chartData, alertValue, cssClassName) {
        var pathAlertLine = svg.selectAll('path.alertLine').data([chartData]);
        // update existing
        pathAlertLine.attr('class', cssClassName)
            .attr('d', createAlertLineDef(timeScale, yScale, alertValue));
        // add new ones
        pathAlertLine.enter().append('path')
            .attr('class', cssClassName)
            .attr('d', createAlertLineDef(timeScale, yScale, alertValue));
        // remove old ones
        pathAlertLine.exit().remove();
    }
    Charts.createAlertLine = createAlertLine;
    function extractAlertRanges(chartData, threshold) {
        var alertBoundAreaItems;
        var startPoints;
        function findStartPoints(chartData, threshold) {
            var startPoints = [];
            var prevItem;
            chartData.forEach(function (chartItem, i) {
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
                    if ((currentItem.avg > threshold && nextItem.avg <= threshold)
                        || (currentItem.avg > threshold && !nextItem.avg)) {
                        alertBoundAreaItems.push(new AlertBound(startItem.timestamp, nextItem.avg ? nextItem.timestamp : currentItem.timestamp, threshold));
                        break;
                    }
                }
            });
            /// means the last piece data is all above threshold, use last data point
            if (alertBoundAreaItems.length === (startPoints.length - 1)) {
                alertBoundAreaItems.push(new AlertBound(chartData[startPoints[startPoints.length - 1]].timestamp, chartData[chartData.length - 1].timestamp, threshold));
            }
            return alertBoundAreaItems;
        }
        startPoints = findStartPoints(chartData, threshold);
        alertBoundAreaItems = findEndPointsForStartPointIndex(startPoints, threshold);
        return alertBoundAreaItems;
    }
    Charts.extractAlertRanges = extractAlertRanges;
    function createAlertBoundsArea(svg, timeScale, yScale, highBound, alertBounds) {
        var rectAlert = svg.select('g.alertHolder').selectAll('rect.alertBounds').data(alertBounds);
        function alertBoundingRect(selection) {
            selection
                .attr('class', 'alertBounds')
                .attr('x', function (d) {
                return timeScale(d.startTimestamp);
            })
                .attr('y', function () {
                return yScale(highBound);
            })
                .attr('height', function (d) {
                ///@todo: make the height adjustable
                return 185;
                //return yScale(0) - height;
            })
                .attr('width', function (d) {
                return timeScale(d.endTimestamp) - timeScale(d.startTimestamp);
            });
        }
        // update existing
        rectAlert.call(alertBoundingRect);
        // add new ones
        rectAlert.enter()
            .append('rect')
            .call(alertBoundingRect);
        // remove old ones
        rectAlert.exit().remove();
    }
    Charts.createAlertBoundsArea = createAlertBoundsArea;
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var _module = angular.module('hawkular.charts');
    var AvailStatus = (function () {
        function AvailStatus(value) {
            this.value = value;
            // empty
        }
        AvailStatus.prototype.toString = function () {
            return this.value;
        };
        AvailStatus.UP = 'up';
        AvailStatus.DOWN = 'down';
        AvailStatus.UNKNOWN = 'unknown';
        return AvailStatus;
    })();
    Charts.AvailStatus = AvailStatus;
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
    var AvailabilityChartDirective = (function () {
        function AvailabilityChartDirective($rootScope) {
            var _this = this;
            this.restrict = 'E';
            this.replace = true;
            // Can't use 1.4 directive controllers because we need to support 1.3+
            this.scope = {
                data: '=',
                startTimestamp: '@',
                endTimestamp: '@',
                timeLabel: '@',
                dateLabel: '@',
                noDataLabel: '@',
                chartTitle: '@'
            };
            this.link = function (scope, element, attrs) {
                // data specific vars
                var startTimestamp = +attrs.startTimestamp, endTimestamp = +attrs.endTimestamp, chartHeight = AvailabilityChartDirective._CHART_HEIGHT, noDataLabel = attrs.noDataLabel || 'No Data'; //@todo: add No Data handling
                // chart specific vars
                var margin = { top: 10, right: 5, bottom: 5, left: 90 }, width = AvailabilityChartDirective._CHART_WIDTH - margin.left - margin.right, adjustedChartHeight = chartHeight - 50, height = adjustedChartHeight - margin.top - margin.bottom, titleHeight = 30, titleSpace = 10, innerChartHeight = height + margin.top - titleHeight - titleSpace, adjustedChartHeight2 = +titleHeight + titleSpace + margin.top, yScale, timeScale, yAxis, xAxis, xAxisGroup, brush, brushGroup, tip, chart, chartParent, svg;
                function buildAvailHover(d) {
                    return "<div class='chartHover'>\n            <div class=\"info-item\">\n              <span class='chartHoverLabel'>Status:</span>\n              <span class='chartHoverValue'>" + d.value.toUpperCase() + "</span>\n            </div>\n            <div class=\"info-item before-separator\">\n              <span class='chartHoverLabel'>Duration:</span>\n              <span class='chartHoverValue'>" + d.duration + "</span>\n            </div>\n          </div>";
                }
                function oneTimeChartSetup() {
                    // destroy any previous charts
                    if (chart) {
                        chartParent.selectAll('*').remove();
                    }
                    chartParent = d3.select(element[0]);
                    chart = chartParent.append('svg')
                        .attr('viewBox', '0 0 760 150').attr('preserveAspectRatio', 'xMinYMin meet');
                    tip = d3.tip()
                        .attr('class', 'd3-tip')
                        .offset([-10, 0])
                        .html(function (d) {
                        return buildAvailHover(d);
                    });
                    svg = chart.append('g')
                        .attr('width', width + margin.left + margin.right)
                        .attr('height', innerChartHeight)
                        .attr('transform', 'translate(' + margin.left + ',' + (adjustedChartHeight2) + ')');
                    svg.append('defs')
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
                    svg.call(tip);
                }
                function determineAvailScale(transformedAvailDataPoint) {
                    var adjustedTimeRange = [];
                    startTimestamp = +attrs.startTimestamp || d3.min(transformedAvailDataPoint, function (d) {
                        return d.start;
                    }) || +moment().subtract(1, 'hour');
                    if (transformedAvailDataPoint && transformedAvailDataPoint.length > 0) {
                        adjustedTimeRange[0] = startTimestamp;
                        adjustedTimeRange[1] = endTimestamp || +moment();
                        yScale = d3.scale.linear()
                            .clamp(true)
                            .rangeRound([70, 0])
                            .domain([0, 175]);
                        yAxis = d3.svg.axis()
                            .scale(yScale)
                            .ticks(0)
                            .tickSize(0, 0)
                            .orient('left');
                        timeScale = d3.time.scale()
                            .range([0, width])
                            .domain(adjustedTimeRange);
                        xAxis = d3.svg.axis()
                            .scale(timeScale)
                            .tickSize(-70, 0)
                            .orient('top')
                            .tickFormat(Charts.xAxisTimeFormats());
                    }
                }
                function isUp(d) {
                    return d.value === AvailStatus.UP.toString();
                }
                function isDown(d) {
                    return d.value === AvailStatus.DOWN.toString();
                }
                function isUnknown(d) {
                    return d.value === AvailStatus.UNKNOWN.toString();
                }
                function formatTransformedDataPoints(inAvailData) {
                    var outputData = [];
                    var itemCount = inAvailData.length;
                    function sortByTimestamp(a, b) {
                        if (a.timestamp < b.timestamp) {
                            return -1;
                        }
                        if (a.timestamp > b.timestamp) {
                            return 1;
                        }
                        return 0;
                    }
                    inAvailData.sort(sortByTimestamp);
                    if (inAvailData && itemCount > 0 && inAvailData[0].timestamp) {
                        var now = new Date().getTime();
                        if (itemCount === 1) {
                            var availItem = inAvailData[0];
                            // we only have one item with start time. Assume unknown for the time before (last 1h)
                            // @TODO adjust to time picker
                            outputData.push(new TransformedAvailDataPoint(now - 60 * 60 * 1000, availItem.timestamp, AvailStatus.UNKNOWN.toString()));
                            // and the determined value up until the end.
                            outputData.push(new TransformedAvailDataPoint(availItem.timestamp, now, availItem.value));
                        }
                        else {
                            var backwardsEndTime = now;
                            for (var i = inAvailData.length; i > 0; i--) {
                                // if we have data starting in the future... discard it
                                //if (inAvailData[i - 1].timestamp > +moment()) {
                                //  continue;
                                //}
                                if (startTimestamp >= inAvailData[i - 1].timestamp) {
                                    outputData.push(new TransformedAvailDataPoint(startTimestamp, backwardsEndTime, inAvailData[i - 1].value));
                                    break;
                                }
                                else {
                                    outputData.push(new TransformedAvailDataPoint(inAvailData[i - 1].timestamp, backwardsEndTime, inAvailData[i - 1].value));
                                    backwardsEndTime = inAvailData[i - 1].timestamp;
                                }
                            }
                        }
                    }
                    return outputData;
                }
                function createSideYAxisLabels() {
                    ///@Todo: move out to stylesheet
                    svg.append('text')
                        .attr('class', 'availUpLabel')
                        .attr('x', -10)
                        .attr('y', 25)
                        .style('font-family', 'Arial, Verdana, sans-serif;')
                        .style('font-size', '12px')
                        .attr('fill', '#999')
                        .style('text-anchor', 'end')
                        .text('Up');
                    svg.append('text')
                        .attr('class', 'availDownLabel')
                        .attr('x', -10)
                        .attr('y', 55)
                        .style('font-family', 'Arial, Verdana, sans-serif;')
                        .style('font-size', '12px')
                        .attr('fill', '#999')
                        .style('text-anchor', 'end')
                        .text('Down');
                }
                function createAvailabilityChart(transformedAvailDataPoint) {
                    var xAxisMin = d3.min(transformedAvailDataPoint, function (d) {
                        return +d.start;
                    }), xAxisMax = d3.max(transformedAvailDataPoint, function (d) {
                        return +d.end;
                    });
                    var availTimeScale = d3.time.scale()
                        .range([0, width])
                        .domain([startTimestamp, endTimestamp || xAxisMax]), yScale = d3.scale.linear()
                        .clamp(true)
                        .range([height, 0])
                        .domain([0, 4]), availXAxis = d3.svg.axis()
                        .scale(availTimeScale)
                        .ticks(8)
                        .tickSize(13, 0)
                        .orient('top');
                    // For each datapoint calculate the Y offset for the bar
                    // Up or Unknown: offset 0, Down: offset 35
                    function calcBarY(d) {
                        return height - yScale(0) + ((isUp(d) || isUnknown(d)) ? 0 : 35);
                    }
                    // For each datapoint calculate the Y removed height for the bar
                    // Unknown: full height 15, Up or Down: half height, 50
                    function calcBarHeight(d) {
                        return yScale(0) - (isUnknown(d) ? 15 : 50);
                    }
                    function calcBarFill(d) {
                        if (isUp(d)) {
                            return '#54A24E'; // green
                        }
                        else if (isUnknown(d)) {
                            return 'url(#diagonal-stripes)'; // gray stripes
                        }
                        else {
                            return '#D85054'; // red
                        }
                    }
                    svg.selectAll('rect.availBars')
                        .data(transformedAvailDataPoint)
                        .enter().append('rect')
                        .attr('class', 'availBars')
                        .attr('x', function (d) {
                        return availTimeScale(+d.start);
                    })
                        .attr('y', function (d) {
                        return calcBarY(d);
                    })
                        .attr('height', function (d) {
                        return calcBarHeight(d);
                    })
                        .attr('width', function (d) {
                        var dEnd = endTimestamp ? (Math.min(+d.end, endTimestamp)) : (+d.end);
                        return availTimeScale(dEnd) - availTimeScale(+d.start);
                    })
                        .attr('fill', function (d) {
                        return calcBarFill(d);
                    })
                        .attr('opacity', function () {
                        return 0.85;
                    })
                        .on('mouseover', function (d, i) {
                        tip.show(d, i);
                    }).on('mouseout', function () {
                        tip.hide();
                    })
                        .on('mousedown', function () {
                        var brushElem = svg.select(".brush").node();
                        var clickEvent = new Event('mousedown');
                        clickEvent.pageX = d3.event.pageX;
                        clickEvent.clientX = d3.event.clientX;
                        clickEvent.pageY = d3.event.pageY;
                        clickEvent.clientY = d3.event.clientY;
                        brushElem.dispatchEvent(clickEvent);
                    })
                        .on('mouseup', function () {
                        var brushElem = svg.select(".brush").node();
                        var clickEvent = new Event('mouseup');
                        clickEvent.pageX = d3.event.pageX;
                        clickEvent.clientX = d3.event.clientX;
                        clickEvent.pageY = d3.event.pageY;
                        clickEvent.clientY = d3.event.clientY;
                        brushElem.dispatchEvent(clickEvent);
                    });
                    // The bottom line of the availability chart
                    svg.append('line')
                        .attr("x1", 0)
                        .attr("y1", 70)
                        .attr("x2", 655)
                        .attr("y2", 70)
                        .attr("stroke-width", 0.5)
                        .attr("stroke", "#D0D0D0");
                    createSideYAxisLabels();
                }
                function createXandYAxes() {
                    svg.selectAll('g.axis').remove();
                    // create x-axis
                    xAxisGroup = svg.append('g')
                        .attr('class', 'x axis')
                        .call(xAxis);
                    // create y-axis
                    svg.append('g')
                        .attr('class', 'y axis')
                        .call(yAxis);
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
                        .attr('height', 70);
                    function brushStart() {
                        svg.classed('selecting', true);
                    }
                    function brushEnd() {
                        var extent = brush.extent(), startTime = Math.round(extent[0].getTime()), endTime = Math.round(extent[1].getTime()), dragSelectionDelta = endTime - startTime;
                        //svg.classed('selecting', !d3.event.target.empty());
                        if (dragSelectionDelta >= 60000) {
                            console.log('Drag: AvailTimeRangeChanged:' + extent);
                            $rootScope.$broadcast(Charts.EventNames.AVAIL_CHART_TIMERANGE_CHANGED.toString(), extent);
                        }
                        brushGroup.call(brush.clear());
                    }
                }
                scope.$watchCollection('data', function (newData) {
                    console.log('Avail Chart Data Changed');
                    if (newData) {
                        _this.transformedDataPoints = formatTransformedDataPoints(angular.fromJson(newData));
                        scope.render(_this.transformedDataPoints);
                    }
                });
                scope.$watchGroup(['startTimestamp', 'endTimestamp'], function (newTimestamp) {
                    console.log('Avail Chart Start/End Timestamp Changed');
                    startTimestamp = +newTimestamp[0] || startTimestamp;
                    endTimestamp = +newTimestamp[1] || endTimestamp;
                    scope.render(_this.transformedDataPoints);
                });
                scope.render = function (transformedAvailDataPoint) {
                    console.log('Starting Avail Chart Directive Render');
                    if (transformedAvailDataPoint && transformedAvailDataPoint.length > 0) {
                        console.group('Render Avail Chart');
                        console.time('availChartRender');
                        ///NOTE: layering order is important!
                        oneTimeChartSetup();
                        determineAvailScale(transformedAvailDataPoint);
                        createXandYAxes();
                        createXAxisBrush();
                        createAvailabilityChart(transformedAvailDataPoint);
                        console.timeEnd('availChartRender');
                        console.groupEnd();
                    }
                };
            };
        }
        AvailabilityChartDirective.Factory = function () {
            var directive = function ($rootScope) {
                return new AvailabilityChartDirective($rootScope);
            };
            directive['$inject'] = ['$rootScope'];
            return directive;
        };
        AvailabilityChartDirective._CHART_HEIGHT = 150;
        AvailabilityChartDirective._CHART_WIDTH = 750;
        return AvailabilityChartDirective;
    })();
    Charts.AvailabilityChartDirective = AvailabilityChartDirective;
    _module.directive('availabilityChart', AvailabilityChartDirective.Factory());
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var _module = angular.module('hawkular.charts');
    var ContextChartDirective = (function () {
        function ContextChartDirective($rootScope) {
            var _this = this;
            this.restrict = 'E';
            this.replace = true;
            // Can't use 1.4 directive controllers because we need to support 1.3+
            this.scope = {
                data: '=',
                showYAxisValues: '='
            };
            this.link = function (scope, element, attrs) {
                var margin = { top: 0, right: 5, bottom: 5, left: 90 };
                // data specific vars
                var chartHeight = ContextChartDirective._CHART_HEIGHT, width = ContextChartDirective._CHART_WIDTH - margin.left - margin.right, height = chartHeight - margin.top - margin.bottom, innerChartHeight = height + margin.top, showYAxisValues, yScale, yAxis, yAxisGroup, timeScale, xAxis, xAxisGroup, brush, brushGroup, chart, chartParent, svg;
                if (typeof attrs.showYAxisValues != 'undefined') {
                    showYAxisValues = attrs.showYAxisValues === 'true';
                }
                function setup() {
                    // destroy any previous charts
                    if (chart) {
                        chartParent.selectAll('*').remove();
                    }
                    chartParent = d3.select(element[0]);
                    chart = chartParent.append('svg')
                        .attr('width', width + margin.left + margin.right)
                        .attr('height', innerChartHeight)
                        .attr('viewBox', '0 0 760 50').attr('preserveAspectRatio', 'xMinYMin meet');
                    svg = chart.append('g')
                        .attr('transform', 'translate(' + margin.left + ', 0)')
                        .attr('class', 'contextChart');
                }
                function createContextChart(dataPoints) {
                    console.log('dataPoints.length: ' + dataPoints.length);
                    timeScale = d3.time.scale()
                        .range([0, width - 10])
                        .nice()
                        .domain([dataPoints[0].timestamp, dataPoints[dataPoints.length - 1].timestamp]);
                    xAxis = d3.svg.axis()
                        .scale(timeScale)
                        .ticks(5)
                        .tickSize(4, 0)
                        .tickFormat(Charts.xAxisTimeFormats())
                        .orient('bottom');
                    svg.selectAll('g.axis').remove();
                    xAxisGroup = svg.append('g')
                        .attr('class', 'x axis')
                        .attr('transform', 'translate(0,' + height + ')')
                        .call(xAxis);
                    var yMin = d3.min(dataPoints, function (d) {
                        return d.avg;
                    });
                    var yMax = d3.max(dataPoints, function (d) {
                        return d.avg;
                    });
                    // give a pad of % to min/max so we are not against x-axis
                    yMax = yMax + (yMax * 0.03);
                    yMin = yMin - (yMin * 0.05);
                    yScale = d3.scale.linear()
                        .rangeRound([ContextChartDirective._CHART_HEIGHT - 10, 0])
                        .nice()
                        .domain([yMin, yMax]);
                    var numberOfTicks = showYAxisValues ? 2 : 0;
                    yAxis = d3.svg.axis()
                        .scale(yScale)
                        .ticks(numberOfTicks)
                        .tickSize(4, 0)
                        .orient("left");
                    yAxisGroup = svg.append('g')
                        .attr('class', 'y axis')
                        .call(yAxis);
                    var area = d3.svg.area()
                        .interpolate('cardinal')
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y0(function (d) {
                        return height;
                    })
                        .y1(function (d) {
                        return yScale(d.avg);
                    });
                    var contextLine = d3.svg.line()
                        .interpolate('cardinal')
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
                        return yScale(d.avg);
                    });
                    var pathContextLine = svg.selectAll('path.contextLine').data([dataPoints]);
                    // update existing
                    pathContextLine.attr('class', 'contextLine')
                        .transition()
                        .attr('d', contextLine);
                    // add new ones
                    pathContextLine.enter().append('path')
                        .attr('class', 'contextLine')
                        .transition()
                        .attr('d', contextLine);
                    // remove old ones
                    pathContextLine.exit().remove();
                    var contextArea = svg.append("g")
                        .attr("class", "context");
                    contextArea.append("path")
                        .datum(dataPoints)
                        .transition()
                        .duration(500)
                        .attr("class", "contextArea")
                        .attr("d", area);
                }
                function createXAxisBrush() {
                    brush = d3.svg.brush()
                        .x(timeScale)
                        .on('brushstart', contextBrushStart)
                        .on('brushend', contextBrushEnd);
                    xAxisGroup.append('g')
                        .selectAll('rect')
                        .attr('y', 0)
                        .attr('height', height - 10);
                    brushGroup = svg.append('g')
                        .attr('class', 'brush')
                        .call(brush);
                    brushGroup.selectAll('.resize').append('path');
                    brushGroup.selectAll('rect')
                        .attr('height', height + 17);
                    function contextBrushStart() {
                        svg.classed('selecting', true);
                    }
                    function contextBrushEnd() {
                        var brushExtent = brush.extent(), startTime = Math.round(brushExtent[0].getTime()), endTime = Math.round(brushExtent[1].getTime()), dragSelectionDelta = endTime - startTime;
                        /// We ignore drag selections under a minute
                        if (dragSelectionDelta >= 60000) {
                            console.log('Drag: ContextChartTimeRangeChanged:' + brushExtent);
                            $rootScope.$broadcast(Charts.EventNames.CONTEXT_CHART_TIMERANGE_CHANGED.toString(), brushExtent);
                        }
                        //brushGroup.call(brush.clear());
                    }
                }
                scope.$watchCollection('data', function (newData) {
                    console.log('Context Chart Data Changed');
                    if (newData) {
                        _this.dataPoints = formatBucketedChartOutput(angular.fromJson(newData));
                        scope.render(_this.dataPoints);
                    }
                });
                function formatBucketedChartOutput(response) {
                    //  The schema is different for bucketed output
                    if (response) {
                        return response.map(function (point) {
                            var timestamp = point.timestamp || (point.start + (point.end - point.start) / 2);
                            return {
                                timestamp: timestamp,
                                //date: new Date(timestamp),
                                value: !angular.isNumber(point.value) ? undefined : point.value,
                                avg: (point.empty) ? undefined : point.avg,
                                min: !angular.isNumber(point.min) ? undefined : point.min,
                                max: !angular.isNumber(point.max) ? undefined : point.max,
                                empty: point.empty
                            };
                        });
                    }
                }
                scope.render = function (dataPoints) {
                    if (dataPoints && dataPoints.length > 0) {
                        console.group('Render Context Chart');
                        console.time('contextChartRender');
                        ///NOTE: layering order is important!
                        setup();
                        createContextChart(dataPoints);
                        createXAxisBrush();
                        console.timeEnd('contextChartRender');
                        console.groupEnd();
                    }
                };
            };
        }
        ContextChartDirective.Factory = function () {
            var directive = function ($rootScope) {
                return new ContextChartDirective($rootScope);
            };
            directive['$inject'] = ['$rootScope'];
            return directive;
        };
        ContextChartDirective._CHART_WIDTH = 750;
        ContextChartDirective._CHART_HEIGHT = 50;
        return ContextChartDirective;
    })();
    Charts.ContextChartDirective = ContextChartDirective;
    _module.directive('hawkularContextChart', ContextChartDirective.Factory());
})(Charts || (Charts = {}));

///
/// Copyright 2015 Red Hat, Inc. and/or its affiliates
/// and other contributors as indicated by the @author tags.
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///    http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    /// NOTE: this pattern is used because enums cant be used with strings
    var EventNames = (function () {
        function EventNames(value) {
            this.value = value;
            // empty
        }
        EventNames.prototype.toString = function () {
            return this.value;
        };
        EventNames.CHART_TIMERANGE_CHANGED = new EventNames('ChartTimeRangeChanged');
        EventNames.AVAIL_CHART_TIMERANGE_CHANGED = new EventNames('AvailChartTimeRangeChanged');
        EventNames.CONTEXT_CHART_TIMERANGE_CHANGED = new EventNames('ContextChartTimeRangeChanged');
        return EventNames;
    })();
    Charts.EventNames = EventNames;
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    function createDataPoints(svg, timeScale, yScale, tip, dataPoints) {
        var radius = 1;
        var dotDatapoint = svg.selectAll('.dataPointDot').data(dataPoints);
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
    Charts.createDataPoints = createDataPoints;
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var debug = false;
    // the scale to use for y-axis when all values are 0, [0, DEFAULT_Y_SCALE]
    Charts.DEFAULT_Y_SCALE = 10;
    Charts.Y_AXIS_HEIGHT = 25;
    Charts.CHART_HEIGHT = 250;
    Charts.CHART_WIDTH = 750;
    Charts.HOVER_DATE_TIME_FORMAT = 'MM/DD/YYYY h:mm a';
    Charts.BAR_OFFSET = 2;
    Charts.margin = { top: 10, right: 5, bottom: 5, left: 90 };
    Charts.width = Charts.CHART_WIDTH - Charts.margin.left - Charts.margin.right;
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
                var dataPoints = [], multiDataPoints, forecastDataPoints, dataUrl = attrs.metricUrl, metricId = attrs.metricId || '', metricTenantId = attrs.metricTenantId || '', metricType = attrs.metricType || 'gauge', timeRangeInSeconds = +attrs.timeRangeInSeconds || 43200, refreshIntervalInSeconds = +attrs.refreshIntervalInSeconds || 3600, alertValue = +attrs.alertValue, interpolation = attrs.interpolation || 'monotone', endTimestamp = Date.now(), startTimestamp = endTimestamp - timeRangeInSeconds, previousRangeDataPoints = [], annotationData = [], chartType = attrs.chartType || 'line', singleValueLabel = attrs.singleValueLabel || 'Raw Value', noDataLabel = attrs.noDataLabel || 'No Data', durationLabel = attrs.durationLabel || 'Interval', minLabel = attrs.minLabel || 'Min', maxLabel = attrs.maxLabel || 'Max', avgLabel = attrs.avgLabel || 'Avg', timestampLabel = attrs.timestampLabel || 'Timestamp', showAvgLine = true, showDataPoints = false, hideHighLowValues = false, useZeroMinValue = false;
                // chart specific vars
                var adjustedChartHeight = Charts.CHART_HEIGHT - 50, height = adjustedChartHeight - Charts.margin.top - Charts.margin.bottom, smallChartThresholdInPixels = 600, titleHeight = 30, titleSpace = 10, innerChartHeight = height + Charts.margin.top - titleHeight - titleSpace + Charts.margin.bottom, adjustedChartHeight2 = +titleHeight + titleSpace + Charts.margin.top, chartData, yScale, timeScale, yAxis, xAxis, tip, brush, brushGroup, chart, chartParent, svg, visuallyAdjustedMin, visuallyAdjustedMax, avg, peak, min, processedNewData, processedPreviousRangeData;
                var hasInit = false;
                dataPoints = attrs.data;
                forecastDataPoints = attrs.forecastData;
                showDataPoints = attrs.showDataPoints;
                previousRangeDataPoints = attrs.previousRangeData;
                annotationData = attrs.annotationData;
                var startIntervalPromise;
                function getChartWidth() {
                    //return angular.element('#' + chartContext.chartHandle).width();
                    return Charts.CHART_WIDTH;
                }
                function useSmallCharts() {
                    return getChartWidth() <= smallChartThresholdInPixels;
                }
                function initialization() {
                    // destroy any previous charts
                    if (chart) {
                        chartParent.selectAll('*').remove();
                    }
                    chartParent = d3.select(element[0]);
                    chart = chartParent.append('svg')
                        .attr('viewBox', '0 0 760 ' + (Charts.CHART_HEIGHT + Charts.Y_AXIS_HEIGHT))
                        .attr('preserveAspectRatio', 'xMinYMin meet');
                    Charts.createSvgDefs(chart);
                    svg = chart.append('g')
                        .attr('width', Charts.width + Charts.margin.left + Charts.margin.right)
                        .attr('height', innerChartHeight)
                        .attr('transform', 'translate(' + Charts.margin.left + ',' + (adjustedChartHeight2) + ')');
                    tip = d3.tip()
                        .attr('class', 'd3-tip')
                        .offset([-10, 0])
                        .html(function (d, i) {
                        return buildHover(d, i);
                    });
                    svg.call(tip);
                    // a placeholder for the alerts
                    svg.append('g').attr('class', 'alertHolder');
                    hasInit = true;
                }
                function setupFilteredData(dataPoints) {
                    if (dataPoints) {
                        peak = d3.max(dataPoints.map(function (d) {
                            return !Charts.isEmptyDataPoint(d) ? (d.avg || d.value) : 0;
                        }));
                        min = d3.min(dataPoints.map(function (d) {
                            return !Charts.isEmptyDataPoint(d) ? (d.avg || d.value) : undefined;
                        }));
                    }
                    /// lets adjust the min and max to add some visual spacing between it and the axes
                    visuallyAdjustedMin = useZeroMinValue ? 0 : min * .95;
                    visuallyAdjustedMax = peak + ((peak - min) * 0.2);
                    /// check if we need to adjust high/low bound to fit alert value
                    if (alertValue) {
                        visuallyAdjustedMax = Math.max(visuallyAdjustedMax, alertValue * 1.2);
                        visuallyAdjustedMin = Math.min(visuallyAdjustedMin, alertValue * .95);
                    }
                    /// use default Y scale in case high and low bound are 0 (ie, no values or all 0)
                    visuallyAdjustedMax = !!!visuallyAdjustedMax && !!!visuallyAdjustedMin ? Charts.DEFAULT_Y_SCALE : visuallyAdjustedMax;
                }
                function determineScale(dataPoints) {
                    var xTicks, numberOfBarsForSmallGraph = 20;
                    if (dataPoints.length > 0) {
                        // if window is too small server up small chart
                        if (useSmallCharts()) {
                            Charts.width = 250;
                            xTicks = 3;
                            chartData = dataPoints.slice(dataPoints.length - numberOfBarsForSmallGraph, dataPoints.length);
                        }
                        else {
                            //  we use the width already defined above
                            xTicks = 9;
                            chartData = dataPoints;
                        }
                        setupFilteredData(dataPoints);
                        yScale = d3.scale.linear()
                            .clamp(true)
                            .rangeRound([height, 0])
                            .domain([visuallyAdjustedMin, visuallyAdjustedMax]);
                        yAxis = d3.svg.axis()
                            .scale(yScale)
                            .ticks(5)
                            .tickSize(4, 4, 0)
                            .orient('left');
                        var timeScaleMin = d3.min(dataPoints.map(function (d) {
                            return d.timestamp;
                        }));
                        var timeScaleMax;
                        if (forecastDataPoints && forecastDataPoints.length > 0) {
                            timeScaleMax = forecastDataPoints[forecastDataPoints.length - 1].timestamp;
                        }
                        else {
                            timeScaleMax = d3.max(dataPoints.map(function (d) {
                                return d.timestamp;
                            }));
                        }
                        timeScale = d3.time.scale()
                            .range([0, Charts.width])
                            .domain([timeScaleMin, timeScaleMax]);
                        xAxis = d3.svg.axis()
                            .scale(timeScale)
                            .ticks(xTicks)
                            .tickFormat(Charts.xAxisTimeFormats())
                            .tickSize(4, 4, 0)
                            .orient('bottom');
                    }
                }
                function setupFilteredMultiData(multiDataPoints) {
                    var alertPeak, highPeak;
                    function determineMultiDataMinMax() {
                        var currentMax, currentMin, seriesMax, seriesMin, maxList = [], minList = [];
                        multiDataPoints.forEach(function (series) {
                            currentMax = d3.max(series.values.map(function (d) {
                                return Charts.isEmptyDataPoint(d) ? 0 : d.avg;
                            }));
                            maxList.push(currentMax);
                            currentMin = d3.min(series.values.map(function (d) {
                                return !Charts.isEmptyDataPoint(d) ? d.avg : Number.MAX_VALUE;
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
                    visuallyAdjustedMin = useZeroMinValue ? 0 : min - (min * 0.05);
                    if (alertValue) {
                        alertPeak = (alertValue * 1.2);
                        highPeak = peak + ((peak - min) * 0.2);
                        visuallyAdjustedMax = alertPeak > highPeak ? alertPeak : highPeak;
                    }
                    else {
                        visuallyAdjustedMax = peak + ((peak - min) * 0.2);
                    }
                    return [visuallyAdjustedMin, !!!visuallyAdjustedMax && !!!visuallyAdjustedMin ? Charts.DEFAULT_Y_SCALE : visuallyAdjustedMax];
                }
                function determineMultiScale(multiDataPoints) {
                    var xTicks = 9;
                    if (multiDataPoints && multiDataPoints[0] && multiDataPoints[0].values) {
                        var lowHigh = setupFilteredMultiData(multiDataPoints);
                        visuallyAdjustedMin = lowHigh[0];
                        visuallyAdjustedMax = lowHigh[1];
                        yScale = d3.scale.linear()
                            .clamp(true)
                            .rangeRound([height, 0])
                            .domain([visuallyAdjustedMin, visuallyAdjustedMax]);
                        yAxis = d3.svg.axis()
                            .scale(yScale)
                            .ticks(5)
                            .tickSize(4, 4, 0)
                            .orient('left');
                        timeScale = d3.time.scale()
                            .range([0, Charts.width])
                            .domain([d3.min(multiDataPoints, function (d) { return d3.min(d.values, function (p) { return p.timestamp; }); }),
                            d3.max(multiDataPoints, function (d) { return d3.max(d.values, function (p) { return p.timestamp; }); })]);
                        xAxis = d3.svg.axis()
                            .scale(timeScale)
                            .ticks(xTicks)
                            .tickFormat(Charts.xAxisTimeFormats())
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
                function loadStandAloneMetricsForTimeRange(url, metricId, startTimestamp, endTimestamp, buckets) {
                    if (buckets === void 0) { buckets = 60; }
                    var requestConfig = {
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
                        var metricTypeAndData = metricType.split('-');
                        /// sample url:
                        /// http://localhost:8080/hawkular/metrics/gauges/45b2256eff19cb982542b167b3957036.status.duration/data?
                        // buckets=120&end=1436831797533&start=1436828197533'
                        $http.get(url + '/' + metricTypeAndData[0] + 's/' + metricId + '/' + (metricTypeAndData[1] || 'data'), requestConfig).success(function (response) {
                            processedNewData = formatBucketedChartOutput(response);
                            scope.render(processedNewData, processedPreviousRangeData);
                        }).error(function (reason, status) {
                            $log.error('Error Loading Chart Data:' + status + ', ' + reason);
                        });
                    }
                }
                /**
                 * Transform the raw http response from Metrics to one usable in charts
                 * @param response
                 * @returns transformed response to IChartDataPoint[], ready to be charted
                 */
                function formatBucketedChartOutput(response) {
                    //  The schema is different for bucketed output
                    if (response) {
                        return response.map(function (point) {
                            var timestamp = point.timestamp || (point.start + (point.end - point.start) / 2);
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
                function buildHover(d, i) {
                    var hover, prevTimestamp, currentTimestamp = d.timestamp, barDuration, formattedDateTime = moment(d.timestamp).format(Charts.HOVER_DATE_TIME_FORMAT);
                    if (i > 0) {
                        prevTimestamp = chartData[i - 1].timestamp;
                        barDuration = moment(currentTimestamp).from(moment(prevTimestamp), true);
                    }
                    if (Charts.isEmptyDataPoint(d)) {
                        // nodata
                        hover = "<div class='chartHover'>\n                <small class='chartHoverLabel'>" + noDataLabel + "</small>\n                <div><small><span class='chartHoverLabel'>" + durationLabel + "</span><span>: </span><span class='chartHoverValue'>" + barDuration + "</span></small> </div>\n                <hr/>\n                <div><small><span class='chartHoverLabel'>" + timestampLabel + "</span><span>: </span><span class='chartHoverValue'>" + formattedDateTime + "</span></small></div>\n                </div>";
                    }
                    else {
                        if (Charts.isRawMetric(d)) {
                            // raw single value from raw table
                            hover = "<div class='chartHover'>\n                <div><small><span class='chartHoverLabel'>" + timestampLabel + "</span><span>: </span><span class='chartHoverValue'>" + formattedDateTime + "</span></small></div>\n                  <div><small><span class='chartHoverLabel'>" + durationLabel + "</span><span>: </span><span class='chartHoverValue'>" + barDuration + "</span></small></div>\n                  <hr/>\n                  <div><small><span class='chartHoverLabel'>" + singleValueLabel + "</span><span>: </span><span class='chartHoverValue'>" + d3.round(d.value, 2) + "</span></small> </div>\n                  </div> ";
                        }
                        else {
                            // aggregate with min/avg/max
                            hover = "<div class='chartHover'>\n                    <div class=\"info-item\">\n                      <span class='chartHoverLabel'>" + timestampLabel + ":</span>\n                      <span class='chartHoverValue'>" + formattedDateTime + "</span>\n                    </div>\n                    <div class=\"info-item before-separator\">\n                      <span class='chartHoverLabel'>" + durationLabel + ":</span>\n                      <span class='chartHoverValue'>" + barDuration + "</span>\n                    </div>\n                    <div class=\"info-item separator\">\n                      <span class='chartHoverLabel'>" + maxLabel + ":</span>\n                      <span class='chartHoverValue'>" + d3.round(d.max, 2) + "</span>\n                    </div>\n                    <div class=\"info-item\">\n                      <span class='chartHoverLabel'>" + avgLabel + ":</span>\n                      <span class='chartHoverValue'>" + d3.round(d.avg, 2) + "</span>\n                    </div>\n                    <div class=\"info-item\">\n                      <span class='chartHoverLabel'>" + minLabel + ":</span>\n                      <span class='chartHoverValue'>" + d3.round(d.min, 2) + "</span>\n                    </div>\n                  </div> ";
                        }
                    }
                    return hover;
                }
                function createMultiLineChart(multiDataPoints) {
                    var colorScale = d3.scale.category10(), g = 0;
                    if (multiDataPoints) {
                        // before updating, let's remove those missing from datapoints (if any)
                        svg.selectAll('path[id^=\'multiLine\']')[0].forEach(function (existingPath) {
                            var stillExists = false;
                            multiDataPoints.forEach(function (singleChartData) {
                                singleChartData.keyHash = singleChartData.keyHash || ('multiLine' + Charts.hashString(singleChartData.key));
                                if (existingPath.getAttribute('id') === singleChartData.keyHash) {
                                    stillExists = true;
                                }
                            });
                            if (!stillExists) {
                                existingPath.remove();
                            }
                        });
                        multiDataPoints.forEach(function (singleChartData) {
                            if (singleChartData && singleChartData.values) {
                                singleChartData.keyHash = singleChartData.keyHash || ('multiLine' + Charts.hashString(singleChartData.key));
                                var pathMultiLine = svg.selectAll('path#' + singleChartData.keyHash).data([singleChartData.values]);
                                // update existing
                                pathMultiLine.attr('id', singleChartData.keyHash)
                                    .attr('class', 'multiLine')
                                    .attr('fill', 'none')
                                    .attr('stroke', function () {
                                    return singleChartData.color || colorScale(g++);
                                })
                                    .transition()
                                    .attr('d', createLine('linear'));
                                // add new ones
                                pathMultiLine.enter().append('path')
                                    .attr('id', singleChartData.keyHash)
                                    .attr('class', 'multiLine')
                                    .attr('fill', 'none')
                                    .attr('stroke', function () {
                                    if (singleChartData.color) {
                                        return singleChartData.color;
                                    }
                                    else {
                                        return colorScale(g++);
                                    }
                                })
                                    .transition()
                                    .attr('d', createLine('linear'));
                                // remove old ones
                                pathMultiLine.exit().remove();
                            }
                        });
                    }
                    else {
                        $log.warn('No multi-data set for multiline chart');
                    }
                }
                function createYAxisGridLines() {
                    // create the y axis grid lines
                    if (yScale) {
                        var yAxis_1 = svg.selectAll('g.grid.y_grid');
                        if (!yAxis_1[0].length) {
                            yAxis_1 = svg.append('g').classed('grid y_grid', true);
                        }
                        yAxis_1
                            .call(d3.svg.axis()
                            .scale(yScale)
                            .orient('left')
                            .ticks(10)
                            .tickSize(-Charts.width, 0)
                            .tickFormat(''));
                    }
                }
                function createXandYAxes() {
                    function axisTransition(selection) {
                        selection
                            .transition()
                            .delay(250)
                            .duration(750)
                            .attr("opacity", 1.0);
                    }
                    if (yAxis) {
                        svg.selectAll('g.axis').remove();
                        // create x-axis
                        var xAxisGroup = svg.append('g')
                            .attr('class', 'x axis')
                            .attr('transform', 'translate(0,' + height + ')')
                            .attr("opacity", 0.3)
                            .call(xAxis)
                            .call(axisTransition);
                        // create y-axis
                        var yAxisGroup = svg.append('g')
                            .attr('class', 'y axis')
                            .attr("opacity", 0.3)
                            .call(yAxis)
                            .call(axisTransition);
                        var yAxisLabel = svg.selectAll('.yAxisUnitsLabel');
                        if (yAxisLabel.empty()) {
                            yAxisLabel = svg.append('text').attr('class', 'yAxisUnitsLabel')
                                .attr('transform', 'rotate(-90),translate(-10,-50)')
                                .attr('x', -Charts.CHART_HEIGHT / 2)
                                .style('text-anchor', 'start')
                                .text(attrs.yAxisUnits === 'NONE' ? '' : attrs.yAxisUnits)
                                .attr("opacity", 0.3)
                                .call(axisTransition);
                        }
                    }
                }
                function createCenteredLine(newInterpolation) {
                    var interpolate = newInterpolation || 'monotone', line = d3.svg.line()
                        .interpolate(interpolate)
                        .defined(function (d) {
                        return !Charts.isEmptyDataPoint(d);
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
                        return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                    });
                    return line;
                }
                function createLine(newInterpolation) {
                    var interpolate = newInterpolation || 'monotone', line = d3.svg.line()
                        .interpolate(interpolate)
                        .defined(function (d) {
                        return !Charts.isEmptyDataPoint(d);
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
                        return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
                    });
                    return line;
                }
                function createAvgLines() {
                    if (chartType === 'bar' || chartType === 'scatterline') {
                        var pathAvgLine = svg.selectAll('.barAvgLine').data([chartData]);
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
                function createXAxisBrush() {
                    brushGroup = svg.selectAll('g.brush');
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
                        var extent = brush.extent(), startTime = Math.round(extent[0].getTime()), endTime = Math.round(extent[1].getTime()), dragSelectionDelta = endTime - startTime;
                        svg.classed('selecting', !d3.event.target.empty());
                        // ignore range selections less than 1 minute
                        if (dragSelectionDelta >= 60000) {
                            forecastDataPoints = [];
                            showForecastData(forecastDataPoints);
                            $rootScope.$broadcast(Charts.EventNames.CHART_TIMERANGE_CHANGED.toString(), extent);
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
                            .attr('cx', function (d) {
                            return timeScale(d.timestamp);
                        })
                            .attr('cy', function () {
                            return height - yScale(visuallyAdjustedMax);
                        })
                            .style('fill', function (d) {
                            if (d.severity === '1') {
                                return 'red';
                            }
                            else if (d.severity === '2') {
                                return 'yellow';
                            }
                            else {
                                return 'white';
                            }
                        });
                    }
                }
                function createForecastLine(newInterpolation) {
                    var interpolate = newInterpolation || 'monotone', line = d3.svg.line()
                        .interpolate(interpolate)
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
                        return yScale(d.value);
                    });
                    return line;
                }
                function showForecastData(forecastData) {
                    var forecastPathLine = svg.selectAll('.forecastLine').data([forecastData]);
                    // update existing
                    forecastPathLine.attr('class', 'forecastLine')
                        .attr('d', createForecastLine('monotone'));
                    // add new ones
                    forecastPathLine.enter().append('path')
                        .attr('class', 'forecastLine')
                        .attr('d', createForecastLine('monotone'));
                    // remove old ones
                    forecastPathLine.exit().remove();
                }
                scope.$watchCollection('data', function (newData) {
                    if (newData) {
                        processedNewData = angular.fromJson(newData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                });
                scope.$watch('multiData', function (newMultiData) {
                    if (newMultiData) {
                        multiDataPoints = angular.fromJson(newMultiData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                }, true);
                scope.$watch('previousRangeData', function (newPreviousRangeValues) {
                    if (newPreviousRangeValues) {
                        //$log.debug('Previous Range data changed');
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
                scope.$watch('forecastData', function (newForecastData) {
                    if (newForecastData) {
                        forecastDataPoints = angular.fromJson(newForecastData);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                }, true);
                scope.$watchGroup(['alertValue', 'chartType', 'hideHighLowValues', 'useZeroMinValue', 'showAvgLine'], function (chartAttrs) {
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
                scope.$watchGroup(['metricUrl', 'metricId', 'metricType', 'metricTenantId', 'timeRangeInSeconds'], function (standAloneParams) {
                    dataUrl = standAloneParams[0] || dataUrl;
                    metricId = standAloneParams[1] || metricId;
                    metricType = standAloneParams[2] || metricId;
                    metricTenantId = standAloneParams[3] || metricTenantId;
                    timeRangeInSeconds = standAloneParams[4] || timeRangeInSeconds;
                    loadStandAloneMetricsTimeRangeFromNow();
                });
                scope.$watch('refreshIntervalInSeconds', function (newRefreshInterval) {
                    if (newRefreshInterval) {
                        refreshIntervalInSeconds = +newRefreshInterval;
                        $interval.cancel(startIntervalPromise);
                        startIntervalPromise = $interval(function () {
                            loadStandAloneMetricsTimeRangeFromNow();
                        }, refreshIntervalInSeconds * 1000);
                    }
                });
                scope.$on('$destroy', function () {
                    $interval.cancel(startIntervalPromise);
                });
                scope.$on('DateRangeDragChanged', function (event, extent) {
                    scope.$emit('GraphTimeRangeChangedEvent', extent);
                });
                function determineChartType(chartType) {
                    switch (chartType) {
                        case 'rhqbar':
                            Charts.createHistogramChart(svg, timeScale, yScale, chartData, height, true, visuallyAdjustedMax, hideHighLowValues);
                            break;
                        case 'histogram':
                            Charts.createHistogramChart(svg, timeScale, yScale, chartData, height, false, visuallyAdjustedMax, hideHighLowValues);
                            break;
                        case 'line':
                            Charts.createLineChart(svg, timeScale, yScale, chartData, height, interpolation);
                            break;
                        case 'hawkularmetric':
                            $log.info('DEPRECATION WARNING: The chart type hawkularmetric has been deprecated and will be' +
                                ' removed in a future' +
                                ' release. Please use the line chart type in its place');
                            Charts.createLineChart(svg, timeScale, yScale, chartData, height, interpolation);
                            break;
                        case 'multiline':
                            createMultiLineChart(multiDataPoints);
                            break;
                        case 'area':
                            Charts.createAreaChart(svg, timeScale, yScale, chartData, height, interpolation, hideHighLowValues);
                            break;
                        case 'scatter':
                            Charts.createScatterChart(svg, timeScale, yScale, chartData, height, interpolation, hideHighLowValues);
                            break;
                        case 'scatterline':
                            Charts.createScatterLineChart(svg, timeScale, yScale, chartData, height, interpolation, hideHighLowValues);
                            break;
                        default:
                            $log.warn('chart-type is not valid. Must be in' +
                                ' [rhqbar,line,area,multiline,scatter,scatterline,histogram] chart type: ' + chartType);
                    }
                }
                scope.render = function (dataPoints, previousRangeDataPoints) {
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
                    if (alertValue && (alertValue > visuallyAdjustedMin && alertValue < visuallyAdjustedMax)) {
                        var alertBounds = Charts.extractAlertRanges(chartData, alertValue);
                        Charts.createAlertBoundsArea(svg, timeScale, yScale, visuallyAdjustedMax, alertBounds);
                    }
                    createXAxisBrush();
                    createYAxisGridLines();
                    determineChartType(chartType);
                    if (showDataPoints) {
                        Charts.createDataPoints(svg, timeScale, yScale, tip, chartData);
                    }
                    createPreviousRangeOverlay(previousRangeDataPoints);
                    createXandYAxes();
                    if (showAvgLine) {
                        createAvgLines();
                    }
                    if (alertValue && (alertValue > visuallyAdjustedMin && alertValue < visuallyAdjustedMax)) {
                        /// NOTE: this alert line has higher precedence from alert area above
                        Charts.createAlertLine(svg, timeScale, yScale, chartData, alertValue, 'alertLine');
                    }
                    if (annotationData) {
                        annotateChart(annotationData);
                    }
                    if (forecastDataPoints && forecastDataPoints.length > 0) {
                        showForecastData(forecastDataPoints);
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
                    forecastData: '=',
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
    ]);
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var Y_AXIS_HEIGHT = 15;
    var _module = angular.module('hawkular.charts');
    var SparklineChartDirective = (function () {
        function SparklineChartDirective($rootScope) {
            var _this = this;
            this.restrict = 'E';
            this.replace = true;
            this.scope = {
                data: '=',
                showYAxisValues: '=',
                showXAxisValues: '=',
                alertValue: '@',
            };
            this.link = function (scope, element, attrs) {
                var margin = { top: 10, right: 5, bottom: 5, left: 45 };
                // data specific vars
                var chartHeight = SparklineChartDirective._CHART_HEIGHT, width = SparklineChartDirective._CHART_WIDTH - margin.left - margin.right, height = chartHeight - margin.top - margin.bottom, innerChartHeight = height + margin.top, showXAxisValues, showYAxisValues, yScale, yAxis, yAxisGroup, timeScale, xAxis, xAxisGroup, chart, chartParent, svg, alertValue;
                if (typeof attrs.alertValue != 'undefined') {
                    alertValue = +attrs.alertValue;
                }
                if (typeof attrs.showXAxisValues != 'undefined') {
                    showXAxisValues = attrs.showXAxisValues === 'true';
                }
                if (typeof attrs.showYAxisValues != 'undefined') {
                    showYAxisValues = attrs.showYAxisValues === 'true';
                }
                function setup() {
                    // destroy any previous charts
                    if (chart) {
                        chartParent.selectAll('*').remove();
                    }
                    chartParent = d3.select(element[0]);
                    chart = chartParent.append('svg')
                        .attr('width', width + margin.left + margin.right)
                        .attr('height', innerChartHeight)
                        .attr('viewBox', '0 0 ' + (width + margin.left + margin.right) + ' ' + (height + margin.top +
                        margin.bottom + Y_AXIS_HEIGHT))
                        .attr('preserveAspectRatio', 'xMinYMin meet');
                    svg = chart.append('g')
                        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
                        .attr('class', 'sparkline');
                }
                function createSparklineChart(dataPoints) {
                    timeScale = d3.time.scale()
                        .range([0, width - 10])
                        .nice()
                        .domain([dataPoints[0].timestamp, dataPoints[dataPoints.length - 1].timestamp]);
                    var numberOfXTicks = showXAxisValues ? 2 : 0;
                    xAxis = d3.svg.axis()
                        .scale(timeScale)
                        .ticks(numberOfXTicks)
                        .tickSize(4, 0)
                        .tickFormat(Charts.xAxisTimeFormats())
                        .orient('bottom');
                    svg.selectAll('g.axis').remove();
                    var yMin = d3.min(dataPoints, function (d) {
                        return d.avg;
                    });
                    var yMax = d3.max(dataPoints, function (d) {
                        return d.avg;
                    });
                    // give a pad of % to min/max so we are not against x-axis
                    yMax = yMax + (yMax * 0.03);
                    yMin = yMin - (yMin * 0.05);
                    yScale = d3.scale.linear()
                        .rangeRound([SparklineChartDirective._CHART_HEIGHT - Y_AXIS_HEIGHT, 0])
                        .domain([yMin, yMax]);
                    var numberOfYTicks = showYAxisValues ? 2 : 0;
                    yAxis = d3.svg.axis()
                        .scale(yScale)
                        .ticks(numberOfYTicks)
                        .tickSize(3, 0)
                        .orient("left");
                    var interpolationType = 'basis';
                    var area = d3.svg.area()
                        .interpolate(interpolationType)
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y0(function (d) {
                        return SparklineChartDirective._CHART_HEIGHT - Y_AXIS_HEIGHT;
                    })
                        .y1(function (d) {
                        return yScale(d.avg);
                    });
                    // this is the line that caps the area
                    var sparklineLine = d3.svg.line()
                        .interpolate(interpolationType)
                        .defined(function (d) {
                        return !d.empty;
                    })
                        .x(function (d) {
                        return timeScale(d.timestamp);
                    })
                        .y(function (d) {
                        // -2 pixels to keep the 2 pixel line from crossing over the x-axis
                        return yScale(d.avg) - 2;
                    });
                    var pathSparklineLine = svg.selectAll('path.sparklineLine')
                        .data([dataPoints]);
                    // update existing
                    pathSparklineLine.attr('class', 'sparklineLine')
                        .transition()
                        .attr('d', sparklineLine);
                    // add new ones
                    pathSparklineLine.enter().append('path')
                        .attr('class', 'sparklineLine')
                        .transition()
                        .attr('d', sparklineLine);
                    // remove old ones
                    pathSparklineLine.exit().remove();
                    var sparklineArea = svg.append("g")
                        .attr("class", "sparkline");
                    sparklineArea.append("path")
                        .datum(dataPoints)
                        .transition()
                        .duration(500)
                        .attr("class", "sparklineArea")
                        .attr("d", area);
                    //if (alertValue && (alertValue >= yMin && alertValue <= yMax)) {
                    //  let alertBounds: AlertBound[] = extractAlertRanges(dataPoints, alertValue);
                    //  createAlertBoundsArea(svg,timeScale, yScale,yMax, alertBounds);
                    //}
                    // place the x and y axes above the chart
                    yAxisGroup = svg.append('g')
                        .attr('class', 'y axis')
                        .call(yAxis);
                    xAxisGroup = svg.append('g')
                        .attr('class', 'x axis')
                        .attr('transform', 'translate(0,' + height + ')')
                        .call(xAxis);
                    if (alertValue && (alertValue >= yMin && alertValue <= yMax)) {
                        /// NOTE: this alert line has higher precedence from alert area above
                        Charts.createAlertLine(svg, timeScale, yScale, dataPoints, alertValue, 'sparklineAlertLine');
                    }
                }
                scope.$watchCollection('data', function (newData) {
                    console.log('Sparkline Chart Data Changed');
                    if (newData) {
                        _this.dataPoints = formatBucketedChartOutput(angular.fromJson(newData));
                        scope.render(_this.dataPoints);
                    }
                });
                scope.$watchCollection('alertValue', function (newAlertValue) {
                    console.log('Sparkline AlertValue Changed');
                    if (newAlertValue) {
                        alertValue = newAlertValue;
                        if (_this.dataPoints) {
                            scope.render(_this.dataPoints);
                        }
                    }
                });
                function formatBucketedChartOutput(response) {
                    //  The schema is different for bucketed output
                    if (response) {
                        return response.map(function (point) {
                            var timestamp = point.timestamp || (point.start + (point.end - point.start) / 2);
                            return {
                                timestamp: timestamp,
                                //date: new Date(timestamp),
                                value: !angular.isNumber(point.value) ? undefined : point.value,
                                avg: (point.empty) ? undefined : point.avg,
                                min: !angular.isNumber(point.min) ? undefined : point.min,
                                max: !angular.isNumber(point.max) ? undefined : point.max,
                                empty: point.empty
                            };
                        });
                    }
                }
                scope.render = function (dataPoints) {
                    if (dataPoints && dataPoints.length > 0) {
                        console.group('Render Sparkline Chart');
                        console.time('SparklineChartRender');
                        ///NOTE: layering order is important!
                        setup();
                        createSparklineChart(dataPoints);
                        console.timeEnd('SparklineChartRender');
                        console.groupEnd();
                    }
                };
            };
        }
        SparklineChartDirective.Factory = function () {
            var directive = function ($rootScope) {
                return new SparklineChartDirective($rootScope);
            };
            directive['$inject'] = ['$rootScope'];
            return directive;
        };
        SparklineChartDirective._CHART_WIDTH = 300;
        SparklineChartDirective._CHART_HEIGHT = 80;
        return SparklineChartDirective;
    })();
    Charts.SparklineChartDirective = SparklineChartDirective;
    _module.directive('hawkularSparklineChart', SparklineChartDirective.Factory());
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    function calcBarWidth(width, length, barOffset) {
        if (barOffset === void 0) { barOffset = Charts.BAR_OFFSET; }
        return (width / length - barOffset);
    }
    Charts.calcBarWidth = calcBarWidth;
    // Calculates the bar width adjusted so that the first and last are half-width of the others
    // see https://issues.jboss.org/browse/HAWKULAR-809 for info on why this is needed
    function calcBarWidthAdjusted(i, length) {
        return (i === 0 || i === length - 1) ? calcBarWidth(Charts.width, length, Charts.BAR_OFFSET) / 2 :
            calcBarWidth(Charts.width, length, Charts.BAR_OFFSET);
    }
    Charts.calcBarWidthAdjusted = calcBarWidthAdjusted;
    // Calculates the bar X position. When using calcBarWidthAdjusted, it is required to push bars
    // other than the first half bar to the left, to make up for the first being just half width
    function calcBarXPos(d, i, timeScale, length) {
        return timeScale(d.timestamp) - (i === 0 ? 0 : calcBarWidth(Charts.width, length, Charts.BAR_OFFSET) / 2);
    }
    Charts.calcBarXPos = calcBarXPos;
    /**
     * An empty datapoint has 'empty' attribute set to true. Used to distinguish from real 0 values.
     * @param d
     * @returns {boolean}
     */
    function isEmptyDataPoint(d) {
        return d.empty;
    }
    Charts.isEmptyDataPoint = isEmptyDataPoint;
    /**
     * Raw metrics have a 'value' set instead of avg/min/max of aggregates
     * @param d
     * @returns {boolean}
     */
    function isRawMetric(d) {
        return typeof d.avg === 'undefined';
    }
    Charts.isRawMetric = isRawMetric;
    function xAxisTimeFormats() {
        return d3.time.format.multi([
            [".%L", function (d) {
                    return d.getMilliseconds();
                }],
            [":%S", function (d) {
                    return d.getSeconds();
                }],
            ["%H:%M", function (d) {
                    return d.getMinutes();
                }],
            ["%H:%M", function (d) {
                    return d.getHours();
                }],
            ["%a %d", function (d) {
                    return d.getDay() && d.getDate() != 1;
                }],
            ["%b %d", function (d) {
                    return d.getDate() != 1;
                }],
            ["%B", function (d) {
                    return d.getMonth();
                }],
            ["%Y", function () {
                    return true;
                }]
        ]);
    }
    Charts.xAxisTimeFormats = xAxisTimeFormats;
    function createSvgDefs(chart) {
        var defs = chart.append('defs');
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
    Charts.createSvgDefs = createSvgDefs;
    function xMidPointStartPosition(d, timeScale) {
        return timeScale(d.timestamp);
    }
    Charts.xMidPointStartPosition = xMidPointStartPosition;
    // adapted from http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
    function hashString(str) {
        var hash = 0, i, chr, len;
        if (str.length == 0)
            return hash;
        for (i = 0, len = str.length; i < len; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }
    Charts.hashString = hashString;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    function createAreaChart(svg, timeScale, yScale, chartData, height, interpolation, hideHighLowValues) {
        var highArea = d3.svg.area()
            .interpolate(interpolation)
            .defined(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .x(function (d) {
            return timeScale(d);
        })
            .y(function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.max);
        })
            .y0(function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
        }), avgArea = d3.svg.area()
            .interpolate(interpolation)
            .defined(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .x(function (d) {
            return timeScale(d);
        })
            .y(function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
        }).y0(function (d) {
            return hideHighLowValues ? height : yScale(d.min);
        }), lowArea = d3.svg.area()
            .interpolate(interpolation)
            .defined(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .x(function (d) {
            return timeScale(d);
        })
            .y(function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.min);
        })
            .y0(function () {
            return height;
        });
        if (!hideHighLowValues) {
            var highAreaPath = svg.selectAll('path.highArea').data(chartData);
            // update existing
            highAreaPath.attr('class', 'highArea')
                .attr('d', highArea);
            // add new ones
            highAreaPath.enter().append('path')
                .attr('class', 'highArea')
                .attr('d', highArea);
            // remove old ones
            highAreaPath.exit().remove();
            var lowAreaPath = svg.selectAll('path.lowArea').data(chartData);
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
        var avgAreaPath = svg.selectAll('path.avgArea').data(chartData);
        // update existing
        avgAreaPath.attr('class', 'avgArea')
            .attr('d', avgArea);
        // add new ones
        avgAreaPath.enter().append('path')
            .attr('class', 'avgArea')
            .attr('d', avgArea);
        // remove old ones
        avgAreaPath.exit().remove();
    }
    Charts.createAreaChart = createAreaChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    function createHistogramChart(svg, timeScale, yScale, chartData, height, stacked, visuallyAdjustedMax, hideHighLowValues) {
        var barClass = stacked ? 'leaderBar' : 'histogram';
        var rectHistogram = svg.selectAll('rect.' + barClass).data(chartData);
        function buildBars(selection) {
            selection
                .attr('class', barClass)
                .on('mouseover', function (d, i) {
                //tip.show(d, i);
            }).on('mouseout', function () {
                //tip.hide();
            })
                .transition()
                .attr('x', function (d, i) {
                return Charts.calcBarXPos(d, i, timeScale, chartData.length);
            })
                .attr('width', function (d, i) {
                return Charts.calcBarWidthAdjusted(i, chartData.length);
            })
                .attr('y', function (d) {
                return Charts.isEmptyDataPoint(d) ? 0 : yScale(d.avg);
            })
                .attr('height', function (d) {
                return height - yScale(Charts.isEmptyDataPoint(d) ? yScale(visuallyAdjustedMax) : d.avg);
            })
                .attr('opacity', stacked ? '.6' : '1')
                .attr('fill', function (d, i) {
                return Charts.isEmptyDataPoint(d) ? 'url(#noDataStripes)' : (stacked ? '#D3D3D6' : '#C0C0C0');
            })
                .attr('stroke', function (d) {
                return '#777';
            })
                .attr('stroke-width', function (d) {
                return '0';
            })
                .attr('data-hawkular-value', function (d) {
                return d.avg;
            });
        }
        function buildHighBar(selection) {
            selection
                .attr('class', function (d) {
                return d.min === d.max ? 'singleValue' : 'high';
            })
                .attr('x', function (d, i) {
                return Charts.calcBarXPos(d, i, timeScale, chartData.length);
            })
                .attr('y', function (d) {
                return isNaN(d.max) ? yScale(visuallyAdjustedMax) : yScale(d.max);
            })
                .attr('height', function (d) {
                return Charts.isEmptyDataPoint(d) ? 0 : (yScale(d.avg) - yScale(d.max) || 2);
            })
                .attr('width', function (d, i) {
                return Charts.calcBarWidthAdjusted(i, chartData.length);
            })
                .attr('opacity', 0.9)
                .on('mouseover', function (d, i) {
                //tip.show(d, i);
            }).on('mouseout', function () {
                //tip.hide();
            });
        }
        function buildLowerBar(selection) {
            selection
                .attr('class', 'low')
                .attr('x', function (d, i) {
                return Charts.calcBarXPos(d, i, timeScale, chartData.length);
            })
                .attr('y', function (d) {
                return isNaN(d.avg) ? height : yScale(d.avg);
            })
                .attr('height', function (d) {
                return Charts.isEmptyDataPoint(d) ? 0 : (yScale(d.min) - yScale(d.avg));
            })
                .attr('width', function (d, i) {
                return Charts.calcBarWidthAdjusted(i, chartData.length);
            })
                .attr('opacity', 0.9)
                .on('mouseover', function (d, i) {
                //tip.show(d, i);
            }).on('mouseout', function () {
                //tip.hide();
            });
        }
        function buildTopStem(selection) {
            selection
                .attr('class', 'histogramTopStem')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('x1', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale);
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale);
            })
                .attr('y1', function (d) {
                return yScale(d.max);
            })
                .attr('y2', function (d) {
                return yScale(d.avg);
            })
                .attr('stroke', function (d) {
                return 'red';
            })
                .attr('stroke-opacity', function (d) {
                return 0.6;
            });
        }
        function buildLowStem(selection) {
            selection
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('class', 'histogramBottomStem')
                .attr('x1', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale);
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale);
            })
                .attr('y1', function (d) {
                return yScale(d.avg);
            })
                .attr('y2', function (d) {
                return yScale(d.min);
            })
                .attr('stroke', function (d) {
                return 'red';
            }).attr('stroke-opacity', function (d) {
                return 0.6;
            });
        }
        function buildTopCross(selection) {
            selection
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('class', 'histogramTopCross')
                .attr('x1', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale) - 3;
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale) + 3;
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
                return 0.6;
            });
        }
        function buildBottomCross(selection) {
            selection
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('class', 'histogramBottomCross')
                .attr('x1', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale) - 3;
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale) + 3;
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
                return 0.6;
            });
        }
        function createHistogramHighLowValues(svg, chartData, stacked) {
            if (stacked) {
                // upper portion representing avg to high
                var rectHigh = svg.selectAll('rect.high, rect.singleValue').data(chartData);
                // update existing
                rectHigh.call(buildHighBar);
                // add new ones
                rectHigh
                    .enter()
                    .append('rect')
                    .call(buildHighBar);
                // remove old ones
                rectHigh.exit().remove();
                // lower portion representing avg to low
                var rectLow = svg.selectAll('rect.low').data(chartData);
                // update existing
                rectLow.call(buildLowerBar);
                // add new ones
                rectLow
                    .enter()
                    .append('rect')
                    .call(buildLowerBar);
                // remove old ones
                rectLow.exit().remove();
            }
            else {
                var lineHistoHighStem = svg.selectAll('.histogramTopStem').data(chartData);
                // update existing
                lineHistoHighStem.call(buildTopStem);
                // add new ones
                lineHistoHighStem
                    .enter()
                    .append('line')
                    .call(buildTopStem);
                // remove old ones
                lineHistoHighStem.exit().remove();
                var lineHistoLowStem = svg.selectAll('.histogramBottomStem').data(chartData);
                // update existing
                lineHistoLowStem.call(buildLowStem);
                // add new ones
                lineHistoLowStem
                    .enter()
                    .append('line')
                    .call(buildLowStem);
                // remove old ones
                lineHistoLowStem.exit().remove();
                var lineHistoTopCross = svg.selectAll('.histogramTopCross').data(chartData);
                // update existing
                lineHistoTopCross.call(buildTopCross);
                // add new ones
                lineHistoTopCross
                    .enter()
                    .append('line')
                    .call(buildTopCross);
                // remove old ones
                lineHistoTopCross.exit().remove();
                var lineHistoBottomCross = svg.selectAll('.histogramBottomCross').data(chartData);
                // update existing
                lineHistoBottomCross.call(buildBottomCross);
                // add new ones
                lineHistoBottomCross
                    .enter()
                    .append('line')
                    .call(buildBottomCross);
                // remove old ones
                lineHistoBottomCross.exit().remove();
            }
        }
        // update existing
        rectHistogram.call(buildBars);
        // add new ones
        rectHistogram.enter()
            .append('rect')
            .call(buildBars);
        // remove old ones
        rectHistogram.exit().remove();
        if (!hideHighLowValues) {
            createHistogramHighLowValues(svg, chartData, stacked);
        }
        else {
            // we should hide high-low values.. or remove if existing
            svg.selectAll('.histogramTopStem, .histogramBottomStem, .histogramTopCross, .histogramBottomCross').remove();
        }
    }
    Charts.createHistogramChart = createHistogramChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    function createLineChart(svg, timeScale, yScale, chartData, height, interpolation) {
        var metricChartLine = d3.svg.line()
            .interpolate(interpolation)
            .defined(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .x(function (d) {
            return timeScale(d.timestamp);
        })
            .y(function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
        });
        var pathMetric = svg.selectAll('path.metricLine').data([chartData]);
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
    Charts.createLineChart = createLineChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    function createScatterChart(svg, timeScale, yScale, chartData, height, interpolation, hideHighLowValues) {
        if (!hideHighLowValues) {
            var highDotCircle = svg.selectAll('.highDot').data(chartData);
            // update existing
            highDotCircle.attr('class', 'highDot')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('r', 3)
                .attr('cx', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale);
            })
                .attr('cy', function (d) {
                return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.max);
            })
                .style('fill', function () {
                return '#ff1a13';
            }).on('mouseover', function (d, i) {
                //tip.show(d, i);
            }).on('mouseout', function () {
                //tip.hide();
            });
            // add new ones
            highDotCircle.enter().append('circle')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('class', 'highDot')
                .attr('r', 3)
                .attr('cx', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale);
            })
                .attr('cy', function (d) {
                return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.max);
            })
                .style('fill', function () {
                return '#ff1a13';
            }).on('mouseover', function (d, i) {
                //tip.show(d, i);
            }).on('mouseout', function () {
                //tip.hide();
            });
            // remove old ones
            highDotCircle.exit().remove();
            var lowDotCircle = svg.selectAll('.lowDot').data(chartData);
            // update existing
            lowDotCircle.attr('class', 'lowDot')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('r', 3)
                .attr('cx', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale);
            })
                .attr('cy', function (d) {
                return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.min);
            })
                .style('fill', function () {
                return '#70c4e2';
            }).on('mouseover', function (d, i) {
                //tip.show(d, i);
            }).on('mouseout', function () {
                //tip.hide();
            });
            // add new ones
            lowDotCircle.enter().append('circle')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('class', 'lowDot')
                .attr('r', 3)
                .attr('cx', function (d) {
                return Charts.xMidPointStartPosition(d, timeScale);
            })
                .attr('cy', function (d) {
                return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.min);
            })
                .style('fill', function () {
                return '#70c4e2';
            }).on('mouseover', function (d, i) {
                //tip.show(d, i);
            }).on('mouseout', function () {
                //tip.hide();
            });
            // remove old ones
            lowDotCircle.exit().remove();
        }
        else {
            // we should hide high-low values.. or remove if existing
            svg.selectAll('.highDot, .lowDot').remove();
        }
        var avgDotCircle = svg.selectAll('.avgDot').data(chartData);
        // update existing
        avgDotCircle.attr('class', 'avgDot')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('r', 3)
            .attr('cx', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('cy', function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
        })
            .style('fill', function () {
            return '#FFF';
        }).on('mouseover', function (d, i) {
            //tip.show(d, i);
        }).on('mouseout', function () {
            //tip.hide();
        });
        // add new ones
        avgDotCircle.enter().append('circle')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('class', 'avgDot')
            .attr('r', 3)
            .attr('cx', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('cy', function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
        })
            .style('fill', function () {
            return '#FFF';
        }).on('mouseover', function (d, i) {
            //tip.show(d, i);
        }).on('mouseout', function () {
            //tip.hide();
        });
        // remove old ones
        avgDotCircle.exit().remove();
    }
    Charts.createScatterChart = createScatterChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    function createScatterLineChart(svg, timeScale, yScale, chartData, height, interpolation, hideHighLowValues) {
        var lineScatterTopStem = svg.selectAll('.scatterLineTopStem').data(chartData);
        // update existing
        lineScatterTopStem.attr('class', 'scatterLineTopStem')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('x1', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('x2', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('y1', function (d) {
            return yScale(d.max);
        })
            .attr('y2', function (d) {
            return yScale(d.avg);
        })
            .attr('stroke', function (d) {
            return '#000';
        });
        // add new ones
        lineScatterTopStem.enter().append('line')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('class', 'scatterLineTopStem')
            .attr('x1', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('x2', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('y1', function (d) {
            return yScale(d.max);
        })
            .attr('y2', function (d) {
            return yScale(d.avg);
        })
            .attr('stroke', function (d) {
            return '#000';
        });
        // remove old ones
        lineScatterTopStem.exit().remove();
        var lineScatterBottomStem = svg.selectAll('.scatterLineBottomStem').data(chartData);
        // update existing
        lineScatterBottomStem.attr('class', 'scatterLineBottomStem')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('x1', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('x2', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('y1', function (d) {
            return yScale(d.avg);
        })
            .attr('y2', function (d) {
            return yScale(d.min);
        })
            .attr('stroke', function (d) {
            return '#000';
        });
        // add new ones
        lineScatterBottomStem.enter().append('line')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('class', 'scatterLineBottomStem')
            .attr('x1', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('x2', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('y1', function (d) {
            return yScale(d.avg);
        })
            .attr('y2', function (d) {
            return yScale(d.min);
        })
            .attr('stroke', function (d) {
            return '#000';
        });
        // remove old ones
        lineScatterBottomStem.exit().remove();
        var lineScatterTopCross = svg.selectAll('.scatterLineTopCross').data(chartData);
        // update existing
        lineScatterTopCross.attr('class', 'scatterLineTopCross')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('x1', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale) - 3;
        })
            .attr('x2', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale) + 3;
        })
            .attr('y1', function (d) {
            return yScale(d.max);
        })
            .attr('y2', function (d) {
            return yScale(d.max);
        })
            .attr('stroke', function (d) {
            return '#000';
        })
            .attr('stroke-width', function (d) {
            return '0.5';
        });
        // add new ones
        lineScatterTopCross.enter().append('line')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('class', 'scatterLineTopCross')
            .attr('x1', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale) - 3;
        })
            .attr('x2', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale) + 3;
        })
            .attr('y1', function (d) {
            return yScale(d.max);
        })
            .attr('y2', function (d) {
            return yScale(d.max);
        })
            .attr('stroke', function (d) {
            return '#000';
        })
            .attr('stroke-width', function (d) {
            return '0.5';
        });
        // remove old ones
        lineScatterTopCross.exit().remove();
        var lineScatterBottomCross = svg.selectAll('.scatterLineBottomCross').data(chartData);
        // update existing
        lineScatterBottomCross.attr('class', 'scatterLineBottomCross')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('x1', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale) - 3;
        })
            .attr('x2', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale) + 3;
        })
            .attr('y1', function (d) {
            return yScale(d.min);
        })
            .attr('y2', function (d) {
            return yScale(d.min);
        })
            .attr('stroke', function (d) {
            return '#000';
        })
            .attr('stroke-width', function (d) {
            return '0.5';
        });
        // add new ones
        lineScatterBottomCross.enter().append('line')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('class', 'scatterLineBottomCross')
            .attr('x1', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale) - 3;
        })
            .attr('x2', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale) + 3;
        })
            .attr('y1', function (d) {
            return yScale(d.min);
        })
            .attr('y2', function (d) {
            return yScale(d.min);
        })
            .attr('stroke', function (d) {
            return '#000';
        })
            .attr('stroke-width', function (d) {
            return '0.5';
        });
        // remove old ones
        lineScatterBottomCross.exit().remove();
        var circleScatterDot = svg.selectAll('.scatterDot').data(chartData);
        // update existing
        circleScatterDot.attr('class', 'scatterDot')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('r', 3)
            .attr('cx', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('cy', function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
        })
            .style('fill', function () {
            return '#70c4e2';
        })
            .style('opacity', function () {
            return '1';
        }).on('mouseover', function (d, i) {
            //tip.show(d, i);
        }).on('mouseout', function () {
            //tip.hide();
        });
        // add new ones
        circleScatterDot.enter().append('circle')
            .filter(function (d) {
            return !Charts.isEmptyDataPoint(d);
        })
            .attr('class', 'scatterDot')
            .attr('r', 3)
            .attr('cx', function (d) {
            return Charts.xMidPointStartPosition(d, timeScale);
        })
            .attr('cy', function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.avg);
        })
            .style('fill', function () {
            return '#70c4e2';
        })
            .style('opacity', function () {
            return '1';
        }).on('mouseover', function (d, i) {
            //tip.show(d, i);
        }).on('mouseout', function () {
            //tip.hide();
        });
        // remove old ones
        circleScatterDot.exit().remove();
    }
    Charts.createScatterLineChart = createScatterLineChart;
})(Charts || (Charts = {}));

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImhhd2t1bGFyLW1ldHJpY3MtY2hhcnRzLm1vZHVsZS50cyIsImNoYXJ0L2FsZXJ0cy50cyIsImNoYXJ0L2F2YWlsLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L2NvbnRleHQtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvZXZlbnQtbmFtZXMudHMiLCJjaGFydC9mZWF0dXJlcy50cyIsImNoYXJ0L21ldHJpYy1jaGFydC1kaXJlY3RpdmUudHMiLCJjaGFydC9zcGFya2xpbmUtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvdHlwZXMudHMiLCJjaGFydC91dGlsaXR5LnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9hcmVhLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9oaXN0b2dyYW0udHMiLCJjaGFydC9jaGFydC10eXBlL2xpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXJMaW5lLnRzIl0sIm5hbWVzIjpbIkNoYXJ0cyIsIkNoYXJ0cy5BbGVydEJvdW5kIiwiQ2hhcnRzLkFsZXJ0Qm91bmQuY29uc3RydWN0b3IiLCJDaGFydHMuY3JlYXRlQWxlcnRMaW5lRGVmIiwiQ2hhcnRzLmNyZWF0ZUFsZXJ0TGluZSIsIkNoYXJ0cy5leHRyYWN0QWxlcnRSYW5nZXMiLCJDaGFydHMuZXh0cmFjdEFsZXJ0UmFuZ2VzLmZpbmRTdGFydFBvaW50cyIsIkNoYXJ0cy5leHRyYWN0QWxlcnRSYW5nZXMuZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleCIsIkNoYXJ0cy5jcmVhdGVBbGVydEJvdW5kc0FyZWEiLCJDaGFydHMuY3JlYXRlQWxlcnRCb3VuZHNBcmVhLmFsZXJ0Qm91bmRpbmdSZWN0IiwiQ2hhcnRzLkF2YWlsU3RhdHVzIiwiQ2hhcnRzLkF2YWlsU3RhdHVzLmNvbnN0cnVjdG9yIiwiQ2hhcnRzLkF2YWlsU3RhdHVzLnRvU3RyaW5nIiwiQ2hhcnRzLlRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQiLCJDaGFydHMuVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5idWlsZEF2YWlsSG92ZXIiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3Iub25lVGltZUNoYXJ0U2V0dXAiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZGV0ZXJtaW5lQXZhaWxTY2FsZSIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5pc1VwIiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmlzRG93biIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5pc1Vua25vd24iLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZm9ybWF0VHJhbnNmb3JtZWREYXRhUG9pbnRzIiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cy5zb3J0QnlUaW1lc3RhbXAiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlU2lkZVlBeGlzTGFiZWxzIiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0IiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0LmNhbGNCYXJZIiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0LmNhbGNCYXJIZWlnaHQiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQuY2FsY0JhckZpbGwiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlWGFuZFlBeGVzIiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZVhBeGlzQnJ1c2giLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlWEF4aXNCcnVzaC5icnVzaFN0YXJ0IiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZVhBeGlzQnJ1c2guYnJ1c2hFbmQiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUiLCJDaGFydHMuQ29udGV4dENoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yIiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5zZXR1cCIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQ29udGV4dENoYXJ0IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoIiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmNvbnRleHRCcnVzaFN0YXJ0IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmNvbnRleHRCcnVzaEVuZCIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dCIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSIsIkNoYXJ0cy5FdmVudE5hbWVzIiwiQ2hhcnRzLkV2ZW50TmFtZXMuY29uc3RydWN0b3IiLCJDaGFydHMuRXZlbnROYW1lcy50b1N0cmluZyIsIkNoYXJ0cy5jcmVhdGVEYXRhUG9pbnRzIiwibGluayIsImxpbmsuZ2V0Q2hhcnRXaWR0aCIsImxpbmsudXNlU21hbGxDaGFydHMiLCJsaW5rLmluaXRpYWxpemF0aW9uIiwibGluay5zZXR1cEZpbHRlcmVkRGF0YSIsImxpbmsuZGV0ZXJtaW5lU2NhbGUiLCJsaW5rLnNldHVwRmlsdGVyZWRNdWx0aURhdGEiLCJsaW5rLnNldHVwRmlsdGVyZWRNdWx0aURhdGEuZGV0ZXJtaW5lTXVsdGlEYXRhTWluTWF4IiwibGluay5kZXRlcm1pbmVNdWx0aVNjYWxlIiwibGluay5sb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UiLCJsaW5rLmZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQiLCJsaW5rLmJ1aWxkSG92ZXIiLCJsaW5rLmNyZWF0ZU11bHRpTGluZUNoYXJ0IiwibGluay5jcmVhdGVZQXhpc0dyaWRMaW5lcyIsImxpbmsuY3JlYXRlWGFuZFlBeGVzIiwibGluay5jcmVhdGVYYW5kWUF4ZXMuYXhpc1RyYW5zaXRpb24iLCJsaW5rLmNyZWF0ZUNlbnRlcmVkTGluZSIsImxpbmsuY3JlYXRlTGluZSIsImxpbmsuY3JlYXRlQXZnTGluZXMiLCJsaW5rLmNyZWF0ZVhBeGlzQnJ1c2giLCJsaW5rLmNyZWF0ZVhBeGlzQnJ1c2guYnJ1c2hTdGFydCIsImxpbmsuY3JlYXRlWEF4aXNCcnVzaC5icnVzaEVuZCIsImxpbmsuY3JlYXRlUHJldmlvdXNSYW5nZU92ZXJsYXkiLCJsaW5rLmFubm90YXRlQ2hhcnQiLCJsaW5rLmNyZWF0ZUZvcmVjYXN0TGluZSIsImxpbmsuc2hvd0ZvcmVjYXN0RGF0YSIsImxpbmsubG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdyIsImxpbmsuZGV0ZXJtaW5lQ2hhcnRUeXBlIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLnNldHVwIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZVNwYXJrbGluZUNoYXJ0IiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQiLCJDaGFydHMuU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuRmFjdG9yeSIsIkNoYXJ0cy5jYWxjQmFyV2lkdGgiLCJDaGFydHMuY2FsY0JhcldpZHRoQWRqdXN0ZWQiLCJDaGFydHMuY2FsY0JhclhQb3MiLCJDaGFydHMuaXNFbXB0eURhdGFQb2ludCIsIkNoYXJ0cy5pc1Jhd01ldHJpYyIsIkNoYXJ0cy54QXhpc1RpbWVGb3JtYXRzIiwiQ2hhcnRzLmNyZWF0ZVN2Z0RlZnMiLCJDaGFydHMueE1pZFBvaW50U3RhcnRQb3NpdGlvbiIsIkNoYXJ0cy5oYXNoU3RyaW5nIiwiQ2hhcnRzLmNyZWF0ZUFyZWFDaGFydCIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydCIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5idWlsZEJhcnMiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRIaWdoQmFyIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkTG93ZXJCYXIiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRUb3BTdGVtIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkTG93U3RlbSIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5idWlsZFRvcENyb3NzIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkQm90dG9tQ3Jvc3MiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuY3JlYXRlSGlzdG9ncmFtSGlnaExvd1ZhbHVlcyIsIkNoYXJ0cy5jcmVhdGVMaW5lQ2hhcnQiLCJDaGFydHMuY3JlYXRlU2NhdHRlckNoYXJ0IiwiQ2hhcnRzLmNyZWF0ZVNjYXR0ZXJMaW5lQ2hhcnQiXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7O0FDUHRDLCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0E2SmY7QUE3SkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQkEsWUFBWUEsQ0FBQ0E7SUFDYkE7OztPQUdHQTtJQUNIQTtRQUlFQyxvQkFBbUJBLGNBQTJCQSxFQUMzQkEsWUFBeUJBLEVBQ3pCQSxVQUFpQkE7WUFGakJDLG1CQUFjQSxHQUFkQSxjQUFjQSxDQUFhQTtZQUMzQkEsaUJBQVlBLEdBQVpBLFlBQVlBLENBQWFBO1lBQ3pCQSxlQUFVQSxHQUFWQSxVQUFVQSxDQUFPQTtZQUNsQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7WUFDMUNBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQ3hDQSxDQUFDQTtRQUVIRCxpQkFBQ0E7SUFBREEsQ0FYQUQsQUFXQ0MsSUFBQUQ7SUFYWUEsaUJBQVVBLGFBV3RCQSxDQUFBQTtJQUdEQSw0QkFBNEJBLFNBQWFBLEVBQ2JBLE1BQVVBLEVBQ1ZBLFVBQWlCQTtRQUMzQ0csSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUE7YUFDckJBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBO2FBQ3ZCQSxDQUFDQSxDQUFDQSxVQUFDQSxDQUFLQTtZQUNQQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsQ0FBQ0EsQ0FBQ0EsVUFBQ0EsQ0FBS0E7WUFDUEEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLENBQUNBLENBQUNBLENBQUNBO1FBRUxBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2RBLENBQUNBO0lBRURILHlCQUFnQ0EsR0FBT0EsRUFDUEEsU0FBYUEsRUFDYkEsTUFBVUEsRUFDVkEsU0FBMkJBLEVBQzNCQSxVQUFpQkEsRUFDakJBLFlBQW1CQTtRQUNqREksSUFBSUEsYUFBYUEsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN0RUEsa0JBQWtCQTtRQUNsQkEsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsWUFBWUEsQ0FBQ0E7YUFDdENBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLGtCQUFrQkEsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFaEVBLGVBQWVBO1FBQ2ZBLGFBQWFBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO2FBQ2pDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxZQUFZQSxDQUFDQTthQUMzQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsa0JBQWtCQSxDQUFDQSxTQUFTQSxFQUFFQSxNQUFNQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUVoRUEsa0JBQWtCQTtRQUNsQkEsYUFBYUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7SUFDaENBLENBQUNBO0lBbEJlSixzQkFBZUEsa0JBa0I5QkEsQ0FBQUE7SUFHREEsNEJBQW1DQSxTQUEyQkEsRUFBRUEsU0FBd0JBO1FBQ3RGSyxJQUFJQSxtQkFBZ0NBLENBQUNBO1FBQ3JDQSxJQUFJQSxXQUFvQkEsQ0FBQ0E7UUFFekJBLHlCQUF5QkEsU0FBMkJBLEVBQUVBLFNBQXdCQTtZQUM1RUMsSUFBSUEsV0FBV0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDckJBLElBQUlBLFFBQXdCQSxDQUFDQTtZQUU3QkEsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsU0FBeUJBLEVBQUVBLENBQVFBO2dCQUNwREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsU0FBU0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3pDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLENBQUNBO2dCQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDSkEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzVCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxJQUFJQSxRQUFRQSxJQUFJQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDMUZBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUMvQ0EsQ0FBQ0E7Z0JBQ0hBLENBQUNBO1lBRUhBLENBQUNBLENBQUNBLENBQUNBO1lBQ0hBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUVERCx5Q0FBeUNBLFdBQW9CQSxFQUFFQSxTQUF3QkE7WUFDckZFLElBQUlBLG1CQUFtQkEsR0FBZ0JBLEVBQUVBLENBQUNBO1lBQzFDQSxJQUFJQSxXQUEyQkEsQ0FBQ0E7WUFDaENBLElBQUlBLFFBQXdCQSxDQUFDQTtZQUM3QkEsSUFBSUEsU0FBeUJBLENBQUNBO1lBRTlCQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFDQSxlQUFzQkE7Z0JBQ3pDQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtnQkFHdkNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLGVBQWVBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO29CQUM1REEsV0FBV0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFNUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBOzJCQUN6REEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3BEQSxtQkFBbUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLFVBQVVBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLEVBQ3pEQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxTQUFTQSxHQUFHQSxXQUFXQSxDQUFDQSxTQUFTQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDekVBLEtBQUtBLENBQUNBO29CQUNSQSxDQUFDQTtnQkFDSEEsQ0FBQ0E7WUFDSEEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFSEEseUVBQXlFQTtZQUN6RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDNURBLG1CQUFtQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsVUFBVUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsRUFDOUZBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQzNEQSxDQUFDQTtZQUVEQSxNQUFNQSxDQUFDQSxtQkFBbUJBLENBQUFBO1FBQzVCQSxDQUFDQTtRQUVERixXQUFXQSxHQUFHQSxlQUFlQSxDQUFDQSxTQUFTQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUVwREEsbUJBQW1CQSxHQUFHQSwrQkFBK0JBLENBQUNBLFdBQVdBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBRTlFQSxNQUFNQSxDQUFDQSxtQkFBbUJBLENBQUNBO0lBRTdCQSxDQUFDQTtJQTdEZUwseUJBQWtCQSxxQkE2RGpDQSxDQUFBQTtJQUVEQSwrQkFBc0NBLEdBQU9BLEVBQ1BBLFNBQWFBLEVBQ2JBLE1BQVVBLEVBQ1ZBLFNBQWdCQSxFQUNoQkEsV0FBd0JBO1FBQzVEUSxJQUFJQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBRTVGQSwyQkFBMkJBLFNBQVNBO1lBQ2xDQyxTQUFTQTtpQkFDTkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsYUFBYUEsQ0FBQ0E7aUJBQzVCQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFDQSxDQUFZQTtnQkFDdEJBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1lBQ3JDQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUE7Z0JBQ1RBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQzNCQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBQ0EsQ0FBWUE7Z0JBQzNCQSxvQ0FBb0NBO2dCQUNwQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ1hBLDRCQUE0QkE7WUFDOUJBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFZQTtnQkFDMUJBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1lBQ2pFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUVERCxrQkFBa0JBO1FBQ2xCQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO1FBRWxDQSxlQUFlQTtRQUNmQSxTQUFTQSxDQUFDQSxLQUFLQSxFQUFFQTthQUNkQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTthQUNkQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO1FBRTNCQSxrQkFBa0JBO1FBQ2xCQSxTQUFTQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7SUFwQ2VSLDRCQUFxQkEsd0JBb0NwQ0EsQ0FBQUE7QUFFSEEsQ0FBQ0EsRUE3SlMsTUFBTSxLQUFOLE1BQU0sUUE2SmY7O0FDL0pELCtDQUErQztBQUMvQyxJQUFVLE1BQU0sQ0FtZmY7QUFuZkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQkEsWUFBWUEsQ0FBQ0E7SUFJYkEsSUFBTUEsT0FBT0EsR0FBR0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQTtJQUVsREE7UUFPRVUscUJBQW1CQSxLQUFZQTtZQUFaQyxVQUFLQSxHQUFMQSxLQUFLQSxDQUFPQTtZQUM3QkEsUUFBUUE7UUFDVkEsQ0FBQ0E7UUFFTUQsOEJBQVFBLEdBQWZBO1lBQ0VFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3BCQSxDQUFDQTtRQVhhRixjQUFFQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNWQSxnQkFBSUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDZEEsbUJBQU9BLEdBQUdBLFNBQVNBLENBQUNBO1FBVXBDQSxrQkFBQ0E7SUFBREEsQ0FkQVYsQUFjQ1UsSUFBQVY7SUFkWUEsa0JBQVdBLGNBY3ZCQSxDQUFBQTtJQXVCREE7UUFFRWEsbUNBQW1CQSxLQUFZQSxFQUNaQSxHQUFVQSxFQUNWQSxLQUFZQSxFQUNaQSxTQUFlQSxFQUNmQSxPQUFhQSxFQUNiQSxRQUFnQkEsRUFDaEJBLE9BQWVBO1lBTmZDLFVBQUtBLEdBQUxBLEtBQUtBLENBQU9BO1lBQ1pBLFFBQUdBLEdBQUhBLEdBQUdBLENBQU9BO1lBQ1ZBLFVBQUtBLEdBQUxBLEtBQUtBLENBQU9BO1lBQ1pBLGNBQVNBLEdBQVRBLFNBQVNBLENBQU1BO1lBQ2ZBLFlBQU9BLEdBQVBBLE9BQU9BLENBQU1BO1lBQ2JBLGFBQVFBLEdBQVJBLFFBQVFBLENBQVFBO1lBQ2hCQSxZQUFPQSxHQUFQQSxPQUFPQSxDQUFRQTtZQUVoQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdERBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFFSEQsZ0NBQUNBO0lBQURBLENBZkFiLEFBZUNhLElBQUFiO0lBZllBLGdDQUF5QkEsNEJBZXJDQSxDQUFBQTtJQUdEQTtRQXVCRWUsb0NBQVlBLFVBQStCQTtZQXZCN0NDLGlCQWtiQ0E7WUE3YVFBLGFBQVFBLEdBQUdBLEdBQUdBLENBQUNBO1lBQ2ZBLFlBQU9BLEdBQUdBLElBQUlBLENBQUNBO1lBRXRCQSxzRUFBc0VBO1lBQy9EQSxVQUFLQSxHQUFHQTtnQkFDYkEsSUFBSUEsRUFBRUEsR0FBR0E7Z0JBQ1RBLGNBQWNBLEVBQUVBLEdBQUdBO2dCQUNuQkEsWUFBWUEsRUFBRUEsR0FBR0E7Z0JBQ2pCQSxTQUFTQSxFQUFFQSxHQUFHQTtnQkFDZEEsU0FBU0EsRUFBRUEsR0FBR0E7Z0JBQ2RBLFdBQVdBLEVBQUVBLEdBQUdBO2dCQUNoQkEsVUFBVUEsRUFBRUEsR0FBR0E7YUFDaEJBLENBQUNBO1lBUUFBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLFVBQUNBLEtBQUtBLEVBQUVBLE9BQU9BLEVBQUVBLEtBQUtBO2dCQUVoQ0EscUJBQXFCQTtnQkFDckJBLElBQUlBLGNBQWNBLEdBQVVBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLEVBQy9DQSxZQUFZQSxHQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUN6Q0EsV0FBV0EsR0FBSUEsMEJBQTBCQSxDQUFDQSxhQUFhQSxFQUN2REEsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0EsV0FBV0EsSUFBSUEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsNkJBQTZCQTtnQkFFN0VBLHNCQUFzQkE7Z0JBQ3RCQSxJQUFJQSxNQUFNQSxHQUFHQSxFQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxFQUFFQSxFQUFDQSxFQUNuREEsS0FBS0EsR0FBR0EsMEJBQTBCQSxDQUFDQSxZQUFZQSxHQUFHQSxNQUFNQSxDQUFDQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQSxLQUFLQSxFQUM1RUEsbUJBQW1CQSxHQUFHQSxXQUFXQSxHQUFHQSxFQUFFQSxFQUN0Q0EsTUFBTUEsR0FBR0EsbUJBQW1CQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUN6REEsV0FBV0EsR0FBR0EsRUFBRUEsRUFDaEJBLFVBQVVBLEdBQUdBLEVBQUVBLEVBQ2ZBLGdCQUFnQkEsR0FBR0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsV0FBV0EsR0FBR0EsVUFBVUEsRUFDakVBLG9CQUFvQkEsR0FBR0EsQ0FBQ0EsV0FBV0EsR0FBR0EsVUFBVUEsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFDN0RBLE1BQU1BLEVBQ05BLFNBQVNBLEVBQ1RBLEtBQUtBLEVBQ0xBLEtBQUtBLEVBQ0xBLFVBQVVBLEVBQ1ZBLEtBQUtBLEVBQ0xBLFVBQVVBLEVBQ1ZBLEdBQUdBLEVBQ0hBLEtBQUtBLEVBQ0xBLFdBQVdBLEVBQ1hBLEdBQUdBLENBQUNBO2dCQUdOQSx5QkFBeUJBLENBQTRCQTtvQkFDbkRDLE1BQU1BLENBQUNBLDhLQUc2QkEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsRUFBRUEsdU1BSXJCQSxDQUFDQSxDQUFDQSxRQUFRQSxrREFFdkNBLENBQUNBO2dCQUNWQSxDQUFDQTtnQkFFREQ7b0JBQ0VFLDhCQUE4QkE7b0JBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDVkEsV0FBV0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7b0JBQ3RDQSxDQUFDQTtvQkFDREEsV0FBV0EsR0FBR0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BDQSxLQUFLQSxHQUFHQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTt5QkFDOUJBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLGFBQWFBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLHFCQUFxQkEsRUFBRUEsZUFBZUEsQ0FBQ0EsQ0FBQ0E7b0JBRS9FQSxHQUFHQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQTt5QkFDWEEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsUUFBUUEsQ0FBQ0E7eUJBQ3ZCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTt5QkFDaEJBLElBQUlBLENBQUNBLFVBQUNBLENBQTRCQTt3QkFDakNBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUM1QkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRUxBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO3lCQUNwQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsSUFBSUEsR0FBR0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7eUJBQ2pEQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxnQkFBZ0JBLENBQUNBO3lCQUNoQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsWUFBWUEsR0FBR0EsTUFBTUEsQ0FBQ0EsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFFdEZBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO3lCQUNmQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTt5QkFDakJBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLGtCQUFrQkEsQ0FBQ0E7eUJBQzlCQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxnQkFBZ0JBLENBQUNBO3lCQUN0Q0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxZQUFZQSxDQUFDQTt5QkFDdENBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBO3lCQUNoQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7eUJBQ2pCQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTt5QkFDZEEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsbUNBQW1DQSxDQUFDQTt5QkFDOUNBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFNBQVNBLENBQUNBO3lCQUN6QkEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBRTdCQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDaEJBLENBQUNBO2dCQUdERiw2QkFBNkJBLHlCQUFzREE7b0JBQ2pGRyxJQUFJQSxpQkFBaUJBLEdBQVlBLEVBQUVBLENBQUNBO29CQUVwQ0EsY0FBY0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsSUFBSUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EseUJBQXlCQSxFQUFFQSxVQUFDQSxDQUE0QkE7d0JBQ3JHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtvQkFDakJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO29CQUV0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EseUJBQXlCQSxJQUFJQSx5QkFBeUJBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUV0RUEsaUJBQWlCQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxjQUFjQSxDQUFDQTt3QkFDdENBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsWUFBWUEsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7d0JBRWpEQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQTs2QkFDdkJBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBOzZCQUNYQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTs2QkFDbkJBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO3dCQUVwQkEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUE7NkJBQ2xCQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTs2QkFDYkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NkJBQ1JBLFFBQVFBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBOzZCQUNkQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFFbEJBLFNBQVNBLEdBQUdBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBOzZCQUN4QkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7NkJBQ2pCQSxNQUFNQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO3dCQUU3QkEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUE7NkJBQ2xCQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQTs2QkFDaEJBLFFBQVFBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBOzZCQUNoQkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7NkJBQ2JBLFVBQVVBLENBQUNBLHVCQUFnQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBRXBDQSxDQUFDQTtnQkFDSEEsQ0FBQ0E7Z0JBR0RILGNBQWNBLENBQTRCQTtvQkFDeENJLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEtBQUtBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO2dCQUMvQ0EsQ0FBQ0E7Z0JBRURKLGdCQUFnQkEsQ0FBNEJBO29CQUMxQ0ssTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7Z0JBQ2pEQSxDQUFDQTtnQkFFREwsbUJBQW1CQSxDQUE0QkE7b0JBQzdDTSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtnQkFDcERBLENBQUNBO2dCQUVETixxQ0FBcUNBLFdBQTZCQTtvQkFDaEVPLElBQUlBLFVBQVVBLEdBQWdDQSxFQUFFQSxDQUFDQTtvQkFDakRBLElBQUlBLFNBQVNBLEdBQUdBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBO29CQUVuQ0EseUJBQXlCQSxDQUFpQkEsRUFBRUEsQ0FBaUJBO3dCQUMzREMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQzlCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDWkEsQ0FBQ0E7d0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBOzRCQUM5QkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ1hBLENBQUNBO3dCQUNEQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDWEEsQ0FBQ0E7b0JBRURELFdBQVdBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO29CQUdsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsSUFBSUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQzdEQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxJQUFJQSxFQUFFQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTt3QkFFL0JBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBOzRCQUNwQkEsSUFBSUEsU0FBU0EsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBRS9CQSxzRkFBc0ZBOzRCQUN0RkEsOEJBQThCQTs0QkFDOUJBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLHlCQUF5QkEsQ0FBQ0EsR0FBR0EsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsSUFBSUEsRUFDaEVBLFNBQVNBLENBQUNBLFNBQVNBLEVBQUVBLFdBQVdBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBOzRCQUN4REEsNkNBQTZDQTs0QkFDN0NBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLHlCQUF5QkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsRUFBRUEsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQzVGQSxDQUFDQTt3QkFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7NEJBQ0pBLElBQUlBLGdCQUFnQkEsR0FBR0EsR0FBR0EsQ0FBQ0E7NEJBRTNCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtnQ0FDNUNBLHVEQUF1REE7Z0NBQ3ZEQSxpREFBaURBO2dDQUNqREEsYUFBYUE7Z0NBQ2JBLEdBQUdBO2dDQUNIQSxFQUFFQSxDQUFDQSxDQUFDQSxjQUFjQSxJQUFJQSxXQUFXQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtvQ0FDbkRBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLHlCQUF5QkEsQ0FBQ0EsY0FBY0EsRUFDMURBLGdCQUFnQkEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0NBQy9DQSxLQUFLQSxDQUFDQTtnQ0FDUkEsQ0FBQ0E7Z0NBQ0RBLElBQUlBLENBQUNBLENBQUNBO29DQUNKQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSx5QkFBeUJBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLEVBQ3hFQSxnQkFBZ0JBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO29DQUMvQ0EsZ0JBQWdCQSxHQUFHQSxXQUFXQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQTtnQ0FDbERBLENBQUNBOzRCQUNIQSxDQUFDQTt3QkFDSEEsQ0FBQ0E7b0JBQ0hBLENBQUNBO29CQUNEQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtnQkFDcEJBLENBQUNBO2dCQUdEUDtvQkFDRVMsZ0NBQWdDQTtvQkFDaENBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO3lCQUNmQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxjQUFjQSxDQUFDQTt5QkFDN0JBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO3lCQUNkQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTt5QkFDYkEsS0FBS0EsQ0FBQ0EsYUFBYUEsRUFBRUEsNkJBQTZCQSxDQUFDQTt5QkFDbkRBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLE1BQU1BLENBQUNBO3lCQUMxQkEsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0E7eUJBQ3BCQSxLQUFLQSxDQUFDQSxhQUFhQSxFQUFFQSxLQUFLQSxDQUFDQTt5QkFDM0JBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUVkQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTt5QkFDZkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsZ0JBQWdCQSxDQUFDQTt5QkFDL0JBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO3lCQUNkQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTt5QkFDYkEsS0FBS0EsQ0FBQ0EsYUFBYUEsRUFBRUEsNkJBQTZCQSxDQUFDQTt5QkFDbkRBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLE1BQU1BLENBQUNBO3lCQUMxQkEsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0E7eUJBQ3BCQSxLQUFLQSxDQUFDQSxhQUFhQSxFQUFFQSxLQUFLQSxDQUFDQTt5QkFDM0JBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUVsQkEsQ0FBQ0E7Z0JBR0RULGlDQUFpQ0EseUJBQXNEQTtvQkFDckZVLElBQUlBLFFBQVFBLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLHlCQUF5QkEsRUFBRUEsVUFBQ0EsQ0FBNEJBO3dCQUMxRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7b0JBQ2xCQSxDQUFDQSxDQUFDQSxFQUNGQSxRQUFRQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSx5QkFBeUJBLEVBQUVBLFVBQUNBLENBQTRCQTt3QkFDeEVBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO29CQUNoQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRUxBLElBQUlBLGNBQWNBLEdBQUdBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBO3lCQUMvQkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7eUJBQ2pCQSxNQUFNQSxDQUFDQSxDQUFDQSxjQUFjQSxFQUFFQSxZQUFZQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxFQUVyREEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUE7eUJBQ3ZCQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQTt5QkFDWEEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7eUJBQ2xCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUVqQkEsVUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUE7eUJBQ3ZCQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTt5QkFDckJBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO3lCQUNSQSxRQUFRQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTt5QkFDZkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBRW5CQSx3REFBd0RBO29CQUN4REEsMkNBQTJDQTtvQkFDM0NBLGtCQUFrQkEsQ0FBNEJBO3dCQUM1Q0MsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBQ25FQSxDQUFDQTtvQkFFREQsZ0VBQWdFQTtvQkFDaEVBLHVEQUF1REE7b0JBQ3ZEQSx1QkFBdUJBLENBQTRCQTt3QkFDakRFLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBO29CQUM5Q0EsQ0FBQ0E7b0JBRURGLHFCQUFxQkEsQ0FBNEJBO3dCQUMvQ0csRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQ1pBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLFFBQVFBO3dCQUM1QkEsQ0FBQ0E7d0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBOzRCQUN4QkEsTUFBTUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxDQUFDQSxlQUFlQTt3QkFDbERBLENBQUNBO3dCQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTs0QkFDTkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsTUFBTUE7d0JBQzFCQSxDQUFDQTtvQkFDSEEsQ0FBQ0E7b0JBRURILEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLGdCQUFnQkEsQ0FBQ0E7eUJBQzVCQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBO3lCQUMvQkEsS0FBS0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7eUJBQ3RCQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxXQUFXQSxDQUFDQTt5QkFDMUJBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLFVBQUNBLENBQTRCQTt3QkFDdENBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO29CQUNsQ0EsQ0FBQ0EsQ0FBQ0E7eUJBQ0RBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLFVBQUNBLENBQTRCQTt3QkFDdENBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNyQkEsQ0FBQ0EsQ0FBQ0E7eUJBQ0RBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFVBQUNBLENBQUNBO3dCQUNoQkEsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFCQSxDQUFDQSxDQUFDQTt5QkFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsVUFBQ0EsQ0FBNEJBO3dCQUMxQ0EsSUFBSUEsSUFBSUEsR0FBR0EsWUFBWUEsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3RFQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDekRBLENBQUNBLENBQUNBO3lCQUNEQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFDQSxDQUE0QkE7d0JBQ3pDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeEJBLENBQUNBLENBQUNBO3lCQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQTt3QkFDZkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7b0JBQ2RBLENBQUNBLENBQUNBO3lCQUNEQSxFQUFFQSxDQUFDQSxXQUFXQSxFQUFFQSxVQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTt3QkFDcEJBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUNqQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsRUFBRUE7d0JBQ2hCQSxHQUFHQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtvQkFDYkEsQ0FBQ0EsQ0FBQ0E7eUJBQ0RBLEVBQUVBLENBQUNBLFdBQVdBLEVBQUVBO3dCQUNmQSxJQUFJQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTt3QkFDNUNBLElBQUlBLFVBQVVBLEdBQVFBLElBQUlBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO3dCQUM3Q0EsVUFBVUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7d0JBQ2xDQSxVQUFVQSxDQUFDQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTt3QkFDdENBLFVBQVVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO3dCQUNsQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7d0JBQ3RDQSxTQUFTQSxDQUFDQSxhQUFhQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtvQkFDdENBLENBQUNBLENBQUNBO3lCQUNEQSxFQUFFQSxDQUFDQSxTQUFTQSxFQUFFQTt3QkFDYkEsSUFBSUEsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7d0JBQzVDQSxJQUFJQSxVQUFVQSxHQUFRQSxJQUFJQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTt3QkFDM0NBLFVBQVVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO3dCQUNsQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7d0JBQ3RDQSxVQUFVQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTt3QkFDbENBLFVBQVVBLENBQUNBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBO3dCQUN0Q0EsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7b0JBQ3RDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFTEEs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Q0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3ZCQSxVQUFVQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtvQkFDdERBLENBQUNBO29CQUVEQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxFQUFFQTt5QkFDbkJBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBO3lCQUNaQSxFQUFFQSxDQUFDQSxZQUFZQSxFQUFFQSxVQUFVQSxDQUFDQTt5QkFDNUJBLEVBQUVBLENBQUNBLFVBQVVBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO29CQUU1QkEsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBRXZCQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtvQkFFL0NBLFVBQVVBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBO3lCQUN6QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7b0JBRTFCQTt3QkFDRUMsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsV0FBV0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ2pDQSxDQUFDQTtvQkFFREQ7d0JBQ0VFLElBQUlBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEVBQ3pCQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQSxFQUMzQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsRUFDekNBLGtCQUFrQkEsR0FBR0EsT0FBT0EsR0FBR0EsU0FBU0EsQ0FBQ0E7d0JBRTNDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTt3QkFDbkRBLDZDQUE2Q0E7d0JBQzdDQSxFQUFFQSxDQUFDQSxDQUFDQSxrQkFBa0JBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBOzRCQUNoQ0Esa0JBQWtCQSxHQUFHQSxFQUFFQSxDQUFDQTs0QkFDeEJBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTs0QkFDckNBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLGlCQUFVQSxDQUFDQSx1QkFBdUJBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO3dCQUMvRUEsQ0FBQ0E7d0JBQ0RBLDRCQUE0QkE7d0JBQzVCQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtvQkFDakNBLENBQUNBO2dCQUVIRixDQUFDQTtnQkFFRG5CLG9DQUFvQ0EsYUFBYUE7b0JBQy9Dc0IsRUFBRUEsQ0FBQ0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2xCQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTs2QkFDZkEsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0E7NkJBQ3BCQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxrQkFBa0JBLENBQUNBOzZCQUNqQ0EsS0FBS0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTs2QkFDbENBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLGtCQUFrQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzdDQSxDQUFDQTtnQkFFSEEsQ0FBQ0E7Z0JBRUR0Qix1QkFBdUJBLGNBQWNBO29CQUNuQ3VCLEVBQUVBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNuQkEsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQTs2QkFDNUJBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBOzZCQUNwQkEsS0FBS0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7NkJBQ3hCQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxlQUFlQSxDQUFDQTs2QkFDOUJBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBOzZCQUNaQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTs0QkFDWkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2hDQSxDQUFDQSxDQUFDQTs2QkFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUE7NEJBQ1ZBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7d0JBQzlDQSxDQUFDQSxDQUFDQTs2QkFDREEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7NEJBQ2ZBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dDQUN2QkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7NEJBQ2ZBLENBQUNBOzRCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQ0FDOUJBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBOzRCQUNsQkEsQ0FBQ0E7NEJBQUNBLElBQUlBLENBQUNBLENBQUNBO2dDQUNOQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTs0QkFDakJBLENBQUNBO3dCQUNIQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDUEEsQ0FB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QVNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ2hCQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNoQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDTEEsZUFBZUE7UUFDZkEscUJBQXFCQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTthQUN6Q0EsTUFBTUEsQ0FBQ0EsVUFBQ0EsQ0FBQ0E7WUFDUkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsdUJBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsdUJBQXVCQSxDQUFDQTthQUN0Q0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNoQkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDaEJBLENBQUNBLENBQUNBLENBQUNBO1FBQ0xBLGtCQUFrQkE7UUFDbEJBLHFCQUFxQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7UUFFdENBLElBQUlBLG1CQUFtQkEsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNoRkEsa0JBQWtCQTtRQUNsQkEsbUJBQW1CQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxxQkFBcUJBLENBQUNBO2FBQ3JEQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xEQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xEQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ2hCQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNoQkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDdEJBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBQ2ZBLENBQUNBLENBQUNBLENBQUNBO1FBQ0xBLGVBQWVBO1FBQ2ZBLG1CQUFtQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7YUFDdkNBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBO1lBQ1JBLE1BQU1BLENBQUNBLENBQUNBLHVCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLHFCQUFxQkEsQ0FBQ0E7YUFDcENBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbERBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbERBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDaEJBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQ2hCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDZkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDTEEsa0JBQWtCQTtRQUNsQkEsbUJBQW1CQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtRQUVwQ0EsSUFBSUEsc0JBQXNCQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSx5QkFBeUJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQ3RGQSxrQkFBa0JBO1FBQ2xCQSxzQkFBc0JBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLHdCQUF3QkEsQ0FBQ0E7YUFDM0RBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBO1lBQ1JBLE1BQU1BLENBQUNBLENBQUNBLHVCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbERBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbERBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDaEJBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQ2hCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDZkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDTEEsZUFBZUE7UUFDZkEsc0JBQXNCQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTthQUMxQ0EsTUFBTUEsQ0FBQ0EsVUFBQ0EsQ0FBQ0E7WUFDUkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsdUJBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsd0JBQXdCQSxDQUFDQTthQUN2Q0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsREEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsREEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNoQkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDaEJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ3RCQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNmQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNMQSxrQkFBa0JBO1FBQ2xCQSxzQkFBc0JBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO1FBRXZDQSxJQUFJQSxnQkFBZ0JBLEdBQUdBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQ3BFQSxrQkFBa0JBO1FBQ2xCQSxnQkFBZ0JBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLFlBQVlBLENBQUNBO2FBQ3pDQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQTthQUNaQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxrQkFBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLENBQUNBLENBQUNBO2FBQ0RBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBO1lBQ2JBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBO1FBQ25CQSxDQUFDQSxDQUFDQTthQUNEQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQTtZQUNoQkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDYkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsV0FBV0EsRUFBRUEsVUFBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDeEJBLGlCQUFpQkE7UUFDbkJBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFVBQVVBLEVBQUVBO1lBQ2hCQSxhQUFhQTtRQUNmQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNIQSxlQUFlQTtRQUNmQSxnQkFBZ0JBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO2FBQ3RDQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxZQUFZQSxDQUFDQTthQUMzQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7YUFDWkEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0Esa0JBQVdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzFEQSxDQUFDQSxDQUFDQTthQUNEQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQTtZQUNiQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUNuQkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsS0FBS0EsQ0FBQ0EsU0FBU0EsRUFBRUE7WUFDaEJBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO1FBQ2JBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFdBQVdBLEVBQUVBLFVBQUNBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3hCQSxpQkFBaUJBO1FBQ25CQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxVQUFVQSxFQUFFQTtZQUNoQkEsYUFBYUE7UUFDZkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDSEEsa0JBQWtCQTtRQUNsQkEsZ0JBQWdCQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtJQUduQ0EsQ0FBQ0E7SUF6UGV2Ryw2QkFBc0JBLHlCQXlQckNBLENBQUFBO0FBRUhBLENBQUNBLEVBaFFTLE1BQU0sS0FBTixNQUFNLFFBZ1FmIiwiZmlsZSI6Imhhd2t1bGFyLWNoYXJ0cy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG5hbWUgIGhhd2t1bGFyLWNoYXJ0c1xuICpcbiAqIEBkZXNjcmlwdGlvblxuICogICBCYXNlIG1vZHVsZSBmb3IgcmhxLW1ldHJpY3MtY2hhcnRzLlxuICpcbiAqL1xuYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycsIFtdKTtcblxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcbiAgLyoqXG4gICAqIERlZmluZXMgYW4gaW5kaXZpZHVhbCBhbGVydCBib3VuZHMgIHRvIGJlIHZpc3VhbGx5IGhpZ2hsaWdodGVkIGluIGEgY2hhcnRcbiAgICogdGhhdCBhbiBhbGVydCB3YXMgYWJvdmUvYmVsb3cgYSB0aHJlc2hvbGQuXG4gICAqL1xuICBleHBvcnQgY2xhc3MgQWxlcnRCb3VuZCB7XG4gICAgcHVibGljIHN0YXJ0RGF0ZTpEYXRlO1xuICAgIHB1YmxpYyBlbmREYXRlOkRhdGU7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgc3RhcnRUaW1lc3RhbXA6VGltZUluTWlsbGlzLFxuICAgICAgICAgICAgICAgIHB1YmxpYyBlbmRUaW1lc3RhbXA6VGltZUluTWlsbGlzLFxuICAgICAgICAgICAgICAgIHB1YmxpYyBhbGVydFZhbHVlOm51bWJlcikge1xuICAgICAgdGhpcy5zdGFydERhdGUgPSBuZXcgRGF0ZShzdGFydFRpbWVzdGFtcCk7XG4gICAgICB0aGlzLmVuZERhdGUgPSBuZXcgRGF0ZShlbmRUaW1lc3RhbXApO1xuICAgIH1cblxuICB9XG5cblxuICBmdW5jdGlvbiBjcmVhdGVBbGVydExpbmVEZWYodGltZVNjYWxlOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHlTY2FsZTphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbGVydFZhbHVlOm51bWJlcikge1xuICAgIGxldCBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgLmludGVycG9sYXRlKCdtb25vdG9uZScpXG4gICAgICAueCgoZDphbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLnkoKGQ6YW55KSA9PiB7XG4gICAgICAgIHJldHVybiB5U2NhbGUoYWxlcnRWYWx1ZSk7XG4gICAgICB9KTtcblxuICAgIHJldHVybiBsaW5lO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFsZXJ0TGluZShzdmc6YW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZTphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeVNjYWxlOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFydERhdGE6SUNoYXJ0RGF0YVBvaW50W10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnRWYWx1ZTpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY3NzQ2xhc3NOYW1lOnN0cmluZyk6dm9pZCB7XG4gICAgbGV0IHBhdGhBbGVydExpbmUgPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmFsZXJ0TGluZScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHBhdGhBbGVydExpbmUuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGUsIHlTY2FsZSwgYWxlcnRWYWx1ZSkpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcGF0aEFsZXJ0TGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGUsIHlTY2FsZSwgYWxlcnRWYWx1ZSkpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcGF0aEFsZXJ0TGluZS5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxuXG4gIGV4cG9ydCBmdW5jdGlvbiBleHRyYWN0QWxlcnRSYW5nZXMoY2hhcnREYXRhOklDaGFydERhdGFQb2ludFtdLCB0aHJlc2hvbGQ6QWxlcnRUaHJlc2hvbGQpOkFsZXJ0Qm91bmRbXSB7XG4gICAgbGV0IGFsZXJ0Qm91bmRBcmVhSXRlbXM6QWxlcnRCb3VuZFtdO1xuICAgIGxldCBzdGFydFBvaW50czpudW1iZXJbXTtcblxuICAgIGZ1bmN0aW9uIGZpbmRTdGFydFBvaW50cyhjaGFydERhdGE6SUNoYXJ0RGF0YVBvaW50W10sIHRocmVzaG9sZDpBbGVydFRocmVzaG9sZCkge1xuICAgICAgbGV0IHN0YXJ0UG9pbnRzID0gW107XG4gICAgICBsZXQgcHJldkl0ZW06SUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBjaGFydERhdGEuZm9yRWFjaCgoY2hhcnRJdGVtOklDaGFydERhdGFQb2ludCwgaTpudW1iZXIpID0+IHtcbiAgICAgICAgaWYgKGkgPT09IDAgJiYgY2hhcnRJdGVtLmF2ZyA+IHRocmVzaG9sZCkge1xuICAgICAgICAgIHN0YXJ0UG9pbnRzLnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgcHJldkl0ZW0gPSBjaGFydERhdGFbaSAtIDFdO1xuICAgICAgICAgIGlmIChjaGFydEl0ZW0uYXZnID4gdGhyZXNob2xkICYmIHByZXZJdGVtICYmICghcHJldkl0ZW0uYXZnIHx8IHByZXZJdGVtLmF2ZyA8PSB0aHJlc2hvbGQpKSB7XG4gICAgICAgICAgICBzdGFydFBvaW50cy5wdXNoKHByZXZJdGVtLmF2ZyA/IChpIC0gMSkgOiBpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgfSk7XG4gICAgICByZXR1cm4gc3RhcnRQb2ludHM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleChzdGFydFBvaW50czpudW1iZXJbXSwgdGhyZXNob2xkOkFsZXJ0VGhyZXNob2xkKTpBbGVydEJvdW5kW10ge1xuICAgICAgbGV0IGFsZXJ0Qm91bmRBcmVhSXRlbXM6QWxlcnRCb3VuZFtdID0gW107XG4gICAgICBsZXQgY3VycmVudEl0ZW06SUNoYXJ0RGF0YVBvaW50O1xuICAgICAgbGV0IG5leHRJdGVtOklDaGFydERhdGFQb2ludDtcbiAgICAgIGxldCBzdGFydEl0ZW06SUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBzdGFydFBvaW50cy5mb3JFYWNoKChzdGFydFBvaW50SW5kZXg6bnVtYmVyKSA9PiB7XG4gICAgICAgIHN0YXJ0SXRlbSA9IGNoYXJ0RGF0YVtzdGFydFBvaW50SW5kZXhdO1xuXG5cbiAgICAgICAgZm9yIChsZXQgaiA9IHN0YXJ0UG9pbnRJbmRleDsgaiA8IGNoYXJ0RGF0YS5sZW5ndGggLSAxOyBqKyspIHtcbiAgICAgICAgICBjdXJyZW50SXRlbSA9IGNoYXJ0RGF0YVtqXTtcbiAgICAgICAgICBuZXh0SXRlbSA9IGNoYXJ0RGF0YVtqICsgMV07XG5cbiAgICAgICAgICBpZiAoKGN1cnJlbnRJdGVtLmF2ZyA+IHRocmVzaG9sZCAmJiBuZXh0SXRlbS5hdmcgPD0gdGhyZXNob2xkKVxuICAgICAgICAgICAgfHwgKGN1cnJlbnRJdGVtLmF2ZyA+IHRocmVzaG9sZCAmJiAhbmV4dEl0ZW0uYXZnKSkge1xuICAgICAgICAgICAgYWxlcnRCb3VuZEFyZWFJdGVtcy5wdXNoKG5ldyBBbGVydEJvdW5kKHN0YXJ0SXRlbS50aW1lc3RhbXAsXG4gICAgICAgICAgICAgIG5leHRJdGVtLmF2ZyA/IG5leHRJdGVtLnRpbWVzdGFtcCA6IGN1cnJlbnRJdGVtLnRpbWVzdGFtcCwgdGhyZXNob2xkKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLy8gbWVhbnMgdGhlIGxhc3QgcGllY2UgZGF0YSBpcyBhbGwgYWJvdmUgdGhyZXNob2xkLCB1c2UgbGFzdCBkYXRhIHBvaW50XG4gICAgICBpZiAoYWxlcnRCb3VuZEFyZWFJdGVtcy5sZW5ndGggPT09IChzdGFydFBvaW50cy5sZW5ndGggLSAxKSkge1xuICAgICAgICBhbGVydEJvdW5kQXJlYUl0ZW1zLnB1c2gobmV3IEFsZXJ0Qm91bmQoY2hhcnREYXRhW3N0YXJ0UG9pbnRzW3N0YXJ0UG9pbnRzLmxlbmd0aCAtIDFdXS50aW1lc3RhbXAsXG4gICAgICAgICAgY2hhcnREYXRhW2NoYXJ0RGF0YS5sZW5ndGggLSAxXS50aW1lc3RhbXAsIHRocmVzaG9sZCkpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYWxlcnRCb3VuZEFyZWFJdGVtc1xuICAgIH1cblxuICAgIHN0YXJ0UG9pbnRzID0gZmluZFN0YXJ0UG9pbnRzKGNoYXJ0RGF0YSwgdGhyZXNob2xkKTtcblxuICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMgPSBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzLCB0aHJlc2hvbGQpO1xuXG4gICAgcmV0dXJuIGFsZXJ0Qm91bmRBcmVhSXRlbXM7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBbGVydEJvdW5kc0FyZWEoc3ZnOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lU2NhbGU6YW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHlTY2FsZTphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGlnaEJvdW5kOm51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbGVydEJvdW5kczpBbGVydEJvdW5kW10pIHtcbiAgICBsZXQgcmVjdEFsZXJ0ID0gc3ZnLnNlbGVjdCgnZy5hbGVydEhvbGRlcicpLnNlbGVjdEFsbCgncmVjdC5hbGVydEJvdW5kcycpLmRhdGEoYWxlcnRCb3VuZHMpO1xuXG4gICAgZnVuY3Rpb24gYWxlcnRCb3VuZGluZ1JlY3Qoc2VsZWN0aW9uKSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2FsZXJ0Qm91bmRzJylcbiAgICAgICAgLmF0dHIoJ3gnLCAoZDpBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnN0YXJ0VGltZXN0YW1wKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3knLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShoaWdoQm91bmQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQ6QWxlcnRCb3VuZCkgPT4ge1xuICAgICAgICAgIC8vL0B0b2RvOiBtYWtlIHRoZSBoZWlnaHQgYWRqdXN0YWJsZVxuICAgICAgICAgIHJldHVybiAxODU7XG4gICAgICAgICAgLy9yZXR1cm4geVNjYWxlKDApIC0gaGVpZ2h0O1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignd2lkdGgnLCAoZDpBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLmVuZFRpbWVzdGFtcCkgLSB0aW1lU2NhbGUoZC5zdGFydFRpbWVzdGFtcCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHJlY3RBbGVydC5jYWxsKGFsZXJ0Qm91bmRpbmdSZWN0KTtcblxuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIHJlY3RBbGVydC5lbnRlcigpXG4gICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgIC5jYWxsKGFsZXJ0Qm91bmRpbmdSZWN0KTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHJlY3RBbGVydC5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZGVjbGFyZSBsZXQgZDM6YW55O1xuXG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cbiAgZXhwb3J0IGNsYXNzIEF2YWlsU3RhdHVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgVVAgPSAndXAnO1xuICAgIHB1YmxpYyBzdGF0aWMgRE9XTiA9ICdkb3duJztcbiAgICBwdWJsaWMgc3RhdGljIFVOS05PV04gPSAndW5rbm93bic7XG5cblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB2YWx1ZTpzdHJpbmcpIHtcbiAgICAgIC8vIGVtcHR5XG4gICAgfVxuXG4gICAgcHVibGljIHRvU3RyaW5nKCk6c3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSBpbnB1dCBkYXRhIGZvcm1hdCwgZGlyZWN0bHkgZnJvbSBNZXRyaWNzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQXZhaWxEYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDpudW1iZXI7XG4gICAgdmFsdWU6c3RyaW5nO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgaXMgdGhlIHRyYW5zZm9ybWVkIG91dHB1dCBkYXRhIGZvcm1hdC4gRm9ybWF0dGVkIHRvIHdvcmsgd2l0aCBhdmFpbGFiaWxpdHkgY2hhcnQgKGJhc2ljYWxseSBhIERUTykuXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IHtcbiAgICBzdGFydDpudW1iZXI7XG4gICAgZW5kOm51bWJlcjtcbiAgICB2YWx1ZTpzdHJpbmc7XG4gICAgc3RhcnREYXRlPzpEYXRlOyAvLy8gTWFpbmx5IGZvciBkZWJ1Z2dlciBodW1hbiByZWFkYWJsZSBkYXRlcyBpbnN0ZWFkIG9mIGEgbnVtYmVyXG4gICAgZW5kRGF0ZT86RGF0ZTtcbiAgICBkdXJhdGlvbj86c3RyaW5nO1xuICAgIG1lc3NhZ2U/OnN0cmluZztcbiAgfVxuXG4gIGV4cG9ydCBjbGFzcyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IGltcGxlbWVudHMgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHN0YXJ0Om51bWJlcixcbiAgICAgICAgICAgICAgICBwdWJsaWMgZW5kOm51bWJlcixcbiAgICAgICAgICAgICAgICBwdWJsaWMgdmFsdWU6c3RyaW5nLFxuICAgICAgICAgICAgICAgIHB1YmxpYyBzdGFydERhdGU/OkRhdGUsXG4gICAgICAgICAgICAgICAgcHVibGljIGVuZERhdGU/OkRhdGUsXG4gICAgICAgICAgICAgICAgcHVibGljIGR1cmF0aW9uPzpzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIG1lc3NhZ2U/OnN0cmluZykge1xuXG4gICAgICB0aGlzLmR1cmF0aW9uID0gbW9tZW50KGVuZCkuZnJvbShtb21lbnQoc3RhcnQpLCB0cnVlKTtcbiAgICAgIHRoaXMuc3RhcnREYXRlID0gbmV3IERhdGUoc3RhcnQpO1xuICAgICAgdGhpcy5lbmREYXRlID0gbmV3IERhdGUoZW5kKTtcbiAgICB9XG5cbiAgfVxuXG5cbiAgZXhwb3J0IGNsYXNzIEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlIHtcblxuICAgIHByaXZhdGUgc3RhdGljICBfQ0hBUlRfSEVJR0hUID0gMTUwO1xuICAgIHByaXZhdGUgc3RhdGljICBfQ0hBUlRfV0lEVEggPSA3NTA7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGRhdGE6ICc9JyxcbiAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgIHRpbWVMYWJlbDogJ0AnLFxuICAgICAgZGF0ZUxhYmVsOiAnQCcsXG4gICAgICBub0RhdGFMYWJlbDogJ0AnLFxuICAgICAgY2hhcnRUaXRsZTogJ0AnXG4gICAgfTtcblxuICAgIHB1YmxpYyBsaW5rOihzY29wZTphbnksIGVsZW1lbnQ6bmcuSUF1Z21lbnRlZEpRdWVyeSwgYXR0cnM6YW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIHRyYW5zZm9ybWVkRGF0YVBvaW50czpJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdO1xuXG4gICAgY29uc3RydWN0b3IoJHJvb3RTY29wZTpuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBzdGFydFRpbWVzdGFtcDpudW1iZXIgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAsXG4gICAgICAgICAgZW5kVGltZXN0YW1wOm51bWJlciA9ICthdHRycy5lbmRUaW1lc3RhbXAsXG4gICAgICAgICAgY2hhcnRIZWlnaHQgPSAgQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVCxcbiAgICAgICAgICBub0RhdGFMYWJlbCA9IGF0dHJzLm5vRGF0YUxhYmVsIHx8ICdObyBEYXRhJzsgLy9AdG9kbzogYWRkIE5vIERhdGEgaGFuZGxpbmdcblxuICAgICAgICAvLyBjaGFydCBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBtYXJnaW4gPSB7dG9wOiAxMCwgcmlnaHQ6IDUsIGJvdHRvbTogNSwgbGVmdDogOTB9LFxuICAgICAgICAgIHdpZHRoID0gQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gNTAsXG4gICAgICAgICAgaGVpZ2h0ID0gYWRqdXN0ZWRDaGFydEhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tLFxuICAgICAgICAgIHRpdGxlSGVpZ2h0ID0gMzAsXG4gICAgICAgICAgdGl0bGVTcGFjZSA9IDEwLFxuICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wIC0gdGl0bGVIZWlnaHQgLSB0aXRsZVNwYWNlLFxuICAgICAgICAgIGFkanVzdGVkQ2hhcnRIZWlnaHQyID0gK3RpdGxlSGVpZ2h0ICsgdGl0bGVTcGFjZSArIG1hcmdpbi50b3AsXG4gICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGJydXNoLFxuICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgdGlwLFxuICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgIHN2ZztcblxuXG4gICAgICAgIGZ1bmN0aW9uIGJ1aWxkQXZhaWxIb3ZlcihkOklUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJpbmZvLWl0ZW1cIj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+U3RhdHVzOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLnZhbHVlLnRvVXBwZXJDYXNlKCl9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaW5mby1pdGVtIGJlZm9yZS1zZXBhcmF0b3JcIj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+RHVyYXRpb246PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QuZHVyYXRpb259PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uZVRpbWVDaGFydFNldHVwKCk6dm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG4gICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAuYXR0cigndmlld0JveCcsICcwIDAgNzYwIDE1MCcpLmF0dHIoJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLCAneE1pbllNaW4gbWVldCcpO1xuXG4gICAgICAgICAgdGlwID0gZDMudGlwKClcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdkMy10aXAnKVxuICAgICAgICAgICAgLm9mZnNldChbLTEwLCAwXSlcbiAgICAgICAgICAgIC5odG1sKChkOklUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBidWlsZEF2YWlsSG92ZXIoZCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyAoYWRqdXN0ZWRDaGFydEhlaWdodDIpICsgJyknKTtcblxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2RlZnMnKVxuICAgICAgICAgICAgLmFwcGVuZCgncGF0dGVybicpXG4gICAgICAgICAgICAuYXR0cignaWQnLCAnZGlhZ29uYWwtc3RyaXBlcycpXG4gICAgICAgICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgICAgICAgIC5hdHRyKCdwYXR0ZXJuVHJhbnNmb3JtJywgJ3NjYWxlKDAuNyknKVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgNClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCA0KVxuICAgICAgICAgICAgLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuYXR0cignZCcsICdNLTEsMSBsMiwtMiBNMCw0IGw0LC00IE0zLDUgbDIsLTInKVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICcjQjZCNkI2JylcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAxLjIpO1xuXG4gICAgICAgICAgc3ZnLmNhbGwodGlwKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lQXZhaWxTY2FsZSh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OklUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10pIHtcbiAgICAgICAgICBsZXQgYWRqdXN0ZWRUaW1lUmFuZ2U6bnVtYmVyW10gPSBbXTtcblxuICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gK2F0dHJzLnN0YXJ0VGltZXN0YW1wIHx8IGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDpJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZC5zdGFydDtcbiAgICAgICAgICAgIH0pIHx8ICttb21lbnQoKS5zdWJ0cmFjdCgxLCAnaG91cicpO1xuXG4gICAgICAgICAgaWYgKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQgJiYgdHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5sZW5ndGggPiAwKSB7XG5cbiAgICAgICAgICAgIGFkanVzdGVkVGltZVJhbmdlWzBdID0gc3RhcnRUaW1lc3RhbXA7XG4gICAgICAgICAgICBhZGp1c3RlZFRpbWVSYW5nZVsxXSA9IGVuZFRpbWVzdGFtcCB8fCArbW9tZW50KCk7XG5cbiAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbNzAsIDBdKVxuICAgICAgICAgICAgICAuZG9tYWluKFswLCAxNzVdKTtcblxuICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgIC50aWNrcygwKVxuICAgICAgICAgICAgICAudGlja1NpemUoMCwgMClcbiAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAgIC5kb21haW4oYWRqdXN0ZWRUaW1lUmFuZ2UpO1xuXG4gICAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgLnNjYWxlKHRpbWVTY2FsZSlcbiAgICAgICAgICAgICAgLnRpY2tTaXplKC03MCwgMClcbiAgICAgICAgICAgICAgLm9yaWVudCgndG9wJylcbiAgICAgICAgICAgICAgLnRpY2tGb3JtYXQoeEF4aXNUaW1lRm9ybWF0cygpKTtcblxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgZnVuY3Rpb24gaXNVcChkOklUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVQLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBpc0Rvd24oZDpJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBkLnZhbHVlID09PSBBdmFpbFN0YXR1cy5ET1dOLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBpc1Vua25vd24oZDpJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBkLnZhbHVlID09PSBBdmFpbFN0YXR1cy5VTktOT1dOLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBmb3JtYXRUcmFuc2Zvcm1lZERhdGFQb2ludHMoaW5BdmFpbERhdGE6SUF2YWlsRGF0YVBvaW50W10pOklUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10ge1xuICAgICAgICAgIGxldCBvdXRwdXREYXRhOklUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10gPSBbXTtcbiAgICAgICAgICBsZXQgaXRlbUNvdW50ID0gaW5BdmFpbERhdGEubGVuZ3RoO1xuXG4gICAgICAgICAgZnVuY3Rpb24gc29ydEJ5VGltZXN0YW1wKGE6SUF2YWlsRGF0YVBvaW50LCBiOklBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgaWYgKGEudGltZXN0YW1wIDwgYi50aW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGEudGltZXN0YW1wID4gYi50aW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpbkF2YWlsRGF0YS5zb3J0KHNvcnRCeVRpbWVzdGFtcCk7XG5cblxuICAgICAgICAgIGlmIChpbkF2YWlsRGF0YSAmJiBpdGVtQ291bnQgPiAwICYmIGluQXZhaWxEYXRhWzBdLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgbGV0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgICAgICAgICBpZiAoaXRlbUNvdW50ID09PSAxKSB7XG4gICAgICAgICAgICAgIGxldCBhdmFpbEl0ZW0gPSBpbkF2YWlsRGF0YVswXTtcblxuICAgICAgICAgICAgICAvLyB3ZSBvbmx5IGhhdmUgb25lIGl0ZW0gd2l0aCBzdGFydCB0aW1lLiBBc3N1bWUgdW5rbm93biBmb3IgdGhlIHRpbWUgYmVmb3JlIChsYXN0IDFoKVxuICAgICAgICAgICAgICAvLyBAVE9ETyBhZGp1c3QgdG8gdGltZSBwaWNrZXJcbiAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KG5vdyAtIDYwICogNjAgKiAxMDAwLFxuICAgICAgICAgICAgICAgIGF2YWlsSXRlbS50aW1lc3RhbXAsIEF2YWlsU3RhdHVzLlVOS05PV04udG9TdHJpbmcoKSkpO1xuICAgICAgICAgICAgICAvLyBhbmQgdGhlIGRldGVybWluZWQgdmFsdWUgdXAgdW50aWwgdGhlIGVuZC5cbiAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KGF2YWlsSXRlbS50aW1lc3RhbXAsIG5vdywgYXZhaWxJdGVtLnZhbHVlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgbGV0IGJhY2t3YXJkc0VuZFRpbWUgPSBub3c7XG5cbiAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGluQXZhaWxEYXRhLmxlbmd0aDsgaSA+IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHdlIGhhdmUgZGF0YSBzdGFydGluZyBpbiB0aGUgZnV0dXJlLi4uIGRpc2NhcmQgaXRcbiAgICAgICAgICAgICAgICAvL2lmIChpbkF2YWlsRGF0YVtpIC0gMV0udGltZXN0YW1wID4gK21vbWVudCgpKSB7XG4gICAgICAgICAgICAgICAgLy8gIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIC8vfVxuICAgICAgICAgICAgICAgIGlmIChzdGFydFRpbWVzdGFtcCA+PSBpbkF2YWlsRGF0YVtpIC0gMV0udGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoc3RhcnRUaW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIGJhY2t3YXJkc0VuZFRpbWUsIGluQXZhaWxEYXRhW2kgLSAxXS52YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIGJhY2t3YXJkc0VuZFRpbWUsIGluQXZhaWxEYXRhW2kgLSAxXS52YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSA9IGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBvdXRwdXREYXRhO1xuICAgICAgICB9XG5cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVTaWRlWUF4aXNMYWJlbHMoKSB7XG4gICAgICAgICAgLy8vQFRvZG86IG1vdmUgb3V0IHRvIHN0eWxlc2hlZXRcbiAgICAgICAgICBzdmcuYXBwZW5kKCd0ZXh0JylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmFpbFVwTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDI1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdVcCcpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgndGV4dCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxEb3duTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDU1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdEb3duJyk7XG5cbiAgICAgICAgfVxuXG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludDpJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSB7XG4gICAgICAgICAgbGV0IHhBeGlzTWluID0gZDMubWluKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQsIChkOklUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiArZC5zdGFydDtcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgeEF4aXNNYXggPSBkMy5tYXgodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCwgKGQ6SVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICtkLmVuZDtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IGF2YWlsVGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgICAuZG9tYWluKFtzdGFydFRpbWVzdGFtcCwgZW5kVGltZXN0YW1wIHx8IHhBeGlzTWF4XSksXG5cbiAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2UoW2hlaWdodCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oWzAsIDRdKSxcblxuICAgICAgICAgICAgYXZhaWxYQXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgLnNjYWxlKGF2YWlsVGltZVNjYWxlKVxuICAgICAgICAgICAgICAudGlja3MoOClcbiAgICAgICAgICAgICAgLnRpY2tTaXplKDEzLCAwKVxuICAgICAgICAgICAgICAub3JpZW50KCd0b3AnKTtcblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgb2Zmc2V0IGZvciB0aGUgYmFyXG4gICAgICAgICAgLy8gVXAgb3IgVW5rbm93bjogb2Zmc2V0IDAsIERvd246IG9mZnNldCAzNVxuICAgICAgICAgIGZ1bmN0aW9uIGNhbGNCYXJZKGQ6SVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBoZWlnaHQgLSB5U2NhbGUoMCkgKyAoKGlzVXAoZCkgfHwgaXNVbmtub3duKGQpKSA/IDAgOiAzNSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gRm9yIGVhY2ggZGF0YXBvaW50IGNhbGN1bGF0ZSB0aGUgWSByZW1vdmVkIGhlaWdodCBmb3IgdGhlIGJhclxuICAgICAgICAgIC8vIFVua25vd246IGZ1bGwgaGVpZ2h0IDE1LCBVcCBvciBEb3duOiBoYWxmIGhlaWdodCwgNTBcbiAgICAgICAgICBmdW5jdGlvbiBjYWxjQmFySGVpZ2h0KGQ6SVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIHJldHVybiB5U2NhbGUoMCkgLSAoaXNVbmtub3duKGQpID8gMTUgOiA1MCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY2FsY0JhckZpbGwoZDpJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgaWYgKGlzVXAoZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjNTRBMjRFJzsgLy8gZ3JlZW5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNVbmtub3duKGQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndXJsKCNkaWFnb25hbC1zdHJpcGVzKSc7IC8vIGdyYXkgc3RyaXBlc1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjRDg1MDU0JzsgLy8gcmVkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncmVjdC5hdmFpbEJhcnMnKVxuICAgICAgICAgICAgLmRhdGEodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludClcbiAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxCYXJzJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgKGQ6SVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGF2YWlsVGltZVNjYWxlKCtkLnN0YXJ0KTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cigneScsIChkOklUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWShkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJIZWlnaHQoZCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQ6SVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGRFbmQgPSBlbmRUaW1lc3RhbXAgPyAoTWF0aC5taW4oK2QuZW5kLCBlbmRUaW1lc3RhbXApKSA6ICgrZC5lbmQpO1xuICAgICAgICAgICAgICByZXR1cm4gYXZhaWxUaW1lU2NhbGUoZEVuZCkgLSBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZDpJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gY2FsY0JhckZpbGwoZCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAwLjg1O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLm9uKCdtb3VzZWRvd24nLCAoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBicnVzaEVsZW0gPSBzdmcuc2VsZWN0KFwiLmJydXNoXCIpLm5vZGUoKTtcbiAgICAgICAgICAgICAgbGV0IGNsaWNrRXZlbnQ6IGFueSA9IG5ldyBFdmVudCgnbW91c2Vkb3duJyk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVggPSBkMy5ldmVudC5wYWdlWDtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRYID0gZDMuZXZlbnQuY2xpZW50WDtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWSA9IGQzLmV2ZW50LnBhZ2VZO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFkgPSBkMy5ldmVudC5jbGllbnRZO1xuICAgICAgICAgICAgICBicnVzaEVsZW0uZGlzcGF0Y2hFdmVudChjbGlja0V2ZW50KTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNldXAnLCAoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBicnVzaEVsZW0gPSBzdmcuc2VsZWN0KFwiLmJydXNoXCIpLm5vZGUoKTtcbiAgICAgICAgICAgICAgbGV0IGNsaWNrRXZlbnQ6IGFueSA9IG5ldyBFdmVudCgnbW91c2V1cCcpO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VYID0gZDMuZXZlbnQucGFnZVg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WCA9IGQzLmV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVkgPSBkMy5ldmVudC5wYWdlWTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRZID0gZDMuZXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgYnJ1c2hFbGVtLmRpc3BhdGNoRXZlbnQoY2xpY2tFdmVudCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIFRoZSBib3R0b20gbGluZSBvZiB0aGUgYXZhaWxhYmlsaXR5IGNoYXJ0XG4gICAgICAgICAgc3ZnLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuYXR0cihcIngxXCIsIDApXG4gICAgICAgICAgICAuYXR0cihcInkxXCIsIDcwKVxuICAgICAgICAgICAgLmF0dHIoXCJ4MlwiLCA2NTUpXG4gICAgICAgICAgICAuYXR0cihcInkyXCIsIDcwKVxuICAgICAgICAgICAgLmF0dHIoXCJzdHJva2Utd2lkdGhcIiwgMC41KVxuICAgICAgICAgICAgLmF0dHIoXCJzdHJva2VcIiwgXCIjRDBEMEQwXCIpO1xuXG4gICAgICAgICAgY3JlYXRlU2lkZVlBeGlzTGFiZWxzKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgLy8gY3JlYXRlIHgtYXhpc1xuICAgICAgICAgIHhBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd4IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeEF4aXMpO1xuXG4gICAgICAgICAgLy8gY3JlYXRlIHktYXhpc1xuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh5QXhpcyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGJydXNoRW5kKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDcwKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgfVxuXG5cbiAgICAgICAgICBmdW5jdGlvbiBicnVzaEVuZCgpIHtcbiAgICAgICAgICAgIGxldCBleHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMF0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgZW5kVGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzFdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgICAgIC8vc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsICFkMy5ldmVudC50YXJnZXQuZW1wdHkoKSk7XG4gICAgICAgICAgICBpZiAoZHJhZ1NlbGVjdGlvbkRlbHRhID49IDYwMDAwKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdEcmFnOiBBdmFpbFRpbWVSYW5nZUNoYW5nZWQ6JyArIGV4dGVudCk7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChFdmVudE5hbWVzLkFWQUlMX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGV4dGVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2guY2xlYXIoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignZGF0YScsIChuZXdEYXRhKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0F2YWlsIENoYXJ0IERhdGEgQ2hhbmdlZCcpO1xuICAgICAgICAgIGlmIChuZXdEYXRhKSB7XG4gICAgICAgICAgICB0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyA9IGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ3N0YXJ0VGltZXN0YW1wJywgJ2VuZFRpbWVzdGFtcCddLCAobmV3VGltZXN0YW1wKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0F2YWlsIENoYXJ0IFN0YXJ0L0VuZCBUaW1lc3RhbXAgQ2hhbmdlZCcpO1xuICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gK25ld1RpbWVzdGFtcFswXSB8fCBzdGFydFRpbWVzdGFtcDtcbiAgICAgICAgICBlbmRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzFdIHx8IGVuZFRpbWVzdGFtcDtcbiAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy50cmFuc2Zvcm1lZERhdGFQb2ludHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS5yZW5kZXIgPSAodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludDpJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1N0YXJ0aW5nIEF2YWlsIENoYXJ0IERpcmVjdGl2ZSBSZW5kZXInKTtcbiAgICAgICAgICBpZiAodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCAmJiB0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXAoJ1JlbmRlciBBdmFpbCBDaGFydCcpO1xuICAgICAgICAgICAgY29uc29sZS50aW1lKCdhdmFpbENoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAvLy9OT1RFOiBsYXllcmluZyBvcmRlciBpcyBpbXBvcnRhbnQhXG4gICAgICAgICAgICBvbmVUaW1lQ2hhcnRTZXR1cCgpO1xuICAgICAgICAgICAgZGV0ZXJtaW5lQXZhaWxTY2FsZSh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KTtcbiAgICAgICAgICAgIGNyZWF0ZVhhbmRZQXhlcygpO1xuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuICAgICAgICAgICAgY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCk7XG4gICAgICAgICAgICBjb25zb2xlLnRpbWVFbmQoJ2F2YWlsQ2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTpuZy5JUm9vdFNjb3BlU2VydmljZSkgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlKCRyb290U2NvcGUpO1xuICAgICAgfTtcblxuICAgICAgZGlyZWN0aXZlWyckaW5qZWN0J10gPSBbJyRyb290U2NvcGUnXTtcblxuICAgICAgcmV0dXJuIGRpcmVjdGl2ZTtcbiAgICB9XG5cbiAgfVxuXG4gIF9tb2R1bGUuZGlyZWN0aXZlKCdhdmFpbGFiaWxpdHlDaGFydCcsIEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLkZhY3RvcnkoKSk7XG59XG5cblxuXG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBjb25zdCBfbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycpO1xuXG4gIGV4cG9ydCBjbGFzcyBDb250ZXh0Q2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX1dJRFRIID0gNzUwO1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9IRUlHSFQgPSA1MDtcblxuICAgIHB1YmxpYyByZXN0cmljdCA9ICdFJztcbiAgICBwdWJsaWMgcmVwbGFjZSA9IHRydWU7XG5cbiAgICAvLyBDYW4ndCB1c2UgMS40IGRpcmVjdGl2ZSBjb250cm9sbGVycyBiZWNhdXNlIHdlIG5lZWQgdG8gc3VwcG9ydCAxLjMrXG4gICAgcHVibGljIHNjb3BlID0ge1xuICAgICAgZGF0YTogJz0nLFxuICAgICAgc2hvd1lBeGlzVmFsdWVzOiAnPSdcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6KHNjb3BlOmFueSwgZWxlbWVudDpuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczphbnkpID0+IHZvaWQ7XG5cbiAgICBwdWJsaWMgZGF0YVBvaW50czpJQ2hhcnREYXRhUG9pbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKCRyb290U2NvcGU6bmcuSVJvb3RTY29wZVNlcnZpY2UpIHtcblxuICAgICAgdGhpcy5saW5rID0gKHNjb3BlLCBlbGVtZW50LCBhdHRycykgPT4ge1xuXG4gICAgICAgIGNvbnN0IG1hcmdpbiA9IHt0b3A6IDAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwfTtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IGNoYXJ0SGVpZ2h0ID0gQ29udGV4dENoYXJ0RGlyZWN0aXZlLl9DSEFSVF9IRUlHSFQsXG4gICAgICAgICAgd2lkdGggPSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgaGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICBzaG93WUF4aXNWYWx1ZXM6Ym9vbGVhbixcbiAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgeUF4aXMsXG4gICAgICAgICAgeUF4aXNHcm91cCxcbiAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgeEF4aXMsXG4gICAgICAgICAgeEF4aXNHcm91cCxcbiAgICAgICAgICBicnVzaCxcbiAgICAgICAgICBicnVzaEdyb3VwLFxuICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgIHN2ZztcblxuICAgICAgICBpZiAodHlwZW9mIGF0dHJzLnNob3dZQXhpc1ZhbHVlcyAhPSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlcyA9IGF0dHJzLnNob3dZQXhpc1ZhbHVlcyA9PT0gJ3RydWUnO1xuICAgICAgICB9XG5cblxuICAgICAgICBmdW5jdGlvbiBzZXR1cCgpOnZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgd2lkdGggKyBtYXJnaW4ubGVmdCArIG1hcmdpbi5yaWdodClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBpbm5lckNoYXJ0SGVpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ3ZpZXdCb3gnLCAnMCAwIDc2MCA1MCcpLmF0dHIoJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLCAneE1pbllNaW4gbWVldCcpO1xuXG4gICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsIDApJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdjb250ZXh0Q2hhcnQnKTtcblxuICAgICAgICB9XG5cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVDb250ZXh0Q2hhcnQoZGF0YVBvaW50czpJQ2hhcnREYXRhUG9pbnRbXSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdkYXRhUG9pbnRzLmxlbmd0aDogJyArIGRhdGFQb2ludHMubGVuZ3RoKTtcblxuICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aCAtIDEwXSlcbiAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgIC5kb21haW4oW2RhdGFQb2ludHNbMF0udGltZXN0YW1wLCBkYXRhUG9pbnRzW2RhdGFQb2ludHMubGVuZ3RoIC0gMV0udGltZXN0YW1wXSk7XG5cbiAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAudGlja3MoNSlcbiAgICAgICAgICAgIC50aWNrU2l6ZSg0LCAwKVxuICAgICAgICAgICAgLnRpY2tGb3JtYXQoeEF4aXNUaW1lRm9ybWF0cygpKVxuICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgIHhBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd4IGF4aXMnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwnICsgaGVpZ2h0ICsgJyknKVxuICAgICAgICAgICAgLmNhbGwoeEF4aXMpO1xuXG5cbiAgICAgICAgICBsZXQgeU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCB5TWF4ID0gZDMubWF4KGRhdGFQb2ludHMsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBnaXZlIGEgcGFkIG9mICUgdG8gbWluL21heCBzbyB3ZSBhcmUgbm90IGFnYWluc3QgeC1heGlzXG4gICAgICAgICAgeU1heCA9IHlNYXggKyAoeU1heCAqIDAuMDMpO1xuICAgICAgICAgIHlNaW4gPSB5TWluIC0gKHlNaW4gKiAwLjA1KTtcblxuICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAucmFuZ2VSb3VuZChbQ29udGV4dENoYXJ0RGlyZWN0aXZlLl9DSEFSVF9IRUlHSFQgLSAxMCwgMF0pXG4gICAgICAgICAgICAubmljZSgpXG4gICAgICAgICAgICAuZG9tYWluKFt5TWluLCB5TWF4XSk7XG5cblxuICAgICAgICAgIGxldCBudW1iZXJPZlRpY2tzID0gc2hvd1lBeGlzVmFsdWVzID8gMiA6IDA7XG5cbiAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAudGlja3MobnVtYmVyT2ZUaWNrcylcbiAgICAgICAgICAgIC50aWNrU2l6ZSg0LCAwKVxuICAgICAgICAgICAgLm9yaWVudChcImxlZnRcIik7XG5cbiAgICAgICAgICB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcblxuICAgICAgICAgIGxldCBhcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgICAgLmludGVycG9sYXRlKCdjYXJkaW5hbCcpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDphbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOmFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTAoKGQ6YW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBoZWlnaHQ7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkxKChkOmFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IGNvbnRleHRMaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgLmludGVycG9sYXRlKCdjYXJkaW5hbCcpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDphbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOmFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueSgoZDphbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBwYXRoQ29udGV4dExpbmUgPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmNvbnRleHRMaW5lJykuZGF0YShbZGF0YVBvaW50c10pO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgcGF0aENvbnRleHRMaW5lLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRMaW5lJylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5hdHRyKCdkJywgY29udGV4dExpbmUpO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgcGF0aENvbnRleHRMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdjb250ZXh0TGluZScpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuYXR0cignZCcsIGNvbnRleHRMaW5lKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIHBhdGhDb250ZXh0TGluZS5leGl0KCkucmVtb3ZlKCk7XG5cblxuICAgICAgICAgIGxldCBjb250ZXh0QXJlYSA9IHN2Zy5hcHBlbmQoXCJnXCIpXG4gICAgICAgICAgICAuYXR0cihcImNsYXNzXCIsIFwiY29udGV4dFwiKTtcblxuICAgICAgICAgIGNvbnRleHRBcmVhLmFwcGVuZChcInBhdGhcIilcbiAgICAgICAgICAgIC5kYXR1bShkYXRhUG9pbnRzKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmR1cmF0aW9uKDUwMClcbiAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJjb250ZXh0QXJlYVwiKVxuICAgICAgICAgICAgLmF0dHIoXCJkXCIsIGFyZWEpO1xuXG4gICAgICAgIH1cblxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBjb250ZXh0QnJ1c2hTdGFydClcbiAgICAgICAgICAgIC5vbignYnJ1c2hlbmQnLCBjb250ZXh0QnJ1c2hFbmQpO1xuXG4gICAgICAgICAgeEF4aXNHcm91cC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cigneScsIDApXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaGVpZ2h0IC0gMTApO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JydXNoJylcbiAgICAgICAgICAgIC5jYWxsKGJydXNoKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCcucmVzaXplJykuYXBwZW5kKCdwYXRoJyk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaGVpZ2h0ICsgMTcpO1xuXG4gICAgICAgICAgZnVuY3Rpb24gY29udGV4dEJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgfVxuXG5cbiAgICAgICAgICBmdW5jdGlvbiBjb250ZXh0QnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgYnJ1c2hFeHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChicnVzaEV4dGVudFswXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChicnVzaEV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvLy8gV2UgaWdub3JlIGRyYWcgc2VsZWN0aW9ucyB1bmRlciBhIG1pbnV0ZVxuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRHJhZzogQ29udGV4dENoYXJ0VGltZVJhbmdlQ2hhbmdlZDonICsgYnJ1c2hFeHRlbnQpO1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5DT05URVhUX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGJydXNoRXh0ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdDb250ZXh0IENoYXJ0IERhdGEgQ2hhbmdlZCcpO1xuICAgICAgICAgIGlmIChuZXdEYXRhKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFQb2ludHMgPSBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KGFuZ3VsYXIuZnJvbUpzb24obmV3RGF0YSkpO1xuICAgICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMuZGF0YVBvaW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOklDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAvLyAgVGhlIHNjaGVtYSBpcyBkaWZmZXJlbnQgZm9yIGJ1Y2tldGVkIG91dHB1dFxuICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6SUNoYXJ0RGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIGxldCB0aW1lc3RhbXA6VGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAvL2RhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50czpJQ2hhcnREYXRhUG9pbnRbXSkgPT4ge1xuICAgICAgICAgIGlmIChkYXRhUG9pbnRzICYmIGRhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS5ncm91cCgnUmVuZGVyIENvbnRleHQgQ2hhcnQnKTtcbiAgICAgICAgICAgIGNvbnNvbGUudGltZSgnY29udGV4dENoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAvLy9OT1RFOiBsYXllcmluZyBvcmRlciBpcyBpbXBvcnRhbnQhXG4gICAgICAgICAgICBzZXR1cCgpO1xuICAgICAgICAgICAgY3JlYXRlQ29udGV4dENoYXJ0KGRhdGFQb2ludHMpO1xuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuICAgICAgICAgICAgY29uc29sZS50aW1lRW5kKCdjb250ZXh0Q2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTpuZy5JUm9vdFNjb3BlU2VydmljZSkgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IENvbnRleHRDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnaGF3a3VsYXJDb250ZXh0Q2hhcnQnLCBDb250ZXh0Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSgpKTtcbn1cblxuXG5cbiIsIi8vL1xuLy8vIENvcHlyaWdodCAyMDE1IFJlZCBIYXQsIEluYy4gYW5kL29yIGl0cyBhZmZpbGlhdGVzXG4vLy8gYW5kIG90aGVyIGNvbnRyaWJ1dG9ycyBhcyBpbmRpY2F0ZWQgYnkgdGhlIEBhdXRob3IgdGFncy5cbi8vL1xuLy8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy8vXG4vLy8gICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vLy9cbi8vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8vL1xuLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuXG4vLy8gTk9URTogdGhpcyBwYXR0ZXJuIGlzIHVzZWQgYmVjYXVzZSBlbnVtcyBjYW50IGJlIHVzZWQgd2l0aCBzdHJpbmdzXG4gIGV4cG9ydCBjbGFzcyBFdmVudE5hbWVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnQ2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG4gICAgcHVibGljIHN0YXRpYyBBVkFJTF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdBdmFpbENoYXJ0VGltZVJhbmdlQ2hhbmdlZCcpO1xuICAgIHB1YmxpYyBzdGF0aWMgQ09OVEVYVF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdDb250ZXh0Q2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG5cblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB2YWx1ZTpzdHJpbmcpIHtcbiAgICAgIC8vIGVtcHR5XG4gICAgfVxuXG4gICAgcHVibGljIHRvU3RyaW5nKCk6c3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURhdGFQb2ludHMoc3ZnOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeVNjYWxlOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGlwOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YVBvaW50czpJQ2hhcnREYXRhUG9pbnRbXSkge1xuICAgIGxldCByYWRpdXMgPSAxO1xuICAgIGxldCBkb3REYXRhcG9pbnQgPSBzdmcuc2VsZWN0QWxsKCcuZGF0YVBvaW50RG90JykuZGF0YShkYXRhUG9pbnRzKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBkb3REYXRhcG9pbnQuYXR0cignY2xhc3MnLCAnZGF0YVBvaW50RG90JylcbiAgICAgIC5hdHRyKCdyJywgcmFkaXVzKVxuICAgICAgLmF0dHIoJ2N4JywgZnVuY3Rpb24gKGQpIHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2N5JywgZnVuY3Rpb24gKGQpIHtcbiAgICAgICAgcmV0dXJuIGQuYXZnID8geVNjYWxlKGQuYXZnKSA6IC05OTk5OTk5O1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIGZ1bmN0aW9uIChkLCBpKSB7XG4gICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICB9KS5vbignbW91c2VvdXQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICB0aXAuaGlkZSgpO1xuICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGRvdERhdGFwb2ludC5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgIC5hdHRyKCdjbGFzcycsICdkYXRhUG9pbnREb3QnKVxuICAgICAgLmF0dHIoJ3InLCByYWRpdXMpXG4gICAgICAuYXR0cignY3gnLCBmdW5jdGlvbiAoZCkge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCBmdW5jdGlvbiAoZCkge1xuICAgICAgICByZXR1cm4gZC5hdmcgPyB5U2NhbGUoZC5hdmcpIDogLTk5OTk5OTk7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgZnVuY3Rpb24gKGQsIGkpIHtcbiAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgIH0pLm9uKCdtb3VzZW91dCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHRpcC5oaWRlKCk7XG4gICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgZG90RGF0YXBvaW50LmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGRlY2xhcmUgbGV0IGQzOmFueTtcbiAgZGVjbGFyZSBsZXQgY29uc29sZTphbnk7XG5cbiAgbGV0IGRlYnVnOmJvb2xlYW4gPSBmYWxzZTtcblxuICAvLyB0aGUgc2NhbGUgdG8gdXNlIGZvciB5LWF4aXMgd2hlbiBhbGwgdmFsdWVzIGFyZSAwLCBbMCwgREVGQVVMVF9ZX1NDQUxFXVxuICBleHBvcnQgY29uc3QgREVGQVVMVF9ZX1NDQUxFID0gMTA7XG4gIGV4cG9ydCBjb25zdCBZX0FYSVNfSEVJR0hUID0gMjU7XG4gIGV4cG9ydCBjb25zdCBDSEFSVF9IRUlHSFQgPSAyNTA7XG4gIGV4cG9ydCBjb25zdCBDSEFSVF9XSURUSCA9IDc1MDtcbiAgZXhwb3J0IGNvbnN0IEhPVkVSX0RBVEVfVElNRV9GT1JNQVQgPSAnTU0vREQvWVlZWSBoOm1tIGEnO1xuICBleHBvcnQgY29uc3QgQkFSX09GRlNFVCA9IDI7XG4gIGV4cG9ydCBjb25zdCBtYXJnaW4gPSB7dG9wOiAxMCwgcmlnaHQ6IDUsIGJvdHRvbTogNSwgbGVmdDogOTB9O1xuICBleHBvcnQgbGV0IHdpZHRoID0gQ0hBUlRfV0lEVEggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodDtcblxuXG4gIC8qKlxuICAgKiBAbmdkb2MgZGlyZWN0aXZlXG4gICAqIEBuYW1lIGhhd2t1bGFyQ2hhcnRcbiAgICogQGRlc2NyaXB0aW9uIEEgZDMgYmFzZWQgY2hhcnRpbmcgZGlyZWN0aW9uIHRvIHByb3ZpZGUgY2hhcnRpbmcgdXNpbmcgdmFyaW91cyBzdHlsZXMgb2YgY2hhcnRzLlxuICAgKlxuICAgKi9cbiAgYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycpXG4gICAgLmRpcmVjdGl2ZSgnaGF3a3VsYXJDaGFydCcsIFsnJHJvb3RTY29wZScsICckaHR0cCcsICckaW50ZXJ2YWwnLCAnJGxvZycsXG4gICAgICAgIGZ1bmN0aW9uICgkcm9vdFNjb3BlOm5nLklSb290U2NvcGVTZXJ2aWNlLFxuICAgICAgICAgICAgICAgICAgJGh0dHA6bmcuSUh0dHBTZXJ2aWNlLFxuICAgICAgICAgICAgICAgICAgJGludGVydmFsOm5nLklJbnRlcnZhbFNlcnZpY2UsXG4gICAgICAgICAgICAgICAgICAkbG9nOm5nLklMb2dTZXJ2aWNlKTpuZy5JRGlyZWN0aXZlIHtcblxuICAgICAgICAgIC8vLyBvbmx5IGZvciB0aGUgc3RhbmQgYWxvbmUgY2hhcnRzXG4gICAgICAgICAgY29uc3QgQkFTRV9VUkwgPSAnL2hhd2t1bGFyL21ldHJpY3MnO1xuXG4gICAgICAgICAgZnVuY3Rpb24gbGluayhzY29wZSwgZWxlbWVudCwgYXR0cnMpIHtcblxuXG5cbiAgICAgICAgICAgIC8vIGRhdGEgc3BlY2lmaWMgdmFyc1xuICAgICAgICAgICAgbGV0IGRhdGFQb2ludHM6SUNoYXJ0RGF0YVBvaW50W10gPSBbXSxcbiAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzOklNdWx0aURhdGFQb2ludFtdLFxuICAgICAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHM6SVNpbXBsZU1ldHJpY1tdLFxuICAgICAgICAgICAgICBkYXRhVXJsID0gYXR0cnMubWV0cmljVXJsLFxuICAgICAgICAgICAgICBtZXRyaWNJZCA9IGF0dHJzLm1ldHJpY0lkIHx8ICcnLFxuICAgICAgICAgICAgICBtZXRyaWNUZW5hbnRJZCA9IGF0dHJzLm1ldHJpY1RlbmFudElkIHx8ICcnLFxuICAgICAgICAgICAgICBtZXRyaWNUeXBlID0gYXR0cnMubWV0cmljVHlwZSB8fCAnZ2F1Z2UnLFxuICAgICAgICAgICAgICB0aW1lUmFuZ2VJblNlY29uZHMgPSArYXR0cnMudGltZVJhbmdlSW5TZWNvbmRzIHx8IDQzMjAwLFxuICAgICAgICAgICAgICByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgPSArYXR0cnMucmVmcmVzaEludGVydmFsSW5TZWNvbmRzIHx8IDM2MDAsXG4gICAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSArYXR0cnMuYWxlcnRWYWx1ZSxcbiAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbiA9IGF0dHJzLmludGVycG9sYXRpb24gfHwgJ21vbm90b25lJyxcbiAgICAgICAgICAgICAgZW5kVGltZXN0YW1wOlRpbWVJbk1pbGxpcyA9IERhdGUubm93KCksXG4gICAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOlRpbWVJbk1pbGxpcyA9IGVuZFRpbWVzdGFtcCAtIHRpbWVSYW5nZUluU2Vjb25kcyxcbiAgICAgICAgICAgICAgcHJldmlvdXNSYW5nZURhdGFQb2ludHMgPSBbXSxcbiAgICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGEgPSBbXSxcbiAgICAgICAgICAgICAgY2hhcnRUeXBlID0gYXR0cnMuY2hhcnRUeXBlIHx8ICdsaW5lJyxcbiAgICAgICAgICAgICAgc2luZ2xlVmFsdWVMYWJlbCA9IGF0dHJzLnNpbmdsZVZhbHVlTGFiZWwgfHwgJ1JhdyBWYWx1ZScsXG4gICAgICAgICAgICAgIG5vRGF0YUxhYmVsID0gYXR0cnMubm9EYXRhTGFiZWwgfHwgJ05vIERhdGEnLFxuICAgICAgICAgICAgICBkdXJhdGlvbkxhYmVsID0gYXR0cnMuZHVyYXRpb25MYWJlbCB8fCAnSW50ZXJ2YWwnLFxuICAgICAgICAgICAgICBtaW5MYWJlbCA9IGF0dHJzLm1pbkxhYmVsIHx8ICdNaW4nLFxuICAgICAgICAgICAgICBtYXhMYWJlbCA9IGF0dHJzLm1heExhYmVsIHx8ICdNYXgnLFxuICAgICAgICAgICAgICBhdmdMYWJlbCA9IGF0dHJzLmF2Z0xhYmVsIHx8ICdBdmcnLFxuICAgICAgICAgICAgICB0aW1lc3RhbXBMYWJlbCA9IGF0dHJzLnRpbWVzdGFtcExhYmVsIHx8ICdUaW1lc3RhbXAnLFxuICAgICAgICAgICAgICBzaG93QXZnTGluZSA9IHRydWUsXG4gICAgICAgICAgICAgIHNob3dEYXRhUG9pbnRzID0gZmFsc2UsXG4gICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzID0gZmFsc2UsXG4gICAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvLyBjaGFydCBzcGVjaWZpYyB2YXJzXG5cbiAgICAgICAgICAgIGxldCBhZGp1c3RlZENoYXJ0SGVpZ2h0ID0gQ0hBUlRfSEVJR0hUIC0gNTAsXG4gICAgICAgICAgICAgIGhlaWdodCA9IGFkanVzdGVkQ2hhcnRIZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICAgICAgc21hbGxDaGFydFRocmVzaG9sZEluUGl4ZWxzID0gNjAwLFxuICAgICAgICAgICAgICB0aXRsZUhlaWdodCA9IDMwLCB0aXRsZVNwYWNlID0gMTAsXG4gICAgICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wIC0gdGl0bGVIZWlnaHQgLSB0aXRsZVNwYWNlICsgbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodDIgPSArdGl0bGVIZWlnaHQgKyB0aXRsZVNwYWNlICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgeUF4aXMsXG4gICAgICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgICAgICB0aXAsXG4gICAgICAgICAgICAgIGJydXNoLFxuICAgICAgICAgICAgICBicnVzaEdyb3VwLFxuICAgICAgICAgICAgICBjaGFydCxcbiAgICAgICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgICAgIHN2ZyxcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbixcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgICAgYXZnLFxuICAgICAgICAgICAgICBwZWFrLFxuICAgICAgICAgICAgICBtaW4sXG4gICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEsXG4gICAgICAgICAgICAgIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhO1xuXG4gICAgICAgICAgICBsZXQgaGFzSW5pdCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBkYXRhUG9pbnRzID0gYXR0cnMuZGF0YTtcbiAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IGF0dHJzLmZvcmVjYXN0RGF0YTtcbiAgICAgICAgICAgIHNob3dEYXRhUG9pbnRzID0gYXR0cnMuc2hvd0RhdGFQb2ludHM7XG4gICAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YVBvaW50cyA9IGF0dHJzLnByZXZpb3VzUmFuZ2VEYXRhO1xuICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGEgPSBhdHRycy5hbm5vdGF0aW9uRGF0YTtcblxuICAgICAgICAgICAgbGV0IHN0YXJ0SW50ZXJ2YWxQcm9taXNlO1xuXG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGdldENoYXJ0V2lkdGgoKTpudW1iZXIge1xuICAgICAgICAgICAgICAvL3JldHVybiBhbmd1bGFyLmVsZW1lbnQoJyMnICsgY2hhcnRDb250ZXh0LmNoYXJ0SGFuZGxlKS53aWR0aCgpO1xuICAgICAgICAgICAgICByZXR1cm4gQ0hBUlRfV0lEVEg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHVzZVNtYWxsQ2hhcnRzKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICAgIHJldHVybiBnZXRDaGFydFdpZHRoKCkgPD0gc21hbGxDaGFydFRocmVzaG9sZEluUGl4ZWxzO1xuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGluaXRpYWxpemF0aW9uKCk6dm9pZCB7XG4gICAgICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgICAgICBpZiAoY2hhcnQpIHtcbiAgICAgICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjaGFydFBhcmVudCA9IGQzLnNlbGVjdChlbGVtZW50WzBdKTtcbiAgICAgICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3ZpZXdCb3gnLCAnMCAwIDc2MCAnICsgKENIQVJUX0hFSUdIVCArIFlfQVhJU19IRUlHSFQpKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ3hNaW5ZTWluIG1lZXQnKTtcblxuICAgICAgICAgICAgICBjcmVhdGVTdmdEZWZzKGNoYXJ0KTtcblxuICAgICAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoICsgbWFyZ2luLmxlZnQgKyBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywnICsgKGFkanVzdGVkQ2hhcnRIZWlnaHQyKSArICcpJyk7XG5cbiAgICAgICAgICAgICAgdGlwID0gZDMudGlwKClcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZDMtdGlwJylcbiAgICAgICAgICAgICAgICAub2Zmc2V0KFstMTAsIDBdKVxuICAgICAgICAgICAgICAgIC5odG1sKChkLCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gYnVpbGRIb3ZlcihkLCBpKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuXG4gICAgICAgICAgICAgIC8vIGEgcGxhY2Vob2xkZXIgZm9yIHRoZSBhbGVydHNcbiAgICAgICAgICAgICAgc3ZnLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2FsZXJ0SG9sZGVyJyk7XG5cbiAgICAgICAgICAgICAgaGFzSW5pdCA9IHRydWU7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgZnVuY3Rpb24gc2V0dXBGaWx0ZXJlZERhdGEoZGF0YVBvaW50czpJQ2hhcnREYXRhUG9pbnRbXSk6dm9pZCB7XG5cbiAgICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgICBwZWFrID0gZDMubWF4KGRhdGFQb2ludHMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyAoZC5hdmcgfHwgZC52YWx1ZSkgOiAwO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgICAgIG1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpID8gKGQuYXZnIHx8IGQudmFsdWUpIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vLyBsZXRzIGFkanVzdCB0aGUgbWluIGFuZCBtYXggdG8gYWRkIHNvbWUgdmlzdWFsIHNwYWNpbmcgYmV0d2VlbiBpdCBhbmQgdGhlIGF4ZXNcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbiA9IHVzZVplcm9NaW5WYWx1ZSA/IDAgOiBtaW4gKiAuOTU7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBwZWFrICsgKChwZWFrIC0gbWluKSAqIDAuMik7XG5cbiAgICAgICAgICAgICAgLy8vIGNoZWNrIGlmIHdlIG5lZWQgdG8gYWRqdXN0IGhpZ2gvbG93IGJvdW5kIHRvIGZpdCBhbGVydCB2YWx1ZVxuICAgICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBNYXRoLm1heCh2aXN1YWxseUFkanVzdGVkTWF4LCBhbGVydFZhbHVlICogMS4yKTtcbiAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluID0gTWF0aC5taW4odmlzdWFsbHlBZGp1c3RlZE1pbiwgYWxlcnRWYWx1ZSAqIC45NSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLy8gdXNlIGRlZmF1bHQgWSBzY2FsZSBpbiBjYXNlIGhpZ2ggYW5kIGxvdyBib3VuZCBhcmUgMCAoaWUsIG5vIHZhbHVlcyBvciBhbGwgMClcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9ICEhIXZpc3VhbGx5QWRqdXN0ZWRNYXggJiYgISEhdmlzdWFsbHlBZGp1c3RlZE1pbiA/IERFRkFVTFRfWV9TQ0FMRSA6IHZpc3VhbGx5QWRqdXN0ZWRNYXg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZVNjYWxlKGRhdGFQb2ludHM6SUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICAgICAgICAgICAgbGV0IHhUaWNrcywgbnVtYmVyT2ZCYXJzRm9yU21hbGxHcmFwaCA9IDIwO1xuXG4gICAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgICAgICAgIC8vIGlmIHdpbmRvdyBpcyB0b28gc21hbGwgc2VydmVyIHVwIHNtYWxsIGNoYXJ0XG4gICAgICAgICAgICAgICAgaWYgKHVzZVNtYWxsQ2hhcnRzKCkpIHtcbiAgICAgICAgICAgICAgICAgIHdpZHRoID0gMjUwO1xuICAgICAgICAgICAgICAgICAgeFRpY2tzID0gMztcbiAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSA9IGRhdGFQb2ludHMuc2xpY2UoZGF0YVBvaW50cy5sZW5ndGggLSBudW1iZXJPZkJhcnNGb3JTbWFsbEdyYXBoLCBkYXRhUG9pbnRzLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgLy8gIHdlIHVzZSB0aGUgd2lkdGggYWxyZWFkeSBkZWZpbmVkIGFib3ZlXG4gICAgICAgICAgICAgICAgICB4VGlja3MgPSA5O1xuICAgICAgICAgICAgICAgICAgY2hhcnREYXRhID0gZGF0YVBvaW50cztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzZXR1cEZpbHRlcmVkRGF0YShkYXRhUG9pbnRzKTtcblxuICAgICAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgICAgIC5yYW5nZVJvdW5kKFtoZWlnaHQsIDBdKVxuICAgICAgICAgICAgICAgICAgLmRvbWFpbihbdmlzdWFsbHlBZGp1c3RlZE1pbiwgdmlzdWFsbHlBZGp1c3RlZE1heF0pO1xuXG4gICAgICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAgICAgLnRpY2tzKDUpXG4gICAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgICAgICAgIGxldCB0aW1lU2NhbGVNaW4gPSBkMy5taW4oZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgICAgICBsZXQgdGltZVNjYWxlTWF4O1xuICAgICAgICAgICAgICAgIGlmIChmb3JlY2FzdERhdGFQb2ludHMgJiYgZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZU1heCA9IGZvcmVjYXN0RGF0YVBvaW50c1tmb3JlY2FzdERhdGFQb2ludHMubGVuZ3RoIC0gMV0udGltZXN0YW1wO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBkMy5tYXgoZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQudGltZXN0YW1wO1xuICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAgICAgICAuZG9tYWluKFt0aW1lU2NhbGVNaW4sIHRpbWVTY2FsZU1heF0pO1xuXG4gICAgICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHNldHVwRmlsdGVyZWRNdWx0aURhdGEobXVsdGlEYXRhUG9pbnRzOklNdWx0aURhdGFQb2ludFtdKTphbnkge1xuICAgICAgICAgICAgICBsZXQgYWxlcnRQZWFrOm51bWJlcixcbiAgICAgICAgICAgICAgICBoaWdoUGVhazpudW1iZXI7XG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lTXVsdGlEYXRhTWluTWF4KCkge1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50TWF4Om51bWJlcixcbiAgICAgICAgICAgICAgICAgIGN1cnJlbnRNaW46bnVtYmVyLFxuICAgICAgICAgICAgICAgICAgc2VyaWVzTWF4Om51bWJlcixcbiAgICAgICAgICAgICAgICAgIHNlcmllc01pbjpudW1iZXIsXG4gICAgICAgICAgICAgICAgICBtYXhMaXN0Om51bWJlcltdID0gW10sXG4gICAgICAgICAgICAgICAgICBtaW5MaXN0Om51bWJlcltdID0gW107XG5cbiAgICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMuZm9yRWFjaCgoc2VyaWVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICBjdXJyZW50TWF4ID0gZDMubWF4KHNlcmllcy52YWx1ZXMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6IGQuYXZnO1xuICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgICAgbWF4TGlzdC5wdXNoKGN1cnJlbnRNYXgpO1xuICAgICAgICAgICAgICAgICAgY3VycmVudE1pbiA9IGQzLm1pbihzZXJpZXMudmFsdWVzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyBkLmF2ZyA6IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICBtaW5MaXN0LnB1c2goY3VycmVudE1pbik7XG5cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzZXJpZXNNYXggPSBkMy5tYXgobWF4TGlzdCk7XG4gICAgICAgICAgICAgICAgc2VyaWVzTWluID0gZDMubWluKG1pbkxpc3QpO1xuICAgICAgICAgICAgICAgIHJldHVybiBbc2VyaWVzTWluLCBzZXJpZXNNYXhdO1xuICAgICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgICBjb25zdCBtaW5NYXggPSBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKTtcbiAgICAgICAgICAgICAgcGVhayA9IG1pbk1heFsxXTtcbiAgICAgICAgICAgICAgbWluID0gbWluTWF4WzBdO1xuXG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluIC0gKG1pbiAqIDAuMDUpO1xuICAgICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIGFsZXJ0UGVhayA9IChhbGVydFZhbHVlICogMS4yKTtcbiAgICAgICAgICAgICAgICBoaWdoUGVhayA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcbiAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gYWxlcnRQZWFrID4gaGlnaFBlYWsgPyBhbGVydFBlYWsgOiBoaWdoUGVhaztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmV0dXJuIFt2aXN1YWxseUFkanVzdGVkTWluLCAhISF2aXN1YWxseUFkanVzdGVkTWF4ICYmICEhIXZpc3VhbGx5QWRqdXN0ZWRNaW4gPyBERUZBVUxUX1lfU0NBTEUgOiB2aXN1YWxseUFkanVzdGVkTWF4XTtcbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVNdWx0aVNjYWxlKG11bHRpRGF0YVBvaW50czpJTXVsdGlEYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgICBjb25zdCB4VGlja3MgPSA5O1xuXG4gICAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMgJiYgbXVsdGlEYXRhUG9pbnRzWzBdICYmIG11bHRpRGF0YVBvaW50c1swXS52YWx1ZXMpIHtcblxuICAgICAgICAgICAgICAgIGxldCBsb3dIaWdoID0gc2V0dXBGaWx0ZXJlZE11bHRpRGF0YShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSBsb3dIaWdoWzBdO1xuICAgICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBsb3dIaWdoWzFdO1xuXG4gICAgICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAgICAgLnJhbmdlUm91bmQoW2hlaWdodCwgMF0pXG4gICAgICAgICAgICAgICAgICAuZG9tYWluKFt2aXN1YWxseUFkanVzdGVkTWluLCB2aXN1YWxseUFkanVzdGVkTWF4XSk7XG5cbiAgICAgICAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgICAgICAudGlja3MoNSlcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoXSlcbiAgICAgICAgICAgICAgICAgIC5kb21haW4oW2QzLm1pbihtdWx0aURhdGFQb2ludHMsIChkKSA9PiBkMy5taW4oZC52YWx1ZXMsIChwKSA9PiBwLnRpbWVzdGFtcCkpLFxuICAgICAgICAgICAgICAgICAgICBkMy5tYXgobXVsdGlEYXRhUG9pbnRzLCAoZCkgPT4gZDMubWF4KGQudmFsdWVzLCAocCkgPT4gcC50aW1lc3RhbXApKV0pO1xuXG4gICAgICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogTG9hZCBtZXRyaWNzIGRhdGEgZGlyZWN0bHkgZnJvbSBhIHJ1bm5pbmcgSGF3a3VsYXItTWV0cmljcyBzZXJ2ZXJcbiAgICAgICAgICAgICAqIEBwYXJhbSB1cmxcbiAgICAgICAgICAgICAqIEBwYXJhbSBtZXRyaWNJZFxuICAgICAgICAgICAgICogQHBhcmFtIHN0YXJ0VGltZXN0YW1wXG4gICAgICAgICAgICAgKiBAcGFyYW0gZW5kVGltZXN0YW1wXG4gICAgICAgICAgICAgKiBAcGFyYW0gYnVja2V0c1xuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UodXJsOlVybFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0cmljSWQ6TWV0cmljSWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXA6VGltZUluTWlsbGlzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZFRpbWVzdGFtcDpUaW1lSW5NaWxsaXMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnVja2V0cyA9IDYwKSB7XG5cbiAgICAgICAgICAgICAgbGV0IHJlcXVlc3RDb25maWc6bmcuSVJlcXVlc3RDb25maWcgPSA8YW55PiB7XG4gICAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICAgJ0hhd2t1bGFyLVRlbmFudCc6IG1ldHJpY1RlbmFudElkXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgIGVuZDogZW5kVGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgYnVja2V0czogYnVja2V0c1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBpZiAoc3RhcnRUaW1lc3RhbXAgPj0gZW5kVGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgICAgJGxvZy5sb2coJ1N0YXJ0IGRhdGUgd2FzIGFmdGVyIGVuZCBkYXRlJyk7XG4gICAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICAgIGlmICh1cmwgJiYgbWV0cmljVHlwZSAmJiBtZXRyaWNJZCkge1xuXG4gICAgICAgICAgICAgICAgbGV0IG1ldHJpY1R5cGVBbmREYXRhID0gbWV0cmljVHlwZS5zcGxpdCgnLScpO1xuICAgICAgICAgICAgICAgIC8vLyBzYW1wbGUgdXJsOlxuICAgICAgICAgICAgICAgIC8vLyBodHRwOi8vbG9jYWxob3N0OjgwODAvaGF3a3VsYXIvbWV0cmljcy9nYXVnZXMvNDViMjI1NmVmZjE5Y2I5ODI1NDJiMTY3YjM5NTcwMzYuc3RhdHVzLmR1cmF0aW9uL2RhdGE/XG4gICAgICAgICAgICAgICAgLy8gYnVja2V0cz0xMjAmZW5kPTE0MzY4MzE3OTc1MzMmc3RhcnQ9MTQzNjgyODE5NzUzMydcbiAgICAgICAgICAgICAgICAkaHR0cC5nZXQodXJsICsgJy8nICsgbWV0cmljVHlwZUFuZERhdGFbMF0gKyAncy8nICsgbWV0cmljSWQgKyAnLycgKyAobWV0cmljVHlwZUFuZERhdGFbMV0gfHwgJ2RhdGEnKSxcbiAgICAgICAgICAgICAgICAgIHJlcXVlc3RDb25maWcpLnN1Y2Nlc3MoKHJlc3BvbnNlKSA9PiB7XG5cbiAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG5cbiAgICAgICAgICAgICAgICB9KS5lcnJvcigocmVhc29uLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICRsb2cuZXJyb3IoJ0Vycm9yIExvYWRpbmcgQ2hhcnQgRGF0YTonICsgc3RhdHVzICsgJywgJyArIHJlYXNvbik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFRyYW5zZm9ybSB0aGUgcmF3IGh0dHAgcmVzcG9uc2UgZnJvbSBNZXRyaWNzIHRvIG9uZSB1c2FibGUgaW4gY2hhcnRzXG4gICAgICAgICAgICAgKiBAcGFyYW0gcmVzcG9uc2VcbiAgICAgICAgICAgICAqIEByZXR1cm5zIHRyYW5zZm9ybWVkIHJlc3BvbnNlIHRvIElDaGFydERhdGFQb2ludFtdLCByZWFkeSB0byBiZSBjaGFydGVkXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOklDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6SUNoYXJ0RGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICBsZXQgdGltZXN0YW1wOlRpbWVJbk1pbGxpcyA9IHBvaW50LnRpbWVzdGFtcCB8fCAocG9pbnQuc3RhcnQgKyAocG9pbnQuZW5kIC0gcG9pbnQuc3RhcnQpIC8gMik7XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgZGF0ZTogbmV3IERhdGUodGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBhdmc6IChwb2ludC5lbXB0eSkgPyB1bmRlZmluZWQgOiBwb2ludC5hdmcsXG4gICAgICAgICAgICAgICAgICAgIG1pbjogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWluKSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1pbixcbiAgICAgICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgICAgICBlbXB0eTogcG9pbnQuZW1wdHlcbiAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBmdW5jdGlvbiBidWlsZEhvdmVyKGQ6SUNoYXJ0RGF0YVBvaW50LCBpOm51bWJlcikge1xuICAgICAgICAgICAgICBsZXQgaG92ZXIsXG4gICAgICAgICAgICAgICAgcHJldlRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBjdXJyZW50VGltZXN0YW1wID0gZC50aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgYmFyRHVyYXRpb24sXG4gICAgICAgICAgICAgICAgZm9ybWF0dGVkRGF0ZVRpbWUgPSBtb21lbnQoZC50aW1lc3RhbXApLmZvcm1hdChIT1ZFUl9EQVRFX1RJTUVfRk9STUFUKTtcblxuICAgICAgICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgICBwcmV2VGltZXN0YW1wID0gY2hhcnREYXRhW2kgLSAxXS50aW1lc3RhbXA7XG4gICAgICAgICAgICAgICAgYmFyRHVyYXRpb24gPSBtb21lbnQoY3VycmVudFRpbWVzdGFtcCkuZnJvbShtb21lbnQocHJldlRpbWVzdGFtcCksIHRydWUpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKGlzRW1wdHlEYXRhUG9pbnQoZCkpIHtcbiAgICAgICAgICAgICAgICAvLyBub2RhdGFcbiAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICA8c21hbGwgY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtub0RhdGFMYWJlbH08L3NtYWxsPlxuICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7ZHVyYXRpb25MYWJlbH08L3NwYW4+PHNwYW4+OiA8L3NwYW4+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+PC9zbWFsbD4gPC9kaXY+XG4gICAgICAgICAgICAgICAgPGhyLz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzUmF3TWV0cmljKGQpKSB7XG4gICAgICAgICAgICAgICAgICAvLyByYXcgc2luZ2xlIHZhbHVlIGZyb20gcmF3IHRhYmxlXG4gICAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2JhckR1cmF0aW9ufTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGhyLz5cbiAgICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7c2luZ2xlVmFsdWVMYWJlbH08L3NwYW4+PHNwYW4+OiA8L3NwYW4+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLnZhbHVlLCAyKX08L3NwYW4+PC9zbWFsbD4gPC9kaXY+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj4gYDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgLy8gYWdncmVnYXRlIHdpdGggbWluL2F2Zy9tYXhcbiAgICAgICAgICAgICAgICAgIGhvdmVyID0gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaW5mby1pdGVtXCI+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHt0aW1lc3RhbXBMYWJlbH06PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7Zm9ybWF0dGVkRGF0ZVRpbWV9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImluZm8taXRlbSBiZWZvcmUtc2VwYXJhdG9yXCI+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaW5mby1pdGVtIHNlcGFyYXRvclwiPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7bWF4TGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QzLnJvdW5kKGQubWF4LCAyKX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaW5mby1pdGVtXCI+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHthdmdMYWJlbH06PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZDMucm91bmQoZC5hdmcsIDIpfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJpbmZvLWl0ZW1cIj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21pbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1pbiwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PiBgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gaG92ZXI7XG5cbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVNdWx0aUxpbmVDaGFydChtdWx0aURhdGFQb2ludHM6SU11bHRpRGF0YVBvaW50W10pIHtcbiAgICAgICAgICAgICAgbGV0IGNvbG9yU2NhbGUgPSBkMy5zY2FsZS5jYXRlZ29yeTEwKCksXG4gICAgICAgICAgICAgICAgZyA9IDA7XG5cbiAgICAgICAgICAgICAgaWYgKG11bHRpRGF0YVBvaW50cykge1xuICAgICAgICAgICAgICAgIC8vIGJlZm9yZSB1cGRhdGluZywgbGV0J3MgcmVtb3ZlIHRob3NlIG1pc3NpbmcgZnJvbSBkYXRhcG9pbnRzIChpZiBhbnkpXG4gICAgICAgICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncGF0aFtpZF49XFwnbXVsdGlMaW5lXFwnXScpWzBdLmZvckVhY2goKGV4aXN0aW5nUGF0aDphbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgIGxldCBzdGlsbEV4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTphbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2ggPSBzaW5nbGVDaGFydERhdGEua2V5SGFzaCB8fCAoJ211bHRpTGluZScgKyBoYXNoU3RyaW5nKHNpbmdsZUNoYXJ0RGF0YS5rZXkpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nUGF0aC5nZXRBdHRyaWJ1dGUoJ2lkJykgPT09IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgc3RpbGxFeGlzdHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgIGlmICghc3RpbGxFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQYXRoLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTphbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmIChzaW5nbGVDaGFydERhdGEgJiYgc2luZ2xlQ2hhcnREYXRhLnZhbHVlcykge1xuICAgICAgICAgICAgICAgICAgICBzaW5nbGVDaGFydERhdGEua2V5SGFzaCA9IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoIHx8ICgnbXVsdGlMaW5lJyArIGhhc2hTdHJpbmcoc2luZ2xlQ2hhcnREYXRhLmtleSkpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgcGF0aE11bHRpTGluZSA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGgjJyArIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKS5kYXRhKFtzaW5nbGVDaGFydERhdGEudmFsdWVzXSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgICAgICAgICAgICBwYXRoTXVsdGlMaW5lLmF0dHIoJ2lkJywgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2gpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ211bHRpTGluZScpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnbm9uZScpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBzaW5nbGVDaGFydERhdGEuY29sb3IgfHwgY29sb3JTY2FsZShnKyspO1xuICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlTGluZSgnbGluZWFyJykpO1xuICAgICAgICAgICAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICAgICAgICAgICAgcGF0aE11bHRpTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2lkJywgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2gpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ211bHRpTGluZScpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnbm9uZScpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzaW5nbGVDaGFydERhdGEuY29sb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNpbmdsZUNoYXJ0RGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjb2xvclNjYWxlKGcrKyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVMaW5lKCdsaW5lYXInKSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgICAgICAgICAgICBwYXRoTXVsdGlMaW5lLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkbG9nLndhcm4oJ05vIG11bHRpLWRhdGEgc2V0IGZvciBtdWx0aWxpbmUgY2hhcnQnKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgZnVuY3Rpb24gY3JlYXRlWUF4aXNHcmlkTGluZXMoKSB7XG4gICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgeSBheGlzIGdyaWQgbGluZXNcbiAgICAgICAgICAgICAgaWYgKHlTY2FsZSkge1xuICAgICAgICAgICAgICAgIGxldCB5QXhpcyA9IHN2Zy5zZWxlY3RBbGwoJ2cuZ3JpZC55X2dyaWQnKTtcbiAgICAgICAgICAgICAgICBpZiAoIXlBeGlzWzBdLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgeUF4aXMgPSBzdmcuYXBwZW5kKCdnJykuY2xhc3NlZCgnZ3JpZCB5X2dyaWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgeUF4aXNcbiAgICAgICAgICAgICAgICAgIC5jYWxsKGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpXG4gICAgICAgICAgICAgICAgICAgIC50aWNrcygxMClcbiAgICAgICAgICAgICAgICAgICAgLnRpY2tTaXplKC13aWR0aCwgMClcbiAgICAgICAgICAgICAgICAgICAgLnRpY2tGb3JtYXQoJycpXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgICAgICBmdW5jdGlvbiBheGlzVHJhbnNpdGlvbihzZWxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAgIC5kZWxheSgyNTApXG4gICAgICAgICAgICAgICAgICAuZHVyYXRpb24oNzUwKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoXCJvcGFjaXR5XCIsIDEuMCk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAoeUF4aXMpIHtcblxuICAgICAgICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIHgtYXhpc1xuICAgICAgICAgICAgICAgIGxldCB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneCBheGlzJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKDAsJyArIGhlaWdodCArICcpJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKFwib3BhY2l0eVwiLCAwLjMpXG4gICAgICAgICAgICAgICAgICAuY2FsbCh4QXhpcylcbiAgICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcblxuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB5LWF4aXNcbiAgICAgICAgICAgICAgICBsZXQgeUF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAgICAgICAuYXR0cihcIm9wYWNpdHlcIiwgMC4zKVxuICAgICAgICAgICAgICAgICAgLmNhbGwoeUF4aXMpXG4gICAgICAgICAgICAgICAgICAuY2FsbChheGlzVHJhbnNpdGlvbik7XG5cbiAgICAgICAgICAgICAgICBsZXQgeUF4aXNMYWJlbCA9IHN2Zy5zZWxlY3RBbGwoJy55QXhpc1VuaXRzTGFiZWwnKTtcbiAgICAgICAgICAgICAgICBpZiAoeUF4aXNMYWJlbC5lbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgICB5QXhpc0xhYmVsID0gc3ZnLmFwcGVuZCgndGV4dCcpLmF0dHIoJ2NsYXNzJywgJ3lBeGlzVW5pdHNMYWJlbCcpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAncm90YXRlKC05MCksdHJhbnNsYXRlKC0xMCwtNTApJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ3gnLCAtQ0hBUlRfSEVJR0hUIC8gMilcbiAgICAgICAgICAgICAgICAgICAgLnN0eWxlKCd0ZXh0LWFuY2hvcicsICdzdGFydCcpXG4gICAgICAgICAgICAgICAgICAgIC50ZXh0KGF0dHJzLnlBeGlzVW5pdHMgPT09ICdOT05FJyA/ICcnIDogYXR0cnMueUF4aXNVbml0cylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoXCJvcGFjaXR5XCIsIDAuMylcbiAgICAgICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUNlbnRlcmVkTGluZShuZXdJbnRlcnBvbGF0aW9uKSB7XG4gICAgICAgICAgICAgIGxldCBpbnRlcnBvbGF0ZSA9IG5ld0ludGVycG9sYXRpb24gfHwgJ21vbm90b25lJyxcbiAgICAgICAgICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRlKVxuICAgICAgICAgICAgICAgICAgLmRlZmluZWQoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgIC54KChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgIC55KChkKT0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgIHJldHVybiBsaW5lO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVMaW5lKG5ld0ludGVycG9sYXRpb24pIHtcbiAgICAgICAgICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGUpXG4gICAgICAgICAgICAgICAgICAuZGVmaW5lZCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgLnkoKGQpPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgZnVuY3Rpb24gY3JlYXRlQXZnTGluZXMoKSB7XG4gICAgICAgICAgICAgIGlmIChjaGFydFR5cGUgPT09ICdiYXInIHx8IGNoYXJ0VHlwZSA9PT0gJ3NjYXR0ZXJsaW5lJykge1xuICAgICAgICAgICAgICAgIGxldCBwYXRoQXZnTGluZSA9IHN2Zy5zZWxlY3RBbGwoJy5iYXJBdmdMaW5lJykuZGF0YShbY2hhcnREYXRhXSk7XG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgICAgcGF0aEF2Z0xpbmUuYXR0cignY2xhc3MnLCAnYmFyQXZnTGluZScpXG4gICAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUNlbnRlcmVkTGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgICAgICAgcGF0aEF2Z0xpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JhckF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVDZW50ZXJlZExpbmUoJ21vbm90b25lJykpO1xuICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuc2VsZWN0QWxsKCdnLmJydXNoJyk7XG4gICAgICAgICAgICAgIGlmIChicnVzaEdyb3VwLmVtcHR5KCkpIHtcbiAgICAgICAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2JydXNoJyk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgICAgIC5vbignYnJ1c2hzdGFydCcsIGJydXNoU3RhcnQpXG4gICAgICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGJydXNoRW5kKTtcblxuICAgICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCcucmVzaXplJykuYXBwZW5kKCdwYXRoJyk7XG5cbiAgICAgICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBoZWlnaHQpO1xuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsIHRydWUpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gYnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICAgICAgbGV0IGV4dGVudCA9IGJydXNoLmV4dGVudCgpLFxuICAgICAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMF0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICAgICAgZHJhZ1NlbGVjdGlvbkRlbHRhID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcblxuICAgICAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgICAgIC8vIGlnbm9yZSByYW5nZSBzZWxlY3Rpb25zIGxlc3MgdGhhbiAxIG1pbnV0ZVxuICAgICAgICAgICAgICAgIGlmIChkcmFnU2VsZWN0aW9uRGVsdGEgPj0gNjAwMDApIHtcbiAgICAgICAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IFtdO1xuICAgICAgICAgICAgICAgICAgc2hvd0ZvcmVjYXN0RGF0YShmb3JlY2FzdERhdGFQb2ludHMpO1xuICAgICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEV2ZW50TmFtZXMuQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQudG9TdHJpbmcoKSwgZXh0ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gY2xlYXIgdGhlIGJydXNoIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgIGJydXNoR3JvdXAuY2FsbChicnVzaC5jbGVhcigpKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVByZXZpb3VzUmFuZ2VPdmVybGF5KHByZXZSYW5nZURhdGEpIHtcbiAgICAgICAgICAgICAgaWYgKHByZXZSYW5nZURhdGEpIHtcbiAgICAgICAgICAgICAgICBzdmcuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgICAgICAgIC5kYXR1bShwcmV2UmFuZ2VEYXRhKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ByZXZSYW5nZUF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgICAgLnN0eWxlKCdzdHJva2UtZGFzaGFycmF5JywgKCc5LDMnKSlcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlQ2VudGVyZWRMaW5lKCdsaW5lYXInKSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBhbm5vdGF0ZUNoYXJ0KGFubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgIGlmIChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJy5hbm5vdGF0aW9uRG90JylcbiAgICAgICAgICAgICAgICAgIC5kYXRhKGFubm90YXRpb25EYXRhKVxuICAgICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2Fubm90YXRpb25Eb3QnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3InLCA1KVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ2N5JywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVpZ2h0IC0geVNjYWxlKHZpc3VhbGx5QWRqdXN0ZWRNYXgpO1xuICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgIC5zdHlsZSgnZmlsbCcsIChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkLnNldmVyaXR5ID09PSAnMScpIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZC5zZXZlcml0eSA9PT0gJzInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICd5ZWxsb3cnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAnd2hpdGUnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUZvcmVjYXN0TGluZShuZXdJbnRlcnBvbGF0aW9uKSB7XG4gICAgICAgICAgICAgIGxldCBpbnRlcnBvbGF0ZSA9IG5ld0ludGVycG9sYXRpb24gfHwgJ21vbm90b25lJyxcbiAgICAgICAgICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRlKVxuICAgICAgICAgICAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgLnkoKGQpPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgZnVuY3Rpb24gc2hvd0ZvcmVjYXN0RGF0YShmb3JlY2FzdERhdGE6SVNpbXBsZU1ldHJpY1tdKSB7XG4gICAgICAgICAgICAgIGxldCBmb3JlY2FzdFBhdGhMaW5lID0gc3ZnLnNlbGVjdEFsbCgnLmZvcmVjYXN0TGluZScpLmRhdGEoW2ZvcmVjYXN0RGF0YV0pO1xuICAgICAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICAgICAgZm9yZWNhc3RQYXRoTGluZS5hdHRyKCdjbGFzcycsICdmb3JlY2FzdExpbmUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlRm9yZWNhc3RMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgICAgIGZvcmVjYXN0UGF0aExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdmb3JlY2FzdExpbmUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlRm9yZWNhc3RMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgICAgIGZvcmVjYXN0UGF0aExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSkgPT4ge1xuICAgICAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpO1xuICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzY29wZS4kd2F0Y2goJ211bHRpRGF0YScsIChuZXdNdWx0aURhdGEpID0+IHtcbiAgICAgICAgICAgICAgaWYgKG5ld011bHRpRGF0YSkge1xuICAgICAgICAgICAgICAgIG11bHRpRGF0YVBvaW50cyA9IGFuZ3VsYXIuZnJvbUpzb24obmV3TXVsdGlEYXRhKTtcbiAgICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCB0cnVlKTtcblxuXG4gICAgICAgICAgICBzY29wZS4kd2F0Y2goJ3ByZXZpb3VzUmFuZ2VEYXRhJywgKG5ld1ByZXZpb3VzUmFuZ2VWYWx1ZXMpID0+IHtcbiAgICAgICAgICAgICAgaWYgKG5ld1ByZXZpb3VzUmFuZ2VWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgICAvLyRsb2cuZGVidWcoJ1ByZXZpb3VzIFJhbmdlIGRhdGEgY2hhbmdlZCcpO1xuICAgICAgICAgICAgICAgIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhID0gYW5ndWxhci5mcm9tSnNvbihuZXdQcmV2aW91c1JhbmdlVmFsdWVzKTtcbiAgICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCdhbm5vdGF0aW9uRGF0YScsIChuZXdBbm5vdGF0aW9uRGF0YSkgPT4ge1xuICAgICAgICAgICAgICBpZiAobmV3QW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24obmV3QW5ub3RhdGlvbkRhdGEpO1xuICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgICBzY29wZS4kd2F0Y2goJ2ZvcmVjYXN0RGF0YScsIChuZXdGb3JlY2FzdERhdGEpID0+IHtcbiAgICAgICAgICAgICAgaWYgKG5ld0ZvcmVjYXN0RGF0YSkge1xuICAgICAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IGFuZ3VsYXIuZnJvbUpzb24obmV3Rm9yZWNhc3REYXRhKTtcbiAgICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydhbGVydFZhbHVlJywgJ2NoYXJ0VHlwZScsICdoaWRlSGlnaExvd1ZhbHVlcycsICd1c2VaZXJvTWluVmFsdWUnLCAnc2hvd0F2Z0xpbmUnXSxcbiAgICAgICAgICAgICAgKGNoYXJ0QXR0cnMpID0+IHtcbiAgICAgICAgICAgICAgICBhbGVydFZhbHVlID0gY2hhcnRBdHRyc1swXSB8fCBhbGVydFZhbHVlO1xuICAgICAgICAgICAgICAgIGNoYXJ0VHlwZSA9IGNoYXJ0QXR0cnNbMV0gfHwgY2hhcnRUeXBlO1xuICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzID0gKHR5cGVvZiBjaGFydEF0dHJzWzJdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzJdIDogaGlkZUhpZ2hMb3dWYWx1ZXM7XG4gICAgICAgICAgICAgICAgdXNlWmVyb01pblZhbHVlID0gKHR5cGVvZiBjaGFydEF0dHJzWzNdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzNdIDogdXNlWmVyb01pblZhbHVlO1xuICAgICAgICAgICAgICAgIHNob3dBdmdMaW5lID0gKHR5cGVvZiBjaGFydEF0dHJzWzRdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzRdIDogc2hvd0F2Z0xpbmU7XG4gICAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEsIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhKTtcbiAgICAgICAgICAgICAgfSk7XG5cblxuICAgICAgICAgICAgZnVuY3Rpb24gbG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdygpIHtcbiAgICAgICAgICAgICAgZW5kVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSBtb21lbnQoKS5zdWJ0cmFjdCh0aW1lUmFuZ2VJblNlY29uZHMsICdzZWNvbmRzJykudmFsdWVPZigpO1xuICAgICAgICAgICAgICBsb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UoZGF0YVVybCwgbWV0cmljSWQsIHN0YXJ0VGltZXN0YW1wLCBlbmRUaW1lc3RhbXAsIDYwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vIHN0YW5kYWxvbmUgY2hhcnRzIGF0dHJpYnV0ZXNcbiAgICAgICAgICAgIHNjb3BlLiR3YXRjaEdyb3VwKFsnbWV0cmljVXJsJywgJ21ldHJpY0lkJywgJ21ldHJpY1R5cGUnLCAnbWV0cmljVGVuYW50SWQnLCAndGltZVJhbmdlSW5TZWNvbmRzJ10sXG4gICAgICAgICAgICAgIChzdGFuZEFsb25lUGFyYW1zKSA9PiB7XG4gICAgICAgICAgICAgICAgZGF0YVVybCA9IHN0YW5kQWxvbmVQYXJhbXNbMF0gfHwgZGF0YVVybDtcbiAgICAgICAgICAgICAgICBtZXRyaWNJZCA9IHN0YW5kQWxvbmVQYXJhbXNbMV0gfHwgbWV0cmljSWQ7XG4gICAgICAgICAgICAgICAgbWV0cmljVHlwZSA9IHN0YW5kQWxvbmVQYXJhbXNbMl0gfHwgbWV0cmljSWQ7XG4gICAgICAgICAgICAgICAgbWV0cmljVGVuYW50SWQgPSBzdGFuZEFsb25lUGFyYW1zWzNdIHx8IG1ldHJpY1RlbmFudElkO1xuICAgICAgICAgICAgICAgIHRpbWVSYW5nZUluU2Vjb25kcyA9IHN0YW5kQWxvbmVQYXJhbXNbNF0gfHwgdGltZVJhbmdlSW5TZWNvbmRzO1xuICAgICAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc1RpbWVSYW5nZUZyb21Ob3coKTtcbiAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHNjb3BlLiR3YXRjaCgncmVmcmVzaEludGVydmFsSW5TZWNvbmRzJywgKG5ld1JlZnJlc2hJbnRlcnZhbCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobmV3UmVmcmVzaEludGVydmFsKSB7XG4gICAgICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzID0gK25ld1JlZnJlc2hJbnRlcnZhbDtcbiAgICAgICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHN0YXJ0SW50ZXJ2YWxQcm9taXNlKTtcbiAgICAgICAgICAgICAgICBzdGFydEludGVydmFsUHJvbWlzZSA9ICRpbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICBsb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93KCk7XG4gICAgICAgICAgICAgICAgfSwgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzICogMTAwMCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgKCkgPT4ge1xuICAgICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHN0YXJ0SW50ZXJ2YWxQcm9taXNlKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzY29wZS4kb24oJ0RhdGVSYW5nZURyYWdDaGFuZ2VkJywgKGV2ZW50LCBleHRlbnQpID0+IHtcbiAgICAgICAgICAgICAgc2NvcGUuJGVtaXQoJ0dyYXBoVGltZVJhbmdlQ2hhbmdlZEV2ZW50JywgZXh0ZW50KTtcbiAgICAgICAgICAgIH0pO1xuXG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZUNoYXJ0VHlwZShjaGFydFR5cGU6c3RyaW5nKSB7XG5cbiAgICAgICAgICAgICAgc3dpdGNoIChjaGFydFR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdyaHFiYXInIDpcbiAgICAgICAgICAgICAgICAgIGNyZWF0ZUhpc3RvZ3JhbUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICB0cnVlLFxuICAgICAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdoaXN0b2dyYW0nIDpcbiAgICAgICAgICAgICAgICAgIGNyZWF0ZUhpc3RvZ3JhbUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbGluZScgOlxuICAgICAgICAgICAgICAgICAgY3JlYXRlTGluZUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2hhd2t1bGFybWV0cmljJyA6XG4gICAgICAgICAgICAgICAgICAkbG9nLmluZm8oJ0RFUFJFQ0FUSU9OIFdBUk5JTkc6IFRoZSBjaGFydCB0eXBlIGhhd2t1bGFybWV0cmljIGhhcyBiZWVuIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUnICtcbiAgICAgICAgICAgICAgICAgICAgJyByZW1vdmVkIGluIGEgZnV0dXJlJyArXG4gICAgICAgICAgICAgICAgICAgICcgcmVsZWFzZS4gUGxlYXNlIHVzZSB0aGUgbGluZSBjaGFydCB0eXBlIGluIGl0cyBwbGFjZScpO1xuICAgICAgICAgICAgICAgICAgY3JlYXRlTGluZUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ211bHRpbGluZScgOlxuICAgICAgICAgICAgICAgICAgY3JlYXRlTXVsdGlMaW5lQ2hhcnQobXVsdGlEYXRhUG9pbnRzKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2FyZWEnIDpcbiAgICAgICAgICAgICAgICAgIGNyZWF0ZUFyZWFDaGFydChzdmcsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICBjaGFydERhdGEsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbixcbiAgICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc2NhdHRlcicgOlxuICAgICAgICAgICAgICAgICAgY3JlYXRlU2NhdHRlckNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uLFxuICAgICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdzY2F0dGVybGluZScgOlxuICAgICAgICAgICAgICAgICAgY3JlYXRlU2NhdHRlckxpbmVDaGFydChzdmcsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICBjaGFydERhdGEsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbixcbiAgICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICRsb2cud2FybignY2hhcnQtdHlwZSBpcyBub3QgdmFsaWQuIE11c3QgYmUgaW4nICtcbiAgICAgICAgICAgICAgICAgICAgJyBbcmhxYmFyLGxpbmUsYXJlYSxtdWx0aWxpbmUsc2NhdHRlcixzY2F0dGVybGluZSxoaXN0b2dyYW1dIGNoYXJ0IHR5cGU6ICcgKyBjaGFydFR5cGUpO1xuXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50cywgcHJldmlvdXNSYW5nZURhdGFQb2ludHMpID0+IHtcbiAgICAgICAgICAgICAgLy8gaWYgd2UgZG9uJ3QgaGF2ZSBkYXRhLCBkb24ndCBib3RoZXIuLlxuICAgICAgICAgICAgICBpZiAoIWRhdGFQb2ludHMgJiYgIW11bHRpRGF0YVBvaW50cykge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGRlYnVnICYmIGNvbnNvbGUuZ3JvdXAoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgICBkZWJ1ZyAmJiBjb25zb2xlLnRpbWUoJ2NoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAgIC8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgICBpZiAoIWhhc0luaXQpIHtcbiAgICAgICAgICAgICAgICBpbml0aWFsaXphdGlvbigpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgICAgZGV0ZXJtaW5lU2NhbGUoZGF0YVBvaW50cyk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAobXVsdGlEYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgICAgZGV0ZXJtaW5lTXVsdGlTY2FsZShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUgJiYgKGFsZXJ0VmFsdWUgPiB2aXN1YWxseUFkanVzdGVkTWluICYmIGFsZXJ0VmFsdWUgPCB2aXN1YWxseUFkanVzdGVkTWF4KSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFsZXJ0Qm91bmRzOkFsZXJ0Qm91bmRbXSA9IGV4dHJhY3RBbGVydFJhbmdlcyhjaGFydERhdGEsIGFsZXJ0VmFsdWUpO1xuICAgICAgICAgICAgICAgIGNyZWF0ZUFsZXJ0Qm91bmRzQXJlYShzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCB2aXN1YWxseUFkanVzdGVkTWF4LCBhbGVydEJvdW5kcyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuXG4gICAgICAgICAgICAgIGNyZWF0ZVlBeGlzR3JpZExpbmVzKCk7XG4gICAgICAgICAgICAgIGRldGVybWluZUNoYXJ0VHlwZShjaGFydFR5cGUpO1xuICAgICAgICAgICAgICBpZiAoc2hvd0RhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgICBjcmVhdGVEYXRhUG9pbnRzKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIHRpcCwgY2hhcnREYXRhKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjcmVhdGVQcmV2aW91c1JhbmdlT3ZlcmxheShwcmV2aW91c1JhbmdlRGF0YVBvaW50cyk7XG4gICAgICAgICAgICAgIGNyZWF0ZVhhbmRZQXhlcygpO1xuICAgICAgICAgICAgICBpZiAoc2hvd0F2Z0xpbmUpIHtcbiAgICAgICAgICAgICAgICBjcmVhdGVBdmdMaW5lcygpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUgJiYgKGFsZXJ0VmFsdWUgPiB2aXN1YWxseUFkanVzdGVkTWluICYmIGFsZXJ0VmFsdWUgPCB2aXN1YWxseUFkanVzdGVkTWF4KSkge1xuICAgICAgICAgICAgICAgIC8vLyBOT1RFOiB0aGlzIGFsZXJ0IGxpbmUgaGFzIGhpZ2hlciBwcmVjZWRlbmNlIGZyb20gYWxlcnQgYXJlYSBhYm92ZVxuICAgICAgICAgICAgICAgIGNyZWF0ZUFsZXJ0TGluZShzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCBjaGFydERhdGEsIGFsZXJ0VmFsdWUsICdhbGVydExpbmUnKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICAgIGFubm90YXRlQ2hhcnQoYW5ub3RhdGlvbkRhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChmb3JlY2FzdERhdGFQb2ludHMgJiYgZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YVBvaW50cyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgZGVidWcgJiYgY29uc29sZS50aW1lRW5kKCdjaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgICBkZWJ1ZyAmJiBjb25zb2xlLmdyb3VwRW5kKCdSZW5kZXIgQ2hhcnQnKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGxpbms6IGxpbmssXG4gICAgICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICAgICAgcmVwbGFjZTogdHJ1ZSxcbiAgICAgICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICAgIGRhdGE6ICc9JyxcbiAgICAgICAgICAgICAgbXVsdGlEYXRhOiAnPScsXG4gICAgICAgICAgICAgIGZvcmVjYXN0RGF0YTogJz0nLFxuICAgICAgICAgICAgICBtZXRyaWNVcmw6ICdAJyxcbiAgICAgICAgICAgICAgbWV0cmljSWQ6ICdAJyxcbiAgICAgICAgICAgICAgbWV0cmljVHlwZTogJ0AnLFxuICAgICAgICAgICAgICBtZXRyaWNUZW5hbnRJZDogJ0AnLFxuICAgICAgICAgICAgICBzdGFydFRpbWVzdGFtcDogJ0AnLFxuICAgICAgICAgICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzOiAnQCcsXG4gICAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kczogJ0AnLFxuICAgICAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YTogJ0AnLFxuICAgICAgICAgICAgICBhbm5vdGF0aW9uRGF0YTogJ0AnLFxuICAgICAgICAgICAgICBzaG93RGF0YVBvaW50czogJz0nLFxuICAgICAgICAgICAgICBhbGVydFZhbHVlOiAnQCcsXG4gICAgICAgICAgICAgIGludGVycG9sYXRpb246ICdAJyxcbiAgICAgICAgICAgICAgY2hhcnRUeXBlOiAnQCcsXG4gICAgICAgICAgICAgIHlBeGlzVW5pdHM6ICdAJyxcbiAgICAgICAgICAgICAgdXNlWmVyb01pblZhbHVlOiAnPScsXG4gICAgICAgICAgICAgIGNoYXJ0SG92ZXJEYXRlRm9ybWF0OiAnQCcsXG4gICAgICAgICAgICAgIGNoYXJ0SG92ZXJUaW1lRm9ybWF0OiAnQCcsXG4gICAgICAgICAgICAgIHNpbmdsZVZhbHVlTGFiZWw6ICdAJyxcbiAgICAgICAgICAgICAgbm9EYXRhTGFiZWw6ICdAJyxcbiAgICAgICAgICAgICAgZHVyYXRpb25MYWJlbDogJ0AnLFxuICAgICAgICAgICAgICBtaW5MYWJlbDogJ0AnLFxuICAgICAgICAgICAgICBtYXhMYWJlbDogJ0AnLFxuICAgICAgICAgICAgICBhdmdMYWJlbDogJ0AnLFxuICAgICAgICAgICAgICB0aW1lc3RhbXBMYWJlbDogJ0AnLFxuICAgICAgICAgICAgICBzaG93QXZnTGluZTogJz0nLFxuICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlczogJz0nXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICBdXG4gICAgKVxuICA7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBjb25zdCBZX0FYSVNfSEVJR0hUID0gMTU7XG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cblxuICBleHBvcnQgY2xhc3MgU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX1dJRFRIID0gMzAwO1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9IRUlHSFQgPSA4MDtcblxuICAgIHB1YmxpYyByZXN0cmljdCA9ICdFJztcbiAgICBwdWJsaWMgcmVwbGFjZSA9IHRydWU7XG5cbiAgICBwdWJsaWMgc2NvcGUgPSB7XG4gICAgICBkYXRhOiAnPScsXG4gICAgICBzaG93WUF4aXNWYWx1ZXM6ICc9JyxcbiAgICAgIHNob3dYQXhpc1ZhbHVlczogJz0nLFxuICAgICAgYWxlcnRWYWx1ZTogJ0AnLFxuICAgIH07XG5cbiAgICBwdWJsaWMgbGluazooc2NvcGU6YW55LCBlbGVtZW50Om5nLklBdWdtZW50ZWRKUXVlcnksIGF0dHJzOmFueSkgPT4gdm9pZDtcblxuICAgIHB1YmxpYyBkYXRhUG9pbnRzOklDaGFydERhdGFQb2ludFtdO1xuXG4gICAgY29uc3RydWN0b3IoJHJvb3RTY29wZTpuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgY29uc3QgbWFyZ2luID0ge3RvcDogMTAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDQ1fTtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IGNoYXJ0SGVpZ2h0ID0gU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVCxcbiAgICAgICAgICB3aWR0aCA9IFNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLl9DSEFSVF9XSURUSCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0LFxuICAgICAgICAgIGhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AsXG4gICAgICAgICAgc2hvd1hBeGlzVmFsdWVzOmJvb2xlYW4sXG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzOmJvb2xlYW4sXG4gICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgIHlBeGlzR3JvdXAsXG4gICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgIHhBeGlzR3JvdXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnLFxuICAgICAgICAgIGFsZXJ0VmFsdWU7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhdHRycy5hbGVydFZhbHVlICE9ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgYWxlcnRWYWx1ZSA9ICthdHRycy5hbGVydFZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhdHRycy5zaG93WEF4aXNWYWx1ZXMgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBzaG93WEF4aXNWYWx1ZXMgPSBhdHRycy5zaG93WEF4aXNWYWx1ZXMgPT09ICd0cnVlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuc2hvd1lBeGlzVmFsdWVzICE9ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzID0gYXR0cnMuc2hvd1lBeGlzVmFsdWVzID09PSAndHJ1ZSc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGZ1bmN0aW9uIHNldHVwKCk6dm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG4gICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAuYXR0cigndmlld0JveCcsICcwIDAgJyArICh3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KSArICcgJyArIChoZWlnaHQgKyBtYXJnaW4udG9wICtcbiAgICAgICAgICAgICAgbWFyZ2luLmJvdHRvbSArIFlfQVhJU19IRUlHSFQgKSlcbiAgICAgICAgICAgIC5hdHRyKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ3hNaW5ZTWluIG1lZXQnKTtcblxuICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyBtYXJnaW4udG9wICsgJyknKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NwYXJrbGluZScpO1xuXG4gICAgICAgIH1cblxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVNwYXJrbGluZUNoYXJ0KGRhdGFQb2ludHM6SUNoYXJ0RGF0YVBvaW50W10pIHtcblxuICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aCAtIDEwXSlcbiAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgIC5kb21haW4oW2RhdGFQb2ludHNbMF0udGltZXN0YW1wLCBkYXRhUG9pbnRzW2RhdGFQb2ludHMubGVuZ3RoIC0gMV0udGltZXN0YW1wXSk7XG5cblxuICAgICAgICAgIGxldCBudW1iZXJPZlhUaWNrcyA9IHNob3dYQXhpc1ZhbHVlcyA/IDIgOiAwO1xuXG4gICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgLnRpY2tzKG51bWJlck9mWFRpY2tzKVxuICAgICAgICAgICAgLnRpY2tTaXplKDQsIDApXG4gICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAub3JpZW50KCdib3R0b20nKTtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgbGV0IHlNaW4gPSBkMy5taW4oZGF0YVBvaW50cywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgeU1heCA9IGQzLm1heChkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gZ2l2ZSBhIHBhZCBvZiAlIHRvIG1pbi9tYXggc28gd2UgYXJlIG5vdCBhZ2FpbnN0IHgtYXhpc1xuICAgICAgICAgIHlNYXggPSB5TWF4ICsgKHlNYXggKiAwLjAzKTtcbiAgICAgICAgICB5TWluID0geU1pbiAtICh5TWluICogMC4wNSk7XG5cbiAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgLnJhbmdlUm91bmQoW1NwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLl9DSEFSVF9IRUlHSFQgLSBZX0FYSVNfSEVJR0hULCAwXSlcbiAgICAgICAgICAgIC5kb21haW4oW3lNaW4sIHlNYXhdKTtcblxuICAgICAgICAgIGxldCBudW1iZXJPZllUaWNrcyA9IHNob3dZQXhpc1ZhbHVlcyA/IDIgOiAwO1xuXG4gICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgLnRpY2tzKG51bWJlck9mWVRpY2tzKVxuICAgICAgICAgICAgLnRpY2tTaXplKDMsIDApXG4gICAgICAgICAgICAub3JpZW50KFwibGVmdFwiKTtcblxuICAgICAgICAgIGxldCBpbnRlcnBvbGF0aW9uVHlwZSA9ICdiYXNpcyc7XG4gICAgICAgICAgbGV0IGFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvblR5cGUpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDphbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOmFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTAoKGQ6YW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBTcGFya2xpbmVDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hUIC0gWV9BWElTX0hFSUdIVDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTEoKGQ6YW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyB0aGlzIGlzIHRoZSBsaW5lIHRoYXQgY2FwcyB0aGUgYXJlYVxuICAgICAgICAgIGxldCBzcGFya2xpbmVMaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRpb25UeXBlKVxuICAgICAgICAgICAgLmRlZmluZWQoKGQ6YW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAhZC5lbXB0eTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueCgoZDphbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkoKGQ6YW55KSA9PiB7XG4gICAgICAgICAgICAgIC8vIC0yIHBpeGVscyB0byBrZWVwIHRoZSAyIHBpeGVsIGxpbmUgZnJvbSBjcm9zc2luZyBvdmVyIHRoZSB4LWF4aXNcbiAgICAgICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2ZykgLSAyO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgcGF0aFNwYXJrbGluZUxpbmUgPSBzdmcuc2VsZWN0QWxsKCdwYXRoLnNwYXJrbGluZUxpbmUnKVxuICAgICAgICAgICAgLmRhdGEoW2RhdGFQb2ludHNdKTtcblxuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIHBhdGhTcGFya2xpbmVMaW5lLmF0dHIoJ2NsYXNzJywgJ3NwYXJrbGluZUxpbmUnKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBzcGFya2xpbmVMaW5lKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIHBhdGhTcGFya2xpbmVMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdzcGFya2xpbmVMaW5lJylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5hdHRyKCdkJywgc3BhcmtsaW5lTGluZSk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBwYXRoU3BhcmtsaW5lTGluZS5leGl0KCkucmVtb3ZlKCk7XG5cblxuICAgICAgICAgIGxldCBzcGFya2xpbmVBcmVhID0gc3ZnLmFwcGVuZChcImdcIilcbiAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJzcGFya2xpbmVcIik7XG5cbiAgICAgICAgICBzcGFya2xpbmVBcmVhLmFwcGVuZChcInBhdGhcIilcbiAgICAgICAgICAgIC5kYXR1bShkYXRhUG9pbnRzKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmR1cmF0aW9uKDUwMClcbiAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJzcGFya2xpbmVBcmVhXCIpXG4gICAgICAgICAgICAuYXR0cihcImRcIiwgYXJlYSk7XG5cbiAgICAgICAgICAvL2lmIChhbGVydFZhbHVlICYmIChhbGVydFZhbHVlID49IHlNaW4gJiYgYWxlcnRWYWx1ZSA8PSB5TWF4KSkge1xuICAgICAgICAgIC8vICBsZXQgYWxlcnRCb3VuZHM6IEFsZXJ0Qm91bmRbXSA9IGV4dHJhY3RBbGVydFJhbmdlcyhkYXRhUG9pbnRzLCBhbGVydFZhbHVlKTtcbiAgICAgICAgICAvLyAgY3JlYXRlQWxlcnRCb3VuZHNBcmVhKHN2Zyx0aW1lU2NhbGUsIHlTY2FsZSx5TWF4LCBhbGVydEJvdW5kcyk7XG4gICAgICAgICAgLy99XG5cbiAgICAgICAgICAvLyBwbGFjZSB0aGUgeCBhbmQgeSBheGVzIGFib3ZlIHRoZSBjaGFydFxuICAgICAgICAgIHlBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd5IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeUF4aXMpO1xuXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgwLCcgKyBoZWlnaHQgKyAnKScpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+PSB5TWluICYmIGFsZXJ0VmFsdWUgPD0geU1heCkpIHtcbiAgICAgICAgICAgIC8vLyBOT1RFOiB0aGlzIGFsZXJ0IGxpbmUgaGFzIGhpZ2hlciBwcmVjZWRlbmNlIGZyb20gYWxlcnQgYXJlYSBhYm92ZVxuICAgICAgICAgICAgY3JlYXRlQWxlcnRMaW5lKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIGRhdGFQb2ludHMsIGFsZXJ0VmFsdWUsICdzcGFya2xpbmVBbGVydExpbmUnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnU3BhcmtsaW5lIENoYXJ0IERhdGEgQ2hhbmdlZCcpO1xuICAgICAgICAgIGlmIChuZXdEYXRhKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFQb2ludHMgPSBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KGFuZ3VsYXIuZnJvbUpzb24obmV3RGF0YSkpO1xuICAgICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMuZGF0YVBvaW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdhbGVydFZhbHVlJywgKG5ld0FsZXJ0VmFsdWUpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnU3BhcmtsaW5lIEFsZXJ0VmFsdWUgQ2hhbmdlZCcpO1xuICAgICAgICAgIGlmIChuZXdBbGVydFZhbHVlKSB7XG4gICAgICAgICAgICBhbGVydFZhbHVlID0gbmV3QWxlcnRWYWx1ZTtcbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMuZGF0YVBvaW50cyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOklDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAvLyAgVGhlIHNjaGVtYSBpcyBkaWZmZXJlbnQgZm9yIGJ1Y2tldGVkIG91dHB1dFxuICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6SUNoYXJ0RGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIGxldCB0aW1lc3RhbXA6VGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAvL2RhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50czpJQ2hhcnREYXRhUG9pbnRbXSkgPT4ge1xuICAgICAgICAgIGlmIChkYXRhUG9pbnRzICYmIGRhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS5ncm91cCgnUmVuZGVyIFNwYXJrbGluZSBDaGFydCcpO1xuICAgICAgICAgICAgY29uc29sZS50aW1lKCdTcGFya2xpbmVDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgc2V0dXAoKTtcbiAgICAgICAgICAgIGNyZWF0ZVNwYXJrbGluZUNoYXJ0KGRhdGFQb2ludHMpO1xuICAgICAgICAgICAgY29uc29sZS50aW1lRW5kKCdTcGFya2xpbmVDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcHVibGljIHN0YXRpYyBGYWN0b3J5KCkge1xuICAgICAgbGV0IGRpcmVjdGl2ZSA9ICgkcm9vdFNjb3BlOm5nLklSb290U2NvcGVTZXJ2aWNlKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUoJHJvb3RTY29wZSk7XG4gICAgICB9O1xuXG4gICAgICBkaXJlY3RpdmVbJyRpbmplY3QnXSA9IFsnJHJvb3RTY29wZSddO1xuXG4gICAgICByZXR1cm4gZGlyZWN0aXZlO1xuICAgIH1cblxuICB9XG5cbiAgX21vZHVsZS5kaXJlY3RpdmUoJ2hhd2t1bGFyU3BhcmtsaW5lQ2hhcnQnLCBTcGFya2xpbmVDaGFydERpcmVjdGl2ZS5GYWN0b3J5KCkpO1xufVxuXG5cblxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuLy8gVHlwZSB2YWx1ZXMgYW5kIElEIHR5cGVzXG4gIGV4cG9ydCB0eXBlIEFsZXJ0VGhyZXNob2xkID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBUaW1lSW5NaWxsaXMgPSBudW1iZXI7XG4gIGV4cG9ydCB0eXBlIFVybFR5cGUgPSBudW1iZXI7XG4gIGV4cG9ydCB0eXBlIE1ldHJpY0lkID0gc3RyaW5nO1xuICBleHBvcnQgdHlwZSBNZXRyaWNWYWx1ZSA9IG51bWJlcjtcblxuXG4gIC8qKlxuICAgKiBNZXRyaWNzIFJlc3BvbnNlIGZyb20gSGF3a3VsYXIgTWV0cmljc1xuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJTWV0cmljc1Jlc3BvbnNlRGF0YVBvaW50IHtcbiAgICBzdGFydDogVGltZUluTWlsbGlzO1xuICAgIGVuZDogVGltZUluTWlsbGlzO1xuICAgIHZhbHVlPzogTWV0cmljVmFsdWU7IC8vLyBPbmx5IGZvciBSYXcgZGF0YSAobm8gYnVja2V0cyBvciBhZ2dyZWdhdGVzKVxuICAgIGF2Zz86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBtaW4/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgbWF4PzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIG1lZGlhbj86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBwZXJjZW50aWxlOTV0aD86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBlbXB0eTogYm9vbGVhbjtcbiAgfVxuXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZU1ldHJpYyB7XG4gICAgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU6IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgZXhwb3J0IGludGVyZmFjZSBJQmFzZUNoYXJ0RGF0YVBvaW50IHtcbiAgICB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcztcbiAgICBzdGFydD86IFRpbWVJbk1pbGxpcztcbiAgICBlbmQ/OiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnOiBNZXRyaWNWYWx1ZTsgLy8vIG1vc3Qgb2YgdGhlIHRpbWUgdGhpcyBpcyB0aGUgdXNlZnVsIHZhbHVlIGZvciBhZ2dyZWdhdGVzXG4gICAgZW1wdHk6IGJvb2xlYW47IC8vLyB3aWxsIHNob3cgdXAgaW4gdGhlIGNoYXJ0IGFzIGJsYW5rIC0gc2V0IHRoaXMgd2hlbiB5b3UgaGF2ZSBOYU5cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXByZXNlbnRhdGlvbiBvZiBkYXRhIHJlYWR5IHRvIGJlIGNvbnN1bWVkIGJ5IGNoYXJ0cy5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSUNoYXJ0RGF0YVBvaW50IGV4dGVuZHMgSUJhc2VDaGFydERhdGFQb2ludCB7XG4gICAgZGF0ZT86IERhdGU7XG4gICAgbWluOiBNZXRyaWNWYWx1ZTtcbiAgICBtYXg6IE1ldHJpY1ZhbHVlO1xuICAgIHBlcmNlbnRpbGU5NXRoOiBNZXRyaWNWYWx1ZTtcbiAgICBtZWRpYW46IE1ldHJpY1ZhbHVlO1xuICB9XG5cblxuICAvKipcbiAgICogRGF0YSBzdHJ1Y3R1cmUgZm9yIGEgTXVsdGktTWV0cmljIGNoYXJ0LiBDb21wb3NlZCBvZiBJQ2hhcnREYXRhRGF0YVBvaW50W10uXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNdWx0aURhdGFQb2ludCB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAga2V5SGFzaD86IHN0cmluZzsgLy8gZm9yIHVzaW5nIGFzIHZhbGlkIGh0bWwgaWRcbiAgICBjb2xvcj86IHN0cmluZzsgLy8vICNmZmZlZWVcbiAgICB2YWx1ZXM6IElDaGFydERhdGFQb2ludFtdO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJXaWR0aCh3aWR0aDpudW1iZXIsIGxlbmd0aDpudW1iZXIsIGJhck9mZnNldCA9IEJBUl9PRkZTRVQpIHtcbiAgICByZXR1cm4gKHdpZHRoIC8gbGVuZ3RoIC0gYmFyT2Zmc2V0KTtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZXMgdGhlIGJhciB3aWR0aCBhZGp1c3RlZCBzbyB0aGF0IHRoZSBmaXJzdCBhbmQgbGFzdCBhcmUgaGFsZi13aWR0aCBvZiB0aGUgb3RoZXJzXG4gIC8vIHNlZSBodHRwczovL2lzc3Vlcy5qYm9zcy5vcmcvYnJvd3NlL0hBV0tVTEFSLTgwOSBmb3IgaW5mbyBvbiB3aHkgdGhpcyBpcyBuZWVkZWRcbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGxlbmd0aDpudW1iZXIpIHtcbiAgICByZXR1cm4gKGkgPT09IDAgfHwgaSA9PT0gbGVuZ3RoIC0gMSkgPyBjYWxjQmFyV2lkdGgod2lkdGgsIGxlbmd0aCwgQkFSX09GRlNFVCkgLyAyIDpcbiAgICAgIGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKTtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZXMgdGhlIGJhciBYIHBvc2l0aW9uLiBXaGVuIHVzaW5nIGNhbGNCYXJXaWR0aEFkanVzdGVkLCBpdCBpcyByZXF1aXJlZCB0byBwdXNoIGJhcnNcbiAgLy8gb3RoZXIgdGhhbiB0aGUgZmlyc3QgaGFsZiBiYXIgdG8gdGhlIGxlZnQsIHRvIG1ha2UgdXAgZm9yIHRoZSBmaXJzdCBiZWluZyBqdXN0IGhhbGYgd2lkdGhcbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJYUG9zKGQsIGksIHRpbWVTY2FsZTphbnksIGxlbmd0aDpudW1iZXIpIHtcbiAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKSAtIChpID09PSAwID8gMCA6IGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKSAvIDIpO1xuICB9XG5cblxuICAvKipcbiAgICogQW4gZW1wdHkgZGF0YXBvaW50IGhhcyAnZW1wdHknIGF0dHJpYnV0ZSBzZXQgdG8gdHJ1ZS4gVXNlZCB0byBkaXN0aW5ndWlzaCBmcm9tIHJlYWwgMCB2YWx1ZXMuXG4gICAqIEBwYXJhbSBkXG4gICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgKi9cbiAgZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHlEYXRhUG9pbnQoZDpJQ2hhcnREYXRhUG9pbnQpOmJvb2xlYW4ge1xuICAgIHJldHVybiBkLmVtcHR5O1xuICB9XG5cbiAgLyoqXG4gICAqIFJhdyBtZXRyaWNzIGhhdmUgYSAndmFsdWUnIHNldCBpbnN0ZWFkIG9mIGF2Zy9taW4vbWF4IG9mIGFnZ3JlZ2F0ZXNcbiAgICogQHBhcmFtIGRcbiAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAqL1xuICBleHBvcnQgZnVuY3Rpb24gaXNSYXdNZXRyaWMoZDpJQ2hhcnREYXRhUG9pbnQpOmJvb2xlYW4ge1xuICAgIHJldHVybiB0eXBlb2YgZC5hdmcgPT09ICd1bmRlZmluZWQnO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIHhBeGlzVGltZUZvcm1hdHMoKSB7XG4gICAgcmV0dXJuIGQzLnRpbWUuZm9ybWF0Lm11bHRpKFtcbiAgICAgIFtcIi4lTFwiLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaWxsaXNlY29uZHMoKTtcbiAgICAgIH1dLFxuICAgICAgW1wiOiVTXCIsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldFNlY29uZHMoKTtcbiAgICAgIH1dLFxuICAgICAgW1wiJUg6JU1cIiwgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0TWludXRlcygpXG4gICAgICB9XSxcbiAgICAgIFtcIiVIOiVNXCIsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldEhvdXJzKCk7XG4gICAgICB9XSxcbiAgICAgIFtcIiVhICVkXCIsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldERheSgpICYmIGQuZ2V0RGF0ZSgpICE9IDE7XG4gICAgICB9XSxcbiAgICAgIFtcIiViICVkXCIsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldERhdGUoKSAhPSAxO1xuICAgICAgfV0sXG4gICAgICBbXCIlQlwiLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNb250aCgpO1xuICAgICAgfV0sXG4gICAgICBbXCIlWVwiLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfV1cbiAgICBdKTtcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdmdEZWZzKGNoYXJ0KSB7XG5cbiAgICBsZXQgZGVmcyA9IGNoYXJ0LmFwcGVuZCgnZGVmcycpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ25vRGF0YVN0cmlwZXMnKVxuICAgICAgLmF0dHIoJ3BhdHRlcm5Vbml0cycsICd1c2VyU3BhY2VPblVzZScpXG4gICAgICAuYXR0cigneCcsICcwJylcbiAgICAgIC5hdHRyKCd5JywgJzAnKVxuICAgICAgLmF0dHIoJ3dpZHRoJywgJzYnKVxuICAgICAgLmF0dHIoJ2hlaWdodCcsICczJylcbiAgICAgIC5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJylcbiAgICAgIC5hdHRyKCdzdHlsZScsICdzdHJva2U6I0NDQ0NDQzsgZmlsbDpub25lOycpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ3Vua25vd25TdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiMyRTlFQzI7IGZpbGw6bm9uZTsnKVxuICAgICAgLmFwcGVuZCgncGF0aCcpLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJyk7XG5cbiAgICBkZWZzLmFwcGVuZCgncGF0dGVybicpXG4gICAgICAuYXR0cignaWQnLCAnZG93blN0cmlwZXMnKVxuICAgICAgLmF0dHIoJ3BhdHRlcm5Vbml0cycsICd1c2VyU3BhY2VPblVzZScpXG4gICAgICAuYXR0cigneCcsICcwJylcbiAgICAgIC5hdHRyKCd5JywgJzAnKVxuICAgICAgLmF0dHIoJ3dpZHRoJywgJzYnKVxuICAgICAgLmF0dHIoJ2hlaWdodCcsICczJylcbiAgICAgIC5hdHRyKCdzdHlsZScsICdzdHJva2U6I2ZmOGE5YTsgZmlsbDpub25lOycpXG4gICAgICAuYXBwZW5kKCdwYXRoJykuYXR0cignZCcsICdNIDAgMCA2IDAnKTtcblxuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlOmFueSkge1xuICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICB9XG5cblxuICAvLyBhZGFwdGVkIGZyb20gaHR0cDovL3dlcnhsdGQuY29tL3dwLzIwMTAvMDUvMTMvamF2YXNjcmlwdC1pbXBsZW1lbnRhdGlvbi1vZi1qYXZhcy1zdHJpbmctaGFzaGNvZGUtbWV0aG9kL1xuICBleHBvcnQgZnVuY3Rpb24gaGFzaFN0cmluZyhzdHI6c3RyaW5nKTpudW1iZXIge1xuICAgIGxldCBoYXNoID0gMCwgaSwgY2hyLCBsZW47XG4gICAgaWYgKHN0ci5sZW5ndGggPT0gMCkgcmV0dXJuIGhhc2g7XG4gICAgZm9yIChpID0gMCwgbGVuID0gc3RyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBjaHIgPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgIGhhc2ggPSAoKGhhc2ggPDwgNSkgLSBoYXNoKSArIGNocjtcbiAgICAgIGhhc2ggfD0gMDsgLy8gQ29udmVydCB0byAzMmJpdCBpbnRlZ2VyXG4gICAgfVxuICAgIHJldHVybiBoYXNoO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFyZWFDaGFydChzdmc6YW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZTphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeVNjYWxlOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFydERhdGE6SUNoYXJ0RGF0YVBvaW50W10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0PzpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbj86c3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzPzpib29sZWFuKSB7XG5cbiAgICBsZXQgaGlnaEFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgIC5kZWZpbmVkKChkOmFueSkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkKTtcbiAgICAgIH0pXG4gICAgICAueSgoZDphbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAueTAoKGQ6YW55KSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KSxcblxuICAgICAgYXZnQXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRpb24pXG4gICAgICAgIC5kZWZpbmVkKChkOmFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQpO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDphbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KS55MCgoZDphbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gaGlkZUhpZ2hMb3dWYWx1ZXMgPyBoZWlnaHQgOiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KSxcblxuICAgICAgbG93QXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRpb24pXG4gICAgICAgIC5kZWZpbmVkKChkOmFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQpO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDphbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAueTAoKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBoZWlnaHQ7XG4gICAgICAgIH0pO1xuXG5cbiAgICBpZiAoIWhpZGVIaWdoTG93VmFsdWVzKSB7XG4gICAgICBsZXQgaGlnaEFyZWFQYXRoID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5oaWdoQXJlYScpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgaGlnaEFyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2hpZ2hBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBoaWdoQXJlYSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGhpZ2hBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdoaWdoQXJlYScpXG4gICAgICAgIC5hdHRyKCdkJywgaGlnaEFyZWEpO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBoaWdoQXJlYVBhdGguZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgbG93QXJlYVBhdGggPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmxvd0FyZWEnKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxvd0FyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2xvd0FyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGxvd0FyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBsb3dBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdsb3dBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBsb3dBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgbG93QXJlYVBhdGguZXhpdCgpLnJlbW92ZSgpO1xuICAgIH1cblxuICAgIGxldCBhdmdBcmVhUGF0aCA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGguYXZnQXJlYScpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBhdmdBcmVhUGF0aC5hdHRyKCdjbGFzcycsICdhdmdBcmVhJylcbiAgICAgIC5hdHRyKCdkJywgYXZnQXJlYSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgYXZnQXJlYVBhdGguZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2Z0FyZWEnKVxuICAgICAgLmF0dHIoJ2QnLCBhdmdBcmVhKTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBhdmdBcmVhUGF0aC5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIaXN0b2dyYW1DaGFydChzdmc6YW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHlTY2FsZTphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFydERhdGE6SUNoYXJ0RGF0YVBvaW50W10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ/Om51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrZWQ/OmJvb2xlYW4sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4PzpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcz86Ym9vbGVhbikge1xuXG4gICAgY29uc3QgYmFyQ2xhc3MgPSBzdGFja2VkID8gJ2xlYWRlckJhcicgOiAnaGlzdG9ncmFtJztcblxuICAgIGNvbnN0IHJlY3RIaXN0b2dyYW0gPSBzdmcuc2VsZWN0QWxsKCdyZWN0LicgKyBiYXJDbGFzcykuZGF0YShjaGFydERhdGEpO1xuXG4gICAgZnVuY3Rpb24gYnVpbGRCYXJzKHNlbGVjdGlvbjpkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5hdHRyKCdjbGFzcycsIGJhckNsYXNzKVxuICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAuYXR0cigneCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJYUG9zKGQsIGksIHRpbWVTY2FsZSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd3aWR0aCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGhlaWdodCAtIHlTY2FsZShpc0VtcHR5RGF0YVBvaW50KGQpID8geVNjYWxlKHZpc3VhbGx5QWRqdXN0ZWRNYXgpIDogZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignb3BhY2l0eScsIHN0YWNrZWQgPyAnLjYnIDogJzEnKVxuICAgICAgICAuYXR0cignZmlsbCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAndXJsKCNub0RhdGFTdHJpcGVzKScgOiAoc3RhY2tlZCA/ICcjRDNEM0Q2JyA6ICcjQzBDMEMwJyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzc3Nyc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdkYXRhLWhhd2t1bGFyLXZhbHVlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRIaWdoQmFyKHNlbGVjdGlvbjpkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5hdHRyKCdjbGFzcycsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGQubWluID09PSBkLm1heCA/ICdzaW5nbGVWYWx1ZScgOiAnaGlnaCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4JywgZnVuY3Rpb24gKGQsIGkpIHtcbiAgICAgICAgICByZXR1cm4gY2FsY0JhclhQb3MoZCwgaSwgdGltZVNjYWxlLCBjaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc05hTihkLm1heCkgPyB5U2NhbGUodmlzdWFsbHlBZGp1c3RlZE1heCkgOiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/IDAgOiAoeVNjYWxlKGQuYXZnKSAtIHlTY2FsZShkLm1heCkgfHwgMik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd3aWR0aCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuOSlcbiAgICAgICAgLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRMb3dlckJhcihzZWxlY3Rpb246ZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93JylcbiAgICAgICAgLmF0dHIoJ3gnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGUsIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzTmFOKGQuYXZnKSA/IGhlaWdodCA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6ICh5U2NhbGUoZC5taW4pIC0geVNjYWxlKGQuYXZnKSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd3aWR0aCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuOSlcbiAgICAgICAgLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZFRvcFN0ZW0oc2VsZWN0aW9uOmQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbVRvcFN0ZW0nKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkTG93U3RlbShzZWxlY3Rpb246ZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtQm90dG9tU3RlbScpXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgIH0pLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRUb3BDcm9zcyhzZWxlY3Rpb246ZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtVG9wQ3Jvc3MnKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZEJvdHRvbUNyb3NzKHNlbGVjdGlvbjpkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdoaXN0b2dyYW1Cb3R0b21Dcm9zcycpXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZUhpc3RvZ3JhbUhpZ2hMb3dWYWx1ZXMoc3ZnOmFueSwgY2hhcnREYXRhOklDaGFydERhdGFQb2ludFtdLCBzdGFja2VkPzpib29sZWFuKSB7XG4gICAgICBpZiAoc3RhY2tlZCkge1xuICAgICAgICAvLyB1cHBlciBwb3J0aW9uIHJlcHJlc2VudGluZyBhdmcgdG8gaGlnaFxuICAgICAgICBjb25zdCByZWN0SGlnaCA9IHN2Zy5zZWxlY3RBbGwoJ3JlY3QuaGlnaCwgcmVjdC5zaW5nbGVWYWx1ZScpLmRhdGEoY2hhcnREYXRhKTtcblxuXG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICByZWN0SGlnaC5jYWxsKGJ1aWxkSGlnaEJhcik7XG5cbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIHJlY3RIaWdoXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgICAgICAuY2FsbChidWlsZEhpZ2hCYXIpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICByZWN0SGlnaC5leGl0KCkucmVtb3ZlKCk7XG5cblxuICAgICAgICAvLyBsb3dlciBwb3J0aW9uIHJlcHJlc2VudGluZyBhdmcgdG8gbG93XG4gICAgICAgIGNvbnN0IHJlY3RMb3cgPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmxvdycpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgcmVjdExvdy5jYWxsKGJ1aWxkTG93ZXJCYXIpO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICByZWN0TG93XG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgICAgICAuY2FsbChidWlsZExvd2VyQmFyKTtcblxuICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgcmVjdExvdy5leGl0KCkucmVtb3ZlKCk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcblxuICAgICAgICBjb25zdCBsaW5lSGlzdG9IaWdoU3RlbSA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Ub3BTdGVtJykuZGF0YShjaGFydERhdGEpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbS5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgbGluZUhpc3RvSGlnaFN0ZW1cbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxpbmVIaXN0b0hpZ2hTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICBjb25zdCBsaW5lSGlzdG9Mb3dTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxpbmVIaXN0b0xvd1N0ZW0uY2FsbChidWlsZExvd1N0ZW0pO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAuY2FsbChidWlsZExvd1N0ZW0pO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuXG4gICAgICAgIGNvbnN0IGxpbmVIaXN0b1RvcENyb3NzID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcENyb3NzJykuZGF0YShjaGFydERhdGEpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zcy5jYWxsKGJ1aWxkVG9wQ3Jvc3MpO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zc1xuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgLmNhbGwoYnVpbGRUb3BDcm9zcyk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxpbmVIaXN0b1RvcENyb3NzLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICBjb25zdCBsaW5lSGlzdG9Cb3R0b21Dcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Cb3R0b21Dcm9zcycpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzLmNhbGwoYnVpbGRCb3R0b21Dcm9zcyk7XG5cbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAuY2FsbChidWlsZEJvdHRvbUNyb3NzKTtcblxuICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgbGluZUhpc3RvQm90dG9tQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHJlY3RIaXN0b2dyYW0uY2FsbChidWlsZEJhcnMpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcmVjdEhpc3RvZ3JhbS5lbnRlcigpXG4gICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgIC5jYWxsKGJ1aWxkQmFycyk7XG5cbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICByZWN0SGlzdG9ncmFtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgIGlmICghaGlkZUhpZ2hMb3dWYWx1ZXMpIHtcbiAgICAgIGNyZWF0ZUhpc3RvZ3JhbUhpZ2hMb3dWYWx1ZXMoc3ZnLCBjaGFydERhdGEsIHN0YWNrZWQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIC8vIHdlIHNob3VsZCBoaWRlIGhpZ2gtbG93IHZhbHVlcy4uIG9yIHJlbW92ZSBpZiBleGlzdGluZ1xuICAgICAgc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcFN0ZW0sIC5oaXN0b2dyYW1Cb3R0b21TdGVtLCAuaGlzdG9ncmFtVG9wQ3Jvc3MsIC5oaXN0b2dyYW1Cb3R0b21Dcm9zcycpLnJlbW92ZSgpO1xuICAgIH1cblxuICB9XG5cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlTGluZUNoYXJ0KHN2ZzphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB5U2NhbGU6YW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YTpJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ/Om51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uPzpzdHJpbmcpIHtcblxuICAgIGxldCBtZXRyaWNDaGFydExpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgIC5kZWZpbmVkKChkOmFueSkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLngoKGQ6YW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC55KChkOmFueSkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSk7XG5cbiAgICBsZXQgcGF0aE1ldHJpYyA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGgubWV0cmljTGluZScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHBhdGhNZXRyaWMuYXR0cignY2xhc3MnLCAnbWV0cmljTGluZScpXG4gICAgICAudHJhbnNpdGlvbigpXG4gICAgICAuYXR0cignZCcsIG1ldHJpY0NoYXJ0TGluZSk7XG5cbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBwYXRoTWV0cmljLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdjbGFzcycsICdtZXRyaWNMaW5lJylcbiAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgIC5hdHRyKCdkJywgbWV0cmljQ2hhcnRMaW5lKTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHBhdGhNZXRyaWMuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNjYXR0ZXJDaGFydChzdmc6YW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZTphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeVNjYWxlOmFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFydERhdGE6SUNoYXJ0RGF0YVBvaW50W10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0PzpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbj86c3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzPzpib29sZWFuKSB7XG5cbiAgICBpZiAoIWhpZGVIaWdoTG93VmFsdWVzKSB7XG5cbiAgICAgIGxldCBoaWdoRG90Q2lyY2xlID0gc3ZnLnNlbGVjdEFsbCgnLmhpZ2hEb3QnKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGhpZ2hEb3RDaXJjbGUuYXR0cignY2xhc3MnLCAnaGlnaERvdCcpXG4gICAgICAgIC5maWx0ZXIoKGQ6YW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjZmYxYTEzJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBoaWdoRG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlnaERvdCcpXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyNmZjFhMTMnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGhpZ2hEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgbG93RG90Q2lyY2xlID0gc3ZnLnNlbGVjdEFsbCgnLmxvd0RvdCcpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgbG93RG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2xvd0RvdCcpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGxvd0RvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xvd0RvdCcpXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGxvd0RvdENpcmNsZS5leGl0KCkucmVtb3ZlKCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgLy8gd2Ugc2hvdWxkIGhpZGUgaGlnaC1sb3cgdmFsdWVzLi4gb3IgcmVtb3ZlIGlmIGV4aXN0aW5nXG4gICAgICBzdmcuc2VsZWN0QWxsKCcuaGlnaERvdCwgLmxvd0RvdCcpLnJlbW92ZSgpO1xuICAgIH1cblxuICAgIGxldCBhdmdEb3RDaXJjbGUgPSBzdmcuc2VsZWN0QWxsKCcuYXZnRG90JykuZGF0YShjaGFydERhdGEpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGF2Z0RvdENpcmNsZS5hdHRyKCdjbGFzcycsICdhdmdEb3QnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcjRkZGJztcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAvL3RpcC5oaWRlKCk7XG4gICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgYXZnRG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2Z0RvdCcpXG4gICAgICAuYXR0cigncicsIDMpXG4gICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gJyNGRkYnO1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBhdmdEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gIH1cblxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTY2F0dGVyTGluZUNoYXJ0KHN2ZzphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZTphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHlTY2FsZTphbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YTpJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0PzpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGludGVycG9sYXRpb24/OnN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXM/OmJvb2xlYW4pIHtcbiAgICBsZXQgbGluZVNjYXR0ZXJUb3BTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lVG9wU3RlbScpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBsaW5lU2NhdHRlclRvcFN0ZW0uYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BTdGVtJylcbiAgICAgIC5maWx0ZXIoKGQ6YW55KSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBsaW5lU2NhdHRlclRvcFN0ZW0uZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wU3RlbScpXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBsaW5lU2NhdHRlclRvcFN0ZW0uZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgbGV0IGxpbmVTY2F0dGVyQm90dG9tU3RlbSA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgbGluZVNjYXR0ZXJCb3R0b21TdGVtLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tU3RlbScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tU3RlbScpXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgbGV0IGxpbmVTY2F0dGVyVG9wQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVUb3BDcm9zcycpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBsaW5lU2NhdHRlclRvcENyb3NzLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wQ3Jvc3MnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnMC41JztcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wQ3Jvc3MnKVxuICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnMC41JztcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgbGV0IGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBsaW5lU2NhdHRlckJvdHRvbUNyb3NzLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnMC41JztcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKVxuICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnMC41JztcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgbGV0IGNpcmNsZVNjYXR0ZXJEb3QgPSBzdmcuc2VsZWN0QWxsKCcuc2NhdHRlckRvdCcpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBjaXJjbGVTY2F0dGVyRG90LmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJEb3QnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgIH0pXG4gICAgICAuc3R5bGUoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiAnMSc7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgLy90aXAuaGlkZSgpO1xuICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGNpcmNsZVNjYXR0ZXJEb3QuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckRvdCcpXG4gICAgICAuYXR0cigncicsIDMpXG4gICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnb3BhY2l0eScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcxJztcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAvL3RpcC5oaWRlKCk7XG4gICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgY2lyY2xlU2NhdHRlckRvdC5leGl0KCkucmVtb3ZlKCk7XG5cblxuICB9XG5cbn1cbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
