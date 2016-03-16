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
    function createAlertBoundsArea(svg, timeScale, yScale, height, highBound, chartData, alertValue) {
        var alertBounds = extractAlertRanges(chartData, alertValue);
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
                //return 185;
                return height;
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
                var chartTypes = [];
                chartTypes.push(new Charts.LineChart());
                chartTypes.push(new Charts.AreaChart());
                chartTypes.push(new Charts.ScatterChart());
                chartTypes.push(new Charts.ScatterLineChart());
                chartTypes.push(new Charts.HistogramChart());
                chartTypes.push(new Charts.RhqBarChart());
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
                function createMultiLineChart(chartOptions) {
                    var colorScale = d3.scale.category10(), g = 0;
                    if (chartOptions.multiChartData) {
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
                    chartTypes.forEach(function (aChartType) {
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
                        Charts.createAlertBoundsArea(svg, timeScale, yScale, modifiedInnerChartHeight, visuallyAdjustedMax, chartData, alertValue);
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
                        Charts.createAlertLine(svg, timeScale, yScale, chartData, alertValue, 'alertLine');
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImhhd2t1bGFyLW1ldHJpY3MtY2hhcnRzLm1vZHVsZS50cyIsImNoYXJ0L2FsZXJ0cy50cyIsImNoYXJ0L2F2YWlsLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L2NvbnRleHQtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvZXZlbnQtbmFtZXMudHMiLCJjaGFydC9mZWF0dXJlcy50cyIsImNoYXJ0L2ZvcmVjYXN0LnRzIiwiY2hhcnQvbWV0cmljLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L3R5cGVzLnRzIiwiY2hhcnQvdXRpbGl0eS50cyIsImNoYXJ0L2NoYXJ0LXR5cGUvYWJzdHJhY3QtaGlzdG9ncmFtLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9hcmVhLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9jaGFydC10eXBlLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9oaXN0b2dyYW0udHMiLCJjaGFydC9jaGFydC10eXBlL2xpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL3JocS1iYXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXJMaW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7O0FDUHRDLCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0ErSmY7QUEvSkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFFYjs7O09BR0c7SUFDSDtRQUlFLG9CQUFtQixjQUE0QixFQUN0QyxZQUEwQixFQUMxQixVQUFrQjtZQUZSLG1CQUFjLEdBQWQsY0FBYyxDQUFjO1lBQ3RDLGlCQUFZLEdBQVosWUFBWSxDQUFjO1lBQzFCLGVBQVUsR0FBVixVQUFVLENBQVE7WUFDekIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMx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QUFZLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDM0QsQ0FBQyxDQUFDO2lCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBQyxDQUFDO2dCQUNaLE1BQU0sQ0FBQyxrQkFBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BGLENBQUMsQ0FBQztpQkFDRCxLQUFLLENBQUMsTUFBTSxFQUFFO2dCQUNiLE1BQU0sQ0FBQyxTQUFTLENBQUM7WUFDbkIsQ0FBQyxDQUFDO2lCQUNELEtBQUssQ0FBQyxTQUFTLEVBQUU7Z0JBQ2hCLE1BQU0sQ0FBQyxHQUFHLENBQUM7WUFDYixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLFVBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RCLGlCQUFpQjtZQUNuQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFO2dCQUNoQixhQUFhO1lBQ2YsQ0FBQyxDQUFDLENBQUM7WUFDTCxrQkFBa0I7WUFDbEIsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7UUFFbkMsQ0FBQztRQUNILHVCQUFDO0lBQUQsQ0F4UEEsQUF3UEMsSUFBQTtJQXhQWSx1QkFBZ0IsbUJBd1A1QixDQUFBO0FBQ0gsQ0FBQyxFQTlQUyxNQUFNLEtBQU4sTUFBTSxRQThQZiIsImZpbGUiOiJoYXdrdWxhci1jaGFydHMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBuYW1lICBoYXdrdWxhci1jaGFydHNcbiAqXG4gKiBAZGVzY3JpcHRpb25cbiAqICAgQmFzZSBtb2R1bGUgZm9yIGhhd2t1bGFyLWNoYXJ0cy5cbiAqXG4gKi9cbmFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnLCBbXSk7XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8qKlxuICAgKiBEZWZpbmVzIGFuIGluZGl2aWR1YWwgYWxlcnQgYm91bmRzICB0byBiZSB2aXN1YWxseSBoaWdobGlnaHRlZCBpbiBhIGNoYXJ0XG4gICAqIHRoYXQgYW4gYWxlcnQgd2FzIGFib3ZlL2JlbG93IGEgdGhyZXNob2xkLlxuICAgKi9cbiAgZXhwb3J0IGNsYXNzIEFsZXJ0Qm91bmQge1xuICAgIHB1YmxpYyBzdGFydERhdGU6IERhdGU7XG4gICAgcHVibGljIGVuZERhdGU6IERhdGU7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgc3RhcnRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgIHB1YmxpYyBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgIHB1YmxpYyBhbGVydFZhbHVlOiBudW1iZXIpIHtcbiAgICAgIHRoaXMuc3RhcnREYXRlID0gbmV3IERhdGUoc3RhcnRUaW1lc3RhbXApO1xuICAgICAgdGhpcy5lbmREYXRlID0gbmV3IERhdGUoZW5kVGltZXN0YW1wKTtcbiAgICB9XG5cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBhbGVydFZhbHVlOiBudW1iZXIpIHtcbiAgICBsZXQgbGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgIC5pbnRlcnBvbGF0ZSgnbW9ub3RvbmUnKVxuICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB5U2NhbGUoYWxlcnRWYWx1ZSk7XG4gICAgICB9KTtcblxuICAgIHJldHVybiBsaW5lO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFsZXJ0TGluZShzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcixcbiAgICBjc3NDbGFzc05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGxldCBwYXRoQWxlcnRMaW5lID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5hbGVydExpbmUnKS5kYXRhKFtjaGFydERhdGFdKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBwYXRoQWxlcnRMaW5lLmF0dHIoJ2NsYXNzJywgY3NzQ2xhc3NOYW1lKVxuICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVBbGVydExpbmVEZWYodGltZVNjYWxlLCB5U2NhbGUsIGFsZXJ0VmFsdWUpKTtcblxuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIHBhdGhBbGVydExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2NsYXNzJywgY3NzQ2xhc3NOYW1lKVxuICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVBbGVydExpbmVEZWYodGltZVNjYWxlLCB5U2NhbGUsIGFsZXJ0VmFsdWUpKTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHBhdGhBbGVydExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXh0cmFjdEFsZXJ0UmFuZ2VzKGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sIHRocmVzaG9sZDogQWxlcnRUaHJlc2hvbGQpOiBBbGVydEJvdW5kW10ge1xuICAgIGxldCBhbGVydEJvdW5kQXJlYUl0ZW1zOiBBbGVydEJvdW5kW107XG4gICAgbGV0IHN0YXJ0UG9pbnRzOiBudW1iZXJbXTtcblxuICAgIGZ1bmN0aW9uIGZpbmRTdGFydFBvaW50cyhjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCB0aHJlc2hvbGQ6IEFsZXJ0VGhyZXNob2xkKSB7XG4gICAgICBsZXQgc3RhcnRQb2ludHMgPSBbXTtcbiAgICAgIGxldCBwcmV2SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBjaGFydERhdGEuZm9yRWFjaCgoY2hhcnRJdGVtOiBJQ2hhcnREYXRhUG9pbnQsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBpZiAoaSA9PT0gMCAmJiBjaGFydEl0ZW0uYXZnID4gdGhyZXNob2xkKSB7XG4gICAgICAgICAgc3RhcnRQb2ludHMucHVzaChpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwcmV2SXRlbSA9IGNoYXJ0RGF0YVtpIC0gMV07XG4gICAgICAgICAgaWYgKGNoYXJ0SXRlbS5hdmcgPiB0aHJlc2hvbGQgJiYgcHJldkl0ZW0gJiYgKCFwcmV2SXRlbS5hdmcgfHwgcHJldkl0ZW0uYXZnIDw9IHRocmVzaG9sZCkpIHtcbiAgICAgICAgICAgIHN0YXJ0UG9pbnRzLnB1c2gocHJldkl0ZW0uYXZnID8gKGkgLSAxKSA6IGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBzdGFydFBvaW50cztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzOiBudW1iZXJbXSwgdGhyZXNob2xkOiBBbGVydFRocmVzaG9sZCk6IEFsZXJ0Qm91bmRbXSB7XG4gICAgICBsZXQgYWxlcnRCb3VuZEFyZWFJdGVtczogQWxlcnRCb3VuZFtdID0gW107XG4gICAgICBsZXQgY3VycmVudEl0ZW06IElDaGFydERhdGFQb2ludDtcbiAgICAgIGxldCBuZXh0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuICAgICAgbGV0IHN0YXJ0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBzdGFydFBvaW50cy5mb3JFYWNoKChzdGFydFBvaW50SW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICBzdGFydEl0ZW0gPSBjaGFydERhdGFbc3RhcnRQb2ludEluZGV4XTtcblxuICAgICAgICBmb3IgKGxldCBqID0gc3RhcnRQb2ludEluZGV4OyBqIDwgY2hhcnREYXRhLmxlbmd0aCAtIDE7IGorKykge1xuICAgICAgICAgIGN1cnJlbnRJdGVtID0gY2hhcnREYXRhW2pdO1xuICAgICAgICAgIG5leHRJdGVtID0gY2hhcnREYXRhW2ogKyAxXTtcblxuICAgICAgICAgIGlmICgoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmIG5leHRJdGVtLmF2ZyA8PSB0aHJlc2hvbGQpXG4gICAgICAgICAgICB8fCAoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmICFuZXh0SXRlbS5hdmcpKSB7XG4gICAgICAgICAgICBhbGVydEJvdW5kQXJlYUl0ZW1zLnB1c2gobmV3IEFsZXJ0Qm91bmQoc3RhcnRJdGVtLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgbmV4dEl0ZW0uYXZnID8gbmV4dEl0ZW0udGltZXN0YW1wIDogY3VycmVudEl0ZW0udGltZXN0YW1wLCB0aHJlc2hvbGQpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vLyBtZWFucyB0aGUgbGFzdCBwaWVjZSBkYXRhIGlzIGFsbCBhYm92ZSB0aHJlc2hvbGQsIHVzZSBsYXN0IGRhdGEgcG9pbnRcbiAgICAgIGlmIChhbGVydEJvdW5kQXJlYUl0ZW1zLmxlbmd0aCA9PT0gKHN0YXJ0UG9pbnRzLmxlbmd0aCAtIDEpKSB7XG4gICAgICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMucHVzaChuZXcgQWxlcnRCb3VuZChjaGFydERhdGFbc3RhcnRQb2ludHNbc3RhcnRQb2ludHMubGVuZ3RoIC0gMV1dLnRpbWVzdGFtcCxcbiAgICAgICAgICBjaGFydERhdGFbY2hhcnREYXRhLmxlbmd0aCAtIDFdLnRpbWVzdGFtcCwgdGhyZXNob2xkKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBhbGVydEJvdW5kQXJlYUl0ZW1zO1xuICAgIH1cblxuICAgIHN0YXJ0UG9pbnRzID0gZmluZFN0YXJ0UG9pbnRzKGNoYXJ0RGF0YSwgdGhyZXNob2xkKTtcblxuICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMgPSBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzLCB0aHJlc2hvbGQpO1xuXG4gICAgcmV0dXJuIGFsZXJ0Qm91bmRBcmVhSXRlbXM7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBbGVydEJvdW5kc0FyZWEoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgaGVpZ2h0OiBudW1iZXIsXG4gICAgaGlnaEJvdW5kOiBudW1iZXIsXG4gICAgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICBhbGVydFZhbHVlOiBudW1iZXJcbiAgKSB7XG4gICAgY29uc3QgYWxlcnRCb3VuZHM6IEFsZXJ0Qm91bmRbXSA9IGV4dHJhY3RBbGVydFJhbmdlcyhjaGFydERhdGEsIGFsZXJ0VmFsdWUpO1xuICAgIGxldCByZWN0QWxlcnQgPSBzdmcuc2VsZWN0KCdnLmFsZXJ0SG9sZGVyJykuc2VsZWN0QWxsKCdyZWN0LmFsZXJ0Qm91bmRzJykuZGF0YShhbGVydEJvdW5kcyk7XG5cbiAgICBmdW5jdGlvbiBhbGVydEJvdW5kaW5nUmVjdChzZWxlY3Rpb24pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuYXR0cignY2xhc3MnLCAnYWxlcnRCb3VuZHMnKVxuICAgICAgICAuYXR0cigneCcsIChkOiBBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnN0YXJ0VGltZXN0YW1wKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3knLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShoaWdoQm91bmQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQ6IEFsZXJ0Qm91bmQpID0+IHtcbiAgICAgICAgICAvLy9AdG9kbzogbWFrZSB0aGUgaGVpZ2h0IGFkanVzdGFibGVcbiAgICAgICAgICAvL3JldHVybiAxODU7XG4gICAgICAgICAgcmV0dXJuIGhlaWdodDtcbiAgICAgICAgICAvL3JldHVybiB5U2NhbGUoMCkgLSBoZWlnaHQ7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd3aWR0aCcsIChkOiBBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLmVuZFRpbWVzdGFtcCkgLSB0aW1lU2NhbGUoZC5zdGFydFRpbWVzdGFtcCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHJlY3RBbGVydC5jYWxsKGFsZXJ0Qm91bmRpbmdSZWN0KTtcblxuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIHJlY3RBbGVydC5lbnRlcigpXG4gICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgIC5jYWxsKGFsZXJ0Qm91bmRpbmdSZWN0KTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHJlY3RBbGVydC5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZGVjbGFyZSBsZXQgZDM6IGFueTtcblxuICBjb25zdCBfbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycpO1xuXG4gIGV4cG9ydCBjbGFzcyBBdmFpbFN0YXR1cyB7XG5cbiAgICBwdWJsaWMgc3RhdGljIFVQID0gJ3VwJztcbiAgICBwdWJsaWMgc3RhdGljIERPV04gPSAnZG93bic7XG4gICAgcHVibGljIHN0YXRpYyBVTktOT1dOID0gJ3Vua25vd24nO1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHZhbHVlOiBzdHJpbmcpIHtcbiAgICAgIC8vIGVtcHR5XG4gICAgfVxuXG4gICAgcHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICByZXR1cm4gdGhpcy52YWx1ZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyB0aGUgaW5wdXQgZGF0YSBmb3JtYXQsIGRpcmVjdGx5IGZyb20gTWV0cmljcy5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSUF2YWlsRGF0YVBvaW50IHtcbiAgICB0aW1lc3RhbXA6IG51bWJlcjtcbiAgICB2YWx1ZTogc3RyaW5nO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgaXMgdGhlIHRyYW5zZm9ybWVkIG91dHB1dCBkYXRhIGZvcm1hdC4gRm9ybWF0dGVkIHRvIHdvcmsgd2l0aCBhdmFpbGFiaWxpdHkgY2hhcnQgKGJhc2ljYWxseSBhIERUTykuXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IHtcbiAgICBzdGFydDogbnVtYmVyO1xuICAgIGVuZDogbnVtYmVyO1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gICAgc3RhcnREYXRlPzogRGF0ZTsgLy8vIE1haW5seSBmb3IgZGVidWdnZXIgaHVtYW4gcmVhZGFibGUgZGF0ZXMgaW5zdGVhZCBvZiBhIG51bWJlclxuICAgIGVuZERhdGU/OiBEYXRlO1xuICAgIGR1cmF0aW9uPzogc3RyaW5nO1xuICAgIG1lc3NhZ2U/OiBzdHJpbmc7XG4gIH1cblxuICBleHBvcnQgY2xhc3MgVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCBpbXBsZW1lbnRzIElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IHtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBzdGFydDogbnVtYmVyLFxuICAgICAgcHVibGljIGVuZDogbnVtYmVyLFxuICAgICAgcHVibGljIHZhbHVlOiBzdHJpbmcsXG4gICAgICBwdWJsaWMgc3RhcnREYXRlPzogRGF0ZSxcbiAgICAgIHB1YmxpYyBlbmREYXRlPzogRGF0ZSxcbiAgICAgIHB1YmxpYyBkdXJhdGlvbj86IHN0cmluZyxcbiAgICAgIHB1YmxpYyBtZXNzYWdlPzogc3RyaW5nKSB7XG5cbiAgICAgIHRoaXMuZHVyYXRpb24gPSBtb21lbnQoZW5kKS5mcm9tKG1vbWVudChzdGFydCksIHRydWUpO1xuICAgICAgdGhpcy5zdGFydERhdGUgPSBuZXcgRGF0ZShzdGFydCk7XG4gICAgICB0aGlzLmVuZERhdGUgPSBuZXcgRGF0ZShlbmQpO1xuICAgIH1cblxuICB9XG5cbiAgZXhwb3J0IGNsYXNzIEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlIHtcblxuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9IRUlHSFQgPSAxNTA7XG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX1dJRFRIID0gNzUwO1xuXG4gICAgcHVibGljIHJlc3RyaWN0ID0gJ0UnO1xuICAgIHB1YmxpYyByZXBsYWNlID0gdHJ1ZTtcblxuICAgIC8vIENhbid0IHVzZSAxLjQgZGlyZWN0aXZlIGNvbnRyb2xsZXJzIGJlY2F1c2Ugd2UgbmVlZCB0byBzdXBwb3J0IDEuMytcbiAgICBwdWJsaWMgc2NvcGUgPSB7XG4gICAgICBkYXRhOiAnPScsXG4gICAgICBzdGFydFRpbWVzdGFtcDogJ0AnLFxuICAgICAgZW5kVGltZXN0YW1wOiAnQCcsXG4gICAgICB0aW1lTGFiZWw6ICdAJyxcbiAgICAgIGRhdGVMYWJlbDogJ0AnLFxuICAgICAgY2hhcnRUaXRsZTogJ0AnXG4gICAgfTtcblxuICAgIHB1YmxpYyBsaW5rOiAoc2NvcGU6IGFueSwgZWxlbWVudDogbmcuSUF1Z21lbnRlZEpRdWVyeSwgYXR0cnM6IGFueSkgPT4gdm9pZDtcblxuICAgIHB1YmxpYyB0cmFuc2Zvcm1lZERhdGFQb2ludHM6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W107XG5cbiAgICBjb25zdHJ1Y3Rvcigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBzdGFydFRpbWVzdGFtcDogbnVtYmVyID0gK2F0dHJzLnN0YXJ0VGltZXN0YW1wLFxuICAgICAgICAgIGVuZFRpbWVzdGFtcDogbnVtYmVyID0gK2F0dHJzLmVuZFRpbWVzdGFtcCxcbiAgICAgICAgICBjaGFydEhlaWdodCA9IEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLl9DSEFSVF9IRUlHSFQ7XG5cbiAgICAgICAgLy8gY2hhcnQgc3BlY2lmaWMgdmFyc1xuICAgICAgICBsZXQgbWFyZ2luID0geyB0b3A6IDEwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA5MCB9LFxuICAgICAgICAgIHdpZHRoID0gQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gNTAsXG4gICAgICAgICAgaGVpZ2h0ID0gYWRqdXN0ZWRDaGFydEhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tLFxuICAgICAgICAgIHRpdGxlSGVpZ2h0ID0gMzAsXG4gICAgICAgICAgdGl0bGVTcGFjZSA9IDEwLFxuICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wIC0gdGl0bGVIZWlnaHQgLSB0aXRsZVNwYWNlLFxuICAgICAgICAgIGFkanVzdGVkQ2hhcnRIZWlnaHQyID0gK3RpdGxlSGVpZ2h0ICsgdGl0bGVTcGFjZSArIG1hcmdpbi50b3AsXG4gICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGJydXNoLFxuICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgdGlwLFxuICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgIHN2ZztcblxuICAgICAgICBmdW5jdGlvbiBidWlsZEF2YWlsSG92ZXIoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICByZXR1cm4gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+U3RhdHVzOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLnZhbHVlLnRvVXBwZXJDYXNlKCl9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gYmVmb3JlLXNlcGFyYXRvcic+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPkR1cmF0aW9uOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLmR1cmF0aW9ufTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvbmVUaW1lQ2hhcnRTZXR1cCgpOiB2b2lkIHtcbiAgICAgICAgICAvLyBkZXN0cm95IGFueSBwcmV2aW91cyBjaGFydHNcbiAgICAgICAgICBpZiAoY2hhcnQpIHtcbiAgICAgICAgICAgIGNoYXJ0UGFyZW50LnNlbGVjdEFsbCgnKicpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjaGFydFBhcmVudCA9IGQzLnNlbGVjdChlbGVtZW50WzBdKTtcbiAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgIC5hdHRyKCd2aWV3Qm94JywgJzAgMCA3NjAgMTUwJykuYXR0cigncHJlc2VydmVBc3BlY3RSYXRpbycsICd4TWluWU1pbiBtZWV0Jyk7XG5cbiAgICAgICAgICB0aXAgPSBkMy50aXAoKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2QzLXRpcCcpXG4gICAgICAgICAgICAub2Zmc2V0KFstMTAsIDBdKVxuICAgICAgICAgICAgLmh0bWwoKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBidWlsZEF2YWlsSG92ZXIoZCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyAoYWRqdXN0ZWRDaGFydEhlaWdodDIpICsgJyknKTtcblxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2RlZnMnKVxuICAgICAgICAgICAgLmFwcGVuZCgncGF0dGVybicpXG4gICAgICAgICAgICAuYXR0cignaWQnLCAnZGlhZ29uYWwtc3RyaXBlcycpXG4gICAgICAgICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgICAgICAgIC5hdHRyKCdwYXR0ZXJuVHJhbnNmb3JtJywgJ3NjYWxlKDAuNyknKVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgNClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCA0KVxuICAgICAgICAgICAgLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuYXR0cignZCcsICdNLTEsMSBsMiwtMiBNMCw0IGw0LC00IE0zLDUgbDIsLTInKVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICcjQjZCNkI2JylcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAxLjIpO1xuXG4gICAgICAgICAgc3ZnLmNhbGwodGlwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRldGVybWluZUF2YWlsU2NhbGUodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSkge1xuICAgICAgICAgIGxldCBhZGp1c3RlZFRpbWVSYW5nZTogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gK2F0dHJzLnN0YXJ0VGltZXN0YW1wIHx8XG4gICAgICAgICAgICBkMy5taW4odHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCwgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkLnN0YXJ0O1xuICAgICAgICAgICAgfSkgfHwgK21vbWVudCgpLnN1YnRyYWN0KDEsICdob3VyJyk7XG5cbiAgICAgICAgICBpZiAodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCAmJiB0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50Lmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgICAgYWRqdXN0ZWRUaW1lUmFuZ2VbMF0gPSBzdGFydFRpbWVzdGFtcDtcbiAgICAgICAgICAgIGFkanVzdGVkVGltZVJhbmdlWzFdID0gZW5kVGltZXN0YW1wIHx8ICttb21lbnQoKTtcblxuICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgLmNsYW1wKHRydWUpXG4gICAgICAgICAgICAgIC5yYW5nZVJvdW5kKFs3MCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oWzAsIDE3NV0pO1xuXG4gICAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgLnRpY2tzKDApXG4gICAgICAgICAgICAgIC50aWNrU2l6ZSgwLCAwKVxuICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihhZGp1c3RlZFRpbWVSYW5nZSk7XG5cbiAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgICAudGlja1NpemUoLTcwLCAwKVxuICAgICAgICAgICAgICAub3JpZW50KCd0b3AnKVxuICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpO1xuXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaXNVcChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBkLnZhbHVlID09PSBBdmFpbFN0YXR1cy5VUC50b1N0cmluZygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9mdW5jdGlvbiBpc0Rvd24oZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgLy8gIHJldHVybiBkLnZhbHVlID09PSBBdmFpbFN0YXR1cy5ET1dOLnRvU3RyaW5nKCk7XG4gICAgICAgIC8vfVxuXG4gICAgICAgIGZ1bmN0aW9uIGlzVW5rbm93bihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBkLnZhbHVlID09PSBBdmFpbFN0YXR1cy5VTktOT1dOLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBmb3JtYXRUcmFuc2Zvcm1lZERhdGFQb2ludHMoaW5BdmFpbERhdGE6IElBdmFpbERhdGFQb2ludFtdKTogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSB7XG4gICAgICAgICAgbGV0IG91dHB1dERhdGE6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10gPSBbXTtcbiAgICAgICAgICBsZXQgaXRlbUNvdW50ID0gaW5BdmFpbERhdGEubGVuZ3RoO1xuXG4gICAgICAgICAgZnVuY3Rpb24gc29ydEJ5VGltZXN0YW1wKGE6IElBdmFpbERhdGFQb2ludCwgYjogSUF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgICBpZiAoYS50aW1lc3RhbXAgPCBiLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYS50aW1lc3RhbXAgPiBiLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGluQXZhaWxEYXRhLnNvcnQoc29ydEJ5VGltZXN0YW1wKTtcblxuICAgICAgICAgIGlmIChpbkF2YWlsRGF0YSAmJiBpdGVtQ291bnQgPiAwICYmIGluQXZhaWxEYXRhWzBdLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgbGV0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgICAgICAgICBpZiAoaXRlbUNvdW50ID09PSAxKSB7XG4gICAgICAgICAgICAgIGxldCBhdmFpbEl0ZW0gPSBpbkF2YWlsRGF0YVswXTtcblxuICAgICAgICAgICAgICAvLyB3ZSBvbmx5IGhhdmUgb25lIGl0ZW0gd2l0aCBzdGFydCB0aW1lLiBBc3N1bWUgdW5rbm93biBmb3IgdGhlIHRpbWUgYmVmb3JlIChsYXN0IDFoKVxuICAgICAgICAgICAgICAvLyBAVE9ETyBhZGp1c3QgdG8gdGltZSBwaWNrZXJcbiAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KG5vdyAtIDYwICogNjAgKiAxMDAwLFxuICAgICAgICAgICAgICAgIGF2YWlsSXRlbS50aW1lc3RhbXAsIEF2YWlsU3RhdHVzLlVOS05PV04udG9TdHJpbmcoKSkpO1xuICAgICAgICAgICAgICAvLyBhbmQgdGhlIGRldGVybWluZWQgdmFsdWUgdXAgdW50aWwgdGhlIGVuZC5cbiAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KGF2YWlsSXRlbS50aW1lc3RhbXAsIG5vdywgYXZhaWxJdGVtLnZhbHVlKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBsZXQgYmFja3dhcmRzRW5kVGltZSA9IG5vdztcblxuICAgICAgICAgICAgICBmb3IgKGxldCBpID0gaW5BdmFpbERhdGEubGVuZ3RoOyBpID4gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBkYXRhIHN0YXJ0aW5nIGluIHRoZSBmdXR1cmUuLi4gZGlzY2FyZCBpdFxuICAgICAgICAgICAgICAgIC8vaWYgKGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXAgPiArbW9tZW50KCkpIHtcbiAgICAgICAgICAgICAgICAvLyAgY29udGludWU7XG4gICAgICAgICAgICAgICAgLy99XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0VGltZXN0YW1wID49IGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgICAgIG91dHB1dERhdGEucHVzaChuZXcgVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludChzdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSwgaW5BdmFpbERhdGFbaSAtIDFdLnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIGJhY2t3YXJkc0VuZFRpbWUsIGluQXZhaWxEYXRhW2kgLSAxXS52YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSA9IGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBvdXRwdXREYXRhO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlU2lkZVlBeGlzTGFiZWxzKCkge1xuICAgICAgICAgIC8vL0BUb2RvOiBtb3ZlIG91dCB0byBzdHlsZXNoZWV0XG4gICAgICAgICAgc3ZnLmFwcGVuZCgndGV4dCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxVcExhYmVsJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgLTEwKVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAyNSlcbiAgICAgICAgICAgIC5zdHlsZSgnZm9udC1mYW1pbHknLCAnQXJpYWwsIFZlcmRhbmEsIHNhbnMtc2VyaWY7JylcbiAgICAgICAgICAgIC5zdHlsZSgnZm9udC1zaXplJywgJzEycHgnKVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnIzk5OScpXG4gICAgICAgICAgICAuc3R5bGUoJ3RleHQtYW5jaG9yJywgJ2VuZCcpXG4gICAgICAgICAgICAudGV4dCgnVXAnKTtcblxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ3RleHQnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2YWlsRG93bkxhYmVsJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgLTEwKVxuICAgICAgICAgICAgLmF0dHIoJ3knLCA1NSlcbiAgICAgICAgICAgIC5zdHlsZSgnZm9udC1mYW1pbHknLCAnQXJpYWwsIFZlcmRhbmEsIHNhbnMtc2VyaWY7JylcbiAgICAgICAgICAgIC5zdHlsZSgnZm9udC1zaXplJywgJzEycHgnKVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnIzk5OScpXG4gICAgICAgICAgICAuc3R5bGUoJ3RleHQtYW5jaG9yJywgJ2VuZCcpXG4gICAgICAgICAgICAudGV4dCgnRG93bicpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVBdmFpbGFiaWxpdHlDaGFydCh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSB7XG4gICAgICAgICAgLy9sZXQgeEF4aXNNaW4gPSBkMy5taW4odHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCwgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgLy8gIHJldHVybiArZC5zdGFydDtcbiAgICAgICAgICAvL30pLFxuICAgICAgICAgIGxldCB4QXhpc01heCA9IGQzLm1heCh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiArZC5lbmQ7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgYXZhaWxUaW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgLmRvbWFpbihbc3RhcnRUaW1lc3RhbXAsIGVuZFRpbWVzdGFtcCB8fCB4QXhpc01heF0pLFxuXG4gICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlKFtoZWlnaHQsIDBdKVxuICAgICAgICAgICAgICAuZG9tYWluKFswLCA0XSk7XG5cbiAgICAgICAgICAvL2F2YWlsWEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgLy8gIC5zY2FsZShhdmFpbFRpbWVTY2FsZSlcbiAgICAgICAgICAvLyAgLnRpY2tzKDgpXG4gICAgICAgICAgLy8gIC50aWNrU2l6ZSgxMywgMClcbiAgICAgICAgICAvLyAgLm9yaWVudCgndG9wJyk7XG5cbiAgICAgICAgICAvLyBGb3IgZWFjaCBkYXRhcG9pbnQgY2FsY3VsYXRlIHRoZSBZIG9mZnNldCBmb3IgdGhlIGJhclxuICAgICAgICAgIC8vIFVwIG9yIFVua25vd246IG9mZnNldCAwLCBEb3duOiBvZmZzZXQgMzVcbiAgICAgICAgICBmdW5jdGlvbiBjYWxjQmFyWShkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgcmV0dXJuIGhlaWdodCAtIHlTY2FsZSgwKSArICgoaXNVcChkKSB8fCBpc1Vua25vd24oZCkpID8gMCA6IDM1KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBGb3IgZWFjaCBkYXRhcG9pbnQgY2FsY3VsYXRlIHRoZSBZIHJlbW92ZWQgaGVpZ2h0IGZvciB0aGUgYmFyXG4gICAgICAgICAgLy8gVW5rbm93bjogZnVsbCBoZWlnaHQgMTUsIFVwIG9yIERvd246IGhhbGYgaGVpZ2h0LCA1MFxuICAgICAgICAgIGZ1bmN0aW9uIGNhbGNCYXJIZWlnaHQoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIHJldHVybiB5U2NhbGUoMCkgLSAoaXNVbmtub3duKGQpID8gMTUgOiA1MCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY2FsY0JhckZpbGwoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIGlmIChpc1VwKGQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAnIzU0QTI0RSc7IC8vIGdyZWVuXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzVW5rbm93bihkKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3VybCgjZGlhZ29uYWwtc3RyaXBlcyknOyAvLyBncmF5IHN0cmlwZXNcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiAnI0Q4NTA1NCc7IC8vIHJlZFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ3JlY3QuYXZhaWxCYXJzJylcbiAgICAgICAgICAgIC5kYXRhKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpXG4gICAgICAgICAgICAuZW50ZXIoKS5hcHBlbmQoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2YWlsQmFycycpXG4gICAgICAgICAgICAuYXR0cigneCcsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gYXZhaWxUaW1lU2NhbGUoK2Quc3RhcnQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCd5JywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWShkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJIZWlnaHQoZCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIGxldCBkRW5kID0gZW5kVGltZXN0YW1wID8gKE1hdGgubWluKCtkLmVuZCwgZW5kVGltZXN0YW1wKSkgOiAoK2QuZW5kKTtcbiAgICAgICAgICAgICAgcmV0dXJuIGF2YWlsVGltZVNjYWxlKGRFbmQpIC0gYXZhaWxUaW1lU2NhbGUoK2Quc3RhcnQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBjYWxjQmFyRmlsbChkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignb3BhY2l0eScsICgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIDAuODU7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgICAgdGlwLmhpZGUoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNlZG93bicsICgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGJydXNoRWxlbSA9IHN2Zy5zZWxlY3QoJy5icnVzaCcpLm5vZGUoKTtcbiAgICAgICAgICAgICAgbGV0IGNsaWNrRXZlbnQ6IGFueSA9IG5ldyBFdmVudCgnbW91c2Vkb3duJyk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVggPSBkMy5ldmVudC5wYWdlWDtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRYID0gZDMuZXZlbnQuY2xpZW50WDtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWSA9IGQzLmV2ZW50LnBhZ2VZO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFkgPSBkMy5ldmVudC5jbGllbnRZO1xuICAgICAgICAgICAgICBicnVzaEVsZW0uZGlzcGF0Y2hFdmVudChjbGlja0V2ZW50KTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNldXAnLCAoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBicnVzaEVsZW0gPSBzdmcuc2VsZWN0KCcuYnJ1c2gnKS5ub2RlKCk7XG4gICAgICAgICAgICAgIGxldCBjbGlja0V2ZW50OiBhbnkgPSBuZXcgRXZlbnQoJ21vdXNldXAnKTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWCA9IGQzLmV2ZW50LnBhZ2VYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFggPSBkMy5ldmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VZID0gZDMuZXZlbnQucGFnZVk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WSA9IGQzLmV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICAgIGJydXNoRWxlbS5kaXNwYXRjaEV2ZW50KGNsaWNrRXZlbnQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBUaGUgYm90dG9tIGxpbmUgb2YgdGhlIGF2YWlsYWJpbGl0eSBjaGFydFxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmF0dHIoJ3gxJywgMClcbiAgICAgICAgICAgIC5hdHRyKCd5MScsIDcwKVxuICAgICAgICAgICAgLmF0dHIoJ3gyJywgNjU1KVxuICAgICAgICAgICAgLmF0dHIoJ3kyJywgNzApXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgMC41KVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICcjRDBEMEQwJyk7XG5cbiAgICAgICAgICBjcmVhdGVTaWRlWUF4aXNMYWJlbHMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgLy8gY3JlYXRlIHgtYXhpc1xuICAgICAgICAgIHhBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd4IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeEF4aXMpO1xuXG4gICAgICAgICAgLy8gY3JlYXRlIHktYXhpc1xuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh5QXhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgYnJ1c2ggPSBkMy5zdmcuYnJ1c2goKVxuICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgLm9uKCdicnVzaHN0YXJ0JywgYnJ1c2hTdGFydClcbiAgICAgICAgICAgIC5vbignYnJ1c2hlbmQnLCBicnVzaEVuZCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYnJ1c2gnKVxuICAgICAgICAgICAgLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJy5yZXNpemUnKS5hcHBlbmQoJ3BhdGgnKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCA3MCk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBicnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsIHRydWUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGJydXNoRW5kKCkge1xuICAgICAgICAgICAgbGV0IGV4dGVudCA9IGJydXNoLmV4dGVudCgpLFxuICAgICAgICAgICAgICBzdGFydFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFswXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMV0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgZHJhZ1NlbGVjdGlvbkRlbHRhID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcblxuICAgICAgICAgICAgLy9zdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgIWQzLmV2ZW50LnRhcmdldC5lbXB0eSgpKTtcbiAgICAgICAgICAgIGlmIChkcmFnU2VsZWN0aW9uRGVsdGEgPj0gNjAwMDApIHtcbiAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEV2ZW50TmFtZXMuQVZBSUxfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQudG9TdHJpbmcoKSwgZXh0ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJydXNoR3JvdXAuY2FsbChicnVzaC5jbGVhcigpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgdGhpcy50cmFuc2Zvcm1lZERhdGFQb2ludHMgPSBmb3JtYXRUcmFuc2Zvcm1lZERhdGFQb2ludHMoYW5ndWxhci5mcm9tSnNvbihuZXdEYXRhKSk7XG4gICAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy50cmFuc2Zvcm1lZERhdGFQb2ludHMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydzdGFydFRpbWVzdGFtcCcsICdlbmRUaW1lc3RhbXAnXSwgKG5ld1RpbWVzdGFtcCkgPT4ge1xuICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gK25ld1RpbWVzdGFtcFswXSB8fCBzdGFydFRpbWVzdGFtcDtcbiAgICAgICAgICBlbmRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzFdIHx8IGVuZFRpbWVzdGFtcDtcbiAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy50cmFuc2Zvcm1lZERhdGFQb2ludHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS5yZW5kZXIgPSAodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSkgPT4ge1xuICAgICAgICAgIGlmICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50ICYmIHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy9jb25zb2xlLnRpbWUoJ2F2YWlsQ2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgIC8vL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIG9uZVRpbWVDaGFydFNldHVwKCk7XG4gICAgICAgICAgICBkZXRlcm1pbmVBdmFpbFNjYWxlKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpO1xuICAgICAgICAgICAgY3JlYXRlWGFuZFlBeGVzKCk7XG4gICAgICAgICAgICBjcmVhdGVYQXhpc0JydXNoKCk7XG4gICAgICAgICAgICBjcmVhdGVBdmFpbGFiaWxpdHlDaGFydCh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KTtcbiAgICAgICAgICAgIC8vY29uc29sZS50aW1lRW5kKCdhdmFpbENoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3RhdGljIEZhY3RvcnkoKSB7XG4gICAgICBsZXQgZGlyZWN0aXZlID0gKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUoJHJvb3RTY29wZSk7XG4gICAgICB9O1xuXG4gICAgICBkaXJlY3RpdmVbJyRpbmplY3QnXSA9IFsnJHJvb3RTY29wZSddO1xuXG4gICAgICByZXR1cm4gZGlyZWN0aXZlO1xuICAgIH1cblxuICB9XG5cbiAgX21vZHVsZS5kaXJlY3RpdmUoJ2F2YWlsYWJpbGl0eUNoYXJ0JywgQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSgpKTtcbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cbiAgZXhwb3J0IGNsYXNzIENvbnRleHRDaGFydERpcmVjdGl2ZSB7XG5cbiAgICAvLyB0aGVzZSBhcmUganVzdCBzdGFydGluZyBwYXJhbWV0ZXIgaGludHNcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfV0lEVEhfSElOVCA9IDc1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfSEVJR0hUX0hJTlQgPSA1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfWEFYSVNfSEVJR0hUID0gMTU7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGRhdGE6ICc9JyxcbiAgICAgIHNob3dZQXhpc1ZhbHVlczogJz0nLFxuICAgIH07XG5cbiAgICBwdWJsaWMgbGluazogKHNjb3BlOiBhbnksIGVsZW1lbnQ6IG5nLklBdWdtZW50ZWRKUXVlcnksIGF0dHJzOiBhbnkpID0+IHZvaWQ7XG5cbiAgICBwdWJsaWMgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W107XG5cbiAgICBjb25zdHJ1Y3Rvcigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgY29uc3QgbWFyZ2luID0geyB0b3A6IDAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwIH07XG5cbiAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBjaGFydEhlaWdodCA9IENvbnRleHRDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hUX0hJTlQsXG4gICAgICAgICAgd2lkdGggPSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIX0hJTlQgLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCxcbiAgICAgICAgICBoZWlnaHQgPSBjaGFydEhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tLFxuICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tIC0gMTUsXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AsXG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzOiBib29sZWFuLFxuICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB5QXhpc0dyb3VwLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGJydXNoLFxuICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnO1xuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuc2hvd1lBeGlzVmFsdWVzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlcyA9IGF0dHJzLnNob3dZQXhpc1ZhbHVlcyA9PT0gJ3RydWUnO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcmVzaXplKCk6IHZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuXG4gICAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGVsZW1lbnRbMF0ucGFyZW50Tm9kZTtcblxuICAgICAgICAgIHdpZHRoID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50V2lkdGg7XG4gICAgICAgICAgaGVpZ2h0ID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50SGVpZ2h0O1xuXG4gICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20gLSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX1hBWElTX0hFSUdIVCxcblxuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnQ29udGV4dCBXaWR0aDogJWknLHdpZHRoKTtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ0NvbnRleHQgSGVpZ2h0OiAlaScsaGVpZ2h0KTtcblxuICAgICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3A7XG5cbiAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywgMCknKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRDaGFydCcpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVDb250ZXh0Q2hhcnQoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcblxuICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aCAtIDEwXSlcbiAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgIC5kb21haW4oW2RhdGFQb2ludHNbMF0udGltZXN0YW1wLCBkYXRhUG9pbnRzW2RhdGFQb2ludHMubGVuZ3RoIC0gMV0udGltZXN0YW1wXSk7XG5cbiAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAudGlja1NpemUoNCwgMClcbiAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgIC5vcmllbnQoJ2JvdHRvbScpO1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneCBheGlzJylcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKDAsJyArIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCArICcpJylcbiAgICAgICAgICAgIC5jYWxsKHhBeGlzKTtcblxuICAgICAgICAgIGxldCB5TWluID0gZDMubWluKGRhdGFQb2ludHMsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgbGV0IHlNYXggPSBkMy5tYXgoZGF0YVBvaW50cywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIGdpdmUgYSBwYWQgb2YgJSB0byBtaW4vbWF4IHNvIHdlIGFyZSBub3QgYWdhaW5zdCB4LWF4aXNcbiAgICAgICAgICB5TWF4ID0geU1heCArICh5TWF4ICogMC4wMyk7XG4gICAgICAgICAgeU1pbiA9IHlNaW4gLSAoeU1pbiAqIDAuMDUpO1xuXG4gICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgIC5yYW5nZVJvdW5kKFttb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsIDBdKVxuICAgICAgICAgICAgLm5pY2UoKVxuICAgICAgICAgICAgLmRvbWFpbihbeU1pbiwgeU1heF0pO1xuXG4gICAgICAgICAgbGV0IG51bWJlck9mVGlja3MgPSBzaG93WUF4aXNWYWx1ZXMgPyAyIDogMDtcblxuICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgIC50aWNrcyhudW1iZXJPZlRpY2tzKVxuICAgICAgICAgICAgLnRpY2tTaXplKDQsIDApXG4gICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcblxuICAgICAgICAgIGxldCBhcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgICAgLmludGVycG9sYXRlKCdjYXJkaW5hbCcpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAhZC5lbXB0eTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQ7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkxKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBjb250ZXh0TGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgIC5pbnRlcnBvbGF0ZSgnY2FyZGluYWwnKVxuICAgICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gIWQuZW1wdHk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgcGF0aENvbnRleHRMaW5lID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5jb250ZXh0TGluZScpLmRhdGEoW2RhdGFQb2ludHNdKTtcblxuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIHBhdGhDb250ZXh0TGluZS5hdHRyKCdjbGFzcycsICdjb250ZXh0TGluZScpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuYXR0cignZCcsIGNvbnRleHRMaW5lKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIHBhdGhDb250ZXh0TGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dExpbmUnKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBjb250ZXh0TGluZSk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgbGV0IGNvbnRleHRBcmVhID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dCcpO1xuXG4gICAgICAgICAgY29udGV4dEFyZWEuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5kYXR1bShkYXRhUG9pbnRzKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmR1cmF0aW9uKDUwMClcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdjb250ZXh0QXJlYScpXG4gICAgICAgICAgICAuYXR0cignZCcsIGFyZWEpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgYnJ1c2ggPSBkMy5zdmcuYnJ1c2goKVxuICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgLm9uKCdicnVzaHN0YXJ0JywgY29udGV4dEJydXNoU3RhcnQpXG4gICAgICAgICAgICAub24oJ2JydXNoZW5kJywgY29udGV4dEJydXNoRW5kKTtcblxuICAgICAgICAgIHhBeGlzR3JvdXAuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAwKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGhlaWdodCAtIDEwKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGhlaWdodCArIDE3KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGNvbnRleHRCcnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsIHRydWUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNvbnRleHRCcnVzaEVuZCgpIHtcbiAgICAgICAgICAgIGxldCBicnVzaEV4dGVudCA9IGJydXNoLmV4dGVudCgpLFxuICAgICAgICAgICAgICBzdGFydFRpbWUgPSBNYXRoLnJvdW5kKGJydXNoRXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGJydXNoRXh0ZW50WzFdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgICAgIC8vLyBXZSBpZ25vcmUgZHJhZyBzZWxlY3Rpb25zIHVuZGVyIGEgbWludXRlXG4gICAgICAgICAgICBpZiAoZHJhZ1NlbGVjdGlvbkRlbHRhID49IDYwMDAwKSB7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChFdmVudE5hbWVzLkNPTlRFWFRfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQudG9TdHJpbmcoKSwgYnJ1c2hFeHRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy9icnVzaEdyb3VwLmNhbGwoYnJ1c2guY2xlYXIoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy9kMy5zZWxlY3Qod2luZG93KS5vbigncmVzaXplJywgc2NvcGUucmVuZGVyKHRoaXMuZGF0YVBvaW50cykpO1xuXG4gICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChuZXdEYXRhKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFQb2ludHMgPSBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KGFuZ3VsYXIuZnJvbUpzb24obmV3RGF0YSkpO1xuICAgICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMuZGF0YVBvaW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBmdW5jdGlvbiBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTogSUNoYXJ0RGF0YVBvaW50W10ge1xuICAgICAgICAgIC8vICBUaGUgc2NoZW1hIGlzIGRpZmZlcmVudCBmb3IgYnVja2V0ZWQgb3V0cHV0XG4gICAgICAgICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UubWFwKChwb2ludDogSUNoYXJ0RGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIGxldCB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IHBvaW50LnRpbWVzdGFtcCB8fCAocG9pbnQuc3RhcnQgKyAocG9pbnQuZW5kIC0gcG9pbnQuc3RhcnQpIC8gMik7XG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiB0aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgLy9kYXRlOiBuZXcgRGF0ZSh0aW1lc3RhbXApLFxuICAgICAgICAgICAgICAgIHZhbHVlOiAhYW5ndWxhci5pc051bWJlcihwb2ludC52YWx1ZSkgPyB1bmRlZmluZWQgOiBwb2ludC52YWx1ZSxcbiAgICAgICAgICAgICAgICBhdmc6IChwb2ludC5lbXB0eSkgPyB1bmRlZmluZWQgOiBwb2ludC5hdmcsXG4gICAgICAgICAgICAgICAgbWluOiAhYW5ndWxhci5pc051bWJlcihwb2ludC5taW4pID8gdW5kZWZpbmVkIDogcG9pbnQubWluLFxuICAgICAgICAgICAgICAgIG1heDogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWF4KSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1heCxcbiAgICAgICAgICAgICAgICBlbXB0eTogcG9pbnQuZW1wdHlcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLnJlbmRlciA9IChkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkgPT4ge1xuICAgICAgICAgIGlmIChkYXRhUG9pbnRzICYmIGRhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS50aW1lKCdjb250ZXh0Q2hhcnRSZW5kZXInKTtcblxuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgcmVzaXplKCk7XG4gICAgICAgICAgICBjcmVhdGVDb250ZXh0Q2hhcnQoZGF0YVBvaW50cyk7XG4gICAgICAgICAgICBjcmVhdGVYQXhpc0JydXNoKCk7XG4gICAgICAgICAgICBjb25zb2xlLnRpbWVFbmQoJ2NvbnRleHRDaGFydFJlbmRlcicpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH07XG5cbiAgICB9XG5cbiAgICBwdWJsaWMgc3RhdGljIEZhY3RvcnkoKSB7XG4gICAgICBsZXQgZGlyZWN0aXZlID0gKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgQ29udGV4dENoYXJ0RGlyZWN0aXZlKCRyb290U2NvcGUpO1xuICAgICAgfTtcblxuICAgICAgZGlyZWN0aXZlWyckaW5qZWN0J10gPSBbJyRyb290U2NvcGUnXTtcblxuICAgICAgcmV0dXJuIGRpcmVjdGl2ZTtcbiAgICB9XG5cbiAgfVxuXG4gIF9tb2R1bGUuZGlyZWN0aXZlKCdoYXdrdWxhckNvbnRleHRDaGFydCcsIENvbnRleHRDaGFydERpcmVjdGl2ZS5GYWN0b3J5KCkpO1xufVxuIiwiLy8vXG4vLy8gQ29weXJpZ2h0IDIwMTUgUmVkIEhhdCwgSW5jLiBhbmQvb3IgaXRzIGFmZmlsaWF0ZXNcbi8vLyBhbmQgb3RoZXIgY29udHJpYnV0b3JzIGFzIGluZGljYXRlZCBieSB0aGUgQGF1dGhvciB0YWdzLlxuLy8vXG4vLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vLy9cbi8vLyAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vL1xuLy8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLy8vXG4vLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8vLyBOT1RFOiB0aGlzIHBhdHRlcm4gaXMgdXNlZCBiZWNhdXNlIGVudW1zIGNhbnQgYmUgdXNlZCB3aXRoIHN0cmluZ3NcbiAgZXhwb3J0IGNsYXNzIEV2ZW50TmFtZXMge1xuXG4gICAgcHVibGljIHN0YXRpYyBDSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdDaGFydFRpbWVSYW5nZUNoYW5nZWQnKTtcbiAgICBwdWJsaWMgc3RhdGljIEFWQUlMX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VEID0gbmV3IEV2ZW50TmFtZXMoJ0F2YWlsQ2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG4gICAgcHVibGljIHN0YXRpYyBDT05URVhUX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VEID0gbmV3IEV2ZW50TmFtZXMoJ0NvbnRleHRDaGFydFRpbWVSYW5nZUNoYW5nZWQnKTtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAvLyBlbXB0eVxuICAgIH1cblxuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgcmV0dXJuIHRoaXMudmFsdWU7XG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8qKlxuICAgKiBDcmVhdGUgZGF0YSBwb2ludHMgYWxvbmcgdGhlIGxpbmUgdG8gc2hvdyB0aGUgYWN0dWFsIHZhbHVlcy5cbiAgICogQHBhcmFtIHN2Z1xuICAgKiBAcGFyYW0gdGltZVNjYWxlXG4gICAqIEBwYXJhbSB5U2NhbGVcbiAgICogQHBhcmFtIHRpcFxuICAgKiBAcGFyYW0gZGF0YVBvaW50c1xuICAgKi9cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURhdGFQb2ludHMoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgdGlwOiBhbnksXG4gICAgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICBsZXQgcmFkaXVzID0gMTtcbiAgICBsZXQgZG90RGF0YXBvaW50ID0gc3ZnLnNlbGVjdEFsbCgnLmRhdGFQb2ludERvdCcpLmRhdGEoZGF0YVBvaW50cyk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgZG90RGF0YXBvaW50LmF0dHIoJ2NsYXNzJywgJ2RhdGFQb2ludERvdCcpXG4gICAgICAuYXR0cigncicsIHJhZGl1cylcbiAgICAgIC5hdHRyKCdjeCcsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2N5JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gZC5hdmcgPyB5U2NhbGUoZC5hdmcpIDogLTk5OTk5OTk7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgZnVuY3Rpb24oZCwgaSkge1xuICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgZG90RGF0YXBvaW50LmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2RhdGFQb2ludERvdCcpXG4gICAgICAuYXR0cigncicsIHJhZGl1cylcbiAgICAgIC5hdHRyKCdjeCcsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2N5JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gZC5hdmcgPyB5U2NhbGUoZC5hdmcpIDogLTk5OTk5OTk7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgZnVuY3Rpb24oZCwgaSkge1xuICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgZG90RGF0YXBvaW50LmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZUZvcmVjYXN0TGluZShuZXdJbnRlcnBvbGF0aW9uLCB0aW1lU2NhbGUsIHlTY2FsZSkge1xuICAgIGxldCBpbnRlcnBvbGF0ZSA9IG5ld0ludGVycG9sYXRpb24gfHwgJ21vbm90b25lJyxcbiAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShkLnZhbHVlKTtcbiAgICAgICAgfSk7XG5cbiAgICByZXR1cm4gbGluZTtcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YTogSVByZWRpY3RpdmVNZXRyaWNbXSwgY2hhcnRPcHRpb25zOiBDaGFydE9wdGlvbnMpIHtcbiAgICBsZXQgZXhpc3RzTWluT3JNYXgsXG4gICAgICBsYXN0Rm9yZWNhc3RQb2ludCA9IGZvcmVjYXN0RGF0YVtmb3JlY2FzdERhdGEubGVuZ3RoIC0gMV07XG5cbiAgICBleGlzdHNNaW5Pck1heCA9IGxhc3RGb3JlY2FzdFBvaW50Lm1pbiB8fCBsYXN0Rm9yZWNhc3RQb2ludC5tYXg7XG5cbiAgICBpZiAoZXhpc3RzTWluT3JNYXgpIHtcbiAgICAgIGxldFxuICAgICAgICBtYXhBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pO1xuXG4gICAgICBsZXRcbiAgICAgICAgcHJlZGljdGl2ZUNvbmVBcmVhUGF0aCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdwYXRoLkNvbmVBcmVhJykuZGF0YShbZm9yZWNhc3REYXRhXSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIHByZWRpY3RpdmVDb25lQXJlYVBhdGguYXR0cignY2xhc3MnLCAnY29uZUFyZWEnKVxuICAgICAgICAuYXR0cignZCcsIG1heEFyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBwcmVkaWN0aXZlQ29uZUFyZWFQYXRoLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbmVBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBtYXhBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgcHJlZGljdGl2ZUNvbmVBcmVhUGF0aC5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICB9XG5cbiAgICBsZXQgZm9yZWNhc3RQYXRoTGluZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuZm9yZWNhc3RMaW5lJykuZGF0YShbZm9yZWNhc3REYXRhXSk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgZm9yZWNhc3RQYXRoTGluZS5hdHRyKCdjbGFzcycsICdmb3JlY2FzdExpbmUnKVxuICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVGb3JlY2FzdExpbmUoJ21vbm90b25lJywgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLnlTY2FsZSkpO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGZvcmVjYXN0UGF0aExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2ZvcmVjYXN0TGluZScpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUZvcmVjYXN0TGluZSgnbW9ub3RvbmUnLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlKSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgZm9yZWNhc3RQYXRoTGluZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgaW1wb3J0IGNyZWF0ZVN2Z0RlZnMgPSBDaGFydHMuY3JlYXRlU3ZnRGVmcztcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGRlY2xhcmUgbGV0IGQzOiBhbnk7XG4gIGRlY2xhcmUgbGV0IGNvbnNvbGU6IGFueTtcblxuICBsZXQgZGVidWc6IGJvb2xlYW4gPSBmYWxzZTtcblxuICAvLyB0aGUgc2NhbGUgdG8gdXNlIGZvciB5LWF4aXMgd2hlbiBhbGwgdmFsdWVzIGFyZSAwLCBbMCwgREVGQVVMVF9ZX1NDQUxFXVxuICBleHBvcnQgY29uc3QgREVGQVVMVF9ZX1NDQUxFID0gMTA7XG4gIGV4cG9ydCBjb25zdCBYX0FYSVNfSEVJR0hUID0gMjU7IC8vIHdpdGggcm9vbSBmb3IgbGFiZWxcbiAgZXhwb3J0IGNvbnN0IEhPVkVSX0RBVEVfVElNRV9GT1JNQVQgPSAnTU0vREQvWVlZWSBoOm1tIGEnO1xuICBleHBvcnQgY29uc3QgbWFyZ2luID0geyB0b3A6IDEwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA5MCB9OyAvLyBsZWZ0IG1hcmdpbiByb29tIGZvciBsYWJlbFxuICBleHBvcnQgbGV0IHdpZHRoO1xuXG4gIC8qKlxuICAgKiBAbmdkb2MgZGlyZWN0aXZlXG4gICAqIEBuYW1lIGhhd2t1bGFyQ2hhcnRcbiAgICogQGRlc2NyaXB0aW9uIEEgZDMgYmFzZWQgY2hhcnRpbmcgZGlyZWN0aW9uIHRvIHByb3ZpZGUgY2hhcnRpbmcgdXNpbmcgdmFyaW91cyBzdHlsZXMgb2YgY2hhcnRzLlxuICAgKlxuICAgKi9cbiAgYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycpXG4gICAgLmRpcmVjdGl2ZSgnaGF3a3VsYXJDaGFydCcsIFsnJHJvb3RTY29wZScsICckaHR0cCcsICckd2luZG93JywgJyRpbnRlcnZhbCcsICckbG9nJyxcbiAgICAgIGZ1bmN0aW9uKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlLFxuICAgICAgICAkaHR0cDogbmcuSUh0dHBTZXJ2aWNlLFxuICAgICAgICAkd2luZG93OiBuZy5JV2luZG93U2VydmljZSxcbiAgICAgICAgJGludGVydmFsOiBuZy5JSW50ZXJ2YWxTZXJ2aWNlLFxuICAgICAgICAkbG9nOiBuZy5JTG9nU2VydmljZSk6IG5nLklEaXJlY3RpdmUge1xuXG4gICAgICAgIGZ1bmN0aW9uIGxpbmsoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSB7XG5cbiAgICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgICBsZXQgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10gPSBbXSxcbiAgICAgICAgICAgIG11bHRpRGF0YVBvaW50czogSU11bHRpRGF0YVBvaW50W10sXG4gICAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHM6IElQcmVkaWN0aXZlTWV0cmljW10sXG4gICAgICAgICAgICBkYXRhVXJsID0gYXR0cnMubWV0cmljVXJsLFxuICAgICAgICAgICAgbWV0cmljSWQgPSBhdHRycy5tZXRyaWNJZCB8fCAnJyxcbiAgICAgICAgICAgIG1ldHJpY1RlbmFudElkID0gYXR0cnMubWV0cmljVGVuYW50SWQgfHwgJycsXG4gICAgICAgICAgICBtZXRyaWNUeXBlID0gYXR0cnMubWV0cmljVHlwZSB8fCAnZ2F1Z2UnLFxuICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzID0gK2F0dHJzLnRpbWVSYW5nZUluU2Vjb25kcyB8fCA0MzIwMCxcbiAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyA9ICthdHRycy5yZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgfHwgMzYwMCxcbiAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSArYXR0cnMuYWxlcnRWYWx1ZSxcbiAgICAgICAgICAgIGludGVycG9sYXRpb24gPSBhdHRycy5pbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IERhdGUubm93KCksXG4gICAgICAgICAgICBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gZW5kVGltZXN0YW1wIC0gdGltZVJhbmdlSW5TZWNvbmRzLFxuICAgICAgICAgICAgcHJldmlvdXNSYW5nZURhdGFQb2ludHMgPSBbXSxcbiAgICAgICAgICAgIGFubm90YXRpb25EYXRhID0gW10sXG4gICAgICAgICAgICBjaGFydFR5cGUgPSBhdHRycy5jaGFydFR5cGUgfHwgJ2xpbmUnLFxuICAgICAgICAgICAgc2luZ2xlVmFsdWVMYWJlbCA9IGF0dHJzLnNpbmdsZVZhbHVlTGFiZWwgfHwgJ1JhdyBWYWx1ZScsXG4gICAgICAgICAgICBub0RhdGFMYWJlbCA9IGF0dHJzLm5vRGF0YUxhYmVsIHx8ICdObyBEYXRhJyxcbiAgICAgICAgICAgIGR1cmF0aW9uTGFiZWwgPSBhdHRycy5kdXJhdGlvbkxhYmVsIHx8ICdJbnRlcnZhbCcsXG4gICAgICAgICAgICBtaW5MYWJlbCA9IGF0dHJzLm1pbkxhYmVsIHx8ICdNaW4nLFxuICAgICAgICAgICAgbWF4TGFiZWwgPSBhdHRycy5tYXhMYWJlbCB8fCAnTWF4JyxcbiAgICAgICAgICAgIGF2Z0xhYmVsID0gYXR0cnMuYXZnTGFiZWwgfHwgJ0F2ZycsXG4gICAgICAgICAgICB0aW1lc3RhbXBMYWJlbCA9IGF0dHJzLnRpbWVzdGFtcExhYmVsIHx8ICdUaW1lc3RhbXAnLFxuICAgICAgICAgICAgc2hvd0F2Z0xpbmUgPSB0cnVlLFxuICAgICAgICAgICAgc2hvd0RhdGFQb2ludHMgPSBmYWxzZSxcbiAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzID0gZmFsc2UsXG4gICAgICAgICAgICB1c2VaZXJvTWluVmFsdWUgPSBmYWxzZTtcblxuICAgICAgICAgIC8vIGNoYXJ0IHNwZWNpZmljIHZhcnNcblxuICAgICAgICAgIGxldCBoZWlnaHQsXG4gICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsXG4gICAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCArIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgICBjaGFydERhdGEsXG4gICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgICAgdGlwLFxuICAgICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgICBicnVzaEdyb3VwLFxuICAgICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgICBjaGFydFBhcmVudCxcbiAgICAgICAgICAgIHN2ZyxcbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4sXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgcGVhayxcbiAgICAgICAgICAgIG1pbixcbiAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEsXG4gICAgICAgICAgICBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSxcbiAgICAgICAgICAgIHN0YXJ0SW50ZXJ2YWxQcm9taXNlO1xuXG4gICAgICAgICAgZGF0YVBvaW50cyA9IGF0dHJzLmRhdGE7XG4gICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gYXR0cnMuZm9yZWNhc3REYXRhO1xuICAgICAgICAgIHNob3dEYXRhUG9pbnRzID0gYXR0cnMuc2hvd0RhdGFQb2ludHM7XG4gICAgICAgICAgcHJldmlvdXNSYW5nZURhdGFQb2ludHMgPSBhdHRycy5wcmV2aW91c1JhbmdlRGF0YTtcbiAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IGF0dHJzLmFubm90YXRpb25EYXRhO1xuXG4gICAgICAgICAgY29uc3QgY2hhcnRUeXBlczogSUNoYXJ0VHlwZVtdID0gW107XG4gICAgICAgICAgY2hhcnRUeXBlcy5wdXNoKG5ldyBMaW5lQ2hhcnQoKSk7XG4gICAgICAgICAgY2hhcnRUeXBlcy5wdXNoKG5ldyBBcmVhQ2hhcnQoKSk7XG4gICAgICAgICAgY2hhcnRUeXBlcy5wdXNoKG5ldyBTY2F0dGVyQ2hhcnQoKSk7XG4gICAgICAgICAgY2hhcnRUeXBlcy5wdXNoKG5ldyBTY2F0dGVyTGluZUNoYXJ0KCkpO1xuICAgICAgICAgIGNoYXJ0VHlwZXMucHVzaChuZXcgSGlzdG9ncmFtQ2hhcnQoKSk7XG4gICAgICAgICAgY2hhcnRUeXBlcy5wdXNoKG5ldyBSaHFCYXJDaGFydCgpKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIHJlc2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICAgIGNoYXJ0UGFyZW50LnNlbGVjdEFsbCgnKicpLnJlbW92ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSBlbGVtZW50WzBdLnBhcmVudE5vZGU7XG5cbiAgICAgICAgICAgIHdpZHRoID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50V2lkdGg7XG4gICAgICAgICAgICBoZWlnaHQgPSAoPGFueT5wYXJlbnROb2RlKS5jbGllbnRIZWlnaHQ7XG5cbiAgICAgICAgICAgIGlmICh3aWR0aCA9PT0gMCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBzZXR0aW5nIHVwIGNoYXJ0LiBXaWR0aCBpcyAwIG9uIGNoYXJ0IHBhcmVudCBjb250YWluZXIuYCk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoZWlnaHQgPT09IDApIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3Igc2V0dGluZyB1cCBjaGFydC4gSGVpZ2h0IGlzIDAgb24gY2hhcnQgcGFyZW50IGNvbnRhaW5lci5gKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSAtIFhfQVhJU19IRUlHSFQ7XG5cbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ01ldHJpYyBXaWR0aDogJWknLCB3aWR0aCk7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdNZXRyaWMgSGVpZ2h0OiAlaScsIGhlaWdodCk7XG5cbiAgICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wO1xuXG4gICAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgd2lkdGggKyBtYXJnaW4ubGVmdCArIG1hcmdpbi5yaWdodClcbiAgICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICAvL2NyZWF0ZVN2Z0RlZnMoY2hhcnQpO1xuXG4gICAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyAobWFyZ2luLnRvcCkgKyAnKScpO1xuXG4gICAgICAgICAgICB0aXAgPSBkMy50aXAoKVxuICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZDMtdGlwJylcbiAgICAgICAgICAgICAgLm9mZnNldChbLTEwLCAwXSlcbiAgICAgICAgICAgICAgLmh0bWwoKGQsIGkpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnVpbGRIb3ZlcihkLCBpKTtcbiAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHN2Zy5jYWxsKHRpcCk7XG5cbiAgICAgICAgICAgIC8vIGEgcGxhY2Vob2xkZXIgZm9yIHRoZSBhbGVydHNcbiAgICAgICAgICAgIHN2Zy5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdhbGVydEhvbGRlcicpO1xuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gc2V0dXBGaWx0ZXJlZERhdGEoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pOiB2b2lkIHtcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgcGVhayA9IGQzLm1heChkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKSA/IChkLmF2ZyB8fCBkLnZhbHVlKSA6IDA7XG4gICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgICBtaW4gPSBkMy5taW4oZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyAoZC5hdmcgfHwgZC52YWx1ZSkgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vIGxldHMgYWRqdXN0IHRoZSBtaW4gYW5kIG1heCB0byBhZGQgc29tZSB2aXN1YWwgc3BhY2luZyBiZXR3ZWVuIGl0IGFuZCB0aGUgYXhlc1xuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbiA9IHVzZVplcm9NaW5WYWx1ZSA/IDAgOiBtaW4gKiAuOTU7XG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuXG4gICAgICAgICAgICAvLy8gY2hlY2sgaWYgd2UgbmVlZCB0byBhZGp1c3QgaGlnaC9sb3cgYm91bmQgdG8gZml0IGFsZXJ0IHZhbHVlXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSkge1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gTWF0aC5tYXgodmlzdWFsbHlBZGp1c3RlZE1heCwgYWxlcnRWYWx1ZSAqIDEuMik7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSBNYXRoLm1pbih2aXN1YWxseUFkanVzdGVkTWluLCBhbGVydFZhbHVlICogLjk1KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vIHVzZSBkZWZhdWx0IFkgc2NhbGUgaW4gY2FzZSBoaWdoIGFuZCBsb3cgYm91bmQgYXJlIDAgKGllLCBubyB2YWx1ZXMgb3IgYWxsIDApXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gISEhdmlzdWFsbHlBZGp1c3RlZE1heCAmJiAhISF2aXN1YWxseUFkanVzdGVkTWluID8gREVGQVVMVF9ZX1NDQUxFIDpcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBnZXRZU2NhbGUoKTogYW55IHtcbiAgICAgICAgICAgIHJldHVybiBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlUm91bmQoW21vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sIHZpc3VhbGx5QWRqdXN0ZWRNYXhdKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVTY2FsZShkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgbGV0IHhUaWNrcyA9IGRldGVybWluZVhBeGlzVGlja3NGcm9tU2NyZWVuV2lkdGgod2lkdGggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCksXG4gICAgICAgICAgICAgIHlUaWNrcyA9IGRldGVybWluZVlBeGlzVGlja3NGcm9tU2NyZWVuSGVpZ2h0KG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgICAgICBjaGFydERhdGEgPSBkYXRhUG9pbnRzO1xuXG4gICAgICAgICAgICAgIHNldHVwRmlsdGVyZWREYXRhKGRhdGFQb2ludHMpO1xuXG4gICAgICAgICAgICAgIHlTY2FsZSA9IGdldFlTY2FsZSgpO1xuXG4gICAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHlUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgICAgbGV0IHRpbWVTY2FsZU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgIGxldCB0aW1lU2NhbGVNYXg7XG4gICAgICAgICAgICAgIGlmIChmb3JlY2FzdERhdGFQb2ludHMgJiYgZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBmb3JlY2FzdERhdGFQb2ludHNbZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBkMy5tYXgoZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHRdKVxuICAgICAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt0aW1lU2NhbGVNaW4sIHRpbWVTY2FsZU1heF0pO1xuXG4gICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBzZXR1cEZpbHRlcmVkTXVsdGlEYXRhKG11bHRpRGF0YVBvaW50czogSU11bHRpRGF0YVBvaW50W10pOiBhbnkge1xuICAgICAgICAgICAgbGV0IGFsZXJ0UGVhazogbnVtYmVyLFxuICAgICAgICAgICAgICBoaWdoUGVhazogbnVtYmVyO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKSB7XG4gICAgICAgICAgICAgIGxldCBjdXJyZW50TWF4OiBudW1iZXIsXG4gICAgICAgICAgICAgICAgY3VycmVudE1pbjogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlcmllc01heDogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlcmllc01pbjogbnVtYmVyLFxuICAgICAgICAgICAgICAgIG1heExpc3Q6IG51bWJlcltdID0gW10sXG4gICAgICAgICAgICAgICAgbWluTGlzdDogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMuZm9yRWFjaCgoc2VyaWVzKSA9PiB7XG4gICAgICAgICAgICAgICAgY3VycmVudE1heCA9IGQzLm1heChzZXJpZXMudmFsdWVzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogZC5hdmc7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIG1heExpc3QucHVzaChjdXJyZW50TWF4KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50TWluID0gZDMubWluKHNlcmllcy52YWx1ZXMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyBkLmF2ZyA6IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIG1pbkxpc3QucHVzaChjdXJyZW50TWluKTtcblxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgc2VyaWVzTWF4ID0gZDMubWF4KG1heExpc3QpO1xuICAgICAgICAgICAgICBzZXJpZXNNaW4gPSBkMy5taW4obWluTGlzdCk7XG4gICAgICAgICAgICAgIHJldHVybiBbc2VyaWVzTWluLCBzZXJpZXNNYXhdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBtaW5NYXggPSBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKTtcbiAgICAgICAgICAgIHBlYWsgPSBtaW5NYXhbMV07XG4gICAgICAgICAgICBtaW4gPSBtaW5NYXhbMF07XG5cbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluIC0gKG1pbiAqIDAuMDUpO1xuICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgICAgYWxlcnRQZWFrID0gKGFsZXJ0VmFsdWUgKiAxLjIpO1xuICAgICAgICAgICAgICBoaWdoUGVhayA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IGFsZXJ0UGVhayA+IGhpZ2hQZWFrID8gYWxlcnRQZWFrIDogaGlnaFBlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sICEhIXZpc3VhbGx5QWRqdXN0ZWRNYXggJiYgISEhdmlzdWFsbHlBZGp1c3RlZE1pbiA/IERFRkFVTFRfWV9TQ0FMRSA6XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXhdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZU11bHRpU2NhbGUobXVsdGlEYXRhUG9pbnRzOiBJTXVsdGlEYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgY29uc3QgeFRpY2tzID0gZGV0ZXJtaW5lWEF4aXNUaWNrc0Zyb21TY3JlZW5XaWR0aCh3aWR0aCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0KSxcbiAgICAgICAgICAgICAgeVRpY2tzID0gZGV0ZXJtaW5lWEF4aXNUaWNrc0Zyb21TY3JlZW5XaWR0aChtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICBpZiAobXVsdGlEYXRhUG9pbnRzICYmIG11bHRpRGF0YVBvaW50c1swXSAmJiBtdWx0aURhdGFQb2ludHNbMF0udmFsdWVzKSB7XG5cbiAgICAgICAgICAgICAgbGV0IGxvd0hpZ2ggPSBzZXR1cEZpbHRlcmVkTXVsdGlEYXRhKG11bHRpRGF0YVBvaW50cyk7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSBsb3dIaWdoWzBdO1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gbG93SGlnaFsxXTtcblxuICAgICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAgIC5yYW5nZVJvdW5kKFttb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsIDBdKVxuICAgICAgICAgICAgICAgIC5kb21haW4oW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sIHZpc3VhbGx5QWRqdXN0ZWRNYXhdKTtcblxuICAgICAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAgIC50aWNrcyh5VGlja3MpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodF0pXG4gICAgICAgICAgICAgICAgLmRvbWFpbihbZDMubWluKG11bHRpRGF0YVBvaW50cywgKGQpID0+IGQzLm1pbihkLnZhbHVlcywgKHApID0+IHAudGltZXN0YW1wKSksXG4gICAgICAgICAgICAgICAgICBkMy5tYXgobXVsdGlEYXRhUG9pbnRzLCAoZCkgPT4gZDMubWF4KGQudmFsdWVzLCAocCkgPT4gcC50aW1lc3RhbXApKV0pO1xuXG4gICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvKipcbiAgICAgICAgICAgKiBMb2FkIG1ldHJpY3MgZGF0YSBkaXJlY3RseSBmcm9tIGEgcnVubmluZyBIYXdrdWxhci1NZXRyaWNzIHNlcnZlclxuICAgICAgICAgICAqIEBwYXJhbSB1cmxcbiAgICAgICAgICAgKiBAcGFyYW0gbWV0cmljSWRcbiAgICAgICAgICAgKiBAcGFyYW0gc3RhcnRUaW1lc3RhbXBcbiAgICAgICAgICAgKiBAcGFyYW0gZW5kVGltZXN0YW1wXG4gICAgICAgICAgICogQHBhcmFtIGJ1Y2tldHNcbiAgICAgICAgICAgKi9cbiAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UodXJsOiBVcmxUeXBlLFxuICAgICAgICAgICAgbWV0cmljSWQ6IE1ldHJpY0lkLFxuICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgICAgICAgIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgICAgICAgYnVja2V0cyA9IDYwKSB7XG5cbiAgICAgICAgICAgIGxldCByZXF1ZXN0Q29uZmlnOiBuZy5JUmVxdWVzdENvbmZpZyA9IDxhbnk+e1xuICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0hhd2t1bGFyLVRlbmFudCc6IG1ldHJpY1RlbmFudElkXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBlbmQ6IGVuZFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBidWNrZXRzOiBidWNrZXRzXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzdGFydFRpbWVzdGFtcCA+PSBlbmRUaW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgJGxvZy5sb2coJ1N0YXJ0IGRhdGUgd2FzIGFmdGVyIGVuZCBkYXRlJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh1cmwgJiYgbWV0cmljVHlwZSAmJiBtZXRyaWNJZCkge1xuXG4gICAgICAgICAgICAgIGxldCBtZXRyaWNUeXBlQW5kRGF0YSA9IG1ldHJpY1R5cGUuc3BsaXQoJy0nKTtcbiAgICAgICAgICAgICAgLy8vIHNhbXBsZSB1cmw6XG4gICAgICAgICAgICAgIC8vLyBodHRwOi8vbG9jYWxob3N0OjgwODAvaGF3a3VsYXIvbWV0cmljcy9nYXVnZXMvNDViMjI1NmVmZjE5Y2I5ODI1NDJiMTY3YjM5NTcwMzYuc3RhdHVzLmR1cmF0aW9uL2RhdGE/XG4gICAgICAgICAgICAgIC8vIGJ1Y2tldHM9MTIwJmVuZD0xNDM2ODMxNzk3NTMzJnN0YXJ0PTE0MzY4MjgxOTc1MzMnXG4gICAgICAgICAgICAgICRodHRwLmdldCh1cmwgKyAnLycgKyBtZXRyaWNUeXBlQW5kRGF0YVswXSArICdzLycgKyBtZXRyaWNJZCArICcvJyArIChtZXRyaWNUeXBlQW5kRGF0YVsxXSB8fCAnZGF0YScpLFxuICAgICAgICAgICAgICAgIHJlcXVlc3RDb25maWcpLnN1Y2Nlc3MoKHJlc3BvbnNlKSA9PiB7XG5cbiAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcblxuICAgICAgICAgICAgICAgIH0pLmVycm9yKChyZWFzb24sIHN0YXR1cykgPT4ge1xuICAgICAgICAgICAgICAgICAgJGxvZy5lcnJvcignRXJyb3IgTG9hZGluZyBDaGFydCBEYXRhOicgKyBzdGF0dXMgKyAnLCAnICsgcmVhc29uKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8qKlxuICAgICAgICAgICAqIFRyYW5zZm9ybSB0aGUgcmF3IGh0dHAgcmVzcG9uc2UgZnJvbSBNZXRyaWNzIHRvIG9uZSB1c2FibGUgaW4gY2hhcnRzXG4gICAgICAgICAgICogQHBhcmFtIHJlc3BvbnNlXG4gICAgICAgICAgICogQHJldHVybnMgdHJhbnNmb3JtZWQgcmVzcG9uc2UgdG8gSUNoYXJ0RGF0YVBvaW50W10sIHJlYWR5IHRvIGJlIGNoYXJ0ZWRcbiAgICAgICAgICAgKi9cbiAgICAgICAgICBmdW5jdGlvbiBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTogSUNoYXJ0RGF0YVBvaW50W10ge1xuICAgICAgICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UubWFwKChwb2ludDogSUNoYXJ0RGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiB0aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgICBkYXRlOiBuZXcgRGF0ZSh0aW1lc3RhbXApLFxuICAgICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgYXZnOiAocG9pbnQuZW1wdHkpID8gdW5kZWZpbmVkIDogcG9pbnQuYXZnLFxuICAgICAgICAgICAgICAgICAgbWluOiAhYW5ndWxhci5pc051bWJlcihwb2ludC5taW4pID8gdW5kZWZpbmVkIDogcG9pbnQubWluLFxuICAgICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgICAgZW1wdHk6IHBvaW50LmVtcHR5XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYnVpbGRIb3ZlcihkOiBJQ2hhcnREYXRhUG9pbnQsIGk6IG51bWJlcikge1xuICAgICAgICAgICAgbGV0IGhvdmVyLFxuICAgICAgICAgICAgICBwcmV2VGltZXN0YW1wLFxuICAgICAgICAgICAgICBjdXJyZW50VGltZXN0YW1wID0gZC50aW1lc3RhbXAsXG4gICAgICAgICAgICAgIGJhckR1cmF0aW9uLFxuICAgICAgICAgICAgICBmb3JtYXR0ZWREYXRlVGltZSA9IG1vbWVudChkLnRpbWVzdGFtcCkuZm9ybWF0KEhPVkVSX0RBVEVfVElNRV9GT1JNQVQpO1xuXG4gICAgICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgcHJldlRpbWVzdGFtcCA9IGNoYXJ0RGF0YVtpIC0gMV0udGltZXN0YW1wO1xuICAgICAgICAgICAgICBiYXJEdXJhdGlvbiA9IG1vbWVudChjdXJyZW50VGltZXN0YW1wKS5mcm9tKG1vbWVudChwcmV2VGltZXN0YW1wKSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0VtcHR5RGF0YVBvaW50KGQpKSB7XG4gICAgICAgICAgICAgIC8vIG5vZGF0YVxuICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICA8c21hbGwgY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtub0RhdGFMYWJlbH08L3NtYWxsPlxuICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7ZHVyYXRpb25MYWJlbH08L3NwYW4+PHNwYW4+OlxuICAgICAgICAgICAgICAgIDwvc3Bhbj48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2JhckR1cmF0aW9ufTwvc3Bhbj48L3NtYWxsPiA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8aHIvPlxuICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7dGltZXN0YW1wTGFiZWx9PC9zcGFuPjxzcGFuPjpcbiAgICAgICAgICAgICAgICA8L3NwYW4+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtmb3JtYXR0ZWREYXRlVGltZX08L3NwYW4+PC9zbWFsbD48L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKGlzUmF3TWV0cmljKGQpKSB7XG4gICAgICAgICAgICAgICAgLy8gcmF3IHNpbmdsZSB2YWx1ZSBmcm9tIHJhdyB0YWJsZVxuICAgICAgICAgICAgICAgIGhvdmVyID0gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7dGltZXN0YW1wTGFiZWx9PC9zcGFuPjxzcGFuPjogPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7Zm9ybWF0dGVkRGF0ZVRpbWV9PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2R1cmF0aW9uTGFiZWx9PC9zcGFuPjxzcGFuPjogPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+PC9zbWFsbD48L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDxoci8+XG4gICAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3NpbmdsZVZhbHVlTGFiZWx9PC9zcGFuPjxzcGFuPjogPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLnZhbHVlLCAyKX08L3NwYW4+PC9zbWFsbD4gPC9kaXY+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj4gYDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBhZ2dyZWdhdGUgd2l0aCBtaW4vYXZnL21heFxuICAgICAgICAgICAgICAgIGhvdmVyID0gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7dGltZXN0YW1wTGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSBiZWZvcmUtc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2R1cmF0aW9uTGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2JhckR1cmF0aW9ufTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSBzZXBhcmF0b3InPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7bWF4TGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QzLnJvdW5kKGQubWF4LCAyKX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7YXZnTGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QzLnJvdW5kKGQuYXZnLCAyKX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7bWluTGFiZWx9Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QzLnJvdW5kKGQubWluLCAyKX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPC9kaXY+IGA7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBob3ZlcjtcblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZU11bHRpTGluZUNoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zKSB7XG4gICAgICAgICAgICBsZXQgY29sb3JTY2FsZSA9IGQzLnNjYWxlLmNhdGVnb3J5MTAoKSxcbiAgICAgICAgICAgICAgZyA9IDA7XG5cbiAgICAgICAgICAgIGlmIChjaGFydE9wdGlvbnMubXVsdGlDaGFydERhdGEpIHtcbiAgICAgICAgICAgICAgLy8gYmVmb3JlIHVwZGF0aW5nLCBsZXQncyByZW1vdmUgdGhvc2UgbWlzc2luZyBmcm9tIGRhdGFwb2ludHMgKGlmIGFueSlcbiAgICAgICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncGF0aFtpZF49XFwnbXVsdGlMaW5lXFwnXScpWzBdLmZvckVhY2goKGV4aXN0aW5nUGF0aDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHN0aWxsRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICBzaW5nbGVDaGFydERhdGEua2V5SGFzaCA9IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoXG4gICAgICAgICAgICAgICAgICAgIHx8ICgnbXVsdGlMaW5lJyArIGhhc2hTdHJpbmcoc2luZ2xlQ2hhcnREYXRhLmtleSkpO1xuICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nUGF0aC5nZXRBdHRyaWJ1dGUoJ2lkJykgPT09IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0aWxsRXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoIXN0aWxsRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICBleGlzdGluZ1BhdGgucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMuZm9yRWFjaCgoc2luZ2xlQ2hhcnREYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoc2luZ2xlQ2hhcnREYXRhICYmIHNpbmdsZUNoYXJ0RGF0YS52YWx1ZXMpIHtcbiAgICAgICAgICAgICAgICAgIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoID0gc2luZ2xlQ2hhcnREYXRhLmtleUhhc2hcbiAgICAgICAgICAgICAgICAgICAgfHwgKCdtdWx0aUxpbmUnICsgaGFzaFN0cmluZyhzaW5nbGVDaGFydERhdGEua2V5KSk7XG4gICAgICAgICAgICAgICAgICBsZXQgcGF0aE11bHRpTGluZSA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGgjJyArIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKVxuICAgICAgICAgICAgICAgICAgICAuZGF0YShbc2luZ2xlQ2hhcnREYXRhLnZhbHVlc10pO1xuICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgICAgICBwYXRoTXVsdGlMaW5lLmF0dHIoJ2lkJywgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2gpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdtdWx0aUxpbmUnKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignZmlsbCcsICdub25lJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2luZ2xlQ2hhcnREYXRhLmNvbG9yIHx8IGNvbG9yU2NhbGUoZysrKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUxpbmUoJ2xpbmVhcicpKTtcbiAgICAgICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICAgICAgcGF0aE11bHRpTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdpZCcsIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbXVsdGlMaW5lJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnbm9uZScpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgaWYgKHNpbmdsZUNoYXJ0RGF0YS5jb2xvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNpbmdsZUNoYXJ0RGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbG9yU2NhbGUoZysrKTtcbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVMaW5lKCdsaW5lYXInKSk7XG4gICAgICAgICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAkbG9nLndhcm4oJ05vIG11bHRpLWRhdGEgc2V0IGZvciBtdWx0aWxpbmUgY2hhcnQnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVlBeGlzR3JpZExpbmVzKCkge1xuICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSB5IGF4aXMgZ3JpZCBsaW5lc1xuICAgICAgICAgICAgY29uc3QgbnVtYmVyT2ZZQXhpc0dyaWRMaW5lcyA9IGRldGVybWluZVlBeGlzR3JpZExpbmVUaWNrc0Zyb21TY3JlZW5IZWlnaHQobW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgICAgeVNjYWxlID0gZ2V0WVNjYWxlKCk7XG5cbiAgICAgICAgICAgIGlmICh5U2NhbGUpIHtcbiAgICAgICAgICAgICAgbGV0IHlBeGlzID0gc3ZnLnNlbGVjdEFsbCgnZy5ncmlkLnlfZ3JpZCcpO1xuICAgICAgICAgICAgICBpZiAoIXlBeGlzWzBdLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHlBeGlzID0gc3ZnLmFwcGVuZCgnZycpLmNsYXNzZWQoJ2dyaWQgeV9ncmlkJywgdHJ1ZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgeUF4aXNcbiAgICAgICAgICAgICAgICAuY2FsbChkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpXG4gICAgICAgICAgICAgICAgICAudGlja3MobnVtYmVyT2ZZQXhpc0dyaWRMaW5lcylcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSgtd2lkdGgsIDApXG4gICAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCgnJylcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgICAgZnVuY3Rpb24gYXhpc1RyYW5zaXRpb24oc2VsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAuZGVsYXkoMjUwKVxuICAgICAgICAgICAgICAgIC5kdXJhdGlvbig3NTApXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAxLjApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoeUF4aXMpIHtcblxuICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgICAgICAvKiB0c2xpbnQ6ZGlzYWJsZTpuby11bnVzZWQtdmFyaWFibGUgKi9cblxuICAgICAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgICAgIGxldCB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwnICsgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ICsgJyknKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgIC5jYWxsKHhBeGlzKVxuICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcblxuICAgICAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgICAgIGxldCB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgLmNhbGwoeUF4aXMpXG4gICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuXG4gICAgICAgICAgICAgIGxldCB5QXhpc0xhYmVsID0gc3ZnLnNlbGVjdEFsbCgnLnlBeGlzVW5pdHNMYWJlbCcpO1xuICAgICAgICAgICAgICBpZiAobW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID49IDE1MCAmJiBhdHRycy55QXhpc1VuaXRzKSB7XG4gICAgICAgICAgICAgICAgeUF4aXNMYWJlbCA9IHN2Zy5hcHBlbmQoJ3RleHQnKS5hdHRyKCdjbGFzcycsICd5QXhpc1VuaXRzTGFiZWwnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICdyb3RhdGUoLTkwKSx0cmFuc2xhdGUoLTIwLC01MCknKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3gnLCAtbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0IC8gMilcbiAgICAgICAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnY2VudGVyJylcbiAgICAgICAgICAgICAgICAgIC50ZXh0KGF0dHJzLnlBeGlzVW5pdHMgPT09ICdOT05FJyA/ICcnIDogYXR0cnMueUF4aXNVbml0cylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVDZW50ZXJlZExpbmUobmV3SW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAgICAgICAuZGVmaW5lZCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnkoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBsaW5lO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUxpbmUobmV3SW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAgICAgICAuZGVmaW5lZCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnkoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBsaW5lO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUF2Z0xpbmVzKCkge1xuICAgICAgICAgICAgaWYgKGNoYXJ0VHlwZSA9PT0gJ2JhcicgfHwgY2hhcnRUeXBlID09PSAnc2NhdHRlcmxpbmUnKSB7XG4gICAgICAgICAgICAgIGxldCBwYXRoQXZnTGluZSA9IHN2Zy5zZWxlY3RBbGwoJy5iYXJBdmdMaW5lJykuZGF0YShbY2hhcnREYXRhXSk7XG4gICAgICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgICAgICBwYXRoQXZnTGluZS5hdHRyKCdjbGFzcycsICdiYXJBdmdMaW5lJylcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUNlbnRlcmVkTGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICBwYXRoQXZnTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JhckF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlQ2VudGVyZWRMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLnNlbGVjdEFsbCgnZy5icnVzaCcpO1xuICAgICAgICAgICAgaWYgKGJydXNoR3JvdXAuZW1wdHkoKSkge1xuICAgICAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2JydXNoJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJydXNoID0gZDMuc3ZnLmJydXNoKClcbiAgICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgICAub24oJ2JydXNoZW5kJywgYnJ1c2hFbmQpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBicnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGJydXNoRW5kKCkge1xuICAgICAgICAgICAgICBsZXQgZXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMF0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMV0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgICAvLyBpZ25vcmUgcmFuZ2Ugc2VsZWN0aW9ucyBsZXNzIHRoYW4gMSBtaW51dGVcbiAgICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IFtdO1xuXG4gICAgICAgICAgICAgICAgbGV0IGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zID0gbmV3IENoYXJ0T3B0aW9ucyhzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCBjaGFydERhdGEsIG11bHRpRGF0YVBvaW50cyxcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgaGVpZ2h0LCB0aXAsIHZpc3VhbGx5QWRqdXN0ZWRNYXgsXG4gICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcywgaW50ZXJwb2xhdGlvbik7XG5cbiAgICAgICAgICAgICAgICBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YVBvaW50cywgY2hhcnRPcHRpb25zKTtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBleHRlbnQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIGNsZWFyIHRoZSBicnVzaCBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlUHJldmlvdXNSYW5nZU92ZXJsYXkocHJldlJhbmdlRGF0YSkge1xuICAgICAgICAgICAgaWYgKHByZXZSYW5nZURhdGEpIHtcbiAgICAgICAgICAgICAgc3ZnLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgLmRhdHVtKHByZXZSYW5nZURhdGEpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ByZXZSYW5nZUF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgIC5zdHlsZSgnc3Ryb2tlLWRhc2hhcnJheScsICgnOSwzJykpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVDZW50ZXJlZExpbmUoJ2xpbmVhcicpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGFubm90YXRlQ2hhcnQoYW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgIGlmIChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCcuYW5ub3RhdGlvbkRvdCcpXG4gICAgICAgICAgICAgICAgLmRhdGEoYW5ub3RhdGlvbkRhdGEpXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhbm5vdGF0aW9uRG90JylcbiAgICAgICAgICAgICAgICAuYXR0cigncicsIDUpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2N5JywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGhlaWdodCAtIHlTY2FsZSh2aXN1YWxseUFkanVzdGVkTWF4KTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5zdHlsZSgnZmlsbCcsIChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoZC5zZXZlcml0eSA9PT0gJzEnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZC5zZXZlcml0eSA9PT0gJzInKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAneWVsbG93JztcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnd2hpdGUnO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSwgb2xkRGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld0RhdGEgfHwgb2xkRGF0YSkge1xuICAgICAgICAgICAgICBwcm9jZXNzZWROZXdEYXRhID0gYW5ndWxhci5mcm9tSnNvbihuZXdEYXRhIHx8IFtdKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdtdWx0aURhdGEnLCAobmV3TXVsdGlEYXRhLCBvbGRNdWx0aURhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdNdWx0aURhdGEgfHwgb2xkTXVsdGlEYXRhKSB7XG4gICAgICAgICAgICAgIG11bHRpRGF0YVBvaW50cyA9IGFuZ3VsYXIuZnJvbUpzb24obmV3TXVsdGlEYXRhIHx8IFtdKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdwcmV2aW91c1JhbmdlRGF0YScsIChuZXdQcmV2aW91c1JhbmdlVmFsdWVzKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3UHJldmlvdXNSYW5nZVZhbHVlcykge1xuICAgICAgICAgICAgICAvLyRsb2cuZGVidWcoJ1ByZXZpb3VzIFJhbmdlIGRhdGEgY2hhbmdlZCcpO1xuICAgICAgICAgICAgICBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24obmV3UHJldmlvdXNSYW5nZVZhbHVlcyk7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgnYW5ub3RhdGlvbkRhdGEnLCAobmV3QW5ub3RhdGlvbkRhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdBbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24obmV3QW5ub3RhdGlvbkRhdGEpO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ2ZvcmVjYXN0RGF0YScsIChuZXdGb3JlY2FzdERhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdGb3JlY2FzdERhdGEpIHtcbiAgICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gYW5ndWxhci5mcm9tSnNvbihuZXdGb3JlY2FzdERhdGEpO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ2FsZXJ0VmFsdWUnLCAnY2hhcnRUeXBlJywgJ2hpZGVIaWdoTG93VmFsdWVzJywgJ3VzZVplcm9NaW5WYWx1ZScsICdzaG93QXZnTGluZSddLFxuICAgICAgICAgICAgKGNoYXJ0QXR0cnMpID0+IHtcbiAgICAgICAgICAgICAgYWxlcnRWYWx1ZSA9IGNoYXJ0QXR0cnNbMF0gfHwgYWxlcnRWYWx1ZTtcbiAgICAgICAgICAgICAgY2hhcnRUeXBlID0gY2hhcnRBdHRyc1sxXSB8fCBjaGFydFR5cGU7XG4gICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzID0gKHR5cGVvZiBjaGFydEF0dHJzWzJdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzJdIDogaGlkZUhpZ2hMb3dWYWx1ZXM7XG4gICAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZSA9ICh0eXBlb2YgY2hhcnRBdHRyc1szXSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1szXSA6IHVzZVplcm9NaW5WYWx1ZTtcbiAgICAgICAgICAgICAgc2hvd0F2Z0xpbmUgPSAodHlwZW9mIGNoYXJ0QXR0cnNbNF0gIT09ICd1bmRlZmluZWQnKSA/IGNoYXJ0QXR0cnNbNF0gOiBzaG93QXZnTGluZTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93KCkge1xuICAgICAgICAgICAgZW5kVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gbW9tZW50KCkuc3VidHJhY3QodGltZVJhbmdlSW5TZWNvbmRzLCAnc2Vjb25kcycpLnZhbHVlT2YoKTtcbiAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc0ZvclRpbWVSYW5nZShkYXRhVXJsLCBtZXRyaWNJZCwgc3RhcnRUaW1lc3RhbXAsIGVuZFRpbWVzdGFtcCwgNjApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vLyBzdGFuZGFsb25lIGNoYXJ0cyBhdHRyaWJ1dGVzXG4gICAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydtZXRyaWNVcmwnLCAnbWV0cmljSWQnLCAnbWV0cmljVHlwZScsICdtZXRyaWNUZW5hbnRJZCcsICd0aW1lUmFuZ2VJblNlY29uZHMnXSxcbiAgICAgICAgICAgIChzdGFuZEFsb25lUGFyYW1zKSA9PiB7XG4gICAgICAgICAgICAgIGRhdGFVcmwgPSBzdGFuZEFsb25lUGFyYW1zWzBdIHx8IGRhdGFVcmw7XG4gICAgICAgICAgICAgIG1ldHJpY0lkID0gc3RhbmRBbG9uZVBhcmFtc1sxXSB8fCBtZXRyaWNJZDtcbiAgICAgICAgICAgICAgbWV0cmljVHlwZSA9IHN0YW5kQWxvbmVQYXJhbXNbMl0gfHwgbWV0cmljSWQ7XG4gICAgICAgICAgICAgIG1ldHJpY1RlbmFudElkID0gc3RhbmRBbG9uZVBhcmFtc1szXSB8fCBtZXRyaWNUZW5hbnRJZDtcbiAgICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzID0gc3RhbmRBbG9uZVBhcmFtc1s0XSB8fCB0aW1lUmFuZ2VJblNlY29uZHM7XG4gICAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc1RpbWVSYW5nZUZyb21Ob3coKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdyZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMnLCAobmV3UmVmcmVzaEludGVydmFsKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3UmVmcmVzaEludGVydmFsKSB7XG4gICAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyA9ICtuZXdSZWZyZXNoSW50ZXJ2YWw7XG4gICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc3RhcnRJbnRlcnZhbFByb21pc2UpO1xuICAgICAgICAgICAgICBzdGFydEludGVydmFsUHJvbWlzZSA9ICRpbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdygpO1xuICAgICAgICAgICAgICB9LCByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgKiAxMDAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiRvbignJGRlc3Ryb3knLCAoKSA9PiB7XG4gICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHN0YXJ0SW50ZXJ2YWxQcm9taXNlKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiRvbignRGF0ZVJhbmdlRHJhZ0NoYW5nZWQnLCAoZXZlbnQsIGV4dGVudCkgPT4ge1xuICAgICAgICAgICAgc2NvcGUuJGVtaXQoJ0dyYXBoVGltZVJhbmdlQ2hhbmdlZEV2ZW50JywgZXh0ZW50KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZUNoYXJ0VHlwZUFuZERyYXcoY2hhcnRUeXBlOiBzdHJpbmcsIGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zKSB7XG5cbiAgICAgICAgICAgIC8vQHRvZG86IGFkZCBpbiBtdWx0aWxpbmUgYW5kIHJocWJhciBjaGFydCB0eXBlc1xuICAgICAgICAgICAgLy9AdG9kbzogYWRkIHZhbGlkYXRpb24gaWYgbm90IGluIHZhbGlkIGNoYXJ0IHR5cGVzXG4gICAgICAgICAgICBjaGFydFR5cGVzLmZvckVhY2goKGFDaGFydFR5cGUpID0+IHtcbiAgICAgICAgICAgICAgaWYgKGFDaGFydFR5cGUubmFtZSA9PT0gY2hhcnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgYUNoYXJ0VHlwZS5kcmF3Q2hhcnQoY2hhcnRPcHRpb25zKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50cykgPT4ge1xuICAgICAgICAgICAgLy8gaWYgd2UgZG9uJ3QgaGF2ZSBkYXRhLCBkb24ndCBib3RoZXIuLlxuICAgICAgICAgICAgaWYgKCFkYXRhUG9pbnRzICYmICFtdWx0aURhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZGVidWcpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5ncm91cCgnUmVuZGVyIENoYXJ0Jyk7XG4gICAgICAgICAgICAgIGNvbnNvbGUudGltZSgnY2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgcmVzaXplKCk7XG5cbiAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgIGRldGVybWluZVNjYWxlKGRhdGFQb2ludHMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy9tdWx0aURhdGFQb2ludHMgZXhpc3RcbiAgICAgICAgICAgICAgZGV0ZXJtaW5lTXVsdGlTY2FsZShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgY2hhcnRPcHRpb25zOiBDaGFydE9wdGlvbnMgPSBuZXcgQ2hhcnRPcHRpb25zKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIGNoYXJ0RGF0YSwgbXVsdGlEYXRhUG9pbnRzLFxuICAgICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsIGhlaWdodCwgdGlwLCB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcywgaW50ZXJwb2xhdGlvbik7XG5cbiAgICAgICAgICAgIGlmIChhbGVydFZhbHVlICYmIChhbGVydFZhbHVlID4gdmlzdWFsbHlBZGp1c3RlZE1pbiAmJiBhbGVydFZhbHVlIDwgdmlzdWFsbHlBZGp1c3RlZE1heCkpIHtcbiAgICAgICAgICAgICAgY3JlYXRlQWxlcnRCb3VuZHNBcmVhKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgICAgICBjaGFydERhdGEsIGFsZXJ0VmFsdWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjcmVhdGVYQXhpc0JydXNoKCk7XG4gICAgICAgICAgICBjcmVhdGVZQXhpc0dyaWRMaW5lcygpO1xuICAgICAgICAgICAgZGV0ZXJtaW5lQ2hhcnRUeXBlQW5kRHJhdyhjaGFydFR5cGUsIGNoYXJ0T3B0aW9ucyk7XG5cbiAgICAgICAgICAgIGlmIChzaG93RGF0YVBvaW50cykge1xuICAgICAgICAgICAgICBjcmVhdGVEYXRhUG9pbnRzKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIHRpcCwgY2hhcnREYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNyZWF0ZVByZXZpb3VzUmFuZ2VPdmVybGF5KHByZXZpb3VzUmFuZ2VEYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIGNyZWF0ZVhhbmRZQXhlcygpO1xuICAgICAgICAgICAgaWYgKHNob3dBdmdMaW5lKSB7XG4gICAgICAgICAgICAgIGNyZWF0ZUF2Z0xpbmVzKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhbGVydFZhbHVlICYmIChhbGVydFZhbHVlID4gdmlzdWFsbHlBZGp1c3RlZE1pbiAmJiBhbGVydFZhbHVlIDwgdmlzdWFsbHlBZGp1c3RlZE1heCkpIHtcbiAgICAgICAgICAgICAgLy8vIE5PVEU6IHRoaXMgYWxlcnQgbGluZSBoYXMgaGlnaGVyIHByZWNlZGVuY2UgZnJvbSBhbGVydCBhcmVhIGFib3ZlXG4gICAgICAgICAgICAgIGNyZWF0ZUFsZXJ0TGluZShzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCBjaGFydERhdGEsIGFsZXJ0VmFsdWUsICdhbGVydExpbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgIGFubm90YXRlQ2hhcnQoYW5ub3RhdGlvbkRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZvcmVjYXN0RGF0YVBvaW50cyAmJiBmb3JlY2FzdERhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YVBvaW50cywgY2hhcnRPcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICBjb25zb2xlLnRpbWVFbmQoJ2NoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGxpbms6IGxpbmssXG4gICAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgICByZXBsYWNlOiB0cnVlLFxuICAgICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICBkYXRhOiAnPScsXG4gICAgICAgICAgICBtdWx0aURhdGE6ICc9JyxcbiAgICAgICAgICAgIGZvcmVjYXN0RGF0YTogJz0nLFxuICAgICAgICAgICAgbWV0cmljVXJsOiAnQCcsXG4gICAgICAgICAgICBtZXRyaWNJZDogJ0AnLFxuICAgICAgICAgICAgbWV0cmljVHlwZTogJ0AnLFxuICAgICAgICAgICAgbWV0cmljVGVuYW50SWQ6ICdAJyxcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgICAgICAgIHRpbWVSYW5nZUluU2Vjb25kczogJ0AnLFxuICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzOiAnQCcsXG4gICAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YTogJ0AnLFxuICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGE6ICdAJyxcbiAgICAgICAgICAgIHNob3dEYXRhUG9pbnRzOiAnPScsXG4gICAgICAgICAgICBhbGVydFZhbHVlOiAnQCcsXG4gICAgICAgICAgICBpbnRlcnBvbGF0aW9uOiAnQCcsXG4gICAgICAgICAgICBjaGFydFR5cGU6ICdAJyxcbiAgICAgICAgICAgIHlBeGlzVW5pdHM6ICdAJyxcbiAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZTogJz0nLFxuICAgICAgICAgICAgY2hhcnRIb3ZlckRhdGVGb3JtYXQ6ICdAJyxcbiAgICAgICAgICAgIGNoYXJ0SG92ZXJUaW1lRm9ybWF0OiAnQCcsXG4gICAgICAgICAgICBzaW5nbGVWYWx1ZUxhYmVsOiAnQCcsXG4gICAgICAgICAgICBub0RhdGFMYWJlbDogJ0AnLFxuICAgICAgICAgICAgZHVyYXRpb25MYWJlbDogJ0AnLFxuICAgICAgICAgICAgbWluTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIG1heExhYmVsOiAnQCcsXG4gICAgICAgICAgICBhdmdMYWJlbDogJ0AnLFxuICAgICAgICAgICAgdGltZXN0YW1wTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIHNob3dBdmdMaW5lOiAnPScsXG4gICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlczogJz0nXG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgXVxuICAgIClcbiAgICA7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8vIFR5cGUgdmFsdWVzIGFuZCBJRCB0eXBlc1xuICBleHBvcnQgdHlwZSBBbGVydFRocmVzaG9sZCA9IG51bWJlcjtcbiAgZXhwb3J0IHR5cGUgVGltZUluTWlsbGlzID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBVcmxUeXBlID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBNZXRyaWNJZCA9IHN0cmluZztcbiAgZXhwb3J0IHR5cGUgTWV0cmljVmFsdWUgPSBudW1iZXI7XG5cbiAgLyoqXG4gICAqIE1ldHJpY3MgUmVzcG9uc2UgZnJvbSBIYXdrdWxhciBNZXRyaWNzXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNZXRyaWNzUmVzcG9uc2VEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBUaW1lSW5NaWxsaXM7XG4gICAgZW5kOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIG1pbj86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBtYXg/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgbWVkaWFuPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIHBlcmNlbnRpbGU5NXRoPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIGVtcHR5OiBib29sZWFuO1xuICB9XG5cbiAgLyoqXG4gICAqIFNpbXBsZXN0IE1ldHJpYyBkYXRhIHR5cGVcbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZU1ldHJpYyB7XG4gICAgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU6IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgLyoqXG4gICAqIERhdGEgZm9yIHByZWRpY3RpdmUgJ2NvbmUnXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElQcmVkaWN0aXZlTWV0cmljIGV4dGVuZHMgSVNpbXBsZU1ldHJpYyB7XG4gICAgbWluPzogTWV0cmljVmFsdWU7XG4gICAgbWF4PzogTWV0cmljVmFsdWU7XG4gIH1cblxuICBleHBvcnQgaW50ZXJmYWNlIElCYXNlQ2hhcnREYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDogVGltZUluTWlsbGlzO1xuICAgIHN0YXJ0PzogVGltZUluTWlsbGlzO1xuICAgIGVuZD86IFRpbWVJbk1pbGxpcztcbiAgICB2YWx1ZT86IE1ldHJpY1ZhbHVlOyAvLy8gT25seSBmb3IgUmF3IGRhdGEgKG5vIGJ1Y2tldHMgb3IgYWdncmVnYXRlcylcbiAgICBhdmc6IE1ldHJpY1ZhbHVlOyAvLy8gbW9zdCBvZiB0aGUgdGltZSB0aGlzIGlzIHRoZSB1c2VmdWwgdmFsdWUgZm9yIGFnZ3JlZ2F0ZXNcbiAgICBlbXB0eTogYm9vbGVhbjsgLy8vIHdpbGwgc2hvdyB1cCBpbiB0aGUgY2hhcnQgYXMgYmxhbmsgLSBzZXQgdGhpcyB3aGVuIHlvdSBoYXZlIE5hTlxuICB9XG5cbiAgLyoqXG4gICAqIFJlcHJlc2VudGF0aW9uIG9mIGRhdGEgcmVhZHkgdG8gYmUgY29uc3VtZWQgYnkgY2hhcnRzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQ2hhcnREYXRhUG9pbnQgZXh0ZW5kcyBJQmFzZUNoYXJ0RGF0YVBvaW50IHtcbiAgICBkYXRlPzogRGF0ZTtcbiAgICBtaW46IE1ldHJpY1ZhbHVlO1xuICAgIG1heDogTWV0cmljVmFsdWU7XG4gICAgcGVyY2VudGlsZTk1dGg6IE1ldHJpY1ZhbHVlO1xuICAgIG1lZGlhbjogTWV0cmljVmFsdWU7XG4gIH1cblxuICAvKipcbiAgICogRGF0YSBzdHJ1Y3R1cmUgZm9yIGEgTXVsdGktTWV0cmljIGNoYXJ0LiBDb21wb3NlZCBvZiBJQ2hhcnREYXRhRGF0YVBvaW50W10uXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNdWx0aURhdGFQb2ludCB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAga2V5SGFzaD86IHN0cmluZzsgLy8gZm9yIHVzaW5nIGFzIHZhbGlkIGh0bWwgaWRcbiAgICBjb2xvcj86IHN0cmluZzsgLy8vICNmZmZlZWVcbiAgICB2YWx1ZXM6IElDaGFydERhdGFQb2ludFtdO1xuICB9XG5cbiAgLyoqXG4gICAqXG4gICAqL1xuICBleHBvcnQgY2xhc3MgQ2hhcnRPcHRpb25zIHtcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgc3ZnOiBhbnksXG4gICAgICBwdWJsaWMgdGltZVNjYWxlOiBhbnksXG4gICAgICBwdWJsaWMgeVNjYWxlOiBhbnksXG4gICAgICBwdWJsaWMgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICAgIHB1YmxpYyBtdWx0aUNoYXJ0RGF0YTogSU11bHRpRGF0YVBvaW50W10sXG4gICAgICBwdWJsaWMgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0OiBudW1iZXIsXG4gICAgICBwdWJsaWMgaGVpZ2h0OiBudW1iZXIsXG4gICAgICBwdWJsaWMgdGlwPzogYW55LFxuICAgICAgcHVibGljIHZpc3VhbGx5QWRqdXN0ZWRNYXg/OiBudW1iZXIsXG4gICAgICBwdWJsaWMgaGlkZUhpZ2hMb3dWYWx1ZXM/OiBib29sZWFuLFxuICAgICAgcHVibGljIGludGVycG9sYXRpb24/OiBzdHJpbmcpIHtcbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvKiB0c2xpbnQ6ZGlzYWJsZTpuby1iaXR3aXNlICovXG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJXaWR0aCh3aWR0aDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciwgYmFyT2Zmc2V0ID0gQkFSX09GRlNFVCkge1xuICAgIHJldHVybiAod2lkdGggLyBsZW5ndGggLSBiYXJPZmZzZXQpO1xuICB9XG5cbiAgLy8gQ2FsY3VsYXRlcyB0aGUgYmFyIHdpZHRoIGFkanVzdGVkIHNvIHRoYXQgdGhlIGZpcnN0IGFuZCBsYXN0IGFyZSBoYWxmLXdpZHRoIG9mIHRoZSBvdGhlcnNcbiAgLy8gc2VlIGh0dHBzOi8vaXNzdWVzLmpib3NzLm9yZy9icm93c2UvSEFXS1VMQVItODA5IGZvciBpbmZvIG9uIHdoeSB0aGlzIGlzIG5lZWRlZFxuICBleHBvcnQgZnVuY3Rpb24gY2FsY0JhcldpZHRoQWRqdXN0ZWQoaSwgbGVuZ3RoOiBudW1iZXIpIHtcbiAgICByZXR1cm4gKGkgPT09IDAgfHwgaSA9PT0gbGVuZ3RoIC0gMSkgPyBjYWxjQmFyV2lkdGgod2lkdGgsIGxlbmd0aCwgQkFSX09GRlNFVCkgLyAyIDpcbiAgICAgIGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKTtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZXMgdGhlIGJhciBYIHBvc2l0aW9uLiBXaGVuIHVzaW5nIGNhbGNCYXJXaWR0aEFkanVzdGVkLCBpdCBpcyByZXF1aXJlZCB0byBwdXNoIGJhcnNcbiAgLy8gb3RoZXIgdGhhbiB0aGUgZmlyc3QgaGFsZiBiYXIgdG8gdGhlIGxlZnQsIHRvIG1ha2UgdXAgZm9yIHRoZSBmaXJzdCBiZWluZyBqdXN0IGhhbGYgd2lkdGhcbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJYUG9zKGQsIGksIHRpbWVTY2FsZTogYW55LCBsZW5ndGg6IG51bWJlcikge1xuICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApIC0gKGkgPT09IDAgPyAwIDogY2FsY0JhcldpZHRoKHdpZHRoLCBsZW5ndGgsIEJBUl9PRkZTRVQpIC8gMik7XG4gIH1cblxuICAvKipcbiAgICogQW4gZW1wdHkgZGF0YXBvaW50IGhhcyAnZW1wdHknIGF0dHJpYnV0ZSBzZXQgdG8gdHJ1ZS4gVXNlZCB0byBkaXN0aW5ndWlzaCBmcm9tIHJlYWwgMCB2YWx1ZXMuXG4gICAqIEBwYXJhbSBkXG4gICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgKi9cbiAgZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHlEYXRhUG9pbnQoZDogSUNoYXJ0RGF0YVBvaW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGQuZW1wdHk7XG4gIH1cblxuICAvKipcbiAgICogUmF3IG1ldHJpY3MgaGF2ZSBhICd2YWx1ZScgc2V0IGluc3RlYWQgb2YgYXZnL21pbi9tYXggb2YgYWdncmVnYXRlc1xuICAgKiBAcGFyYW0gZFxuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBpc1Jhd01ldHJpYyhkOiBJQ2hhcnREYXRhUG9pbnQpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdHlwZW9mIGQuYXZnID09PSAndW5kZWZpbmVkJztcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiB4QXhpc1RpbWVGb3JtYXRzKCkge1xuICAgIHJldHVybiBkMy50aW1lLmZvcm1hdC5tdWx0aShbXG4gICAgICBbJy4lTCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldE1pbGxpc2Vjb25kcygpO1xuICAgICAgfV0sXG4gICAgICBbJzolUycsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldFNlY29uZHMoKTtcbiAgICAgIH1dLFxuICAgICAgWyclSDolTScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldE1pbnV0ZXMoKTtcbiAgICAgIH1dLFxuICAgICAgWyclSDolTScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldEhvdXJzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJWEgJWQnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXREYXkoKSAmJiBkLmdldERhdGUoKSAhPT0gMTtcbiAgICAgIH1dLFxuICAgICAgWyclYiAlZCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldERhdGUoKSAhPT0gMTtcbiAgICAgIH1dLFxuICAgICAgWyclQicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldE1vbnRoKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJVknLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfV1cbiAgICBdKTtcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdmdEZWZzKGNoYXJ0KSB7XG5cbiAgICBsZXQgZGVmcyA9IGNoYXJ0LmFwcGVuZCgnZGVmcycpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ25vRGF0YVN0cmlwZXMnKVxuICAgICAgLmF0dHIoJ3BhdHRlcm5Vbml0cycsICd1c2VyU3BhY2VPblVzZScpXG4gICAgICAuYXR0cigneCcsICcwJylcbiAgICAgIC5hdHRyKCd5JywgJzAnKVxuICAgICAgLmF0dHIoJ3dpZHRoJywgJzYnKVxuICAgICAgLmF0dHIoJ2hlaWdodCcsICczJylcbiAgICAgIC5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJylcbiAgICAgIC5hdHRyKCdzdHlsZScsICdzdHJva2U6I0NDQ0NDQzsgZmlsbDpub25lOycpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ3Vua25vd25TdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiMyRTlFQzI7IGZpbGw6bm9uZTsnKVxuICAgICAgLmFwcGVuZCgncGF0aCcpLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJyk7XG5cbiAgICBkZWZzLmFwcGVuZCgncGF0dGVybicpXG4gICAgICAuYXR0cignaWQnLCAnZG93blN0cmlwZXMnKVxuICAgICAgLmF0dHIoJ3BhdHRlcm5Vbml0cycsICd1c2VyU3BhY2VPblVzZScpXG4gICAgICAuYXR0cigneCcsICcwJylcbiAgICAgIC5hdHRyKCd5JywgJzAnKVxuICAgICAgLmF0dHIoJ3dpZHRoJywgJzYnKVxuICAgICAgLmF0dHIoJ2hlaWdodCcsICczJylcbiAgICAgIC5hdHRyKCdzdHlsZScsICdzdHJva2U6I2ZmOGE5YTsgZmlsbDpub25lOycpXG4gICAgICAuYXBwZW5kKCdwYXRoJykuYXR0cignZCcsICdNIDAgMCA2IDAnKTtcblxuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlOiBhbnkpIHtcbiAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgfVxuXG4gIC8vIGFkYXB0ZWQgZnJvbSBodHRwOi8vd2VyeGx0ZC5jb20vd3AvMjAxMC8wNS8xMy9qYXZhc2NyaXB0LWltcGxlbWVudGF0aW9uLW9mLWphdmFzLXN0cmluZy1oYXNoY29kZS1tZXRob2QvXG4gIGV4cG9ydCBmdW5jdGlvbiBoYXNoU3RyaW5nKHN0cjogc3RyaW5nKTogbnVtYmVyIHtcbiAgICBsZXQgaGFzaCA9IDAsIGksIGNociwgbGVuO1xuICAgIGlmIChzdHIubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gaGFzaDtcbiAgICB9XG4gICAgZm9yIChpID0gMCwgbGVuID0gc3RyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBjaHIgPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgIGhhc2ggPSAoKGhhc2ggPDwgNSkgLSBoYXNoKSArIGNocjtcbiAgICAgIGhhc2ggfD0gMDsgLy8gQ29udmVydCB0byAzMmJpdCBpbnRlZ2VyXG4gICAgfVxuICAgIHJldHVybiBoYXNoO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGRldGVybWluZVhBeGlzVGlja3NGcm9tU2NyZWVuV2lkdGgod2lkdGhJblBpeGVsczogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBsZXQgeFRpY2tzO1xuICAgIGlmICh3aWR0aEluUGl4ZWxzIDw9IDIwMCkge1xuICAgICAgeFRpY2tzID0gMjtcbiAgICB9IGVsc2UgaWYgKHdpZHRoSW5QaXhlbHMgPD0gMzUwICYmIHdpZHRoSW5QaXhlbHMgPiAyMDApIHtcbiAgICAgIHhUaWNrcyA9IDQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHhUaWNrcyA9IDk7XG4gICAgfVxuICAgIHJldHVybiB4VGlja3M7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gZGV0ZXJtaW5lWUF4aXNUaWNrc0Zyb21TY3JlZW5IZWlnaHQoaGVpZ2h0SW5QaXhlbHM6IG51bWJlcik6IG51bWJlciB7XG4gICAgbGV0IHlUaWNrcztcbiAgICBpZiAoaGVpZ2h0SW5QaXhlbHMgPD0gMTIwKSB7XG4gICAgICB5VGlja3MgPSAzO1xuICAgIH0gZWxzZSB7XG4gICAgICB5VGlja3MgPSA5O1xuICAgIH1cbiAgICByZXR1cm4geVRpY2tzO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGRldGVybWluZVlBeGlzR3JpZExpbmVUaWNrc0Zyb21TY3JlZW5IZWlnaHQoaGVpZ2h0SW5QaXhlbHM6IG51bWJlcik6IG51bWJlciB7XG4gICAgbGV0IHlUaWNrcztcbiAgICBpZiAoaGVpZ2h0SW5QaXhlbHMgPD0gNjApIHtcbiAgICAgIHlUaWNrcyA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHlUaWNrcyA9IDEwO1xuICAgIH1cbiAgICByZXR1cm4geVRpY2tzO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGV4cG9ydCBjb25zdCBCQVJfT0ZGU0VUID0gMjtcblxuICBleHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RIaXN0b2dyYW1DaGFydCBpbXBsZW1lbnRzIElDaGFydFR5cGUge1xuXG4gICAgcHVibGljIG5hbWUgPSAnaGlzdG9ncmFtJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zLCBzdGFja2VkID0gZmFsc2UpIHtcblxuICAgICAgY29uc3QgYmFyQ2xhc3MgPSBzdGFja2VkID8gJ2xlYWRlckJhcicgOiAnaGlzdG9ncmFtJztcblxuICAgICAgY29uc3QgcmVjdEhpc3RvZ3JhbSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdyZWN0LicgKyBiYXJDbGFzcykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcblxuICAgICAgZnVuY3Rpb24gYnVpbGRCYXJzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgYmFyQ2xhc3MpXG4gICAgICAgICAgLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgY2hhcnRPcHRpb25zLnRpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy50aXAuaGlkZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgIC5hdHRyKCd4JywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0T3B0aW9ucy5jaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLm1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCAtIGNoYXJ0T3B0aW9ucy55U2NhbGUoaXNFbXB0eURhdGFQb2ludChkKSA/XG4gICAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy55U2NhbGUoY2hhcnRPcHRpb25zLnZpc3VhbGx5QWRqdXN0ZWRNYXgpIDogZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCBzdGFja2VkID8gJy42JyA6ICcxJylcbiAgICAgICAgICAuYXR0cignZmlsbCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/ICd1cmwoI25vRGF0YVN0cmlwZXMpJyA6IChzdGFja2VkID8gJyNEM0QzRDYnIDogJyNDMEMwQzAnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcjNzc3JztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcwJztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdkYXRhLWhhd2t1bGFyLXZhbHVlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgICB9KTtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZEhpZ2hCYXIoc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQubWluID09PSBkLm1heCA/ICdzaW5nbGVWYWx1ZScgOiAnaGlnaCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneCcsIGZ1bmN0aW9uKGQsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNOYU4oZC5tYXgpID8gY2hhcnRPcHRpb25zLnlTY2FsZShjaGFydE9wdGlvbnMudmlzdWFsbHlBZGp1c3RlZE1heCkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogKGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpIC0gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCkgfHwgMik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0T3B0aW9ucy5jaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC45KVxuICAgICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy50aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRMb3dlckJhcihzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICAgIHNlbGVjdGlvblxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdsb3cnKVxuICAgICAgICAgIC5hdHRyKCd4JywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNOYU4oZC5hdmcpID8gY2hhcnRPcHRpb25zLmhlaWdodCA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/IDAgOiAoY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbikgLSBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0T3B0aW9ucy5jaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC45KVxuICAgICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy50aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZFRvcFN0ZW0oc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtVG9wU3RlbScpXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZExvd1N0ZW0oc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtQm90dG9tU3RlbScpXG4gICAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICB9KS5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICAgIH0pO1xuXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkVG9wQ3Jvc3Moc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtVG9wQ3Jvc3MnKVxuICAgICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkQm90dG9tQ3Jvc3Moc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKVxuICAgICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZUhpc3RvZ3JhbUhpZ2hMb3dWYWx1ZXMoc3ZnOiBhbnksIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sIHN0YWNrZWQ/OiBib29sZWFuKSB7XG4gICAgICAgIGlmIChzdGFja2VkKSB7XG4gICAgICAgICAgLy8gdXBwZXIgcG9ydGlvbiByZXByZXNlbnRpbmcgYXZnIHRvIGhpZ2hcbiAgICAgICAgICBjb25zdCByZWN0SGlnaCA9IHN2Zy5zZWxlY3RBbGwoJ3JlY3QuaGlnaCwgcmVjdC5zaW5nbGVWYWx1ZScpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIHJlY3RIaWdoLmNhbGwoYnVpbGRIaWdoQmFyKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIHJlY3RIaWdoXG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuY2FsbChidWlsZEhpZ2hCYXIpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgcmVjdEhpZ2guZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgLy8gbG93ZXIgcG9ydGlvbiByZXByZXNlbnRpbmcgYXZnIHRvIGxvd1xuICAgICAgICAgIGNvbnN0IHJlY3RMb3cgPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmxvdycpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICByZWN0TG93LmNhbGwoYnVpbGRMb3dlckJhcik7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICByZWN0TG93XG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuY2FsbChidWlsZExvd2VyQmFyKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIHJlY3RMb3cuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgY29uc3QgbGluZUhpc3RvSGlnaFN0ZW0gPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtVG9wU3RlbScpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbS5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbVxuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRUb3BTdGVtKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIGxpbmVIaXN0b0hpZ2hTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIGNvbnN0IGxpbmVIaXN0b0xvd1N0ZW0gPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtQm90dG9tU3RlbScpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtLmNhbGwoYnVpbGRMb3dTdGVtKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIGxpbmVIaXN0b0xvd1N0ZW1cbiAgICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAgIC5jYWxsKGJ1aWxkTG93U3RlbSk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIGNvbnN0IGxpbmVIaXN0b1RvcENyb3NzID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcENyb3NzJykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcblxuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIGxpbmVIaXN0b1RvcENyb3NzLmNhbGwoYnVpbGRUb3BDcm9zcyk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zc1xuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRUb3BDcm9zcyk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgICBjb25zdCBsaW5lSGlzdG9Cb3R0b21Dcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Cb3R0b21Dcm9zcycpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgbGluZUhpc3RvQm90dG9tQ3Jvc3MuY2FsbChidWlsZEJvdHRvbUNyb3NzKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzXG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuY2FsbChidWlsZEJvdHRvbUNyb3NzKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIHJlY3RIaXN0b2dyYW0uY2FsbChidWlsZEJhcnMpO1xuXG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIHJlY3RIaXN0b2dyYW0uZW50ZXIoKVxuICAgICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgICAgLmNhbGwoYnVpbGRCYXJzKTtcblxuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICByZWN0SGlzdG9ncmFtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgaWYgKCFjaGFydE9wdGlvbnMuaGlkZUhpZ2hMb3dWYWx1ZXMpIHtcbiAgICAgICAgY3JlYXRlSGlzdG9ncmFtSGlnaExvd1ZhbHVlcyhjaGFydE9wdGlvbnMuc3ZnLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLCBzdGFja2VkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHdlIHNob3VsZCBoaWRlIGhpZ2gtbG93IHZhbHVlcy4uIG9yIHJlbW92ZSBpZiBleGlzdGluZ1xuICAgICAgICBjaGFydE9wdGlvbnMuc3ZnXG4gICAgICAgICAgLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcFN0ZW0sIC5oaXN0b2dyYW1Cb3R0b21TdGVtLCAuaGlzdG9ncmFtVG9wQ3Jvc3MsIC5oaXN0b2dyYW1Cb3R0b21Dcm9zcycpLnJlbW92ZSgpO1xuICAgICAgfVxuXG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGNsYXNzIEFyZWFDaGFydCBpbXBsZW1lbnRzIElDaGFydFR5cGUge1xuXG4gICAgcHVibGljIG5hbWUgPSAnYXJlYSc7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucyk6IHZvaWQge1xuXG4gICAgICBsZXRcbiAgICAgICAgaGlnaEFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgLmludGVycG9sYXRlKGNoYXJ0T3B0aW9ucy5pbnRlcnBvbGF0aW9uKVxuICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgLFxuXG4gICAgICAgIGF2Z0FyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgLmludGVycG9sYXRlKGNoYXJ0T3B0aW9ucy5pbnRlcnBvbGF0aW9uKVxuICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KS55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLmhpZGVIaWdoTG93VmFsdWVzID8gY2hhcnRPcHRpb25zLmhlaWdodCA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICxcblxuICAgICAgICBsb3dBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueTAoKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy5tb2RpZmllZElubmVyQ2hhcnRIZWlnaHQ7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIGlmICghY2hhcnRPcHRpb25zLmhpZGVIaWdoTG93VmFsdWVzKSB7XG4gICAgICAgIGxldFxuICAgICAgICAgIGhpZ2hBcmVhUGF0aCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdwYXRoLmhpZ2hBcmVhJykuZGF0YShbY2hhcnRPcHRpb25zLmNoYXJ0RGF0YV0pO1xuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgaGlnaEFyZWFQYXRoXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hBcmVhJylcbiAgICAgICAgICAuYXR0cignZCcsIGhpZ2hBcmVhKTtcbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGhpZ2hBcmVhUGF0aFxuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hBcmVhJylcbiAgICAgICAgICAuYXR0cignZCcsIGhpZ2hBcmVhKTtcbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGhpZ2hBcmVhUGF0aFxuICAgICAgICAgIC5leGl0KClcbiAgICAgICAgICAucmVtb3ZlKCk7XG5cbiAgICAgICAgbGV0XG4gICAgICAgICAgbG93QXJlYVBhdGggPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aC5sb3dBcmVhJykuZGF0YShbY2hhcnRPcHRpb25zLmNoYXJ0RGF0YV0pO1xuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgbG93QXJlYVBhdGhcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93QXJlYScpXG4gICAgICAgICAgLmF0dHIoJ2QnLCBsb3dBcmVhKTtcbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGxvd0FyZWFQYXRoXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93QXJlYScpXG4gICAgICAgICAgLmF0dHIoJ2QnLCBsb3dBcmVhKTtcbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxvd0FyZWFQYXRoXG4gICAgICAgICAgLmV4aXQoKVxuICAgICAgICAgIC5yZW1vdmUoKTtcbiAgICAgIH1cblxuICAgICAgbGV0XG4gICAgICAgIGF2Z0FyZWFQYXRoID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGguYXZnQXJlYScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgYXZnQXJlYVBhdGguYXR0cignY2xhc3MnLCAnYXZnQXJlYScpXG4gICAgICAgIC5hdHRyKCdkJywgYXZnQXJlYSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGF2Z0FyZWFQYXRoLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2Z0FyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGF2Z0FyZWEpO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBhdmdBcmVhUGF0aC5leGl0KCkucmVtb3ZlKCk7XG4gICAgfVxuXG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxuaW1wb3J0IENoYXJ0T3B0aW9ucyA9IENoYXJ0cy5DaGFydE9wdGlvbnM7XG5pbnRlcmZhY2UgSUNoYXJ0VHlwZSB7XG4gIG5hbWU6IHN0cmluZztcbiAgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zLCBvcHRpb25hbEJvb2xlYW4/OiBib29sZWFuKTogdm9pZDtcbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGV4cG9ydCBjbGFzcyBIaXN0b2dyYW1DaGFydCBleHRlbmRzIEFic3RyYWN0SGlzdG9ncmFtQ2hhcnQge1xuXG4gICAgcHVibGljIG5hbWUgPSAnaGlzdG9ncmFtJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zLCBzdGFja2VkID0gZmFsc2UpIHtcbiAgICAgIHN1cGVyLmRyYXdDaGFydChjaGFydE9wdGlvbnMsIHN0YWNrZWQpO1xuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBjbGFzcyBMaW5lQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ2xpbmUnO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpIHtcblxuICAgICAgbGV0IG1ldHJpY0NoYXJ0TGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgLmludGVycG9sYXRlKGNoYXJ0T3B0aW9ucy5pbnRlcnBvbGF0aW9uKVxuICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KTtcblxuICAgICAgbGV0IHBhdGhNZXRyaWMgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aC5tZXRyaWNMaW5lJykuZGF0YShbY2hhcnRPcHRpb25zLmNoYXJ0RGF0YV0pO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBwYXRoTWV0cmljLmF0dHIoJ2NsYXNzJywgJ21ldHJpY0xpbmUnKVxuICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgIC5hdHRyKCdkJywgbWV0cmljQ2hhcnRMaW5lKTtcblxuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBwYXRoTWV0cmljLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ21ldHJpY0xpbmUnKVxuICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgIC5hdHRyKCdkJywgbWV0cmljQ2hhcnRMaW5lKTtcblxuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBwYXRoTWV0cmljLmV4aXQoKS5yZW1vdmUoKTtcbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZXhwb3J0IGNsYXNzIFJocUJhckNoYXJ0IGV4dGVuZHMgQWJzdHJhY3RIaXN0b2dyYW1DaGFydCB7XG5cbiAgICBwdWJsaWMgbmFtZSA9ICdyaHFiYXInO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMsIHN0YWNrZWQgPSB0cnVlKSB7XG4gICAgICBzdXBlci5kcmF3Q2hhcnQoY2hhcnRPcHRpb25zLCBzdGFja2VkKTtcbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgY2xhc3MgU2NhdHRlckNoYXJ0IGltcGxlbWVudHMgSUNoYXJ0VHlwZSB7XG5cbiAgICBwdWJsaWMgbmFtZSA9ICdzY2F0dGVyJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zKSB7XG5cbiAgICAgIGlmICghY2hhcnRPcHRpb25zLmhpZGVIaWdoTG93VmFsdWVzKSB7XG5cbiAgICAgICAgbGV0IGhpZ2hEb3RDaXJjbGUgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLmhpZ2hEb3QnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgaGlnaERvdENpcmNsZS5hdHRyKCdjbGFzcycsICdoaWdoRG90JylcbiAgICAgICAgICAuZmlsdGVyKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcjZmYxYTEzJztcbiAgICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgaGlnaERvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlnaERvdCcpXG4gICAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJyNmZjFhMTMnO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBoaWdoRG90Q2lyY2xlLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICBsZXQgbG93RG90Q2lyY2xlID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5sb3dEb3QnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgbG93RG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2xvd0RvdCcpXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsb3dEb3RDaXJjbGUuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xvd0RvdCcpXG4gICAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsb3dEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyB3ZSBzaG91bGQgaGlkZSBoaWdoLWxvdyB2YWx1ZXMuLiBvciByZW1vdmUgaWYgZXhpc3RpbmdcbiAgICAgICAgY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5oaWdoRG90LCAubG93RG90JykucmVtb3ZlKCk7XG4gICAgICB9XG5cbiAgICAgIGxldCBhdmdEb3RDaXJjbGUgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLmF2Z0RvdCcpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGF2Z0RvdENpcmNsZS5hdHRyKCdjbGFzcycsICdhdmdEb3QnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjRkZGJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGF2Z0RvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2Z0RvdCcpXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyNGRkYnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgYXZnRG90Q2lyY2xlLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBjbGFzcyBTY2F0dGVyTGluZUNoYXJ0IGltcGxlbWVudHMgSUNoYXJ0VHlwZSB7XG5cbiAgICBwdWJsaWMgbmFtZSA9ICdzY2F0dGVybGluZSc7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucykge1xuXG4gICAgICBsZXQgbGluZVNjYXR0ZXJUb3BTdGVtID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZVRvcFN0ZW0nKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBsaW5lU2NhdHRlclRvcFN0ZW0uYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BTdGVtJylcbiAgICAgICAgLmZpbHRlcigoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBsaW5lU2NhdHRlclRvcFN0ZW0uZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BTdGVtJylcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgbGluZVNjYXR0ZXJUb3BTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgbGV0IGxpbmVTY2F0dGVyQm90dG9tU3RlbSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVCb3R0b21TdGVtJykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgbGluZVNjYXR0ZXJCb3R0b21TdGVtLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tU3RlbScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyQm90dG9tU3RlbS5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZUJvdHRvbVN0ZW0nKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgbGluZVNjYXR0ZXJUb3BDcm9zcyA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVUb3BDcm9zcycpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BDcm9zcycpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAuNSc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBsaW5lU2NhdHRlclRvcENyb3NzLmVudGVyKCkuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wQ3Jvc3MnKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpIC0gMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSArIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgbGluZVNjYXR0ZXJUb3BDcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIGxldCBsaW5lU2NhdHRlckJvdHRvbUNyb3NzID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZUJvdHRvbUNyb3NzJykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcy5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZUJvdHRvbUNyb3NzJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAuNSc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBsaW5lU2NhdHRlckJvdHRvbUNyb3NzLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgbGV0IGNpcmNsZVNjYXR0ZXJEb3QgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJEb3QnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBjaXJjbGVTY2F0dGVyRG90LmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJEb3QnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdvcGFjaXR5JywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMSc7XG4gICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBjaXJjbGVTY2F0dGVyRG90LmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckRvdCcpXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcxJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGNpcmNsZVNjYXR0ZXJEb3QuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgfVxuICB9XG59XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
