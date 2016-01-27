/**
 * @name  hawkular-charts
 *
 * @description
 *   Base module for hawkular-charts.
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
                chartTitle: '@'
            };
            this.link = function (scope, element, attrs) {
                // data specific vars
                var startTimestamp = +attrs.startTimestamp, endTimestamp = +attrs.endTimestamp, chartHeight = AvailabilityChartDirective._CHART_HEIGHT;
                // chart specific vars
                var margin = { top: 10, right: 5, bottom: 5, left: 90 }, width = AvailabilityChartDirective._CHART_WIDTH - margin.left - margin.right, adjustedChartHeight = chartHeight - 50, height = adjustedChartHeight - margin.top - margin.bottom, titleHeight = 30, titleSpace = 10, innerChartHeight = height + margin.top - titleHeight - titleSpace, adjustedChartHeight2 = +titleHeight + titleSpace + margin.top, yScale, timeScale, yAxis, xAxis, xAxisGroup, brush, brushGroup, tip, chart, chartParent, svg;
                function buildAvailHover(d) {
                    return "<div class='chartHover'>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Status:</span>\n              <span class='chartHoverValue'>" + d.value.toUpperCase() + "</span>\n            </div>\n            <div class='info-item before-separator'>\n              <span class='chartHoverLabel'>Duration:</span>\n              <span class='chartHoverValue'>" + d.duration + "</span>\n            </div>\n          </div>";
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
                    startTimestamp = +attrs.startTimestamp ||
                        d3.min(transformedAvailDataPoint, function (d) {
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
                //function isDown(d: ITransformedAvailDataPoint) {
                //  return d.value === AvailStatus.DOWN.toString();
                //}
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
                    //let xAxisMin = d3.min(transformedAvailDataPoint, (d: ITransformedAvailDataPoint) => {
                    //  return +d.start;
                    //}),
                    var xAxisMax = d3.max(transformedAvailDataPoint, function (d) {
                        return +d.end;
                    });
                    var availTimeScale = d3.time.scale()
                        .range([0, width])
                        .domain([startTimestamp, endTimestamp || xAxisMax]), yScale = d3.scale.linear()
                        .clamp(true)
                        .range([height, 0])
                        .domain([0, 4]);
                    //availXAxis = d3.svg.axis()
                    //  .scale(availTimeScale)
                    //  .ticks(8)
                    //  .tickSize(13, 0)
                    //  .orient('top');
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
                        var brushElem = svg.select('.brush').node();
                        var clickEvent = new Event('mousedown');
                        clickEvent.pageX = d3.event.pageX;
                        clickEvent.clientX = d3.event.clientX;
                        clickEvent.pageY = d3.event.pageY;
                        clickEvent.clientY = d3.event.clientY;
                        brushElem.dispatchEvent(clickEvent);
                    })
                        .on('mouseup', function () {
                        var brushElem = svg.select('.brush').node();
                        var clickEvent = new Event('mouseup');
                        clickEvent.pageX = d3.event.pageX;
                        clickEvent.clientX = d3.event.clientX;
                        clickEvent.pageY = d3.event.pageY;
                        clickEvent.clientY = d3.event.clientY;
                        brushElem.dispatchEvent(clickEvent);
                    });
                    // The bottom line of the availability chart
                    svg.append('line')
                        .attr('x1', 0)
                        .attr('y1', 70)
                        .attr('x2', 655)
                        .attr('y2', 70)
                        .attr('stroke-width', 0.5)
                        .attr('stroke', '#D0D0D0');
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
                            $rootScope.$broadcast(Charts.EventNames.AVAIL_CHART_TIMERANGE_CHANGED.toString(), extent);
                        }
                        brushGroup.call(brush.clear());
                    }
                }
                scope.$watchCollection('data', function (newData) {
                    if (newData) {
                        _this.transformedDataPoints = formatTransformedDataPoints(angular.fromJson(newData));
                        scope.render(_this.transformedDataPoints);
                    }
                });
                scope.$watchGroup(['startTimestamp', 'endTimestamp'], function (newTimestamp) {
                    startTimestamp = +newTimestamp[0] || startTimestamp;
                    endTimestamp = +newTimestamp[1] || endTimestamp;
                    scope.render(_this.transformedDataPoints);
                });
                scope.render = function (transformedAvailDataPoint) {
                    if (transformedAvailDataPoint && transformedAvailDataPoint.length > 0) {
                        //console.time('availChartRender');
                        ///NOTE: layering order is important!
                        oneTimeChartSetup();
                        determineAvailScale(transformedAvailDataPoint);
                        createXandYAxes();
                        createXAxisBrush();
                        createAvailabilityChart(transformedAvailDataPoint);
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
                showYAxisValues: '=',
            };
            this.link = function (scope, element, attrs) {
                var margin = { top: 0, right: 5, bottom: 5, left: 90 };
                // data specific vars
                var chartHeight = ContextChartDirective._CHART_HEIGHT, width = ContextChartDirective._CHART_WIDTH - margin.left - margin.right, height = chartHeight - margin.top - margin.bottom, innerChartHeight = height + margin.top, showYAxisValues, yScale, yAxis, yAxisGroup, timeScale, xAxis, xAxisGroup, brush, brushGroup, chart, chartParent, svg;
                if (typeof attrs.showYAxisValues !== 'undefined') {
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
                    //console.log('dataPoints.length: ' + dataPoints.length);
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
                        .orient('left');
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
                    var contextArea = svg.append('g')
                        .attr('class', 'context');
                    contextArea.append('path')
                        .datum(dataPoints)
                        .transition()
                        .duration(500)
                        .attr('class', 'contextArea')
                        .attr('d', area);
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
                            $rootScope.$broadcast(Charts.EventNames.CONTEXT_CHART_TIMERANGE_CHANGED.toString(), brushExtent);
                        }
                        //brushGroup.call(brush.clear());
                    }
                }
                scope.$watchCollection('data', function (newData) {
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
                        //console.time('contextChartRender');
                        ///NOTE: layering order is important!
                        setup();
                        createContextChart(dataPoints);
                        createXAxisBrush();
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
            function link(scope, element, attrs) {
                // data specific vars
                var dataPoints = [], multiDataPoints, forecastDataPoints, dataUrl = attrs.metricUrl, metricId = attrs.metricId || '', metricTenantId = attrs.metricTenantId || '', metricType = attrs.metricType || 'gauge', timeRangeInSeconds = +attrs.timeRangeInSeconds || 43200, refreshIntervalInSeconds = +attrs.refreshIntervalInSeconds || 3600, alertValue = +attrs.alertValue, interpolation = attrs.interpolation || 'monotone', endTimestamp = Date.now(), startTimestamp = endTimestamp - timeRangeInSeconds, previousRangeDataPoints = [], annotationData = [], chartType = attrs.chartType || 'line', singleValueLabel = attrs.singleValueLabel || 'Raw Value', noDataLabel = attrs.noDataLabel || 'No Data', durationLabel = attrs.durationLabel || 'Interval', minLabel = attrs.minLabel || 'Min', maxLabel = attrs.maxLabel || 'Max', avgLabel = attrs.avgLabel || 'Avg', timestampLabel = attrs.timestampLabel || 'Timestamp', showAvgLine = true, showDataPoints = false, hideHighLowValues = false, useZeroMinValue = false;
                // chart specific vars
                var adjustedChartHeight = Charts.CHART_HEIGHT - 50, height = adjustedChartHeight - Charts.margin.top - Charts.margin.bottom, smallChartThresholdInPixels = 600, titleHeight = 30, titleSpace = 10, innerChartHeight = height + Charts.margin.top - titleHeight - titleSpace + Charts.margin.bottom, adjustedChartHeight2 = +titleHeight + titleSpace + Charts.margin.top, chartData, yScale, timeScale, yAxis, xAxis, tip, brush, brushGroup, chart, chartParent, svg, visuallyAdjustedMin, visuallyAdjustedMax, peak, min, processedNewData, processedPreviousRangeData;
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
                    visuallyAdjustedMax = !!!visuallyAdjustedMax && !!!visuallyAdjustedMin ? Charts.DEFAULT_Y_SCALE :
                        visuallyAdjustedMax;
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
                    return [visuallyAdjustedMin, !!!visuallyAdjustedMax && !!!visuallyAdjustedMin ? Charts.DEFAULT_Y_SCALE :
                            visuallyAdjustedMax];
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
                        hover = "<div class='chartHover'>\n                <small class='chartHoverLabel'>" + noDataLabel + "</small>\n                <div><small><span class='chartHoverLabel'>" + durationLabel + "</span><span>:\n                </span><span class='chartHoverValue'>" + barDuration + "</span></small> </div>\n                <hr/>\n                <div><small><span class='chartHoverLabel'>" + timestampLabel + "</span><span>:\n                </span><span class='chartHoverValue'>" + formattedDateTime + "</span></small></div>\n                </div>";
                    }
                    else {
                        if (Charts.isRawMetric(d)) {
                            // raw single value from raw table
                            hover = "<div class='chartHover'>\n                <div><small><span class='chartHoverLabel'>" + timestampLabel + "</span><span>: </span>\n                <span class='chartHoverValue'>" + formattedDateTime + "</span></small></div>\n                  <div><small><span class='chartHoverLabel'>" + durationLabel + "</span><span>: </span>\n                  <span class='chartHoverValue'>" + barDuration + "</span></small></div>\n                  <hr/>\n                  <div><small><span class='chartHoverLabel'>" + singleValueLabel + "</span><span>: </span>\n                  <span class='chartHoverValue'>" + d3.round(d.value, 2) + "</span></small> </div>\n                  </div> ";
                        }
                        else {
                            // aggregate with min/avg/max
                            hover = "<div class='chartHover'>\n                    <div class='info-item'>\n                      <span class='chartHoverLabel'>" + timestampLabel + ":</span>\n                      <span class='chartHoverValue'>" + formattedDateTime + "</span>\n                    </div>\n                    <div class='info-item before-separator'>\n                      <span class='chartHoverLabel'>" + durationLabel + ":</span>\n                      <span class='chartHoverValue'>" + barDuration + "</span>\n                    </div>\n                    <div class='info-item separator'>\n                      <span class='chartHoverLabel'>" + maxLabel + ":</span>\n                      <span class='chartHoverValue'>" + d3.round(d.max, 2) + "</span>\n                    </div>\n                    <div class='info-item'>\n                      <span class='chartHoverLabel'>" + avgLabel + ":</span>\n                      <span class='chartHoverValue'>" + d3.round(d.avg, 2) + "</span>\n                    </div>\n                    <div class='info-item'>\n                      <span class='chartHoverLabel'>" + minLabel + ":</span>\n                      <span class='chartHoverValue'>" + d3.round(d.min, 2) + "</span>\n                    </div>\n                  </div> ";
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
                                singleChartData.keyHash = singleChartData.keyHash
                                    || ('multiLine' + Charts.hashString(singleChartData.key));
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
                                singleChartData.keyHash = singleChartData.keyHash
                                    || ('multiLine' + Charts.hashString(singleChartData.key));
                                var pathMultiLine = svg.selectAll('path#' + singleChartData.keyHash)
                                    .data([singleChartData.values]);
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
                            .attr('opacity', 1.0);
                    }
                    if (yAxis) {
                        svg.selectAll('g.axis').remove();
                        /* tslint:disable:no-unused-variable */
                        // create x-axis
                        var xAxisGroup = svg.append('g')
                            .attr('class', 'x axis')
                            .attr('transform', 'translate(0,' + height + ')')
                            .attr('opacity', 0.3)
                            .call(xAxis)
                            .call(axisTransition);
                        // create y-axis
                        var yAxisGroup = svg.append('g')
                            .attr('class', 'y axis')
                            .attr('opacity', 0.3)
                            .call(yAxis)
                            .call(axisTransition);
                        var yAxisLabel = svg.selectAll('.yAxisUnitsLabel');
                        if (yAxisLabel.empty()) {
                            yAxisLabel = svg.append('text').attr('class', 'yAxisUnitsLabel')
                                .attr('transform', 'rotate(-90),translate(-10,-50)')
                                .attr('x', -Charts.CHART_HEIGHT / 2)
                                .style('text-anchor', 'start')
                                .text(attrs.yAxisUnits === 'NONE' ? '' : attrs.yAxisUnits)
                                .attr('opacity', 0.3)
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
                scope.$watchCollection('data', function (newData, oldData) {
                    if (newData || oldData) {
                        processedNewData = angular.fromJson(newData || []);
                        scope.render(processedNewData, processedPreviousRangeData);
                    }
                });
                scope.$watch('multiData', function (newMultiData, oldMultiData) {
                    if (newMultiData || oldMultiData) {
                        multiDataPoints = angular.fromJson(newMultiData || []);
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
                            Charts.createHistogramChart(svg, timeScale, yScale, chartData, tip, height, true, visuallyAdjustedMax, hideHighLowValues);
                            break;
                        case 'histogram':
                            Charts.createHistogramChart(svg, timeScale, yScale, chartData, tip, height, false, visuallyAdjustedMax, hideHighLowValues);
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
                    if (debug) {
                        console.group('Render Chart');
                        console.time('chartRender');
                    }
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
                    if (debug) {
                        console.timeEnd('chartRender');
                        console.groupEnd('Render Chart');
                    }
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
                if (typeof attrs.alertValue !== 'undefined') {
                    alertValue = +attrs.alertValue;
                }
                if (typeof attrs.showXAxisValues !== 'undefined') {
                    showXAxisValues = attrs.showXAxisValues === 'true';
                }
                if (typeof attrs.showYAxisValues !== 'undefined') {
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
                        .orient('left');
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
                    var sparklineArea = svg.append('g')
                        .attr('class', 'sparkline');
                    sparklineArea.append('path')
                        .datum(dataPoints)
                        .transition()
                        .duration(500)
                        .attr('class', 'sparklineArea')
                        .attr('d', area);
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
                    if (newData) {
                        _this.dataPoints = formatBucketedChartOutput(angular.fromJson(newData));
                        scope.render(_this.dataPoints);
                    }
                });
                scope.$watchCollection('alertValue', function (newAlertValue) {
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
                        //console.group('Render Sparkline Chart');
                        //console.time('SparklineChartRender');
                        ///NOTE: layering order is important!
                        setup();
                        createSparklineChart(dataPoints);
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
    /* tslint:disable:no-bitwise */
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
            ['.%L', function (d) {
                    return d.getMilliseconds();
                }],
            [':%S', function (d) {
                    return d.getSeconds();
                }],
            ['%H:%M', function (d) {
                    return d.getMinutes();
                }],
            ['%H:%M', function (d) {
                    return d.getHours();
                }],
            ['%a %d', function (d) {
                    return d.getDay() && d.getDate() !== 1;
                }],
            ['%b %d', function (d) {
                    return d.getDate() !== 1;
                }],
            ['%B', function (d) {
                    return d.getMonth();
                }],
            ['%Y', function () {
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
        if (str.length === 0) {
            return hash;
        }
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
            return timeScale(d.timestamp);
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
            return timeScale(d.timestamp);
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
            return timeScale(d.timestamp);
        })
            .y(function (d) {
            return Charts.isRawMetric(d) ? yScale(d.value) : yScale(d.min);
        })
            .y0(function () {
            return height;
        });
        if (!hideHighLowValues) {
            var highAreaPath = svg.selectAll('path.highArea').data([chartData]);
            // update existing
            highAreaPath.attr('class', 'highArea')
                .attr('d', highArea);
            // add new ones
            highAreaPath.enter().append('path')
                .attr('class', 'highArea')
                .attr('d', highArea);
            // remove old ones
            highAreaPath.exit().remove();
            var lowAreaPath = svg.selectAll('path.lowArea').data([chartData]);
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
        var avgAreaPath = svg.selectAll('path.avgArea').data([chartData]);
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
    function createHistogramChart(svg, timeScale, yScale, chartData, tip, height, stacked, visuallyAdjustedMax, hideHighLowValues) {
        var barClass = stacked ? 'leaderBar' : 'histogram';
        var rectHistogram = svg.selectAll('rect.' + barClass).data(chartData);
        function buildBars(selection) {
            selection
                .attr('class', barClass)
                .on('mouseover', function (d, i) {
                tip.show(d, i);
            }).on('mouseout', function () {
                tip.hide();
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
                tip.show(d, i);
            }).on('mouseout', function () {
                tip.hide();
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
                tip.show(d, i);
            }).on('mouseout', function () {
                tip.hide();
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImhhd2t1bGFyLW1ldHJpY3MtY2hhcnRzLm1vZHVsZS50cyIsImNoYXJ0L2FsZXJ0cy50cyIsImNoYXJ0L2F2YWlsLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L2NvbnRleHQtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvZXZlbnQtbmFtZXMudHMiLCJjaGFydC9mZWF0dXJlcy50cyIsImNoYXJ0L21ldHJpYy1jaGFydC1kaXJlY3RpdmUudHMiLCJjaGFydC9zcGFya2xpbmUtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvdHlwZXMudHMiLCJjaGFydC91dGlsaXR5LnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9hcmVhLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9oaXN0b2dyYW0udHMiLCJjaGFydC9jaGFydC10eXBlL2xpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXJMaW5lLnRzIl0sIm5hbWVzIjpbIkNoYXJ0cyIsIkNoYXJ0cy5BbGVydEJvdW5kIiwiQ2hhcnRzLkFsZXJ0Qm91bmQuY29uc3RydWN0b3IiLCJDaGFydHMuY3JlYXRlQWxlcnRMaW5lRGVmIiwiQ2hhcnRzLmNyZWF0ZUFsZXJ0TGluZSIsIkNoYXJ0cy5leHRyYWN0QWxlcnRSYW5nZXMiLCJDaGFydHMuZXh0cmFjdEFsZXJ0UmFuZ2VzLmZpbmRTdGFydFBvaW50cyIsIkNoYXJ0cy5leHRyYWN0QWxlcnRSYW5nZXMuZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleCIsIkNoYXJ0cy5jcmVhdGVBbGVydEJvdW5kc0FyZWEiLCJDaGFydHMuY3JlYXRlQWxlcnRCb3VuZHNBcmVhLmFsZXJ0Qm91bmRpbmdSZWN0IiwiQ2hhcnRzLkF2YWlsU3RhdHVzIiwiQ2hhcnRzLkF2YWlsU3RhdHVzLmNvbnN0cnVjdG9yIiwiQ2hhcnRzLkF2YWlsU3RhdHVzLnRvU3RyaW5nIiwiQ2hhcnRzLlRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQiLCJDaGFydHMuVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5idWlsZEF2YWlsSG92ZXIiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3Iub25lVGltZUNoYXJ0U2V0dXAiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZGV0ZXJtaW5lQXZhaWxTY2FsZSIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5pc1VwIiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmlzVW5rbm93biIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5mb3JtYXRUcmFuc2Zvcm1lZERhdGFQb2ludHMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZm9ybWF0VHJhbnNmb3JtZWREYXRhUG9pbnRzLnNvcnRCeVRpbWVzdGFtcCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVTaWRlWUF4aXNMYWJlbHMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQuY2FsY0JhclkiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQuY2FsY0JhckhlaWdodCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVBdmFpbGFiaWxpdHlDaGFydC5jYWxjQmFyRmlsbCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYYW5kWUF4ZXMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlWEF4aXNCcnVzaCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmJydXNoU3RhcnQiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlWEF4aXNCcnVzaC5icnVzaEVuZCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5GYWN0b3J5IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZSIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IiLCJDaGFydHMuQ29udGV4dENoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLnNldHVwIiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVDb250ZXh0Q2hhcnQiLCJDaGFydHMuQ29udGV4dENoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZVhBeGlzQnJ1c2giLCJDaGFydHMuQ29udGV4dENoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZVhBeGlzQnJ1c2guY29udGV4dEJydXNoU3RhcnQiLCJDaGFydHMuQ29udGV4dENoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZVhBeGlzQnJ1c2guY29udGV4dEJydXNoRW5kIiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5mb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5GYWN0b3J5IiwiQ2hhcnRzLkV2ZW50TmFtZXMiLCJDaGFydHMuRXZlbnROYW1lcy5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5FdmVudE5hbWVzLnRvU3RyaW5nIiwiQ2hhcnRzLmNyZWF0ZURhdGFQb2ludHMiLCJsaW5rIiwibGluay5nZXRDaGFydFdpZHRoIiwibGluay51c2VTbWFsbENoYXJ0cyIsImxpbmsuaW5pdGlhbGl6YXRpb24iLCJsaW5rLnNldHVwRmlsdGVyZWREYXRhIiwibGluay5kZXRlcm1pbmVTY2FsZSIsImxpbmsuc2V0dXBGaWx0ZXJlZE11bHRpRGF0YSIsImxpbmsuc2V0dXBGaWx0ZXJlZE11bHRpRGF0YS5kZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgiLCJsaW5rLmRldGVybWluZU11bHRpU2NhbGUiLCJsaW5rLmxvYWRTdGFuZEFsb25lTWV0cmljc0ZvclRpbWVSYW5nZSIsImxpbmsuZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dCIsImxpbmsuYnVpbGRIb3ZlciIsImxpbmsuY3JlYXRlTXVsdGlMaW5lQ2hhcnQiLCJsaW5rLmNyZWF0ZVlBeGlzR3JpZExpbmVzIiwibGluay5jcmVhdGVYYW5kWUF4ZXMiLCJsaW5rLmNyZWF0ZVhhbmRZQXhlcy5heGlzVHJhbnNpdGlvbiIsImxpbmsuY3JlYXRlQ2VudGVyZWRMaW5lIiwibGluay5jcmVhdGVMaW5lIiwibGluay5jcmVhdGVBdmdMaW5lcyIsImxpbmsuY3JlYXRlWEF4aXNCcnVzaCIsImxpbmsuY3JlYXRlWEF4aXNCcnVzaC5icnVzaFN0YXJ0IiwibGluay5jcmVhdGVYQXhpc0JydXNoLmJydXNoRW5kIiwibGluay5jcmVhdGVQcmV2aW91c1JhbmdlT3ZlcmxheSIsImxpbmsuYW5ub3RhdGVDaGFydCIsImxpbmsuY3JlYXRlRm9yZWNhc3RMaW5lIiwibGluay5zaG93Rm9yZWNhc3REYXRhIiwibGluay5sb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93IiwibGluay5kZXRlcm1pbmVDaGFydFR5cGUiLCJDaGFydHMuU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUiLCJDaGFydHMuU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IiLCJDaGFydHMuU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3Iuc2V0dXAiLCJDaGFydHMuU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlU3BhcmtsaW5lQ2hhcnQiLCJDaGFydHMuU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dCIsIkNoYXJ0cy5TcGFya2xpbmVDaGFydERpcmVjdGl2ZS5GYWN0b3J5IiwiQ2hhcnRzLmNhbGNCYXJXaWR0aCIsIkNoYXJ0cy5jYWxjQmFyV2lkdGhBZGp1c3RlZCIsIkNoYXJ0cy5jYWxjQmFyWFBvcyIsIkNoYXJ0cy5pc0VtcHR5RGF0YVBvaW50IiwiQ2hhcnRzLmlzUmF3TWV0cmljIiwiQ2hhcnRzLnhBeGlzVGltZUZvcm1hdHMiLCJDaGFydHMuY3JlYXRlU3ZnRGVmcyIsIkNoYXJ0cy54TWlkUG9pbnRTdGFydFBvc2l0aW9uIiwiQ2hhcnRzLmhhc2hTdHJpbmciLCJDaGFydHMuY3JlYXRlQXJlYUNoYXJ0IiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0IiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkQmFycyIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5idWlsZEhpZ2hCYXIiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRMb3dlckJhciIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5idWlsZFRvcFN0ZW0iLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRMb3dTdGVtIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkVG9wQ3Jvc3MiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRCb3R0b21Dcm9zcyIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5jcmVhdGVIaXN0b2dyYW1IaWdoTG93VmFsdWVzIiwiQ2hhcnRzLmNyZWF0ZUxpbmVDaGFydCIsIkNoYXJ0cy5jcmVhdGVTY2F0dGVyQ2hhcnQiLCJDaGFydHMuY3JlYXRlU2NhdHRlckxpbmVDaGFydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBQ0gsT0FBTyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQzs7QUNQdEMsK0NBQStDO0FBRS9DLElBQVUsTUFBTSxDQXlKZjtBQXpKRCxXQUFVLE1BQU0sRUFBQyxDQUFDO0lBQ2hCQSxZQUFZQSxDQUFDQTtJQUNiQTs7O09BR0dBO0lBQ0hBO1FBSUVDLG9CQUFtQkEsY0FBNEJBLEVBQ3RDQSxZQUEwQkEsRUFDMUJBLFVBQWtCQTtZQUZSQyxtQkFBY0EsR0FBZEEsY0FBY0EsQ0FBY0E7WUFDdENBLGlCQUFZQSxHQUFaQSxZQUFZQSxDQUFjQTtZQUMxQkEsZUFBVUEsR0FBVkEsVUFBVUEsQ0FBUUE7WUFDekJBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1lBQzFDQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUN4Q0EsQ0FBQ0E7UUFFSEQsaUJBQUNBO0lBQURBLENBWEFELEFBV0NDLElBQUFEO0lBWFlBLGlCQUFVQSxhQVd0QkEsQ0FBQUE7SUFFREEsNEJBQTRCQSxTQUFjQSxFQUN4Q0EsTUFBV0EsRUFDWEEsVUFBa0JBO1FBQ2xCRyxJQUFJQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxFQUFFQTthQUNyQkEsV0FBV0EsQ0FBQ0EsVUFBVUEsQ0FBQ0E7YUFDdkJBLENBQUNBLENBQUNBLFVBQUNBLENBQU1BO1lBQ1JBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLENBQUNB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QUFDQSxLQUFLQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDUkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7Z0JBQzdCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxLQUFLQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDUkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7Z0JBQ3hCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDVkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7Z0JBQ3hCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDVkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7Z0JBQ3RCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDVkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pDQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDVkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDUEEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7Z0JBQ3RCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxJQUFJQSxFQUFFQTtvQkFDTEEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7Z0JBQ2RBLENBQUNBLENBQUNBO1NBQ0hBLENBQUNBLENBQUNBO0lBQ0xBLENBQUNBO0lBM0JldEYsdUJBQWdC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O2lCQUNOQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxLQUFLQSxDQUFDQTtpQkFDcEJBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLFVBQUNBLENBQUNBLEVBQUVBLENBQUNBO2dCQUNkQSxNQUFNQSxDQUFDQSxrQkFBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsU0FBU0EsRUFBRUEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDeERBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDaEJBLE1BQU1BLENBQUNBLHVCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkVBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDbEJBLE1BQU1BLENBQUNBLDJCQUFvQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQTtpQkFDcEJBLEVBQUVBLENBQUNBLFdBQVdBLEVBQUVBLFVBQUNBLENBQUNBLEVBQUVBLENBQUNBO2dCQUNwQkEsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FB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ZkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDMUJBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO1lBQ2JBLENBQUNBLENBQUNBLENBQUNBO1FBRVBBLENBQUNBO1FBRURMLHVCQUF1QkEsU0FBNEJBO1lBQ2pETSxTQUFTQTtpQkFDTkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsQ0FBQ0E7Z0JBQ1JBLE1BQU1BLENBQUNBLENBQUNBLHVCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxtQkFBbUJBLENBQUNBO2lCQUNsQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbERBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsREEsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2QkEsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2QkEsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNoQkEsTUFBTUEsQ0FBQ0EsS0FB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Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLENBQUNBLENBQUNBO2FBQ0RBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBO1lBQ2JBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQ2hCQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxXQUFXQSxFQUFFQSxVQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN0QkEsaUJBQWlCQTtRQUNuQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsRUFBRUE7WUFDaEJBLGFBQWFBO1FBQ2ZBLENBQUNBLENBQUNBLENBQUNBO1FBQ0xBLGVBQWVBO1FBQ2ZBLFlBQVlBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO2FBQ2xDQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxRQUFRQSxDQUFDQTthQUN2QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7YUFDWkEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0Esa0JBQVdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzFEQSxDQUFDQSxDQUFDQTthQUNEQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQTtZQUNiQSxNQUFNQSxDQUFD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QUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDaEJBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQ2hCQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNMQSxlQUFlQTtRQUNmQSxxQkFBcUJBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO2FBQ3pDQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSx1QkFBdUJBLENBQUNBO2FBQ3RDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFD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QUFDQTtJQXhQZXRHLDZCQUFzQkEseUJBd1ByQ0EsQ0FBQUE7QUFFSEEsQ0FBQ0EsRUEvUFMsTUFBTSxLQUFOLE1BQU0sUUErUGYiLCJmaWxlIjoiaGF3a3VsYXItY2hhcnRzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbmFtZSAgaGF3a3VsYXItY2hhcnRzXG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiAgIEJhc2UgbW9kdWxlIGZvciBoYXdrdWxhci1jaGFydHMuXG4gKlxuICovXG5hbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJywgW10pO1xuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcbiAgLyoqXG4gICAqIERlZmluZXMgYW4gaW5kaXZpZHVhbCBhbGVydCBib3VuZHMgIHRvIGJlIHZpc3VhbGx5IGhpZ2hsaWdodGVkIGluIGEgY2hhcnRcbiAgICogdGhhdCBhbiBhbGVydCB3YXMgYWJvdmUvYmVsb3cgYSB0aHJlc2hvbGQuXG4gICAqL1xuICBleHBvcnQgY2xhc3MgQWxlcnRCb3VuZCB7XG4gICAgcHVibGljIHN0YXJ0RGF0ZTogRGF0ZTtcbiAgICBwdWJsaWMgZW5kRGF0ZTogRGF0ZTtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgcHVibGljIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgcHVibGljIGFsZXJ0VmFsdWU6IG51bWJlcikge1xuICAgICAgdGhpcy5zdGFydERhdGUgPSBuZXcgRGF0ZShzdGFydFRpbWVzdGFtcCk7XG4gICAgICB0aGlzLmVuZERhdGUgPSBuZXcgRGF0ZShlbmRUaW1lc3RhbXApO1xuICAgIH1cblxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQWxlcnRMaW5lRGVmKHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcikge1xuICAgIGxldCBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgLmludGVycG9sYXRlKCdtb25vdG9uZScpXG4gICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShhbGVydFZhbHVlKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIGxpbmU7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlQWxlcnRMaW5lKHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgYWxlcnRWYWx1ZTogbnVtYmVyLFxuICAgIGNzc0NsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgbGV0IHBhdGhBbGVydExpbmUgPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmFsZXJ0TGluZScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHBhdGhBbGVydExpbmUuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGUsIHlTY2FsZSwgYWxlcnRWYWx1ZSkpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcGF0aEFsZXJ0TGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGUsIHlTY2FsZSwgYWxlcnRWYWx1ZSkpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcGF0aEFsZXJ0TGluZS5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gZXh0cmFjdEFsZXJ0UmFuZ2VzKGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sIHRocmVzaG9sZDogQWxlcnRUaHJlc2hvbGQpOiBBbGVydEJvdW5kW10ge1xuICAgIGxldCBhbGVydEJvdW5kQXJlYUl0ZW1zOiBBbGVydEJvdW5kW107XG4gICAgbGV0IHN0YXJ0UG9pbnRzOiBudW1iZXJbXTtcblxuICAgIGZ1bmN0aW9uIGZpbmRTdGFydFBvaW50cyhjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCB0aHJlc2hvbGQ6IEFsZXJ0VGhyZXNob2xkKSB7XG4gICAgICBsZXQgc3RhcnRQb2ludHMgPSBbXTtcbiAgICAgIGxldCBwcmV2SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBjaGFydERhdGEuZm9yRWFjaCgoY2hhcnRJdGVtOiBJQ2hhcnREYXRhUG9pbnQsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBpZiAoaSA9PT0gMCAmJiBjaGFydEl0ZW0uYXZnID4gdGhyZXNob2xkKSB7XG4gICAgICAgICAgc3RhcnRQb2ludHMucHVzaChpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwcmV2SXRlbSA9IGNoYXJ0RGF0YVtpIC0gMV07XG4gICAgICAgICAgaWYgKGNoYXJ0SXRlbS5hdmcgPiB0aHJlc2hvbGQgJiYgcHJldkl0ZW0gJiYgKCFwcmV2SXRlbS5hdmcgfHwgcHJldkl0ZW0uYXZnIDw9IHRocmVzaG9sZCkpIHtcbiAgICAgICAgICAgIHN0YXJ0UG9pbnRzLnB1c2gocHJldkl0ZW0uYXZnID8gKGkgLSAxKSA6IGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBzdGFydFBvaW50cztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzOiBudW1iZXJbXSwgdGhyZXNob2xkOiBBbGVydFRocmVzaG9sZCk6IEFsZXJ0Qm91bmRbXSB7XG4gICAgICBsZXQgYWxlcnRCb3VuZEFyZWFJdGVtczogQWxlcnRCb3VuZFtdID0gW107XG4gICAgICBsZXQgY3VycmVudEl0ZW06IElDaGFydERhdGFQb2ludDtcbiAgICAgIGxldCBuZXh0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuICAgICAgbGV0IHN0YXJ0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBzdGFydFBvaW50cy5mb3JFYWNoKChzdGFydFBvaW50SW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICBzdGFydEl0ZW0gPSBjaGFydERhdGFbc3RhcnRQb2ludEluZGV4XTtcblxuICAgICAgICBmb3IgKGxldCBqID0gc3RhcnRQb2ludEluZGV4OyBqIDwgY2hhcnREYXRhLmxlbmd0aCAtIDE7IGorKykge1xuICAgICAgICAgIGN1cnJlbnRJdGVtID0gY2hhcnREYXRhW2pdO1xuICAgICAgICAgIG5leHRJdGVtID0gY2hhcnREYXRhW2ogKyAxXTtcblxuICAgICAgICAgIGlmICgoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmIG5leHRJdGVtLmF2ZyA8PSB0aHJlc2hvbGQpXG4gICAgICAgICAgICB8fCAoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmICFuZXh0SXRlbS5hdmcpKSB7XG4gICAgICAgICAgICBhbGVydEJvdW5kQXJlYUl0ZW1zLnB1c2gobmV3IEFsZXJ0Qm91bmQoc3RhcnRJdGVtLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgbmV4dEl0ZW0uYXZnID8gbmV4dEl0ZW0udGltZXN0YW1wIDogY3VycmVudEl0ZW0udGltZXN0YW1wLCB0aHJlc2hvbGQpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vLyBtZWFucyB0aGUgbGFzdCBwaWVjZSBkYXRhIGlzIGFsbCBhYm92ZSB0aHJlc2hvbGQsIHVzZSBsYXN0IGRhdGEgcG9pbnRcbiAgICAgIGlmIChhbGVydEJvdW5kQXJlYUl0ZW1zLmxlbmd0aCA9PT0gKHN0YXJ0UG9pbnRzLmxlbmd0aCAtIDEpKSB7XG4gICAgICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMucHVzaChuZXcgQWxlcnRCb3VuZChjaGFydERhdGFbc3RhcnRQb2ludHNbc3RhcnRQb2ludHMubGVuZ3RoIC0gMV1dLnRpbWVzdGFtcCxcbiAgICAgICAgICBjaGFydERhdGFbY2hhcnREYXRhLmxlbmd0aCAtIDFdLnRpbWVzdGFtcCwgdGhyZXNob2xkKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBhbGVydEJvdW5kQXJlYUl0ZW1zO1xuICAgIH1cblxuICAgIHN0YXJ0UG9pbnRzID0gZmluZFN0YXJ0UG9pbnRzKGNoYXJ0RGF0YSwgdGhyZXNob2xkKTtcblxuICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMgPSBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzLCB0aHJlc2hvbGQpO1xuXG4gICAgcmV0dXJuIGFsZXJ0Qm91bmRBcmVhSXRlbXM7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBbGVydEJvdW5kc0FyZWEoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgaGlnaEJvdW5kOiBudW1iZXIsXG4gICAgYWxlcnRCb3VuZHM6IEFsZXJ0Qm91bmRbXSkge1xuICAgIGxldCByZWN0QWxlcnQgPSBzdmcuc2VsZWN0KCdnLmFsZXJ0SG9sZGVyJykuc2VsZWN0QWxsKCdyZWN0LmFsZXJ0Qm91bmRzJykuZGF0YShhbGVydEJvdW5kcyk7XG5cbiAgICBmdW5jdGlvbiBhbGVydEJvdW5kaW5nUmVjdChzZWxlY3Rpb24pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuYXR0cignY2xhc3MnLCAnYWxlcnRCb3VuZHMnKVxuICAgICAgICAuYXR0cigneCcsIChkOiBBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnN0YXJ0VGltZXN0YW1wKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3knLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShoaWdoQm91bmQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQ6IEFsZXJ0Qm91bmQpID0+IHtcbiAgICAgICAgICAvLy9AdG9kbzogbWFrZSB0aGUgaGVpZ2h0IGFkanVzdGFibGVcbiAgICAgICAgICByZXR1cm4gMTg1O1xuICAgICAgICAgIC8vcmV0dXJuIHlTY2FsZSgwKSAtIGhlaWdodDtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQ6IEFsZXJ0Qm91bmQpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQuZW5kVGltZXN0YW1wKSAtIHRpbWVTY2FsZShkLnN0YXJ0VGltZXN0YW1wKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgcmVjdEFsZXJ0LmNhbGwoYWxlcnRCb3VuZGluZ1JlY3QpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcmVjdEFsZXJ0LmVudGVyKClcbiAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgLmNhbGwoYWxlcnRCb3VuZGluZ1JlY3QpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcmVjdEFsZXJ0LmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkZWNsYXJlIGxldCBkMzogYW55O1xuXG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cbiAgZXhwb3J0IGNsYXNzIEF2YWlsU3RhdHVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgVVAgPSAndXAnO1xuICAgIHB1YmxpYyBzdGF0aWMgRE9XTiA9ICdkb3duJztcbiAgICBwdWJsaWMgc3RhdGljIFVOS05PV04gPSAndW5rbm93bic7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykge1xuICAgICAgLy8gZW1wdHlcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSBpbnB1dCBkYXRhIGZvcm1hdCwgZGlyZWN0bHkgZnJvbSBNZXRyaWNzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQXZhaWxEYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyB0aGUgdHJhbnNmb3JtZWQgb3V0cHV0IGRhdGEgZm9ybWF0LiBGb3JtYXR0ZWQgdG8gd29yayB3aXRoIGF2YWlsYWJpbGl0eSBjaGFydCAoYmFzaWNhbGx5IGEgRFRPKS5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBudW1iZXI7XG4gICAgZW5kOiBudW1iZXI7XG4gICAgdmFsdWU6IHN0cmluZztcbiAgICBzdGFydERhdGU/OiBEYXRlOyAvLy8gTWFpbmx5IGZvciBkZWJ1Z2dlciBodW1hbiByZWFkYWJsZSBkYXRlcyBpbnN0ZWFkIG9mIGEgbnVtYmVyXG4gICAgZW5kRGF0ZT86IERhdGU7XG4gICAgZHVyYXRpb24/OiBzdHJpbmc7XG4gICAgbWVzc2FnZT86IHN0cmluZztcbiAgfVxuXG4gIGV4cG9ydCBjbGFzcyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IGltcGxlbWVudHMgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHN0YXJ0OiBudW1iZXIsXG4gICAgICBwdWJsaWMgZW5kOiBudW1iZXIsXG4gICAgICBwdWJsaWMgdmFsdWU6IHN0cmluZyxcbiAgICAgIHB1YmxpYyBzdGFydERhdGU/OiBEYXRlLFxuICAgICAgcHVibGljIGVuZERhdGU/OiBEYXRlLFxuICAgICAgcHVibGljIGR1cmF0aW9uPzogc3RyaW5nLFxuICAgICAgcHVibGljIG1lc3NhZ2U/OiBzdHJpbmcpIHtcblxuICAgICAgdGhpcy5kdXJhdGlvbiA9IG1vbWVudChlbmQpLmZyb20obW9tZW50KHN0YXJ0KSwgdHJ1ZSk7XG4gICAgICB0aGlzLnN0YXJ0RGF0ZSA9IG5ldyBEYXRlKHN0YXJ0KTtcbiAgICAgIHRoaXMuZW5kRGF0ZSA9IG5ldyBEYXRlKGVuZCk7XG4gICAgfVxuXG4gIH1cblxuICBleHBvcnQgY2xhc3MgQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX0hFSUdIVCA9IDE1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfV0lEVEggPSA3NTA7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGRhdGE6ICc9JyxcbiAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgIHRpbWVMYWJlbDogJ0AnLFxuICAgICAgZGF0ZUxhYmVsOiAnQCcsXG4gICAgICBjaGFydFRpdGxlOiAnQCdcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6IChzY29wZTogYW55LCBlbGVtZW50OiBuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczogYW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIHRyYW5zZm9ybWVkRGF0YVBvaW50czogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSB7XG5cbiAgICAgIHRoaXMubGluayA9IChzY29wZSwgZWxlbWVudCwgYXR0cnMpID0+IHtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IHN0YXJ0VGltZXN0YW1wOiBudW1iZXIgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAsXG4gICAgICAgICAgZW5kVGltZXN0YW1wOiBudW1iZXIgPSArYXR0cnMuZW5kVGltZXN0YW1wLFxuICAgICAgICAgIGNoYXJ0SGVpZ2h0ID0gQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVDtcblxuICAgICAgICAvLyBjaGFydCBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBtYXJnaW4gPSB7IHRvcDogMTAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwIH0sXG4gICAgICAgICAgd2lkdGggPSBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5fQ0hBUlRfV0lEVEggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCxcbiAgICAgICAgICBhZGp1c3RlZENoYXJ0SGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSA1MCxcbiAgICAgICAgICBoZWlnaHQgPSBhZGp1c3RlZENoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgdGl0bGVIZWlnaHQgPSAzMCxcbiAgICAgICAgICB0aXRsZVNwYWNlID0gMTAsXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AgLSB0aXRsZUhlaWdodCAtIHRpdGxlU3BhY2UsXG4gICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodDIgPSArdGl0bGVIZWlnaHQgKyB0aXRsZVNwYWNlICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgIHhBeGlzR3JvdXAsXG4gICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICB0aXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnO1xuXG4gICAgICAgIGZ1bmN0aW9uIGJ1aWxkQXZhaWxIb3ZlcihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz5TdGF0dXM6PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QudmFsdWUudG9VcHBlckNhc2UoKX08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSBiZWZvcmUtc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+RHVyYXRpb246PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QuZHVyYXRpb259PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uZVRpbWVDaGFydFNldHVwKCk6IHZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgLmF0dHIoJ3ZpZXdCb3gnLCAnMCAwIDc2MCAxNTAnKS5hdHRyKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ3hNaW5ZTWluIG1lZXQnKTtcblxuICAgICAgICAgIHRpcCA9IGQzLnRpcCgpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZDMtdGlwJylcbiAgICAgICAgICAgIC5vZmZzZXQoWy0xMCwgMF0pXG4gICAgICAgICAgICAuaHRtbCgoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGJ1aWxkQXZhaWxIb3ZlcihkKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoICsgbWFyZ2luLmxlZnQgKyBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodClcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsJyArIChhZGp1c3RlZENoYXJ0SGVpZ2h0MikgKyAnKScpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZGVmcycpXG4gICAgICAgICAgICAuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgICAgICAgIC5hdHRyKCdpZCcsICdkaWFnb25hbC1zdHJpcGVzJylcbiAgICAgICAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgICAgICAgLmF0dHIoJ3BhdHRlcm5UcmFuc2Zvcm0nLCAnc2NhbGUoMC43KScpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCA0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDQpXG4gICAgICAgICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5hdHRyKCdkJywgJ00tMSwxIGwyLC0yIE0wLDQgbDQsLTQgTTMsNSBsMiwtMicpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgJyNCNkI2QjYnKVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIDEuMik7XG5cbiAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lQXZhaWxTY2FsZSh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSB7XG4gICAgICAgICAgbGV0IGFkanVzdGVkVGltZVJhbmdlOiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAgfHxcbiAgICAgICAgICAgIGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGQuc3RhcnQ7XG4gICAgICAgICAgICB9KSB8fCArbW9tZW50KCkuc3VidHJhY3QoMSwgJ2hvdXInKTtcblxuICAgICAgICAgIGlmICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50ICYmIHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQubGVuZ3RoID4gMCkge1xuXG4gICAgICAgICAgICBhZGp1c3RlZFRpbWVSYW5nZVswXSA9IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgICAgYWRqdXN0ZWRUaW1lUmFuZ2VbMV0gPSBlbmRUaW1lc3RhbXAgfHwgK21vbWVudCgpO1xuXG4gICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlUm91bmQoWzcwLCAwXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihbMCwgMTc1XSk7XG5cbiAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAudGlja3MoMClcbiAgICAgICAgICAgICAgLnRpY2tTaXplKDAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgICAuZG9tYWluKGFkanVzdGVkVGltZVJhbmdlKTtcblxuICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgIC50aWNrU2l6ZSgtNzAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ3RvcCcpXG4gICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSk7XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBpc1VwKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVQLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2Z1bmN0aW9uIGlzRG93bihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAvLyAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLkRPV04udG9TdHJpbmcoKTtcbiAgICAgICAgLy99XG5cbiAgICAgICAgZnVuY3Rpb24gaXNVbmtub3duKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVOS05PV04udG9TdHJpbmcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhpbkF2YWlsRGF0YTogSUF2YWlsRGF0YVBvaW50W10pOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdIHtcbiAgICAgICAgICBsZXQgb3V0cHV0RGF0YTogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSA9IFtdO1xuICAgICAgICAgIGxldCBpdGVtQ291bnQgPSBpbkF2YWlsRGF0YS5sZW5ndGg7XG5cbiAgICAgICAgICBmdW5jdGlvbiBzb3J0QnlUaW1lc3RhbXAoYTogSUF2YWlsRGF0YVBvaW50LCBiOiBJQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIGlmIChhLnRpbWVzdGFtcCA8IGIudGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhLnRpbWVzdGFtcCA+IGIudGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaW5BdmFpbERhdGEuc29ydChzb3J0QnlUaW1lc3RhbXApO1xuXG4gICAgICAgICAgaWYgKGluQXZhaWxEYXRhICYmIGl0ZW1Db3VudCA+IDAgJiYgaW5BdmFpbERhdGFbMF0udGltZXN0YW1wKSB7XG4gICAgICAgICAgICBsZXQgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICAgICAgICAgIGlmIChpdGVtQ291bnQgPT09IDEpIHtcbiAgICAgICAgICAgICAgbGV0IGF2YWlsSXRlbSA9IGluQXZhaWxEYXRhWzBdO1xuXG4gICAgICAgICAgICAgIC8vIHdlIG9ubHkgaGF2ZSBvbmUgaXRlbSB3aXRoIHN0YXJ0IHRpbWUuIEFzc3VtZSB1bmtub3duIGZvciB0aGUgdGltZSBiZWZvcmUgKGxhc3QgMWgpXG4gICAgICAgICAgICAgIC8vIEBUT0RPIGFkanVzdCB0byB0aW1lIHBpY2tlclxuICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQobm93IC0gNjAgKiA2MCAqIDEwMDAsXG4gICAgICAgICAgICAgICAgYXZhaWxJdGVtLnRpbWVzdGFtcCwgQXZhaWxTdGF0dXMuVU5LTk9XTi50b1N0cmluZygpKSk7XG4gICAgICAgICAgICAgIC8vIGFuZCB0aGUgZGV0ZXJtaW5lZCB2YWx1ZSB1cCB1bnRpbCB0aGUgZW5kLlxuICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoYXZhaWxJdGVtLnRpbWVzdGFtcCwgbm93LCBhdmFpbEl0ZW0udmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxldCBiYWNrd2FyZHNFbmRUaW1lID0gbm93O1xuXG4gICAgICAgICAgICAgIGZvciAobGV0IGkgPSBpbkF2YWlsRGF0YS5sZW5ndGg7IGkgPiAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGRhdGEgc3RhcnRpbmcgaW4gdGhlIGZ1dHVyZS4uLiBkaXNjYXJkIGl0XG4gICAgICAgICAgICAgICAgLy9pZiAoaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCA+ICttb21lbnQoKSkge1xuICAgICAgICAgICAgICAgIC8vICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAvL31cbiAgICAgICAgICAgICAgICBpZiAoc3RhcnRUaW1lc3RhbXAgPj0gaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KHN0YXJ0VGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lLCBpbkF2YWlsRGF0YVtpIC0gMV0udmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSwgaW5BdmFpbERhdGFbaSAtIDFdLnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lID0gaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG91dHB1dERhdGE7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVTaWRlWUF4aXNMYWJlbHMoKSB7XG4gICAgICAgICAgLy8vQFRvZG86IG1vdmUgb3V0IHRvIHN0eWxlc2hlZXRcbiAgICAgICAgICBzdmcuYXBwZW5kKCd0ZXh0JylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmFpbFVwTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDI1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdVcCcpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgndGV4dCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxEb3duTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDU1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdEb3duJyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10pIHtcbiAgICAgICAgICAvL2xldCB4QXhpc01pbiA9IGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAvLyAgcmV0dXJuICtkLnN0YXJ0O1xuICAgICAgICAgIC8vfSksXG4gICAgICAgICAgbGV0IHhBeGlzTWF4ID0gZDMubWF4KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICtkLmVuZDtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBhdmFpbFRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAuZG9tYWluKFtzdGFydFRpbWVzdGFtcCwgZW5kVGltZXN0YW1wIHx8IHhBeGlzTWF4XSksXG5cbiAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2UoW2hlaWdodCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oWzAsIDRdKTtcblxuICAgICAgICAgIC8vYXZhaWxYQXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAvLyAgLnNjYWxlKGF2YWlsVGltZVNjYWxlKVxuICAgICAgICAgIC8vICAudGlja3MoOClcbiAgICAgICAgICAvLyAgLnRpY2tTaXplKDEzLCAwKVxuICAgICAgICAgIC8vICAub3JpZW50KCd0b3AnKTtcblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgb2Zmc2V0IGZvciB0aGUgYmFyXG4gICAgICAgICAgLy8gVXAgb3IgVW5rbm93bjogb2Zmc2V0IDAsIERvd246IG9mZnNldCAzNVxuICAgICAgICAgIGZ1bmN0aW9uIGNhbGNCYXJZKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgICByZXR1cm4gaGVpZ2h0IC0geVNjYWxlKDApICsgKChpc1VwKGQpIHx8IGlzVW5rbm93bihkKSkgPyAwIDogMzUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgcmVtb3ZlZCBoZWlnaHQgZm9yIHRoZSBiYXJcbiAgICAgICAgICAvLyBVbmtub3duOiBmdWxsIGhlaWdodCAxNSwgVXAgb3IgRG93bjogaGFsZiBoZWlnaHQsIDUwXG4gICAgICAgICAgZnVuY3Rpb24gY2FsY0JhckhlaWdodChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgcmV0dXJuIHlTY2FsZSgwKSAtIChpc1Vua25vd24oZCkgPyAxNSA6IDUwKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjYWxjQmFyRmlsbChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgaWYgKGlzVXAoZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjNTRBMjRFJzsgLy8gZ3JlZW5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNVbmtub3duKGQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndXJsKCNkaWFnb25hbC1zdHJpcGVzKSc7IC8vIGdyYXkgc3RyaXBlc1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjRDg1MDU0JzsgLy8gcmVkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncmVjdC5hdmFpbEJhcnMnKVxuICAgICAgICAgICAgLmRhdGEodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludClcbiAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxCYXJzJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJZKGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gY2FsY0JhckhlaWdodChkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGRFbmQgPSBlbmRUaW1lc3RhbXAgPyAoTWF0aC5taW4oK2QuZW5kLCBlbmRUaW1lc3RhbXApKSA6ICgrZC5lbmQpO1xuICAgICAgICAgICAgICByZXR1cm4gYXZhaWxUaW1lU2NhbGUoZEVuZCkgLSBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJGaWxsKGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gMC44NTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2Vkb3duJywgKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgYnJ1c2hFbGVtID0gc3ZnLnNlbGVjdCgnLmJydXNoJykubm9kZSgpO1xuICAgICAgICAgICAgICBsZXQgY2xpY2tFdmVudDogYW55ID0gbmV3IEV2ZW50KCdtb3VzZWRvd24nKTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWCA9IGQzLmV2ZW50LnBhZ2VYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFggPSBkMy5ldmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VZID0gZDMuZXZlbnQucGFnZVk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WSA9IGQzLmV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICAgIGJydXNoRWxlbS5kaXNwYXRjaEV2ZW50KGNsaWNrRXZlbnQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2V1cCcsICgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGJydXNoRWxlbSA9IHN2Zy5zZWxlY3QoJy5icnVzaCcpLm5vZGUoKTtcbiAgICAgICAgICAgICAgbGV0IGNsaWNrRXZlbnQ6IGFueSA9IG5ldyBFdmVudCgnbW91c2V1cCcpO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VYID0gZDMuZXZlbnQucGFnZVg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WCA9IGQzLmV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVkgPSBkMy5ldmVudC5wYWdlWTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRZID0gZDMuZXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgYnJ1c2hFbGVtLmRpc3BhdGNoRXZlbnQoY2xpY2tFdmVudCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIFRoZSBib3R0b20gbGluZSBvZiB0aGUgYXZhaWxhYmlsaXR5IGNoYXJ0XG4gICAgICAgICAgc3ZnLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuYXR0cigneDEnLCAwKVxuICAgICAgICAgICAgLmF0dHIoJ3kxJywgNzApXG4gICAgICAgICAgICAuYXR0cigneDInLCA2NTUpXG4gICAgICAgICAgICAuYXR0cigneTInLCA3MClcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAwLjUpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgJyNEMEQwRDAnKTtcblxuICAgICAgICAgIGNyZWF0ZVNpZGVZQXhpc0xhYmVscygpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWGFuZFlBeGVzKCkge1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGJydXNoRW5kKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDcwKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgZXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgIHN0YXJ0VGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvL3N2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5BVkFJTF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBleHRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChuZXdEYXRhKSB7XG4gICAgICAgICAgICB0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyA9IGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ3N0YXJ0VGltZXN0YW1wJywgJ2VuZFRpbWVzdGFtcCddLCAobmV3VGltZXN0YW1wKSA9PiB7XG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzBdIHx8IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgIGVuZFRpbWVzdGFtcCA9ICtuZXdUaW1lc3RhbXBbMV0gfHwgZW5kVGltZXN0YW1wO1xuICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLnJlbmRlciA9ICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQgJiYgdHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUudGltZSgnYXZhaWxDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgb25lVGltZUNoYXJ0U2V0dXAoKTtcbiAgICAgICAgICAgIGRldGVybWluZUF2YWlsU2NhbGUodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCk7XG4gICAgICAgICAgICBjcmVhdGVYYW5kWUF4ZXMoKTtcbiAgICAgICAgICAgIGNyZWF0ZVhBeGlzQnJ1c2goKTtcbiAgICAgICAgICAgIGNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpO1xuICAgICAgICAgICAgLy9jb25zb2xlLnRpbWVFbmQoJ2F2YWlsQ2hhcnRSZW5kZXInKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnYXZhaWxhYmlsaXR5Q2hhcnQnLCBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5GYWN0b3J5KCkpO1xufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgY29uc3QgX21vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKTtcblxuICBleHBvcnQgY2xhc3MgQ29udGV4dENoYXJ0RGlyZWN0aXZlIHtcblxuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9XSURUSCA9IDc1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfSEVJR0hUID0gNTA7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGRhdGE6ICc9JyxcbiAgICAgIHNob3dZQXhpc1ZhbHVlczogJz0nLFxuICAgIH07XG5cbiAgICBwdWJsaWMgbGluazogKHNjb3BlOiBhbnksIGVsZW1lbnQ6IG5nLklBdWdtZW50ZWRKUXVlcnksIGF0dHJzOiBhbnkpID0+IHZvaWQ7XG5cbiAgICBwdWJsaWMgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W107XG5cbiAgICBjb25zdHJ1Y3Rvcigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgY29uc3QgbWFyZ2luID0geyB0b3A6IDAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwIH07XG5cbiAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBjaGFydEhlaWdodCA9IENvbnRleHRDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hULFxuICAgICAgICAgIHdpZHRoID0gQ29udGV4dENoYXJ0RGlyZWN0aXZlLl9DSEFSVF9XSURUSCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0LFxuICAgICAgICAgIGhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AsXG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzOiBib29sZWFuLFxuICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB5QXhpc0dyb3VwLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGJydXNoLFxuICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnO1xuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuc2hvd1lBeGlzVmFsdWVzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlcyA9IGF0dHJzLnNob3dZQXhpc1ZhbHVlcyA9PT0gJ3RydWUnO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2V0dXAoKTogdm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG4gICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAuYXR0cigndmlld0JveCcsICcwIDAgNzYwIDUwJykuYXR0cigncHJlc2VydmVBc3BlY3RSYXRpbycsICd4TWluWU1pbiBtZWV0Jyk7XG5cbiAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywgMCknKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRDaGFydCcpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVDb250ZXh0Q2hhcnQoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICAgICAgICAvL2NvbnNvbGUubG9nKCdkYXRhUG9pbnRzLmxlbmd0aDogJyArIGRhdGFQb2ludHMubGVuZ3RoKTtcblxuICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aCAtIDEwXSlcbiAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgIC5kb21haW4oW2RhdGFQb2ludHNbMF0udGltZXN0YW1wLCBkYXRhUG9pbnRzW2RhdGFQb2ludHMubGVuZ3RoIC0gMV0udGltZXN0YW1wXSk7XG5cbiAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAudGlja3MoNSlcbiAgICAgICAgICAgIC50aWNrU2l6ZSg0LCAwKVxuICAgICAgICAgICAgLnRpY2tGb3JtYXQoeEF4aXNUaW1lRm9ybWF0cygpKVxuICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgIHhBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd4IGF4aXMnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwnICsgaGVpZ2h0ICsgJyknKVxuICAgICAgICAgICAgLmNhbGwoeEF4aXMpO1xuXG4gICAgICAgICAgbGV0IHlNaW4gPSBkMy5taW4oZGF0YVBvaW50cywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgeU1heCA9IGQzLm1heChkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gZ2l2ZSBhIHBhZCBvZiAlIHRvIG1pbi9tYXggc28gd2UgYXJlIG5vdCBhZ2FpbnN0IHgtYXhpc1xuICAgICAgICAgIHlNYXggPSB5TWF4ICsgKHlNYXggKiAwLjAzKTtcbiAgICAgICAgICB5TWluID0geU1pbiAtICh5TWluICogMC4wNSk7XG5cbiAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgLnJhbmdlUm91bmQoW0NvbnRleHRDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hUIC0gMTAsIDBdKVxuICAgICAgICAgICAgLm5pY2UoKVxuICAgICAgICAgICAgLmRvbWFpbihbeU1pbiwgeU1heF0pO1xuXG4gICAgICAgICAgbGV0IG51bWJlck9mVGlja3MgPSBzaG93WUF4aXNWYWx1ZXMgPyAyIDogMDtcblxuICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgIC50aWNrcyhudW1iZXJPZlRpY2tzKVxuICAgICAgICAgICAgLnRpY2tTaXplKDQsIDApXG4gICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcblxuICAgICAgICAgIGxldCBhcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgICAgLmludGVycG9sYXRlKCdjYXJkaW5hbCcpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAhZC5lbXB0eTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBoZWlnaHQ7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkxKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBjb250ZXh0TGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgIC5pbnRlcnBvbGF0ZSgnY2FyZGluYWwnKVxuICAgICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gIWQuZW1wdHk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgcGF0aENvbnRleHRMaW5lID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5jb250ZXh0TGluZScpLmRhdGEoW2RhdGFQb2ludHNdKTtcblxuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIHBhdGhDb250ZXh0TGluZS5hdHRyKCdjbGFzcycsICdjb250ZXh0TGluZScpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuYXR0cignZCcsIGNvbnRleHRMaW5lKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIHBhdGhDb250ZXh0TGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dExpbmUnKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBjb250ZXh0TGluZSk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgbGV0IGNvbnRleHRBcmVhID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dCcpO1xuXG4gICAgICAgICAgY29udGV4dEFyZWEuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5kYXR1bShkYXRhUG9pbnRzKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmR1cmF0aW9uKDUwMClcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdjb250ZXh0QXJlYScpXG4gICAgICAgICAgICAuYXR0cignZCcsIGFyZWEpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgYnJ1c2ggPSBkMy5zdmcuYnJ1c2goKVxuICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgLm9uKCdicnVzaHN0YXJ0JywgY29udGV4dEJydXNoU3RhcnQpXG4gICAgICAgICAgICAub24oJ2JydXNoZW5kJywgY29udGV4dEJydXNoRW5kKTtcblxuICAgICAgICAgIHhBeGlzR3JvdXAuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAwKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGhlaWdodCAtIDEwKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGhlaWdodCArIDE3KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGNvbnRleHRCcnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsIHRydWUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNvbnRleHRCcnVzaEVuZCgpIHtcbiAgICAgICAgICAgIGxldCBicnVzaEV4dGVudCA9IGJydXNoLmV4dGVudCgpLFxuICAgICAgICAgICAgICBzdGFydFRpbWUgPSBNYXRoLnJvdW5kKGJydXNoRXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGJydXNoRXh0ZW50WzFdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgICAgIC8vLyBXZSBpZ25vcmUgZHJhZyBzZWxlY3Rpb25zIHVuZGVyIGEgbWludXRlXG4gICAgICAgICAgICBpZiAoZHJhZ1NlbGVjdGlvbkRlbHRhID49IDYwMDAwKSB7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChFdmVudE5hbWVzLkNPTlRFWFRfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQudG9TdHJpbmcoKSwgYnJ1c2hFeHRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy9icnVzaEdyb3VwLmNhbGwoYnJ1c2guY2xlYXIoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignZGF0YScsIChuZXdEYXRhKSA9PiB7XG4gICAgICAgICAgaWYgKG5ld0RhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVBvaW50cyA9IGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQoYW5ndWxhci5mcm9tSnNvbihuZXdEYXRhKSk7XG4gICAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy5kYXRhUG9pbnRzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOiBJQ2hhcnREYXRhUG9pbnRbXSB7XG4gICAgICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5tYXAoKHBvaW50OiBJQ2hhcnREYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAvL2RhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUucmVuZGVyID0gKGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKGRhdGFQb2ludHMgJiYgZGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUudGltZSgnY29udGV4dENoYXJ0UmVuZGVyJyk7XG5cbiAgICAgICAgICAgIC8vL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIHNldHVwKCk7XG4gICAgICAgICAgICBjcmVhdGVDb250ZXh0Q2hhcnQoZGF0YVBvaW50cyk7XG4gICAgICAgICAgICBjcmVhdGVYQXhpc0JydXNoKCk7XG4gICAgICAgICAgICAvL2NvbnNvbGUudGltZUVuZCgnY29udGV4dENoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3RhdGljIEZhY3RvcnkoKSB7XG4gICAgICBsZXQgZGlyZWN0aXZlID0gKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgQ29udGV4dENoYXJ0RGlyZWN0aXZlKCRyb290U2NvcGUpO1xuICAgICAgfTtcblxuICAgICAgZGlyZWN0aXZlWyckaW5qZWN0J10gPSBbJyRyb290U2NvcGUnXTtcblxuICAgICAgcmV0dXJuIGRpcmVjdGl2ZTtcbiAgICB9XG5cbiAgfVxuXG4gIF9tb2R1bGUuZGlyZWN0aXZlKCdoYXdrdWxhckNvbnRleHRDaGFydCcsIENvbnRleHRDaGFydERpcmVjdGl2ZS5GYWN0b3J5KCkpO1xufVxuIiwiLy8vXG4vLy8gQ29weXJpZ2h0IDIwMTUgUmVkIEhhdCwgSW5jLiBhbmQvb3IgaXRzIGFmZmlsaWF0ZXNcbi8vLyBhbmQgb3RoZXIgY29udHJpYnV0b3JzIGFzIGluZGljYXRlZCBieSB0aGUgQGF1dGhvciB0YWdzLlxuLy8vXG4vLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vLy9cbi8vLyAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vL1xuLy8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLy8vXG4vLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8vLyBOT1RFOiB0aGlzIHBhdHRlcm4gaXMgdXNlZCBiZWNhdXNlIGVudW1zIGNhbnQgYmUgdXNlZCB3aXRoIHN0cmluZ3NcbiAgZXhwb3J0IGNsYXNzIEV2ZW50TmFtZXMge1xuXG4gICAgcHVibGljIHN0YXRpYyBDSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdDaGFydFRpbWVSYW5nZUNoYW5nZWQnKTtcbiAgICBwdWJsaWMgc3RhdGljIEFWQUlMX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VEID0gbmV3IEV2ZW50TmFtZXMoJ0F2YWlsQ2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG4gICAgcHVibGljIHN0YXRpYyBDT05URVhUX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VEID0gbmV3IEV2ZW50TmFtZXMoJ0NvbnRleHRDaGFydFRpbWVSYW5nZUNoYW5nZWQnKTtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAvLyBlbXB0eVxuICAgIH1cblxuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgcmV0dXJuIHRoaXMudmFsdWU7XG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEYXRhUG9pbnRzKHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIHRpcDogYW55LFxuICAgIGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSB7XG4gICAgbGV0IHJhZGl1cyA9IDE7XG4gICAgbGV0IGRvdERhdGFwb2ludCA9IHN2Zy5zZWxlY3RBbGwoJy5kYXRhUG9pbnREb3QnKS5kYXRhKGRhdGFQb2ludHMpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGRvdERhdGFwb2ludC5hdHRyKCdjbGFzcycsICdkYXRhUG9pbnREb3QnKVxuICAgICAgLmF0dHIoJ3InLCByYWRpdXMpXG4gICAgICAuYXR0cignY3gnLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgcmV0dXJuIGQuYXZnID8geVNjYWxlKGQuYXZnKSA6IC05OTk5OTk5O1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIGZ1bmN0aW9uKGQsIGkpIHtcbiAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGRvdERhdGFwb2ludC5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgIC5hdHRyKCdjbGFzcycsICdkYXRhUG9pbnREb3QnKVxuICAgICAgLmF0dHIoJ3InLCByYWRpdXMpXG4gICAgICAuYXR0cignY3gnLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgcmV0dXJuIGQuYXZnID8geVNjYWxlKGQuYXZnKSA6IC05OTk5OTk5O1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIGZ1bmN0aW9uKGQsIGkpIHtcbiAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGRvdERhdGFwb2ludC5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkZWNsYXJlIGxldCBkMzogYW55O1xuICBkZWNsYXJlIGxldCBjb25zb2xlOiBhbnk7XG5cbiAgbGV0IGRlYnVnOiBib29sZWFuID0gZmFsc2U7XG5cbiAgLy8gdGhlIHNjYWxlIHRvIHVzZSBmb3IgeS1heGlzIHdoZW4gYWxsIHZhbHVlcyBhcmUgMCwgWzAsIERFRkFVTFRfWV9TQ0FMRV1cbiAgZXhwb3J0IGNvbnN0IERFRkFVTFRfWV9TQ0FMRSA9IDEwO1xuICBleHBvcnQgY29uc3QgWV9BWElTX0hFSUdIVCA9IDI1O1xuICBleHBvcnQgY29uc3QgQ0hBUlRfSEVJR0hUID0gMjUwO1xuICBleHBvcnQgY29uc3QgQ0hBUlRfV0lEVEggPSA3NTA7XG4gIGV4cG9ydCBjb25zdCBIT1ZFUl9EQVRFX1RJTUVfRk9STUFUID0gJ01NL0REL1lZWVkgaDptbSBhJztcbiAgZXhwb3J0IGNvbnN0IEJBUl9PRkZTRVQgPSAyO1xuICBleHBvcnQgY29uc3QgbWFyZ2luID0geyB0b3A6IDEwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA5MCB9O1xuICBleHBvcnQgbGV0IHdpZHRoID0gQ0hBUlRfV0lEVEggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodDtcblxuICAvKipcbiAgICogQG5nZG9jIGRpcmVjdGl2ZVxuICAgKiBAbmFtZSBoYXdrdWxhckNoYXJ0XG4gICAqIEBkZXNjcmlwdGlvbiBBIGQzIGJhc2VkIGNoYXJ0aW5nIGRpcmVjdGlvbiB0byBwcm92aWRlIGNoYXJ0aW5nIHVzaW5nIHZhcmlvdXMgc3R5bGVzIG9mIGNoYXJ0cy5cbiAgICpcbiAgICovXG4gIGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKVxuICAgIC5kaXJlY3RpdmUoJ2hhd2t1bGFyQ2hhcnQnLCBbJyRyb290U2NvcGUnLCAnJGh0dHAnLCAnJGludGVydmFsJywgJyRsb2cnLFxuICAgICAgZnVuY3Rpb24oJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UsXG4gICAgICAgICRodHRwOiBuZy5JSHR0cFNlcnZpY2UsXG4gICAgICAgICRpbnRlcnZhbDogbmcuSUludGVydmFsU2VydmljZSxcbiAgICAgICAgJGxvZzogbmcuSUxvZ1NlcnZpY2UpOiBuZy5JRGlyZWN0aXZlIHtcblxuICAgICAgICBmdW5jdGlvbiBsaW5rKHNjb3BlLCBlbGVtZW50LCBhdHRycykge1xuXG4gICAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgICAgbGV0IGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdID0gW10sXG4gICAgICAgICAgICBtdWx0aURhdGFQb2ludHM6IElNdWx0aURhdGFQb2ludFtdLFxuICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzOiBJU2ltcGxlTWV0cmljW10sXG4gICAgICAgICAgICBkYXRhVXJsID0gYXR0cnMubWV0cmljVXJsLFxuICAgICAgICAgICAgbWV0cmljSWQgPSBhdHRycy5tZXRyaWNJZCB8fCAnJyxcbiAgICAgICAgICAgIG1ldHJpY1RlbmFudElkID0gYXR0cnMubWV0cmljVGVuYW50SWQgfHwgJycsXG4gICAgICAgICAgICBtZXRyaWNUeXBlID0gYXR0cnMubWV0cmljVHlwZSB8fCAnZ2F1Z2UnLFxuICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzID0gK2F0dHJzLnRpbWVSYW5nZUluU2Vjb25kcyB8fCA0MzIwMCxcbiAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyA9ICthdHRycy5yZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgfHwgMzYwMCxcbiAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSArYXR0cnMuYWxlcnRWYWx1ZSxcbiAgICAgICAgICAgIGludGVycG9sYXRpb24gPSBhdHRycy5pbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IERhdGUubm93KCksXG4gICAgICAgICAgICBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gZW5kVGltZXN0YW1wIC0gdGltZVJhbmdlSW5TZWNvbmRzLFxuICAgICAgICAgICAgcHJldmlvdXNSYW5nZURhdGFQb2ludHMgPSBbXSxcbiAgICAgICAgICAgIGFubm90YXRpb25EYXRhID0gW10sXG4gICAgICAgICAgICBjaGFydFR5cGUgPSBhdHRycy5jaGFydFR5cGUgfHwgJ2xpbmUnLFxuICAgICAgICAgICAgc2luZ2xlVmFsdWVMYWJlbCA9IGF0dHJzLnNpbmdsZVZhbHVlTGFiZWwgfHwgJ1JhdyBWYWx1ZScsXG4gICAgICAgICAgICBub0RhdGFMYWJlbCA9IGF0dHJzLm5vRGF0YUxhYmVsIHx8ICdObyBEYXRhJyxcbiAgICAgICAgICAgIGR1cmF0aW9uTGFiZWwgPSBhdHRycy5kdXJhdGlvbkxhYmVsIHx8ICdJbnRlcnZhbCcsXG4gICAgICAgICAgICBtaW5MYWJlbCA9IGF0dHJzLm1pbkxhYmVsIHx8ICdNaW4nLFxuICAgICAgICAgICAgbWF4TGFiZWwgPSBhdHRycy5tYXhMYWJlbCB8fCAnTWF4JyxcbiAgICAgICAgICAgIGF2Z0xhYmVsID0gYXR0cnMuYXZnTGFiZWwgfHwgJ0F2ZycsXG4gICAgICAgICAgICB0aW1lc3RhbXBMYWJlbCA9IGF0dHJzLnRpbWVzdGFtcExhYmVsIHx8ICdUaW1lc3RhbXAnLFxuICAgICAgICAgICAgc2hvd0F2Z0xpbmUgPSB0cnVlLFxuICAgICAgICAgICAgc2hvd0RhdGFQb2ludHMgPSBmYWxzZSxcbiAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzID0gZmFsc2UsXG4gICAgICAgICAgICB1c2VaZXJvTWluVmFsdWUgPSBmYWxzZTtcblxuICAgICAgICAgIC8vIGNoYXJ0IHNwZWNpZmljIHZhcnNcblxuICAgICAgICAgIGxldCBhZGp1c3RlZENoYXJ0SGVpZ2h0ID0gQ0hBUlRfSEVJR0hUIC0gNTAsXG4gICAgICAgICAgICBoZWlnaHQgPSBhZGp1c3RlZENoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgICBzbWFsbENoYXJ0VGhyZXNob2xkSW5QaXhlbHMgPSA2MDAsXG4gICAgICAgICAgICB0aXRsZUhlaWdodCA9IDMwLCB0aXRsZVNwYWNlID0gMTAsXG4gICAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCAtIHRpdGxlSGVpZ2h0IC0gdGl0bGVTcGFjZSArIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgICBhZGp1c3RlZENoYXJ0SGVpZ2h0MiA9ICt0aXRsZUhlaWdodCArIHRpdGxlU3BhY2UgKyBtYXJnaW4udG9wLFxuICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgeUF4aXMsXG4gICAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICAgIHRpcCxcbiAgICAgICAgICAgIGJydXNoLFxuICAgICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgICBzdmcsXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluLFxuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgIHBlYWssXG4gICAgICAgICAgICBtaW4sXG4gICAgICAgICAgICBwcm9jZXNzZWROZXdEYXRhLFxuICAgICAgICAgICAgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGE7XG5cbiAgICAgICAgICBsZXQgaGFzSW5pdCA9IGZhbHNlO1xuXG4gICAgICAgICAgZGF0YVBvaW50cyA9IGF0dHJzLmRhdGE7XG4gICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gYXR0cnMuZm9yZWNhc3REYXRhO1xuICAgICAgICAgIHNob3dEYXRhUG9pbnRzID0gYXR0cnMuc2hvd0RhdGFQb2ludHM7XG4gICAgICAgICAgcHJldmlvdXNSYW5nZURhdGFQb2ludHMgPSBhdHRycy5wcmV2aW91c1JhbmdlRGF0YTtcbiAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IGF0dHJzLmFubm90YXRpb25EYXRhO1xuXG4gICAgICAgICAgbGV0IHN0YXJ0SW50ZXJ2YWxQcm9taXNlO1xuXG4gICAgICAgICAgZnVuY3Rpb24gZ2V0Q2hhcnRXaWR0aCgpOiBudW1iZXIge1xuICAgICAgICAgICAgLy9yZXR1cm4gYW5ndWxhci5lbGVtZW50KCcjJyArIGNoYXJ0Q29udGV4dC5jaGFydEhhbmRsZSkud2lkdGgoKTtcbiAgICAgICAgICAgIHJldHVybiBDSEFSVF9XSURUSDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiB1c2VTbWFsbENoYXJ0cygpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRDaGFydFdpZHRoKCkgPD0gc21hbGxDaGFydFRocmVzaG9sZEluUGl4ZWxzO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGluaXRpYWxpemF0aW9uKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgICBpZiAoY2hhcnQpIHtcbiAgICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaGFydFBhcmVudCA9IGQzLnNlbGVjdChlbGVtZW50WzBdKTtcbiAgICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgICAuYXR0cigndmlld0JveCcsICcwIDAgNzYwICcgKyAoQ0hBUlRfSEVJR0hUICsgWV9BWElTX0hFSUdIVCkpXG4gICAgICAgICAgICAgIC5hdHRyKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ3hNaW5ZTWluIG1lZXQnKTtcblxuICAgICAgICAgICAgY3JlYXRlU3ZnRGVmcyhjaGFydCk7XG5cbiAgICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoICsgbWFyZ2luLmxlZnQgKyBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBpbm5lckNoYXJ0SGVpZ2h0KVxuICAgICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyAoYWRqdXN0ZWRDaGFydEhlaWdodDIpICsgJyknKTtcblxuICAgICAgICAgICAgdGlwID0gZDMudGlwKClcbiAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2QzLXRpcCcpXG4gICAgICAgICAgICAgIC5vZmZzZXQoWy0xMCwgMF0pXG4gICAgICAgICAgICAgIC5odG1sKChkLCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ1aWxkSG92ZXIoZCwgaSk7XG4gICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuXG4gICAgICAgICAgICAvLyBhIHBsYWNlaG9sZGVyIGZvciB0aGUgYWxlcnRzXG4gICAgICAgICAgICBzdmcuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnYWxlcnRIb2xkZXInKTtcblxuICAgICAgICAgICAgaGFzSW5pdCA9IHRydWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gc2V0dXBGaWx0ZXJlZERhdGEoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pOiB2b2lkIHtcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgcGVhayA9IGQzLm1heChkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKSA/IChkLmF2ZyB8fCBkLnZhbHVlKSA6IDA7XG4gICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgICBtaW4gPSBkMy5taW4oZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyAoZC5hdmcgfHwgZC52YWx1ZSkgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vIGxldHMgYWRqdXN0IHRoZSBtaW4gYW5kIG1heCB0byBhZGQgc29tZSB2aXN1YWwgc3BhY2luZyBiZXR3ZWVuIGl0IGFuZCB0aGUgYXhlc1xuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbiA9IHVzZVplcm9NaW5WYWx1ZSA/IDAgOiBtaW4gKiAuOTU7XG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuXG4gICAgICAgICAgICAvLy8gY2hlY2sgaWYgd2UgbmVlZCB0byBhZGp1c3QgaGlnaC9sb3cgYm91bmQgdG8gZml0IGFsZXJ0IHZhbHVlXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSkge1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gTWF0aC5tYXgodmlzdWFsbHlBZGp1c3RlZE1heCwgYWxlcnRWYWx1ZSAqIDEuMik7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSBNYXRoLm1pbih2aXN1YWxseUFkanVzdGVkTWluLCBhbGVydFZhbHVlICogLjk1KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vIHVzZSBkZWZhdWx0IFkgc2NhbGUgaW4gY2FzZSBoaWdoIGFuZCBsb3cgYm91bmQgYXJlIDAgKGllLCBubyB2YWx1ZXMgb3IgYWxsIDApXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gISEhdmlzdWFsbHlBZGp1c3RlZE1heCAmJiAhISF2aXN1YWxseUFkanVzdGVkTWluID8gREVGQVVMVF9ZX1NDQUxFIDpcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVTY2FsZShkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgbGV0IHhUaWNrcywgbnVtYmVyT2ZCYXJzRm9yU21hbGxHcmFwaCA9IDIwO1xuXG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG5cbiAgICAgICAgICAgICAgLy8gaWYgd2luZG93IGlzIHRvbyBzbWFsbCBzZXJ2ZXIgdXAgc21hbGwgY2hhcnRcbiAgICAgICAgICAgICAgaWYgKHVzZVNtYWxsQ2hhcnRzKCkpIHtcbiAgICAgICAgICAgICAgICB3aWR0aCA9IDI1MDtcbiAgICAgICAgICAgICAgICB4VGlja3MgPSAzO1xuICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSA9IGRhdGFQb2ludHMuc2xpY2UoZGF0YVBvaW50cy5sZW5ndGggLSBudW1iZXJPZkJhcnNGb3JTbWFsbEdyYXBoLCBkYXRhUG9pbnRzLmxlbmd0aCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gIHdlIHVzZSB0aGUgd2lkdGggYWxyZWFkeSBkZWZpbmVkIGFib3ZlXG4gICAgICAgICAgICAgICAgeFRpY2tzID0gOTtcbiAgICAgICAgICAgICAgICBjaGFydERhdGEgPSBkYXRhUG9pbnRzO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgc2V0dXBGaWx0ZXJlZERhdGEoZGF0YVBvaW50cyk7XG5cbiAgICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbaGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt2aXN1YWxseUFkanVzdGVkTWluLCB2aXN1YWxseUFkanVzdGVkTWF4XSk7XG5cbiAgICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAudGlja3MoNSlcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgICAgbGV0IHRpbWVTY2FsZU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgIGxldCB0aW1lU2NhbGVNYXg7XG4gICAgICAgICAgICAgIGlmIChmb3JlY2FzdERhdGFQb2ludHMgJiYgZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBmb3JlY2FzdERhdGFQb2ludHNbZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBkMy5tYXgoZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoXSlcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt0aW1lU2NhbGVNaW4sIHRpbWVTY2FsZU1heF0pO1xuXG4gICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBzZXR1cEZpbHRlcmVkTXVsdGlEYXRhKG11bHRpRGF0YVBvaW50czogSU11bHRpRGF0YVBvaW50W10pOiBhbnkge1xuICAgICAgICAgICAgbGV0IGFsZXJ0UGVhazogbnVtYmVyLFxuICAgICAgICAgICAgICBoaWdoUGVhazogbnVtYmVyO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKSB7XG4gICAgICAgICAgICAgIGxldCBjdXJyZW50TWF4OiBudW1iZXIsXG4gICAgICAgICAgICAgICAgY3VycmVudE1pbjogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlcmllc01heDogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlcmllc01pbjogbnVtYmVyLFxuICAgICAgICAgICAgICAgIG1heExpc3Q6IG51bWJlcltdID0gW10sXG4gICAgICAgICAgICAgICAgbWluTGlzdDogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMuZm9yRWFjaCgoc2VyaWVzKSA9PiB7XG4gICAgICAgICAgICAgICAgY3VycmVudE1heCA9IGQzLm1heChzZXJpZXMudmFsdWVzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogZC5hdmc7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIG1heExpc3QucHVzaChjdXJyZW50TWF4KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50TWluID0gZDMubWluKHNlcmllcy52YWx1ZXMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyBkLmF2ZyA6IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIG1pbkxpc3QucHVzaChjdXJyZW50TWluKTtcblxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgc2VyaWVzTWF4ID0gZDMubWF4KG1heExpc3QpO1xuICAgICAgICAgICAgICBzZXJpZXNNaW4gPSBkMy5taW4obWluTGlzdCk7XG4gICAgICAgICAgICAgIHJldHVybiBbc2VyaWVzTWluLCBzZXJpZXNNYXhdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBtaW5NYXggPSBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKTtcbiAgICAgICAgICAgIHBlYWsgPSBtaW5NYXhbMV07XG4gICAgICAgICAgICBtaW4gPSBtaW5NYXhbMF07XG5cbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluIC0gKG1pbiAqIDAuMDUpO1xuICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgICAgYWxlcnRQZWFrID0gKGFsZXJ0VmFsdWUgKiAxLjIpO1xuICAgICAgICAgICAgICBoaWdoUGVhayA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IGFsZXJ0UGVhayA+IGhpZ2hQZWFrID8gYWxlcnRQZWFrIDogaGlnaFBlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sICEhIXZpc3VhbGx5QWRqdXN0ZWRNYXggJiYgISEhdmlzdWFsbHlBZGp1c3RlZE1pbiA/IERFRkFVTFRfWV9TQ0FMRSA6XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXhdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZU11bHRpU2NhbGUobXVsdGlEYXRhUG9pbnRzOiBJTXVsdGlEYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgY29uc3QgeFRpY2tzID0gOTtcblxuICAgICAgICAgICAgaWYgKG11bHRpRGF0YVBvaW50cyAmJiBtdWx0aURhdGFQb2ludHNbMF0gJiYgbXVsdGlEYXRhUG9pbnRzWzBdLnZhbHVlcykge1xuXG4gICAgICAgICAgICAgIGxldCBsb3dIaWdoID0gc2V0dXBGaWx0ZXJlZE11bHRpRGF0YShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluID0gbG93SGlnaFswXTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IGxvd0hpZ2hbMV07XG5cbiAgICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbaGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt2aXN1YWxseUFkanVzdGVkTWluLCB2aXN1YWxseUFkanVzdGVkTWF4XSk7XG5cbiAgICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAudGlja3MoNSlcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAgICAgLmRvbWFpbihbZDMubWluKG11bHRpRGF0YVBvaW50cywgKGQpID0+IGQzLm1pbihkLnZhbHVlcywgKHApID0+IHAudGltZXN0YW1wKSksXG4gICAgICAgICAgICAgICAgICBkMy5tYXgobXVsdGlEYXRhUG9pbnRzLCAoZCkgPT4gZDMubWF4KGQudmFsdWVzLCAocCkgPT4gcC50aW1lc3RhbXApKV0pO1xuXG4gICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvKipcbiAgICAgICAgICAgKiBMb2FkIG1ldHJpY3MgZGF0YSBkaXJlY3RseSBmcm9tIGEgcnVubmluZyBIYXdrdWxhci1NZXRyaWNzIHNlcnZlclxuICAgICAgICAgICAqIEBwYXJhbSB1cmxcbiAgICAgICAgICAgKiBAcGFyYW0gbWV0cmljSWRcbiAgICAgICAgICAgKiBAcGFyYW0gc3RhcnRUaW1lc3RhbXBcbiAgICAgICAgICAgKiBAcGFyYW0gZW5kVGltZXN0YW1wXG4gICAgICAgICAgICogQHBhcmFtIGJ1Y2tldHNcbiAgICAgICAgICAgKi9cbiAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UodXJsOiBVcmxUeXBlLFxuICAgICAgICAgICAgbWV0cmljSWQ6IE1ldHJpY0lkLFxuICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgICAgICAgIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgICAgICAgYnVja2V0cyA9IDYwKSB7XG5cbiAgICAgICAgICAgIGxldCByZXF1ZXN0Q29uZmlnOiBuZy5JUmVxdWVzdENvbmZpZyA9IDxhbnk+e1xuICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0hhd2t1bGFyLVRlbmFudCc6IG1ldHJpY1RlbmFudElkXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBlbmQ6IGVuZFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBidWNrZXRzOiBidWNrZXRzXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzdGFydFRpbWVzdGFtcCA+PSBlbmRUaW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgJGxvZy5sb2coJ1N0YXJ0IGRhdGUgd2FzIGFmdGVyIGVuZCBkYXRlJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh1cmwgJiYgbWV0cmljVHlwZSAmJiBtZXRyaWNJZCkge1xuXG4gICAgICAgICAgICAgIGxldCBtZXRyaWNUeXBlQW5kRGF0YSA9IG1ldHJpY1R5cGUuc3BsaXQoJy0nKTtcbiAgICAgICAgICAgICAgLy8vIHNhbXBsZSB1cmw6XG4gICAgICAgICAgICAgIC8vLyBodHRwOi8vbG9jYWxob3N0OjgwODAvaGF3a3VsYXIvbWV0cmljcy9nYXVnZXMvNDViMjI1NmVmZjE5Y2I5ODI1NDJiMTY3YjM5NTcwMzYuc3RhdHVzLmR1cmF0aW9uL2RhdGE/XG4gICAgICAgICAgICAgIC8vIGJ1Y2tldHM9MTIwJmVuZD0xNDM2ODMxNzk3NTMzJnN0YXJ0PTE0MzY4MjgxOTc1MzMnXG4gICAgICAgICAgICAgICRodHRwLmdldCh1cmwgKyAnLycgKyBtZXRyaWNUeXBlQW5kRGF0YVswXSArICdzLycgKyBtZXRyaWNJZCArICcvJyArIChtZXRyaWNUeXBlQW5kRGF0YVsxXSB8fCAnZGF0YScpLFxuICAgICAgICAgICAgICAgIHJlcXVlc3RDb25maWcpLnN1Y2Nlc3MoKHJlc3BvbnNlKSA9PiB7XG5cbiAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG5cbiAgICAgICAgICAgICAgICB9KS5lcnJvcigocmVhc29uLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICRsb2cuZXJyb3IoJ0Vycm9yIExvYWRpbmcgQ2hhcnQgRGF0YTonICsgc3RhdHVzICsgJywgJyArIHJlYXNvbik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvKipcbiAgICAgICAgICAgKiBUcmFuc2Zvcm0gdGhlIHJhdyBodHRwIHJlc3BvbnNlIGZyb20gTWV0cmljcyB0byBvbmUgdXNhYmxlIGluIGNoYXJ0c1xuICAgICAgICAgICAqIEBwYXJhbSByZXNwb25zZVxuICAgICAgICAgICAqIEByZXR1cm5zIHRyYW5zZm9ybWVkIHJlc3BvbnNlIHRvIElDaGFydERhdGFQb2ludFtdLCByZWFkeSB0byBiZSBjaGFydGVkXG4gICAgICAgICAgICovXG4gICAgICAgICAgZnVuY3Rpb24gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChyZXNwb25zZSk6IElDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAgIC8vICBUaGUgc2NoZW1hIGlzIGRpZmZlcmVudCBmb3IgYnVja2V0ZWQgb3V0cHV0XG4gICAgICAgICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6IElDaGFydERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IHBvaW50LnRpbWVzdGFtcCB8fCAocG9pbnQuc3RhcnQgKyAocG9pbnQuZW5kIC0gcG9pbnQuc3RhcnQpIC8gMik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgZGF0ZTogbmV3IERhdGUodGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlOiAhYW5ndWxhci5pc051bWJlcihwb2ludC52YWx1ZSkgPyB1bmRlZmluZWQgOiBwb2ludC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICAgIG1pbjogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWluKSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1pbixcbiAgICAgICAgICAgICAgICAgIG1heDogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWF4KSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1heCxcbiAgICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGJ1aWxkSG92ZXIoZDogSUNoYXJ0RGF0YVBvaW50LCBpOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGxldCBob3ZlcixcbiAgICAgICAgICAgICAgcHJldlRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgY3VycmVudFRpbWVzdGFtcCA9IGQudGltZXN0YW1wLFxuICAgICAgICAgICAgICBiYXJEdXJhdGlvbixcbiAgICAgICAgICAgICAgZm9ybWF0dGVkRGF0ZVRpbWUgPSBtb21lbnQoZC50aW1lc3RhbXApLmZvcm1hdChIT1ZFUl9EQVRFX1RJTUVfRk9STUFUKTtcblxuICAgICAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgICAgIHByZXZUaW1lc3RhbXAgPSBjaGFydERhdGFbaSAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgYmFyRHVyYXRpb24gPSBtb21lbnQoY3VycmVudFRpbWVzdGFtcCkuZnJvbShtb21lbnQocHJldlRpbWVzdGFtcCksIHRydWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNFbXB0eURhdGFQb2ludChkKSkge1xuICAgICAgICAgICAgICAvLyBub2RhdGFcbiAgICAgICAgICAgICAgaG92ZXIgPSBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICAgICAgPHNtYWxsIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7bm9EYXRhTGFiZWx9PC9zbWFsbD5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2R1cmF0aW9uTGFiZWx9PC9zcGFuPjxzcGFuPjpcbiAgICAgICAgICAgICAgICA8L3NwYW4+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+PC9zbWFsbD4gPC9kaXY+XG4gICAgICAgICAgICAgICAgPGhyLz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46XG4gICAgICAgICAgICAgICAgPC9zcGFuPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7Zm9ybWF0dGVkRGF0ZVRpbWV9PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChpc1Jhd01ldHJpYyhkKSkge1xuICAgICAgICAgICAgICAgIC8vIHJhdyBzaW5nbGUgdmFsdWUgZnJvbSByYXcgdGFibGVcbiAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7YmFyRHVyYXRpb259PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgICA8aHIvPlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtzaW5nbGVWYWx1ZUxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZDMucm91bmQoZC52YWx1ZSwgMil9PC9zcGFuPjwvc21hbGw+IDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPC9kaXY+IGA7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gYWdncmVnYXRlIHdpdGggbWluL2F2Zy9tYXhcbiAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtmb3JtYXR0ZWREYXRlVGltZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gYmVmb3JlLXNlcGFyYXRvcic+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21heExhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1heCwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2F2Z0xhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLmF2ZywgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21pbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1pbiwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PiBgO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaG92ZXI7XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVNdWx0aUxpbmVDaGFydChtdWx0aURhdGFQb2ludHM6IElNdWx0aURhdGFQb2ludFtdKSB7XG4gICAgICAgICAgICBsZXQgY29sb3JTY2FsZSA9IGQzLnNjYWxlLmNhdGVnb3J5MTAoKSxcbiAgICAgICAgICAgICAgZyA9IDA7XG5cbiAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgLy8gYmVmb3JlIHVwZGF0aW5nLCBsZXQncyByZW1vdmUgdGhvc2UgbWlzc2luZyBmcm9tIGRhdGFwb2ludHMgKGlmIGFueSlcbiAgICAgICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncGF0aFtpZF49XFwnbXVsdGlMaW5lXFwnXScpWzBdLmZvckVhY2goKGV4aXN0aW5nUGF0aDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHN0aWxsRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICBzaW5nbGVDaGFydERhdGEua2V5SGFzaCA9IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoXG4gICAgICAgICAgICAgICAgICAgIHx8ICgnbXVsdGlMaW5lJyArIGhhc2hTdHJpbmcoc2luZ2xlQ2hhcnREYXRhLmtleSkpO1xuICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nUGF0aC5nZXRBdHRyaWJ1dGUoJ2lkJykgPT09IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0aWxsRXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoIXN0aWxsRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICBleGlzdGluZ1BhdGgucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMuZm9yRWFjaCgoc2luZ2xlQ2hhcnREYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoc2luZ2xlQ2hhcnREYXRhICYmIHNpbmdsZUNoYXJ0RGF0YS52YWx1ZXMpIHtcbiAgICAgICAgICAgICAgICAgIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoID0gc2luZ2xlQ2hhcnREYXRhLmtleUhhc2hcbiAgICAgICAgICAgICAgICAgICAgfHwgKCdtdWx0aUxpbmUnICsgaGFzaFN0cmluZyhzaW5nbGVDaGFydERhdGEua2V5KSk7XG4gICAgICAgICAgICAgICAgICBsZXQgcGF0aE11bHRpTGluZSA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGgjJyArIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKVxuICAgICAgICAgICAgICAgICAgICAuZGF0YShbc2luZ2xlQ2hhcnREYXRhLnZhbHVlc10pO1xuICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgICAgICBwYXRoTXVsdGlMaW5lLmF0dHIoJ2lkJywgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2gpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdtdWx0aUxpbmUnKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignZmlsbCcsICdub25lJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2luZ2xlQ2hhcnREYXRhLmNvbG9yIHx8IGNvbG9yU2NhbGUoZysrKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUxpbmUoJ2xpbmVhcicpKTtcbiAgICAgICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICAgICAgcGF0aE11bHRpTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdpZCcsIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbXVsdGlMaW5lJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnbm9uZScpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgaWYgKHNpbmdsZUNoYXJ0RGF0YS5jb2xvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNpbmdsZUNoYXJ0RGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbG9yU2NhbGUoZysrKTtcbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVMaW5lKCdsaW5lYXInKSk7XG4gICAgICAgICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAkbG9nLndhcm4oJ05vIG11bHRpLWRhdGEgc2V0IGZvciBtdWx0aWxpbmUgY2hhcnQnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVlBeGlzR3JpZExpbmVzKCkge1xuICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSB5IGF4aXMgZ3JpZCBsaW5lc1xuICAgICAgICAgICAgaWYgKHlTY2FsZSkge1xuICAgICAgICAgICAgICBsZXQgeUF4aXMgPSBzdmcuc2VsZWN0QWxsKCdnLmdyaWQueV9ncmlkJyk7XG4gICAgICAgICAgICAgIGlmICgheUF4aXNbMF0ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgeUF4aXMgPSBzdmcuYXBwZW5kKCdnJykuY2xhc3NlZCgnZ3JpZCB5X2dyaWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB5QXhpc1xuICAgICAgICAgICAgICAgIC5jYWxsKGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0JylcbiAgICAgICAgICAgICAgICAgIC50aWNrcygxMClcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSgtd2lkdGgsIDApXG4gICAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCgnJylcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgICAgZnVuY3Rpb24gYXhpc1RyYW5zaXRpb24oc2VsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAuZGVsYXkoMjUwKVxuICAgICAgICAgICAgICAgIC5kdXJhdGlvbig3NTApXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAxLjApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoeUF4aXMpIHtcblxuICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgICAgICAvKiB0c2xpbnQ6ZGlzYWJsZTpuby11bnVzZWQtdmFyaWFibGUgKi9cblxuICAgICAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgICAgIGxldCB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwnICsgaGVpZ2h0ICsgJyknKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgIC5jYWxsKHhBeGlzKVxuICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcblxuICAgICAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgICAgIGxldCB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgLmNhbGwoeUF4aXMpXG4gICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuXG4gICAgICAgICAgICAgIGxldCB5QXhpc0xhYmVsID0gc3ZnLnNlbGVjdEFsbCgnLnlBeGlzVW5pdHNMYWJlbCcpO1xuICAgICAgICAgICAgICBpZiAoeUF4aXNMYWJlbC5lbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgeUF4aXNMYWJlbCA9IHN2Zy5hcHBlbmQoJ3RleHQnKS5hdHRyKCdjbGFzcycsICd5QXhpc1VuaXRzTGFiZWwnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICdyb3RhdGUoLTkwKSx0cmFuc2xhdGUoLTEwLC01MCknKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3gnLCAtQ0hBUlRfSEVJR0hUIC8gMilcbiAgICAgICAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnc3RhcnQnKVxuICAgICAgICAgICAgICAgICAgLnRleHQoYXR0cnMueUF4aXNVbml0cyA9PT0gJ05PTkUnID8gJycgOiBhdHRycy55QXhpc1VuaXRzKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgICAuY2FsbChheGlzVHJhbnNpdGlvbik7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUNlbnRlcmVkTGluZShuZXdJbnRlcnBvbGF0aW9uKSB7XG4gICAgICAgICAgICBsZXQgaW50ZXJwb2xhdGUgPSBuZXdJbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRlKVxuICAgICAgICAgICAgICAgIC5kZWZpbmVkKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAueCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAueSgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlTGluZShuZXdJbnRlcnBvbGF0aW9uKSB7XG4gICAgICAgICAgICBsZXQgaW50ZXJwb2xhdGUgPSBuZXdJbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRlKVxuICAgICAgICAgICAgICAgIC5kZWZpbmVkKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAueCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAueSgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlQXZnTGluZXMoKSB7XG4gICAgICAgICAgICBpZiAoY2hhcnRUeXBlID09PSAnYmFyJyB8fCBjaGFydFR5cGUgPT09ICdzY2F0dGVybGluZScpIHtcbiAgICAgICAgICAgICAgbGV0IHBhdGhBdmdMaW5lID0gc3ZnLnNlbGVjdEFsbCgnLmJhckF2Z0xpbmUnKS5kYXRhKFtjaGFydERhdGFdKTtcbiAgICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmF0dHIoJ2NsYXNzJywgJ2JhckF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlQ2VudGVyZWRMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYmFyQXZnTGluZScpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVDZW50ZXJlZExpbmUoJ21vbm90b25lJykpO1xuICAgICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgICAgcGF0aEF2Z0xpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuc2VsZWN0QWxsKCdnLmJydXNoJyk7XG4gICAgICAgICAgICBpZiAoYnJ1c2hHcm91cC5lbXB0eSgpKSB7XG4gICAgICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnYnJ1c2gnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYnJ1c2ggPSBkMy5zdmcuYnJ1c2goKVxuICAgICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgIC5vbignYnJ1c2hzdGFydCcsIGJydXNoU3RhcnQpXG4gICAgICAgICAgICAgIC5vbignYnJ1c2hlbmQnLCBicnVzaEVuZCk7XG5cbiAgICAgICAgICAgIGJydXNoR3JvdXAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCcucmVzaXplJykuYXBwZW5kKCdwYXRoJyk7XG5cbiAgICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGhlaWdodCk7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCB0cnVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gYnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICAgIGxldCBleHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgICBzdGFydFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFswXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsICFkMy5ldmVudC50YXJnZXQuZW1wdHkoKSk7XG4gICAgICAgICAgICAgIC8vIGlnbm9yZSByYW5nZSBzZWxlY3Rpb25zIGxlc3MgdGhhbiAxIG1pbnV0ZVxuICAgICAgICAgICAgICBpZiAoZHJhZ1NlbGVjdGlvbkRlbHRhID49IDYwMDAwKSB7XG4gICAgICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gW107XG4gICAgICAgICAgICAgICAgc2hvd0ZvcmVjYXN0RGF0YShmb3JlY2FzdERhdGFQb2ludHMpO1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChFdmVudE5hbWVzLkNIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGV4dGVudCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gY2xlYXIgdGhlIGJydXNoIHNlbGVjdGlvblxuICAgICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2guY2xlYXIoKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVQcmV2aW91c1JhbmdlT3ZlcmxheShwcmV2UmFuZ2VEYXRhKSB7XG4gICAgICAgICAgICBpZiAocHJldlJhbmdlRGF0YSkge1xuICAgICAgICAgICAgICBzdmcuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgICAgICAuZGF0dW0ocHJldlJhbmdlRGF0YSlcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAncHJldlJhbmdlQXZnTGluZScpXG4gICAgICAgICAgICAgICAgLnN0eWxlKCdzdHJva2UtZGFzaGFycmF5JywgKCc5LDMnKSlcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUNlbnRlcmVkTGluZSgnbGluZWFyJykpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYW5ub3RhdGVDaGFydChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgaWYgKGFubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJy5hbm5vdGF0aW9uRG90JylcbiAgICAgICAgICAgICAgICAuZGF0YShhbm5vdGF0aW9uRGF0YSlcbiAgICAgICAgICAgICAgICAuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2Fubm90YXRpb25Eb3QnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdyJywgNSlcbiAgICAgICAgICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuYXR0cignY3knLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gaGVpZ2h0IC0geVNjYWxlKHZpc3VhbGx5QWRqdXN0ZWRNYXgpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnN0eWxlKCdmaWxsJywgKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmIChkLnNldmVyaXR5ID09PSAnMScpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkLnNldmVyaXR5ID09PSAnMicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICd5ZWxsb3cnO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICd3aGl0ZSc7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlRm9yZWNhc3RMaW5lKG5ld0ludGVycG9sYXRpb24pIHtcbiAgICAgICAgICAgIGxldCBpbnRlcnBvbGF0ZSA9IG5ld0ludGVycG9sYXRpb24gfHwgJ21vbm90b25lJyxcbiAgICAgICAgICAgICAgbGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGUpXG4gICAgICAgICAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnkoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBsaW5lO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIHNob3dGb3JlY2FzdERhdGEoZm9yZWNhc3REYXRhOiBJU2ltcGxlTWV0cmljW10pIHtcbiAgICAgICAgICAgIGxldCBmb3JlY2FzdFBhdGhMaW5lID0gc3ZnLnNlbGVjdEFsbCgnLmZvcmVjYXN0TGluZScpLmRhdGEoW2ZvcmVjYXN0RGF0YV0pO1xuICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICBmb3JlY2FzdFBhdGhMaW5lLmF0dHIoJ2NsYXNzJywgJ2ZvcmVjYXN0TGluZScpXG4gICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlRm9yZWNhc3RMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgZm9yZWNhc3RQYXRoTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdmb3JlY2FzdExpbmUnKVxuICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUZvcmVjYXN0TGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgIGZvcmVjYXN0UGF0aExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignZGF0YScsIChuZXdEYXRhLCBvbGREYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3RGF0YSB8fCBvbGREYXRhKSB7XG4gICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEgfHwgW10pO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdtdWx0aURhdGEnLCAobmV3TXVsdGlEYXRhLCBvbGRNdWx0aURhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdNdWx0aURhdGEgfHwgb2xkTXVsdGlEYXRhKSB7XG4gICAgICAgICAgICAgIG11bHRpRGF0YVBvaW50cyA9IGFuZ3VsYXIuZnJvbUpzb24obmV3TXVsdGlEYXRhIHx8IFtdKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEsIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgncHJldmlvdXNSYW5nZURhdGEnLCAobmV3UHJldmlvdXNSYW5nZVZhbHVlcykgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld1ByZXZpb3VzUmFuZ2VWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgLy8kbG9nLmRlYnVnKCdQcmV2aW91cyBSYW5nZSBkYXRhIGNoYW5nZWQnKTtcbiAgICAgICAgICAgICAgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEgPSBhbmd1bGFyLmZyb21Kc29uKG5ld1ByZXZpb3VzUmFuZ2VWYWx1ZXMpO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdhbm5vdGF0aW9uRGF0YScsIChuZXdBbm5vdGF0aW9uRGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld0Fubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgIGFubm90YXRpb25EYXRhID0gYW5ndWxhci5mcm9tSnNvbihuZXdBbm5vdGF0aW9uRGF0YSk7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ2ZvcmVjYXN0RGF0YScsIChuZXdGb3JlY2FzdERhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdGb3JlY2FzdERhdGEpIHtcbiAgICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gYW5ndWxhci5mcm9tSnNvbihuZXdGb3JlY2FzdERhdGEpO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydhbGVydFZhbHVlJywgJ2NoYXJ0VHlwZScsICdoaWRlSGlnaExvd1ZhbHVlcycsICd1c2VaZXJvTWluVmFsdWUnLCAnc2hvd0F2Z0xpbmUnXSxcbiAgICAgICAgICAgIChjaGFydEF0dHJzKSA9PiB7XG4gICAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSBjaGFydEF0dHJzWzBdIHx8IGFsZXJ0VmFsdWU7XG4gICAgICAgICAgICAgIGNoYXJ0VHlwZSA9IGNoYXJ0QXR0cnNbMV0gfHwgY2hhcnRUeXBlO1xuICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyA9ICh0eXBlb2YgY2hhcnRBdHRyc1syXSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1syXSA6IGhpZGVIaWdoTG93VmFsdWVzO1xuICAgICAgICAgICAgICB1c2VaZXJvTWluVmFsdWUgPSAodHlwZW9mIGNoYXJ0QXR0cnNbM10gIT09ICd1bmRlZmluZWQnKSA/IGNoYXJ0QXR0cnNbM10gOiB1c2VaZXJvTWluVmFsdWU7XG4gICAgICAgICAgICAgIHNob3dBdmdMaW5lID0gKHR5cGVvZiBjaGFydEF0dHJzWzRdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzRdIDogc2hvd0F2Z0xpbmU7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGxvYWRTdGFuZEFsb25lTWV0cmljc1RpbWVSYW5nZUZyb21Ob3coKSB7XG4gICAgICAgICAgICBlbmRUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSBtb21lbnQoKS5zdWJ0cmFjdCh0aW1lUmFuZ2VJblNlY29uZHMsICdzZWNvbmRzJykudmFsdWVPZigpO1xuICAgICAgICAgICAgbG9hZFN0YW5kQWxvbmVNZXRyaWNzRm9yVGltZVJhbmdlKGRhdGFVcmwsIG1ldHJpY0lkLCBzdGFydFRpbWVzdGFtcCwgZW5kVGltZXN0YW1wLCA2MCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8vIHN0YW5kYWxvbmUgY2hhcnRzIGF0dHJpYnV0ZXNcbiAgICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ21ldHJpY1VybCcsICdtZXRyaWNJZCcsICdtZXRyaWNUeXBlJywgJ21ldHJpY1RlbmFudElkJywgJ3RpbWVSYW5nZUluU2Vjb25kcyddLFxuICAgICAgICAgICAgKHN0YW5kQWxvbmVQYXJhbXMpID0+IHtcbiAgICAgICAgICAgICAgZGF0YVVybCA9IHN0YW5kQWxvbmVQYXJhbXNbMF0gfHwgZGF0YVVybDtcbiAgICAgICAgICAgICAgbWV0cmljSWQgPSBzdGFuZEFsb25lUGFyYW1zWzFdIHx8IG1ldHJpY0lkO1xuICAgICAgICAgICAgICBtZXRyaWNUeXBlID0gc3RhbmRBbG9uZVBhcmFtc1syXSB8fCBtZXRyaWNJZDtcbiAgICAgICAgICAgICAgbWV0cmljVGVuYW50SWQgPSBzdGFuZEFsb25lUGFyYW1zWzNdIHx8IG1ldHJpY1RlbmFudElkO1xuICAgICAgICAgICAgICB0aW1lUmFuZ2VJblNlY29uZHMgPSBzdGFuZEFsb25lUGFyYW1zWzRdIHx8IHRpbWVSYW5nZUluU2Vjb25kcztcbiAgICAgICAgICAgICAgbG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdygpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ3JlZnJlc2hJbnRlcnZhbEluU2Vjb25kcycsIChuZXdSZWZyZXNoSW50ZXJ2YWwpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdSZWZyZXNoSW50ZXJ2YWwpIHtcbiAgICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzID0gK25ld1JlZnJlc2hJbnRlcnZhbDtcbiAgICAgICAgICAgICAgJGludGVydmFsLmNhbmNlbChzdGFydEludGVydmFsUHJvbWlzZSk7XG4gICAgICAgICAgICAgIHN0YXJ0SW50ZXJ2YWxQcm9taXNlID0gJGludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93KCk7XG4gICAgICAgICAgICAgIH0sIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyAqIDEwMDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJG9uKCckZGVzdHJveScsICgpID0+IHtcbiAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc3RhcnRJbnRlcnZhbFByb21pc2UpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJG9uKCdEYXRlUmFuZ2VEcmFnQ2hhbmdlZCcsIChldmVudCwgZXh0ZW50KSA9PiB7XG4gICAgICAgICAgICBzY29wZS4kZW1pdCgnR3JhcGhUaW1lUmFuZ2VDaGFuZ2VkRXZlbnQnLCBleHRlbnQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lQ2hhcnRUeXBlKGNoYXJ0VHlwZTogc3RyaW5nKSB7XG5cbiAgICAgICAgICAgIHN3aXRjaCAoY2hhcnRUeXBlKSB7XG4gICAgICAgICAgICAgIGNhc2UgJ3JocWJhcic6XG4gICAgICAgICAgICAgICAgY3JlYXRlSGlzdG9ncmFtQ2hhcnQoc3ZnLFxuICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICAgICAgdGlwLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXgsXG4gICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ2hpc3RvZ3JhbSc6XG4gICAgICAgICAgICAgICAgY3JlYXRlSGlzdG9ncmFtQ2hhcnQoc3ZnLFxuICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICAgICAgdGlwLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdsaW5lJzpcbiAgICAgICAgICAgICAgICBjcmVhdGVMaW5lQ2hhcnQoc3ZnLFxuICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ2hhd2t1bGFybWV0cmljJzpcbiAgICAgICAgICAgICAgICAkbG9nLmluZm8oJ0RFUFJFQ0FUSU9OIFdBUk5JTkc6IFRoZSBjaGFydCB0eXBlIGhhd2t1bGFybWV0cmljIGhhcyBiZWVuIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUnICtcbiAgICAgICAgICAgICAgICAgICcgcmVtb3ZlZCBpbiBhIGZ1dHVyZScgK1xuICAgICAgICAgICAgICAgICAgJyByZWxlYXNlLiBQbGVhc2UgdXNlIHRoZSBsaW5lIGNoYXJ0IHR5cGUgaW4gaXRzIHBsYWNlJyk7XG4gICAgICAgICAgICAgICAgY3JlYXRlTGluZUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICAgICAgICAgIGludGVycG9sYXRpb24pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdtdWx0aWxpbmUnOlxuICAgICAgICAgICAgICAgIGNyZWF0ZU11bHRpTGluZUNoYXJ0KG11bHRpRGF0YVBvaW50cyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ2FyZWEnOlxuICAgICAgICAgICAgICAgIGNyZWF0ZUFyZWFDaGFydChzdmcsXG4gICAgICAgICAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICBjaGFydERhdGEsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uLFxuICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdzY2F0dGVyJzpcbiAgICAgICAgICAgICAgICBjcmVhdGVTY2F0dGVyQ2hhcnQoc3ZnLFxuICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbixcbiAgICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSAnc2NhdHRlcmxpbmUnOlxuICAgICAgICAgICAgICAgIGNyZWF0ZVNjYXR0ZXJMaW5lQ2hhcnQoc3ZnLFxuICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbixcbiAgICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAkbG9nLndhcm4oJ2NoYXJ0LXR5cGUgaXMgbm90IHZhbGlkLiBNdXN0IGJlIGluJyArXG4gICAgICAgICAgICAgICAgICAnIFtyaHFiYXIsbGluZSxhcmVhLG11bHRpbGluZSxzY2F0dGVyLHNjYXR0ZXJsaW5lLGhpc3RvZ3JhbV0gY2hhcnQgdHlwZTogJyArIGNoYXJ0VHlwZSk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50cywgcHJldmlvdXNSYW5nZURhdGFQb2ludHMpID0+IHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgZGF0YSwgZG9uJ3QgYm90aGVyLi5cbiAgICAgICAgICAgIGlmICghZGF0YVBvaW50cyAmJiAhbXVsdGlEYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRlYnVnKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXAoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgICBjb25zb2xlLnRpbWUoJ2NoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIGlmICghaGFzSW5pdCkge1xuICAgICAgICAgICAgICBpbml0aWFsaXphdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgZGV0ZXJtaW5lU2NhbGUoZGF0YVBvaW50cyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgZGV0ZXJtaW5lTXVsdGlTY2FsZShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+IHZpc3VhbGx5QWRqdXN0ZWRNaW4gJiYgYWxlcnRWYWx1ZSA8IHZpc3VhbGx5QWRqdXN0ZWRNYXgpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGFsZXJ0Qm91bmRzOiBBbGVydEJvdW5kW10gPSBleHRyYWN0QWxlcnRSYW5nZXMoY2hhcnREYXRhLCBhbGVydFZhbHVlKTtcbiAgICAgICAgICAgICAgY3JlYXRlQWxlcnRCb3VuZHNBcmVhKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIHZpc3VhbGx5QWRqdXN0ZWRNYXgsIGFsZXJ0Qm91bmRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNyZWF0ZVhBeGlzQnJ1c2goKTtcblxuICAgICAgICAgICAgY3JlYXRlWUF4aXNHcmlkTGluZXMoKTtcbiAgICAgICAgICAgIGRldGVybWluZUNoYXJ0VHlwZShjaGFydFR5cGUpO1xuICAgICAgICAgICAgaWYgKHNob3dEYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgIGNyZWF0ZURhdGFQb2ludHMoc3ZnLCB0aW1lU2NhbGUsIHlTY2FsZSwgdGlwLCBjaGFydERhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY3JlYXRlUHJldmlvdXNSYW5nZU92ZXJsYXkocHJldmlvdXNSYW5nZURhdGFQb2ludHMpO1xuICAgICAgICAgICAgY3JlYXRlWGFuZFlBeGVzKCk7XG4gICAgICAgICAgICBpZiAoc2hvd0F2Z0xpbmUpIHtcbiAgICAgICAgICAgICAgY3JlYXRlQXZnTGluZXMoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUgJiYgKGFsZXJ0VmFsdWUgPiB2aXN1YWxseUFkanVzdGVkTWluICYmIGFsZXJ0VmFsdWUgPCB2aXN1YWxseUFkanVzdGVkTWF4KSkge1xuICAgICAgICAgICAgICAvLy8gTk9URTogdGhpcyBhbGVydCBsaW5lIGhhcyBoaWdoZXIgcHJlY2VkZW5jZSBmcm9tIGFsZXJ0IGFyZWEgYWJvdmVcbiAgICAgICAgICAgICAgY3JlYXRlQWxlcnRMaW5lKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIGNoYXJ0RGF0YSwgYWxlcnRWYWx1ZSwgJ2FsZXJ0TGluZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgICAgYW5ub3RhdGVDaGFydChhbm5vdGF0aW9uRGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZm9yZWNhc3REYXRhUG9pbnRzICYmIGZvcmVjYXN0RGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHNob3dGb3JlY2FzdERhdGEoZm9yZWNhc3REYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICBjb25zb2xlLnRpbWVFbmQoJ2NoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGxpbms6IGxpbmssXG4gICAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgICByZXBsYWNlOiB0cnVlLFxuICAgICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICBkYXRhOiAnPScsXG4gICAgICAgICAgICBtdWx0aURhdGE6ICc9JyxcbiAgICAgICAgICAgIGZvcmVjYXN0RGF0YTogJz0nLFxuICAgICAgICAgICAgbWV0cmljVXJsOiAnQCcsXG4gICAgICAgICAgICBtZXRyaWNJZDogJ0AnLFxuICAgICAgICAgICAgbWV0cmljVHlwZTogJ0AnLFxuICAgICAgICAgICAgbWV0cmljVGVuYW50SWQ6ICdAJyxcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgICAgICAgIHRpbWVSYW5nZUluU2Vjb25kczogJ0AnLFxuICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzOiAnQCcsXG4gICAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YTogJ0AnLFxuICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGE6ICdAJyxcbiAgICAgICAgICAgIHNob3dEYXRhUG9pbnRzOiAnPScsXG4gICAgICAgICAgICBhbGVydFZhbHVlOiAnQCcsXG4gICAgICAgICAgICBpbnRlcnBvbGF0aW9uOiAnQCcsXG4gICAgICAgICAgICBjaGFydFR5cGU6ICdAJyxcbiAgICAgICAgICAgIHlBeGlzVW5pdHM6ICdAJyxcbiAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZTogJz0nLFxuICAgICAgICAgICAgY2hhcnRIb3ZlckRhdGVGb3JtYXQ6ICdAJyxcbiAgICAgICAgICAgIGNoYXJ0SG92ZXJUaW1lRm9ybWF0OiAnQCcsXG4gICAgICAgICAgICBzaW5nbGVWYWx1ZUxhYmVsOiAnQCcsXG4gICAgICAgICAgICBub0RhdGFMYWJlbDogJ0AnLFxuICAgICAgICAgICAgZHVyYXRpb25MYWJlbDogJ0AnLFxuICAgICAgICAgICAgbWluTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIG1heExhYmVsOiAnQCcsXG4gICAgICAgICAgICBhdmdMYWJlbDogJ0AnLFxuICAgICAgICAgICAgdGltZXN0YW1wTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIHNob3dBdmdMaW5lOiAnPScsXG4gICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlczogJz0nXG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgXVxuICAgIClcbiAgICA7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBjb25zdCBZX0FYSVNfSEVJR0hUID0gMTU7XG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cbiAgZXhwb3J0IGNsYXNzIFNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlIHtcblxuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9XSURUSCA9IDMwMDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfSEVJR0hUID0gODA7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgcHVibGljIHNjb3BlID0ge1xuICAgICAgZGF0YTogJz0nLFxuICAgICAgc2hvd1lBeGlzVmFsdWVzOiAnPScsXG4gICAgICBzaG93WEF4aXNWYWx1ZXM6ICc9JyxcbiAgICAgIGFsZXJ0VmFsdWU6ICdAJyxcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6IChzY29wZTogYW55LCBlbGVtZW50OiBuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczogYW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdO1xuXG4gICAgY29uc3RydWN0b3IoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpIHtcblxuICAgICAgdGhpcy5saW5rID0gKHNjb3BlLCBlbGVtZW50LCBhdHRycykgPT4ge1xuXG4gICAgICAgIGNvbnN0IG1hcmdpbiA9IHsgdG9wOiAxMCwgcmlnaHQ6IDUsIGJvdHRvbTogNSwgbGVmdDogNDUgfTtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IGNoYXJ0SGVpZ2h0ID0gU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVCxcbiAgICAgICAgICB3aWR0aCA9IFNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLl9DSEFSVF9XSURUSCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0LFxuICAgICAgICAgIGhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AsXG4gICAgICAgICAgc2hvd1hBeGlzVmFsdWVzOiBib29sZWFuLFxuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlczogYm9vbGVhbixcbiAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgeUF4aXMsXG4gICAgICAgICAgeUF4aXNHcm91cCxcbiAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgeEF4aXMsXG4gICAgICAgICAgeEF4aXNHcm91cCxcbiAgICAgICAgICBjaGFydCxcbiAgICAgICAgICBjaGFydFBhcmVudCxcbiAgICAgICAgICBzdmcsXG4gICAgICAgICAgYWxlcnRWYWx1ZTtcblxuICAgICAgICBpZiAodHlwZW9mIGF0dHJzLmFsZXJ0VmFsdWUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgYWxlcnRWYWx1ZSA9ICthdHRycy5hbGVydFZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhdHRycy5zaG93WEF4aXNWYWx1ZXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgc2hvd1hBeGlzVmFsdWVzID0gYXR0cnMuc2hvd1hBeGlzVmFsdWVzID09PSAndHJ1ZSc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGF0dHJzLnNob3dZQXhpc1ZhbHVlcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBzaG93WUF4aXNWYWx1ZXMgPSBhdHRycy5zaG93WUF4aXNWYWx1ZXMgPT09ICd0cnVlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNldHVwKCk6IHZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgd2lkdGggKyBtYXJnaW4ubGVmdCArIG1hcmdpbi5yaWdodClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBpbm5lckNoYXJ0SGVpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ3ZpZXdCb3gnLCAnMCAwICcgKyAod2lkdGggKyBtYXJnaW4ubGVmdCArIG1hcmdpbi5yaWdodCkgKyAnICcgKyAoaGVpZ2h0ICsgbWFyZ2luLnRvcCArXG4gICAgICAgICAgICAgIG1hcmdpbi5ib3R0b20gKyBZX0FYSVNfSEVJR0hUKSlcbiAgICAgICAgICAgIC5hdHRyKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ3hNaW5ZTWluIG1lZXQnKTtcblxuICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyBtYXJnaW4udG9wICsgJyknKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NwYXJrbGluZScpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVTcGFya2xpbmVDaGFydChkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkge1xuXG4gICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoIC0gMTBdKVxuICAgICAgICAgICAgLm5pY2UoKVxuICAgICAgICAgICAgLmRvbWFpbihbZGF0YVBvaW50c1swXS50aW1lc3RhbXAsIGRhdGFQb2ludHNbZGF0YVBvaW50cy5sZW5ndGggLSAxXS50aW1lc3RhbXBdKTtcblxuICAgICAgICAgIGxldCBudW1iZXJPZlhUaWNrcyA9IHNob3dYQXhpc1ZhbHVlcyA/IDIgOiAwO1xuXG4gICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgLnRpY2tzKG51bWJlck9mWFRpY2tzKVxuICAgICAgICAgICAgLnRpY2tTaXplKDQsIDApXG4gICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAub3JpZW50KCdib3R0b20nKTtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgbGV0IHlNaW4gPSBkMy5taW4oZGF0YVBvaW50cywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgeU1heCA9IGQzLm1heChkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gZ2l2ZSBhIHBhZCBvZiAlIHRvIG1pbi9tYXggc28gd2UgYXJlIG5vdCBhZ2FpbnN0IHgtYXhpc1xuICAgICAgICAgIHlNYXggPSB5TWF4ICsgKHlNYXggKiAwLjAzKTtcbiAgICAgICAgICB5TWluID0geU1pbiAtICh5TWluICogMC4wNSk7XG5cbiAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgLnJhbmdlUm91bmQoW1NwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLl9DSEFSVF9IRUlHSFQgLSBZX0FYSVNfSEVJR0hULCAwXSlcbiAgICAgICAgICAgIC5kb21haW4oW3lNaW4sIHlNYXhdKTtcblxuICAgICAgICAgIGxldCBudW1iZXJPZllUaWNrcyA9IHNob3dZQXhpc1ZhbHVlcyA/IDIgOiAwO1xuXG4gICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgLnRpY2tzKG51bWJlck9mWVRpY2tzKVxuICAgICAgICAgICAgLnRpY2tTaXplKDMsIDApXG4gICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICBsZXQgaW50ZXJwb2xhdGlvblR5cGUgPSAnYmFzaXMnO1xuICAgICAgICAgIGxldCBhcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRpb25UeXBlKVxuICAgICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gIWQuZW1wdHk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVCAtIFlfQVhJU19IRUlHSFQ7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkxKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIHRoaXMgaXMgdGhlIGxpbmUgdGhhdCBjYXBzIHRoZSBhcmVhXG4gICAgICAgICAgbGV0IHNwYXJrbGluZUxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvblR5cGUpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAhZC5lbXB0eTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgLy8gLTIgcGl4ZWxzIHRvIGtlZXAgdGhlIDIgcGl4ZWwgbGluZSBmcm9tIGNyb3NzaW5nIG92ZXIgdGhlIHgtYXhpc1xuICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKSAtIDI7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBwYXRoU3BhcmtsaW5lTGluZSA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGguc3BhcmtsaW5lTGluZScpXG4gICAgICAgICAgICAuZGF0YShbZGF0YVBvaW50c10pO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgcGF0aFNwYXJrbGluZUxpbmUuYXR0cignY2xhc3MnLCAnc3BhcmtsaW5lTGluZScpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuYXR0cignZCcsIHNwYXJrbGluZUxpbmUpO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgcGF0aFNwYXJrbGluZUxpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NwYXJrbGluZUxpbmUnKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBzcGFya2xpbmVMaW5lKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIHBhdGhTcGFya2xpbmVMaW5lLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIGxldCBzcGFya2xpbmVBcmVhID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnc3BhcmtsaW5lJyk7XG5cbiAgICAgICAgICBzcGFya2xpbmVBcmVhLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuZGF0dW0oZGF0YVBvaW50cylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5kdXJhdGlvbig1MDApXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnc3BhcmtsaW5lQXJlYScpXG4gICAgICAgICAgICAuYXR0cignZCcsIGFyZWEpO1xuXG4gICAgICAgICAgLy9pZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+PSB5TWluICYmIGFsZXJ0VmFsdWUgPD0geU1heCkpIHtcbiAgICAgICAgICAvLyAgbGV0IGFsZXJ0Qm91bmRzOiBBbGVydEJvdW5kW10gPSBleHRyYWN0QWxlcnRSYW5nZXMoZGF0YVBvaW50cywgYWxlcnRWYWx1ZSk7XG4gICAgICAgICAgLy8gIGNyZWF0ZUFsZXJ0Qm91bmRzQXJlYShzdmcsdGltZVNjYWxlLCB5U2NhbGUseU1heCwgYWxlcnRCb3VuZHMpO1xuICAgICAgICAgIC8vfVxuXG4gICAgICAgICAgLy8gcGxhY2UgdGhlIHggYW5kIHkgYXhlcyBhYm92ZSB0aGUgY2hhcnRcbiAgICAgICAgICB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcblxuICAgICAgICAgIHhBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd4IGF4aXMnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwnICsgaGVpZ2h0ICsgJyknKVxuICAgICAgICAgICAgLmNhbGwoeEF4aXMpO1xuXG4gICAgICAgICAgaWYgKGFsZXJ0VmFsdWUgJiYgKGFsZXJ0VmFsdWUgPj0geU1pbiAmJiBhbGVydFZhbHVlIDw9IHlNYXgpKSB7XG4gICAgICAgICAgICAvLy8gTk9URTogdGhpcyBhbGVydCBsaW5lIGhhcyBoaWdoZXIgcHJlY2VkZW5jZSBmcm9tIGFsZXJ0IGFyZWEgYWJvdmVcbiAgICAgICAgICAgIGNyZWF0ZUFsZXJ0TGluZShzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCBkYXRhUG9pbnRzLCBhbGVydFZhbHVlLCAnc3BhcmtsaW5lQWxlcnRMaW5lJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignZGF0YScsIChuZXdEYXRhKSA9PiB7XG4gICAgICAgICAgaWYgKG5ld0RhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVBvaW50cyA9IGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQoYW5ndWxhci5mcm9tSnNvbihuZXdEYXRhKSk7XG4gICAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy5kYXRhUG9pbnRzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2FsZXJ0VmFsdWUnLCAobmV3QWxlcnRWYWx1ZSkgPT4ge1xuICAgICAgICAgIGlmIChuZXdBbGVydFZhbHVlKSB7XG4gICAgICAgICAgICBhbGVydFZhbHVlID0gbmV3QWxlcnRWYWx1ZTtcbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMuZGF0YVBvaW50cyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBmdW5jdGlvbiBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTogSUNoYXJ0RGF0YVBvaW50W10ge1xuICAgICAgICAgIC8vICBUaGUgc2NoZW1hIGlzIGRpZmZlcmVudCBmb3IgYnVja2V0ZWQgb3V0cHV0XG4gICAgICAgICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UubWFwKChwb2ludDogSUNoYXJ0RGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIGxldCB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IHBvaW50LnRpbWVzdGFtcCB8fCAocG9pbnQuc3RhcnQgKyAocG9pbnQuZW5kIC0gcG9pbnQuc3RhcnQpIC8gMik7XG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiB0aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgLy9kYXRlOiBuZXcgRGF0ZSh0aW1lc3RhbXApLFxuICAgICAgICAgICAgICAgIHZhbHVlOiAhYW5ndWxhci5pc051bWJlcihwb2ludC52YWx1ZSkgPyB1bmRlZmluZWQgOiBwb2ludC52YWx1ZSxcbiAgICAgICAgICAgICAgICBhdmc6IChwb2ludC5lbXB0eSkgPyB1bmRlZmluZWQgOiBwb2ludC5hdmcsXG4gICAgICAgICAgICAgICAgbWluOiAhYW5ndWxhci5pc051bWJlcihwb2ludC5taW4pID8gdW5kZWZpbmVkIDogcG9pbnQubWluLFxuICAgICAgICAgICAgICAgIG1heDogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWF4KSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1heCxcbiAgICAgICAgICAgICAgICBlbXB0eTogcG9pbnQuZW1wdHlcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLnJlbmRlciA9IChkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkgPT4ge1xuICAgICAgICAgIGlmIChkYXRhUG9pbnRzICYmIGRhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy9jb25zb2xlLmdyb3VwKCdSZW5kZXIgU3BhcmtsaW5lIENoYXJ0Jyk7XG4gICAgICAgICAgICAvL2NvbnNvbGUudGltZSgnU3BhcmtsaW5lQ2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgIC8vL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIHNldHVwKCk7XG4gICAgICAgICAgICBjcmVhdGVTcGFya2xpbmVDaGFydChkYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIC8vY29uc29sZS50aW1lRW5kKCdTcGFya2xpbmVDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgLy9jb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3RhdGljIEZhY3RvcnkoKSB7XG4gICAgICBsZXQgZGlyZWN0aXZlID0gKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUoJHJvb3RTY29wZSk7XG4gICAgICB9O1xuXG4gICAgICBkaXJlY3RpdmVbJyRpbmplY3QnXSA9IFsnJHJvb3RTY29wZSddO1xuXG4gICAgICByZXR1cm4gZGlyZWN0aXZlO1xuICAgIH1cblxuICB9XG5cbiAgX21vZHVsZS5kaXJlY3RpdmUoJ2hhd2t1bGFyU3BhcmtsaW5lQ2hhcnQnLCBTcGFya2xpbmVDaGFydERpcmVjdGl2ZS5GYWN0b3J5KCkpO1xufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvLyBUeXBlIHZhbHVlcyBhbmQgSUQgdHlwZXNcbiAgZXhwb3J0IHR5cGUgQWxlcnRUaHJlc2hvbGQgPSBudW1iZXI7XG4gIGV4cG9ydCB0eXBlIFRpbWVJbk1pbGxpcyA9IG51bWJlcjtcbiAgZXhwb3J0IHR5cGUgVXJsVHlwZSA9IG51bWJlcjtcbiAgZXhwb3J0IHR5cGUgTWV0cmljSWQgPSBzdHJpbmc7XG4gIGV4cG9ydCB0eXBlIE1ldHJpY1ZhbHVlID0gbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBNZXRyaWNzIFJlc3BvbnNlIGZyb20gSGF3a3VsYXIgTWV0cmljc1xuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJTWV0cmljc1Jlc3BvbnNlRGF0YVBvaW50IHtcbiAgICBzdGFydDogVGltZUluTWlsbGlzO1xuICAgIGVuZDogVGltZUluTWlsbGlzO1xuICAgIHZhbHVlPzogTWV0cmljVmFsdWU7IC8vLyBPbmx5IGZvciBSYXcgZGF0YSAobm8gYnVja2V0cyBvciBhZ2dyZWdhdGVzKVxuICAgIGF2Zz86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBtaW4/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgbWF4PzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIG1lZGlhbj86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBwZXJjZW50aWxlOTV0aD86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBlbXB0eTogYm9vbGVhbjtcbiAgfVxuXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZU1ldHJpYyB7XG4gICAgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU6IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgZXhwb3J0IGludGVyZmFjZSBJQmFzZUNoYXJ0RGF0YVBvaW50IHtcbiAgICB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcztcbiAgICBzdGFydD86IFRpbWVJbk1pbGxpcztcbiAgICBlbmQ/OiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnOiBNZXRyaWNWYWx1ZTsgLy8vIG1vc3Qgb2YgdGhlIHRpbWUgdGhpcyBpcyB0aGUgdXNlZnVsIHZhbHVlIGZvciBhZ2dyZWdhdGVzXG4gICAgZW1wdHk6IGJvb2xlYW47IC8vLyB3aWxsIHNob3cgdXAgaW4gdGhlIGNoYXJ0IGFzIGJsYW5rIC0gc2V0IHRoaXMgd2hlbiB5b3UgaGF2ZSBOYU5cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXByZXNlbnRhdGlvbiBvZiBkYXRhIHJlYWR5IHRvIGJlIGNvbnN1bWVkIGJ5IGNoYXJ0cy5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSUNoYXJ0RGF0YVBvaW50IGV4dGVuZHMgSUJhc2VDaGFydERhdGFQb2ludCB7XG4gICAgZGF0ZT86IERhdGU7XG4gICAgbWluOiBNZXRyaWNWYWx1ZTtcbiAgICBtYXg6IE1ldHJpY1ZhbHVlO1xuICAgIHBlcmNlbnRpbGU5NXRoOiBNZXRyaWNWYWx1ZTtcbiAgICBtZWRpYW46IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgLyoqXG4gICAqIERhdGEgc3RydWN0dXJlIGZvciBhIE11bHRpLU1ldHJpYyBjaGFydC4gQ29tcG9zZWQgb2YgSUNoYXJ0RGF0YURhdGFQb2ludFtdLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJTXVsdGlEYXRhUG9pbnQge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGtleUhhc2g/OiBzdHJpbmc7IC8vIGZvciB1c2luZyBhcyB2YWxpZCBodG1sIGlkXG4gICAgY29sb3I/OiBzdHJpbmc7IC8vLyAjZmZmZWVlXG4gICAgdmFsdWVzOiBJQ2hhcnREYXRhUG9pbnRbXTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8qIHRzbGludDpkaXNhYmxlOm5vLWJpdHdpc2UgKi9cblxuICBleHBvcnQgZnVuY3Rpb24gY2FsY0JhcldpZHRoKHdpZHRoOiBudW1iZXIsIGxlbmd0aDogbnVtYmVyLCBiYXJPZmZzZXQgPSBCQVJfT0ZGU0VUKSB7XG4gICAgcmV0dXJuICh3aWR0aCAvIGxlbmd0aCAtIGJhck9mZnNldCk7XG4gIH1cblxuICAvLyBDYWxjdWxhdGVzIHRoZSBiYXIgd2lkdGggYWRqdXN0ZWQgc28gdGhhdCB0aGUgZmlyc3QgYW5kIGxhc3QgYXJlIGhhbGYtd2lkdGggb2YgdGhlIG90aGVyc1xuICAvLyBzZWUgaHR0cHM6Ly9pc3N1ZXMuamJvc3Mub3JnL2Jyb3dzZS9IQVdLVUxBUi04MDkgZm9yIGluZm8gb24gd2h5IHRoaXMgaXMgbmVlZGVkXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBsZW5ndGg6IG51bWJlcikge1xuICAgIHJldHVybiAoaSA9PT0gMCB8fCBpID09PSBsZW5ndGggLSAxKSA/IGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKSAvIDIgOlxuICAgICAgY2FsY0JhcldpZHRoKHdpZHRoLCBsZW5ndGgsIEJBUl9PRkZTRVQpO1xuICB9XG5cbiAgLy8gQ2FsY3VsYXRlcyB0aGUgYmFyIFggcG9zaXRpb24uIFdoZW4gdXNpbmcgY2FsY0JhcldpZHRoQWRqdXN0ZWQsIGl0IGlzIHJlcXVpcmVkIHRvIHB1c2ggYmFyc1xuICAvLyBvdGhlciB0aGFuIHRoZSBmaXJzdCBoYWxmIGJhciB0byB0aGUgbGVmdCwgdG8gbWFrZSB1cCBmb3IgdGhlIGZpcnN0IGJlaW5nIGp1c3QgaGFsZiB3aWR0aFxuICBleHBvcnQgZnVuY3Rpb24gY2FsY0JhclhQb3MoZCwgaSwgdGltZVNjYWxlOiBhbnksIGxlbmd0aDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCkgLSAoaSA9PT0gMCA/IDAgOiBjYWxjQmFyV2lkdGgod2lkdGgsIGxlbmd0aCwgQkFSX09GRlNFVCkgLyAyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBbiBlbXB0eSBkYXRhcG9pbnQgaGFzICdlbXB0eScgYXR0cmlidXRlIHNldCB0byB0cnVlLiBVc2VkIHRvIGRpc3Rpbmd1aXNoIGZyb20gcmVhbCAwIHZhbHVlcy5cbiAgICogQHBhcmFtIGRcbiAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAqL1xuICBleHBvcnQgZnVuY3Rpb24gaXNFbXB0eURhdGFQb2ludChkOiBJQ2hhcnREYXRhUG9pbnQpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZC5lbXB0eTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSYXcgbWV0cmljcyBoYXZlIGEgJ3ZhbHVlJyBzZXQgaW5zdGVhZCBvZiBhdmcvbWluL21heCBvZiBhZ2dyZWdhdGVzXG4gICAqIEBwYXJhbSBkXG4gICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgKi9cbiAgZXhwb3J0IGZ1bmN0aW9uIGlzUmF3TWV0cmljKGQ6IElDaGFydERhdGFQb2ludCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0eXBlb2YgZC5hdmcgPT09ICd1bmRlZmluZWQnO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIHhBeGlzVGltZUZvcm1hdHMoKSB7XG4gICAgcmV0dXJuIGQzLnRpbWUuZm9ybWF0Lm11bHRpKFtcbiAgICAgIFsnLiVMJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0TWlsbGlzZWNvbmRzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnOiVTJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0U2Vjb25kcygpO1xuICAgICAgfV0sXG4gICAgICBbJyVIOiVNJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0TWludXRlcygpO1xuICAgICAgfV0sXG4gICAgICBbJyVIOiVNJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0SG91cnMoKTtcbiAgICAgIH1dLFxuICAgICAgWyclYSAlZCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldERheSgpICYmIGQuZ2V0RGF0ZSgpICE9PSAxO1xuICAgICAgfV0sXG4gICAgICBbJyViICVkJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0RGF0ZSgpICE9PSAxO1xuICAgICAgfV0sXG4gICAgICBbJyVCJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0TW9udGgoKTtcbiAgICAgIH1dLFxuICAgICAgWyclWScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XVxuICAgIF0pO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN2Z0RlZnMoY2hhcnQpIHtcblxuICAgIGxldCBkZWZzID0gY2hhcnQuYXBwZW5kKCdkZWZzJyk7XG5cbiAgICBkZWZzLmFwcGVuZCgncGF0dGVybicpXG4gICAgICAuYXR0cignaWQnLCAnbm9EYXRhU3RyaXBlcycpXG4gICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgIC5hdHRyKCd4JywgJzAnKVxuICAgICAgLmF0dHIoJ3knLCAnMCcpXG4gICAgICAuYXR0cignd2lkdGgnLCAnNicpXG4gICAgICAuYXR0cignaGVpZ2h0JywgJzMnKVxuICAgICAgLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignZCcsICdNIDAgMCA2IDAnKVxuICAgICAgLmF0dHIoJ3N0eWxlJywgJ3N0cm9rZTojQ0NDQ0NDOyBmaWxsOm5vbmU7Jyk7XG5cbiAgICBkZWZzLmFwcGVuZCgncGF0dGVybicpXG4gICAgICAuYXR0cignaWQnLCAndW5rbm93blN0cmlwZXMnKVxuICAgICAgLmF0dHIoJ3BhdHRlcm5Vbml0cycsICd1c2VyU3BhY2VPblVzZScpXG4gICAgICAuYXR0cigneCcsICcwJylcbiAgICAgIC5hdHRyKCd5JywgJzAnKVxuICAgICAgLmF0dHIoJ3dpZHRoJywgJzYnKVxuICAgICAgLmF0dHIoJ2hlaWdodCcsICczJylcbiAgICAgIC5hdHRyKCdzdHlsZScsICdzdHJva2U6IzJFOUVDMjsgZmlsbDpub25lOycpXG4gICAgICAuYXBwZW5kKCdwYXRoJykuYXR0cignZCcsICdNIDAgMCA2IDAnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICdkb3duU3RyaXBlcycpXG4gICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgIC5hdHRyKCd4JywgJzAnKVxuICAgICAgLmF0dHIoJ3knLCAnMCcpXG4gICAgICAuYXR0cignd2lkdGgnLCAnNicpXG4gICAgICAuYXR0cignaGVpZ2h0JywgJzMnKVxuICAgICAgLmF0dHIoJ3N0eWxlJywgJ3N0cm9rZTojZmY4YTlhOyBmaWxsOm5vbmU7JylcbiAgICAgIC5hcHBlbmQoJ3BhdGgnKS5hdHRyKCdkJywgJ00gMCAwIDYgMCcpO1xuXG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGU6IGFueSkge1xuICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICB9XG5cbiAgLy8gYWRhcHRlZCBmcm9tIGh0dHA6Ly93ZXJ4bHRkLmNvbS93cC8yMDEwLzA1LzEzL2phdmFzY3JpcHQtaW1wbGVtZW50YXRpb24tb2YtamF2YXMtc3RyaW5nLWhhc2hjb2RlLW1ldGhvZC9cbiAgZXhwb3J0IGZ1bmN0aW9uIGhhc2hTdHJpbmcoc3RyOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIGxldCBoYXNoID0gMCwgaSwgY2hyLCBsZW47XG4gICAgaWYgKHN0ci5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBoYXNoO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwLCBsZW4gPSBzdHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGNociA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgaGFzaCA9ICgoaGFzaCA8PCA1KSAtIGhhc2gpICsgY2hyO1xuICAgICAgaGFzaCB8PSAwOyAvLyBDb252ZXJ0IHRvIDMyYml0IGludGVnZXJcbiAgICB9XG4gICAgcmV0dXJuIGhhc2g7XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlQXJlYUNoYXJ0KHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgaGVpZ2h0PzogbnVtYmVyLFxuICAgIGludGVycG9sYXRpb24/OiBzdHJpbmcsXG4gICAgaGlkZUhpZ2hMb3dWYWx1ZXM/OiBib29sZWFuKSB7XG5cbiAgICBsZXQgaGlnaEFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5tYXgpO1xuICAgICAgfSlcbiAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KSxcblxuICAgICAgYXZnQXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRpb24pXG4gICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pLnkwKChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gaGlkZUhpZ2hMb3dWYWx1ZXMgPyBoZWlnaHQgOiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KSxcblxuICAgICAgbG93QXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRpb24pXG4gICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC55MCgoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGhlaWdodDtcbiAgICAgICAgfSk7XG5cbiAgICBpZiAoIWhpZGVIaWdoTG93VmFsdWVzKSB7XG4gICAgICBsZXQgaGlnaEFyZWFQYXRoID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5oaWdoQXJlYScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBoaWdoQXJlYVBhdGguYXR0cignY2xhc3MnLCAnaGlnaEFyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGhpZ2hBcmVhKTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgaGlnaEFyZWFQYXRoLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBoaWdoQXJlYSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGhpZ2hBcmVhUGF0aC5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIGxldCBsb3dBcmVhUGF0aCA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGgubG93QXJlYScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBsb3dBcmVhUGF0aC5hdHRyKCdjbGFzcycsICdsb3dBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBsb3dBcmVhKTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbG93QXJlYVBhdGguZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93QXJlYScpXG4gICAgICAgIC5hdHRyKCdkJywgbG93QXJlYSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGxvd0FyZWFQYXRoLmV4aXQoKS5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBsZXQgYXZnQXJlYVBhdGggPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmF2Z0FyZWEnKS5kYXRhKFtjaGFydERhdGFdKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBhdmdBcmVhUGF0aC5hdHRyKCdjbGFzcycsICdhdmdBcmVhJylcbiAgICAgIC5hdHRyKCdkJywgYXZnQXJlYSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgYXZnQXJlYVBhdGguZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2Z0FyZWEnKVxuICAgICAgLmF0dHIoJ2QnLCBhdmdBcmVhKTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBhdmdBcmVhUGF0aC5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUhpc3RvZ3JhbUNoYXJ0KHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgdGlwOiBhbnksXG4gICAgaGVpZ2h0PzogbnVtYmVyLFxuICAgIHN0YWNrZWQ/OiBib29sZWFuLFxuICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXg/OiBudW1iZXIsXG4gICAgaGlkZUhpZ2hMb3dWYWx1ZXM/OiBib29sZWFuKSB7XG5cbiAgICBjb25zdCBiYXJDbGFzcyA9IHN0YWNrZWQgPyAnbGVhZGVyQmFyJyA6ICdoaXN0b2dyYW0nO1xuXG4gICAgY29uc3QgcmVjdEhpc3RvZ3JhbSA9IHN2Zy5zZWxlY3RBbGwoJ3JlY3QuJyArIGJhckNsYXNzKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICBmdW5jdGlvbiBidWlsZEJhcnMoc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5hdHRyKCdjbGFzcycsIGJhckNsYXNzKVxuICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgICB9KVxuICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgIC5hdHRyKCd4JywgKGQsIGkpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2FsY0JhclhQb3MoZCwgaSwgdGltZVNjYWxlLCBjaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2FsY0JhcldpZHRoQWRqdXN0ZWQoaSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/IDAgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaGVpZ2h0IC0geVNjYWxlKGlzRW1wdHlEYXRhUG9pbnQoZCkgPyB5U2NhbGUodmlzdWFsbHlBZGp1c3RlZE1heCkgOiBkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdvcGFjaXR5Jywgc3RhY2tlZCA/ICcuNicgOiAnMScpXG4gICAgICAgIC5hdHRyKCdmaWxsJywgKGQsIGkpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/ICd1cmwoI25vRGF0YVN0cmlwZXMpJyA6IChzdGFja2VkID8gJyNEM0QzRDYnIDogJyNDMEMwQzAnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjNzc3JztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcwJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2RhdGEtaGF3a3VsYXItdmFsdWUnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZEhpZ2hCYXIoc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5hdHRyKCdjbGFzcycsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGQubWluID09PSBkLm1heCA/ICdzaW5nbGVWYWx1ZScgOiAnaGlnaCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4JywgZnVuY3Rpb24oZCwgaSkge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGUsIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzTmFOKGQubWF4KSA/IHlTY2FsZSh2aXN1YWxseUFkanVzdGVkTWF4KSA6IHlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6ICh5U2NhbGUoZC5hdmcpIC0geVNjYWxlKGQubWF4KSB8fCAyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2FsY0JhcldpZHRoQWRqdXN0ZWQoaSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC45KVxuICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZExvd2VyQmFyKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93JylcbiAgICAgICAgLmF0dHIoJ3gnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGUsIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzTmFOKGQuYXZnKSA/IGhlaWdodCA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6ICh5U2NhbGUoZC5taW4pIC0geVNjYWxlKGQuYXZnKSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd3aWR0aCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuOSlcbiAgICAgICAgLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZFRvcFN0ZW0oc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdoaXN0b2dyYW1Ub3BTdGVtJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZExvd1N0ZW0oc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdoaXN0b2dyYW1Cb3R0b21TdGVtJylcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgfSkuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRUb3BDcm9zcyhzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbVRvcENyb3NzJylcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAuNSc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRCb3R0b21Dcm9zcyhzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbUJvdHRvbUNyb3NzJylcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAuNSc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlSGlzdG9ncmFtSGlnaExvd1ZhbHVlcyhzdmc6IGFueSwgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSwgc3RhY2tlZD86IGJvb2xlYW4pIHtcbiAgICAgIGlmIChzdGFja2VkKSB7XG4gICAgICAgIC8vIHVwcGVyIHBvcnRpb24gcmVwcmVzZW50aW5nIGF2ZyB0byBoaWdoXG4gICAgICAgIGNvbnN0IHJlY3RIaWdoID0gc3ZnLnNlbGVjdEFsbCgncmVjdC5oaWdoLCByZWN0LnNpbmdsZVZhbHVlJykuZGF0YShjaGFydERhdGEpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICByZWN0SGlnaC5jYWxsKGJ1aWxkSGlnaEJhcik7XG5cbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIHJlY3RIaWdoXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgICAgICAuY2FsbChidWlsZEhpZ2hCYXIpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICByZWN0SGlnaC5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgLy8gbG93ZXIgcG9ydGlvbiByZXByZXNlbnRpbmcgYXZnIHRvIGxvd1xuICAgICAgICBjb25zdCByZWN0TG93ID0gc3ZnLnNlbGVjdEFsbCgncmVjdC5sb3cnKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIHJlY3RMb3cuY2FsbChidWlsZExvd2VyQmFyKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgcmVjdExvd1xuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgLmNhbGwoYnVpbGRMb3dlckJhcik7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIHJlY3RMb3cuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgfSBlbHNlIHtcblxuICAgICAgICBjb25zdCBsaW5lSGlzdG9IaWdoU3RlbSA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Ub3BTdGVtJykuZGF0YShjaGFydERhdGEpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbS5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGxpbmVIaXN0b0hpZ2hTdGVtXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAuY2FsbChidWlsZFRvcFN0ZW0pO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgY29uc3QgbGluZUhpc3RvTG93U3RlbSA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Cb3R0b21TdGVtJykuZGF0YShjaGFydERhdGEpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtLmNhbGwoYnVpbGRMb3dTdGVtKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgbGluZUhpc3RvTG93U3RlbVxuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgLmNhbGwoYnVpbGRMb3dTdGVtKTtcblxuICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgbGluZUhpc3RvTG93U3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgY29uc3QgbGluZUhpc3RvVG9wQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtVG9wQ3Jvc3MnKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxpbmVIaXN0b1RvcENyb3NzLmNhbGwoYnVpbGRUb3BDcm9zcyk7XG5cbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGxpbmVIaXN0b1RvcENyb3NzXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAuY2FsbChidWlsZFRvcENyb3NzKTtcblxuICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgIGNvbnN0IGxpbmVIaXN0b0JvdHRvbUNyb3NzID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbUJvdHRvbUNyb3NzJykuZGF0YShjaGFydERhdGEpO1xuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgbGluZUhpc3RvQm90dG9tQ3Jvc3MuY2FsbChidWlsZEJvdHRvbUNyb3NzKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgbGluZUhpc3RvQm90dG9tQ3Jvc3NcbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgIC5jYWxsKGJ1aWxkQm90dG9tQ3Jvc3MpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zcy5leGl0KCkucmVtb3ZlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgcmVjdEhpc3RvZ3JhbS5jYWxsKGJ1aWxkQmFycyk7XG5cbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICByZWN0SGlzdG9ncmFtLmVudGVyKClcbiAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgLmNhbGwoYnVpbGRCYXJzKTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHJlY3RIaXN0b2dyYW0uZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgaWYgKCFoaWRlSGlnaExvd1ZhbHVlcykge1xuICAgICAgY3JlYXRlSGlzdG9ncmFtSGlnaExvd1ZhbHVlcyhzdmcsIGNoYXJ0RGF0YSwgc3RhY2tlZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHdlIHNob3VsZCBoaWRlIGhpZ2gtbG93IHZhbHVlcy4uIG9yIHJlbW92ZSBpZiBleGlzdGluZ1xuICAgICAgc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcFN0ZW0sIC5oaXN0b2dyYW1Cb3R0b21TdGVtLCAuaGlzdG9ncmFtVG9wQ3Jvc3MsIC5oaXN0b2dyYW1Cb3R0b21Dcm9zcycpLnJlbW92ZSgpO1xuICAgIH1cblxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxpbmVDaGFydChzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLFxuICAgIGhlaWdodD86IG51bWJlcixcbiAgICBpbnRlcnBvbGF0aW9uPzogc3RyaW5nKSB7XG5cbiAgICBsZXQgbWV0cmljQ2hhcnRMaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRpb24pXG4gICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pO1xuXG4gICAgbGV0IHBhdGhNZXRyaWMgPSBzdmcuc2VsZWN0QWxsKCdwYXRoLm1ldHJpY0xpbmUnKS5kYXRhKFtjaGFydERhdGFdKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBwYXRoTWV0cmljLmF0dHIoJ2NsYXNzJywgJ21ldHJpY0xpbmUnKVxuICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgLmF0dHIoJ2QnLCBtZXRyaWNDaGFydExpbmUpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcGF0aE1ldHJpYy5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignY2xhc3MnLCAnbWV0cmljTGluZScpXG4gICAgICAudHJhbnNpdGlvbigpXG4gICAgICAuYXR0cignZCcsIG1ldHJpY0NoYXJ0TGluZSk7XG5cbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBwYXRoTWV0cmljLmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTY2F0dGVyQ2hhcnQoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICBoZWlnaHQ/OiBudW1iZXIsXG4gICAgaW50ZXJwb2xhdGlvbj86IHN0cmluZyxcbiAgICBoaWRlSGlnaExvd1ZhbHVlcz86IGJvb2xlYW4pIHtcblxuICAgIGlmICghaGlkZUhpZ2hMb3dWYWx1ZXMpIHtcblxuICAgICAgbGV0IGhpZ2hEb3RDaXJjbGUgPSBzdmcuc2VsZWN0QWxsKCcuaGlnaERvdCcpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgaGlnaERvdENpcmNsZS5hdHRyKCdjbGFzcycsICdoaWdoRG90JylcbiAgICAgICAgLmZpbHRlcigoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjZmYxYTEzJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGhpZ2hEb3RDaXJjbGUuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdoaWdoRG90JylcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnI2ZmMWExMyc7XG4gICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBoaWdoRG90Q2lyY2xlLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgbGV0IGxvd0RvdENpcmNsZSA9IHN2Zy5zZWxlY3RBbGwoJy5sb3dEb3QnKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxvd0RvdENpcmNsZS5hdHRyKCdjbGFzcycsICdsb3dEb3QnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGxvd0RvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xvd0RvdCcpXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgbG93RG90Q2lyY2xlLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgIH0gZWxzZSB7XG4gICAgICAvLyB3ZSBzaG91bGQgaGlkZSBoaWdoLWxvdyB2YWx1ZXMuLiBvciByZW1vdmUgaWYgZXhpc3RpbmdcbiAgICAgIHN2Zy5zZWxlY3RBbGwoJy5oaWdoRG90LCAubG93RG90JykucmVtb3ZlKCk7XG4gICAgfVxuXG4gICAgbGV0IGF2Z0RvdENpcmNsZSA9IHN2Zy5zZWxlY3RBbGwoJy5hdmdEb3QnKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgYXZnRG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2F2Z0RvdCcpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigncicsIDMpXG4gICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gJyNGRkYnO1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGF2Z0RvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjbGFzcycsICdhdmdEb3QnKVxuICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcjRkZGJztcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBhdmdEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlU2NhdHRlckxpbmVDaGFydChzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLFxuICAgIGhlaWdodD86IG51bWJlcixcbiAgICBpbnRlcnBvbGF0aW9uPzogc3RyaW5nLFxuICAgIGhpZGVIaWdoTG93VmFsdWVzPzogYm9vbGVhbikge1xuICAgIGxldCBsaW5lU2NhdHRlclRvcFN0ZW0gPSBzdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVUb3BTdGVtJykuZGF0YShjaGFydERhdGEpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZVRvcFN0ZW0nKVxuICAgICAgLmZpbHRlcigoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBsaW5lU2NhdHRlclRvcFN0ZW0uZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wU3RlbScpXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBsaW5lU2NhdHRlclRvcFN0ZW0uZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgbGV0IGxpbmVTY2F0dGVyQm90dG9tU3RlbSA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgbGluZVNjYXR0ZXJCb3R0b21TdGVtLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tU3RlbScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tU3RlbScpXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgbGV0IGxpbmVTY2F0dGVyVG9wQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVUb3BDcm9zcycpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBsaW5lU2NhdHRlclRvcENyb3NzLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wQ3Jvc3MnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnMC41JztcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wQ3Jvc3MnKVxuICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnMC41JztcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgbGV0IGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBsaW5lU2NhdHRlckJvdHRvbUNyb3NzLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnMC41JztcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKVxuICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSAtIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKSArIDM7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShkLm1pbik7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiAnMC41JztcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgbGV0IGNpcmNsZVNjYXR0ZXJEb3QgPSBzdmcuc2VsZWN0QWxsKCcuc2NhdHRlckRvdCcpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBjaXJjbGVTY2F0dGVyRG90LmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJEb3QnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgIH0pXG4gICAgICAuc3R5bGUoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiAnMSc7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgY2lyY2xlU2NhdHRlckRvdC5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyRG90JylcbiAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICB9KVxuICAgICAgLnN0eWxlKCdvcGFjaXR5JywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gJzEnO1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGNpcmNsZVNjYXR0ZXJEb3QuZXhpdCgpLnJlbW92ZSgpO1xuXG4gIH1cblxufVxuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
