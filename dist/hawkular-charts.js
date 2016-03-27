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
    }());
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
    function createAlertLine(chartOptions, alertValue, cssClassName) {
        var pathAlertLine = chartOptions.svg.selectAll('path.alertLine').data([chartOptions.chartData]);
        // update existing
        pathAlertLine.attr('class', cssClassName)
            .attr('d', createAlertLineDef(chartOptions.timeScale, chartOptions.yScale, alertValue));
        // add new ones
        pathAlertLine.enter().append('path')
            .attr('class', cssClassName)
            .attr('d', createAlertLineDef(chartOptions.timeScale, chartOptions.yScale, alertValue));
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
    function createAlertBoundsArea(chartOptions, alertValue, highBound) {
        var alertBounds = extractAlertRanges(chartOptions.chartData, alertValue);
        var rectAlert = chartOptions.svg.select('g.alertHolder').selectAll('rect.alertBounds').data(alertBounds);
        function alertBoundingRect(selection) {
            selection
                .attr('class', 'alertBounds')
                .attr('x', function (d) {
                return chartOptions.timeScale(d.startTimestamp);
            })
                .attr('y', function () {
                return chartOptions.yScale(highBound);
            })
                .attr('height', function (d) {
                return chartOptions.height - 40;
            })
                .attr('width', function (d) {
                return chartOptions.timeScale(d.endTimestamp) - chartOptions.timeScale(d.startTimestamp);
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
    }());
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
    }());
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
    }());
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
                var chartHeight = ContextChartDirective._CHART_HEIGHT_HINT, width = ContextChartDirective._CHART_WIDTH_HINT - margin.left - margin.right, height = chartHeight - margin.top - margin.bottom, modifiedInnerChartHeight = height - margin.top - margin.bottom - 15, innerChartHeight = height + margin.top, showYAxisValues, yScale, yAxis, yAxisGroup, timeScale, xAxis, xAxisGroup, brush, brushGroup, chart, chartParent, svg;
                if (typeof attrs.showYAxisValues !== 'undefined') {
                    showYAxisValues = attrs.showYAxisValues === 'true';
                }
                function resize() {
                    // destroy any previous charts
                    if (chart) {
                        chartParent.selectAll('*').remove();
                    }
                    chartParent = d3.select(element[0]);
                    var parentNode = element[0].parentNode;
                    width = parentNode.clientWidth;
                    height = parentNode.clientHeight;
                    modifiedInnerChartHeight = height - margin.top - margin.bottom - ContextChartDirective._XAXIS_HEIGHT,
                        //console.log('Context Width: %i',width);
                        //console.log('Context Height: %i',height);
                        innerChartHeight = height + margin.top;
                    chart = chartParent.append('svg')
                        .attr('width', width - margin.left - margin.right)
                        .attr('height', innerChartHeight);
                    svg = chart.append('g')
                        .attr('transform', 'translate(' + margin.left + ', 0)')
                        .attr('class', 'contextChart');
                }
                function createContextChart(dataPoints) {
                    timeScale = d3.time.scale()
                        .range([0, width - 10])
                        .nice()
                        .domain([dataPoints[0].timestamp, dataPoints[dataPoints.length - 1].timestamp]);
                    xAxis = d3.svg.axis()
                        .scale(timeScale)
                        .tickSize(4, 0)
                        .tickFormat(Charts.xAxisTimeFormats())
                        .orient('bottom');
                    svg.selectAll('g.axis').remove();
                    xAxisGroup = svg.append('g')
                        .attr('class', 'x axis')
                        .attr('transform', 'translate(0,' + modifiedInnerChartHeight + ')')
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
                        .rangeRound([modifiedInnerChartHeight, 0])
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
                        return modifiedInnerChartHeight;
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
                //d3.select(window).on('resize', scope.render(this.dataPoints));
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
                        console.time('contextChartRender');
                        ///NOTE: layering order is important!
                        resize();
                        createContextChart(dataPoints);
                        createXAxisBrush();
                        console.timeEnd('contextChartRender');
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
        // these are just starting parameter hints
        ContextChartDirective._CHART_WIDTH_HINT = 750;
        ContextChartDirective._CHART_HEIGHT_HINT = 50;
        ContextChartDirective._XAXIS_HEIGHT = 15;
        return ContextChartDirective;
    }());
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
    }());
    Charts.EventNames = EventNames;
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    /**
     * Create data points along the line to show the actual values.
     * @param svg
     * @param timeScale
     * @param yScale
     * @param tip
     * @param dataPoints
     */
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
    function createForecastLine(newInterpolation, timeScale, yScale) {
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
    function showForecastData(forecastData, chartOptions) {
        var existsMinOrMax, lastForecastPoint = forecastData[forecastData.length - 1];
        existsMinOrMax = lastForecastPoint.min || lastForecastPoint.max;
        if (existsMinOrMax) {
            var maxArea = d3.svg.area()
                .interpolate(chartOptions.interpolation)
                .defined(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .x(function (d) {
                return chartOptions.timeScale(d.timestamp);
            })
                .y(function (d) {
                return chartOptions.yScale(d.max);
            })
                .y0(function (d) {
                return chartOptions.yScale(d.min);
            });
            var predictiveConeAreaPath = chartOptions.svg.selectAll('path.ConeArea').data([forecastData]);
            // update existing
            predictiveConeAreaPath.attr('class', 'coneArea')
                .attr('d', maxArea);
            // add new ones
            predictiveConeAreaPath.enter().append('path')
                .attr('class', 'coneArea')
                .attr('d', maxArea);
            // remove old ones
            predictiveConeAreaPath.exit().remove();
        }
        var forecastPathLine = chartOptions.svg.selectAll('.forecastLine').data([forecastData]);
        // update existing
        forecastPathLine.attr('class', 'forecastLine')
            .attr('d', createForecastLine('monotone', chartOptions.timeScale, chartOptions.yScale));
        // add new ones
        forecastPathLine.enter().append('path')
            .attr('class', 'forecastLine')
            .attr('d', createForecastLine('monotone', chartOptions.timeScale, chartOptions.yScale));
        // remove old ones
        forecastPathLine.exit().remove();
    }
    Charts.showForecastData = showForecastData;
})(Charts || (Charts = {}));

/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var debug = false;
    // the scale to use for y-axis when all values are 0, [0, DEFAULT_Y_SCALE]
    Charts.DEFAULT_Y_SCALE = 10;
    Charts.X_AXIS_HEIGHT = 25; // with room for label
    Charts.HOVER_DATE_TIME_FORMAT = 'MM/DD/YYYY h:mm a';
    Charts.margin = { top: 10, right: 5, bottom: 5, left: 90 }; // left margin room for label
    /**
     * @ngdoc directive
     * @name hawkularChart
     * @description A d3 based charting direction to provide charting using various styles of charts.
     *
     */
    angular.module('hawkular.charts')
        .directive('hawkularChart', ['$rootScope', '$http', '$window', '$interval', '$log',
        function ($rootScope, $http, $window, $interval, $log) {
            function link(scope, element, attrs) {
                // data specific vars
                var dataPoints = [], multiDataPoints, forecastDataPoints, dataUrl = attrs.metricUrl, metricId = attrs.metricId || '', metricTenantId = attrs.metricTenantId || '', metricType = attrs.metricType || 'gauge', timeRangeInSeconds = +attrs.timeRangeInSeconds || 43200, refreshIntervalInSeconds = +attrs.refreshIntervalInSeconds || 3600, alertValue = +attrs.alertValue, interpolation = attrs.interpolation || 'monotone', endTimestamp = Date.now(), startTimestamp = endTimestamp - timeRangeInSeconds, previousRangeDataPoints = [], annotationData = [], chartType = attrs.chartType || 'line', singleValueLabel = attrs.singleValueLabel || 'Raw Value', noDataLabel = attrs.noDataLabel || 'No Data', durationLabel = attrs.durationLabel || 'Interval', minLabel = attrs.minLabel || 'Min', maxLabel = attrs.maxLabel || 'Max', avgLabel = attrs.avgLabel || 'Avg', timestampLabel = attrs.timestampLabel || 'Timestamp', showAvgLine = true, showDataPoints = false, hideHighLowValues = false, useZeroMinValue = false;
                // chart specific vars
                var height, modifiedInnerChartHeight, innerChartHeight = height + Charts.margin.top + Charts.margin.bottom, chartData, yScale, timeScale, yAxis, xAxis, tip, brush, brushGroup, chart, chartParent, svg, visuallyAdjustedMin, visuallyAdjustedMax, peak, min, processedNewData, processedPreviousRangeData, startIntervalPromise;
                dataPoints = attrs.data;
                forecastDataPoints = attrs.forecastData;
                showDataPoints = attrs.showDataPoints;
                previousRangeDataPoints = attrs.previousRangeData;
                annotationData = attrs.annotationData;
                var registeredChartTypes = [];
                registeredChartTypes.push(new Charts.LineChart());
                registeredChartTypes.push(new Charts.AreaChart());
                registeredChartTypes.push(new Charts.ScatterChart());
                registeredChartTypes.push(new Charts.ScatterLineChart());
                registeredChartTypes.push(new Charts.HistogramChart());
                registeredChartTypes.push(new Charts.RhqBarChart());
                registeredChartTypes.push(new Charts.MultiLineChart());
                function resize() {
                    // destroy any previous charts
                    if (chart) {
                        chartParent.selectAll('*').remove();
                    }
                    chartParent = d3.select(element[0]);
                    var parentNode = element[0].parentNode;
                    Charts.width = parentNode.clientWidth;
                    height = parentNode.clientHeight;
                    if (Charts.width === 0) {
                        console.error("Error setting up chart. Width is 0 on chart parent container.");
                        return;
                    }
                    if (height === 0) {
                        console.error("Error setting up chart. Height is 0 on chart parent container.");
                        return;
                    }
                    modifiedInnerChartHeight = height - Charts.margin.top - Charts.margin.bottom - Charts.X_AXIS_HEIGHT;
                    //console.log('Metric Width: %i', width);
                    //console.log('Metric Height: %i', height);
                    innerChartHeight = height + Charts.margin.top;
                    chart = chartParent.append('svg')
                        .attr('width', Charts.width + Charts.margin.left + Charts.margin.right)
                        .attr('height', innerChartHeight);
                    //createSvgDefs(chart);
                    svg = chart.append('g')
                        .attr('transform', 'translate(' + Charts.margin.left + ',' + (Charts.margin.top) + ')');
                    tip = d3.tip()
                        .attr('class', 'd3-tip')
                        .offset([-10, 0])
                        .html(function (d, i) {
                        return buildHover(d, i);
                    });
                    svg.call(tip);
                    // a placeholder for the alerts
                    svg.append('g').attr('class', 'alertHolder');
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
                function getYScale() {
                    return d3.scale.linear()
                        .clamp(true)
                        .rangeRound([modifiedInnerChartHeight, 0])
                        .domain([visuallyAdjustedMin, visuallyAdjustedMax]);
                }
                function determineScale(dataPoints) {
                    var xTicks = Charts.determineXAxisTicksFromScreenWidth(Charts.width - Charts.margin.left - Charts.margin.right), yTicks = Charts.determineYAxisTicksFromScreenHeight(modifiedInnerChartHeight);
                    if (dataPoints.length > 0) {
                        chartData = dataPoints;
                        setupFilteredData(dataPoints);
                        yScale = getYScale();
                        yAxis = d3.svg.axis()
                            .scale(yScale)
                            .ticks(yTicks)
                            .tickSize(4, 4, 0)
                            .orient('left');
                        var timeScaleMin = d3.min(dataPoints.map(function (d) {
                            return d.timestamp;
                        }));
                        var timeScaleMax = void 0;
                        if (forecastDataPoints && forecastDataPoints.length > 0) {
                            timeScaleMax = forecastDataPoints[forecastDataPoints.length - 1].timestamp;
                        }
                        else {
                            timeScaleMax = d3.max(dataPoints.map(function (d) {
                                return d.timestamp;
                            }));
                        }
                        timeScale = d3.time.scale()
                            .range([0, Charts.width - Charts.margin.left - Charts.margin.right])
                            .nice()
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
                    var xTicks = Charts.determineXAxisTicksFromScreenWidth(Charts.width - Charts.margin.left - Charts.margin.right), yTicks = Charts.determineXAxisTicksFromScreenWidth(modifiedInnerChartHeight);
                    if (multiDataPoints && multiDataPoints[0] && multiDataPoints[0].values) {
                        var lowHigh = setupFilteredMultiData(multiDataPoints);
                        visuallyAdjustedMin = lowHigh[0];
                        visuallyAdjustedMax = lowHigh[1];
                        yScale = d3.scale.linear()
                            .clamp(true)
                            .rangeRound([modifiedInnerChartHeight, 0])
                            .domain([visuallyAdjustedMin, visuallyAdjustedMax]);
                        yAxis = d3.svg.axis()
                            .scale(yScale)
                            .ticks(yTicks)
                            .tickSize(4, 4, 0)
                            .orient('left');
                        timeScale = d3.time.scale()
                            .range([0, Charts.width - Charts.margin.left - Charts.margin.right])
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
                            scope.render(processedNewData);
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
                function createYAxisGridLines() {
                    // create the y axis grid lines
                    var numberOfYAxisGridLines = Charts.determineYAxisGridLineTicksFromScreenHeight(modifiedInnerChartHeight);
                    yScale = getYScale();
                    if (yScale) {
                        var yAxis_1 = svg.selectAll('g.grid.y_grid');
                        if (!yAxis_1[0].length) {
                            yAxis_1 = svg.append('g').classed('grid y_grid', true);
                        }
                        yAxis_1
                            .call(d3.svg.axis()
                            .scale(yScale)
                            .orient('left')
                            .ticks(numberOfYAxisGridLines)
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
                            .attr('transform', 'translate(0,' + modifiedInnerChartHeight + ')')
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
                        if (modifiedInnerChartHeight >= 150 && attrs.yAxisUnits) {
                            yAxisLabel = svg.append('text').attr('class', 'yAxisUnitsLabel')
                                .attr('transform', 'rotate(-90),translate(-20,-50)')
                                .attr('x', -modifiedInnerChartHeight / 2)
                                .style('text-anchor', 'center')
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
                        .attr('height', modifiedInnerChartHeight);
                    function brushStart() {
                        svg.classed('selecting', true);
                    }
                    function brushEnd() {
                        var extent = brush.extent(), startTime = Math.round(extent[0].getTime()), endTime = Math.round(extent[1].getTime()), dragSelectionDelta = endTime - startTime;
                        svg.classed('selecting', !d3.event.target.empty());
                        // ignore range selections less than 1 minute
                        if (dragSelectionDelta >= 60000) {
                            forecastDataPoints = [];
                            var chartOptions = new Charts.ChartOptions(svg, timeScale, yScale, chartData, multiDataPoints, modifiedInnerChartHeight, height, tip, visuallyAdjustedMax, hideHighLowValues, interpolation);
                            Charts.showForecastData(forecastDataPoints, chartOptions);
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
                scope.$watchCollection('data', function (newData, oldData) {
                    if (newData || oldData) {
                        processedNewData = angular.fromJson(newData || []);
                        scope.render(processedNewData);
                    }
                });
                scope.$watch('multiData', function (newMultiData, oldMultiData) {
                    if (newMultiData || oldMultiData) {
                        multiDataPoints = angular.fromJson(newMultiData || []);
                        scope.render(processedNewData);
                    }
                }, true);
                scope.$watch('previousRangeData', function (newPreviousRangeValues) {
                    if (newPreviousRangeValues) {
                        //$log.debug('Previous Range data changed');
                        processedPreviousRangeData = angular.fromJson(newPreviousRangeValues);
                        scope.render(processedNewData);
                    }
                }, true);
                scope.$watch('annotationData', function (newAnnotationData) {
                    if (newAnnotationData) {
                        annotationData = angular.fromJson(newAnnotationData);
                        scope.render(processedNewData);
                    }
                }, true);
                scope.$watch('forecastData', function (newForecastData) {
                    if (newForecastData) {
                        forecastDataPoints = angular.fromJson(newForecastData);
                        scope.render(processedNewData);
                    }
                }, true);
                scope.$watchGroup(['alertValue', 'chartType', 'hideHighLowValues', 'useZeroMinValue', 'showAvgLine'], function (chartAttrs) {
                    alertValue = chartAttrs[0] || alertValue;
                    chartType = chartAttrs[1] || chartType;
                    hideHighLowValues = (typeof chartAttrs[2] !== 'undefined') ? chartAttrs[2] : hideHighLowValues;
                    useZeroMinValue = (typeof chartAttrs[3] !== 'undefined') ? chartAttrs[3] : useZeroMinValue;
                    showAvgLine = (typeof chartAttrs[4] !== 'undefined') ? chartAttrs[4] : showAvgLine;
                    scope.render(processedNewData);
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
                function determineChartTypeAndDraw(chartType, chartOptions) {
                    //@todo: add in multiline and rhqbar chart types
                    //@todo: add validation if not in valid chart types
                    registeredChartTypes.forEach(function (aChartType) {
                        if (aChartType.name === chartType) {
                            aChartType.drawChart(chartOptions);
                        }
                    });
                }
                scope.render = function (dataPoints) {
                    // if we don't have data, don't bother..
                    if (!dataPoints && !multiDataPoints) {
                        return;
                    }
                    if (debug) {
                        console.group('Render Chart');
                        console.time('chartRender');
                    }
                    //NOTE: layering order is important!
                    resize();
                    if (dataPoints) {
                        determineScale(dataPoints);
                    }
                    else {
                        //multiDataPoints exist
                        determineMultiScale(multiDataPoints);
                    }
                    var chartOptions = new Charts.ChartOptions(svg, timeScale, yScale, chartData, multiDataPoints, modifiedInnerChartHeight, height, tip, visuallyAdjustedMax, hideHighLowValues, interpolation);
                    if (alertValue && (alertValue > visuallyAdjustedMin && alertValue < visuallyAdjustedMax)) {
                        Charts.createAlertBoundsArea(chartOptions, alertValue, visuallyAdjustedMax);
                    }
                    createXAxisBrush();
                    createYAxisGridLines();
                    determineChartTypeAndDraw(chartType, chartOptions);
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
                        Charts.createAlertLine(chartOptions, alertValue, 'alertLine');
                    }
                    if (annotationData) {
                        annotateChart(annotationData);
                    }
                    if (forecastDataPoints && forecastDataPoints.length > 0) {
                        Charts.showForecastData(forecastDataPoints, chartOptions);
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
    /**
     *
     */
    var ChartOptions = (function () {
        function ChartOptions(svg, timeScale, yScale, chartData, multiChartData, modifiedInnerChartHeight, height, tip, visuallyAdjustedMax, hideHighLowValues, interpolation) {
            this.svg = svg;
            this.timeScale = timeScale;
            this.yScale = yScale;
            this.chartData = chartData;
            this.multiChartData = multiChartData;
            this.modifiedInnerChartHeight = modifiedInnerChartHeight;
            this.height = height;
            this.tip = tip;
            this.visuallyAdjustedMax = visuallyAdjustedMax;
            this.hideHighLowValues = hideHighLowValues;
            this.interpolation = interpolation;
        }
        return ChartOptions;
    }());
    Charts.ChartOptions = ChartOptions;
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
    function determineXAxisTicksFromScreenWidth(widthInPixels) {
        var xTicks;
        if (widthInPixels <= 200) {
            xTicks = 2;
        }
        else if (widthInPixels <= 350 && widthInPixels > 200) {
            xTicks = 4;
        }
        else {
            xTicks = 9;
        }
        return xTicks;
    }
    Charts.determineXAxisTicksFromScreenWidth = determineXAxisTicksFromScreenWidth;
    function determineYAxisTicksFromScreenHeight(heightInPixels) {
        var yTicks;
        if (heightInPixels <= 120) {
            yTicks = 3;
        }
        else {
            yTicks = 9;
        }
        return yTicks;
    }
    Charts.determineYAxisTicksFromScreenHeight = determineYAxisTicksFromScreenHeight;
    function determineYAxisGridLineTicksFromScreenHeight(heightInPixels) {
        var yTicks;
        if (heightInPixels <= 60) {
            yTicks = 0;
        }
        else {
            yTicks = 10;
        }
        return yTicks;
    }
    Charts.determineYAxisGridLineTicksFromScreenHeight = determineYAxisGridLineTicksFromScreenHeight;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    Charts.BAR_OFFSET = 2;
    var AbstractHistogramChart = (function () {
        function AbstractHistogramChart() {
            this.name = 'histogram';
        }
        AbstractHistogramChart.prototype.drawChart = function (chartOptions, stacked) {
            if (stacked === void 0) { stacked = false; }
            var barClass = stacked ? 'leaderBar' : 'histogram';
            var rectHistogram = chartOptions.svg.selectAll('rect.' + barClass).data(chartOptions.chartData);
            function buildBars(selection) {
                selection
                    .attr('class', barClass)
                    .on('mouseover', function (d, i) {
                    chartOptions.tip.show(d, i);
                }).on('mouseout', function () {
                    chartOptions.tip.hide();
                })
                    .transition()
                    .attr('x', function (d, i) {
                    return Charts.calcBarXPos(d, i, chartOptions.timeScale, chartOptions.chartData.length);
                })
                    .attr('width', function (d, i) {
                    return Charts.calcBarWidthAdjusted(i, chartOptions.chartData.length);
                })
                    .attr('y', function (d) {
                    return Charts.isEmptyDataPoint(d) ? 0 : chartOptions.yScale(d.avg);
                })
                    .attr('height', function (d) {
                    return chartOptions.modifiedInnerChartHeight - chartOptions.yScale(Charts.isEmptyDataPoint(d) ?
                        chartOptions.yScale(chartOptions.visuallyAdjustedMax) : d.avg);
                })
                    .attr('opacity', stacked ? '.6' : '1')
                    .attr('fill', function (d) {
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
                    return Charts.calcBarXPos(d, i, chartOptions.timeScale, chartOptions.chartData.length);
                })
                    .attr('y', function (d) {
                    return isNaN(d.max) ? chartOptions.yScale(chartOptions.visuallyAdjustedMax) : chartOptions.yScale(d.max);
                })
                    .attr('height', function (d) {
                    return Charts.isEmptyDataPoint(d) ? 0 : (chartOptions.yScale(d.avg) - chartOptions.yScale(d.max) || 2);
                })
                    .attr('width', function (d, i) {
                    return Charts.calcBarWidthAdjusted(i, chartOptions.chartData.length);
                })
                    .attr('opacity', 0.9)
                    .on('mouseover', function (d, i) {
                    chartOptions.tip.show(d, i);
                }).on('mouseout', function () {
                    chartOptions.tip.hide();
                });
            }
            function buildLowerBar(selection) {
                selection
                    .attr('class', 'low')
                    .attr('x', function (d, i) {
                    return Charts.calcBarXPos(d, i, chartOptions.timeScale, chartOptions.chartData.length);
                })
                    .attr('y', function (d) {
                    return isNaN(d.avg) ? chartOptions.height : chartOptions.yScale(d.avg);
                })
                    .attr('height', function (d) {
                    return Charts.isEmptyDataPoint(d) ? 0 : (chartOptions.yScale(d.min) - chartOptions.yScale(d.avg));
                })
                    .attr('width', function (d, i) {
                    return Charts.calcBarWidthAdjusted(i, chartOptions.chartData.length);
                })
                    .attr('opacity', 0.9)
                    .on('mouseover', function (d, i) {
                    chartOptions.tip.show(d, i);
                }).on('mouseout', function () {
                    chartOptions.tip.hide();
                });
            }
            function buildTopStem(selection) {
                selection
                    .attr('class', 'histogramTopStem')
                    .filter(function (d) {
                    return !Charts.isEmptyDataPoint(d);
                })
                    .attr('x1', function (d) {
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
                })
                    .attr('x2', function (d) {
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
                })
                    .attr('y1', function (d) {
                    return chartOptions.yScale(d.max);
                })
                    .attr('y2', function (d) {
                    return chartOptions.yScale(d.avg);
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
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
                })
                    .attr('x2', function (d) {
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
                })
                    .attr('y1', function (d) {
                    return chartOptions.yScale(d.avg);
                })
                    .attr('y2', function (d) {
                    return chartOptions.yScale(d.min);
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
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale) - 3;
                })
                    .attr('x2', function (d) {
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale) + 3;
                })
                    .attr('y1', function (d) {
                    return chartOptions.yScale(d.max);
                })
                    .attr('y2', function (d) {
                    return chartOptions.yScale(d.max);
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
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale) - 3;
                })
                    .attr('x2', function (d) {
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale) + 3;
                })
                    .attr('y1', function (d) {
                    return chartOptions.yScale(d.min);
                })
                    .attr('y2', function (d) {
                    return chartOptions.yScale(d.min);
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
                    var rectLow = svg.selectAll('rect.low').data(chartOptions.chartData);
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
                    var lineHistoHighStem = svg.selectAll('.histogramTopStem').data(chartOptions.chartData);
                    // update existing
                    lineHistoHighStem.call(buildTopStem);
                    // add new ones
                    lineHistoHighStem
                        .enter()
                        .append('line')
                        .call(buildTopStem);
                    // remove old ones
                    lineHistoHighStem.exit().remove();
                    var lineHistoLowStem = svg.selectAll('.histogramBottomStem').data(chartOptions.chartData);
                    // update existing
                    lineHistoLowStem.call(buildLowStem);
                    // add new ones
                    lineHistoLowStem
                        .enter()
                        .append('line')
                        .call(buildLowStem);
                    // remove old ones
                    lineHistoLowStem.exit().remove();
                    var lineHistoTopCross = svg.selectAll('.histogramTopCross').data(chartOptions.chartData);
                    // update existing
                    lineHistoTopCross.call(buildTopCross);
                    // add new ones
                    lineHistoTopCross
                        .enter()
                        .append('line')
                        .call(buildTopCross);
                    // remove old ones
                    lineHistoTopCross.exit().remove();
                    var lineHistoBottomCross = svg.selectAll('.histogramBottomCross').data(chartOptions.chartData);
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
            if (!chartOptions.hideHighLowValues) {
                createHistogramHighLowValues(chartOptions.svg, chartOptions.chartData, stacked);
            }
            else {
                // we should hide high-low values.. or remove if existing
                chartOptions.svg
                    .selectAll('.histogramTopStem, .histogramBottomStem, .histogramTopCross, .histogramBottomCross').remove();
            }
        };
        return AbstractHistogramChart;
    }());
    Charts.AbstractHistogramChart = AbstractHistogramChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var AreaChart = (function () {
        function AreaChart() {
            this.name = 'area';
        }
        AreaChart.prototype.drawChart = function (chartOptions) {
            var highArea = d3.svg.area()
                .interpolate(chartOptions.interpolation)
                .defined(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .x(function (d) {
                return chartOptions.timeScale(d.timestamp);
            })
                .y(function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.max);
            })
                .y0(function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
            }), avgArea = d3.svg.area()
                .interpolate(chartOptions.interpolation)
                .defined(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .x(function (d) {
                return chartOptions.timeScale(d.timestamp);
            })
                .y(function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
            }).y0(function (d) {
                return chartOptions.hideHighLowValues ? chartOptions.height : chartOptions.yScale(d.min);
            }), lowArea = d3.svg.area()
                .interpolate(chartOptions.interpolation)
                .defined(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .x(function (d) {
                return chartOptions.timeScale(d.timestamp);
            })
                .y(function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.min);
            })
                .y0(function () {
                return chartOptions.modifiedInnerChartHeight;
            });
            if (!chartOptions.hideHighLowValues) {
                var highAreaPath = chartOptions.svg.selectAll('path.highArea').data([chartOptions.chartData]);
                // update existing
                highAreaPath
                    .attr('class', 'highArea')
                    .attr('d', highArea);
                // add new ones
                highAreaPath
                    .enter()
                    .append('path')
                    .attr('class', 'highArea')
                    .attr('d', highArea);
                // remove old ones
                highAreaPath
                    .exit()
                    .remove();
                var lowAreaPath = chartOptions.svg.selectAll('path.lowArea').data([chartOptions.chartData]);
                // update existing
                lowAreaPath
                    .attr('class', 'lowArea')
                    .attr('d', lowArea);
                // add new ones
                lowAreaPath
                    .enter()
                    .append('path')
                    .attr('class', 'lowArea')
                    .attr('d', lowArea);
                // remove old ones
                lowAreaPath
                    .exit()
                    .remove();
            }
            var avgAreaPath = chartOptions.svg.selectAll('path.avgArea').data([chartOptions.chartData]);
            // update existing
            avgAreaPath.attr('class', 'avgArea')
                .attr('d', avgArea);
            // add new ones
            avgAreaPath.enter().append('path')
                .attr('class', 'avgArea')
                .attr('d', avgArea);
            // remove old ones
            avgAreaPath.exit().remove();
        };
        return AreaChart;
    }());
    Charts.AreaChart = AreaChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var ChartOptions = Charts.ChartOptions;

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var HistogramChart = (function (_super) {
        __extends(HistogramChart, _super);
        function HistogramChart() {
            _super.apply(this, arguments);
            this.name = 'histogram';
        }
        HistogramChart.prototype.drawChart = function (chartOptions, stacked) {
            if (stacked === void 0) { stacked = false; }
            _super.prototype.drawChart.call(this, chartOptions, stacked);
        };
        return HistogramChart;
    }(Charts.AbstractHistogramChart));
    Charts.HistogramChart = HistogramChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var LineChart = (function () {
        function LineChart() {
            this.name = 'line';
        }
        LineChart.prototype.drawChart = function (chartOptions) {
            var metricChartLine = d3.svg.line()
                .interpolate(chartOptions.interpolation)
                .defined(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .x(function (d) {
                return chartOptions.timeScale(d.timestamp);
            })
                .y(function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
            });
            var pathMetric = chartOptions.svg.selectAll('path.metricLine').data([chartOptions.chartData]);
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
        };
        return LineChart;
    }());
    Charts.LineChart = LineChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var MultiLineChart = (function () {
        function MultiLineChart() {
            this.name = 'multiline';
        }
        MultiLineChart.prototype.drawChart = function (chartOptions) {
            var _this = this;
            var colorScale = d3.scale.category10(), g = 0;
            if (chartOptions.multiChartData) {
                // before updating, let's remove those missing from datapoints (if any)
                chartOptions.svg.selectAll('path[id^=\'multiLine\']')[0].forEach(function (existingPath) {
                    var stillExists = false;
                    chartOptions.multiChartData.forEach(function (singleChartData) {
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
                chartOptions.multiChartData.forEach(function (singleChartData) {
                    if (singleChartData && singleChartData.values) {
                        singleChartData.keyHash = singleChartData.keyHash
                            || ('multiLine' + Charts.hashString(singleChartData.key));
                        var pathMultiLine = chartOptions.svg.selectAll('path#' + singleChartData.keyHash)
                            .data([singleChartData.values]);
                        // update existing
                        pathMultiLine.attr('id', singleChartData.keyHash)
                            .attr('class', 'multiLine')
                            .attr('fill', 'none')
                            .attr('stroke', function () {
                            return singleChartData.color || colorScale(g++);
                        })
                            .transition()
                            .attr('d', _this.createLine('linear', chartOptions.timeScale, chartOptions.yScale));
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
                            .attr('d', _this.createLine('linear', chartOptions.timeScale, chartOptions.yScale));
                        // remove old ones
                        pathMultiLine.exit().remove();
                    }
                });
            }
            else {
                console.warn('No multi-data set for multiline chart');
            }
        };
        MultiLineChart.prototype.createLine = function (newInterpolation, timeScale, yScale) {
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
        };
        return MultiLineChart;
    }());
    Charts.MultiLineChart = MultiLineChart;
})(Charts || (Charts = {}));

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var RhqBarChart = (function (_super) {
        __extends(RhqBarChart, _super);
        function RhqBarChart() {
            _super.apply(this, arguments);
            this.name = 'rhqbar';
        }
        RhqBarChart.prototype.drawChart = function (chartOptions, stacked) {
            if (stacked === void 0) { stacked = true; }
            _super.prototype.drawChart.call(this, chartOptions, stacked);
        };
        return RhqBarChart;
    }(Charts.AbstractHistogramChart));
    Charts.RhqBarChart = RhqBarChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var ScatterChart = (function () {
        function ScatterChart() {
            this.name = 'scatter';
        }
        ScatterChart.prototype.drawChart = function (chartOptions) {
            if (!chartOptions.hideHighLowValues) {
                var highDotCircle = chartOptions.svg.selectAll('.highDot').data(chartOptions.chartData);
                // update existing
                highDotCircle.attr('class', 'highDot')
                    .filter(function (d) {
                    return !Charts.isEmptyDataPoint(d);
                })
                    .attr('r', 3)
                    .attr('cx', function (d) {
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
                })
                    .attr('cy', function (d) {
                    return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.max);
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
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
                })
                    .attr('cy', function (d) {
                    return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.max);
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
                var lowDotCircle = chartOptions.svg.selectAll('.lowDot').data(chartOptions.chartData);
                // update existing
                lowDotCircle.attr('class', 'lowDot')
                    .filter(function (d) {
                    return !Charts.isEmptyDataPoint(d);
                })
                    .attr('r', 3)
                    .attr('cx', function (d) {
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
                })
                    .attr('cy', function (d) {
                    return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.min);
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
                    return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
                })
                    .attr('cy', function (d) {
                    return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.min);
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
                chartOptions.svg.selectAll('.highDot, .lowDot').remove();
            }
            var avgDotCircle = chartOptions.svg.selectAll('.avgDot').data(chartOptions.chartData);
            // update existing
            avgDotCircle.attr('class', 'avgDot')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('r', 3)
                .attr('cx', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('cy', function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
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
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('cy', function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
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
        };
        return ScatterChart;
    }());
    Charts.ScatterChart = ScatterChart;
})(Charts || (Charts = {}));

/// <reference path='../../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    var ScatterLineChart = (function () {
        function ScatterLineChart() {
            this.name = 'scatterline';
        }
        ScatterLineChart.prototype.drawChart = function (chartOptions) {
            var lineScatterTopStem = chartOptions.svg.selectAll('.scatterLineTopStem').data(chartOptions.chartData);
            // update existing
            lineScatterTopStem.attr('class', 'scatterLineTopStem')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('x1', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('y1', function (d) {
                return chartOptions.yScale(d.max);
            })
                .attr('y2', function (d) {
                return chartOptions.yScale(d.avg);
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
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('y1', function (d) {
                return chartOptions.yScale(d.max);
            })
                .attr('y2', function (d) {
                return chartOptions.yScale(d.avg);
            })
                .attr('stroke', function (d) {
                return '#000';
            });
            // remove old ones
            lineScatterTopStem.exit().remove();
            var lineScatterBottomStem = chartOptions.svg.selectAll('.scatterLineBottomStem').data(chartOptions.chartData);
            // update existing
            lineScatterBottomStem.attr('class', 'scatterLineBottomStem')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('x1', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('y1', function (d) {
                return chartOptions.yScale(d.avg);
            })
                .attr('y2', function (d) {
                return chartOptions.yScale(d.min);
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
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('y1', function (d) {
                return chartOptions.yScale(d.avg);
            })
                .attr('y2', function (d) {
                return chartOptions.yScale(d.min);
            })
                .attr('stroke', function (d) {
                return '#000';
            });
            // remove old ones
            lineScatterBottomStem.exit().remove();
            var lineScatterTopCross = chartOptions.svg.selectAll('.scatterLineTopCross').data(chartOptions.chartData);
            // update existing
            lineScatterTopCross.attr('class', 'scatterLineTopCross')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('x1', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale) - 3;
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale) + 3;
            })
                .attr('y1', function (d) {
                return chartOptions.yScale(d.max);
            })
                .attr('y2', function (d) {
                return chartOptions.yScale(d.max);
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
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale) - 3;
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale) + 3;
            })
                .attr('y1', function (d) {
                return chartOptions.yScale(d.max);
            })
                .attr('y2', function (d) {
                return chartOptions.yScale(d.max);
            })
                .attr('stroke', function (d) {
                return '#000';
            })
                .attr('stroke-width', function (d) {
                return '0.5';
            });
            // remove old ones
            lineScatterTopCross.exit().remove();
            var lineScatterBottomCross = chartOptions.svg.selectAll('.scatterLineBottomCross').data(chartOptions.chartData);
            // update existing
            lineScatterBottomCross.attr('class', 'scatterLineBottomCross')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('x1', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale) - 3;
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale) + 3;
            })
                .attr('y1', function (d) {
                return chartOptions.yScale(d.min);
            })
                .attr('y2', function (d) {
                return chartOptions.yScale(d.min);
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
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale) - 3;
            })
                .attr('x2', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale) + 3;
            })
                .attr('y1', function (d) {
                return chartOptions.yScale(d.min);
            })
                .attr('y2', function (d) {
                return chartOptions.yScale(d.min);
            })
                .attr('stroke', function (d) {
                return '#000';
            })
                .attr('stroke-width', function (d) {
                return '0.5';
            });
            // remove old ones
            lineScatterBottomCross.exit().remove();
            var circleScatterDot = chartOptions.svg.selectAll('.scatterDot').data(chartOptions.chartData);
            // update existing
            circleScatterDot.attr('class', 'scatterDot')
                .filter(function (d) {
                return !Charts.isEmptyDataPoint(d);
            })
                .attr('r', 3)
                .attr('cx', function (d) {
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('cy', function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
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
                return Charts.xMidPointStartPosition(d, chartOptions.timeScale);
            })
                .attr('cy', function (d) {
                return Charts.isRawMetric(d) ? chartOptions.yScale(d.value) : chartOptions.yScale(d.avg);
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
        };
        return ScatterLineChart;
    }());
    Charts.ScatterLineChart = ScatterLineChart;
})(Charts || (Charts = {}));

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImhhd2t1bGFyLW1ldHJpY3MtY2hhcnRzLm1vZHVsZS50cyIsImNoYXJ0L2FsZXJ0cy50cyIsImNoYXJ0L2F2YWlsLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L2NvbnRleHQtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvZXZlbnQtbmFtZXMudHMiLCJjaGFydC9mZWF0dXJlcy50cyIsImNoYXJ0L2ZvcmVjYXN0LnRzIiwiY2hhcnQvbWV0cmljLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L3R5cGVzLnRzIiwiY2hhcnQvdXRpbGl0eS50cyIsImNoYXJ0L2NoYXJ0LXR5cGUvYWJzdHJhY3QtaGlzdG9ncmFtLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9hcmVhLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9jaGFydC10eXBlLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9oaXN0b2dyYW0udHMiLCJjaGFydC9jaGFydC10eXBlL2xpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL211bHRpLWxpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL3JocS1iYXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXJMaW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7O0FDUHRDLCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0FxSmY7QUFySkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFFYjs7O09BR0c7SUFDSDtRQUlFLG9CQUFtQixjQUE0QixFQUN0QyxZQUEwQixFQUMxQixVQUFrQjtZQUZSLG1CQUFjLEdBQWQsY0FBYyxDQUFjO1lBQ3RDLGlCQUFZLEdBQVosWUFBWSxDQUFjO1lBQzFCLGVBQVUsR0FBVixVQUFVLENBQVE7WUFDekIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMxQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFFSCxpQkFBQztJQUFELENBWEEsQUFXQyxJQUFBO0lBWFksaUJBQVUsYUFXdEIsQ0FBQTtJQUVELDRCQUE0QixTQUFjLEVBQ3hDLE1BQVcsRUFDWCxVQUFrQjtRQUNsQixJQUFJLElBQUksR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTthQUNyQixXQUFXLENBQUMsVUFBVSxDQUFDO2FBQ3ZCLENBQUMsQ0FBQyxVQUFDLENBQU07WUFDUixNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNoQyxDQUFDLENBQUM7YUFDRCxDQUFDLENBQUMsVUFBQyxDQUFNO1lBQ1IsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQztRQUVMLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQseUJBQWdDLFlBQTBCLEVBQ3hELFVBQWtCLEVBQ2xCLFlBQW9CO1FBQ3BCLElBQUksYUFBYSxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDaEcsa0JBQWtCO1FBQ2xCLGFBQWEsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQzthQUN0QyxJQUFJLENBQUMsR0FBRyxFQUFFLGtCQUFrQixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBRTFGLGVBQWU7UUFDZixhQUFhLENBQUMsS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQzthQUNqQyxJQUFJLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQzthQUMzQixJQUFJLENBQUMsR0FBRyxFQUFFLGtCQUFrQixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBRTFGLGtCQUFrQjtRQUNsQixhQUFhLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQWZlLHNCQUFlLGtCQWU5QixDQUFBO0lBRUQsNEJBQTRCLFNBQTRCLEVBQUUsU0FBeUI7UUFDakYsSUFBSSxtQkFBaUMsQ0FBQztRQUN0QyxJQUFJLFdBQXFCLENBQUM7UUFFMUIseUJBQXlCLFNBQTRCLEVBQUUsU0FBeUI7WUFDOUUsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLElBQUksUUFBeUIsQ0FBQztZQUU5QixTQUFTLENBQUMsT0FBTyxDQUFDLFVBQUMsU0FBMEIsRUFBRSxDQUFTO2dCQUN0RCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDekMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEIsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixRQUFRLEdBQUcsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsR0FBRyxTQUFTLElBQUksUUFBUSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxJQUFJLFFBQVEsQ0FBQyxHQUFHLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUMxRixXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQy9DLENBQUM7Z0JBQ0gsQ0FBQztZQUVILENBQUMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxDQUFDLFdBQVcsQ0FBQztRQUNyQixDQUFDO1FBRUQseUNBQXlDLFdBQXFCLEVBQUUsU0FBeUI7WUFDdkYsSUFBSSxtQkFBbUIsR0FBaUIsRUFBRSxDQUFDO1lBQzNDLElBQUksV0FBNEIsQ0FBQztZQUNqQyxJQUFJLFFBQXlCLENBQUM7WUFDOUIsSUFBSSxTQUEwQixDQUFDO1lBRS9CLFdBQVcsQ0FBQyxPQUFPLENBQUMsVUFBQyxlQUF1QjtnQkFDMUMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFFdkMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsZUFBZSxFQUFFLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO29CQUM1RCxXQUFXLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMzQixRQUFRLEdBQUcsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFFNUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxHQUFHLFNBQVMsSUFBSSxRQUFRLENBQUMsR0FBRyxJQUFJLFNBQVMsQ0FBQzsyQkFDekQsQ0FBQyxXQUFXLENBQUMsR0FBRyxHQUFHLFNBQVMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3BELG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUN6RCxRQUFRLENBQUMsR0FBRyxHQUFHLFFBQVEsQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO3dCQUN6RSxLQUFLLENBQUM7b0JBQ1IsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCx5RUFBeUU7WUFDekUsRUFBRSxDQUFDLENBQUMsbUJBQW1CLENBQUMsTUFBTSxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVELG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQzlGLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzNELENBQUM7WUFFRCxNQUFNLENBQUMsbUJBQW1CLENBQUM7UUFDN0IsQ0FBQztRQUVELFdBQVcsR0FBRyxlQUFlLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXBELG1CQUFtQixHQUFHLCtCQUErQixDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU5RSxNQUFNLENBQUMsbUJBQW1CLENBQUM7SUFFN0IsQ0FBQztJQUVELCtCQUFzQyxZQUEwQixFQUM5RCxVQUFrQixFQUNsQixTQUFpQjtRQUVqQixJQUFNLFdBQVcsR0FBaUIsa0JBQWtCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN6RixJQUFJLFNBQVMsR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFekcsMkJBQTJCLFNBQVM7WUFDbEMsU0FBUztpQkFDTixJQUFJLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQztpQkFDNUIsSUFBSSxDQUFDLEdBQUcsRUFBRSxVQUFDLENBQWE7Z0JBQ3ZCLE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNsRCxDQUFDLENBQUM7aUJBQ0QsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDVCxNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUM7aUJBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxVQUFDLENBQWE7Z0JBQzVCLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztZQUNsQyxDQUFDLENBQUM7aUJBQ0QsSUFBSSxDQUFDLE9BQU8sRUFBRSxVQUFDLENBQWE7Z0JBQzNCLE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMzRixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFFRCxrQkFBa0I7UUFDbEIsU0FBUyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRWxDLGVBQWU7UUFDZixTQUFTLENBQUMsS0FBSyxFQUFFO2FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQzthQUNkLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRTNCLGtCQUFrQjtRQUNsQixTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDNUIsQ0FBQztJQWxDZSw0QkFBcUIsd0JBa0NwQyxDQUFBO0FBRUgsQ0FBQyxFQXJKUyxNQUFNLEtBQU4sTUFBTSxRQXFKZjs7QUN2SkQsK0NBQStDO0FBQy9DLElBQVUsTUFBTSxDQStkZjtBQS9kRCxXQUFVLE1BQU0sRUFBQyxDQUFDO0lBQ2hCLFlBQVksQ0FBQztJQUliLElBQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUVsRDtRQU1FLHFCQUFtQixLQUFhO1lBQWIsVUFBSyxHQUFMLEtBQUssQ0FBUTtZQUM5QixRQUFRO1FBQ1YsQ0FBQztRQUVNLDhCQUFRLEdBQWY7WUFDRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUNwQixDQUFDO1FBVmEsY0FBRSxHQUFHLElBQUksQ0FBQztRQUNWLGdCQUFJLEdBQUcsTUFBTSxDQUFDO1FBQ2QsbUJBQU8sR0FBRyxTQUFTLENBQUM7UUFTcEMsa0JBQUM7SUFBRCxDQWJBLEFBYUMsSUFBQTtJQWJZLGtCQUFXLGNBYXZCLENBQUE7SUF1QkQ7UUFFRSxtQ0FBbUIsS0FBYSxFQUN2QixHQUFXLEVBQ1gsS0FBYSxFQUNiLFNBQWdCLEVBQ2hCLE9BQWMsRUFDZCxRQUFpQixFQUNqQixPQUFnQjtZQU5OLFVBQUssR0FBTCxLQUFLLENBQVE7WUFDdkIsUUFBRyxHQUFILEdBQUcsQ0FBUTtZQUNYLFVBQUssR0FBTCxLQUFLLENBQVE7WUFDYixjQUFTLEdBQVQsU0FBUyxDQUFPO1lBQ2hCLFlBQU8sR0FBUCxPQUFPLENBQU87WUFDZCxhQUFRLEdBQVIsUUFBUSxDQUFTO1lBQ2pCLFlBQU8sR0FBUCxPQUFPLENBQVM7WUFFdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN0RCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDL0IsQ0FBQztRQUVILGdDQUFDO0lBQUQsQ0FmQSxBQWVDLElBQUE7SUFmWSxnQ0FBeUIsNEJBZXJDLENBQUE7SUFFRDtRQXNCRSxvQ0FBWSxVQUFnQztZQXRCOUMsaUJBZ2FDO1lBM1pRLGFBQVEsR0FBRyxHQUFHLENBQUM7WUFDZixZQUFPLEdBQUcsSUFBSSxDQUFDO1lBRXRCLHNFQUFzRTtZQUMvRCxVQUFLLEdBQUc7Z0JBQ2IsSUFBSSxFQUFFLEdBQUc7Z0JBQ1QsY0FBYyxFQUFFLEdBQUc7Z0JBQ25CLFlBQVksRUFBRSxHQUFHO2dCQUNqQixTQUFTLEVBQUUsR0FBRztnQkFDZCxTQUFTLEVBQUUsR0FBRztnQkFDZCxVQUFVLEVBQUUsR0FBRzthQUNoQixDQUFDO1lBUUEsSUFBSSxDQUFDLElBQUksR0FBRyxVQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsS0FBSztnQkFFaEMscUJBQXFCO2dCQUNyQixJQUFJLGNBQWMsR0FBVyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQ2hELFlBQVksR0FBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQzFDLFdBQVcsR0FBRywwQkFBMEIsQ0FBQyxhQUFhLENBQUM7Z0JBRXpELHNCQUFzQjtnQkFDdEIsSUFBSSxNQUFNLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQ3JELEtBQUssR0FBRywwQkFBMEIsQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsS0FBSyxFQUM1RSxtQkFBbUIsR0FBRyxXQUFXLEdBQUcsRUFBRSxFQUN0QyxNQUFNLEdBQUcsbUJBQW1CLEdBQUcsTUFBTSxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUN6RCxXQUFXLEdBQUcsRUFBRSxFQUNoQixVQUFVLEdBQUcsRUFBRSxFQUNmLGdCQUFnQixHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxHQUFHLFdBQVcsR0FBRyxVQUFVLEVBQ2pFLG9CQUFvQixHQUFHLENBQUMsV0FBVyxHQUFHLFVBQVUsR0FBRyxNQUFNLENBQUMsR0FBRyxFQUM3RCxNQUFNLEVBQ04sU0FBUyxFQUNULEtBQUssRUFDTCxLQUFLLEVBQ0wsVUFBVSxFQUNWLEtBQUssRUFDTCxVQUFVLEVBQ1YsR0FBRyxFQUNILEtBQUssRUFDTCxXQUFXLEVBQ1gsR0FBRyxDQUFDO2dCQUVOLHlCQUF5QixDQUE2QjtvQkFDcEQsTUFBTSxDQUFDLDRLQUc2QixDQUFDLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxxTUFJckIsQ0FBQyxDQUFDLFFBQVEsa0RBRXZDLENBQUM7Z0JBQ1YsQ0FBQztnQkFFRDtvQkFDRSw4QkFBOEI7b0JBQzlCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7d0JBQ1YsV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDdEMsQ0FBQztvQkFDRCxXQUFXLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDcEMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO3lCQUM5QixJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxlQUFlLENBQUMsQ0FBQztvQkFFL0UsR0FBRyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUU7eUJBQ1gsSUFBSSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUM7eUJBQ3ZCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO3lCQUNoQixJQUFJLENBQUMsVUFBQyxDQUE2Qjt3QkFDbEMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsQ0FBQyxDQUFDLENBQUM7b0JBRUwsR0FBRyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO3lCQUNwQixJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUM7eUJBQ2pELElBQUksQ0FBQyxRQUFRLEVBQUUsZ0JBQWdCLENBQUM7eUJBQ2hDLElBQUksQ0FBQyxXQUFXLEVBQUUsWUFBWSxHQUFHLE1BQU0sQ0FBQyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsb0JBQW9CLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztvQkFFdEYsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7eUJBQ2YsTUFBTSxDQUFDLFNBQVMsQ0FBQzt5QkFDakIsSUFBSSxDQUFDLElBQUksRUFBRSxrQkFBa0IsQ0FBQzt5QkFDOUIsSUFBSSxDQUFDLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQzt5QkFDdEMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLFlBQVksQ0FBQzt5QkFDdEMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7eUJBQ2hCLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO3lCQUNqQixNQUFNLENBQUMsTUFBTSxDQUFDO3lCQUNkLElBQUksQ0FBQyxHQUFHLEVBQUUsbUNBQW1DLENBQUM7eUJBQzlDLElBQUksQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDO3lCQUN6QixJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUU3QixHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNoQixDQUFDO2dCQUVELDZCQUE2Qix5QkFBdUQ7b0JBQ2xGLElBQUksaUJBQWlCLEdBQWEsRUFBRSxDQUFDO29CQUVyQyxjQUFjLEdBQUcsQ0FBQyxLQUFLLENBQUMsY0FBYzt3QkFDcEMsRUFBRSxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxVQUFDLENBQTZCOzRCQUM5RCxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQzt3QkFDakIsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUV0QyxFQUFFLENBQUMsQ0FBQyx5QkFBeUIsSUFBSSx5QkFBeUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFFdEUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEdBQUcsY0FBYyxDQUFDO3dCQUN0QyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFFakQsTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFOzZCQUN2QixLQUFLLENBQUMsSUFBSSxDQUFDOzZCQUNYLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQzs2QkFDbkIsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBRXBCLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTs2QkFDbEIsS0FBSyxDQUFDLE1BQU0sQ0FBQzs2QkFDYixLQUFLLENBQUMsQ0FBQyxDQUFDOzZCQUNSLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDOzZCQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQzt3QkFFbEIsU0FBUyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFOzZCQUN4QixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7NkJBQ2pCLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO3dCQUU3QixLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7NkJBQ2xCLEtBQUssQ0FBQyxTQUFTLENBQUM7NkJBQ2hCLFFBQVEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7NkJBQ2hCLE1BQU0sQ0FBQyxLQUFLLENBQUM7NkJBQ2IsVUFBVSxDQUFDLHVCQUFnQixFQUFFLENBQUMsQ0FBQztvQkFFcEMsQ0FBQztnQkFDSCxDQUFDO2dCQUVELGNBQWMsQ0FBNkI7b0JBQ3pDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLFdBQVcsQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQy9DLENBQUM7Z0JBRUQsa0RBQWtEO2dCQUNsRCxtREFBbUQ7Z0JBQ25ELEdBQUc7Z0JBRUgsbUJBQW1CLENBQTZCO29CQUM5QyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNwRCxDQUFDO2dCQUVELHFDQUFxQyxXQUE4QjtvQkFDakUsSUFBSSxVQUFVLEdBQWlDLEVBQUUsQ0FBQztvQkFDbEQsSUFBSSxTQUFTLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztvQkFFbkMseUJBQXlCLENBQWtCLEVBQUUsQ0FBa0I7d0JBQzdELEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7NEJBQzlCLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDWixDQUFDO3dCQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7NEJBQzlCLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQ1gsQ0FBQzt3QkFDRCxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUNYLENBQUM7b0JBRUQsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztvQkFFbEMsRUFBRSxDQUFDLENBQUMsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLElBQUksV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7d0JBQzdELElBQUksR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBRS9CLEVBQUUsQ0FBQyxDQUFDLFNBQVMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUNwQixJQUFJLFNBQVMsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBRS9CLHNGQUFzRjs0QkFDdEYsOEJBQThCOzRCQUM5QixVQUFVLENBQUMsSUFBSSxDQUFDLElBQUkseUJBQXlCLENBQUMsR0FBRyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxFQUNoRSxTQUFTLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDOzRCQUN4RCw2Q0FBNkM7NEJBQzdDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSx5QkFBeUIsQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzt3QkFDNUYsQ0FBQzt3QkFBQyxJQUFJLENBQUMsQ0FBQzs0QkFDTixJQUFJLGdCQUFnQixHQUFHLEdBQUcsQ0FBQzs0QkFFM0IsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0NBQzVDLHVEQUF1RDtnQ0FDdkQsaURBQWlEO2dDQUNqRCxhQUFhO2dDQUNiLEdBQUc7Z0NBQ0gsRUFBRSxDQUFDLENBQUMsY0FBYyxJQUFJLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztvQ0FDbkQsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUF5QixDQUFDLGNBQWMsRUFDMUQsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29DQUMvQyxLQUFLLENBQUM7Z0NBQ1IsQ0FBQztnQ0FBQyxJQUFJLENBQUMsQ0FBQztvQ0FDTixVQUFVLENBQUMsSUFBSSxDQUFDLElBQUkseUJBQXlCLENBQUMsV0FBVyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQ3hFLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQ0FDL0MsZ0JBQWdCLEdBQUcsV0FBVyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7Z0NBQ2xELENBQUM7NEJBQ0gsQ0FBQzt3QkFDSCxDQUFDO29CQUNILENBQUM7b0JBQ0QsTUFBTSxDQUFDLFVBQVUsQ0FBQztnQkFDcEIsQ0FBQztnQkFFRDtvQkFDRSxnQ0FBZ0M7b0JBQ2hDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO3lCQUNmLElBQUksQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDO3lCQUM3QixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO3lCQUNkLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO3lCQUNiLEtBQUssQ0FBQyxhQUFhLEVBQUUsNkJBQTZCLENBQUM7eUJBQ25ELEtBQUssQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDO3lCQUMxQixJQUFJLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQzt5QkFDcEIsS0FBSyxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUM7eUJBQzNCLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFFZCxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQzt5QkFDZixJQUFJLENBQUMsT0FBTyxFQUFFLGdCQUFnQixDQUFDO3lCQUMvQixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO3lCQUNkLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO3lCQUNiLEtBQUssQ0FBQyxhQUFhLEVBQUUsNkJBQTZCLENBQUM7eUJBQ25ELEtBQUssQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDO3lCQUMxQixJQUFJLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQzt5QkFDcEIsS0FBSyxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUM7eUJBQzNCLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFbEIsQ0FBQztnQkFFRCxpQ0FBaUMseUJBQXVEO29CQUN0Rix1RkFBdUY7b0JBQ3ZGLG9CQUFvQjtvQkFDcEIsS0FBSztvQkFDTCxJQUFJLFFBQVEsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLFVBQUMsQ0FBNkI7d0JBQzdFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7b0JBQ2hCLENBQUMsQ0FBQyxDQUFDO29CQUVILElBQUksY0FBYyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFO3lCQUNqQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7eUJBQ2pCLE1BQU0sQ0FBQyxDQUFDLGNBQWMsRUFBRSxZQUFZLElBQUksUUFBUSxDQUFDLENBQUMsRUFFbkQsTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFO3lCQUN2QixLQUFLLENBQUMsSUFBSSxDQUFDO3lCQUNYLEtBQUssQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQzt5QkFDbEIsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBRXBCLDRCQUE0QjtvQkFDNUIsMEJBQTBCO29CQUMxQixhQUFhO29CQUNiLG9CQUFvQjtvQkFDcEIsbUJBQW1CO29CQUVuQix3REFBd0Q7b0JBQ3hELDJDQUEyQztvQkFDM0Msa0JBQWtCLENBQTZCO3dCQUM3QyxNQUFNLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztvQkFDbkUsQ0FBQztvQkFFRCxnRUFBZ0U7b0JBQ2hFLHVEQUF1RDtvQkFDdkQsdUJBQXVCLENBQTZCO3dCQUNsRCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztvQkFDOUMsQ0FBQztvQkFFRCxxQkFBcUIsQ0FBNkI7d0JBQ2hELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ1osTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVE7d0JBQzVCLENBQUM7d0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ3hCLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLGVBQWU7d0JBQ2xELENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ04sTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU07d0JBQzFCLENBQUM7b0JBQ0gsQ0FBQztvQkFFRCxHQUFHLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDO3lCQUM1QixJQUFJLENBQUMseUJBQXlCLENBQUM7eUJBQy9CLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7eUJBQ3RCLElBQUksQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDO3lCQUMxQixJQUFJLENBQUMsR0FBRyxFQUFFLFVBQUMsQ0FBNkI7d0JBQ3ZDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ2xDLENBQUMsQ0FBQzt5QkFDRCxJQUFJLENBQUMsR0FBRyxFQUFFLFVBQUMsQ0FBNkI7d0JBQ3ZDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3JCLENBQUMsQ0FBQzt5QkFDRCxJQUFJLENBQUMsUUFBUSxFQUFFLFVBQUMsQ0FBQzt3QkFDaEIsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDMUIsQ0FBQyxDQUFDO3lCQUNELElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBQyxDQUE2Qjt3QkFDM0MsSUFBSSxJQUFJLEdBQUcsWUFBWSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsWUFBWSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUN0RSxNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDekQsQ0FBQyxDQUFDO3lCQUNELElBQUksQ0FBQyxNQUFNLEVBQUUsVUFBQyxDQUE2Qjt3QkFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDeEIsQ0FBQyxDQUFDO3lCQUNELElBQUksQ0FBQyxTQUFTLEVBQUU7d0JBQ2YsTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDZCxDQUFDLENBQUM7eUJBQ0QsRUFBRSxDQUFDLFdBQVcsRUFBRSxVQUFDLENBQUMsRUFBRSxDQUFDO3dCQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDakIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRTt3QkFDaEIsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO29CQUNiLENBQUMsQ0FBQzt5QkFDRCxFQUFFLENBQUMsV0FBVyxFQUFFO3dCQUNmLElBQUksU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQzVDLElBQUksVUFBVSxHQUFRLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO3dCQUM3QyxVQUFVLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO3dCQUNsQyxVQUFVLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDO3dCQUN0QyxVQUFVLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO3dCQUNsQyxVQUFVLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDO3dCQUN0QyxTQUFTLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUN0QyxDQUFDLENBQUM7eUJBQ0QsRUFBRSxDQUFDLFNBQVMsRUFBRTt3QkFDYixJQUFJLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUM1QyxJQUFJLFVBQVUsR0FBUSxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQzt3QkFDM0MsVUFBVSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQzt3QkFDbEMsVUFBVSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQzt3QkFDdEMsVUFBVSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQzt3QkFDbEMsVUFBVSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQzt3QkFDdEMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDdEMsQ0FBQyxDQUFDLENBQUM7b0JBRUwsNENBQTRDO29CQUM1QyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQzt5QkFDZixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQzt5QkFDYixJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQzt5QkFDZCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQzt5QkFDZixJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQzt5QkFDZCxJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsQ0FBQzt5QkFDekIsSUFBSSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFFN0IscUJBQXFCLEVBQUUsQ0FBQztnQkFDMUIsQ0FBQztnQkFFRDtvQkFFRSxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUVqQyxnQkFBZ0I7b0JBQ2hCLFVBQVUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQzt5QkFDekIsSUFBSSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUM7eUJBQ3ZCLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFFZixnQkFBZ0I7b0JBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO3lCQUNaLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDO3lCQUN2QixJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2pCLENBQUM7Z0JBRUQ7b0JBRUUsS0FBSyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFO3lCQUNuQixDQUFDLENBQUMsU0FBUyxDQUFDO3lCQUNaLEVBQUUsQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDO3lCQUM1QixFQUFFLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO29CQUU1QixVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7eUJBQ3pCLElBQUksQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDO3lCQUN0QixJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBRWYsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBRS9DLFVBQVUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO3lCQUN6QixJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUV0Qjt3QkFDRSxHQUFHLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDakMsQ0FBQztvQkFFRDt3QkFDRSxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQ3pCLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUMzQyxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsRUFDekMsa0JBQWtCLEdBQUcsT0FBTyxHQUFHLFNBQVMsQ0FBQzt3QkFFM0MscURBQXFEO3dCQUNyRCxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDOzRCQUNoQyxVQUFVLENBQUMsVUFBVSxDQUFDLGlCQUFVLENBQUMsNkJBQTZCLENBQUMsUUFBUSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7d0JBQ3JGLENBQUM7d0JBQ0QsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztvQkFDakMsQ0FBQztnQkFDSCxDQUFDO2dCQUVELEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsVUFBQyxPQUFPO29CQUNyQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO3dCQUNaLEtBQUksQ0FBQyxxQkFBcUIsR0FBRywyQkFBMkIsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7d0JBQ3BGLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7b0JBQzNDLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLGdCQUFnQixFQUFFLGNBQWMsQ0FBQyxFQUFFLFVBQUMsWUFBWTtvQkFDakUsY0FBYyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLGNBQWMsQ0FBQztvQkFDcEQsWUFBWSxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLFlBQVksQ0FBQztvQkFDaEQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDM0MsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsS0FBSyxDQUFDLE1BQU0sR0FBRyxVQUFDLHlCQUF1RDtvQkFDckUsRUFBRSxDQUFDLENBQUMseUJBQXlCLElBQUkseUJBQXlCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3RFLG1DQUFtQzt3QkFDbkMscUNBQXFDO3dCQUNyQyxpQkFBaUIsRUFBRSxDQUFDO3dCQUNwQixtQkFBbUIsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO3dCQUMvQyxlQUFlLEVBQUUsQ0FBQzt3QkFDbEIsZ0JBQWdCLEVBQUUsQ0FBQzt3QkFDbkIsdUJBQXVCLENBQUMseUJBQXlCLENBQUMsQ0FBQztvQkFFckQsQ0FBQztnQkFDSCxDQUFDLENBQUM7WUFDSixDQUFDLENBQUM7UUFDSixDQUFDO1FBRWEsa0NBQU8sR0FBckI7WUFDRSxJQUFJLFNBQVMsR0FBRyxVQUFDLFVBQWdDO2dCQUMvQyxNQUFNLENBQUMsSUFBSSwwQkFBMEIsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNwRCxDQUFDLENBQUM7WUFFRixTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUV0QyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ25CLENBQUM7UUE1WmMsd0NBQWEsR0FBRyxHQUFHLENBQUM7UUFDcEIsdUNBQVksR0FBRyxHQUFHLENBQUM7UUE2WnBDLGlDQUFDO0lBQUQsQ0FoYUEsQUFnYUMsSUFBQTtJQWhhWSxpQ0FBMEIsNkJBZ2F0QyxDQUFBO0lBRUQsT0FBTyxDQUFDLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSwwQkFBMEIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQy9FLENBQUMsRUEvZFMsTUFBTSxLQUFOLE1BQU0sUUErZGY7O0FDaGVELCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0F5UmY7QUF6UkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFHYixJQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFFbEQ7UUFvQkUsK0JBQVksVUFBZ0M7WUFwQjlDLGlCQWdSQztZQXpRUSxhQUFRLEdBQUcsR0FBRyxDQUFDO1lBQ2YsWUFBTyxHQUFHLElBQUksQ0FBQztZQUV0QixzRUFBc0U7WUFDL0QsVUFBSyxHQUFHO2dCQUNiLElBQUksRUFBRSxHQUFHO2dCQUNULGVBQWUsRUFBRSxHQUFHO2FBQ3JCLENBQUM7WUFRQSxJQUFJLENBQUMsSUFBSSxHQUFHLFVBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLO2dCQUVoQyxJQUFNLE1BQU0sR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQztnQkFFekQscUJBQXFCO2dCQUNyQixJQUFJLFdBQVcsR0FBRyxxQkFBcUIsQ0FBQyxrQkFBa0IsRUFDeEQsS0FBSyxHQUFHLHFCQUFxQixDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLEtBQUssRUFDNUUsTUFBTSxHQUFHLFdBQVcsR0FBRyxNQUFNLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQ2pELHdCQUF3QixHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEdBQUcsRUFBRSxFQUNuRSxnQkFBZ0IsR0FBRyxNQUFNLEdBQUcsTUFBTSxDQUFDLEdBQUcsRUFDdEMsZUFBd0IsRUFDeEIsTUFBTSxFQUNOLEtBQUssRUFDTCxVQUFVLEVBQ1YsU0FBUyxFQUNULEtBQUssRUFDTCxVQUFVLEVBQ1YsS0FBSyxFQUNMLFVBQVUsRUFDVixLQUFLLEVBQ0wsV0FBVyxFQUNYLEdBQUcsQ0FBQztnQkFFTixFQUFFLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQyxlQUFlLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQztvQkFDakQsZUFBZSxHQUFHLEtBQUssQ0FBQyxlQUFlLEtBQUssTUFBTSxDQUFDO2dCQUNyRCxDQUFDO2dCQUVEO29CQUNFLDhCQUE4QjtvQkFDOUIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzt3QkFDVixXQUFXLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUN0QyxDQUFDO29CQUNELFdBQVcsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUVwQyxJQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO29CQUV6QyxLQUFLLEdBQVMsVUFBVyxDQUFDLFdBQVcsQ0FBQztvQkFDdEMsTUFBTSxHQUFTLFVBQVcsQ0FBQyxZQUFZLENBQUM7b0JBRXhDLHdCQUF3QixHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEdBQUcscUJBQXFCLENBQUMsYUFBYTt3QkFFbEcseUNBQXlDO3dCQUN6QywyQ0FBMkM7d0JBRTNDLGdCQUFnQixHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDO29CQUV6QyxLQUFLLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7eUJBQzlCLElBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQzt5QkFDakQsSUFBSSxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO29CQUVwQyxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7eUJBQ3BCLElBQUksQ0FBQyxXQUFXLEVBQUUsWUFBWSxHQUFHLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDO3lCQUN0RCxJQUFJLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQyxDQUFDO2dCQUVuQyxDQUFDO2dCQUVELDRCQUE0QixVQUE2QjtvQkFFdkQsU0FBUyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFO3lCQUN4QixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDO3lCQUN0QixJQUFJLEVBQUU7eUJBQ04sTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUVsRixLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7eUJBQ2xCLEtBQUssQ0FBQyxTQUFTLENBQUM7eUJBQ2hCLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3lCQUNkLFVBQVUsQ0FBQyx1QkFBZ0IsRUFBRSxDQUFDO3lCQUM5QixNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBRXBCLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBRWpDLFVBQVUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQzt5QkFDekIsSUFBSSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUM7eUJBQ3ZCLElBQUksQ0FBQyxXQUFXLEVBQUUsY0FBYyxHQUFHLHdCQUF3QixHQUFHLEdBQUcsQ0FBQzt5QkFDbEUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUVmLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFVBQUMsQ0FBQzt3QkFDOUIsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7b0JBQ2YsQ0FBQyxDQUFDLENBQUM7b0JBQ0gsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsVUFBQyxDQUFDO3dCQUM5QixNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztvQkFDZixDQUFDLENBQUMsQ0FBQztvQkFFSCwwREFBMEQ7b0JBQzFELElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUM7b0JBQzVCLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUM7b0JBRTVCLE1BQU0sR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRTt5QkFDdkIsVUFBVSxDQUFDLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7eUJBQ3pDLElBQUksRUFBRTt5QkFDTixNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFFeEIsSUFBSSxhQUFhLEdBQUcsZUFBZSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBRTVDLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTt5QkFDbEIsS0FBSyxDQUFDLE1BQU0sQ0FBQzt5QkFDYixLQUFLLENBQUMsYUFBYSxDQUFDO3lCQUNwQixRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzt5QkFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBRWxCLFVBQVUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQzt5QkFDekIsSUFBSSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUM7eUJBQ3ZCLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFFZixJQUFJLElBQUksR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTt5QkFDckIsV0FBVyxDQUFDLFVBQVUsQ0FBQzt5QkFDdkIsT0FBTyxDQUFDLFVBQUMsQ0FBTTt3QkFDZCxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO29CQUNsQixDQUFDLENBQUM7eUJBQ0QsQ0FBQyxDQUFDLFVBQUMsQ0FBTTt3QkFDUixNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDaEMsQ0FBQyxDQUFDO3lCQUNELEVBQUUsQ0FBQyxVQUFDLENBQU07d0JBQ1QsTUFBTSxDQUFDLHdCQUF3QixDQUFDO29CQUNsQyxDQUFDLENBQUM7eUJBQ0QsRUFBRSxDQUFDLFVBQUMsQ0FBTTt3QkFDVCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDdkIsQ0FBQyxDQUFDLENBQUM7b0JBRUwsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7eUJBQzVCLFdBQVcsQ0FBQyxVQUFVLENBQUM7eUJBQ3ZCLE9BQU8sQ0FBQyxVQUFDLENBQU07d0JBQ2QsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztvQkFDbEIsQ0FBQyxDQUFDO3lCQUNELENBQUMsQ0FBQyxVQUFDLENBQU07d0JBQ1IsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ2hDLENBQUMsQ0FBQzt5QkFDRCxDQUFDLENBQUMsVUFBQyxDQUFNO3dCQUNSLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUN2QixDQUFDLENBQUMsQ0FBQztvQkFFTCxJQUFJLGVBQWUsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztvQkFFM0Usa0JBQWtCO29CQUNsQixlQUFlLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUM7eUJBQ3pDLFVBQVUsRUFBRTt5QkFDWixJQUFJLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUUxQixlQUFlO29CQUNmLGVBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO3lCQUNuQyxJQUFJLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQzt5QkFDNUIsVUFBVSxFQUFFO3lCQUNaLElBQUksQ0FBQyxHQUFHLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBRTFCLGtCQUFrQjtvQkFDbEIsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUVoQyxJQUFJLFdBQVcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQzt5QkFDOUIsSUFBSSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFFNUIsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7eUJBQ3ZCLEtBQUssQ0FBQyxVQUFVLENBQUM7eUJBQ2pCLFVBQVUsRUFBRTt5QkFDWixRQUFRLENBQUMsR0FBRyxDQUFDO3lCQUNiLElBQUksQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDO3lCQUM1QixJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUVyQixDQUFDO2dCQUVEO29CQUVFLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRTt5QkFDbkIsQ0FBQyxDQUFDLFNBQVMsQ0FBQzt5QkFDWixFQUFFLENBQUMsWUFBWSxFQUFFLGlCQUFpQixDQUFDO3lCQUNuQyxFQUFFLENBQUMsVUFBVSxFQUFFLGVBQWUsQ0FBQyxDQUFDO29CQUVuQyxVQUFVLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQzt5QkFDbkIsU0FBUyxDQUFDLE1BQU0sQ0FBQzt5QkFDakIsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7eUJBQ1osSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUM7b0JBRS9CLFVBQVUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQzt5QkFDekIsSUFBSSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7eUJBQ3RCLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFFZixVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFFL0MsVUFBVSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7eUJBQ3pCLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO29CQUUvQjt3QkFDRSxHQUFHLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDakMsQ0FBQztvQkFFRDt3QkFDRSxJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQzlCLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUNoRCxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsRUFDOUMsa0JBQWtCLEdBQUcsT0FBTyxHQUFHLFNBQVMsQ0FBQzt3QkFFM0MsNENBQTRDO3dCQUM1QyxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDOzRCQUNoQyxVQUFVLENBQUMsVUFBVSxDQUFDLGlCQUFVLENBQUMsK0JBQStCLENBQUMsUUFBUSxFQUFFLEVBQUUsV0FBVyxDQUFDLENBQUM7d0JBQzVGLENBQUM7d0JBQ0QsaUNBQWlDO29CQUNuQyxDQUFDO2dCQUNILENBQUM7Z0JBRUQsZ0VBQWdFO2dCQUVoRSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFVBQUMsT0FBTztvQkFDckMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzt3QkFDWixLQUFJLENBQUMsVUFBVSxHQUFHLHlCQUF5QixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzt3QkFDdkUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ2hDLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsbUNBQW1DLFFBQVE7b0JBQ3pDLCtDQUErQztvQkFDL0MsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQzt3QkFDYixNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxVQUFDLEtBQXNCOzRCQUN6QyxJQUFJLFNBQVMsR0FBaUIsS0FBSyxDQUFDLFNBQVMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzs0QkFDL0YsTUFBTSxDQUFDO2dDQUNMLFNBQVMsRUFBRSxTQUFTO2dDQUNwQiw0QkFBNEI7Z0NBQzVCLEtBQUssRUFBRSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLFNBQVMsR0FBRyxLQUFLLENBQUMsS0FBSztnQ0FDL0QsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLFNBQVMsR0FBRyxLQUFLLENBQUMsR0FBRztnQ0FDMUMsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxHQUFHLEtBQUssQ0FBQyxHQUFHO2dDQUN6RCxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxTQUFTLEdBQUcsS0FBSyxDQUFDLEdBQUc7Z0NBQ3pELEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSzs2QkFDbkIsQ0FBQzt3QkFDSixDQUFDLENBQUMsQ0FBQztvQkFDTCxDQUFDO2dCQUNILENBQUM7Z0JBRUQsS0FBSyxDQUFDLE1BQU0sR0FBRyxVQUFDLFVBQTZCO29CQUMzQyxFQUFFLENBQUMsQ0FBQyxVQUFVLElBQUksVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN4QyxPQUFPLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7d0JBRW5DLHFDQUFxQzt3QkFDckMsTUFBTSxFQUFFLENBQUM7d0JBQ1Qsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUM7d0JBQy9CLGdCQUFnQixFQUFFLENBQUM7d0JBQ25CLE9BQU8sQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztvQkFDeEMsQ0FBQztnQkFDSCxDQUFDLENBQUM7WUFDSixDQUFDLENBQUM7UUFFSixDQUFDO1FBRWEsNkJBQU8sR0FBckI7WUFDRSxJQUFJLFNBQVMsR0FBRyxVQUFDLFVBQWdDO2dCQUMvQyxNQUFNLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMvQyxDQUFDLENBQUM7WUFFRixTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUV0QyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ25CLENBQUM7UUE1UUQsMENBQTBDO1FBQzNCLHVDQUFpQixHQUFHLEdBQUcsQ0FBQztRQUN4Qix3Q0FBa0IsR0FBRyxFQUFFLENBQUM7UUFDeEIsbUNBQWEsR0FBRyxFQUFFLENBQUM7UUEyUXBDLDRCQUFDO0lBQUQsQ0FoUkEsQUFnUkMsSUFBQTtJQWhSWSw0QkFBcUIsd0JBZ1JqQyxDQUFBO0lBRUQsT0FBTyxDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsRUFBRSxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQzdFLENBQUMsRUF6UlMsTUFBTSxLQUFOLE1BQU0sUUF5UmY7O0FDM1JELEdBQUc7QUFDSCxzREFBc0Q7QUFDdEQsNERBQTREO0FBQzVELEdBQUc7QUFDSCxtRUFBbUU7QUFDbkUsb0VBQW9FO0FBQ3BFLDJDQUEyQztBQUMzQyxHQUFHO0FBQ0gsaURBQWlEO0FBQ2pELEdBQUc7QUFDSCx1RUFBdUU7QUFDdkUscUVBQXFFO0FBQ3JFLDRFQUE0RTtBQUM1RSx1RUFBdUU7QUFDdkUsa0NBQWtDO0FBQ2xDLEdBQUc7QUFDSCwrQ0FBK0M7QUFFL0MsSUFBVSxNQUFNLENBbUJmO0FBbkJELFdBQVUsTUFBTSxFQUFDLENBQUM7SUFDaEIsWUFBWSxDQUFDO0lBRWIsc0VBQXNFO0lBQ3RFO1FBTUUsb0JBQW1CLEtBQWE7WUFBYixVQUFLLEdBQUwsS0FBSyxDQUFRO1lBQzlCLFFBQVE7UUFDVixDQUFDO1FBRU0sNkJBQVEsR0FBZjtZQUNFLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3BCLENBQUM7UUFWYSxrQ0FBdUIsR0FBRyxJQUFJLFVBQVUsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ2xFLHdDQUE2QixHQUFHLElBQUksVUFBVSxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDN0UsMENBQStCLEdBQUcsSUFBSSxVQUFVLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQVNqRyxpQkFBQztJQUFELENBYkEsQUFhQyxJQUFBO0lBYlksaUJBQVUsYUFhdEIsQ0FBQTtBQUVILENBQUMsRUFuQlMsTUFBTSxLQUFOLE1BQU0sUUFtQmY7O0FDckNELCtDQUErQztBQUMvQyxJQUFVLE1BQU0sQ0FpRGY7QUFqREQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFFYjs7Ozs7OztPQU9HO0lBQ0gsMEJBQWlDLEdBQVEsRUFDdkMsU0FBYyxFQUNkLE1BQVcsRUFDWCxHQUFRLEVBQ1IsVUFBNkI7UUFDN0IsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ2YsSUFBSSxZQUFZLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbkUsa0JBQWtCO1FBQ2xCLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQzthQUN2QyxJQUFJLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQzthQUNqQixJQUFJLENBQUMsSUFBSSxFQUFFLFVBQVMsQ0FBQztZQUNwQixNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNoQyxDQUFDLENBQUM7YUFDRCxJQUFJLENBQUMsSUFBSSxFQUFFLFVBQVMsQ0FBQztZQUNwQixNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDO1FBQzFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsVUFBUyxDQUFDLEVBQUUsQ0FBQztZQUM5QixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFO1lBQ2hCLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDO1FBQ0wsZUFBZTtRQUNmLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO2FBQ2xDLElBQUksQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDO2FBQzdCLElBQUksQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDO2FBQ2pCLElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBUyxDQUFDO1lBQ3BCLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2hDLENBQUMsQ0FBQzthQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBUyxDQUFDO1lBQ3BCLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxVQUFTLENBQUMsRUFBRSxDQUFDO1lBQzlCLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUU7WUFDaEIsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2IsQ0FBQyxDQUFDLENBQUM7UUFDTCxrQkFBa0I7UUFDbEIsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFwQ2UsdUJBQWdCLG1CQW9DL0IsQ0FBQTtBQUVILENBQUMsRUFqRFMsTUFBTSxLQUFOLE1BQU0sUUFpRGY7O0FDbERELCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0FtRWY7QUFuRUQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFFYiw0QkFBNEIsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU07UUFDN0QsSUFBSSxXQUFXLEdBQUcsZ0JBQWdCLElBQUksVUFBVSxFQUM5QyxJQUFJLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7YUFDakIsV0FBVyxDQUFDLFdBQVcsQ0FBQzthQUN4QixDQUFDLENBQUMsVUFBQyxDQUFNO1lBQ1IsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDaEMsQ0FBQyxDQUFDO2FBQ0QsQ0FBQyxDQUFDLFVBQUMsQ0FBTTtZQUNSLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pCLENBQUMsQ0FBQyxDQUFDO1FBRVAsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRCwwQkFBaUMsWUFBaUMsRUFBRSxZQUEwQjtRQUM1RixJQUFJLGNBQWMsRUFDaEIsaUJBQWlCLEdBQUcsWUFBWSxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFNUQsY0FBYyxHQUFHLGlCQUFpQixDQUFDLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxHQUFHLENBQUM7UUFFaEUsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUNuQixJQUNFLE9BQU8sR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTtpQkFDcEIsV0FBVyxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUM7aUJBQ3ZDLE9BQU8sQ0FBQyxVQUFDLENBQU07Z0JBQ2QsTUFBTSxDQUFDLENBQUMsdUJBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUIsQ0FBQyxDQUFDO2lCQUNELENBQUMsQ0FBQyxVQUFDLENBQU07Z0JBQ1IsTUFBTSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzdDLENBQUMsQ0FBQztpQkFDRCxDQUFDLENBQUMsVUFBQyxDQUFNO2dCQUNSLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxDQUFDLENBQUM7aUJBQ0QsRUFBRSxDQUFDLFVBQUMsQ0FBTTtnQkFDVCxNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsQ0FBQyxDQUFDLENBQUM7WUFFUCxJQUNFLHNCQUFzQixHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDNUYsa0JBQWtCO1lBQ2xCLHNCQUFzQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDO2lCQUM3QyxJQUFJLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3RCLGVBQWU7WUFDZixzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2lCQUMxQyxJQUFJLENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQztpQkFDekIsSUFBSSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN0QixrQkFBa0I7WUFDbEIsc0JBQXNCLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7UUFFekMsQ0FBQztRQUVELElBQUksZ0JBQWdCLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUN4RixrQkFBa0I7UUFDbEIsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUM7YUFDM0MsSUFBSSxDQUFDLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUMxRixlQUFlO1FBQ2YsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQzthQUNwQyxJQUFJLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQzthQUM3QixJQUFJLENBQUMsR0FBRyxFQUFFLGtCQUFrQixDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQzFGLGtCQUFrQjtRQUNsQixnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUVuQyxDQUFDO0lBaERlLHVCQUFnQixtQkFnRC9CLENBQUE7QUFFSCxDQUFDLEVBbkVTLE1BQU0sS0FBTixNQUFNLFFBbUVmOztBQ3JFRCwrQ0FBK0M7QUFFL0MsSUFBVSxNQUFNLENBdXpCZjtBQXZ6QkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUVoQixZQUFZLENBQUM7SUFLYixJQUFJLEtBQUssR0FBWSxLQUFLLENBQUM7SUFFM0IsMEVBQTBFO0lBQzdELHNCQUFlLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLG9CQUFhLEdBQUcsRUFBRSxDQUFDLENBQUMsc0JBQXNCO0lBQzFDLDZCQUFzQixHQUFHLG1CQUFtQixDQUFDO0lBQzdDLGFBQU0sR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLDZCQUE2QjtJQUcvRjs7Ozs7T0FLRztJQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUM7U0FDOUIsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDLFlBQVksRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNO1FBQ2hGLFVBQVMsVUFBZ0MsRUFDdkMsS0FBc0IsRUFDdEIsT0FBMEIsRUFDMUIsU0FBOEIsRUFDOUIsSUFBb0I7WUFFcEIsY0FBYyxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUs7Z0JBRWpDLHFCQUFxQjtnQkFDckIsSUFBSSxVQUFVLEdBQXNCLEVBQUUsRUFDcEMsZUFBa0MsRUFDbEMsa0JBQXVDLEVBQ3ZDLE9BQU8sR0FBRyxLQUFLLENBQUMsU0FBUyxFQUN6QixRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsSUFBSSxFQUFFLEVBQy9CLGNBQWMsR0FBRyxLQUFLLENBQUMsY0FBYyxJQUFJLEVBQUUsRUFDM0MsVUFBVSxHQUFHLEtBQUssQ0FBQyxVQUFVLElBQUksT0FBTyxFQUN4QyxrQkFBa0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsSUFBSSxLQUFLLEVBQ3ZELHdCQUF3QixHQUFHLENBQUMsS0FBSyxDQUFDLHdCQUF3QixJQUFJLElBQUksRUFDbEUsVUFBVSxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFDOUIsYUFBYSxHQUFHLEtBQUssQ0FBQyxhQUFhLElBQUksVUFBVSxFQUNqRCxZQUFZLEdBQWlCLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFDdkMsY0FBYyxHQUFpQixZQUFZLEdBQUcsa0JBQWtCLEVBQ2hFLHVCQUF1QixHQUFHLEVBQUUsRUFDNUIsY0FBYyxHQUFHLEVBQUUsRUFDbkIsU0FBUyxHQUFHLEtBQUssQ0FBQyxTQUFTLElBQUksTUFBTSxFQUNyQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUMsZ0JBQWdCLElBQUksV0FBVyxFQUN4RCxXQUFXLEdBQUcsS0FBSyxDQUFDLFdBQVcsSUFBSSxTQUFTLEVBQzVDLGFBQWEsR0FBRyxLQUFLLENBQUMsYUFBYSxJQUFJLFVBQVUsRUFDakQsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLElBQUksS0FBSyxFQUNsQyxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsSUFBSSxLQUFLLEVBQ2xDLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxJQUFJLEtBQUssRUFDbEMsY0FBYyxHQUFHLEtBQUssQ0FBQyxjQUFjLElBQUksV0FBVyxFQUNwRCxXQUFXLEdBQUcsSUFBSSxFQUNsQixjQUFjLEdBQUcsS0FBSyxFQUN0QixpQkFBaUIsR0FBRyxLQUFLLEVBQ3pCLGVBQWUsR0FBRyxLQUFLLENBQUM7Z0JBRTFCLHNCQUFzQjtnQkFFdEIsSUFBSSxNQUFNLEVBQ1Isd0JBQXdCLEVBQ3hCLGdCQUFnQixHQUFHLE1BQU0sR0FBRyxhQUFNLENBQUMsR0FBRyxHQUFHLGFBQU0sQ0FBQyxNQUFNLEVBQ3RELFNBQVMsRUFDVCxNQUFNLEVBQ04sU0FBUyxFQUNULEtBQUssRUFDTCxLQUFLLEVBQ0wsR0FBRyxFQUNILEtBQUssRUFDTCxVQUFVLEVBQ1YsS0FBSyxFQUNMLFdBQVcsRUFDWCxHQUFHLEVBQ0gsbUJBQW1CLEVBQ25CLG1CQUFtQixFQUNuQixJQUFJLEVBQ0osR0FBRyxFQUNILGdCQUFnQixFQUNoQiwwQkFBMEIsRUFDMUIsb0JBQW9CLENBQUM7Z0JBRXZCLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO2dCQUN4QixrQkFBa0IsR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDO2dCQUN4QyxjQUFjLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQztnQkFDdEMsdUJBQXVCLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDO2dCQUNsRCxjQUFjLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQztnQkFFdEMsSUFBTSxvQkFBb0IsR0FBaUIsRUFBRSxDQUFDO2dCQUM5QyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxnQkFBUyxFQUFFLENBQUMsQ0FBQztnQkFDM0Msb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUksZ0JBQVMsRUFBRSxDQUFDLENBQUM7Z0JBQzNDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLG1CQUFZLEVBQUUsQ0FBQyxDQUFDO2dCQUM5QyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSx1QkFBZ0IsRUFBRSxDQUFDLENBQUM7Z0JBQ2xELG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLHFCQUFjLEVBQUUsQ0FBQyxDQUFDO2dCQUNoRCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxrQkFBVyxFQUFFLENBQUMsQ0FBQztnQkFDN0Msb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUkscUJBQWMsRUFBRSxDQUFDLENBQUM7Z0JBRWhEO29CQUNFLDhCQUE4QjtvQkFDOUIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzt3QkFDVixXQUFXLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUN0QyxDQUFDO29CQUNELFdBQVcsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUVwQyxJQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO29CQUV6QyxZQUFLLEdBQVMsVUFBVyxDQUFDLFdBQVcsQ0FBQztvQkFDdEMsTUFBTSxHQUFTLFVBQVcsQ0FBQyxZQUFZLENBQUM7b0JBRXhDLEVBQUUsQ0FBQyxDQUFDLFlBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNoQixPQUFPLENBQUMsS0FBSyxDQUFDLCtEQUErRCxDQUFDLENBQUM7d0JBQy9FLE1BQU0sQ0FBQztvQkFDVCxDQUFDO29CQUNELEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNqQixPQUFPLENBQUMsS0FBSyxDQUFDLGdFQUFnRSxDQUFDLENBQUM7d0JBQ2hGLE1BQU0sQ0FBQztvQkFDVCxDQUFDO29CQUVELHdCQUF3QixHQUFHLE1BQU0sR0FBRyxhQUFNLENBQUMsR0FBRyxHQUFHLGFBQU0sQ0FBQyxNQUFNLEdBQUcsb0JBQWEsQ0FBQztvQkFFL0UseUNBQXlDO29CQUN6QywyQ0FBMkM7b0JBRTNDLGdCQUFnQixHQUFHLE1BQU0sR0FBRyxhQUFNLENBQUMsR0FBRyxDQUFDO29CQUV2QyxLQUFLLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7eUJBQzlCLElBQUksQ0FBQyxPQUFPLEVBQUUsWUFBSyxHQUFHLGFBQU0sQ0FBQyxJQUFJLEdBQUcsYUFBTSxDQUFDLEtBQUssQ0FBQzt5QkFDakQsSUFBSSxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO29CQUVwQyx1QkFBdUI7b0JBRXZCLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQzt5QkFDcEIsSUFBSSxDQUFDLFdBQVcsRUFBRSxZQUFZLEdBQUcsYUFBTSxDQUFDLElBQUksR0FBRyxHQUFHLEdBQUcsQ0FBQyxhQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7b0JBRTVFLEdBQUcsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFO3lCQUNYLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDO3lCQUN2QixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQzt5QkFDaEIsSUFBSSxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQ1QsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQzFCLENBQUMsQ0FBQyxDQUFDO29CQUVMLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBRWQsK0JBQStCO29CQUMvQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBRS9DLENBQUM7Z0JBRUQsMkJBQTJCLFVBQTZCO29CQUV0RCxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO3dCQUNmLElBQUksR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBQyxDQUFDOzRCQUM3QixNQUFNLENBQUMsQ0FBQyx1QkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDdkQsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFFSixHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFVBQUMsQ0FBQzs0QkFDNUIsTUFBTSxDQUFDLENBQUMsdUJBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxTQUFTLENBQUM7d0JBQy9ELENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ04sQ0FBQztvQkFFRCxrRkFBa0Y7b0JBQ2xGLG1CQUFtQixHQUFHLGVBQWUsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztvQkFDdEQsbUJBQW1CLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7b0JBRWxELGdFQUFnRTtvQkFDaEUsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDZixtQkFBbUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLFVBQVUsR0FBRyxHQUFHLENBQUMsQ0FBQzt3QkFDdEUsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxVQUFVLEdBQUcsR0FBRyxDQUFDLENBQUM7b0JBQ3hFLENBQUM7b0JBRUQsaUZBQWlGO29CQUNqRixtQkFBbUIsR0FBRyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsR0FBRyxzQkFBZTt3QkFDdEYsbUJBQW1CLENBQUM7Z0JBQ3hCLENBQUM7Z0JBRUQ7b0JBQ0UsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFO3lCQUNyQixLQUFLLENBQUMsSUFBSSxDQUFDO3lCQUNYLFVBQVUsQ0FBQyxDQUFDLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxDQUFDO3lCQUN6QyxNQUFNLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hELENBQUM7Z0JBRUQsd0JBQXdCLFVBQTZCO29CQUNuRCxJQUFJLE1BQU0sR0FBRyx5Q0FBa0MsQ0FBQyxZQUFLLEdBQUcsYUFBTSxDQUFDLElBQUksR0FBRyxhQUFNLENBQUMsS0FBSyxDQUFDLEVBQ2pGLE1BQU0sR0FBRywwQ0FBbUMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO29CQUV6RSxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBRTFCLFNBQVMsR0FBRyxVQUFVLENBQUM7d0JBRXZCLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO3dCQUU5QixNQUFNLEdBQUcsU0FBUyxFQUFFLENBQUM7d0JBRXJCLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTs2QkFDbEIsS0FBSyxDQUFDLE1BQU0sQ0FBQzs2QkFDYixLQUFLLENBQUMsTUFBTSxDQUFDOzZCQUNiLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzs2QkFDakIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUVsQixJQUFJLFlBQVksR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBQyxDQUFDOzRCQUN6QyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQzt3QkFDckIsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFFSixJQUFJLFlBQVksU0FBQSxDQUFDO3dCQUNqQixFQUFFLENBQUMsQ0FBQyxrQkFBa0IsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzs0QkFDeEQsWUFBWSxHQUFHLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7d0JBQzdFLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ04sWUFBWSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxVQUFDLENBQUM7Z0NBQ3JDLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDOzRCQUNyQixDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNOLENBQUM7d0JBRUQsU0FBUyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFOzZCQUN4QixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsWUFBSyxHQUFHLGFBQU0sQ0FBQyxJQUFJLEdBQUcsYUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDOzZCQUM5QyxJQUFJLEVBQUU7NkJBQ04sTUFBTSxDQUFDLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7d0JBRXhDLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTs2QkFDbEIsS0FBSyxDQUFDLFNBQVMsQ0FBQzs2QkFDaEIsS0FBSyxDQUFDLE1BQU0sQ0FBQzs2QkFDYixVQUFVLENBQUMsdUJBQWdCLEVBQUUsQ0FBQzs2QkFDOUIsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDOzZCQUNqQixNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBRXRCLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCxnQ0FBZ0MsZUFBa0M7b0JBQ2hFLElBQUksU0FBaUIsRUFDbkIsUUFBZ0IsQ0FBQztvQkFFbkI7d0JBQ0UsSUFBSSxVQUFrQixFQUNwQixVQUFrQixFQUNsQixTQUFpQixFQUNqQixTQUFpQixFQUNqQixPQUFPLEdBQWEsRUFBRSxFQUN0QixPQUFPLEdBQWEsRUFBRSxDQUFDO3dCQUV6QixlQUFlLENBQUMsT0FBTyxDQUFDLFVBQUMsTUFBTTs0QkFDN0IsVUFBVSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBQyxDQUFDO2dDQUN0QyxNQUFNLENBQUMsdUJBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7NEJBQ3pDLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ0osT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQzs0QkFDekIsVUFBVSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBQyxDQUFDO2dDQUN0QyxNQUFNLENBQUMsQ0FBQyx1QkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUM7NEJBQ3pELENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ0osT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQzt3QkFFM0IsQ0FBQyxDQUFDLENBQUM7d0JBQ0gsU0FBUyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQzVCLFNBQVMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUM1QixNQUFNLENBQUMsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ2hDLENBQUM7b0JBRUQsSUFBTSxNQUFNLEdBQUcsd0JBQXdCLEVBQUUsQ0FBQztvQkFDMUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDakIsR0FBRyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFFaEIsbUJBQW1CLEdBQUcsZUFBZSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUM7b0JBQy9ELEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQ2YsU0FBUyxHQUFHLENBQUMsVUFBVSxHQUFHLEdBQUcsQ0FBQyxDQUFDO3dCQUMvQixRQUFRLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7d0JBQ3ZDLG1CQUFtQixHQUFHLFNBQVMsR0FBRyxRQUFRLEdBQUcsU0FBUyxHQUFHLFFBQVEsQ0FBQztvQkFDcEUsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFDTixtQkFBbUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztvQkFDcEQsQ0FBQztvQkFFRCxNQUFNLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsR0FBRyxzQkFBZTs0QkFDN0YsbUJBQW1CLENBQUMsQ0FBQztnQkFDekIsQ0FBQztnQkFFRCw2QkFBNkIsZUFBa0M7b0JBQzdELElBQU0sTUFBTSxHQUFHLHlDQUFrQyxDQUFDLFlBQUssR0FBRyxhQUFNLENBQUMsSUFBSSxHQUFHLGFBQU0sQ0FBQyxLQUFLLENBQUMsRUFDbkYsTUFBTSxHQUFHLHlDQUFrQyxDQUFDLHdCQUF3QixDQUFDLENBQUM7b0JBRXhFLEVBQUUsQ0FBQyxDQUFDLGVBQWUsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBRXZFLElBQUksT0FBTyxHQUFHLHNCQUFzQixDQUFDLGVBQWUsQ0FBQyxDQUFDO3dCQUN0RCxtQkFBbUIsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2pDLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFFakMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFOzZCQUN2QixLQUFLLENBQUMsSUFBSSxDQUFDOzZCQUNYLFVBQVUsQ0FBQyxDQUFDLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxDQUFDOzZCQUN6QyxNQUFNLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7d0JBRXRELEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTs2QkFDbEIsS0FBSyxDQUFDLE1BQU0sQ0FBQzs2QkFDYixLQUFLLENBQUMsTUFBTSxDQUFDOzZCQUNiLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzs2QkFDakIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUVsQixTQUFTLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUU7NkJBQ3hCLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxZQUFLLEdBQUcsYUFBTSxDQUFDLElBQUksR0FBRyxhQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7NkJBQzlDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLFVBQUMsQ0FBQyxJQUFLLE9BQUEsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLFVBQUMsQ0FBQyxJQUFLLE9BQUEsQ0FBQyxDQUFDLFNBQVMsRUFBWCxDQUFXLENBQUMsRUFBcEMsQ0FBb0MsQ0FBQzs0QkFDM0UsRUFBRSxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsVUFBQyxDQUFDLElBQUssT0FBQSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsVUFBQyxDQUFDLElBQUssT0FBQSxDQUFDLENBQUMsU0FBUyxFQUFYLENBQVcsQ0FBQyxFQUFwQyxDQUFvQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUUzRSxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7NkJBQ2xCLEtBQUssQ0FBQyxTQUFTLENBQUM7NkJBQ2hCLEtBQUssQ0FBQyxNQUFNLENBQUM7NkJBQ2IsVUFBVSxDQUFDLHVCQUFnQixFQUFFLENBQUM7NkJBQzlCLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzs2QkFDakIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUV0QixDQUFDO2dCQUNILENBQUM7Z0JBRUQ7Ozs7Ozs7bUJBT0c7Z0JBQ0gsMkNBQTJDLEdBQVksRUFDckQsUUFBa0IsRUFDbEIsY0FBNEIsRUFDNUIsWUFBMEIsRUFDMUIsT0FBWTtvQkFBWix1QkFBWSxHQUFaLFlBQVk7b0JBRVosSUFBSSxhQUFhLEdBQTJCO3dCQUMxQyxPQUFPLEVBQUU7NEJBQ1AsaUJBQWlCLEVBQUUsY0FBYzt5QkFDbEM7d0JBQ0QsTUFBTSxFQUFFOzRCQUNOLEtBQUssRUFBRSxjQUFjOzRCQUNyQixHQUFHLEVBQUUsWUFBWTs0QkFDakIsT0FBTyxFQUFFLE9BQU87eUJBQ2pCO3FCQUNGLENBQUM7b0JBRUYsRUFBRSxDQUFDLENBQUMsY0FBYyxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUM7d0JBQ25DLElBQUksQ0FBQyxHQUFHLENBQUMsK0JBQStCLENBQUMsQ0FBQztvQkFDNUMsQ0FBQztvQkFFRCxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksVUFBVSxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUM7d0JBRWxDLElBQUksaUJBQWlCLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDOUMsZUFBZTt3QkFDZix3R0FBd0c7d0JBQ3hHLHFEQUFxRDt3QkFDckQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksR0FBRyxRQUFRLEdBQUcsR0FBRyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLEVBQ25HLGFBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFDLFFBQVE7NEJBRTlCLGdCQUFnQixHQUFHLHlCQUF5QixDQUFDLFFBQVEsQ0FBQyxDQUFDOzRCQUN2RCxLQUFLLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7d0JBRWpDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLE1BQU0sRUFBRSxNQUFNOzRCQUN0QixJQUFJLENBQUMsS0FBSyxDQUFDLDJCQUEyQixHQUFHLE1BQU0sR0FBRyxJQUFJLEdBQUcsTUFBTSxDQUFDLENBQUM7d0JBQ25FLENBQUMsQ0FBQyxDQUFDO29CQUNQLENBQUM7Z0JBRUgsQ0FBQztnQkFFRDs7OzttQkFJRztnQkFDSCxtQ0FBbUMsUUFBUTtvQkFDekMsK0NBQStDO29CQUMvQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO3dCQUNiLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFVBQUMsS0FBc0I7NEJBQ3pDLElBQUksU0FBUyxHQUFpQixLQUFLLENBQUMsU0FBUyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDOzRCQUMvRixNQUFNLENBQUM7Z0NBQ0wsU0FBUyxFQUFFLFNBQVM7Z0NBQ3BCLElBQUksRUFBRSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUM7Z0NBQ3pCLEtBQUssRUFBRSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLFNBQVMsR0FBRyxLQUFLLENBQUMsS0FBSztnQ0FDL0QsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLFNBQVMsR0FBRyxLQUFLLENBQUMsR0FBRztnQ0FDMUMsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxHQUFHLEtBQUssQ0FBQyxHQUFHO2dDQUN6RCxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxTQUFTLEdBQUcsS0FBSyxDQUFDLEdBQUc7Z0NBQ3pELEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSzs2QkFDbkIsQ0FBQzt3QkFDSixDQUFDLENBQUMsQ0FBQztvQkFDTCxDQUFDO2dCQUNILENBQUM7Z0JBRUQsb0JBQW9CLENBQWtCLEVBQUUsQ0FBUztvQkFDL0MsSUFBSSxLQUFLLEVBQ1AsYUFBYSxFQUNiLGdCQUFnQixHQUFHLENBQUMsQ0FBQyxTQUFTLEVBQzlCLFdBQVcsRUFDWCxpQkFBaUIsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyw2QkFBc0IsQ0FBQyxDQUFDO29CQUV6RSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDVixhQUFhLEdBQUcsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7d0JBQzNDLFdBQVcsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUMzRSxDQUFDO29CQUVELEVBQUUsQ0FBQyxDQUFDLHVCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDeEIsU0FBUzt3QkFDVCxLQUFLLEdBQUcsOEVBQzJCLFdBQVcsNEVBQ0EsYUFBYSw2RUFDbEIsV0FBVyxpSEFFTixjQUFjLDZFQUNuQixpQkFBaUIsa0RBQ2pELENBQUM7b0JBQ1osQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFDTixFQUFFLENBQUMsQ0FBQyxrQkFBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzs0QkFDbkIsa0NBQWtDOzRCQUNsQyxLQUFLLEdBQUcseUZBQ29DLGNBQWMsOEVBQzFCLGlCQUFpQiwyRkFDSCxhQUFhLGdGQUN6QixXQUFXLG9IQUVDLGdCQUFnQixnRkFDNUIsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxzREFDNUMsQ0FBQzt3QkFDYixDQUFDO3dCQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNOLDZCQUE2Qjs0QkFDN0IsS0FBSyxHQUFHLGdJQUU4QixjQUFjLHNFQUNkLGlCQUFpQiwrSkFHakIsYUFBYSxzRUFDYixXQUFXLHdKQUdYLFFBQVEsc0VBQ1IsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyw4SUFHbEIsUUFBUSxzRUFDUixFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLDhJQUdsQixRQUFRLHNFQUNSLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsbUVBRTlDLENBQUM7d0JBQ2IsQ0FBQztvQkFDSCxDQUFDO29CQUNELE1BQU0sQ0FBQyxLQUFLLENBQUM7Z0JBRWYsQ0FBQztnQkFFRDtvQkFDRSwrQkFBK0I7b0JBQy9CLElBQU0sc0JBQXNCLEdBQUcsa0RBQTJDLENBQUMsd0JBQXdCLENBQUMsQ0FBQztvQkFFckcsTUFBTSxHQUFHLFNBQVMsRUFBRSxDQUFDO29CQUVyQixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUNYLElBQUksT0FBSyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQzNDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7NEJBQ3JCLE9BQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7d0JBQ3ZELENBQUM7d0JBQ0QsT0FBSzs2QkFDRixJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7NkJBQ2hCLEtBQUssQ0FBQyxNQUFNLENBQUM7NkJBQ2IsTUFBTSxDQUFDLE1BQU0sQ0FBQzs2QkFDZCxLQUFLLENBQUMsc0JBQXNCLENBQUM7NkJBQzdCLFFBQVEsQ0FBQyxDQUFDLFlBQUssRUFBRSxDQUFDLENBQUM7NkJBQ25CLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FDaEIsQ0FBQztvQkFDTixDQUFDO2dCQUNILENBQUM7Z0JBRUQ7b0JBRUUsd0JBQXdCLFNBQVM7d0JBQy9CLFNBQVM7NkJBQ04sVUFBVSxFQUFFOzZCQUNaLEtBQUssQ0FBQyxHQUFHLENBQUM7NkJBQ1YsUUFBUSxDQUFDLEdBQUcsQ0FBQzs2QkFDYixJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUMxQixDQUFDO29CQUVELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7d0JBRVYsR0FBRyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFFakMsdUNBQXVDO3dCQUV2QyxnQkFBZ0I7d0JBQ2hCLElBQUksVUFBVSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDOzZCQUM3QixJQUFJLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQzs2QkFDdkIsSUFBSSxDQUFDLFdBQVcsRUFBRSxjQUFjLEdBQUcsd0JBQXdCLEdBQUcsR0FBRyxDQUFDOzZCQUNsRSxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQzs2QkFDcEIsSUFBSSxDQUFDLEtBQUssQ0FBQzs2QkFDWCxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7d0JBRXhCLGdCQUFnQjt3QkFDaEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7NkJBQzdCLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDOzZCQUN2QixJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQzs2QkFDcEIsSUFBSSxDQUFDLEtBQUssQ0FBQzs2QkFDWCxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7d0JBRXhCLElBQUksVUFBVSxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsQ0FBQzt3QkFDbkQsRUFBRSxDQUFDLENBQUMsd0JBQXdCLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDOzRCQUN4RCxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDO2lDQUM3RCxJQUFJLENBQUMsV0FBVyxFQUFFLGdDQUFnQyxDQUFDO2lDQUNuRCxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsd0JBQXdCLEdBQUcsQ0FBQyxDQUFDO2lDQUN4QyxLQUFLLENBQUMsYUFBYSxFQUFFLFFBQVEsQ0FBQztpQ0FDOUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLEtBQUssTUFBTSxHQUFHLEVBQUUsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDO2lDQUN6RCxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQztpQ0FDcEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO3dCQUMxQixDQUFDO29CQUNILENBQUM7Z0JBRUgsQ0FBQztnQkFFRCw0QkFBNEIsZ0JBQWdCO29CQUMxQyxJQUFJLFdBQVcsR0FBRyxnQkFBZ0IsSUFBSSxVQUFVLEVBQzlDLElBQUksR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTt5QkFDakIsV0FBVyxDQUFDLFdBQVcsQ0FBQzt5QkFDeEIsT0FBTyxDQUFDLFVBQUMsQ0FBQzt3QkFDVCxNQUFNLENBQUMsQ0FBQyx1QkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDOUIsQ0FBQyxDQUFDO3lCQUNELENBQUMsQ0FBQyxVQUFDLENBQUM7d0JBQ0gsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ2hDLENBQUMsQ0FBQzt5QkFDRCxDQUFDLENBQUMsVUFBQyxDQUFDO3dCQUNILE1BQU0sQ0FBQyxrQkFBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDMUQsQ0FBQyxDQUFDLENBQUM7b0JBRVAsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDZCxDQUFDO2dCQUVEO29CQUNFLEVBQUUsQ0FBQyxDQUFDLFNBQVMsS0FBSyxLQUFLLElBQUksU0FBUyxLQUFLLGFBQWEsQ0FBQyxDQUFDLENBQUM7d0JBQ3ZELElBQUksV0FBVyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQzt3QkFDakUsa0JBQWtCO3dCQUNsQixXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUM7NkJBQ3BDLElBQUksQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDN0MsZUFBZTt3QkFDZixXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQzs2QkFDL0IsSUFBSSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUM7NkJBQzNCLElBQUksQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDN0Msa0JBQWtCO3dCQUNsQixXQUFXLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQzlCLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRDtvQkFFRSxVQUFVLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDdEMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQzt3QkFDdkIsVUFBVSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDdEQsQ0FBQztvQkFFRCxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUU7eUJBQ25CLENBQUMsQ0FBQyxTQUFTLENBQUM7eUJBQ1osRUFBRSxDQUFDLFlBQVksRUFBRSxVQUFVLENBQUM7eUJBQzVCLEVBQUUsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7b0JBRTVCLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBRXZCLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUUvQyxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQzt5QkFDekIsSUFBSSxDQUFDLFFBQVEsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO29CQUU1Qzt3QkFDRSxHQUFHLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDakMsQ0FBQztvQkFFRDt3QkFDRSxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQ3pCLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUMzQyxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsRUFDekMsa0JBQWtCLEdBQUcsT0FBTyxHQUFHLFNBQVMsQ0FBQzt3QkFFM0MsR0FBRyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO3dCQUNuRCw2Q0FBNkM7d0JBQzdDLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7NEJBQ2hDLGtCQUFrQixHQUFHLEVBQUUsQ0FBQzs0QkFFeEIsSUFBSSxZQUFZLEdBQWlCLElBQUksbUJBQVksQ0FBQyxHQUFHLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUNsRyx3QkFBd0IsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLG1CQUFtQixFQUMxRCxpQkFBaUIsRUFBRSxhQUFhLENBQUMsQ0FBQzs0QkFFcEMsdUJBQWdCLENBQUMsa0JBQWtCLEVBQUUsWUFBWSxDQUFDLENBQUM7NEJBQ25ELFVBQVUsQ0FBQyxVQUFVLENBQUMsaUJBQVUsQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQzt3QkFDL0UsQ0FBQzt3QkFDRCw0QkFBNEI7d0JBQzVCLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7b0JBQ2pDLENBQUM7Z0JBRUgsQ0FBQztnQkFFRCxvQ0FBb0MsYUFBYTtvQkFDL0MsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQzt3QkFDbEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7NkJBQ2YsS0FBSyxDQUFDLGFBQWEsQ0FBQzs2QkFDcEIsSUFBSSxDQUFDLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQzs2QkFDakMsS0FBSyxDQUFDLGtCQUFrQixFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7NkJBQ2xDLElBQUksQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDN0MsQ0FBQztnQkFFSCxDQUFDO2dCQUVELHVCQUF1QixjQUFjO29CQUNuQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO3dCQUNuQixHQUFHLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDOzZCQUM1QixJQUFJLENBQUMsY0FBYyxDQUFDOzZCQUNwQixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDOzZCQUN4QixJQUFJLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQzs2QkFDOUIsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7NkJBQ1osSUFBSSxDQUFDLElBQUksRUFBRSxVQUFDLENBQUM7NEJBQ1osTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7d0JBQ2hDLENBQUMsQ0FBQzs2QkFDRCxJQUFJLENBQUMsSUFBSSxFQUFFOzRCQUNWLE1BQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUM7d0JBQzlDLENBQUMsQ0FBQzs2QkFDRCxLQUFLLENBQUMsTUFBTSxFQUFFLFVBQUMsQ0FBQzs0QkFDZixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0NBQ3ZCLE1BQU0sQ0FBQyxLQUFLLENBQUM7NEJBQ2YsQ0FBQzs0QkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dDQUM5QixNQUFNLENBQUMsUUFBUSxDQUFDOzRCQUNsQixDQUFDOzRCQUFDLElBQUksQ0FBQyxDQUFDO2dDQUNOLE1BQU0sQ0FBQyxPQUFPLENBQUM7NEJBQ2pCLENBQUM7d0JBQ0gsQ0FBQyxDQUFDLENBQUM7b0JBQ1AsQ0FBQztnQkFDSCxDQUFDO2dCQUVELEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsVUFBQyxPQUFPLEVBQUUsT0FBTztvQkFDOUMsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7d0JBQ3ZCLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNuRCxLQUFLLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7b0JBQ2pDLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsS0FBSyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsVUFBQyxZQUFZLEVBQUUsWUFBWTtvQkFDbkQsRUFBRSxDQUFDLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUM7d0JBQ2pDLGVBQWUsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUMsQ0FBQzt3QkFDdkQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUNqQyxDQUFDO2dCQUNILENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFFVCxLQUFLLENBQUMsTUFBTSxDQUFDLG1CQUFtQixFQUFFLFVBQUMsc0JBQXNCO29CQUN2RCxFQUFFLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7d0JBQzNCLDRDQUE0Qzt3QkFDNUMsMEJBQTBCLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO3dCQUN0RSxLQUFLLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7b0JBQ2pDLENBQUM7Z0JBQ0gsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUVULEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsVUFBQyxpQkFBaUI7b0JBQy9DLEVBQUUsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQzt3QkFDdEIsY0FBYyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsQ0FBQzt3QkFDckQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUNqQyxDQUFDO2dCQUNILENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFFVCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxVQUFDLGVBQWU7b0JBQzNDLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7d0JBQ3BCLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQ3ZELEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztvQkFDakMsQ0FBQztnQkFDSCxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBRVQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLFlBQVksRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsYUFBYSxDQUFDLEVBQ2xHLFVBQUMsVUFBVTtvQkFDVCxVQUFVLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLFVBQVUsQ0FBQztvQkFDekMsU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxTQUFTLENBQUM7b0JBQ3ZDLGlCQUFpQixHQUFHLENBQUMsT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssV0FBVyxDQUFDLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLGlCQUFpQixDQUFDO29CQUMvRixlQUFlLEdBQUcsQ0FBQyxPQUFPLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxXQUFXLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsZUFBZSxDQUFDO29CQUMzRixXQUFXLEdBQUcsQ0FBQyxPQUFPLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxXQUFXLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDO29CQUNuRixLQUFLLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQ2pDLENBQUMsQ0FBQyxDQUFDO2dCQUVMO29CQUNFLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7b0JBQzFCLGNBQWMsR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQzVFLGlDQUFpQyxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDekYsQ0FBQztnQkFFRCxnQ0FBZ0M7Z0JBQ2hDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxXQUFXLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsQ0FBQyxFQUMvRixVQUFDLGdCQUFnQjtvQkFDZixPQUFPLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDO29CQUN6QyxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLElBQUksUUFBUSxDQUFDO29CQUMzQyxVQUFVLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLElBQUksUUFBUSxDQUFDO29CQUM3QyxjQUFjLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLElBQUksY0FBYyxDQUFDO29CQUN2RCxrQkFBa0IsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxrQkFBa0IsQ0FBQztvQkFDL0QscUNBQXFDLEVBQUUsQ0FBQztnQkFDMUMsQ0FBQyxDQUFDLENBQUM7Z0JBRUwsS0FBSyxDQUFDLE1BQU0sQ0FBQywwQkFBMEIsRUFBRSxVQUFDLGtCQUFrQjtvQkFDMUQsRUFBRSxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO3dCQUN2Qix3QkFBd0IsR0FBRyxDQUFDLGtCQUFrQixDQUFDO3dCQUMvQyxTQUFTLENBQUMsTUFBTSxDQUFDLG9CQUFvQixDQUFDLENBQUM7d0JBQ3ZDLG9CQUFvQixHQUFHLFNBQVMsQ0FBQzs0QkFDL0IscUNBQXFDLEVBQUUsQ0FBQzt3QkFDMUMsQ0FBQyxFQUFFLHdCQUF3QixHQUFHLElBQUksQ0FBQyxDQUFDO29CQUN0QyxDQUFDO2dCQUNILENBQUMsQ0FBQyxDQUFDO2dCQUVILEtBQUssQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFO29CQUNwQixTQUFTLENBQUMsTUFBTSxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQ3pDLENBQUMsQ0FBQyxDQUFDO2dCQUVILEtBQUssQ0FBQyxHQUFHLENBQUMsc0JBQXNCLEVBQUUsVUFBQyxLQUFLLEVBQUUsTUFBTTtvQkFDOUMsS0FBSyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDcEQsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsbUNBQW1DLFNBQWlCLEVBQUUsWUFBMEI7b0JBRTlFLGdEQUFnRDtvQkFDaEQsbURBQW1EO29CQUNuRCxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsVUFBQyxVQUFVO3dCQUN0QyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7NEJBQ2xDLFVBQVUsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLENBQUM7d0JBQ3JDLENBQUM7b0JBQ0gsQ0FBQyxDQUFDLENBQUM7Z0JBRUwsQ0FBQztnQkFFRCxLQUFLLENBQUMsTUFBTSxHQUFHLFVBQUMsVUFBVTtvQkFDeEIsd0NBQXdDO29CQUN4QyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7d0JBQ3BDLE1BQU0sQ0FBQztvQkFDVCxDQUFDO29CQUVELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7d0JBQ1YsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQzt3QkFDOUIsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDOUIsQ0FBQztvQkFDRCxvQ0FBb0M7b0JBQ3BDLE1BQU0sRUFBRSxDQUFDO29CQUVULEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQ2YsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUM3QixDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNOLHVCQUF1Qjt3QkFDdkIsbUJBQW1CLENBQUMsZUFBZSxDQUFDLENBQUM7b0JBQ3ZDLENBQUM7b0JBRUQsSUFBSSxZQUFZLEdBQWlCLElBQUksbUJBQVksQ0FBQyxHQUFHLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUNsRyx3QkFBd0IsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLG1CQUFtQixFQUMxRCxpQkFBaUIsRUFBRSxhQUFhLENBQUMsQ0FBQztvQkFFcEMsRUFBRSxDQUFDLENBQUMsVUFBVSxJQUFJLENBQUMsVUFBVSxHQUFHLG1CQUFtQixJQUFJLFVBQVUsR0FBRyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDekYsNEJBQXFCLENBQUMsWUFBWSxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO29CQUN2RSxDQUFDO29CQUVELGdCQUFnQixFQUFFLENBQUM7b0JBQ25CLG9CQUFvQixFQUFFLENBQUM7b0JBQ3ZCLHlCQUF5QixDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsQ0FBQztvQkFFbkQsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQzt3QkFDbkIsdUJBQWdCLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUMzRCxDQUFDO29CQUNELDBCQUEwQixDQUFDLHVCQUF1QixDQUFDLENBQUM7b0JBQ3BELGVBQWUsRUFBRSxDQUFDO29CQUNsQixFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO3dCQUNoQixjQUFjLEVBQUUsQ0FBQztvQkFDbkIsQ0FBQztvQkFFRCxFQUFFLENBQUMsQ0FBQyxVQUFVLElBQUksQ0FBQyxVQUFVLEdBQUcsbUJBQW1CLElBQUksVUFBVSxHQUFHLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN6RixxRUFBcUU7d0JBQ3JFLHNCQUFlLENBQUMsWUFBWSxFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztvQkFDekQsQ0FBQztvQkFFRCxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO3dCQUNuQixhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7b0JBQ2hDLENBQUM7b0JBQ0QsRUFBRSxDQUFDLENBQUMsa0JBQWtCLElBQUksa0JBQWtCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3hELHVCQUFnQixDQUFDLGtCQUFrQixFQUFFLFlBQVksQ0FBQyxDQUFDO29CQUNyRCxDQUFDO29CQUNELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7d0JBQ1YsT0FBTyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQzt3QkFDL0IsT0FBTyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQztvQkFDbkMsQ0FBQztnQkFDSCxDQUFDLENBQUM7WUFDSixDQUFDO1lBRUQsTUFBTSxDQUFDO2dCQUNMLElBQUksRUFBRSxJQUFJO2dCQUNWLFFBQVEsRUFBRSxHQUFHO2dCQUNiLE9BQU8sRUFBRSxJQUFJO2dCQUNiLEtBQUssRUFBRTtvQkFDTCxJQUFJLEVBQUUsR0FBRztvQkFDVCxTQUFTLEVBQUUsR0FBRztvQkFDZCxZQUFZLEVBQUUsR0FBRztvQkFDakIsU0FBUyxFQUFFLEdBQUc7b0JBQ2QsUUFBUSxFQUFFLEdBQUc7b0JBQ2IsVUFBVSxFQUFFLEdBQUc7b0JBQ2YsY0FBYyxFQUFFLEdBQUc7b0JBQ25CLGNBQWMsRUFBRSxHQUFHO29CQUNuQixZQUFZLEVBQUUsR0FBRztvQkFDakIsa0JBQWtCLEVBQUUsR0FBRztvQkFDdkIsd0JBQXdCLEVBQUUsR0FBRztvQkFDN0IsaUJBQWlCLEVBQUUsR0FBRztvQkFDdEIsY0FBYyxFQUFFLEdBQUc7b0JBQ25CLGNBQWMsRUFBRSxHQUFHO29CQUNuQixVQUFVLEVBQUUsR0FBRztvQkFDZixhQUFhLEVBQUUsR0FBRztvQkFDbEIsU0FBUyxFQUFFLEdBQUc7b0JBQ2QsVUFBVSxFQUFFLEdBQUc7b0JBQ2YsZUFBZSxFQUFFLEdBQUc7b0JBQ3BCLG9CQUFvQixFQUFFLEdBQUc7b0JBQ3pCLG9CQUFvQixFQUFFLEdBQUc7b0JBQ3pCLGdCQUFnQixFQUFFLEdBQUc7b0JBQ3JCLFdBQVcsRUFBRSxHQUFHO29CQUNoQixhQUFhLEVBQUUsR0FBRztvQkFDbEIsUUFBUSxFQUFFLEdBQUc7b0JBQ2IsUUFBUSxFQUFFLEdBQUc7b0JBQ2IsUUFBUSxFQUFFLEdBQUc7b0JBQ2IsY0FBYyxFQUFFLEdBQUc7b0JBQ25CLFdBQVcsRUFBRSxHQUFHO29CQUNoQixpQkFBaUIsRUFBRSxHQUFHO2lCQUN2QjthQUNGLENBQUM7UUFDSixDQUFDO0tBRUYsQ0FDQSxDQUNBO0FBQ0wsQ0FBQyxFQXZ6QlMsTUFBTSxLQUFOLE1BQU0sUUF1ekJmOztBQ3p6QkQsK0NBQStDO0FBRS9DLElBQVUsTUFBTSxDQXlGZjtBQXpGRCxXQUFVLE1BQU0sRUFBQyxDQUFDO0lBQ2hCLFlBQVksQ0FBQztJQXNFYjs7T0FFRztJQUNIO1FBQ0Usc0JBQW1CLEdBQVEsRUFDbEIsU0FBYyxFQUNkLE1BQVcsRUFDWCxTQUE0QixFQUM1QixjQUFpQyxFQUNqQyx3QkFBZ0MsRUFDaEMsTUFBYyxFQUNkLEdBQVMsRUFDVCxtQkFBNEIsRUFDNUIsaUJBQTJCLEVBQzNCLGFBQXNCO1lBVlosUUFBRyxHQUFILEdBQUcsQ0FBSztZQUNsQixjQUFTLEdBQVQsU0FBUyxDQUFLO1lBQ2QsV0FBTSxHQUFOLE1BQU0sQ0FBSztZQUNYLGNBQVMsR0FBVCxTQUFTLENBQW1CO1lBQzVCLG1CQUFjLEdBQWQsY0FBYyxDQUFtQjtZQUNqQyw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQVE7WUFDaEMsV0FBTSxHQUFOLE1BQU0sQ0FBUTtZQUNkLFFBQUcsR0FBSCxHQUFHLENBQU07WUFDVCx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQVM7WUFDNUIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFVO1lBQzNCLGtCQUFhLEdBQWIsYUFBYSxDQUFTO1FBQy9CLENBQUM7UUFDSCxtQkFBQztJQUFELENBYkEsQUFhQyxJQUFBO0lBYlksbUJBQVksZUFheEIsQ0FBQTtBQUVILENBQUMsRUF6RlMsTUFBTSxLQUFOLE1BQU0sUUF5RmY7O0FDM0ZELCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0E0SmY7QUE1SkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFFYiwrQkFBK0I7SUFFL0Isc0JBQTZCLEtBQWEsRUFBRSxNQUFjLEVBQUUsU0FBc0I7UUFBdEIseUJBQXNCLEdBQXRCLDZCQUFzQjtRQUNoRixNQUFNLENBQUMsQ0FBQyxLQUFLLEdBQUcsTUFBTSxHQUFHLFNBQVMsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFGZSxtQkFBWSxlQUUzQixDQUFBO0lBRUQsNEZBQTRGO0lBQzVGLGtGQUFrRjtJQUNsRiw4QkFBcUMsQ0FBQyxFQUFFLE1BQWM7UUFDcEQsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLFlBQVksQ0FBQyxZQUFLLEVBQUUsTUFBTSxFQUFFLGlCQUFVLENBQUMsR0FBRyxDQUFDO1lBQ2hGLFlBQVksQ0FBQyxZQUFLLEVBQUUsTUFBTSxFQUFFLGlCQUFVLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBSGUsMkJBQW9CLHVCQUduQyxDQUFBO0lBRUQsOEZBQThGO0lBQzlGLDRGQUE0RjtJQUM1RixxQkFBNEIsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFjLEVBQUUsTUFBYztRQUM5RCxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLFlBQVksQ0FBQyxZQUFLLEVBQUUsTUFBTSxFQUFFLGlCQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM5RixDQUFDO0lBRmUsa0JBQVcsY0FFMUIsQ0FBQTtJQUVEOzs7O09BSUc7SUFDSCwwQkFBaUMsQ0FBa0I7UUFDakQsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUZlLHVCQUFnQixtQkFFL0IsQ0FBQTtJQUVEOzs7O09BSUc7SUFDSCxxQkFBNEIsQ0FBa0I7UUFDNUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsS0FBSyxXQUFXLENBQUM7SUFDdEMsQ0FBQztJQUZlLGtCQUFXLGNBRTFCLENBQUE7SUFFRDtRQUNFLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDMUIsQ0FBQyxLQUFLLEVBQUUsVUFBQyxDQUFDO29CQUNSLE1BQU0sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQzdCLENBQUMsQ0FBQztZQUNGLENBQUMsS0FBSyxFQUFFLFVBQUMsQ0FBQztvQkFDUixNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN4QixDQUFDLENBQUM7WUFDRixDQUFDLE9BQU8sRUFBRSxVQUFDLENBQUM7b0JBQ1YsTUFBTSxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDeEIsQ0FBQyxDQUFDO1lBQ0YsQ0FBQyxPQUFPLEVBQUUsVUFBQyxDQUFDO29CQUNWLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3RCLENBQUMsQ0FBQztZQUNGLENBQUMsT0FBTyxFQUFFLFVBQUMsQ0FBQztvQkFDVixNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3pDLENBQUMsQ0FBQztZQUNGLENBQUMsT0FBTyxFQUFFLFVBQUMsQ0FBQztvQkFDVixNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDM0IsQ0FBQyxDQUFDO1lBQ0YsQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNQLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3RCLENBQUMsQ0FBQztZQUNGLENBQUMsSUFBSSxFQUFFO29CQUNMLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2QsQ0FBQyxDQUFDO1NBQ0gsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQTNCZSx1QkFBZ0IsbUJBMkIvQixDQUFBO0lBRUQsdUJBQThCLEtBQUs7UUFFakMsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVoQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQzthQUNuQixJQUFJLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQzthQUMzQixJQUFJLENBQUMsY0FBYyxFQUFFLGdCQUFnQixDQUFDO2FBQ3RDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO2FBQ2QsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7YUFDZCxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQzthQUNsQixJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQzthQUNuQixNQUFNLENBQUMsTUFBTSxDQUFDO2FBQ2QsSUFBSSxDQUFDLEdBQUcsRUFBRSxXQUFXLENBQUM7YUFDdEIsSUFBSSxDQUFDLE9BQU8sRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBRS9DLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO2FBQ25CLElBQUksQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLENBQUM7YUFDNUIsSUFBSSxDQUFDLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQzthQUN0QyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQzthQUNkLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO2FBQ2QsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUM7YUFDbEIsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUM7YUFDbkIsSUFBSSxDQUFDLE9BQU8sRUFBRSw0QkFBNEIsQ0FBQzthQUMzQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUV6QyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQzthQUNuQixJQUFJLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQzthQUN6QixJQUFJLENBQUMsY0FBYyxFQUFFLGdCQUFnQixDQUFDO2FBQ3RDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO2FBQ2QsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7YUFDZCxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQzthQUNsQixJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQzthQUNuQixJQUFJLENBQUMsT0FBTyxFQUFFLDRCQUE0QixDQUFDO2FBQzNDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBRTNDLENBQUM7SUFuQ2Usb0JBQWEsZ0JBbUM1QixDQUFBO0lBRUQsZ0NBQXVDLENBQUMsRUFBRSxTQUFjO1FBQ3RELE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFGZSw2QkFBc0IseUJBRXJDLENBQUE7SUFFRCwyR0FBMkc7SUFDM0csb0JBQTJCLEdBQVc7UUFDcEMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1FBQzFCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyQixNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUNELEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzNDLEdBQUcsR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUNsQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1FBQ3hDLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQVhlLGlCQUFVLGFBV3pCLENBQUE7SUFFRCw0Q0FBbUQsYUFBcUI7UUFDdEUsSUFBSSxNQUFNLENBQUM7UUFDWCxFQUFFLENBQUMsQ0FBQyxhQUFhLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN6QixNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ2IsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxhQUFhLElBQUksR0FBRyxJQUFJLGFBQWEsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDYixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDTixNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ2IsQ0FBQztRQUNELE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQVZlLHlDQUFrQyxxQ0FVakQsQ0FBQTtJQUVELDZDQUFvRCxjQUFzQjtRQUN4RSxJQUFJLE1BQU0sQ0FBQztRQUNYLEVBQUUsQ0FBQyxDQUFDLGNBQWMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDYixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDTixNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ2IsQ0FBQztRQUNELE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQVJlLDBDQUFtQyxzQ0FRbEQsQ0FBQTtJQUVELHFEQUE0RCxjQUFzQjtRQUNoRixJQUFJLE1BQU0sQ0FBQztRQUNYLEVBQUUsQ0FBQyxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDYixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDTixNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2QsQ0FBQztRQUNELE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQVJlLGtEQUEyQyw4Q0FRMUQsQ0FBQTtBQUVILENBQUMsRUE1SlMsTUFBTSxLQUFOLE1BQU0sUUE0SmY7O0FDOUpELGtEQUFrRDtBQUNsRCxJQUFVLE1BQU0sQ0FvVWY7QUFwVUQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFFQSxpQkFBVSxHQUFHLENBQUMsQ0FBQztJQUU1QjtRQUFBO1lBRVMsU0FBSSxHQUFHLFdBQVcsQ0FBQztRQTJUNUIsQ0FBQztRQXpUUSwwQ0FBUyxHQUFoQixVQUFpQixZQUFpQyxFQUFFLE9BQWU7WUFBZix1QkFBZSxHQUFmLGVBQWU7WUFFakUsSUFBTSxRQUFRLEdBQUcsT0FBTyxHQUFHLFdBQVcsR0FBRyxXQUFXLENBQUM7WUFFckQsSUFBTSxhQUFhLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFbEcsbUJBQW1CLFNBQTRCO2dCQUM3QyxTQUFTO3FCQUNOLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDO3FCQUN2QixFQUFFLENBQUMsV0FBVyxFQUFFLFVBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3BCLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDOUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRTtvQkFDaEIsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDMUIsQ0FBQyxDQUFDO3FCQUNELFVBQVUsRUFBRTtxQkFDWixJQUFJLENBQUMsR0FBRyxFQUFFLFVBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2QsTUFBTSxDQUFDLGtCQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxZQUFZLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2xGLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsT0FBTyxFQUFFLFVBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2xCLE1BQU0sQ0FBQywyQkFBb0IsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDaEUsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBQyxDQUFDO29CQUNYLE1BQU0sQ0FBQyx1QkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzlELENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsUUFBUSxFQUFFLFVBQUMsQ0FBQztvQkFDaEIsTUFBTSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLHVCQUFnQixDQUFDLENBQUMsQ0FBQzt3QkFDcEYsWUFBWSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25FLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsU0FBUyxFQUFFLE9BQU8sR0FBRyxJQUFJLEdBQUcsR0FBRyxDQUFDO3FCQUNyQyxJQUFJLENBQUMsTUFBTSxFQUFFLFVBQUMsQ0FBQztvQkFDZCxNQUFNLENBQUMsdUJBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcscUJBQXFCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsU0FBUyxHQUFHLFNBQVMsQ0FBQyxDQUFDO2dCQUN6RixDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxVQUFDLENBQUM7b0JBQ2hCLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ2hCLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsY0FBYyxFQUFFLFVBQUMsQ0FBQztvQkFDdEIsTUFBTSxDQUFDLEdBQUcsQ0FBQztnQkFDYixDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLHFCQUFxQixFQUFFLFVBQUMsQ0FBQztvQkFDN0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7Z0JBQ2YsQ0FBQyxDQUFDLENBQUM7WUFFUCxDQUFDO1lBRUQsc0JBQXNCLFNBQTRCO2dCQUNoRCxTQUFTO3FCQUNOLElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBQyxDQUFDO29CQUNmLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxHQUFHLEdBQUcsYUFBYSxHQUFHLE1BQU0sQ0FBQztnQkFDbEQsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBUyxDQUFDLEVBQUUsQ0FBQztvQkFDdEIsTUFBTSxDQUFDLGtCQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxZQUFZLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2xGLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsR0FBRyxFQUFFLFVBQUMsQ0FBQztvQkFDWCxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUMzRyxDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxVQUFDLENBQUM7b0JBQ2hCLE1BQU0sQ0FBQyx1QkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDbEcsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBQyxDQUFDLEVBQUUsQ0FBQztvQkFDbEIsTUFBTSxDQUFDLDJCQUFvQixDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNoRSxDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUM7cUJBQ3BCLEVBQUUsQ0FBQyxXQUFXLEVBQUUsVUFBQyxDQUFDLEVBQUUsQ0FBQztvQkFDcEIsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM5QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFO29CQUNoQixZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMxQixDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFFRCx1QkFBdUIsU0FBNEI7Z0JBQ2pELFNBQVM7cUJBQ04sSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUM7cUJBQ3BCLElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBQyxDQUFDLEVBQUUsQ0FBQztvQkFDZCxNQUFNLENBQUMsa0JBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFlBQVksQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbEYsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBQyxDQUFDO29CQUNYLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLFlBQVksQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3pFLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsUUFBUSxFQUFFLFVBQUMsQ0FBQztvQkFDaEIsTUFBTSxDQUFDLHVCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzdGLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsT0FBTyxFQUFFLFVBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2xCLE1BQU0sQ0FBQywyQkFBb0IsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDaEUsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDO3FCQUNwQixFQUFFLENBQUMsV0FBVyxFQUFFLFVBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3BCLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDOUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRTtvQkFDaEIsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDMUIsQ0FBQyxDQUFDLENBQUM7WUFFUCxDQUFDO1lBRUQsc0JBQXNCLFNBQTRCO2dCQUNoRCxTQUFTO3FCQUNOLElBQUksQ0FBQyxPQUFPLEVBQUUsa0JBQWtCLENBQUM7cUJBQ2pDLE1BQU0sQ0FBQyxVQUFDLENBQUM7b0JBQ1IsTUFBTSxDQUFDLENBQUMsdUJBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsSUFBSSxFQUFFLFVBQUMsQ0FBQztvQkFDWixNQUFNLENBQUMsNkJBQXNCLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDM0QsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyw2QkFBc0IsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMzRCxDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLElBQUksRUFBRSxVQUFDLENBQUM7b0JBQ1osTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLElBQUksRUFBRSxVQUFDLENBQUM7b0JBQ1osTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxVQUFDLENBQUM7b0JBQ2hCLE1BQU0sQ0FBQyxLQUFLLENBQUM7Z0JBQ2YsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxVQUFDLENBQUM7b0JBQ3hCLE1BQU0sQ0FBQyxHQUFHLENBQUM7Z0JBQ2IsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDO1lBRUQsc0JBQXNCLFNBQTRCO2dCQUNoRCxTQUFTO3FCQUNOLE1BQU0sQ0FBQyxVQUFDLENBQUM7b0JBQ1IsTUFBTSxDQUFDLENBQUMsdUJBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsT0FBTyxFQUFFLHFCQUFxQixDQUFDO3FCQUNwQyxJQUFJLENBQUMsSUFBSSxFQUFFLFVBQUMsQ0FBQztvQkFDWixNQUFNLENBQUMsNkJBQXNCLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDM0QsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyw2QkFBc0IsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMzRCxDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLElBQUksRUFBRSxVQUFDLENBQUM7b0JBQ1osTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLElBQUksRUFBRSxVQUFDLENBQUM7b0JBQ1osTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxVQUFDLENBQUM7b0JBQ2hCLE1BQU0sQ0FBQyxLQUFLLENBQUM7Z0JBQ2YsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLFVBQUMsQ0FBQztvQkFDMUIsTUFBTSxDQUFDLEdBQUcsQ0FBQztnQkFDYixDQUFDLENBQUMsQ0FBQztZQUVQLENBQUM7WUFFRCx1QkFBdUIsU0FBNEI7Z0JBQ2pELFNBQVM7cUJBQ04sTUFBTSxDQUFDLFVBQUMsQ0FBQztvQkFDUixNQUFNLENBQUMsQ0FBQyx1QkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDOUIsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxPQUFPLEVBQUUsbUJBQW1CLENBQUM7cUJBQ2xDLElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyw2QkFBc0IsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDL0QsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyw2QkFBc0IsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDL0QsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDcEMsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDcEMsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsVUFBQyxDQUFDO29CQUNoQixNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUNmLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsY0FBYyxFQUFFLFVBQUMsQ0FBQztvQkFDdEIsTUFBTSxDQUFDLEtBQUssQ0FBQztnQkFDZixDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLGdCQUFnQixFQUFFLFVBQUMsQ0FBQztvQkFDeEIsTUFBTSxDQUFDLEdBQUcsQ0FBQztnQkFDYixDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFFRCwwQkFBMEIsU0FBNEI7Z0JBQ3BELFNBQVM7cUJBQ04sTUFBTSxDQUFDLFVBQUMsQ0FBQztvQkFDUixNQUFNLENBQUMsQ0FBQyx1QkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDOUIsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxPQUFPLEVBQUUsc0JBQXNCLENBQUM7cUJBQ3JDLElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyw2QkFBc0IsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDL0QsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyw2QkFBc0IsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDL0QsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDcEMsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO29CQUNaLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDcEMsQ0FBQyxDQUFDO3FCQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsVUFBQyxDQUFDO29CQUNoQixNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUNmLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsY0FBYyxFQUFFLFVBQUMsQ0FBQztvQkFDdEIsTUFBTSxDQUFDLEtBQUssQ0FBQztnQkFDZixDQUFDLENBQUM7cUJBQ0QsSUFBSSxDQUFDLGdCQUFnQixFQUFFLFVBQUMsQ0FBQztvQkFDeEIsTUFBTSxDQUFDLEdBQUcsQ0FBQztnQkFDYixDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFFRCxzQ0FBc0MsR0FBUSxFQUFFLFNBQTRCLEVBQUUsT0FBaUI7Z0JBQzdGLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQ1oseUNBQXlDO29CQUN6QyxJQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLDZCQUE2QixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUU5RSxrQkFBa0I7b0JBQ2xCLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7b0JBRTVCLGVBQWU7b0JBQ2YsUUFBUTt5QkFDTCxLQUFLLEVBQUU7eUJBQ1AsTUFBTSxDQUFDLE1BQU0sQ0FBQzt5QkFDZCxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7b0JBRXRCLGtCQUFrQjtvQkFDbEIsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUV6Qix3Q0FBd0M7b0JBQ3hDLElBQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFFdkUsa0JBQWtCO29CQUNsQixPQUFPLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO29CQUU1QixlQUFlO29CQUNmLE9BQU87eUJBQ0osS0FBSyxFQUFFO3lCQUNQLE1BQU0sQ0FBQyxNQUFNLENBQUM7eUJBQ2QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO29CQUV2QixrQkFBa0I7b0JBQ2xCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDMUIsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFFTixJQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUUxRixrQkFBa0I7b0JBQ2xCLGlCQUFpQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFFckMsZUFBZTtvQkFDZixpQkFBaUI7eUJBQ2QsS0FBSyxFQUFFO3lCQUNQLE1BQU0sQ0FBQyxNQUFNLENBQUM7eUJBQ2QsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUV0QixrQkFBa0I7b0JBQ2xCLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUVsQyxJQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUU1RixrQkFBa0I7b0JBQ2xCLGdCQUFnQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFFcEMsZUFBZTtvQkFDZixnQkFBZ0I7eUJBQ2IsS0FBSyxFQUFFO3lCQUNQLE1BQU0sQ0FBQyxNQUFNLENBQUM7eUJBQ2QsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUV0QixrQkFBa0I7b0JBQ2xCLGdCQUFnQixDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUVqQyxJQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUUzRixrQkFBa0I7b0JBQ2xCLGlCQUFpQixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFFdEMsZUFBZTtvQkFDZixpQkFBaUI7eUJBQ2QsS0FBSyxFQUFFO3lCQUNQLE1BQU0sQ0FBQyxNQUFNLENBQUM7eUJBQ2QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO29CQUV2QixrQkFBa0I7b0JBQ2xCLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUVsQyxJQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUNqRyxrQkFBa0I7b0JBQ2xCLG9CQUFvQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUU1QyxlQUFlO29CQUNmLG9CQUFvQjt5QkFDakIsS0FBSyxFQUFFO3lCQUNQLE1BQU0sQ0FBQyxNQUFNLENBQUM7eUJBQ2QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7b0JBRTFCLGtCQUFrQjtvQkFDbEIsb0JBQW9CLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3ZDLENBQUM7WUFDSCxDQUFDO1lBRUQsa0JBQWtCO1lBQ2xCLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFOUIsZUFBZTtZQUNmLGFBQWEsQ0FBQyxLQUFLLEVBQUU7aUJBQ2xCLE1BQU0sQ0FBQyxNQUFNLENBQUM7aUJBQ2QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRW5CLGtCQUFrQjtZQUNsQixhQUFhLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7WUFFOUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyw0QkFBNEIsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLFlBQVksQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEYsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLHlEQUF5RDtnQkFDekQsWUFBWSxDQUFDLEdBQUc7cUJBQ2IsU0FBUyxDQUFDLG9GQUFvRixDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDOUcsQ0FBQztRQUVILENBQUM7UUFDSCw2QkFBQztJQUFELENBN1RBLEFBNlRDLElBQUE7SUE3VHFCLDZCQUFzQix5QkE2VDNDLENBQUE7QUFFSCxDQUFDLEVBcFVTLE1BQU0sS0FBTixNQUFNLFFBb1VmOztBQ3JVRCxrREFBa0Q7QUFFbEQsSUFBVSxNQUFNLENBNkdmO0FBN0dELFdBQVUsTUFBTSxFQUFDLENBQUM7SUFDaEIsWUFBWSxDQUFDO0lBSWI7UUFBQTtZQUVTLFNBQUksR0FBRyxNQUFNLENBQUM7UUFvR3ZCLENBQUM7UUFsR1EsNkJBQVMsR0FBaEIsVUFBaUIsWUFBaUM7WUFFaEQsSUFDRSxRQUFRLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7aUJBQ3JCLFdBQVcsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDO2lCQUN2QyxPQUFPLENBQUMsVUFBQyxDQUFNO2dCQUNkLE1BQU0sQ0FBQyxDQUFDLHVCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLENBQUMsQ0FBQztpQkFDRCxDQUFDLENBQUMsVUFBQyxDQUFNO2dCQUNSLE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM3QyxDQUFDLENBQUM7aUJBQ0QsQ0FBQyxDQUFDLFVBQUMsQ0FBTTtnQkFDUixNQUFNLENBQUMsa0JBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwRixDQUFDLENBQUM7aUJBQ0QsRUFBRSxDQUFDLFVBQUMsQ0FBTTtnQkFDVCxNQUFNLENBQUMsa0JBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwRixDQUFDLENBQUMsRUFHSixPQUFPLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7aUJBQ3BCLFdBQVcsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDO2lCQUN2QyxPQUFPLENBQUMsVUFBQyxDQUFNO2dCQUNkLE1BQU0sQ0FBQyxDQUFDLHVCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLENBQUMsQ0FBQztpQkFDRCxDQUFDLENBQUMsVUFBQyxDQUFNO2dCQUNSLE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM3QyxDQUFDLENBQUM7aUJBQ0QsQ0FBQyxDQUFDLFVBQUMsQ0FBTTtnQkFDUixNQUFNLENBQUMsa0JBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMs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LEVBQUUsQ0FBQyxVQUFVLEVBQUU7Z0JBQ2hCLGFBQWE7WUFDZixDQUFDLENBQUMsQ0FBQztZQUNMLGtCQUFrQjtZQUNsQixnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUVuQyxDQUFDO1FBQ0gsdUJBQUM7SUFBRCxDQXhQQSxBQXdQQyxJQUFBO0lBeFBZLHVCQUFnQixtQkF3UDVCLENBQUE7QUFDSCxDQUFDLEVBOVBTLE1BQU0sS0FBTixNQUFNLFFBOFBmIiwiZmlsZSI6Imhhd2t1bGFyLWNoYXJ0cy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG5hbWUgIGhhd2t1bGFyLWNoYXJ0c1xuICpcbiAqIEBkZXNjcmlwdGlvblxuICogICBCYXNlIG1vZHVsZSBmb3IgaGF3a3VsYXItY2hhcnRzLlxuICpcbiAqL1xuYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycsIFtdKTtcbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLyoqXG4gICAqIERlZmluZXMgYW4gaW5kaXZpZHVhbCBhbGVydCBib3VuZHMgIHRvIGJlIHZpc3VhbGx5IGhpZ2hsaWdodGVkIGluIGEgY2hhcnRcbiAgICogdGhhdCBhbiBhbGVydCB3YXMgYWJvdmUvYmVsb3cgYSB0aHJlc2hvbGQuXG4gICAqL1xuICBleHBvcnQgY2xhc3MgQWxlcnRCb3VuZCB7XG4gICAgcHVibGljIHN0YXJ0RGF0ZTogRGF0ZTtcbiAgICBwdWJsaWMgZW5kRGF0ZTogRGF0ZTtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgcHVibGljIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgcHVibGljIGFsZXJ0VmFsdWU6IG51bWJlcikge1xuICAgICAgdGhpcy5zdGFydERhdGUgPSBuZXcgRGF0ZShzdGFydFRpbWVzdGFtcCk7XG4gICAgICB0aGlzLmVuZERhdGUgPSBuZXcgRGF0ZShlbmRUaW1lc3RhbXApO1xuICAgIH1cblxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQWxlcnRMaW5lRGVmKHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcikge1xuICAgIGxldCBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgLmludGVycG9sYXRlKCdtb25vdG9uZScpXG4gICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShhbGVydFZhbHVlKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIGxpbmU7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlQWxlcnRMaW5lKGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zLFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcixcbiAgICBjc3NDbGFzc05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGxldCBwYXRoQWxlcnRMaW5lID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGguYWxlcnRMaW5lJykuZGF0YShbY2hhcnRPcHRpb25zLmNoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHBhdGhBbGVydExpbmUuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZihjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlLCBhbGVydFZhbHVlKSk7XG5cbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBwYXRoQWxlcnRMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdjbGFzcycsIGNzc0NsYXNzTmFtZSlcbiAgICAgIC5hdHRyKCdkJywgY3JlYXRlQWxlcnRMaW5lRGVmKGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUsIGNoYXJ0T3B0aW9ucy55U2NhbGUsIGFsZXJ0VmFsdWUpKTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHBhdGhBbGVydExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXh0cmFjdEFsZXJ0UmFuZ2VzKGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sIHRocmVzaG9sZDogQWxlcnRUaHJlc2hvbGQpOiBBbGVydEJvdW5kW10ge1xuICAgIGxldCBhbGVydEJvdW5kQXJlYUl0ZW1zOiBBbGVydEJvdW5kW107XG4gICAgbGV0IHN0YXJ0UG9pbnRzOiBudW1iZXJbXTtcblxuICAgIGZ1bmN0aW9uIGZpbmRTdGFydFBvaW50cyhjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCB0aHJlc2hvbGQ6IEFsZXJ0VGhyZXNob2xkKSB7XG4gICAgICBsZXQgc3RhcnRQb2ludHMgPSBbXTtcbiAgICAgIGxldCBwcmV2SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBjaGFydERhdGEuZm9yRWFjaCgoY2hhcnRJdGVtOiBJQ2hhcnREYXRhUG9pbnQsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBpZiAoaSA9PT0gMCAmJiBjaGFydEl0ZW0uYXZnID4gdGhyZXNob2xkKSB7XG4gICAgICAgICAgc3RhcnRQb2ludHMucHVzaChpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwcmV2SXRlbSA9IGNoYXJ0RGF0YVtpIC0gMV07XG4gICAgICAgICAgaWYgKGNoYXJ0SXRlbS5hdmcgPiB0aHJlc2hvbGQgJiYgcHJldkl0ZW0gJiYgKCFwcmV2SXRlbS5hdmcgfHwgcHJldkl0ZW0uYXZnIDw9IHRocmVzaG9sZCkpIHtcbiAgICAgICAgICAgIHN0YXJ0UG9pbnRzLnB1c2gocHJldkl0ZW0uYXZnID8gKGkgLSAxKSA6IGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBzdGFydFBvaW50cztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzOiBudW1iZXJbXSwgdGhyZXNob2xkOiBBbGVydFRocmVzaG9sZCk6IEFsZXJ0Qm91bmRbXSB7XG4gICAgICBsZXQgYWxlcnRCb3VuZEFyZWFJdGVtczogQWxlcnRCb3VuZFtdID0gW107XG4gICAgICBsZXQgY3VycmVudEl0ZW06IElDaGFydERhdGFQb2ludDtcbiAgICAgIGxldCBuZXh0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuICAgICAgbGV0IHN0YXJ0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBzdGFydFBvaW50cy5mb3JFYWNoKChzdGFydFBvaW50SW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICBzdGFydEl0ZW0gPSBjaGFydERhdGFbc3RhcnRQb2ludEluZGV4XTtcblxuICAgICAgICBmb3IgKGxldCBqID0gc3RhcnRQb2ludEluZGV4OyBqIDwgY2hhcnREYXRhLmxlbmd0aCAtIDE7IGorKykge1xuICAgICAgICAgIGN1cnJlbnRJdGVtID0gY2hhcnREYXRhW2pdO1xuICAgICAgICAgIG5leHRJdGVtID0gY2hhcnREYXRhW2ogKyAxXTtcblxuICAgICAgICAgIGlmICgoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmIG5leHRJdGVtLmF2ZyA8PSB0aHJlc2hvbGQpXG4gICAgICAgICAgICB8fCAoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmICFuZXh0SXRlbS5hdmcpKSB7XG4gICAgICAgICAgICBhbGVydEJvdW5kQXJlYUl0ZW1zLnB1c2gobmV3IEFsZXJ0Qm91bmQoc3RhcnRJdGVtLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgbmV4dEl0ZW0uYXZnID8gbmV4dEl0ZW0udGltZXN0YW1wIDogY3VycmVudEl0ZW0udGltZXN0YW1wLCB0aHJlc2hvbGQpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vLyBtZWFucyB0aGUgbGFzdCBwaWVjZSBkYXRhIGlzIGFsbCBhYm92ZSB0aHJlc2hvbGQsIHVzZSBsYXN0IGRhdGEgcG9pbnRcbiAgICAgIGlmIChhbGVydEJvdW5kQXJlYUl0ZW1zLmxlbmd0aCA9PT0gKHN0YXJ0UG9pbnRzLmxlbmd0aCAtIDEpKSB7XG4gICAgICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMucHVzaChuZXcgQWxlcnRCb3VuZChjaGFydERhdGFbc3RhcnRQb2ludHNbc3RhcnRQb2ludHMubGVuZ3RoIC0gMV1dLnRpbWVzdGFtcCxcbiAgICAgICAgICBjaGFydERhdGFbY2hhcnREYXRhLmxlbmd0aCAtIDFdLnRpbWVzdGFtcCwgdGhyZXNob2xkKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBhbGVydEJvdW5kQXJlYUl0ZW1zO1xuICAgIH1cblxuICAgIHN0YXJ0UG9pbnRzID0gZmluZFN0YXJ0UG9pbnRzKGNoYXJ0RGF0YSwgdGhyZXNob2xkKTtcblxuICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMgPSBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzLCB0aHJlc2hvbGQpO1xuXG4gICAgcmV0dXJuIGFsZXJ0Qm91bmRBcmVhSXRlbXM7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBbGVydEJvdW5kc0FyZWEoY2hhcnRPcHRpb25zOiBDaGFydE9wdGlvbnMsXG4gICAgYWxlcnRWYWx1ZTogbnVtYmVyLFxuICAgIGhpZ2hCb3VuZDogbnVtYmVyXG4gICkge1xuICAgIGNvbnN0IGFsZXJ0Qm91bmRzOiBBbGVydEJvdW5kW10gPSBleHRyYWN0QWxlcnRSYW5nZXMoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSwgYWxlcnRWYWx1ZSk7XG4gICAgbGV0IHJlY3RBbGVydCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0KCdnLmFsZXJ0SG9sZGVyJykuc2VsZWN0QWxsKCdyZWN0LmFsZXJ0Qm91bmRzJykuZGF0YShhbGVydEJvdW5kcyk7XG5cbiAgICBmdW5jdGlvbiBhbGVydEJvdW5kaW5nUmVjdChzZWxlY3Rpb24pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuYXR0cignY2xhc3MnLCAnYWxlcnRCb3VuZHMnKVxuICAgICAgICAuYXR0cigneCcsIChkOiBBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC5zdGFydFRpbWVzdGFtcCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5JywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGhpZ2hCb3VuZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZDogQWxlcnRCb3VuZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMuaGVpZ2h0IC0gNDA7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd3aWR0aCcsIChkOiBBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC5lbmRUaW1lc3RhbXApIC0gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnN0YXJ0VGltZXN0YW1wKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgcmVjdEFsZXJ0LmNhbGwoYWxlcnRCb3VuZGluZ1JlY3QpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcmVjdEFsZXJ0LmVudGVyKClcbiAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgLmNhbGwoYWxlcnRCb3VuZGluZ1JlY3QpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcmVjdEFsZXJ0LmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkZWNsYXJlIGxldCBkMzogYW55O1xuXG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cbiAgZXhwb3J0IGNsYXNzIEF2YWlsU3RhdHVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgVVAgPSAndXAnO1xuICAgIHB1YmxpYyBzdGF0aWMgRE9XTiA9ICdkb3duJztcbiAgICBwdWJsaWMgc3RhdGljIFVOS05PV04gPSAndW5rbm93bic7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykge1xuICAgICAgLy8gZW1wdHlcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSBpbnB1dCBkYXRhIGZvcm1hdCwgZGlyZWN0bHkgZnJvbSBNZXRyaWNzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQXZhaWxEYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyB0aGUgdHJhbnNmb3JtZWQgb3V0cHV0IGRhdGEgZm9ybWF0LiBGb3JtYXR0ZWQgdG8gd29yayB3aXRoIGF2YWlsYWJpbGl0eSBjaGFydCAoYmFzaWNhbGx5IGEgRFRPKS5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBudW1iZXI7XG4gICAgZW5kOiBudW1iZXI7XG4gICAgdmFsdWU6IHN0cmluZztcbiAgICBzdGFydERhdGU/OiBEYXRlOyAvLy8gTWFpbmx5IGZvciBkZWJ1Z2dlciBodW1hbiByZWFkYWJsZSBkYXRlcyBpbnN0ZWFkIG9mIGEgbnVtYmVyXG4gICAgZW5kRGF0ZT86IERhdGU7XG4gICAgZHVyYXRpb24/OiBzdHJpbmc7XG4gICAgbWVzc2FnZT86IHN0cmluZztcbiAgfVxuXG4gIGV4cG9ydCBjbGFzcyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IGltcGxlbWVudHMgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHN0YXJ0OiBudW1iZXIsXG4gICAgICBwdWJsaWMgZW5kOiBudW1iZXIsXG4gICAgICBwdWJsaWMgdmFsdWU6IHN0cmluZyxcbiAgICAgIHB1YmxpYyBzdGFydERhdGU/OiBEYXRlLFxuICAgICAgcHVibGljIGVuZERhdGU/OiBEYXRlLFxuICAgICAgcHVibGljIGR1cmF0aW9uPzogc3RyaW5nLFxuICAgICAgcHVibGljIG1lc3NhZ2U/OiBzdHJpbmcpIHtcblxuICAgICAgdGhpcy5kdXJhdGlvbiA9IG1vbWVudChlbmQpLmZyb20obW9tZW50KHN0YXJ0KSwgdHJ1ZSk7XG4gICAgICB0aGlzLnN0YXJ0RGF0ZSA9IG5ldyBEYXRlKHN0YXJ0KTtcbiAgICAgIHRoaXMuZW5kRGF0ZSA9IG5ldyBEYXRlKGVuZCk7XG4gICAgfVxuXG4gIH1cblxuICBleHBvcnQgY2xhc3MgQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX0hFSUdIVCA9IDE1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfV0lEVEggPSA3NTA7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGRhdGE6ICc9JyxcbiAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgIHRpbWVMYWJlbDogJ0AnLFxuICAgICAgZGF0ZUxhYmVsOiAnQCcsXG4gICAgICBjaGFydFRpdGxlOiAnQCdcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6IChzY29wZTogYW55LCBlbGVtZW50OiBuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczogYW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIHRyYW5zZm9ybWVkRGF0YVBvaW50czogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSB7XG5cbiAgICAgIHRoaXMubGluayA9IChzY29wZSwgZWxlbWVudCwgYXR0cnMpID0+IHtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IHN0YXJ0VGltZXN0YW1wOiBudW1iZXIgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAsXG4gICAgICAgICAgZW5kVGltZXN0YW1wOiBudW1iZXIgPSArYXR0cnMuZW5kVGltZXN0YW1wLFxuICAgICAgICAgIGNoYXJ0SGVpZ2h0ID0gQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVDtcblxuICAgICAgICAvLyBjaGFydCBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBtYXJnaW4gPSB7IHRvcDogMTAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwIH0sXG4gICAgICAgICAgd2lkdGggPSBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5fQ0hBUlRfV0lEVEggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCxcbiAgICAgICAgICBhZGp1c3RlZENoYXJ0SGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSA1MCxcbiAgICAgICAgICBoZWlnaHQgPSBhZGp1c3RlZENoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgdGl0bGVIZWlnaHQgPSAzMCxcbiAgICAgICAgICB0aXRsZVNwYWNlID0gMTAsXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AgLSB0aXRsZUhlaWdodCAtIHRpdGxlU3BhY2UsXG4gICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodDIgPSArdGl0bGVIZWlnaHQgKyB0aXRsZVNwYWNlICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgIHhBeGlzR3JvdXAsXG4gICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICB0aXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnO1xuXG4gICAgICAgIGZ1bmN0aW9uIGJ1aWxkQXZhaWxIb3ZlcihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz5TdGF0dXM6PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QudmFsdWUudG9VcHBlckNhc2UoKX08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSBiZWZvcmUtc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+RHVyYXRpb246PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QuZHVyYXRpb259PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uZVRpbWVDaGFydFNldHVwKCk6IHZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgLmF0dHIoJ3ZpZXdCb3gnLCAnMCAwIDc2MCAxNTAnKS5hdHRyKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ3hNaW5ZTWluIG1lZXQnKTtcblxuICAgICAgICAgIHRpcCA9IGQzLnRpcCgpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZDMtdGlwJylcbiAgICAgICAgICAgIC5vZmZzZXQoWy0xMCwgMF0pXG4gICAgICAgICAgICAuaHRtbCgoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGJ1aWxkQXZhaWxIb3ZlcihkKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoICsgbWFyZ2luLmxlZnQgKyBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodClcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsJyArIChhZGp1c3RlZENoYXJ0SGVpZ2h0MikgKyAnKScpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZGVmcycpXG4gICAgICAgICAgICAuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgICAgICAgIC5hdHRyKCdpZCcsICdkaWFnb25hbC1zdHJpcGVzJylcbiAgICAgICAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgICAgICAgLmF0dHIoJ3BhdHRlcm5UcmFuc2Zvcm0nLCAnc2NhbGUoMC43KScpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCA0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDQpXG4gICAgICAgICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5hdHRyKCdkJywgJ00tMSwxIGwyLC0yIE0wLDQgbDQsLTQgTTMsNSBsMiwtMicpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgJyNCNkI2QjYnKVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIDEuMik7XG5cbiAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lQXZhaWxTY2FsZSh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSB7XG4gICAgICAgICAgbGV0IGFkanVzdGVkVGltZVJhbmdlOiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAgfHxcbiAgICAgICAgICAgIGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGQuc3RhcnQ7XG4gICAgICAgICAgICB9KSB8fCArbW9tZW50KCkuc3VidHJhY3QoMSwgJ2hvdXInKTtcblxuICAgICAgICAgIGlmICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50ICYmIHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQubGVuZ3RoID4gMCkge1xuXG4gICAgICAgICAgICBhZGp1c3RlZFRpbWVSYW5nZVswXSA9IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgICAgYWRqdXN0ZWRUaW1lUmFuZ2VbMV0gPSBlbmRUaW1lc3RhbXAgfHwgK21vbWVudCgpO1xuXG4gICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlUm91bmQoWzcwLCAwXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihbMCwgMTc1XSk7XG5cbiAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAudGlja3MoMClcbiAgICAgICAgICAgICAgLnRpY2tTaXplKDAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgICAuZG9tYWluKGFkanVzdGVkVGltZVJhbmdlKTtcblxuICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgIC50aWNrU2l6ZSgtNzAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ3RvcCcpXG4gICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSk7XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBpc1VwKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVQLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2Z1bmN0aW9uIGlzRG93bihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAvLyAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLkRPV04udG9TdHJpbmcoKTtcbiAgICAgICAgLy99XG5cbiAgICAgICAgZnVuY3Rpb24gaXNVbmtub3duKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVOS05PV04udG9TdHJpbmcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhpbkF2YWlsRGF0YTogSUF2YWlsRGF0YVBvaW50W10pOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdIHtcbiAgICAgICAgICBsZXQgb3V0cHV0RGF0YTogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSA9IFtdO1xuICAgICAgICAgIGxldCBpdGVtQ291bnQgPSBpbkF2YWlsRGF0YS5sZW5ndGg7XG5cbiAgICAgICAgICBmdW5jdGlvbiBzb3J0QnlUaW1lc3RhbXAoYTogSUF2YWlsRGF0YVBvaW50LCBiOiBJQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIGlmIChhLnRpbWVzdGFtcCA8IGIudGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhLnRpbWVzdGFtcCA+IGIudGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaW5BdmFpbERhdGEuc29ydChzb3J0QnlUaW1lc3RhbXApO1xuXG4gICAgICAgICAgaWYgKGluQXZhaWxEYXRhICYmIGl0ZW1Db3VudCA+IDAgJiYgaW5BdmFpbERhdGFbMF0udGltZXN0YW1wKSB7XG4gICAgICAgICAgICBsZXQgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICAgICAgICAgIGlmIChpdGVtQ291bnQgPT09IDEpIHtcbiAgICAgICAgICAgICAgbGV0IGF2YWlsSXRlbSA9IGluQXZhaWxEYXRhWzBdO1xuXG4gICAgICAgICAgICAgIC8vIHdlIG9ubHkgaGF2ZSBvbmUgaXRlbSB3aXRoIHN0YXJ0IHRpbWUuIEFzc3VtZSB1bmtub3duIGZvciB0aGUgdGltZSBiZWZvcmUgKGxhc3QgMWgpXG4gICAgICAgICAgICAgIC8vIEBUT0RPIGFkanVzdCB0byB0aW1lIHBpY2tlclxuICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQobm93IC0gNjAgKiA2MCAqIDEwMDAsXG4gICAgICAgICAgICAgICAgYXZhaWxJdGVtLnRpbWVzdGFtcCwgQXZhaWxTdGF0dXMuVU5LTk9XTi50b1N0cmluZygpKSk7XG4gICAgICAgICAgICAgIC8vIGFuZCB0aGUgZGV0ZXJtaW5lZCB2YWx1ZSB1cCB1bnRpbCB0aGUgZW5kLlxuICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoYXZhaWxJdGVtLnRpbWVzdGFtcCwgbm93LCBhdmFpbEl0ZW0udmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxldCBiYWNrd2FyZHNFbmRUaW1lID0gbm93O1xuXG4gICAgICAgICAgICAgIGZvciAobGV0IGkgPSBpbkF2YWlsRGF0YS5sZW5ndGg7IGkgPiAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGRhdGEgc3RhcnRpbmcgaW4gdGhlIGZ1dHVyZS4uLiBkaXNjYXJkIGl0XG4gICAgICAgICAgICAgICAgLy9pZiAoaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCA+ICttb21lbnQoKSkge1xuICAgICAgICAgICAgICAgIC8vICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAvL31cbiAgICAgICAgICAgICAgICBpZiAoc3RhcnRUaW1lc3RhbXAgPj0gaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KHN0YXJ0VGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lLCBpbkF2YWlsRGF0YVtpIC0gMV0udmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSwgaW5BdmFpbERhdGFbaSAtIDFdLnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lID0gaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG91dHB1dERhdGE7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVTaWRlWUF4aXNMYWJlbHMoKSB7XG4gICAgICAgICAgLy8vQFRvZG86IG1vdmUgb3V0IHRvIHN0eWxlc2hlZXRcbiAgICAgICAgICBzdmcuYXBwZW5kKCd0ZXh0JylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmFpbFVwTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDI1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdVcCcpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgndGV4dCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxEb3duTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDU1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdEb3duJyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10pIHtcbiAgICAgICAgICAvL2xldCB4QXhpc01pbiA9IGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAvLyAgcmV0dXJuICtkLnN0YXJ0O1xuICAgICAgICAgIC8vfSksXG4gICAgICAgICAgbGV0IHhBeGlzTWF4ID0gZDMubWF4KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICtkLmVuZDtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBhdmFpbFRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAuZG9tYWluKFtzdGFydFRpbWVzdGFtcCwgZW5kVGltZXN0YW1wIHx8IHhBeGlzTWF4XSksXG5cbiAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2UoW2hlaWdodCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oWzAsIDRdKTtcblxuICAgICAgICAgIC8vYXZhaWxYQXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAvLyAgLnNjYWxlKGF2YWlsVGltZVNjYWxlKVxuICAgICAgICAgIC8vICAudGlja3MoOClcbiAgICAgICAgICAvLyAgLnRpY2tTaXplKDEzLCAwKVxuICAgICAgICAgIC8vICAub3JpZW50KCd0b3AnKTtcblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgb2Zmc2V0IGZvciB0aGUgYmFyXG4gICAgICAgICAgLy8gVXAgb3IgVW5rbm93bjogb2Zmc2V0IDAsIERvd246IG9mZnNldCAzNVxuICAgICAgICAgIGZ1bmN0aW9uIGNhbGNCYXJZKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgICByZXR1cm4gaGVpZ2h0IC0geVNjYWxlKDApICsgKChpc1VwKGQpIHx8IGlzVW5rbm93bihkKSkgPyAwIDogMzUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgcmVtb3ZlZCBoZWlnaHQgZm9yIHRoZSBiYXJcbiAgICAgICAgICAvLyBVbmtub3duOiBmdWxsIGhlaWdodCAxNSwgVXAgb3IgRG93bjogaGFsZiBoZWlnaHQsIDUwXG4gICAgICAgICAgZnVuY3Rpb24gY2FsY0JhckhlaWdodChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgcmV0dXJuIHlTY2FsZSgwKSAtIChpc1Vua25vd24oZCkgPyAxNSA6IDUwKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjYWxjQmFyRmlsbChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgaWYgKGlzVXAoZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjNTRBMjRFJzsgLy8gZ3JlZW5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNVbmtub3duKGQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndXJsKCNkaWFnb25hbC1zdHJpcGVzKSc7IC8vIGdyYXkgc3RyaXBlc1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjRDg1MDU0JzsgLy8gcmVkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncmVjdC5hdmFpbEJhcnMnKVxuICAgICAgICAgICAgLmRhdGEodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludClcbiAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxCYXJzJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJZKGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gY2FsY0JhckhlaWdodChkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGRFbmQgPSBlbmRUaW1lc3RhbXAgPyAoTWF0aC5taW4oK2QuZW5kLCBlbmRUaW1lc3RhbXApKSA6ICgrZC5lbmQpO1xuICAgICAgICAgICAgICByZXR1cm4gYXZhaWxUaW1lU2NhbGUoZEVuZCkgLSBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJGaWxsKGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gMC44NTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2Vkb3duJywgKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgYnJ1c2hFbGVtID0gc3ZnLnNlbGVjdCgnLmJydXNoJykubm9kZSgpO1xuICAgICAgICAgICAgICBsZXQgY2xpY2tFdmVudDogYW55ID0gbmV3IEV2ZW50KCdtb3VzZWRvd24nKTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWCA9IGQzLmV2ZW50LnBhZ2VYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFggPSBkMy5ldmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VZID0gZDMuZXZlbnQucGFnZVk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WSA9IGQzLmV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICAgIGJydXNoRWxlbS5kaXNwYXRjaEV2ZW50KGNsaWNrRXZlbnQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2V1cCcsICgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGJydXNoRWxlbSA9IHN2Zy5zZWxlY3QoJy5icnVzaCcpLm5vZGUoKTtcbiAgICAgICAgICAgICAgbGV0IGNsaWNrRXZlbnQ6IGFueSA9IG5ldyBFdmVudCgnbW91c2V1cCcpO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VYID0gZDMuZXZlbnQucGFnZVg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WCA9IGQzLmV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVkgPSBkMy5ldmVudC5wYWdlWTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRZID0gZDMuZXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgYnJ1c2hFbGVtLmRpc3BhdGNoRXZlbnQoY2xpY2tFdmVudCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIFRoZSBib3R0b20gbGluZSBvZiB0aGUgYXZhaWxhYmlsaXR5IGNoYXJ0XG4gICAgICAgICAgc3ZnLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuYXR0cigneDEnLCAwKVxuICAgICAgICAgICAgLmF0dHIoJ3kxJywgNzApXG4gICAgICAgICAgICAuYXR0cigneDInLCA2NTUpXG4gICAgICAgICAgICAuYXR0cigneTInLCA3MClcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAwLjUpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgJyNEMEQwRDAnKTtcblxuICAgICAgICAgIGNyZWF0ZVNpZGVZQXhpc0xhYmVscygpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWGFuZFlBeGVzKCkge1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGJydXNoRW5kKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDcwKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgZXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgIHN0YXJ0VGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvL3N2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5BVkFJTF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBleHRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChuZXdEYXRhKSB7XG4gICAgICAgICAgICB0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyA9IGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ3N0YXJ0VGltZXN0YW1wJywgJ2VuZFRpbWVzdGFtcCddLCAobmV3VGltZXN0YW1wKSA9PiB7XG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzBdIHx8IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgIGVuZFRpbWVzdGFtcCA9ICtuZXdUaW1lc3RhbXBbMV0gfHwgZW5kVGltZXN0YW1wO1xuICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLnJlbmRlciA9ICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQgJiYgdHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUudGltZSgnYXZhaWxDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgb25lVGltZUNoYXJ0U2V0dXAoKTtcbiAgICAgICAgICAgIGRldGVybWluZUF2YWlsU2NhbGUodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCk7XG4gICAgICAgICAgICBjcmVhdGVYYW5kWUF4ZXMoKTtcbiAgICAgICAgICAgIGNyZWF0ZVhBeGlzQnJ1c2goKTtcbiAgICAgICAgICAgIGNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpO1xuICAgICAgICAgICAgLy9jb25zb2xlLnRpbWVFbmQoJ2F2YWlsQ2hhcnRSZW5kZXInKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnYXZhaWxhYmlsaXR5Q2hhcnQnLCBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5GYWN0b3J5KCkpO1xufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgY29uc3QgX21vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKTtcblxuICBleHBvcnQgY2xhc3MgQ29udGV4dENoYXJ0RGlyZWN0aXZlIHtcblxuICAgIC8vIHRoZXNlIGFyZSBqdXN0IHN0YXJ0aW5nIHBhcmFtZXRlciBoaW50c1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9XSURUSF9ISU5UID0gNzUwO1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9IRUlHSFRfSElOVCA9IDUwO1xuICAgIHByaXZhdGUgc3RhdGljIF9YQVhJU19IRUlHSFQgPSAxNTtcblxuICAgIHB1YmxpYyByZXN0cmljdCA9ICdFJztcbiAgICBwdWJsaWMgcmVwbGFjZSA9IHRydWU7XG5cbiAgICAvLyBDYW4ndCB1c2UgMS40IGRpcmVjdGl2ZSBjb250cm9sbGVycyBiZWNhdXNlIHdlIG5lZWQgdG8gc3VwcG9ydCAxLjMrXG4gICAgcHVibGljIHNjb3BlID0ge1xuICAgICAgZGF0YTogJz0nLFxuICAgICAgc2hvd1lBeGlzVmFsdWVzOiAnPScsXG4gICAgfTtcblxuICAgIHB1YmxpYyBsaW5rOiAoc2NvcGU6IGFueSwgZWxlbWVudDogbmcuSUF1Z21lbnRlZEpRdWVyeSwgYXR0cnM6IGFueSkgPT4gdm9pZDtcblxuICAgIHB1YmxpYyBkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSB7XG5cbiAgICAgIHRoaXMubGluayA9IChzY29wZSwgZWxlbWVudCwgYXR0cnMpID0+IHtcblxuICAgICAgICBjb25zdCBtYXJnaW4gPSB7IHRvcDogMCwgcmlnaHQ6IDUsIGJvdHRvbTogNSwgbGVmdDogOTAgfTtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IGNoYXJ0SGVpZ2h0ID0gQ29udGV4dENoYXJ0RGlyZWN0aXZlLl9DSEFSVF9IRUlHSFRfSElOVCxcbiAgICAgICAgICB3aWR0aCA9IENvbnRleHRDaGFydERpcmVjdGl2ZS5fQ0hBUlRfV0lEVEhfSElOVCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0LFxuICAgICAgICAgIGhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20gLSAxNSxcbiAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICBzaG93WUF4aXNWYWx1ZXM6IGJvb2xlYW4sXG4gICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgIHlBeGlzR3JvdXAsXG4gICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgIHhBeGlzR3JvdXAsXG4gICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICBjaGFydCxcbiAgICAgICAgICBjaGFydFBhcmVudCxcbiAgICAgICAgICBzdmc7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhdHRycy5zaG93WUF4aXNWYWx1ZXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzID0gYXR0cnMuc2hvd1lBeGlzVmFsdWVzID09PSAndHJ1ZSc7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiByZXNpemUoKTogdm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG5cbiAgICAgICAgICBjb25zdCBwYXJlbnROb2RlID0gZWxlbWVudFswXS5wYXJlbnROb2RlO1xuXG4gICAgICAgICAgd2lkdGggPSAoPGFueT5wYXJlbnROb2RlKS5jbGllbnRXaWR0aDtcbiAgICAgICAgICBoZWlnaHQgPSAoPGFueT5wYXJlbnROb2RlKS5jbGllbnRIZWlnaHQ7XG5cbiAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSAtIENvbnRleHRDaGFydERpcmVjdGl2ZS5fWEFYSVNfSEVJR0hULFxuXG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdDb250ZXh0IFdpZHRoOiAlaScsd2lkdGgpO1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnQ29udGV4dCBIZWlnaHQ6ICVpJyxoZWlnaHQpO1xuXG4gICAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcDtcblxuICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgd2lkdGggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBpbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCAwKScpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dENoYXJ0Jyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUNvbnRleHRDaGFydChkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkge1xuXG4gICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoIC0gMTBdKVxuICAgICAgICAgICAgLm5pY2UoKVxuICAgICAgICAgICAgLmRvbWFpbihbZGF0YVBvaW50c1swXS50aW1lc3RhbXAsIGRhdGFQb2ludHNbZGF0YVBvaW50cy5sZW5ndGggLSAxXS50aW1lc3RhbXBdKTtcblxuICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgLnNjYWxlKHRpbWVTY2FsZSlcbiAgICAgICAgICAgIC50aWNrU2l6ZSg0LCAwKVxuICAgICAgICAgICAgLnRpY2tGb3JtYXQoeEF4aXNUaW1lRm9ybWF0cygpKVxuICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgIHhBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd4IGF4aXMnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwnICsgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ICsgJyknKVxuICAgICAgICAgICAgLmNhbGwoeEF4aXMpO1xuXG4gICAgICAgICAgbGV0IHlNaW4gPSBkMy5taW4oZGF0YVBvaW50cywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgeU1heCA9IGQzLm1heChkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gZ2l2ZSBhIHBhZCBvZiAlIHRvIG1pbi9tYXggc28gd2UgYXJlIG5vdCBhZ2FpbnN0IHgtYXhpc1xuICAgICAgICAgIHlNYXggPSB5TWF4ICsgKHlNYXggKiAwLjAzKTtcbiAgICAgICAgICB5TWluID0geU1pbiAtICh5TWluICogMC4wNSk7XG5cbiAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgLnJhbmdlUm91bmQoW21vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgMF0pXG4gICAgICAgICAgICAubmljZSgpXG4gICAgICAgICAgICAuZG9tYWluKFt5TWluLCB5TWF4XSk7XG5cbiAgICAgICAgICBsZXQgbnVtYmVyT2ZUaWNrcyA9IHNob3dZQXhpc1ZhbHVlcyA/IDIgOiAwO1xuXG4gICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgLnRpY2tzKG51bWJlck9mVGlja3MpXG4gICAgICAgICAgICAudGlja1NpemUoNCwgMClcbiAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgIHlBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd5IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeUF4aXMpO1xuXG4gICAgICAgICAgbGV0IGFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgICAuaW50ZXJwb2xhdGUoJ2NhcmRpbmFsJylcbiAgICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkwKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTEoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IGNvbnRleHRMaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgLmludGVycG9sYXRlKCdjYXJkaW5hbCcpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAhZC5lbXB0eTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBwYXRoQ29udGV4dExpbmUgPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmNvbnRleHRMaW5lJykuZGF0YShbZGF0YVBvaW50c10pO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgcGF0aENvbnRleHRMaW5lLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRMaW5lJylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5hdHRyKCdkJywgY29udGV4dExpbmUpO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgcGF0aENvbnRleHRMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdjb250ZXh0TGluZScpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuYXR0cignZCcsIGNvbnRleHRMaW5lKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIHBhdGhDb250ZXh0TGluZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgICBsZXQgY29udGV4dEFyZWEgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdjb250ZXh0Jyk7XG5cbiAgICAgICAgICBjb250ZXh0QXJlYS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgLmRhdHVtKGRhdGFQb2ludHMpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuZHVyYXRpb24oNTAwKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRBcmVhJylcbiAgICAgICAgICAgIC5hdHRyKCdkJywgYXJlYSk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBjb250ZXh0QnJ1c2hTdGFydClcbiAgICAgICAgICAgIC5vbignYnJ1c2hlbmQnLCBjb250ZXh0QnJ1c2hFbmQpO1xuXG4gICAgICAgICAgeEF4aXNHcm91cC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cigneScsIDApXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaGVpZ2h0IC0gMTApO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JydXNoJylcbiAgICAgICAgICAgIC5jYWxsKGJydXNoKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCcucmVzaXplJykuYXBwZW5kKCdwYXRoJyk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaGVpZ2h0ICsgMTcpO1xuXG4gICAgICAgICAgZnVuY3Rpb24gY29udGV4dEJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY29udGV4dEJydXNoRW5kKCkge1xuICAgICAgICAgICAgbGV0IGJydXNoRXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgIHN0YXJ0VGltZSA9IE1hdGgucm91bmQoYnJ1c2hFeHRlbnRbMF0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgZW5kVGltZSA9IE1hdGgucm91bmQoYnJ1c2hFeHRlbnRbMV0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgZHJhZ1NlbGVjdGlvbkRlbHRhID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcblxuICAgICAgICAgICAgLy8vIFdlIGlnbm9yZSBkcmFnIHNlbGVjdGlvbnMgdW5kZXIgYSBtaW51dGVcbiAgICAgICAgICAgIGlmIChkcmFnU2VsZWN0aW9uRGVsdGEgPj0gNjAwMDApIHtcbiAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEV2ZW50TmFtZXMuQ09OVEVYVF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBicnVzaEV4dGVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL2JydXNoR3JvdXAuY2FsbChicnVzaC5jbGVhcigpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL2QzLnNlbGVjdCh3aW5kb3cpLm9uKCdyZXNpemUnLCBzY29wZS5yZW5kZXIodGhpcy5kYXRhUG9pbnRzKSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignZGF0YScsIChuZXdEYXRhKSA9PiB7XG4gICAgICAgICAgaWYgKG5ld0RhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVBvaW50cyA9IGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQoYW5ndWxhci5mcm9tSnNvbihuZXdEYXRhKSk7XG4gICAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy5kYXRhUG9pbnRzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOiBJQ2hhcnREYXRhUG9pbnRbXSB7XG4gICAgICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5tYXAoKHBvaW50OiBJQ2hhcnREYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAvL2RhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUucmVuZGVyID0gKGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKGRhdGFQb2ludHMgJiYgZGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLnRpbWUoJ2NvbnRleHRDaGFydFJlbmRlcicpO1xuXG4gICAgICAgICAgICAvLy9OT1RFOiBsYXllcmluZyBvcmRlciBpcyBpbXBvcnRhbnQhXG4gICAgICAgICAgICByZXNpemUoKTtcbiAgICAgICAgICAgIGNyZWF0ZUNvbnRleHRDaGFydChkYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIGNyZWF0ZVhBeGlzQnJ1c2goKTtcbiAgICAgICAgICAgIGNvbnNvbGUudGltZUVuZCgnY29udGV4dENoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcblxuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb250ZXh0Q2hhcnREaXJlY3RpdmUoJHJvb3RTY29wZSk7XG4gICAgICB9O1xuXG4gICAgICBkaXJlY3RpdmVbJyRpbmplY3QnXSA9IFsnJHJvb3RTY29wZSddO1xuXG4gICAgICByZXR1cm4gZGlyZWN0aXZlO1xuICAgIH1cblxuICB9XG5cbiAgX21vZHVsZS5kaXJlY3RpdmUoJ2hhd2t1bGFyQ29udGV4dENoYXJ0JywgQ29udGV4dENoYXJ0RGlyZWN0aXZlLkZhY3RvcnkoKSk7XG59XG4iLCIvLy9cbi8vLyBDb3B5cmlnaHQgMjAxNSBSZWQgSGF0LCBJbmMuIGFuZC9vciBpdHMgYWZmaWxpYXRlc1xuLy8vIGFuZCBvdGhlciBjb250cmlidXRvcnMgYXMgaW5kaWNhdGVkIGJ5IHRoZSBAYXV0aG9yIHRhZ3MuXG4vLy9cbi8vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vL1xuLy8vICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy8vXG4vLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4vLy9cbi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLy8vIE5PVEU6IHRoaXMgcGF0dGVybiBpcyB1c2VkIGJlY2F1c2UgZW51bXMgY2FudCBiZSB1c2VkIHdpdGggc3RyaW5nc1xuICBleHBvcnQgY2xhc3MgRXZlbnROYW1lcyB7XG5cbiAgICBwdWJsaWMgc3RhdGljIENIQVJUX1RJTUVSQU5HRV9DSEFOR0VEID0gbmV3IEV2ZW50TmFtZXMoJ0NoYXJ0VGltZVJhbmdlQ2hhbmdlZCcpO1xuICAgIHB1YmxpYyBzdGF0aWMgQVZBSUxfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnQXZhaWxDaGFydFRpbWVSYW5nZUNoYW5nZWQnKTtcbiAgICBwdWJsaWMgc3RhdGljIENPTlRFWFRfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnQ29udGV4dENoYXJ0VGltZVJhbmdlQ2hhbmdlZCcpO1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHZhbHVlOiBzdHJpbmcpIHtcbiAgICAgIC8vIGVtcHR5XG4gICAgfVxuXG4gICAgcHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICByZXR1cm4gdGhpcy52YWx1ZTtcbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBkYXRhIHBvaW50cyBhbG9uZyB0aGUgbGluZSB0byBzaG93IHRoZSBhY3R1YWwgdmFsdWVzLlxuICAgKiBAcGFyYW0gc3ZnXG4gICAqIEBwYXJhbSB0aW1lU2NhbGVcbiAgICogQHBhcmFtIHlTY2FsZVxuICAgKiBAcGFyYW0gdGlwXG4gICAqIEBwYXJhbSBkYXRhUG9pbnRzXG4gICAqL1xuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlRGF0YVBvaW50cyhzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICB0aXA6IGFueSxcbiAgICBkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkge1xuICAgIGxldCByYWRpdXMgPSAxO1xuICAgIGxldCBkb3REYXRhcG9pbnQgPSBzdmcuc2VsZWN0QWxsKCcuZGF0YVBvaW50RG90JykuZGF0YShkYXRhUG9pbnRzKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBkb3REYXRhcG9pbnQuYXR0cignY2xhc3MnLCAnZGF0YVBvaW50RG90JylcbiAgICAgIC5hdHRyKCdyJywgcmFkaXVzKVxuICAgICAgLmF0dHIoJ2N4JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiBkLmF2ZyA/IHlTY2FsZShkLmF2ZykgOiAtOTk5OTk5OTtcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBkb3REYXRhcG9pbnQuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAuYXR0cignY2xhc3MnLCAnZGF0YVBvaW50RG90JylcbiAgICAgIC5hdHRyKCdyJywgcmFkaXVzKVxuICAgICAgLmF0dHIoJ2N4JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiBkLmF2ZyA/IHlTY2FsZShkLmF2ZykgOiAtOTk5OTk5OTtcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBkb3REYXRhcG9pbnQuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZnVuY3Rpb24gY3JlYXRlRm9yZWNhc3RMaW5lKG5ld0ludGVycG9sYXRpb24sIHRpbWVTY2FsZSwgeVNjYWxlKSB7XG4gICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgbGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRlKVxuICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgIH0pXG4gICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQudmFsdWUpO1xuICAgICAgICB9KTtcblxuICAgIHJldHVybiBsaW5lO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIHNob3dGb3JlY2FzdERhdGEoZm9yZWNhc3REYXRhOiBJUHJlZGljdGl2ZU1ldHJpY1tdLCBjaGFydE9wdGlvbnM6IENoYXJ0T3B0aW9ucykge1xuICAgIGxldCBleGlzdHNNaW5Pck1heCxcbiAgICAgIGxhc3RGb3JlY2FzdFBvaW50ID0gZm9yZWNhc3REYXRhW2ZvcmVjYXN0RGF0YS5sZW5ndGggLSAxXTtcblxuICAgIGV4aXN0c01pbk9yTWF4ID0gbGFzdEZvcmVjYXN0UG9pbnQubWluIHx8IGxhc3RGb3JlY2FzdFBvaW50Lm1heDtcblxuICAgIGlmIChleGlzdHNNaW5Pck1heCkge1xuICAgICAgbGV0XG4gICAgICAgIG1heEFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgLmludGVycG9sYXRlKGNoYXJ0T3B0aW9ucy5pbnRlcnBvbGF0aW9uKVxuICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIGxldFxuICAgICAgICBwcmVkaWN0aXZlQ29uZUFyZWFQYXRoID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGguQ29uZUFyZWEnKS5kYXRhKFtmb3JlY2FzdERhdGFdKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgcHJlZGljdGl2ZUNvbmVBcmVhUGF0aC5hdHRyKCdjbGFzcycsICdjb25lQXJlYScpXG4gICAgICAgIC5hdHRyKCdkJywgbWF4QXJlYSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIHByZWRpY3RpdmVDb25lQXJlYVBhdGguZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnY29uZUFyZWEnKVxuICAgICAgICAuYXR0cignZCcsIG1heEFyZWEpO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBwcmVkaWN0aXZlQ29uZUFyZWFQYXRoLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgIH1cblxuICAgIGxldCBmb3JlY2FzdFBhdGhMaW5lID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5mb3JlY2FzdExpbmUnKS5kYXRhKFtmb3JlY2FzdERhdGFdKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBmb3JlY2FzdFBhdGhMaW5lLmF0dHIoJ2NsYXNzJywgJ2ZvcmVjYXN0TGluZScpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUZvcmVjYXN0TGluZSgnbW9ub3RvbmUnLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlKSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgZm9yZWNhc3RQYXRoTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignY2xhc3MnLCAnZm9yZWNhc3RMaW5lJylcbiAgICAgIC5hdHRyKCdkJywgY3JlYXRlRm9yZWNhc3RMaW5lKCdtb25vdG9uZScsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUsIGNoYXJ0T3B0aW9ucy55U2NhbGUpKTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBmb3JlY2FzdFBhdGhMaW5lLmV4aXQoKS5yZW1vdmUoKTtcblxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICBpbXBvcnQgY3JlYXRlU3ZnRGVmcyA9IENoYXJ0cy5jcmVhdGVTdmdEZWZzO1xuICAndXNlIHN0cmljdCc7XG5cbiAgZGVjbGFyZSBsZXQgZDM6IGFueTtcbiAgZGVjbGFyZSBsZXQgY29uc29sZTogYW55O1xuXG4gIGxldCBkZWJ1ZzogYm9vbGVhbiA9IGZhbHNlO1xuXG4gIC8vIHRoZSBzY2FsZSB0byB1c2UgZm9yIHktYXhpcyB3aGVuIGFsbCB2YWx1ZXMgYXJlIDAsIFswLCBERUZBVUxUX1lfU0NBTEVdXG4gIGV4cG9ydCBjb25zdCBERUZBVUxUX1lfU0NBTEUgPSAxMDtcbiAgZXhwb3J0IGNvbnN0IFhfQVhJU19IRUlHSFQgPSAyNTsgLy8gd2l0aCByb29tIGZvciBsYWJlbFxuICBleHBvcnQgY29uc3QgSE9WRVJfREFURV9USU1FX0ZPUk1BVCA9ICdNTS9ERC9ZWVlZIGg6bW0gYSc7XG4gIGV4cG9ydCBjb25zdCBtYXJnaW4gPSB7IHRvcDogMTAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwIH07IC8vIGxlZnQgbWFyZ2luIHJvb20gZm9yIGxhYmVsXG4gIGV4cG9ydCBsZXQgd2lkdGg7XG5cbiAgLyoqXG4gICAqIEBuZ2RvYyBkaXJlY3RpdmVcbiAgICogQG5hbWUgaGF3a3VsYXJDaGFydFxuICAgKiBAZGVzY3JpcHRpb24gQSBkMyBiYXNlZCBjaGFydGluZyBkaXJlY3Rpb24gdG8gcHJvdmlkZSBjaGFydGluZyB1c2luZyB2YXJpb3VzIHN0eWxlcyBvZiBjaGFydHMuXG4gICAqXG4gICAqL1xuICBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJylcbiAgICAuZGlyZWN0aXZlKCdoYXdrdWxhckNoYXJ0JywgWyckcm9vdFNjb3BlJywgJyRodHRwJywgJyR3aW5kb3cnLCAnJGludGVydmFsJywgJyRsb2cnLFxuICAgICAgZnVuY3Rpb24oJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UsXG4gICAgICAgICRodHRwOiBuZy5JSHR0cFNlcnZpY2UsXG4gICAgICAgICR3aW5kb3c6IG5nLklXaW5kb3dTZXJ2aWNlLFxuICAgICAgICAkaW50ZXJ2YWw6IG5nLklJbnRlcnZhbFNlcnZpY2UsXG4gICAgICAgICRsb2c6IG5nLklMb2dTZXJ2aWNlKTogbmcuSURpcmVjdGl2ZSB7XG5cbiAgICAgICAgZnVuY3Rpb24gbGluayhzY29wZSwgZWxlbWVudCwgYXR0cnMpIHtcblxuICAgICAgICAgIC8vIGRhdGEgc3BlY2lmaWMgdmFyc1xuICAgICAgICAgIGxldCBkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSA9IFtdLFxuICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzOiBJTXVsdGlEYXRhUG9pbnRbXSxcbiAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50czogSVByZWRpY3RpdmVNZXRyaWNbXSxcbiAgICAgICAgICAgIGRhdGFVcmwgPSBhdHRycy5tZXRyaWNVcmwsXG4gICAgICAgICAgICBtZXRyaWNJZCA9IGF0dHJzLm1ldHJpY0lkIHx8ICcnLFxuICAgICAgICAgICAgbWV0cmljVGVuYW50SWQgPSBhdHRycy5tZXRyaWNUZW5hbnRJZCB8fCAnJyxcbiAgICAgICAgICAgIG1ldHJpY1R5cGUgPSBhdHRycy5tZXRyaWNUeXBlIHx8ICdnYXVnZScsXG4gICAgICAgICAgICB0aW1lUmFuZ2VJblNlY29uZHMgPSArYXR0cnMudGltZVJhbmdlSW5TZWNvbmRzIHx8IDQzMjAwLFxuICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzID0gK2F0dHJzLnJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyB8fCAzNjAwLFxuICAgICAgICAgICAgYWxlcnRWYWx1ZSA9ICthdHRycy5hbGVydFZhbHVlLFxuICAgICAgICAgICAgaW50ZXJwb2xhdGlvbiA9IGF0dHJzLmludGVycG9sYXRpb24gfHwgJ21vbm90b25lJyxcbiAgICAgICAgICAgIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gRGF0ZS5ub3coKSxcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOiBUaW1lSW5NaWxsaXMgPSBlbmRUaW1lc3RhbXAgLSB0aW1lUmFuZ2VJblNlY29uZHMsXG4gICAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YVBvaW50cyA9IFtdLFxuICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGEgPSBbXSxcbiAgICAgICAgICAgIGNoYXJ0VHlwZSA9IGF0dHJzLmNoYXJ0VHlwZSB8fCAnbGluZScsXG4gICAgICAgICAgICBzaW5nbGVWYWx1ZUxhYmVsID0gYXR0cnMuc2luZ2xlVmFsdWVMYWJlbCB8fCAnUmF3IFZhbHVlJyxcbiAgICAgICAgICAgIG5vRGF0YUxhYmVsID0gYXR0cnMubm9EYXRhTGFiZWwgfHwgJ05vIERhdGEnLFxuICAgICAgICAgICAgZHVyYXRpb25MYWJlbCA9IGF0dHJzLmR1cmF0aW9uTGFiZWwgfHwgJ0ludGVydmFsJyxcbiAgICAgICAgICAgIG1pbkxhYmVsID0gYXR0cnMubWluTGFiZWwgfHwgJ01pbicsXG4gICAgICAgICAgICBtYXhMYWJlbCA9IGF0dHJzLm1heExhYmVsIHx8ICdNYXgnLFxuICAgICAgICAgICAgYXZnTGFiZWwgPSBhdHRycy5hdmdMYWJlbCB8fCAnQXZnJyxcbiAgICAgICAgICAgIHRpbWVzdGFtcExhYmVsID0gYXR0cnMudGltZXN0YW1wTGFiZWwgfHwgJ1RpbWVzdGFtcCcsXG4gICAgICAgICAgICBzaG93QXZnTGluZSA9IHRydWUsXG4gICAgICAgICAgICBzaG93RGF0YVBvaW50cyA9IGZhbHNlLFxuICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMgPSBmYWxzZSxcbiAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZSA9IGZhbHNlO1xuXG4gICAgICAgICAgLy8gY2hhcnQgc3BlY2lmaWMgdmFyc1xuXG4gICAgICAgICAgbGV0IGhlaWdodCxcbiAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCxcbiAgICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wICsgbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgICAgeEF4aXMsXG4gICAgICAgICAgICB0aXAsXG4gICAgICAgICAgICBicnVzaCxcbiAgICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgICBjaGFydCxcbiAgICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgICAgc3ZnLFxuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbixcbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXgsXG4gICAgICAgICAgICBwZWFrLFxuICAgICAgICAgICAgbWluLFxuICAgICAgICAgICAgcHJvY2Vzc2VkTmV3RGF0YSxcbiAgICAgICAgICAgIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhLFxuICAgICAgICAgICAgc3RhcnRJbnRlcnZhbFByb21pc2U7XG5cbiAgICAgICAgICBkYXRhUG9pbnRzID0gYXR0cnMuZGF0YTtcbiAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHMgPSBhdHRycy5mb3JlY2FzdERhdGE7XG4gICAgICAgICAgc2hvd0RhdGFQb2ludHMgPSBhdHRycy5zaG93RGF0YVBvaW50cztcbiAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YVBvaW50cyA9IGF0dHJzLnByZXZpb3VzUmFuZ2VEYXRhO1xuICAgICAgICAgIGFubm90YXRpb25EYXRhID0gYXR0cnMuYW5ub3RhdGlvbkRhdGE7XG5cbiAgICAgICAgICBjb25zdCByZWdpc3RlcmVkQ2hhcnRUeXBlczogSUNoYXJ0VHlwZVtdID0gW107XG4gICAgICAgICAgcmVnaXN0ZXJlZENoYXJ0VHlwZXMucHVzaChuZXcgTGluZUNoYXJ0KCkpO1xuICAgICAgICAgIHJlZ2lzdGVyZWRDaGFydFR5cGVzLnB1c2gobmV3IEFyZWFDaGFydCgpKTtcbiAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5wdXNoKG5ldyBTY2F0dGVyQ2hhcnQoKSk7XG4gICAgICAgICAgcmVnaXN0ZXJlZENoYXJ0VHlwZXMucHVzaChuZXcgU2NhdHRlckxpbmVDaGFydCgpKTtcbiAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5wdXNoKG5ldyBIaXN0b2dyYW1DaGFydCgpKTtcbiAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5wdXNoKG5ldyBSaHFCYXJDaGFydCgpKTtcbiAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5wdXNoKG5ldyBNdWx0aUxpbmVDaGFydCgpKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIHJlc2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICAgIGNoYXJ0UGFyZW50LnNlbGVjdEFsbCgnKicpLnJlbW92ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSBlbGVtZW50WzBdLnBhcmVudE5vZGU7XG5cbiAgICAgICAgICAgIHdpZHRoID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50V2lkdGg7XG4gICAgICAgICAgICBoZWlnaHQgPSAoPGFueT5wYXJlbnROb2RlKS5jbGllbnRIZWlnaHQ7XG5cbiAgICAgICAgICAgIGlmICh3aWR0aCA9PT0gMCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBzZXR0aW5nIHVwIGNoYXJ0LiBXaWR0aCBpcyAwIG9uIGNoYXJ0IHBhcmVudCBjb250YWluZXIuYCk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoZWlnaHQgPT09IDApIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3Igc2V0dGluZyB1cCBjaGFydC4gSGVpZ2h0IGlzIDAgb24gY2hhcnQgcGFyZW50IGNvbnRhaW5lci5gKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSAtIFhfQVhJU19IRUlHSFQ7XG5cbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ01ldHJpYyBXaWR0aDogJWknLCB3aWR0aCk7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdNZXRyaWMgSGVpZ2h0OiAlaScsIGhlaWdodCk7XG5cbiAgICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wO1xuXG4gICAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgd2lkdGggKyBtYXJnaW4ubGVmdCArIG1hcmdpbi5yaWdodClcbiAgICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICAvL2NyZWF0ZVN2Z0RlZnMoY2hhcnQpO1xuXG4gICAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyAobWFyZ2luLnRvcCkgKyAnKScpO1xuXG4gICAgICAgICAgICB0aXAgPSBkMy50aXAoKVxuICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZDMtdGlwJylcbiAgICAgICAgICAgICAgLm9mZnNldChbLTEwLCAwXSlcbiAgICAgICAgICAgICAgLmh0bWwoKGQsIGkpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnVpbGRIb3ZlcihkLCBpKTtcbiAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHN2Zy5jYWxsKHRpcCk7XG5cbiAgICAgICAgICAgIC8vIGEgcGxhY2Vob2xkZXIgZm9yIHRoZSBhbGVydHNcbiAgICAgICAgICAgIHN2Zy5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdhbGVydEhvbGRlcicpO1xuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gc2V0dXBGaWx0ZXJlZERhdGEoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pOiB2b2lkIHtcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgcGVhayA9IGQzLm1heChkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKSA/IChkLmF2ZyB8fCBkLnZhbHVlKSA6IDA7XG4gICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgICBtaW4gPSBkMy5taW4oZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyAoZC5hdmcgfHwgZC52YWx1ZSkgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vIGxldHMgYWRqdXN0IHRoZSBtaW4gYW5kIG1heCB0byBhZGQgc29tZSB2aXN1YWwgc3BhY2luZyBiZXR3ZWVuIGl0IGFuZCB0aGUgYXhlc1xuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbiA9IHVzZVplcm9NaW5WYWx1ZSA/IDAgOiBtaW4gKiAuOTU7XG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuXG4gICAgICAgICAgICAvLy8gY2hlY2sgaWYgd2UgbmVlZCB0byBhZGp1c3QgaGlnaC9sb3cgYm91bmQgdG8gZml0IGFsZXJ0IHZhbHVlXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSkge1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gTWF0aC5tYXgodmlzdWFsbHlBZGp1c3RlZE1heCwgYWxlcnRWYWx1ZSAqIDEuMik7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSBNYXRoLm1pbih2aXN1YWxseUFkanVzdGVkTWluLCBhbGVydFZhbHVlICogLjk1KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vIHVzZSBkZWZhdWx0IFkgc2NhbGUgaW4gY2FzZSBoaWdoIGFuZCBsb3cgYm91bmQgYXJlIDAgKGllLCBubyB2YWx1ZXMgb3IgYWxsIDApXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gISEhdmlzdWFsbHlBZGp1c3RlZE1heCAmJiAhISF2aXN1YWxseUFkanVzdGVkTWluID8gREVGQVVMVF9ZX1NDQUxFIDpcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBnZXRZU2NhbGUoKTogYW55IHtcbiAgICAgICAgICAgIHJldHVybiBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlUm91bmQoW21vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sIHZpc3VhbGx5QWRqdXN0ZWRNYXhdKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVTY2FsZShkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgbGV0IHhUaWNrcyA9IGRldGVybWluZVhBeGlzVGlja3NGcm9tU2NyZWVuV2lkdGgod2lkdGggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCksXG4gICAgICAgICAgICAgIHlUaWNrcyA9IGRldGVybWluZVlBeGlzVGlja3NGcm9tU2NyZWVuSGVpZ2h0KG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgICAgICBjaGFydERhdGEgPSBkYXRhUG9pbnRzO1xuXG4gICAgICAgICAgICAgIHNldHVwRmlsdGVyZWREYXRhKGRhdGFQb2ludHMpO1xuXG4gICAgICAgICAgICAgIHlTY2FsZSA9IGdldFlTY2FsZSgpO1xuXG4gICAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHlUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgICAgbGV0IHRpbWVTY2FsZU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgIGxldCB0aW1lU2NhbGVNYXg7XG4gICAgICAgICAgICAgIGlmIChmb3JlY2FzdERhdGFQb2ludHMgJiYgZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBmb3JlY2FzdERhdGFQb2ludHNbZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBkMy5tYXgoZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHRdKVxuICAgICAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt0aW1lU2NhbGVNaW4sIHRpbWVTY2FsZU1heF0pO1xuXG4gICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBzZXR1cEZpbHRlcmVkTXVsdGlEYXRhKG11bHRpRGF0YVBvaW50czogSU11bHRpRGF0YVBvaW50W10pOiBhbnkge1xuICAgICAgICAgICAgbGV0IGFsZXJ0UGVhazogbnVtYmVyLFxuICAgICAgICAgICAgICBoaWdoUGVhazogbnVtYmVyO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKSB7XG4gICAgICAgICAgICAgIGxldCBjdXJyZW50TWF4OiBudW1iZXIsXG4gICAgICAgICAgICAgICAgY3VycmVudE1pbjogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlcmllc01heDogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlcmllc01pbjogbnVtYmVyLFxuICAgICAgICAgICAgICAgIG1heExpc3Q6IG51bWJlcltdID0gW10sXG4gICAgICAgICAgICAgICAgbWluTGlzdDogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMuZm9yRWFjaCgoc2VyaWVzKSA9PiB7XG4gICAgICAgICAgICAgICAgY3VycmVudE1heCA9IGQzLm1heChzZXJpZXMudmFsdWVzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogZC5hdmc7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIG1heExpc3QucHVzaChjdXJyZW50TWF4KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50TWluID0gZDMubWluKHNlcmllcy52YWx1ZXMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyBkLmF2ZyA6IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIG1pbkxpc3QucHVzaChjdXJyZW50TWluKTtcblxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgc2VyaWVzTWF4ID0gZDMubWF4KG1heExpc3QpO1xuICAgICAgICAgICAgICBzZXJpZXNNaW4gPSBkMy5taW4obWluTGlzdCk7XG4gICAgICAgICAgICAgIHJldHVybiBbc2VyaWVzTWluLCBzZXJpZXNNYXhdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBtaW5NYXggPSBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKTtcbiAgICAgICAgICAgIHBlYWsgPSBtaW5NYXhbMV07XG4gICAgICAgICAgICBtaW4gPSBtaW5NYXhbMF07XG5cbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluIC0gKG1pbiAqIDAuMDUpO1xuICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgICAgYWxlcnRQZWFrID0gKGFsZXJ0VmFsdWUgKiAxLjIpO1xuICAgICAgICAgICAgICBoaWdoUGVhayA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IGFsZXJ0UGVhayA+IGhpZ2hQZWFrID8gYWxlcnRQZWFrIDogaGlnaFBlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sICEhIXZpc3VhbGx5QWRqdXN0ZWRNYXggJiYgISEhdmlzdWFsbHlBZGp1c3RlZE1pbiA/IERFRkFVTFRfWV9TQ0FMRSA6XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXhdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZU11bHRpU2NhbGUobXVsdGlEYXRhUG9pbnRzOiBJTXVsdGlEYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgY29uc3QgeFRpY2tzID0gZGV0ZXJtaW5lWEF4aXNUaWNrc0Zyb21TY3JlZW5XaWR0aCh3aWR0aCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0KSxcbiAgICAgICAgICAgICAgeVRpY2tzID0gZGV0ZXJtaW5lWEF4aXNUaWNrc0Zyb21TY3JlZW5XaWR0aChtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICBpZiAobXVsdGlEYXRhUG9pbnRzICYmIG11bHRpRGF0YVBvaW50c1swXSAmJiBtdWx0aURhdGFQb2ludHNbMF0udmFsdWVzKSB7XG5cbiAgICAgICAgICAgICAgbGV0IGxvd0hpZ2ggPSBzZXR1cEZpbHRlcmVkTXVsdGlEYXRhKG11bHRpRGF0YVBvaW50cyk7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSBsb3dIaWdoWzBdO1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gbG93SGlnaFsxXTtcblxuICAgICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAgIC5yYW5nZVJvdW5kKFttb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsIDBdKVxuICAgICAgICAgICAgICAgIC5kb21haW4oW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sIHZpc3VhbGx5QWRqdXN0ZWRNYXhdKTtcblxuICAgICAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAgIC50aWNrcyh5VGlja3MpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodF0pXG4gICAgICAgICAgICAgICAgLmRvbWFpbihbZDMubWluKG11bHRpRGF0YVBvaW50cywgKGQpID0+IGQzLm1pbihkLnZhbHVlcywgKHApID0+IHAudGltZXN0YW1wKSksXG4gICAgICAgICAgICAgICAgICBkMy5tYXgobXVsdGlEYXRhUG9pbnRzLCAoZCkgPT4gZDMubWF4KGQudmFsdWVzLCAocCkgPT4gcC50aW1lc3RhbXApKV0pO1xuXG4gICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvKipcbiAgICAgICAgICAgKiBMb2FkIG1ldHJpY3MgZGF0YSBkaXJlY3RseSBmcm9tIGEgcnVubmluZyBIYXdrdWxhci1NZXRyaWNzIHNlcnZlclxuICAgICAgICAgICAqIEBwYXJhbSB1cmxcbiAgICAgICAgICAgKiBAcGFyYW0gbWV0cmljSWRcbiAgICAgICAgICAgKiBAcGFyYW0gc3RhcnRUaW1lc3RhbXBcbiAgICAgICAgICAgKiBAcGFyYW0gZW5kVGltZXN0YW1wXG4gICAgICAgICAgICogQHBhcmFtIGJ1Y2tldHNcbiAgICAgICAgICAgKi9cbiAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UodXJsOiBVcmxUeXBlLFxuICAgICAgICAgICAgbWV0cmljSWQ6IE1ldHJpY0lkLFxuICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgICAgICAgIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgICAgICAgYnVja2V0cyA9IDYwKSB7XG5cbiAgICAgICAgICAgIGxldCByZXF1ZXN0Q29uZmlnOiBuZy5JUmVxdWVzdENvbmZpZyA9IDxhbnk+e1xuICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0hhd2t1bGFyLVRlbmFudCc6IG1ldHJpY1RlbmFudElkXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBlbmQ6IGVuZFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBidWNrZXRzOiBidWNrZXRzXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzdGFydFRpbWVzdGFtcCA+PSBlbmRUaW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgJGxvZy5sb2coJ1N0YXJ0IGRhdGUgd2FzIGFmdGVyIGVuZCBkYXRlJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh1cmwgJiYgbWV0cmljVHlwZSAmJiBtZXRyaWNJZCkge1xuXG4gICAgICAgICAgICAgIGxldCBtZXRyaWNUeXBlQW5kRGF0YSA9IG1ldHJpY1R5cGUuc3BsaXQoJy0nKTtcbiAgICAgICAgICAgICAgLy8vIHNhbXBsZSB1cmw6XG4gICAgICAgICAgICAgIC8vLyBodHRwOi8vbG9jYWxob3N0OjgwODAvaGF3a3VsYXIvbWV0cmljcy9nYXVnZXMvNDViMjI1NmVmZjE5Y2I5ODI1NDJiMTY3YjM5NTcwMzYuc3RhdHVzLmR1cmF0aW9uL2RhdGE/XG4gICAgICAgICAgICAgIC8vIGJ1Y2tldHM9MTIwJmVuZD0xNDM2ODMxNzk3NTMzJnN0YXJ0PTE0MzY4MjgxOTc1MzMnXG4gICAgICAgICAgICAgICRodHRwLmdldCh1cmwgKyAnLycgKyBtZXRyaWNUeXBlQW5kRGF0YVswXSArICdzLycgKyBtZXRyaWNJZCArICcvJyArIChtZXRyaWNUeXBlQW5kRGF0YVsxXSB8fCAnZGF0YScpLFxuICAgICAgICAgICAgICAgIHJlcXVlc3RDb25maWcpLnN1Y2Nlc3MoKHJlc3BvbnNlKSA9PiB7XG5cbiAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcblxuICAgICAgICAgICAgICAgIH0pLmVycm9yKChyZWFzb24sIHN0YXR1cykgPT4ge1xuICAgICAgICAgICAgICAgICAgJGxvZy5lcnJvcignRXJyb3IgTG9hZGluZyBDaGFydCBEYXRhOicgKyBzdGF0dXMgKyAnLCAnICsgcmVhc29uKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8qKlxuICAgICAgICAgICAqIFRyYW5zZm9ybSB0aGUgcmF3IGh0dHAgcmVzcG9uc2UgZnJvbSBNZXRyaWNzIHRvIG9uZSB1c2FibGUgaW4gY2hhcnRzXG4gICAgICAgICAgICogQHBhcmFtIHJlc3BvbnNlXG4gICAgICAgICAgICogQHJldHVybnMgdHJhbnNmb3JtZWQgcmVzcG9uc2UgdG8gSUNoYXJ0RGF0YVBvaW50W10sIHJlYWR5IHRvIGJlIGNoYXJ0ZWRcbiAgICAgICAgICAgKi9cbiAgICAgICAgICBmdW5jdGlvbiBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTogSUNoYXJ0RGF0YVBvaW50W10ge1xuICAgICAgICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UubWFwKChwb2ludDogSUNoYXJ0RGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiB0aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgICBkYXRlOiBuZXcgRGF0ZSh0aW1lc3RhbXApLFxuICAgICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgYXZnOiAocG9pbnQuZW1wdHkpID8gdW5kZWZpbmVkIDogcG9pbnQuYXZnLFxuICAgICAgICAgICAgICAgICAgbWluOiAhYW5ndWxhci5pc051bWJlcihwb2ludC5taW4pID8gdW5kZWZpbmVkIDogcG9pbnQubWluLFxuICAgICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgICAgZW1wdHk6IHBvaW50LmVtcHR5XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYnVpbGRIb3ZlcihkOiBJQ2hhcnREYXRhUG9pbnQsIGk6IG51bWJlcikge1xuICAgICAgICAgICAgbGV0IGhvdmVyLFxuICAgICAgICAgICAgICBwcmV2VGltZXN0YW1wLFxuICAgICAgICAgICAgICBjdXJyZW50VGltZXN0YW1wID0gZC50aW1lc3RhbXAsXG4gICAgICAgICAgICAgIGJhckR1cmF0aW9uLFxuICAgICAgICAgICAgICBmb3JtYXR0ZWREYXRlVGltZSA9IG1vbWVudChkLnRpbWVzdGFtcCkuZm9ybWF0KEhPVkVSX0RBVEVfVElNRV9GT1JNQVQpO1xuXG4gICAgICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgcHJldlRpbWVzdGFtcCA9IGNoYXJ0RGF0YVtpIC0gMV0udGltZXN0YW1wO1xuICAgICAgICAgICAgICBiYXJEdXJhdGlvbiA9IG1vbWVudChjdXJyZW50VGltZXN0YW1wKS5mcm9tKG1vbWVudChwcmV2VGltZXN0YW1wKSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0VtcHR5RGF0YVBvaW50KGQpKSB7XG4gICAgICAgICAgICAgIC8vIG5vZGF0YVxuICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICA8c21hbGwgY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtub0RhdGFMYWJlbH08L3NtYWxsPlxuICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7ZHVyYXRpb25MYWJlbH08L3NwYW4+PHNwYW4+OlxuICAgICAgICAgICAgICAgIDwvc3Bhbj48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2JhckR1cmF0aW9ufTwvc3Bhbj48L3NtYWxsPiA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8aHIvPlxuICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7dGltZXN0YW1wTGFiZWx9PC9zcGFuPjxzcGFuPjpcbiAgICAgICAgICAgICAgICA8L3NwYW4+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtmb3JtYXR0ZWREYXRlVGltZX08L3NwYW4+PC9zbWFsbD48L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKGlzUmF3TWV0cmljKGQpKSB7XG4gICAgICAgICAgICAgICAgLy8gcmF3IHNpbmdsZSB2YWx1ZSBmcm9tIHJhdyB0YWJsZVxuICAgICAgICAgICAgICAgIGhvdmVyID0gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7dGltZXN0YW1wTGFiZWx9PC9zcGFuPjxzcGFuPjogPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7Zm9ybWF0dGVkRGF0ZVRpbWV9PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2R1cmF0aW9uTGFiZWx9PC9zcGFuPjxzcGFuPjogPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+PC9zbWFsbD48L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDxoci8+XG4gICAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3NpbmdsZVZhbHVlTGFiZWx9PC9zcGFuPjxzcGFuPjogPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLnZhbHVlLCAyKX08L3NwYW4+PC9zbWFsbD4gPC9kaXY+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj4gYDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBhZ2dyZWdhdGUgd2l0aCBtaW4vYXZnL21heFxuICAgICAgICAgICAgICAgIGhvdmVyID0gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7dGltZXN0YW1wTGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSBiZWZvcmUtc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2R1cmF0aW9uTGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2JhckR1cmF0aW9ufTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSBzZXBhcmF0b3InPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7bWF4TGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QzLnJvdW5kKGQubWF4LCAyKX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7YXZnTGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QzLnJvdW5kKGQuYXZnLCAyKX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7bWluTGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QzLnJvdW5kKGQubWluLCAyKX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPC9kaXY+IGA7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBob3ZlcjtcblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVlBeGlzR3JpZExpbmVzKCkge1xuICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSB5IGF4aXMgZ3JpZCBsaW5lc1xuICAgICAgICAgICAgY29uc3QgbnVtYmVyT2ZZQXhpc0dyaWRMaW5lcyA9IGRldGVybWluZVlBeGlzR3JpZExpbmVUaWNrc0Zyb21TY3JlZW5IZWlnaHQobW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgICAgeVNjYWxlID0gZ2V0WVNjYWxlKCk7XG5cbiAgICAgICAgICAgIGlmICh5U2NhbGUpIHtcbiAgICAgICAgICAgICAgbGV0IHlBeGlzID0gc3ZnLnNlbGVjdEFsbCgnZy5ncmlkLnlfZ3JpZCcpO1xuICAgICAgICAgICAgICBpZiAoIXlBeGlzWzBdLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHlBeGlzID0gc3ZnLmFwcGVuZCgnZycpLmNsYXNzZWQoJ2dyaWQgeV9ncmlkJywgdHJ1ZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgeUF4aXNcbiAgICAgICAgICAgICAgICAuY2FsbChkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpXG4gICAgICAgICAgICAgICAgICAudGlja3MobnVtYmVyT2ZZQXhpc0dyaWRMaW5lcylcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSgtd2lkdGgsIDApXG4gICAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCgnJylcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgICAgZnVuY3Rpb24gYXhpc1RyYW5zaXRpb24oc2VsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAuZGVsYXkoMjUwKVxuICAgICAgICAgICAgICAgIC5kdXJhdGlvbig3NTApXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAxLjApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoeUF4aXMpIHtcblxuICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgICAgICAvKiB0c2xpbnQ6ZGlzYWJsZTpuby11bnVzZWQtdmFyaWFibGUgKi9cblxuICAgICAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgICAgIGxldCB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwnICsgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ICsgJyknKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgIC5jYWxsKHhBeGlzKVxuICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcblxuICAgICAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgICAgIGxldCB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgLmNhbGwoeUF4aXMpXG4gICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuXG4gICAgICAgICAgICAgIGxldCB5QXhpc0xhYmVsID0gc3ZnLnNlbGVjdEFsbCgnLnlBeGlzVW5pdHNMYWJlbCcpO1xuICAgICAgICAgICAgICBpZiAobW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID49IDE1MCAmJiBhdHRycy55QXhpc1VuaXRzKSB7XG4gICAgICAgICAgICAgICAgeUF4aXNMYWJlbCA9IHN2Zy5hcHBlbmQoJ3RleHQnKS5hdHRyKCdjbGFzcycsICd5QXhpc1VuaXRzTGFiZWwnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICdyb3RhdGUoLTkwKSx0cmFuc2xhdGUoLTIwLC01MCknKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3gnLCAtbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0IC8gMilcbiAgICAgICAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnY2VudGVyJylcbiAgICAgICAgICAgICAgICAgIC50ZXh0KGF0dHJzLnlBeGlzVW5pdHMgPT09ICdOT05FJyA/ICcnIDogYXR0cnMueUF4aXNVbml0cylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVDZW50ZXJlZExpbmUobmV3SW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAgICAgICAuZGVmaW5lZCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnkoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBsaW5lO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUF2Z0xpbmVzKCkge1xuICAgICAgICAgICAgaWYgKGNoYXJ0VHlwZSA9PT0gJ2JhcicgfHwgY2hhcnRUeXBlID09PSAnc2NhdHRlcmxpbmUnKSB7XG4gICAgICAgICAgICAgIGxldCBwYXRoQXZnTGluZSA9IHN2Zy5zZWxlY3RBbGwoJy5iYXJBdmdMaW5lJykuZGF0YShbY2hhcnREYXRhXSk7XG4gICAgICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgICAgICBwYXRoQXZnTGluZS5hdHRyKCdjbGFzcycsICdiYXJBdmdMaW5lJylcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUNlbnRlcmVkTGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICBwYXRoQXZnTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JhckF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlQ2VudGVyZWRMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLnNlbGVjdEFsbCgnZy5icnVzaCcpO1xuICAgICAgICAgICAgaWYgKGJydXNoR3JvdXAuZW1wdHkoKSkge1xuICAgICAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2JydXNoJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJydXNoID0gZDMuc3ZnLmJydXNoKClcbiAgICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgICAub24oJ2JydXNoZW5kJywgYnJ1c2hFbmQpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBicnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGJydXNoRW5kKCkge1xuICAgICAgICAgICAgICBsZXQgZXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMF0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMV0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgICAvLyBpZ25vcmUgcmFuZ2Ugc2VsZWN0aW9ucyBsZXNzIHRoYW4gMSBtaW51dGVcbiAgICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IFtdO1xuXG4gICAgICAgICAgICAgICAgbGV0IGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zID0gbmV3IENoYXJ0T3B0aW9ucyhzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCBjaGFydERhdGEsIG11bHRpRGF0YVBvaW50cyxcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgaGVpZ2h0LCB0aXAsIHZpc3VhbGx5QWRqdXN0ZWRNYXgsXG4gICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcywgaW50ZXJwb2xhdGlvbik7XG5cbiAgICAgICAgICAgICAgICBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YVBvaW50cywgY2hhcnRPcHRpb25zKTtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBleHRlbnQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIGNsZWFyIHRoZSBicnVzaCBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlUHJldmlvdXNSYW5nZU92ZXJsYXkocHJldlJhbmdlRGF0YSkge1xuICAgICAgICAgICAgaWYgKHByZXZSYW5nZURhdGEpIHtcbiAgICAgICAgICAgICAgc3ZnLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgLmRhdHVtKHByZXZSYW5nZURhdGEpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ByZXZSYW5nZUF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgIC5zdHlsZSgnc3Ryb2tlLWRhc2hhcnJheScsICgnOSwzJykpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVDZW50ZXJlZExpbmUoJ2xpbmVhcicpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGFubm90YXRlQ2hhcnQoYW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgIGlmIChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCcuYW5ub3RhdGlvbkRvdCcpXG4gICAgICAgICAgICAgICAgLmRhdGEoYW5ub3RhdGlvbkRhdGEpXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhbm5vdGF0aW9uRG90JylcbiAgICAgICAgICAgICAgICAuYXR0cigncicsIDUpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2N5JywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGhlaWdodCAtIHlTY2FsZSh2aXN1YWxseUFkanVzdGVkTWF4KTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5zdHlsZSgnZmlsbCcsIChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoZC5zZXZlcml0eSA9PT0gJzEnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZC5zZXZlcml0eSA9PT0gJzInKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAneWVsbG93JztcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnd2hpdGUnO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSwgb2xkRGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld0RhdGEgfHwgb2xkRGF0YSkge1xuICAgICAgICAgICAgICBwcm9jZXNzZWROZXdEYXRhID0gYW5ndWxhci5mcm9tSnNvbihuZXdEYXRhIHx8IFtdKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdtdWx0aURhdGEnLCAobmV3TXVsdGlEYXRhLCBvbGRNdWx0aURhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdNdWx0aURhdGEgfHwgb2xkTXVsdGlEYXRhKSB7XG4gICAgICAgICAgICAgIG11bHRpRGF0YVBvaW50cyA9IGFuZ3VsYXIuZnJvbUpzb24obmV3TXVsdGlEYXRhIHx8IFtdKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdwcmV2aW91c1JhbmdlRGF0YScsIChuZXdQcmV2aW91c1JhbmdlVmFsdWVzKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3UHJldmlvdXNSYW5nZVZhbHVlcykge1xuICAgICAgICAgICAgICAvLyRsb2cuZGVidWcoJ1ByZXZpb3VzIFJhbmdlIGRhdGEgY2hhbmdlZCcpO1xuICAgICAgICAgICAgICBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24obmV3UHJldmlvdXNSYW5nZVZhbHVlcyk7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgnYW5ub3RhdGlvbkRhdGEnLCAobmV3QW5ub3RhdGlvbkRhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdBbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24obmV3QW5ub3RhdGlvbkRhdGEpO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ2ZvcmVjYXN0RGF0YScsIChuZXdGb3JlY2FzdERhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdGb3JlY2FzdERhdGEpIHtcbiAgICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gYW5ndWxhci5mcm9tSnNvbihuZXdGb3JlY2FzdERhdGEpO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ2FsZXJ0VmFsdWUnLCAnY2hhcnRUeXBlJywgJ2hpZGVIaWdoTG93VmFsdWVzJywgJ3VzZVplcm9NaW5WYWx1ZScsICdzaG93QXZnTGluZSddLFxuICAgICAgICAgICAgKGNoYXJ0QXR0cnMpID0+IHtcbiAgICAgICAgICAgICAgYWxlcnRWYWx1ZSA9IGNoYXJ0QXR0cnNbMF0gfHwgYWxlcnRWYWx1ZTtcbiAgICAgICAgICAgICAgY2hhcnRUeXBlID0gY2hhcnRBdHRyc1sxXSB8fCBjaGFydFR5cGU7XG4gICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzID0gKHR5cGVvZiBjaGFydEF0dHJzWzJdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzJdIDogaGlkZUhpZ2hMb3dWYWx1ZXM7XG4gICAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZSA9ICh0eXBlb2YgY2hhcnRBdHRyc1szXSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1szXSA6IHVzZVplcm9NaW5WYWx1ZTtcbiAgICAgICAgICAgICAgc2hvd0F2Z0xpbmUgPSAodHlwZW9mIGNoYXJ0QXR0cnNbNF0gIT09ICd1bmRlZmluZWQnKSA/IGNoYXJ0QXR0cnNbNF0gOiBzaG93QXZnTGluZTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93KCkge1xuICAgICAgICAgICAgZW5kVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gbW9tZW50KCkuc3VidHJhY3QodGltZVJhbmdlSW5TZWNvbmRzLCAnc2Vjb25kcycpLnZhbHVlT2YoKTtcbiAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc0ZvclRpbWVSYW5nZShkYXRhVXJsLCBtZXRyaWNJZCwgc3RhcnRUaW1lc3RhbXAsIGVuZFRpbWVzdGFtcCwgNjApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vLyBzdGFuZGFsb25lIGNoYXJ0cyBhdHRyaWJ1dGVzXG4gICAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydtZXRyaWNVcmwnLCAnbWV0cmljSWQnLCAnbWV0cmljVHlwZScsICdtZXRyaWNUZW5hbnRJZCcsICd0aW1lUmFuZ2VJblNlY29uZHMnXSxcbiAgICAgICAgICAgIChzdGFuZEFsb25lUGFyYW1zKSA9PiB7XG4gICAgICAgICAgICAgIGRhdGFVcmwgPSBzdGFuZEFsb25lUGFyYW1zWzBdIHx8IGRhdGFVcmw7XG4gICAgICAgICAgICAgIG1ldHJpY0lkID0gc3RhbmRBbG9uZVBhcmFtc1sxXSB8fCBtZXRyaWNJZDtcbiAgICAgICAgICAgICAgbWV0cmljVHlwZSA9IHN0YW5kQWxvbmVQYXJhbXNbMl0gfHwgbWV0cmljSWQ7XG4gICAgICAgICAgICAgIG1ldHJpY1RlbmFudElkID0gc3RhbmRBbG9uZVBhcmFtc1szXSB8fCBtZXRyaWNUZW5hbnRJZDtcbiAgICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzID0gc3RhbmRBbG9uZVBhcmFtc1s0XSB8fCB0aW1lUmFuZ2VJblNlY29uZHM7XG4gICAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc1RpbWVSYW5nZUZyb21Ob3coKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdyZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMnLCAobmV3UmVmcmVzaEludGVydmFsKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3UmVmcmVzaEludGVydmFsKSB7XG4gICAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyA9ICtuZXdSZWZyZXNoSW50ZXJ2YWw7XG4gICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc3RhcnRJbnRlcnZhbFByb21pc2UpO1xuICAgICAgICAgICAgICBzdGFydEludGVydmFsUHJvbWlzZSA9ICRpbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdygpO1xuICAgICAgICAgICAgICB9LCByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgKiAxMDAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiRvbignJGRlc3Ryb3knLCAoKSA9PiB7XG4gICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHN0YXJ0SW50ZXJ2YWxQcm9taXNlKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiRvbignRGF0ZVJhbmdlRHJhZ0NoYW5nZWQnLCAoZXZlbnQsIGV4dGVudCkgPT4ge1xuICAgICAgICAgICAgc2NvcGUuJGVtaXQoJ0dyYXBoVGltZVJhbmdlQ2hhbmdlZEV2ZW50JywgZXh0ZW50KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZUNoYXJ0VHlwZUFuZERyYXcoY2hhcnRUeXBlOiBzdHJpbmcsIGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zKSB7XG5cbiAgICAgICAgICAgIC8vQHRvZG86IGFkZCBpbiBtdWx0aWxpbmUgYW5kIHJocWJhciBjaGFydCB0eXBlc1xuICAgICAgICAgICAgLy9AdG9kbzogYWRkIHZhbGlkYXRpb24gaWYgbm90IGluIHZhbGlkIGNoYXJ0IHR5cGVzXG4gICAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5mb3JFYWNoKChhQ2hhcnRUeXBlKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChhQ2hhcnRUeXBlLm5hbWUgPT09IGNoYXJ0VHlwZSkge1xuICAgICAgICAgICAgICAgIGFDaGFydFR5cGUuZHJhd0NoYXJ0KGNoYXJ0T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc2NvcGUucmVuZGVyID0gKGRhdGFQb2ludHMpID0+IHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgZGF0YSwgZG9uJ3QgYm90aGVyLi5cbiAgICAgICAgICAgIGlmICghZGF0YVBvaW50cyAmJiAhbXVsdGlEYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRlYnVnKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXAoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgICBjb25zb2xlLnRpbWUoJ2NoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIHJlc2l6ZSgpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50cykge1xuICAgICAgICAgICAgICBkZXRlcm1pbmVTY2FsZShkYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vbXVsdGlEYXRhUG9pbnRzIGV4aXN0XG4gICAgICAgICAgICAgIGRldGVybWluZU11bHRpU2NhbGUobXVsdGlEYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zID0gbmV3IENoYXJ0T3B0aW9ucyhzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCBjaGFydERhdGEsIG11bHRpRGF0YVBvaW50cyxcbiAgICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCBoZWlnaHQsIHRpcCwgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMsIGludGVycG9sYXRpb24pO1xuXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+IHZpc3VhbGx5QWRqdXN0ZWRNaW4gJiYgYWxlcnRWYWx1ZSA8IHZpc3VhbGx5QWRqdXN0ZWRNYXgpKSB7XG4gICAgICAgICAgICAgIGNyZWF0ZUFsZXJ0Qm91bmRzQXJlYShjaGFydE9wdGlvbnMsIGFsZXJ0VmFsdWUsIHZpc3VhbGx5QWRqdXN0ZWRNYXgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjcmVhdGVYQXhpc0JydXNoKCk7XG4gICAgICAgICAgICBjcmVhdGVZQXhpc0dyaWRMaW5lcygpO1xuICAgICAgICAgICAgZGV0ZXJtaW5lQ2hhcnRUeXBlQW5kRHJhdyhjaGFydFR5cGUsIGNoYXJ0T3B0aW9ucyk7XG5cbiAgICAgICAgICAgIGlmIChzaG93RGF0YVBvaW50cykge1xuICAgICAgICAgICAgICBjcmVhdGVEYXRhUG9pbnRzKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIHRpcCwgY2hhcnREYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNyZWF0ZVByZXZpb3VzUmFuZ2VPdmVybGF5KHByZXZpb3VzUmFuZ2VEYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIGNyZWF0ZVhhbmRZQXhlcygpO1xuICAgICAgICAgICAgaWYgKHNob3dBdmdMaW5lKSB7XG4gICAgICAgICAgICAgIGNyZWF0ZUF2Z0xpbmVzKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhbGVydFZhbHVlICYmIChhbGVydFZhbHVlID4gdmlzdWFsbHlBZGp1c3RlZE1pbiAmJiBhbGVydFZhbHVlIDwgdmlzdWFsbHlBZGp1c3RlZE1heCkpIHtcbiAgICAgICAgICAgICAgLy8vIE5PVEU6IHRoaXMgYWxlcnQgbGluZSBoYXMgaGlnaGVyIHByZWNlZGVuY2UgZnJvbSBhbGVydCBhcmVhIGFib3ZlXG4gICAgICAgICAgICAgIGNyZWF0ZUFsZXJ0TGluZShjaGFydE9wdGlvbnMsIGFsZXJ0VmFsdWUsICdhbGVydExpbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgIGFubm90YXRlQ2hhcnQoYW5ub3RhdGlvbkRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZvcmVjYXN0RGF0YVBvaW50cyAmJiBmb3JlY2FzdERhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YVBvaW50cywgY2hhcnRPcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICBjb25zb2xlLnRpbWVFbmQoJ2NoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGxpbms6IGxpbmssXG4gICAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgICByZXBsYWNlOiB0cnVlLFxuICAgICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICBkYXRhOiAnPScsXG4gICAgICAgICAgICBtdWx0aURhdGE6ICc9JyxcbiAgICAgICAgICAgIGZvcmVjYXN0RGF0YTogJz0nLFxuICAgICAgICAgICAgbWV0cmljVXJsOiAnQCcsXG4gICAgICAgICAgICBtZXRyaWNJZDogJ0AnLFxuICAgICAgICAgICAgbWV0cmljVHlwZTogJ0AnLFxuICAgICAgICAgICAgbWV0cmljVGVuYW50SWQ6ICdAJyxcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgICAgICAgIHRpbWVSYW5nZUluU2Vjb25kczogJ0AnLFxuICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzOiAnQCcsXG4gICAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YTogJ0AnLFxuICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGE6ICdAJyxcbiAgICAgICAgICAgIHNob3dEYXRhUG9pbnRzOiAnPScsXG4gICAgICAgICAgICBhbGVydFZhbHVlOiAnQCcsXG4gICAgICAgICAgICBpbnRlcnBvbGF0aW9uOiAnQCcsXG4gICAgICAgICAgICBjaGFydFR5cGU6ICdAJyxcbiAgICAgICAgICAgIHlBeGlzVW5pdHM6ICdAJyxcbiAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZTogJz0nLFxuICAgICAgICAgICAgY2hhcnRIb3ZlckRhdGVGb3JtYXQ6ICdAJyxcbiAgICAgICAgICAgIGNoYXJ0SG92ZXJUaW1lRm9ybWF0OiAnQCcsXG4gICAgICAgICAgICBzaW5nbGVWYWx1ZUxhYmVsOiAnQCcsXG4gICAgICAgICAgICBub0RhdGFMYWJlbDogJ0AnLFxuICAgICAgICAgICAgZHVyYXRpb25MYWJlbDogJ0AnLFxuICAgICAgICAgICAgbWluTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIG1heExhYmVsOiAnQCcsXG4gICAgICAgICAgICBhdmdMYWJlbDogJ0AnLFxuICAgICAgICAgICAgdGltZXN0YW1wTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIHNob3dBdmdMaW5lOiAnPScsXG4gICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlczogJz0nXG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgXVxuICAgIClcbiAgICA7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8vIFR5cGUgdmFsdWVzIGFuZCBJRCB0eXBlc1xuICBleHBvcnQgdHlwZSBBbGVydFRocmVzaG9sZCA9IG51bWJlcjtcbiAgZXhwb3J0IHR5cGUgVGltZUluTWlsbGlzID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBVcmxUeXBlID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBNZXRyaWNJZCA9IHN0cmluZztcbiAgZXhwb3J0IHR5cGUgTWV0cmljVmFsdWUgPSBudW1iZXI7XG5cbiAgLyoqXG4gICAqIE1ldHJpY3MgUmVzcG9uc2UgZnJvbSBIYXdrdWxhciBNZXRyaWNzXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNZXRyaWNzUmVzcG9uc2VEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBUaW1lSW5NaWxsaXM7XG4gICAgZW5kOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIG1pbj86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBtYXg/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgbWVkaWFuPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIHBlcmNlbnRpbGU5NXRoPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIGVtcHR5OiBib29sZWFuO1xuICB9XG5cbiAgLyoqXG4gICAqIFNpbXBsZXN0IE1ldHJpYyBkYXRhIHR5cGVcbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZU1ldHJpYyB7XG4gICAgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU6IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgLyoqXG4gICAqIERhdGEgZm9yIHByZWRpY3RpdmUgJ2NvbmUnXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElQcmVkaWN0aXZlTWV0cmljIGV4dGVuZHMgSVNpbXBsZU1ldHJpYyB7XG4gICAgbWluOiBNZXRyaWNWYWx1ZTtcbiAgICBtYXg6IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgZXhwb3J0IGludGVyZmFjZSBJQmFzZUNoYXJ0RGF0YVBvaW50IHtcbiAgICB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcztcbiAgICBzdGFydD86IFRpbWVJbk1pbGxpcztcbiAgICBlbmQ/OiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnOiBNZXRyaWNWYWx1ZTsgLy8vIG1vc3Qgb2YgdGhlIHRpbWUgdGhpcyBpcyB0aGUgdXNlZnVsIHZhbHVlIGZvciBhZ2dyZWdhdGVzXG4gICAgZW1wdHk6IGJvb2xlYW47IC8vLyB3aWxsIHNob3cgdXAgaW4gdGhlIGNoYXJ0IGFzIGJsYW5rIC0gc2V0IHRoaXMgd2hlbiB5b3UgaGF2ZSBOYU5cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXByZXNlbnRhdGlvbiBvZiBkYXRhIHJlYWR5IHRvIGJlIGNvbnN1bWVkIGJ5IGNoYXJ0cy5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSUNoYXJ0RGF0YVBvaW50IGV4dGVuZHMgSUJhc2VDaGFydERhdGFQb2ludCB7XG4gICAgZGF0ZT86IERhdGU7XG4gICAgbWluOiBNZXRyaWNWYWx1ZTtcbiAgICBtYXg6IE1ldHJpY1ZhbHVlO1xuICAgIHBlcmNlbnRpbGU5NXRoOiBNZXRyaWNWYWx1ZTtcbiAgICBtZWRpYW46IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgLyoqXG4gICAqIERhdGEgc3RydWN0dXJlIGZvciBhIE11bHRpLU1ldHJpYyBjaGFydC4gQ29tcG9zZWQgb2YgSUNoYXJ0RGF0YURhdGFQb2ludFtdLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJTXVsdGlEYXRhUG9pbnQge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGtleUhhc2g/OiBzdHJpbmc7IC8vIGZvciB1c2luZyBhcyB2YWxpZCBodG1sIGlkXG4gICAgY29sb3I/OiBzdHJpbmc7IC8vLyAjZmZmZWVlXG4gICAgdmFsdWVzOiBJQ2hhcnREYXRhUG9pbnRbXTtcbiAgfVxuXG4gIC8qKlxuICAgKlxuICAgKi9cbiAgZXhwb3J0IGNsYXNzIENoYXJ0T3B0aW9ucyB7XG4gICAgY29uc3RydWN0b3IocHVibGljIHN2ZzogYW55LFxuICAgICAgcHVibGljIHRpbWVTY2FsZTogYW55LFxuICAgICAgcHVibGljIHlTY2FsZTogYW55LFxuICAgICAgcHVibGljIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgICBwdWJsaWMgbXVsdGlDaGFydERhdGE6IElNdWx0aURhdGFQb2ludFtdLFxuICAgICAgcHVibGljIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodDogbnVtYmVyLFxuICAgICAgcHVibGljIGhlaWdodDogbnVtYmVyLFxuICAgICAgcHVibGljIHRpcD86IGFueSxcbiAgICAgIHB1YmxpYyB2aXN1YWxseUFkanVzdGVkTWF4PzogbnVtYmVyLFxuICAgICAgcHVibGljIGhpZGVIaWdoTG93VmFsdWVzPzogYm9vbGVhbixcbiAgICAgIHB1YmxpYyBpbnRlcnBvbGF0aW9uPzogc3RyaW5nKSB7XG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLyogdHNsaW50OmRpc2FibGU6bm8tYml0d2lzZSAqL1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyV2lkdGgod2lkdGg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIGJhck9mZnNldCA9IEJBUl9PRkZTRVQpIHtcbiAgICByZXR1cm4gKHdpZHRoIC8gbGVuZ3RoIC0gYmFyT2Zmc2V0KTtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZXMgdGhlIGJhciB3aWR0aCBhZGp1c3RlZCBzbyB0aGF0IHRoZSBmaXJzdCBhbmQgbGFzdCBhcmUgaGFsZi13aWR0aCBvZiB0aGUgb3RoZXJzXG4gIC8vIHNlZSBodHRwczovL2lzc3Vlcy5qYm9zcy5vcmcvYnJvd3NlL0hBV0tVTEFSLTgwOSBmb3IgaW5mbyBvbiB3aHkgdGhpcyBpcyBuZWVkZWRcbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGxlbmd0aDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIChpID09PSAwIHx8IGkgPT09IGxlbmd0aCAtIDEpID8gY2FsY0JhcldpZHRoKHdpZHRoLCBsZW5ndGgsIEJBUl9PRkZTRVQpIC8gMiA6XG4gICAgICBjYWxjQmFyV2lkdGgod2lkdGgsIGxlbmd0aCwgQkFSX09GRlNFVCk7XG4gIH1cblxuICAvLyBDYWxjdWxhdGVzIHRoZSBiYXIgWCBwb3NpdGlvbi4gV2hlbiB1c2luZyBjYWxjQmFyV2lkdGhBZGp1c3RlZCwgaXQgaXMgcmVxdWlyZWQgdG8gcHVzaCBiYXJzXG4gIC8vIG90aGVyIHRoYW4gdGhlIGZpcnN0IGhhbGYgYmFyIHRvIHRoZSBsZWZ0LCB0byBtYWtlIHVwIGZvciB0aGUgZmlyc3QgYmVpbmcganVzdCBoYWxmIHdpZHRoXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGU6IGFueSwgbGVuZ3RoOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKSAtIChpID09PSAwID8gMCA6IGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKSAvIDIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFuIGVtcHR5IGRhdGFwb2ludCBoYXMgJ2VtcHR5JyBhdHRyaWJ1dGUgc2V0IHRvIHRydWUuIFVzZWQgdG8gZGlzdGluZ3Vpc2ggZnJvbSByZWFsIDAgdmFsdWVzLlxuICAgKiBAcGFyYW0gZFxuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5RGF0YVBvaW50KGQ6IElDaGFydERhdGFQb2ludCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBkLmVtcHR5O1xuICB9XG5cbiAgLyoqXG4gICAqIFJhdyBtZXRyaWNzIGhhdmUgYSAndmFsdWUnIHNldCBpbnN0ZWFkIG9mIGF2Zy9taW4vbWF4IG9mIGFnZ3JlZ2F0ZXNcbiAgICogQHBhcmFtIGRcbiAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAqL1xuICBleHBvcnQgZnVuY3Rpb24gaXNSYXdNZXRyaWMoZDogSUNoYXJ0RGF0YVBvaW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHR5cGVvZiBkLmF2ZyA9PT0gJ3VuZGVmaW5lZCc7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24geEF4aXNUaW1lRm9ybWF0cygpIHtcbiAgICByZXR1cm4gZDMudGltZS5mb3JtYXQubXVsdGkoW1xuICAgICAgWycuJUwnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaWxsaXNlY29uZHMoKTtcbiAgICAgIH1dLFxuICAgICAgWyc6JVMnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRTZWNvbmRzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJUg6JU0nLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaW51dGVzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJUg6JU0nLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRIb3VycygpO1xuICAgICAgfV0sXG4gICAgICBbJyVhICVkJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0RGF5KCkgJiYgZC5nZXREYXRlKCkgIT09IDE7XG4gICAgICB9XSxcbiAgICAgIFsnJWIgJWQnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXREYXRlKCkgIT09IDE7XG4gICAgICB9XSxcbiAgICAgIFsnJUInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNb250aCgpO1xuICAgICAgfV0sXG4gICAgICBbJyVZJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1dXG4gICAgXSk7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlU3ZnRGVmcyhjaGFydCkge1xuXG4gICAgbGV0IGRlZnMgPSBjaGFydC5hcHBlbmQoJ2RlZnMnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICdub0RhdGFTdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdkJywgJ00gMCAwIDYgMCcpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiNDQ0NDQ0M7IGZpbGw6bm9uZTsnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICd1bmtub3duU3RyaXBlcycpXG4gICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgIC5hdHRyKCd4JywgJzAnKVxuICAgICAgLmF0dHIoJ3knLCAnMCcpXG4gICAgICAuYXR0cignd2lkdGgnLCAnNicpXG4gICAgICAuYXR0cignaGVpZ2h0JywgJzMnKVxuICAgICAgLmF0dHIoJ3N0eWxlJywgJ3N0cm9rZTojMkU5RUMyOyBmaWxsOm5vbmU7JylcbiAgICAgIC5hcHBlbmQoJ3BhdGgnKS5hdHRyKCdkJywgJ00gMCAwIDYgMCcpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ2Rvd25TdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiNmZjhhOWE7IGZpbGw6bm9uZTsnKVxuICAgICAgLmFwcGVuZCgncGF0aCcpLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJyk7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZTogYW55KSB7XG4gICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gIH1cblxuICAvLyBhZGFwdGVkIGZyb20gaHR0cDovL3dlcnhsdGQuY29tL3dwLzIwMTAvMDUvMTMvamF2YXNjcmlwdC1pbXBsZW1lbnRhdGlvbi1vZi1qYXZhcy1zdHJpbmctaGFzaGNvZGUtbWV0aG9kL1xuICBleHBvcnQgZnVuY3Rpb24gaGFzaFN0cmluZyhzdHI6IHN0cmluZyk6IG51bWJlciB7XG4gICAgbGV0IGhhc2ggPSAwLCBpLCBjaHIsIGxlbjtcbiAgICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGhhc2g7XG4gICAgfVxuICAgIGZvciAoaSA9IDAsIGxlbiA9IHN0ci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgY2hyID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICBoYXNoID0gKChoYXNoIDw8IDUpIC0gaGFzaCkgKyBjaHI7XG4gICAgICBoYXNoIHw9IDA7IC8vIENvbnZlcnQgdG8gMzJiaXQgaW50ZWdlclxuICAgIH1cbiAgICByZXR1cm4gaGFzaDtcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBkZXRlcm1pbmVYQXhpc1RpY2tzRnJvbVNjcmVlbldpZHRoKHdpZHRoSW5QaXhlbHM6IG51bWJlcik6IG51bWJlciB7XG4gICAgbGV0IHhUaWNrcztcbiAgICBpZiAod2lkdGhJblBpeGVscyA8PSAyMDApIHtcbiAgICAgIHhUaWNrcyA9IDI7XG4gICAgfSBlbHNlIGlmICh3aWR0aEluUGl4ZWxzIDw9IDM1MCAmJiB3aWR0aEluUGl4ZWxzID4gMjAwKSB7XG4gICAgICB4VGlja3MgPSA0O1xuICAgIH0gZWxzZSB7XG4gICAgICB4VGlja3MgPSA5O1xuICAgIH1cbiAgICByZXR1cm4geFRpY2tzO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGRldGVybWluZVlBeGlzVGlja3NGcm9tU2NyZWVuSGVpZ2h0KGhlaWdodEluUGl4ZWxzOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGxldCB5VGlja3M7XG4gICAgaWYgKGhlaWdodEluUGl4ZWxzIDw9IDEyMCkge1xuICAgICAgeVRpY2tzID0gMztcbiAgICB9IGVsc2Uge1xuICAgICAgeVRpY2tzID0gOTtcbiAgICB9XG4gICAgcmV0dXJuIHlUaWNrcztcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBkZXRlcm1pbmVZQXhpc0dyaWRMaW5lVGlja3NGcm9tU2NyZWVuSGVpZ2h0KGhlaWdodEluUGl4ZWxzOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGxldCB5VGlja3M7XG4gICAgaWYgKGhlaWdodEluUGl4ZWxzIDw9IDYwKSB7XG4gICAgICB5VGlja3MgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICB5VGlja3MgPSAxMDtcbiAgICB9XG4gICAgcmV0dXJuIHlUaWNrcztcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgY29uc3QgQkFSX09GRlNFVCA9IDI7XG5cbiAgZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0SGlzdG9ncmFtQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ2hpc3RvZ3JhbSc7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucywgc3RhY2tlZCA9IGZhbHNlKSB7XG5cbiAgICAgIGNvbnN0IGJhckNsYXNzID0gc3RhY2tlZCA/ICdsZWFkZXJCYXInIDogJ2hpc3RvZ3JhbSc7XG5cbiAgICAgIGNvbnN0IHJlY3RIaXN0b2dyYW0gPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncmVjdC4nICsgYmFyQ2xhc3MpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkQmFycyhzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICAgIHNlbGVjdGlvblxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsIGJhckNsYXNzKVxuICAgICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy50aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLmhpZGUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAuYXR0cigneCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2FsY0JhclhQb3MoZCwgaSwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLmNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/IDAgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy5tb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgLSBjaGFydE9wdGlvbnMueVNjYWxlKGlzRW1wdHlEYXRhUG9pbnQoZCkgP1xuICAgICAgICAgICAgICBjaGFydE9wdGlvbnMueVNjYWxlKGNoYXJ0T3B0aW9ucy52aXN1YWxseUFkanVzdGVkTWF4KSA6IGQuYXZnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdvcGFjaXR5Jywgc3RhY2tlZCA/ICcuNicgOiAnMScpXG4gICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAndXJsKCNub0RhdGFTdHJpcGVzKScgOiAoc3RhY2tlZCA/ICcjRDNEM0Q2JyA6ICcjQzBDMEMwJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnIzc3Nyc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnMCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignZGF0YS1oYXdrdWxhci12YWx1ZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRIaWdoQmFyKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLm1pbiA9PT0gZC5tYXggPyAnc2luZ2xlVmFsdWUnIDogJ2hpZ2gnO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gnLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsY0JhclhQb3MoZCwgaSwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLmNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3knLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzTmFOKGQubWF4KSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoY2hhcnRPcHRpb25zLnZpc3VhbGx5QWRqdXN0ZWRNYXgpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6IChjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKSAtIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpIHx8IDIpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuOSlcbiAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgY2hhcnRPcHRpb25zLnRpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkTG93ZXJCYXIoc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93JylcbiAgICAgICAgICAuYXR0cigneCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2FsY0JhclhQb3MoZCwgaSwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLmNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3knLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzTmFOKGQuYXZnKSA/IGNoYXJ0T3B0aW9ucy5oZWlnaHQgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogKGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pIC0gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2ZykpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuOSlcbiAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgY2hhcnRPcHRpb25zLnRpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRUb3BTdGVtKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbVRvcFN0ZW0nKVxuICAgICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRMb3dTdGVtKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbUJvdHRvbVN0ZW0nKVxuICAgICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgfSkuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgICAgICB9KTtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZFRvcENyb3NzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbVRvcENyb3NzJylcbiAgICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZEJvdHRvbUNyb3NzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbUJvdHRvbUNyb3NzJylcbiAgICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGVIaXN0b2dyYW1IaWdoTG93VmFsdWVzKHN2ZzogYW55LCBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCBzdGFja2VkPzogYm9vbGVhbikge1xuICAgICAgICBpZiAoc3RhY2tlZCkge1xuICAgICAgICAgIC8vIHVwcGVyIHBvcnRpb24gcmVwcmVzZW50aW5nIGF2ZyB0byBoaWdoXG4gICAgICAgICAgY29uc3QgcmVjdEhpZ2ggPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmhpZ2gsIHJlY3Quc2luZ2xlVmFsdWUnKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICByZWN0SGlnaC5jYWxsKGJ1aWxkSGlnaEJhcik7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICByZWN0SGlnaFxuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRIaWdoQmFyKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIHJlY3RIaWdoLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIC8vIGxvd2VyIHBvcnRpb24gcmVwcmVzZW50aW5nIGF2ZyB0byBsb3dcbiAgICAgICAgICBjb25zdCByZWN0TG93ID0gc3ZnLnNlbGVjdEFsbCgncmVjdC5sb3cnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgcmVjdExvdy5jYWxsKGJ1aWxkTG93ZXJCYXIpO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgcmVjdExvd1xuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRMb3dlckJhcik7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICByZWN0TG93LmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgIGNvbnN0IGxpbmVIaXN0b0hpZ2hTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcFN0ZW0nKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgbGluZUhpc3RvSGlnaFN0ZW0uY2FsbChidWlsZFRvcFN0ZW0pO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgbGluZUhpc3RvSGlnaFN0ZW1cbiAgICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgICBjb25zdCBsaW5lSGlzdG9Mb3dTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgbGluZUhpc3RvTG93U3RlbS5jYWxsKGJ1aWxkTG93U3RlbSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtXG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuY2FsbChidWlsZExvd1N0ZW0pO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgbGluZUhpc3RvTG93U3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgICBjb25zdCBsaW5lSGlzdG9Ub3BDcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Ub3BDcm9zcycpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zcy5jYWxsKGJ1aWxkVG9wQ3Jvc3MpO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3NcbiAgICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wQ3Jvc3MpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgY29uc3QgbGluZUhpc3RvQm90dG9tQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzLmNhbGwoYnVpbGRCb3R0b21Dcm9zcyk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zc1xuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRCb3R0b21Dcm9zcyk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zcy5leGl0KCkucmVtb3ZlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICByZWN0SGlzdG9ncmFtLmNhbGwoYnVpbGRCYXJzKTtcblxuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICByZWN0SGlzdG9ncmFtLmVudGVyKClcbiAgICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAgIC5jYWxsKGJ1aWxkQmFycyk7XG5cbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgcmVjdEhpc3RvZ3JhbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIGlmICghY2hhcnRPcHRpb25zLmhpZGVIaWdoTG93VmFsdWVzKSB7XG4gICAgICAgIGNyZWF0ZUhpc3RvZ3JhbUhpZ2hMb3dWYWx1ZXMoY2hhcnRPcHRpb25zLnN2ZywgY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSwgc3RhY2tlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyB3ZSBzaG91bGQgaGlkZSBoaWdoLWxvdyB2YWx1ZXMuLiBvciByZW1vdmUgaWYgZXhpc3RpbmdcbiAgICAgICAgY2hhcnRPcHRpb25zLnN2Z1xuICAgICAgICAgIC5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Ub3BTdGVtLCAuaGlzdG9ncmFtQm90dG9tU3RlbSwgLmhpc3RvZ3JhbVRvcENyb3NzLCAuaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKS5yZW1vdmUoKTtcbiAgICAgIH1cblxuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBjbGFzcyBBcmVhQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ2FyZWEnO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpOiB2b2lkIHtcblxuICAgICAgbGV0XG4gICAgICAgIGhpZ2hBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICxcblxuICAgICAgICBhdmdBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSkueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy5oaWRlSGlnaExvd1ZhbHVlcyA/IGNoYXJ0T3B0aW9ucy5oZWlnaHQgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KVxuICAgICAgICAsXG5cbiAgICAgICAgbG93QXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgICAuaW50ZXJwb2xhdGUoY2hhcnRPcHRpb25zLmludGVycG9sYXRpb24pXG4gICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnkwKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMubW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0O1xuICAgICAgICAgIH0pO1xuXG4gICAgICBpZiAoIWNoYXJ0T3B0aW9ucy5oaWRlSGlnaExvd1ZhbHVlcykge1xuICAgICAgICBsZXRcbiAgICAgICAgICBoaWdoQXJlYVBhdGggPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aC5oaWdoQXJlYScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGhpZ2hBcmVhUGF0aFxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdoaWdoQXJlYScpXG4gICAgICAgICAgLmF0dHIoJ2QnLCBoaWdoQXJlYSk7XG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBoaWdoQXJlYVBhdGhcbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdoaWdoQXJlYScpXG4gICAgICAgICAgLmF0dHIoJ2QnLCBoaWdoQXJlYSk7XG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBoaWdoQXJlYVBhdGhcbiAgICAgICAgICAuZXhpdCgpXG4gICAgICAgICAgLnJlbW92ZSgpO1xuXG4gICAgICAgIGxldFxuICAgICAgICAgIGxvd0FyZWFQYXRoID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGgubG93QXJlYScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxvd0FyZWFQYXRoXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xvd0FyZWEnKVxuICAgICAgICAgIC5hdHRyKCdkJywgbG93QXJlYSk7XG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsb3dBcmVhUGF0aFxuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xvd0FyZWEnKVxuICAgICAgICAgIC5hdHRyKCdkJywgbG93QXJlYSk7XG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsb3dBcmVhUGF0aFxuICAgICAgICAgIC5leGl0KClcbiAgICAgICAgICAucmVtb3ZlKCk7XG4gICAgICB9XG5cbiAgICAgIGxldFxuICAgICAgICBhdmdBcmVhUGF0aCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdwYXRoLmF2Z0FyZWEnKS5kYXRhKFtjaGFydE9wdGlvbnMuY2hhcnREYXRhXSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGF2Z0FyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2F2Z0FyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGF2Z0FyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBhdmdBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmdBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBhdmdBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgYXZnQXJlYVBhdGguZXhpdCgpLnJlbW92ZSgpO1xuICAgIH1cblxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbmltcG9ydCBDaGFydE9wdGlvbnMgPSBDaGFydHMuQ2hhcnRPcHRpb25zO1xuaW50ZXJmYWNlIElDaGFydFR5cGUge1xuICBuYW1lOiBzdHJpbmc7XG4gIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0T3B0aW9ucywgb3B0aW9uYWxCb29sZWFuPzogYm9vbGVhbik6IHZvaWQ7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgY2xhc3MgSGlzdG9ncmFtQ2hhcnQgZXh0ZW5kcyBBYnN0cmFjdEhpc3RvZ3JhbUNoYXJ0IHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ2hpc3RvZ3JhbSc7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucywgc3RhY2tlZCA9IGZhbHNlKSB7XG4gICAgICBzdXBlci5kcmF3Q2hhcnQoY2hhcnRPcHRpb25zLCBzdGFja2VkKTtcbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgY2xhc3MgTGluZUNoYXJ0IGltcGxlbWVudHMgSUNoYXJ0VHlwZSB7XG5cbiAgICBwdWJsaWMgbmFtZSA9ICdsaW5lJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zKSB7XG5cbiAgICAgIGxldCBtZXRyaWNDaGFydExpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGxldCBwYXRoTWV0cmljID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGgubWV0cmljTGluZScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgcGF0aE1ldHJpYy5hdHRyKCdjbGFzcycsICdtZXRyaWNMaW5lJylcbiAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAuYXR0cignZCcsIG1ldHJpY0NoYXJ0TGluZSk7XG5cbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgcGF0aE1ldHJpYy5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdtZXRyaWNMaW5lJylcbiAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAuYXR0cignZCcsIG1ldHJpY0NoYXJ0TGluZSk7XG5cbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgcGF0aE1ldHJpYy5leGl0KCkucmVtb3ZlKCk7XG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGNsYXNzIE11bHRpTGluZUNoYXJ0IGltcGxlbWVudHMgSUNoYXJ0VHlwZSB7XG5cbiAgICBwdWJsaWMgbmFtZSA9ICdtdWx0aWxpbmUnO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpIHtcblxuICAgICAgbGV0IGNvbG9yU2NhbGUgPSA8YW55PmQzLnNjYWxlLmNhdGVnb3J5MTAoKSxcbiAgICAgICAgZyA9IDA7XG5cbiAgICAgIGlmIChjaGFydE9wdGlvbnMubXVsdGlDaGFydERhdGEpIHtcbiAgICAgICAgLy8gYmVmb3JlIHVwZGF0aW5nLCBsZXQncyByZW1vdmUgdGhvc2UgbWlzc2luZyBmcm9tIGRhdGFwb2ludHMgKGlmIGFueSlcbiAgICAgICAgY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGhbaWRePVxcJ211bHRpTGluZVxcJ10nKVswXS5mb3JFYWNoKChleGlzdGluZ1BhdGg6IGFueSkgPT4ge1xuICAgICAgICAgIGxldCBzdGlsbEV4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgIGNoYXJ0T3B0aW9ucy5tdWx0aUNoYXJ0RGF0YS5mb3JFYWNoKChzaW5nbGVDaGFydERhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2ggPSBzaW5nbGVDaGFydERhdGEua2V5SGFzaFxuICAgICAgICAgICAgICB8fCAoJ211bHRpTGluZScgKyBoYXNoU3RyaW5nKHNpbmdsZUNoYXJ0RGF0YS5rZXkpKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZ1BhdGguZ2V0QXR0cmlidXRlKCdpZCcpID09PSBzaW5nbGVDaGFydERhdGEua2V5SGFzaCkge1xuICAgICAgICAgICAgICBzdGlsbEV4aXN0cyA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgaWYgKCFzdGlsbEV4aXN0cykge1xuICAgICAgICAgICAgZXhpc3RpbmdQYXRoLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY2hhcnRPcHRpb25zLm11bHRpQ2hhcnREYXRhLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKHNpbmdsZUNoYXJ0RGF0YSAmJiBzaW5nbGVDaGFydERhdGEudmFsdWVzKSB7XG4gICAgICAgICAgICBzaW5nbGVDaGFydERhdGEua2V5SGFzaCA9IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoXG4gICAgICAgICAgICAgIHx8ICgnbXVsdGlMaW5lJyArIGhhc2hTdHJpbmcoc2luZ2xlQ2hhcnREYXRhLmtleSkpO1xuICAgICAgICAgICAgbGV0IHBhdGhNdWx0aUxpbmUgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aCMnICsgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2gpXG4gICAgICAgICAgICAgIC5kYXRhKFtzaW5nbGVDaGFydERhdGEudmFsdWVzXSk7XG4gICAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuYXR0cignaWQnLCBzaW5nbGVDaGFydERhdGEua2V5SGFzaClcbiAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ211bHRpTGluZScpXG4gICAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgJ25vbmUnKVxuICAgICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBzaW5nbGVDaGFydERhdGEuY29sb3IgfHwgY29sb3JTY2FsZShnKyspO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgIC5hdHRyKCdkJywgdGhpcy5jcmVhdGVMaW5lKCdsaW5lYXInLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlKSk7XG4gICAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgICAuYXR0cignaWQnLCBzaW5nbGVDaGFydERhdGEua2V5SGFzaClcbiAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ211bHRpTGluZScpXG4gICAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgJ25vbmUnKVxuICAgICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChzaW5nbGVDaGFydERhdGEuY29sb3IpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBzaW5nbGVDaGFydERhdGEuY29sb3I7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBjb2xvclNjYWxlKGcrKyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgIC5hdHRyKCdkJywgdGhpcy5jcmVhdGVMaW5lKCdsaW5lYXInLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlKSk7XG4gICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oJ05vIG11bHRpLWRhdGEgc2V0IGZvciBtdWx0aWxpbmUgY2hhcnQnKTtcbiAgICAgIH1cblxuICAgIH1cblxuICAgIHByaXZhdGUgY3JlYXRlTGluZShuZXdJbnRlcnBvbGF0aW9uLCB0aW1lU2NhbGUsIHlTY2FsZSkge1xuICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBsaW5lO1xuICAgIH1cblxuICB9XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgY2xhc3MgUmhxQmFyQ2hhcnQgZXh0ZW5kcyBBYnN0cmFjdEhpc3RvZ3JhbUNoYXJ0IHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ3JocWJhcic7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucywgc3RhY2tlZCA9IHRydWUpIHtcbiAgICAgIHN1cGVyLmRyYXdDaGFydChjaGFydE9wdGlvbnMsIHN0YWNrZWQpO1xuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBjbGFzcyBTY2F0dGVyQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ3NjYXR0ZXInO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpIHtcblxuICAgICAgaWYgKCFjaGFydE9wdGlvbnMuaGlkZUhpZ2hMb3dWYWx1ZXMpIHtcblxuICAgICAgICBsZXQgaGlnaERvdENpcmNsZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuaGlnaERvdCcpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBoaWdoRG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2hpZ2hEb3QnKVxuICAgICAgICAgIC5maWx0ZXIoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJyNmZjFhMTMnO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBoaWdoRG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdoaWdoRG90JylcbiAgICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnI2ZmMWExMyc7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGhpZ2hEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgIGxldCBsb3dEb3RDaXJjbGUgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLmxvd0RvdCcpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBsb3dEb3RDaXJjbGUuYXR0cignY2xhc3MnLCAnbG93RG90JylcbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGxvd0RvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93RG90JylcbiAgICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxvd0RvdENpcmNsZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHdlIHNob3VsZCBoaWRlIGhpZ2gtbG93IHZhbHVlcy4uIG9yIHJlbW92ZSBpZiBleGlzdGluZ1xuICAgICAgICBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLmhpZ2hEb3QsIC5sb3dEb3QnKS5yZW1vdmUoKTtcbiAgICAgIH1cblxuICAgICAgbGV0IGF2Z0RvdENpcmNsZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuYXZnRG90JykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgYXZnRG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2F2Z0RvdCcpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyNGRkYnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgYXZnRG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZnRG90JylcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnI0ZGRic7XG4gICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBhdmdEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGNsYXNzIFNjYXR0ZXJMaW5lQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ3NjYXR0ZXJsaW5lJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zKSB7XG5cbiAgICAgIGxldCBsaW5lU2NhdHRlclRvcFN0ZW0gPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lVG9wU3RlbScpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZVRvcFN0ZW0nKVxuICAgICAgICAuZmlsdGVyKChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZVRvcFN0ZW0nKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBsaW5lU2NhdHRlclRvcFN0ZW0uZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgbGluZVNjYXR0ZXJCb3R0b21TdGVtID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21TdGVtJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbGluZVNjYXR0ZXJCb3R0b21TdGVtLmVudGVyKCkuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tU3RlbScpXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyQm90dG9tU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIGxldCBsaW5lU2NhdHRlclRvcENyb3NzID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZVRvcENyb3NzJykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgbGluZVNjYXR0ZXJUb3BDcm9zcy5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZVRvcENyb3NzJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BDcm9zcycpXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAuNSc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBsaW5lU2NhdHRlclRvcENyb3NzLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgbGV0IGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBsaW5lU2NhdHRlckJvdHRvbUNyb3NzLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpIC0gMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSArIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcy5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZUJvdHRvbUNyb3NzJylcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgY2lyY2xlU2NhdHRlckRvdCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuc2NhdHRlckRvdCcpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGNpcmNsZVNjYXR0ZXJEb3QuYXR0cignY2xhc3MnLCAnc2NhdHRlckRvdCcpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcxJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGNpcmNsZVNjYXR0ZXJEb3QuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyRG90JylcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnb3BhY2l0eScsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzEnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgY2lyY2xlU2NhdHRlckRvdC5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICB9XG4gIH1cbn1cbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
