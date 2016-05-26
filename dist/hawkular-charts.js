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
    _module.directive('hkAvailabilityChart', AvailabilityChartDirective.Factory());
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
    _module.directive('hkContextChart', ContextChartDirective.Factory());
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
        EventNames.TIMELINE_CHART_TIMERANGE_CHANGED = new EventNames('TimelineChartTimeRangeChanged');
        EventNames.TIMELINE_CHART_DOUBLE_CLICK_EVENT = new EventNames('TimelineChartDoubleClickEvent');
        EventNames.CONTEXT_CHART_TIMERANGE_CHANGED = new EventNames('ContextChartTimeRangeChanged');
        EventNames.DATE_RANGE_DRAG_CHANGED = new EventNames('DateRangeDragChanged');
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
        .directive('hkMetricChart', ['$rootScope', '$http', '$window', '$interval', '$log',
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
                scope.$on(Charts.EventNames.DATE_RANGE_DRAG_CHANGED, function (event, extent) {
                    scope.$emit(Charts.EventNames.CHART_TIMERANGE_CHANGED, extent);
                });
                scope.$on(Charts.EventNames.CHART_TIMERANGE_CHANGED, function (event, extent) {
                    // forecast data not relevant to past data
                    attrs.forecastData = [];
                    forecastDataPoints = [];
                    scope.$digest();
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

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
/// <reference path='../../typings/tsd.d.ts' />
var Charts;
(function (Charts) {
    'use strict';
    // ManageIQ External Management System Event
    var EmsEvent = (function () {
        function EmsEvent(timestamp, eventSource, provider, message, middlewareResource) {
            this.timestamp = timestamp;
            this.eventSource = eventSource;
            this.provider = provider;
            this.message = message;
            this.middlewareResource = middlewareResource;
        }
        return EmsEvent;
    }());
    Charts.EmsEvent = EmsEvent;
    // Timeline specific for ManageIQ Timeline component
    /**
     * TimelineEvent is a subclass of EmsEvent that is specialized toward screen display
     */
    var TimelineEvent = (function (_super) {
        __extends(TimelineEvent, _super);
        function TimelineEvent(timestamp, eventSource, provider, message, middlewareResource, formattedDate, color, row, selected) {
            _super.call(this, timestamp, eventSource, provider, message, middlewareResource);
            this.timestamp = timestamp;
            this.eventSource = eventSource;
            this.provider = provider;
            this.message = message;
            this.middlewareResource = middlewareResource;
            this.formattedDate = formattedDate;
            this.color = color;
            this.row = row;
            this.selected = selected;
            this.formattedDate = moment(timestamp).format('MMMM Do YYYY, h:mm:ss a');
            this.selected = false;
        }
        /**
         * Build TimelineEvents from EmsEvents
         * @param emsEvents
         */
        TimelineEvent.buildEvents = function (emsEvents) {
            //  The schema is different for bucketed output
            if (emsEvents) {
                return emsEvents.map(function (emsEvent) {
                    return {
                        timestamp: emsEvent.timestamp,
                        eventSource: emsEvent.eventSource,
                        provider: emsEvent.eventSource,
                        message: emsEvent.message,
                        middlewareResource: emsEvent.middlewareResource,
                        formattedDate: moment(emsEvent.timestamp).format('MMMM Do YYYY, h:mm:ss a'),
                        color: emsEvent.eventSource === 'Hawkular' ? '#0088ce' : '#ec7a08',
                        row: RowNumber.nextRow(),
                        selected: false
                    };
                });
            }
        };
        /**
         * BuildFakeEvents is a fake event builder for testing/prototyping
         * @param n the number of events you want generated
         * @param startTimeStamp
         * @param endTimestamp
         * @returns {TimelineEvent[]}
         */
        TimelineEvent.buildFakeEvents = function (n, startTimeStamp, endTimestamp) {
            var events = [];
            var step = (endTimestamp - startTimeStamp) / n;
            for (var i = startTimeStamp; i < endTimestamp; i += step) {
                var randomTime = Random.randomBetween(startTimeStamp, endTimestamp);
                var event_1 = new TimelineEvent(randomTime, 'Hawkular', 'Hawkular Provider', 'Some Message', 'Resource' + '-' + Random.randomBetween(10, 100), moment(i).format('MMMM Do YYYY, h:mm:ss a'), '0088ce', RowNumber.nextRow());
                events.push(event_1);
            }
            return events;
        };
        return TimelineEvent;
    }(EmsEvent));
    Charts.TimelineEvent = TimelineEvent;
    /**
     * Random number generator
     */
    var Random = (function () {
        function Random() {
        }
        Random.randomBetween = function (min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        };
        return Random;
    }());
    Charts.Random = Random;
    /**
     * RowNumber class used to calculate which row in the TimelineChart an Event should be placed.
     * This is so events don't pile up on each other. The next event will be placed on the next row
     * such that labels can be placed
     */
    var RowNumber = (function () {
        function RowNumber() {
        }
        /**
         * Returns a row number from 1 to 5 for determining which row an event should be placed on.
         * @returns {number}
         */
        RowNumber.nextRow = function () {
            var MAX_ROWS = 5;
            RowNumber._currentRow++;
            if (RowNumber._currentRow > MAX_ROWS) {
                RowNumber._currentRow = 1; // reset back to zero
            }
            // reverse the ordering of the numbers so that 1 becomes 5
            // so that the events are laid out from top -> bottom instead of bottom -> top
            return (MAX_ROWS + 1) - RowNumber._currentRow;
        };
        RowNumber._currentRow = 0;
        return RowNumber;
    }());
    var _module = angular.module('hawkular.charts');
    var TimelineChartDirective = (function () {
        function TimelineChartDirective($rootScope) {
            var _this = this;
            this.restrict = 'E';
            this.replace = true;
            // Can't use 1.4 directive controllers because we need to support 1.3+
            this.scope = {
                events: '=',
                startTimestamp: '@',
                endTimestamp: '@',
            };
            this.link = function (scope, element, attrs) {
                // data specific vars
                var startTimestamp = +attrs.startTimestamp, endTimestamp = +attrs.endTimestamp, chartHeight = TimelineChartDirective._CHART_HEIGHT;
                // chart specific vars
                var margin = { top: 10, right: 5, bottom: 5, left: 10 }, width = TimelineChartDirective._CHART_WIDTH - margin.left - margin.right, adjustedChartHeight = chartHeight - 50, height = adjustedChartHeight - margin.top - margin.bottom, titleHeight = 30, titleSpace = 10, innerChartHeight = height + margin.top - titleHeight - titleSpace, adjustedChartHeight2 = +titleHeight + titleSpace + margin.top, yScale, timeScale, yAxis, xAxis, xAxisGroup, brush, brushGroup, tip, chart, chartParent, svg;
                function TimelineHover(d) {
                    return "<div class='chartHover'>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Event Source:</span>\n              <span class='chartHoverValue'>" + d.eventSource + "</span>\n            </div>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Provider:</span>\n              <span class='chartHoverValue'>" + d.provider + "</span>\n            </div>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Message:</span>\n              <span class='chartHoverValue'>" + d.message + "</span>\n            </div>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Middleware Resource:</span>\n              <span class='chartHoverValue'>" + d.middlewareResource + "</span>\n            </div>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Date Time:</span>\n              <span class='chartHoverValue'>" + moment(d.timestamp).format('M/d/YY, H:mm:ss ') + "</span>\n            </div>\n          </div>";
                }
                function timelineChartSetup() {
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
                        return TimelineHover(d);
                    });
                    svg = chart.append('g')
                        .attr('width', width + margin.left + margin.right)
                        .attr('height', innerChartHeight)
                        .attr('transform', 'translate(' + margin.left + ',' + (adjustedChartHeight2) + ')');
                    svg.call(tip);
                }
                function determineTimelineScale(timelineEvent) {
                    var adjustedTimeRange = [];
                    startTimestamp = +attrs.startTimestamp ||
                        d3.min(timelineEvent, function (d) {
                            return d.timestamp;
                        }) || +moment().subtract(24, 'hour');
                    if (timelineEvent && timelineEvent.length > 0) {
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
                function createTimelineChart(timelineEventst) {
                    var xAxisMin = d3.min(timelineEventst, function (d) {
                        return +d.timestamp;
                    });
                    var xAxisMax = d3.max(timelineEventst, function (d) {
                        return +d.timestamp;
                    });
                    var timelineTimeScale = d3.time.scale()
                        .range([0, width])
                        .domain([xAxisMin, xAxisMax]);
                    // 0-6 is the y-axis range, this means 1-5 is the valid range for
                    // values that won't be cut off half way be either axis.
                    var yScale = d3.scale.linear()
                        .clamp(true)
                        .range([height, 0])
                        .domain([0, 6]);
                    // The bottom line of the timeline chart
                    svg.append('line')
                        .attr('x1', 0)
                        .attr('y1', 70)
                        .attr('x2', 735)
                        .attr('y2', 70)
                        .attr('class', 'hkTimelineBottomLine');
                    svg.selectAll('circle')
                        .data(timelineEventst)
                        .enter()
                        .append('circle')
                        .attr('class', function (d) {
                        return d.selected ? 'hkEventSelected' : 'hkEvent';
                    })
                        .attr('cx', function (d) {
                        return timelineTimeScale(new Date(d.timestamp));
                    })
                        .attr('cy', function (d) {
                        return yScale(d.row);
                    })
                        .attr('fill', function (d) {
                        return d.color;
                    })
                        .attr('r', function (d) {
                        return 3;
                    }).on('mouseover', function (d, i) {
                        tip.show(d, i);
                    }).on('mouseout', function () {
                        tip.hide();
                    }).on('dblclick', function (d) {
                        console.log('Double-Clicked:' + d.middlewareResource);
                        d.selected = !d.selected;
                        $rootScope.$broadcast(Charts.EventNames.TIMELINE_CHART_DOUBLE_CLICK_EVENT.toString(), d);
                    });
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
                            $rootScope.$broadcast(Charts.EventNames.TIMELINE_CHART_TIMERANGE_CHANGED.toString(), extent);
                        }
                        brushGroup.call(brush.clear());
                    }
                }
                scope.$watchCollection('events', function (newEvents) {
                    if (newEvents) {
                        _this.events = TimelineEvent.buildEvents(angular.fromJson(newEvents));
                        scope.render(_this.events);
                    }
                });
                scope.$watchGroup(['startTimestamp', 'endTimestamp'], function (newTimestamp) {
                    startTimestamp = +newTimestamp[0] || startTimestamp;
                    endTimestamp = +newTimestamp[1] || endTimestamp;
                    scope.render(_this.events);
                });
                scope.render = function (timelineEvent) {
                    if (timelineEvent && timelineEvent.length > 0) {
                        ///NOTE: layering order is important!
                        timelineChartSetup();
                        determineTimelineScale(timelineEvent);
                        createXandYAxes();
                        createXAxisBrush();
                        createTimelineChart(timelineEvent);
                    }
                };
            };
        }
        TimelineChartDirective.Factory = function () {
            var directive = function ($rootScope) {
                return new TimelineChartDirective($rootScope);
            };
            directive['$inject'] = ['$rootScope'];
            return directive;
        };
        TimelineChartDirective._CHART_HEIGHT = 150;
        TimelineChartDirective._CHART_WIDTH = 750;
        return TimelineChartDirective;
    }());
    Charts.TimelineChartDirective = TimelineChartDirective;
    _module.directive('hkTimelineChart', TimelineChartDirective.Factory());
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImhhd2t1bGFyLW1ldHJpY3MtY2hhcnRzLm1vZHVsZS50cyIsImNoYXJ0L2FsZXJ0cy50cyIsImNoYXJ0L2F2YWlsLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L2NvbnRleHQtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvZXZlbnQtbmFtZXMudHMiLCJjaGFydC9mZWF0dXJlcy50cyIsImNoYXJ0L2ZvcmVjYXN0LnRzIiwiY2hhcnQvbWV0cmljLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L3RpbWVsaW5lLWRpcmVjdGl2ZS50cyIsImNoYXJ0L3R5cGVzLnRzIiwiY2hhcnQvdXRpbGl0eS50cyIsImNoYXJ0L2NoYXJ0LXR5cGUvYWJzdHJhY3QtaGlzdG9ncmFtLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9hcmVhLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9jaGFydC10eXBlLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9oaXN0b2dyYW0udHMiLCJjaGFydC9jaGFydC10eXBlL2xpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL211bHRpLWxpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL3JocS1iYXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXJMaW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7O0FDUHRDLCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0FxSmY7QUFySkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFFYjs7O09BR0c7SUFDSDtRQUlFLG9CQUFtQixjQUE0QixFQUN0QyxZQUEwQixFQUMxQixVQUFrQjtZQUZSLG1CQUFjLEdBQWQsY0FBYyxDQUFjO1lBQ3RDLGlCQUFZLEdBQVosWUFBWSxDQUFjO1lBQzFCLGVBQVUsR0FBVixVQUFVLENB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Q0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDO2lCQUN2QyxPQUFPLENBQUMsVUFBQyxDQUFNO2dCQUNkLE1BQU0sQ0FBQyxDQUFDLHVCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLENBQUMsQ0FBQztpQkFDRCxDQUFDLENBQUMsVUFBQyxDQUFNO2dCQUNSLE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM3QyxDQUFDLENBQUM7aUJBQ0QsQ0FBQyxDQUFDLFVBQUMsQ0FBTTtnQkFDUixNQUFNLENBQUMsa0JBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwRixDQUFDLENBQUM7aUJBQ0QsRUFBRSxDQUFDLFVBQUMsQ0FBTTtnQkFDVCxNQUFNLENBQUMsa0JBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwRixDQUFDLENBQUMsRUFHSixPQUFPLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7aUJBQ3BCLFdBQVcsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDO2lCQUN2QyxPQUFPLENBQUMsVUFBQyxDQUFNO2dCQUNkLE1BQU0sQ0FBQyxDQUFDLHVCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLENBQUMsQ0FBQztpQkFDRCxDQUFDLENBQUMsVUFBQyxDQUFNO2dCQUNSLE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM3QyxDQUFDLENBQUM7aUJBQ0QsQ0FBQyxDQUFDLFVBQUMsQ0FBTTtnQkFDUixNQUFNLENBQUMsa0JBQVcsQ0FBQyxDQUFD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QztZQUNiLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsVUFBQyxDQUFDLEVBQUUsQ0FBQztnQkFDdEIsaUJBQWlCO1lBQ25CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUU7Z0JBQ2hCLGFBQWE7WUFDZixDQUFDLENBQUMsQ0FBQztZQUNMLGtCQUFrQjtZQUNsQixnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUVuQyxDQUFDO1FBQ0gsdUJBQUM7SUFBRCxDQXhQQSxBQXdQQyxJQUFBO0lBeFBZLHVCQUFnQixtQkF3UDVCLENBQUE7QUFDSCxDQUFDLEVBOVBTLE1BQU0sS0FBTixNQUFNLFFBOFBmIiwiZmlsZSI6Imhhd2t1bGFyLWNoYXJ0cy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG5hbWUgIGhhd2t1bGFyLWNoYXJ0c1xuICpcbiAqIEBkZXNjcmlwdGlvblxuICogICBCYXNlIG1vZHVsZSBmb3IgaGF3a3VsYXItY2hhcnRzLlxuICpcbiAqL1xuYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycsIFtdKTtcbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLyoqXG4gICAqIERlZmluZXMgYW4gaW5kaXZpZHVhbCBhbGVydCBib3VuZHMgIHRvIGJlIHZpc3VhbGx5IGhpZ2hsaWdodGVkIGluIGEgY2hhcnRcbiAgICogdGhhdCBhbiBhbGVydCB3YXMgYWJvdmUvYmVsb3cgYSB0aHJlc2hvbGQuXG4gICAqL1xuICBleHBvcnQgY2xhc3MgQWxlcnRCb3VuZCB7XG4gICAgcHVibGljIHN0YXJ0RGF0ZTogRGF0ZTtcbiAgICBwdWJsaWMgZW5kRGF0ZTogRGF0ZTtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgcHVibGljIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgcHVibGljIGFsZXJ0VmFsdWU6IG51bWJlcikge1xuICAgICAgdGhpcy5zdGFydERhdGUgPSBuZXcgRGF0ZShzdGFydFRpbWVzdGFtcCk7XG4gICAgICB0aGlzLmVuZERhdGUgPSBuZXcgRGF0ZShlbmRUaW1lc3RhbXApO1xuICAgIH1cblxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQWxlcnRMaW5lRGVmKHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcikge1xuICAgIGxldCBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgLmludGVycG9sYXRlKCdtb25vdG9uZScpXG4gICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShhbGVydFZhbHVlKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIGxpbmU7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlQWxlcnRMaW5lKGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zLFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcixcbiAgICBjc3NDbGFzc05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGxldCBwYXRoQWxlcnRMaW5lID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGguYWxlcnRMaW5lJykuZGF0YShbY2hhcnRPcHRpb25zLmNoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHBhdGhBbGVydExpbmUuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZihjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlLCBhbGVydFZhbHVlKSk7XG5cbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBwYXRoQWxlcnRMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdjbGFzcycsIGNzc0NsYXNzTmFtZSlcbiAgICAgIC5hdHRyKCdkJywgY3JlYXRlQWxlcnRMaW5lRGVmKGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUsIGNoYXJ0T3B0aW9ucy55U2NhbGUsIGFsZXJ0VmFsdWUpKTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHBhdGhBbGVydExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXh0cmFjdEFsZXJ0UmFuZ2VzKGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sIHRocmVzaG9sZDogQWxlcnRUaHJlc2hvbGQpOiBBbGVydEJvdW5kW10ge1xuICAgIGxldCBhbGVydEJvdW5kQXJlYUl0ZW1zOiBBbGVydEJvdW5kW107XG4gICAgbGV0IHN0YXJ0UG9pbnRzOiBudW1iZXJbXTtcblxuICAgIGZ1bmN0aW9uIGZpbmRTdGFydFBvaW50cyhjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCB0aHJlc2hvbGQ6IEFsZXJ0VGhyZXNob2xkKSB7XG4gICAgICBsZXQgc3RhcnRQb2ludHMgPSBbXTtcbiAgICAgIGxldCBwcmV2SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBjaGFydERhdGEuZm9yRWFjaCgoY2hhcnRJdGVtOiBJQ2hhcnREYXRhUG9pbnQsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBpZiAoaSA9PT0gMCAmJiBjaGFydEl0ZW0uYXZnID4gdGhyZXNob2xkKSB7XG4gICAgICAgICAgc3RhcnRQb2ludHMucHVzaChpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwcmV2SXRlbSA9IGNoYXJ0RGF0YVtpIC0gMV07XG4gICAgICAgICAgaWYgKGNoYXJ0SXRlbS5hdmcgPiB0aHJlc2hvbGQgJiYgcHJldkl0ZW0gJiYgKCFwcmV2SXRlbS5hdmcgfHwgcHJldkl0ZW0uYXZnIDw9IHRocmVzaG9sZCkpIHtcbiAgICAgICAgICAgIHN0YXJ0UG9pbnRzLnB1c2gocHJldkl0ZW0uYXZnID8gKGkgLSAxKSA6IGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBzdGFydFBvaW50cztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzOiBudW1iZXJbXSwgdGhyZXNob2xkOiBBbGVydFRocmVzaG9sZCk6IEFsZXJ0Qm91bmRbXSB7XG4gICAgICBsZXQgYWxlcnRCb3VuZEFyZWFJdGVtczogQWxlcnRCb3VuZFtdID0gW107XG4gICAgICBsZXQgY3VycmVudEl0ZW06IElDaGFydERhdGFQb2ludDtcbiAgICAgIGxldCBuZXh0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuICAgICAgbGV0IHN0YXJ0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBzdGFydFBvaW50cy5mb3JFYWNoKChzdGFydFBvaW50SW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICBzdGFydEl0ZW0gPSBjaGFydERhdGFbc3RhcnRQb2ludEluZGV4XTtcblxuICAgICAgICBmb3IgKGxldCBqID0gc3RhcnRQb2ludEluZGV4OyBqIDwgY2hhcnREYXRhLmxlbmd0aCAtIDE7IGorKykge1xuICAgICAgICAgIGN1cnJlbnRJdGVtID0gY2hhcnREYXRhW2pdO1xuICAgICAgICAgIG5leHRJdGVtID0gY2hhcnREYXRhW2ogKyAxXTtcblxuICAgICAgICAgIGlmICgoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmIG5leHRJdGVtLmF2ZyA8PSB0aHJlc2hvbGQpXG4gICAgICAgICAgICB8fCAoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmICFuZXh0SXRlbS5hdmcpKSB7XG4gICAgICAgICAgICBhbGVydEJvdW5kQXJlYUl0ZW1zLnB1c2gobmV3IEFsZXJ0Qm91bmQoc3RhcnRJdGVtLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgbmV4dEl0ZW0uYXZnID8gbmV4dEl0ZW0udGltZXN0YW1wIDogY3VycmVudEl0ZW0udGltZXN0YW1wLCB0aHJlc2hvbGQpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vLyBtZWFucyB0aGUgbGFzdCBwaWVjZSBkYXRhIGlzIGFsbCBhYm92ZSB0aHJlc2hvbGQsIHVzZSBsYXN0IGRhdGEgcG9pbnRcbiAgICAgIGlmIChhbGVydEJvdW5kQXJlYUl0ZW1zLmxlbmd0aCA9PT0gKHN0YXJ0UG9pbnRzLmxlbmd0aCAtIDEpKSB7XG4gICAgICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMucHVzaChuZXcgQWxlcnRCb3VuZChjaGFydERhdGFbc3RhcnRQb2ludHNbc3RhcnRQb2ludHMubGVuZ3RoIC0gMV1dLnRpbWVzdGFtcCxcbiAgICAgICAgICBjaGFydERhdGFbY2hhcnREYXRhLmxlbmd0aCAtIDFdLnRpbWVzdGFtcCwgdGhyZXNob2xkKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBhbGVydEJvdW5kQXJlYUl0ZW1zO1xuICAgIH1cblxuICAgIHN0YXJ0UG9pbnRzID0gZmluZFN0YXJ0UG9pbnRzKGNoYXJ0RGF0YSwgdGhyZXNob2xkKTtcblxuICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMgPSBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzLCB0aHJlc2hvbGQpO1xuXG4gICAgcmV0dXJuIGFsZXJ0Qm91bmRBcmVhSXRlbXM7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBbGVydEJvdW5kc0FyZWEoY2hhcnRPcHRpb25zOiBDaGFydE9wdGlvbnMsXG4gICAgYWxlcnRWYWx1ZTogbnVtYmVyLFxuICAgIGhpZ2hCb3VuZDogbnVtYmVyXG4gICkge1xuICAgIGNvbnN0IGFsZXJ0Qm91bmRzOiBBbGVydEJvdW5kW10gPSBleHRyYWN0QWxlcnRSYW5nZXMoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSwgYWxlcnRWYWx1ZSk7XG4gICAgbGV0IHJlY3RBbGVydCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0KCdnLmFsZXJ0SG9sZGVyJykuc2VsZWN0QWxsKCdyZWN0LmFsZXJ0Qm91bmRzJykuZGF0YShhbGVydEJvdW5kcyk7XG5cbiAgICBmdW5jdGlvbiBhbGVydEJvdW5kaW5nUmVjdChzZWxlY3Rpb24pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuYXR0cignY2xhc3MnLCAnYWxlcnRCb3VuZHMnKVxuICAgICAgICAuYXR0cigneCcsIChkOiBBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC5zdGFydFRpbWVzdGFtcCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5JywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGhpZ2hCb3VuZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZDogQWxlcnRCb3VuZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMuaGVpZ2h0IC0gNDA7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd3aWR0aCcsIChkOiBBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC5lbmRUaW1lc3RhbXApIC0gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnN0YXJ0VGltZXN0YW1wKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgcmVjdEFsZXJ0LmNhbGwoYWxlcnRCb3VuZGluZ1JlY3QpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcmVjdEFsZXJ0LmVudGVyKClcbiAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgLmNhbGwoYWxlcnRCb3VuZGluZ1JlY3QpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcmVjdEFsZXJ0LmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkZWNsYXJlIGxldCBkMzogYW55O1xuXG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cbiAgZXhwb3J0IGNsYXNzIEF2YWlsU3RhdHVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgVVAgPSAndXAnO1xuICAgIHB1YmxpYyBzdGF0aWMgRE9XTiA9ICdkb3duJztcbiAgICBwdWJsaWMgc3RhdGljIFVOS05PV04gPSAndW5rbm93bic7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykge1xuICAgICAgLy8gZW1wdHlcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSBpbnB1dCBkYXRhIGZvcm1hdCwgZGlyZWN0bHkgZnJvbSBNZXRyaWNzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQXZhaWxEYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyB0aGUgdHJhbnNmb3JtZWQgb3V0cHV0IGRhdGEgZm9ybWF0LiBGb3JtYXR0ZWQgdG8gd29yayB3aXRoIGF2YWlsYWJpbGl0eSBjaGFydCAoYmFzaWNhbGx5IGEgRFRPKS5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBudW1iZXI7XG4gICAgZW5kOiBudW1iZXI7XG4gICAgdmFsdWU6IHN0cmluZztcbiAgICBzdGFydERhdGU/OiBEYXRlOyAvLy8gTWFpbmx5IGZvciBkZWJ1Z2dlciBodW1hbiByZWFkYWJsZSBkYXRlcyBpbnN0ZWFkIG9mIGEgbnVtYmVyXG4gICAgZW5kRGF0ZT86IERhdGU7XG4gICAgZHVyYXRpb24/OiBzdHJpbmc7XG4gICAgbWVzc2FnZT86IHN0cmluZztcbiAgfVxuXG4gIGV4cG9ydCBjbGFzcyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IGltcGxlbWVudHMgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHN0YXJ0OiBudW1iZXIsXG4gICAgICBwdWJsaWMgZW5kOiBudW1iZXIsXG4gICAgICBwdWJsaWMgdmFsdWU6IHN0cmluZyxcbiAgICAgIHB1YmxpYyBzdGFydERhdGU/OiBEYXRlLFxuICAgICAgcHVibGljIGVuZERhdGU/OiBEYXRlLFxuICAgICAgcHVibGljIGR1cmF0aW9uPzogc3RyaW5nLFxuICAgICAgcHVibGljIG1lc3NhZ2U/OiBzdHJpbmcpIHtcblxuICAgICAgdGhpcy5kdXJhdGlvbiA9IG1vbWVudChlbmQpLmZyb20obW9tZW50KHN0YXJ0KSwgdHJ1ZSk7XG4gICAgICB0aGlzLnN0YXJ0RGF0ZSA9IG5ldyBEYXRlKHN0YXJ0KTtcbiAgICAgIHRoaXMuZW5kRGF0ZSA9IG5ldyBEYXRlKGVuZCk7XG4gICAgfVxuXG4gIH1cblxuICBleHBvcnQgY2xhc3MgQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX0hFSUdIVCA9IDE1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfV0lEVEggPSA3NTA7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGRhdGE6ICc9JyxcbiAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgIHRpbWVMYWJlbDogJ0AnLFxuICAgICAgZGF0ZUxhYmVsOiAnQCcsXG4gICAgICBjaGFydFRpdGxlOiAnQCdcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6IChzY29wZTogYW55LCBlbGVtZW50OiBuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczogYW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIHRyYW5zZm9ybWVkRGF0YVBvaW50czogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSB7XG5cbiAgICAgIHRoaXMubGluayA9IChzY29wZSwgZWxlbWVudCwgYXR0cnMpID0+IHtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IHN0YXJ0VGltZXN0YW1wOiBudW1iZXIgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAsXG4gICAgICAgICAgZW5kVGltZXN0YW1wOiBudW1iZXIgPSArYXR0cnMuZW5kVGltZXN0YW1wLFxuICAgICAgICAgIGNoYXJ0SGVpZ2h0ID0gQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVDtcblxuICAgICAgICAvLyBjaGFydCBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBtYXJnaW4gPSB7IHRvcDogMTAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwIH0sXG4gICAgICAgICAgd2lkdGggPSBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5fQ0hBUlRfV0lEVEggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCxcbiAgICAgICAgICBhZGp1c3RlZENoYXJ0SGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSA1MCxcbiAgICAgICAgICBoZWlnaHQgPSBhZGp1c3RlZENoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgdGl0bGVIZWlnaHQgPSAzMCxcbiAgICAgICAgICB0aXRsZVNwYWNlID0gMTAsXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AgLSB0aXRsZUhlaWdodCAtIHRpdGxlU3BhY2UsXG4gICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodDIgPSArdGl0bGVIZWlnaHQgKyB0aXRsZVNwYWNlICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgIHhBeGlzR3JvdXAsXG4gICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICB0aXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnO1xuXG4gICAgICAgIGZ1bmN0aW9uIGJ1aWxkQXZhaWxIb3ZlcihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz5TdGF0dXM6PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QudmFsdWUudG9VcHBlckNhc2UoKX08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSBiZWZvcmUtc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+RHVyYXRpb246PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QuZHVyYXRpb259PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uZVRpbWVDaGFydFNldHVwKCk6IHZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgLmF0dHIoJ3ZpZXdCb3gnLCAnMCAwIDc2MCAxNTAnKS5hdHRyKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ3hNaW5ZTWluIG1lZXQnKTtcblxuICAgICAgICAgIHRpcCA9IGQzLnRpcCgpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZDMtdGlwJylcbiAgICAgICAgICAgIC5vZmZzZXQoWy0xMCwgMF0pXG4gICAgICAgICAgICAuaHRtbCgoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGJ1aWxkQXZhaWxIb3ZlcihkKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoICsgbWFyZ2luLmxlZnQgKyBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodClcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsJyArIChhZGp1c3RlZENoYXJ0SGVpZ2h0MikgKyAnKScpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZGVmcycpXG4gICAgICAgICAgICAuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgICAgICAgIC5hdHRyKCdpZCcsICdkaWFnb25hbC1zdHJpcGVzJylcbiAgICAgICAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgICAgICAgLmF0dHIoJ3BhdHRlcm5UcmFuc2Zvcm0nLCAnc2NhbGUoMC43KScpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCA0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDQpXG4gICAgICAgICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5hdHRyKCdkJywgJ00tMSwxIGwyLC0yIE0wLDQgbDQsLTQgTTMsNSBsMiwtMicpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgJyNCNkI2QjYnKVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIDEuMik7XG5cbiAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lQXZhaWxTY2FsZSh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSB7XG4gICAgICAgICAgbGV0IGFkanVzdGVkVGltZVJhbmdlOiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAgfHxcbiAgICAgICAgICAgIGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGQuc3RhcnQ7XG4gICAgICAgICAgICB9KSB8fCArbW9tZW50KCkuc3VidHJhY3QoMSwgJ2hvdXInKTtcblxuICAgICAgICAgIGlmICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50ICYmIHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQubGVuZ3RoID4gMCkge1xuXG4gICAgICAgICAgICBhZGp1c3RlZFRpbWVSYW5nZVswXSA9IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgICAgYWRqdXN0ZWRUaW1lUmFuZ2VbMV0gPSBlbmRUaW1lc3RhbXAgfHwgK21vbWVudCgpO1xuXG4gICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlUm91bmQoWzcwLCAwXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihbMCwgMTc1XSk7XG5cbiAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAudGlja3MoMClcbiAgICAgICAgICAgICAgLnRpY2tTaXplKDAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgICAuZG9tYWluKGFkanVzdGVkVGltZVJhbmdlKTtcblxuICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgIC50aWNrU2l6ZSgtNzAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ3RvcCcpXG4gICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSk7XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBpc1VwKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVQLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2Z1bmN0aW9uIGlzRG93bihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAvLyAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLkRPV04udG9TdHJpbmcoKTtcbiAgICAgICAgLy99XG5cbiAgICAgICAgZnVuY3Rpb24gaXNVbmtub3duKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVOS05PV04udG9TdHJpbmcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhpbkF2YWlsRGF0YTogSUF2YWlsRGF0YVBvaW50W10pOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdIHtcbiAgICAgICAgICBsZXQgb3V0cHV0RGF0YTogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSA9IFtdO1xuICAgICAgICAgIGxldCBpdGVtQ291bnQgPSBpbkF2YWlsRGF0YS5sZW5ndGg7XG5cbiAgICAgICAgICBmdW5jdGlvbiBzb3J0QnlUaW1lc3RhbXAoYTogSUF2YWlsRGF0YVBvaW50LCBiOiBJQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIGlmIChhLnRpbWVzdGFtcCA8IGIudGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhLnRpbWVzdGFtcCA+IGIudGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaW5BdmFpbERhdGEuc29ydChzb3J0QnlUaW1lc3RhbXApO1xuXG4gICAgICAgICAgaWYgKGluQXZhaWxEYXRhICYmIGl0ZW1Db3VudCA+IDAgJiYgaW5BdmFpbERhdGFbMF0udGltZXN0YW1wKSB7XG4gICAgICAgICAgICBsZXQgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICAgICAgICAgIGlmIChpdGVtQ291bnQgPT09IDEpIHtcbiAgICAgICAgICAgICAgbGV0IGF2YWlsSXRlbSA9IGluQXZhaWxEYXRhWzBdO1xuXG4gICAgICAgICAgICAgIC8vIHdlIG9ubHkgaGF2ZSBvbmUgaXRlbSB3aXRoIHN0YXJ0IHRpbWUuIEFzc3VtZSB1bmtub3duIGZvciB0aGUgdGltZSBiZWZvcmUgKGxhc3QgMWgpXG4gICAgICAgICAgICAgIC8vIEBUT0RPIGFkanVzdCB0byB0aW1lIHBpY2tlclxuICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQobm93IC0gNjAgKiA2MCAqIDEwMDAsXG4gICAgICAgICAgICAgICAgYXZhaWxJdGVtLnRpbWVzdGFtcCwgQXZhaWxTdGF0dXMuVU5LTk9XTi50b1N0cmluZygpKSk7XG4gICAgICAgICAgICAgIC8vIGFuZCB0aGUgZGV0ZXJtaW5lZCB2YWx1ZSB1cCB1bnRpbCB0aGUgZW5kLlxuICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoYXZhaWxJdGVtLnRpbWVzdGFtcCwgbm93LCBhdmFpbEl0ZW0udmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxldCBiYWNrd2FyZHNFbmRUaW1lID0gbm93O1xuXG4gICAgICAgICAgICAgIGZvciAobGV0IGkgPSBpbkF2YWlsRGF0YS5sZW5ndGg7IGkgPiAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGRhdGEgc3RhcnRpbmcgaW4gdGhlIGZ1dHVyZS4uLiBkaXNjYXJkIGl0XG4gICAgICAgICAgICAgICAgLy9pZiAoaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCA+ICttb21lbnQoKSkge1xuICAgICAgICAgICAgICAgIC8vICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAvL31cbiAgICAgICAgICAgICAgICBpZiAoc3RhcnRUaW1lc3RhbXAgPj0gaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KHN0YXJ0VGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lLCBpbkF2YWlsRGF0YVtpIC0gMV0udmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSwgaW5BdmFpbERhdGFbaSAtIDFdLnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lID0gaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG91dHB1dERhdGE7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVTaWRlWUF4aXNMYWJlbHMoKSB7XG4gICAgICAgICAgLy8vQFRvZG86IG1vdmUgb3V0IHRvIHN0eWxlc2hlZXRcbiAgICAgICAgICBzdmcuYXBwZW5kKCd0ZXh0JylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmFpbFVwTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDI1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdVcCcpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgndGV4dCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxEb3duTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDU1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdEb3duJyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10pIHtcbiAgICAgICAgICAvL2xldCB4QXhpc01pbiA9IGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAvLyAgcmV0dXJuICtkLnN0YXJ0O1xuICAgICAgICAgIC8vfSksXG4gICAgICAgICAgbGV0IHhBeGlzTWF4ID0gZDMubWF4KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICtkLmVuZDtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBhdmFpbFRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAuZG9tYWluKFtzdGFydFRpbWVzdGFtcCwgZW5kVGltZXN0YW1wIHx8IHhBeGlzTWF4XSksXG5cbiAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2UoW2hlaWdodCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oWzAsIDRdKTtcblxuICAgICAgICAgIC8vYXZhaWxYQXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAvLyAgLnNjYWxlKGF2YWlsVGltZVNjYWxlKVxuICAgICAgICAgIC8vICAudGlja3MoOClcbiAgICAgICAgICAvLyAgLnRpY2tTaXplKDEzLCAwKVxuICAgICAgICAgIC8vICAub3JpZW50KCd0b3AnKTtcblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgb2Zmc2V0IGZvciB0aGUgYmFyXG4gICAgICAgICAgLy8gVXAgb3IgVW5rbm93bjogb2Zmc2V0IDAsIERvd246IG9mZnNldCAzNVxuICAgICAgICAgIGZ1bmN0aW9uIGNhbGNCYXJZKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgICByZXR1cm4gaGVpZ2h0IC0geVNjYWxlKDApICsgKChpc1VwKGQpIHx8IGlzVW5rbm93bihkKSkgPyAwIDogMzUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgcmVtb3ZlZCBoZWlnaHQgZm9yIHRoZSBiYXJcbiAgICAgICAgICAvLyBVbmtub3duOiBmdWxsIGhlaWdodCAxNSwgVXAgb3IgRG93bjogaGFsZiBoZWlnaHQsIDUwXG4gICAgICAgICAgZnVuY3Rpb24gY2FsY0JhckhlaWdodChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgcmV0dXJuIHlTY2FsZSgwKSAtIChpc1Vua25vd24oZCkgPyAxNSA6IDUwKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjYWxjQmFyRmlsbChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgaWYgKGlzVXAoZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjNTRBMjRFJzsgLy8gZ3JlZW5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNVbmtub3duKGQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndXJsKCNkaWFnb25hbC1zdHJpcGVzKSc7IC8vIGdyYXkgc3RyaXBlc1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjRDg1MDU0JzsgLy8gcmVkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncmVjdC5hdmFpbEJhcnMnKVxuICAgICAgICAgICAgLmRhdGEodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludClcbiAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxCYXJzJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJZKGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gY2FsY0JhckhlaWdodChkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGRFbmQgPSBlbmRUaW1lc3RhbXAgPyAoTWF0aC5taW4oK2QuZW5kLCBlbmRUaW1lc3RhbXApKSA6ICgrZC5lbmQpO1xuICAgICAgICAgICAgICByZXR1cm4gYXZhaWxUaW1lU2NhbGUoZEVuZCkgLSBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJGaWxsKGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gMC44NTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2Vkb3duJywgKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgYnJ1c2hFbGVtID0gc3ZnLnNlbGVjdCgnLmJydXNoJykubm9kZSgpO1xuICAgICAgICAgICAgICBsZXQgY2xpY2tFdmVudDogYW55ID0gbmV3IEV2ZW50KCdtb3VzZWRvd24nKTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWCA9IGQzLmV2ZW50LnBhZ2VYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFggPSBkMy5ldmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VZID0gZDMuZXZlbnQucGFnZVk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WSA9IGQzLmV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICAgIGJydXNoRWxlbS5kaXNwYXRjaEV2ZW50KGNsaWNrRXZlbnQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2V1cCcsICgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGJydXNoRWxlbSA9IHN2Zy5zZWxlY3QoJy5icnVzaCcpLm5vZGUoKTtcbiAgICAgICAgICAgICAgbGV0IGNsaWNrRXZlbnQ6IGFueSA9IG5ldyBFdmVudCgnbW91c2V1cCcpO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VYID0gZDMuZXZlbnQucGFnZVg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WCA9IGQzLmV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVkgPSBkMy5ldmVudC5wYWdlWTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRZID0gZDMuZXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgYnJ1c2hFbGVtLmRpc3BhdGNoRXZlbnQoY2xpY2tFdmVudCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIFRoZSBib3R0b20gbGluZSBvZiB0aGUgYXZhaWxhYmlsaXR5IGNoYXJ0XG4gICAgICAgICAgc3ZnLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuYXR0cigneDEnLCAwKVxuICAgICAgICAgICAgLmF0dHIoJ3kxJywgNzApXG4gICAgICAgICAgICAuYXR0cigneDInLCA2NTUpXG4gICAgICAgICAgICAuYXR0cigneTInLCA3MClcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAwLjUpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgJyNEMEQwRDAnKTtcblxuICAgICAgICAgIGNyZWF0ZVNpZGVZQXhpc0xhYmVscygpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWGFuZFlBeGVzKCkge1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGJydXNoRW5kKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDcwKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgZXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgIHN0YXJ0VGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvL3N2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5BVkFJTF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBleHRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChuZXdEYXRhKSB7XG4gICAgICAgICAgICB0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyA9IGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ3N0YXJ0VGltZXN0YW1wJywgJ2VuZFRpbWVzdGFtcCddLCAobmV3VGltZXN0YW1wKSA9PiB7XG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzBdIHx8IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgIGVuZFRpbWVzdGFtcCA9ICtuZXdUaW1lc3RhbXBbMV0gfHwgZW5kVGltZXN0YW1wO1xuICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLnJlbmRlciA9ICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQgJiYgdHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUudGltZSgnYXZhaWxDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgb25lVGltZUNoYXJ0U2V0dXAoKTtcbiAgICAgICAgICAgIGRldGVybWluZUF2YWlsU2NhbGUodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCk7XG4gICAgICAgICAgICBjcmVhdGVYYW5kWUF4ZXMoKTtcbiAgICAgICAgICAgIGNyZWF0ZVhBeGlzQnJ1c2goKTtcbiAgICAgICAgICAgIGNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpO1xuICAgICAgICAgICAgLy9jb25zb2xlLnRpbWVFbmQoJ2F2YWlsQ2hhcnRSZW5kZXInKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnaGtBdmFpbGFiaWxpdHlDaGFydCcsIEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLkZhY3RvcnkoKSk7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBjb25zdCBfbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycpO1xuXG4gIGV4cG9ydCBjbGFzcyBDb250ZXh0Q2hhcnREaXJlY3RpdmUge1xuXG4gICAgLy8gdGhlc2UgYXJlIGp1c3Qgc3RhcnRpbmcgcGFyYW1ldGVyIGhpbnRzXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX1dJRFRIX0hJTlQgPSA3NTA7XG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX0hFSUdIVF9ISU5UID0gNTA7XG4gICAgcHJpdmF0ZSBzdGF0aWMgX1hBWElTX0hFSUdIVCA9IDE1O1xuXG4gICAgcHVibGljIHJlc3RyaWN0ID0gJ0UnO1xuICAgIHB1YmxpYyByZXBsYWNlID0gdHJ1ZTtcblxuICAgIC8vIENhbid0IHVzZSAxLjQgZGlyZWN0aXZlIGNvbnRyb2xsZXJzIGJlY2F1c2Ugd2UgbmVlZCB0byBzdXBwb3J0IDEuMytcbiAgICBwdWJsaWMgc2NvcGUgPSB7XG4gICAgICBkYXRhOiAnPScsXG4gICAgICBzaG93WUF4aXNWYWx1ZXM6ICc9JyxcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6IChzY29wZTogYW55LCBlbGVtZW50OiBuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczogYW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdO1xuXG4gICAgY29uc3RydWN0b3IoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpIHtcblxuICAgICAgdGhpcy5saW5rID0gKHNjb3BlLCBlbGVtZW50LCBhdHRycykgPT4ge1xuXG4gICAgICAgIGNvbnN0IG1hcmdpbiA9IHsgdG9wOiAwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA5MCB9O1xuXG4gICAgICAgIC8vIGRhdGEgc3BlY2lmaWMgdmFyc1xuICAgICAgICBsZXQgY2hhcnRIZWlnaHQgPSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVF9ISU5ULFxuICAgICAgICAgIHdpZHRoID0gQ29udGV4dENoYXJ0RGlyZWN0aXZlLl9DSEFSVF9XSURUSF9ISU5UIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgaGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSAtIDE1LFxuICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wLFxuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlczogYm9vbGVhbixcbiAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgeUF4aXMsXG4gICAgICAgICAgeUF4aXNHcm91cCxcbiAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgeEF4aXMsXG4gICAgICAgICAgeEF4aXNHcm91cCxcbiAgICAgICAgICBicnVzaCxcbiAgICAgICAgICBicnVzaEdyb3VwLFxuICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgIHN2ZztcblxuICAgICAgICBpZiAodHlwZW9mIGF0dHJzLnNob3dZQXhpc1ZhbHVlcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBzaG93WUF4aXNWYWx1ZXMgPSBhdHRycy5zaG93WUF4aXNWYWx1ZXMgPT09ICd0cnVlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJlc2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgICAvLyBkZXN0cm95IGFueSBwcmV2aW91cyBjaGFydHNcbiAgICAgICAgICBpZiAoY2hhcnQpIHtcbiAgICAgICAgICAgIGNoYXJ0UGFyZW50LnNlbGVjdEFsbCgnKicpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjaGFydFBhcmVudCA9IGQzLnNlbGVjdChlbGVtZW50WzBdKTtcblxuICAgICAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSBlbGVtZW50WzBdLnBhcmVudE5vZGU7XG5cbiAgICAgICAgICB3aWR0aCA9ICg8YW55PnBhcmVudE5vZGUpLmNsaWVudFdpZHRoO1xuICAgICAgICAgIGhlaWdodCA9ICg8YW55PnBhcmVudE5vZGUpLmNsaWVudEhlaWdodDtcblxuICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tIC0gQ29udGV4dENoYXJ0RGlyZWN0aXZlLl9YQVhJU19IRUlHSFQsXG5cbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ0NvbnRleHQgV2lkdGg6ICVpJyx3aWR0aCk7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdDb250ZXh0IEhlaWdodDogJWknLGhlaWdodCk7XG5cbiAgICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wO1xuXG4gICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsIDApJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdjb250ZXh0Q2hhcnQnKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlQ29udGV4dENoYXJ0KGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSB7XG5cbiAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGggLSAxMF0pXG4gICAgICAgICAgICAubmljZSgpXG4gICAgICAgICAgICAuZG9tYWluKFtkYXRhUG9pbnRzWzBdLnRpbWVzdGFtcCwgZGF0YVBvaW50c1tkYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcF0pO1xuXG4gICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgLnRpY2tTaXplKDQsIDApXG4gICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAub3JpZW50KCdib3R0b20nKTtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgwLCcgKyBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgKyAnKScpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICBsZXQgeU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCB5TWF4ID0gZDMubWF4KGRhdGFQb2ludHMsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBnaXZlIGEgcGFkIG9mICUgdG8gbWluL21heCBzbyB3ZSBhcmUgbm90IGFnYWluc3QgeC1heGlzXG4gICAgICAgICAgeU1heCA9IHlNYXggKyAoeU1heCAqIDAuMDMpO1xuICAgICAgICAgIHlNaW4gPSB5TWluIC0gKHlNaW4gKiAwLjA1KTtcblxuICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAucmFuZ2VSb3VuZChbbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCAwXSlcbiAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgIC5kb21haW4oW3lNaW4sIHlNYXhdKTtcblxuICAgICAgICAgIGxldCBudW1iZXJPZlRpY2tzID0gc2hvd1lBeGlzVmFsdWVzID8gMiA6IDA7XG5cbiAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAudGlja3MobnVtYmVyT2ZUaWNrcylcbiAgICAgICAgICAgIC50aWNrU2l6ZSg0LCAwKVxuICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgeUF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh5QXhpcyk7XG5cbiAgICAgICAgICBsZXQgYXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgICAgIC5pbnRlcnBvbGF0ZSgnY2FyZGluYWwnKVxuICAgICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gIWQuZW1wdHk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55MSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgY29udGV4dExpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAuaW50ZXJwb2xhdGUoJ2NhcmRpbmFsJylcbiAgICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IHBhdGhDb250ZXh0TGluZSA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGguY29udGV4dExpbmUnKS5kYXRhKFtkYXRhUG9pbnRzXSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuYXR0cignY2xhc3MnLCAnY29udGV4dExpbmUnKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBjb250ZXh0TGluZSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRMaW5lJylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5hdHRyKCdkJywgY29udGV4dExpbmUpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgcGF0aENvbnRleHRMaW5lLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIGxldCBjb250ZXh0QXJlYSA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHQnKTtcblxuICAgICAgICAgIGNvbnRleHRBcmVhLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuZGF0dW0oZGF0YVBvaW50cylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5kdXJhdGlvbig1MDApXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dEFyZWEnKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBhcmVhKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWEF4aXNCcnVzaCgpIHtcblxuICAgICAgICAgIGJydXNoID0gZDMuc3ZnLmJydXNoKClcbiAgICAgICAgICAgIC54KHRpbWVTY2FsZSlcbiAgICAgICAgICAgIC5vbignYnJ1c2hzdGFydCcsIGNvbnRleHRCcnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGNvbnRleHRCcnVzaEVuZCk7XG5cbiAgICAgICAgICB4QXhpc0dyb3VwLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCd5JywgMClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBoZWlnaHQgLSAxMCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYnJ1c2gnKVxuICAgICAgICAgICAgLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJy5yZXNpemUnKS5hcHBlbmQoJ3BhdGgnKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBoZWlnaHQgKyAxNyk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBjb250ZXh0QnJ1c2hTdGFydCgpIHtcbiAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCB0cnVlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjb250ZXh0QnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgYnJ1c2hFeHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChicnVzaEV4dGVudFswXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChicnVzaEV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvLy8gV2UgaWdub3JlIGRyYWcgc2VsZWN0aW9ucyB1bmRlciBhIG1pbnV0ZVxuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5DT05URVhUX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGJydXNoRXh0ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vZDMuc2VsZWN0KHdpbmRvdykub24oJ3Jlc2l6ZScsIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpKTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhUG9pbnRzID0gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZnVuY3Rpb24gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChyZXNwb25zZSk6IElDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAvLyAgVGhlIHNjaGVtYSBpcyBkaWZmZXJlbnQgZm9yIGJ1Y2tldGVkIG91dHB1dFxuICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6IElDaGFydERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXMgPSBwb2ludC50aW1lc3RhbXAgfHwgKHBvaW50LnN0YXJ0ICsgKHBvaW50LmVuZCAtIHBvaW50LnN0YXJ0KSAvIDIpO1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wLFxuICAgICAgICAgICAgICAgIC8vZGF0ZTogbmV3IERhdGUodGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQudmFsdWUpID8gdW5kZWZpbmVkIDogcG9pbnQudmFsdWUsXG4gICAgICAgICAgICAgICAgYXZnOiAocG9pbnQuZW1wdHkpID8gdW5kZWZpbmVkIDogcG9pbnQuYXZnLFxuICAgICAgICAgICAgICAgIG1pbjogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWluKSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1pbixcbiAgICAgICAgICAgICAgICBtYXg6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1heCkgPyB1bmRlZmluZWQgOiBwb2ludC5tYXgsXG4gICAgICAgICAgICAgICAgZW1wdHk6IHBvaW50LmVtcHR5XG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pID0+IHtcbiAgICAgICAgICBpZiAoZGF0YVBvaW50cyAmJiBkYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUudGltZSgnY29udGV4dENoYXJ0UmVuZGVyJyk7XG5cbiAgICAgICAgICAgIC8vL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIHJlc2l6ZSgpO1xuICAgICAgICAgICAgY3JlYXRlQ29udGV4dENoYXJ0KGRhdGFQb2ludHMpO1xuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuICAgICAgICAgICAgY29uc29sZS50aW1lRW5kKCdjb250ZXh0Q2hhcnRSZW5kZXInKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuXG4gICAgfVxuXG4gICAgcHVibGljIHN0YXRpYyBGYWN0b3J5KCkge1xuICAgICAgbGV0IGRpcmVjdGl2ZSA9ICgkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IENvbnRleHRDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnaGtDb250ZXh0Q2hhcnQnLCBDb250ZXh0Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSgpKTtcbn1cbiIsIi8vL1xuLy8vIENvcHlyaWdodCAyMDE1IFJlZCBIYXQsIEluYy4gYW5kL29yIGl0cyBhZmZpbGlhdGVzXG4vLy8gYW5kIG90aGVyIGNvbnRyaWJ1dG9ycyBhcyBpbmRpY2F0ZWQgYnkgdGhlIEBhdXRob3IgdGFncy5cbi8vL1xuLy8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy8vXG4vLy8gICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vLy9cbi8vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8vL1xuLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvLy8gTk9URTogdGhpcyBwYXR0ZXJuIGlzIHVzZWQgYmVjYXVzZSBlbnVtcyBjYW50IGJlIHVzZWQgd2l0aCBzdHJpbmdzXG4gIGV4cG9ydCBjbGFzcyBFdmVudE5hbWVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnQ2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG4gICAgcHVibGljIHN0YXRpYyBBVkFJTF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdBdmFpbENoYXJ0VGltZVJhbmdlQ2hhbmdlZCcpO1xuICAgIHB1YmxpYyBzdGF0aWMgVElNRUxJTkVfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnVGltZWxpbmVDaGFydFRpbWVSYW5nZUNoYW5nZWQnKTtcbiAgICBwdWJsaWMgc3RhdGljIFRJTUVMSU5FX0NIQVJUX0RPVUJMRV9DTElDS19FVkVOVCA9IG5ldyBFdmVudE5hbWVzKCdUaW1lbGluZUNoYXJ0RG91YmxlQ2xpY2tFdmVudCcpO1xuICAgIHB1YmxpYyBzdGF0aWMgQ09OVEVYVF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdDb250ZXh0Q2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG4gICAgcHVibGljIHN0YXRpYyBEQVRFX1JBTkdFX0RSQUdfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdEYXRlUmFuZ2VEcmFnQ2hhbmdlZCcpO1xuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAvLyBlbXB0eVxuICAgIH1cblxuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgcmV0dXJuIHRoaXMudmFsdWU7XG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8qKlxuICAgKiBDcmVhdGUgZGF0YSBwb2ludHMgYWxvbmcgdGhlIGxpbmUgdG8gc2hvdyB0aGUgYWN0dWFsIHZhbHVlcy5cbiAgICogQHBhcmFtIHN2Z1xuICAgKiBAcGFyYW0gdGltZVNjYWxlXG4gICAqIEBwYXJhbSB5U2NhbGVcbiAgICogQHBhcmFtIHRpcFxuICAgKiBAcGFyYW0gZGF0YVBvaW50c1xuICAgKi9cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURhdGFQb2ludHMoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgdGlwOiBhbnksXG4gICAgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICBsZXQgcmFkaXVzID0gMTtcbiAgICBsZXQgZG90RGF0YXBvaW50ID0gc3ZnLnNlbGVjdEFsbCgnLmRhdGFQb2ludERvdCcpLmRhdGEoZGF0YVBvaW50cyk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgZG90RGF0YXBvaW50LmF0dHIoJ2NsYXNzJywgJ2RhdGFQb2ludERvdCcpXG4gICAgICAuYXR0cigncicsIHJhZGl1cylcbiAgICAgIC5hdHRyKCdjeCcsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2N5JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gZC5hdmcgPyB5U2NhbGUoZC5hdmcpIDogLTk5OTk5OTk7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgZnVuY3Rpb24oZCwgaSkge1xuICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgZG90RGF0YXBvaW50LmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2RhdGFQb2ludERvdCcpXG4gICAgICAuYXR0cigncicsIHJhZGl1cylcbiAgICAgIC5hdHRyKCdjeCcsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2N5JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gZC5hdmcgPyB5U2NhbGUoZC5hdmcpIDogLTk5OTk5OTk7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgZnVuY3Rpb24oZCwgaSkge1xuICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgZG90RGF0YXBvaW50LmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZUZvcmVjYXN0TGluZShuZXdJbnRlcnBvbGF0aW9uLCB0aW1lU2NhbGUsIHlTY2FsZSkge1xuICAgIGxldCBpbnRlcnBvbGF0ZSA9IG5ld0ludGVycG9sYXRpb24gfHwgJ21vbm90b25lJyxcbiAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHlTY2FsZShkLnZhbHVlKTtcbiAgICAgICAgfSk7XG5cbiAgICByZXR1cm4gbGluZTtcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YTogSVByZWRpY3RpdmVNZXRyaWNbXSwgY2hhcnRPcHRpb25zOiBDaGFydE9wdGlvbnMpIHtcbiAgICBsZXQgZXhpc3RzTWluT3JNYXgsXG4gICAgICBsYXN0Rm9yZWNhc3RQb2ludCA9IGZvcmVjYXN0RGF0YVtmb3JlY2FzdERhdGEubGVuZ3RoIC0gMV07XG5cbiAgICBleGlzdHNNaW5Pck1heCA9IGxhc3RGb3JlY2FzdFBvaW50Lm1pbiB8fCBsYXN0Rm9yZWNhc3RQb2ludC5tYXg7XG5cbiAgICBpZiAoZXhpc3RzTWluT3JNYXgpIHtcbiAgICAgIGxldFxuICAgICAgICBtYXhBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pO1xuXG4gICAgICBsZXRcbiAgICAgICAgcHJlZGljdGl2ZUNvbmVBcmVhUGF0aCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdwYXRoLkNvbmVBcmVhJykuZGF0YShbZm9yZWNhc3REYXRhXSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIHByZWRpY3RpdmVDb25lQXJlYVBhdGguYXR0cignY2xhc3MnLCAnY29uZUFyZWEnKVxuICAgICAgICAuYXR0cignZCcsIG1heEFyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBwcmVkaWN0aXZlQ29uZUFyZWFQYXRoLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbmVBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBtYXhBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgcHJlZGljdGl2ZUNvbmVBcmVhUGF0aC5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICB9XG5cbiAgICBsZXQgZm9yZWNhc3RQYXRoTGluZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuZm9yZWNhc3RMaW5lJykuZGF0YShbZm9yZWNhc3REYXRhXSk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgZm9yZWNhc3RQYXRoTGluZS5hdHRyKCdjbGFzcycsICdmb3JlY2FzdExpbmUnKVxuICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVGb3JlY2FzdExpbmUoJ21vbm90b25lJywgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLnlTY2FsZSkpO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGZvcmVjYXN0UGF0aExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2ZvcmVjYXN0TGluZScpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUZvcmVjYXN0TGluZSgnbW9ub3RvbmUnLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlKSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgZm9yZWNhc3RQYXRoTGluZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgaW1wb3J0IGNyZWF0ZVN2Z0RlZnMgPSBDaGFydHMuY3JlYXRlU3ZnRGVmcztcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGRlY2xhcmUgbGV0IGQzOiBhbnk7XG4gIGRlY2xhcmUgbGV0IGNvbnNvbGU6IGFueTtcblxuICBsZXQgZGVidWc6IGJvb2xlYW4gPSBmYWxzZTtcblxuICAvLyB0aGUgc2NhbGUgdG8gdXNlIGZvciB5LWF4aXMgd2hlbiBhbGwgdmFsdWVzIGFyZSAwLCBbMCwgREVGQVVMVF9ZX1NDQUxFXVxuICBleHBvcnQgY29uc3QgREVGQVVMVF9ZX1NDQUxFID0gMTA7XG4gIGV4cG9ydCBjb25zdCBYX0FYSVNfSEVJR0hUID0gMjU7IC8vIHdpdGggcm9vbSBmb3IgbGFiZWxcbiAgZXhwb3J0IGNvbnN0IEhPVkVSX0RBVEVfVElNRV9GT1JNQVQgPSAnTU0vREQvWVlZWSBoOm1tIGEnO1xuICBleHBvcnQgY29uc3QgbWFyZ2luID0geyB0b3A6IDEwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA5MCB9OyAvLyBsZWZ0IG1hcmdpbiByb29tIGZvciBsYWJlbFxuICBleHBvcnQgbGV0IHdpZHRoO1xuXG4gIC8qKlxuICAgKiBAbmdkb2MgZGlyZWN0aXZlXG4gICAqIEBuYW1lIGhhd2t1bGFyQ2hhcnRcbiAgICogQGRlc2NyaXB0aW9uIEEgZDMgYmFzZWQgY2hhcnRpbmcgZGlyZWN0aW9uIHRvIHByb3ZpZGUgY2hhcnRpbmcgdXNpbmcgdmFyaW91cyBzdHlsZXMgb2YgY2hhcnRzLlxuICAgKlxuICAgKi9cbiAgYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycpXG4gICAgLmRpcmVjdGl2ZSgnaGtNZXRyaWNDaGFydCcsIFsnJHJvb3RTY29wZScsICckaHR0cCcsICckd2luZG93JywgJyRpbnRlcnZhbCcsICckbG9nJyxcbiAgICAgIGZ1bmN0aW9uKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlLFxuICAgICAgICAkaHR0cDogbmcuSUh0dHBTZXJ2aWNlLFxuICAgICAgICAkd2luZG93OiBuZy5JV2luZG93U2VydmljZSxcbiAgICAgICAgJGludGVydmFsOiBuZy5JSW50ZXJ2YWxTZXJ2aWNlLFxuICAgICAgICAkbG9nOiBuZy5JTG9nU2VydmljZSk6IG5nLklEaXJlY3RpdmUge1xuXG4gICAgICAgIGZ1bmN0aW9uIGxpbmsoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSB7XG5cbiAgICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgICBsZXQgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10gPSBbXSxcbiAgICAgICAgICAgIG11bHRpRGF0YVBvaW50czogSU11bHRpRGF0YVBvaW50W10sXG4gICAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHM6IElQcmVkaWN0aXZlTWV0cmljW10sXG4gICAgICAgICAgICBkYXRhVXJsID0gYXR0cnMubWV0cmljVXJsLFxuICAgICAgICAgICAgbWV0cmljSWQgPSBhdHRycy5tZXRyaWNJZCB8fCAnJyxcbiAgICAgICAgICAgIG1ldHJpY1RlbmFudElkID0gYXR0cnMubWV0cmljVGVuYW50SWQgfHwgJycsXG4gICAgICAgICAgICBtZXRyaWNUeXBlID0gYXR0cnMubWV0cmljVHlwZSB8fCAnZ2F1Z2UnLFxuICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzID0gK2F0dHJzLnRpbWVSYW5nZUluU2Vjb25kcyB8fCA0MzIwMCxcbiAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyA9ICthdHRycy5yZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgfHwgMzYwMCxcbiAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSArYXR0cnMuYWxlcnRWYWx1ZSxcbiAgICAgICAgICAgIGludGVycG9sYXRpb24gPSBhdHRycy5pbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IERhdGUubm93KCksXG4gICAgICAgICAgICBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gZW5kVGltZXN0YW1wIC0gdGltZVJhbmdlSW5TZWNvbmRzLFxuICAgICAgICAgICAgcHJldmlvdXNSYW5nZURhdGFQb2ludHMgPSBbXSxcbiAgICAgICAgICAgIGFubm90YXRpb25EYXRhID0gW10sXG4gICAgICAgICAgICBjaGFydFR5cGUgPSBhdHRycy5jaGFydFR5cGUgfHwgJ2xpbmUnLFxuICAgICAgICAgICAgc2luZ2xlVmFsdWVMYWJlbCA9IGF0dHJzLnNpbmdsZVZhbHVlTGFiZWwgfHwgJ1JhdyBWYWx1ZScsXG4gICAgICAgICAgICBub0RhdGFMYWJlbCA9IGF0dHJzLm5vRGF0YUxhYmVsIHx8ICdObyBEYXRhJyxcbiAgICAgICAgICAgIGR1cmF0aW9uTGFiZWwgPSBhdHRycy5kdXJhdGlvbkxhYmVsIHx8ICdJbnRlcnZhbCcsXG4gICAgICAgICAgICBtaW5MYWJlbCA9IGF0dHJzLm1pbkxhYmVsIHx8ICdNaW4nLFxuICAgICAgICAgICAgbWF4TGFiZWwgPSBhdHRycy5tYXhMYWJlbCB8fCAnTWF4JyxcbiAgICAgICAgICAgIGF2Z0xhYmVsID0gYXR0cnMuYXZnTGFiZWwgfHwgJ0F2ZycsXG4gICAgICAgICAgICB0aW1lc3RhbXBMYWJlbCA9IGF0dHJzLnRpbWVzdGFtcExhYmVsIHx8ICdUaW1lc3RhbXAnLFxuICAgICAgICAgICAgc2hvd0F2Z0xpbmUgPSB0cnVlLFxuICAgICAgICAgICAgc2hvd0RhdGFQb2ludHMgPSBmYWxzZSxcbiAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzID0gZmFsc2UsXG4gICAgICAgICAgICB1c2VaZXJvTWluVmFsdWUgPSBmYWxzZTtcblxuICAgICAgICAgIC8vIGNoYXJ0IHNwZWNpZmljIHZhcnNcblxuICAgICAgICAgIGxldCBoZWlnaHQsXG4gICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsXG4gICAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCArIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgICBjaGFydERhdGEsXG4gICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgICAgdGlwLFxuICAgICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgICBicnVzaEdyb3VwLFxuICAgICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgICBjaGFydFBhcmVudCxcbiAgICAgICAgICAgIHN2ZyxcbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4sXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgcGVhayxcbiAgICAgICAgICAgIG1pbixcbiAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEsXG4gICAgICAgICAgICBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSxcbiAgICAgICAgICAgIHN0YXJ0SW50ZXJ2YWxQcm9taXNlO1xuXG4gICAgICAgICAgZGF0YVBvaW50cyA9IGF0dHJzLmRhdGE7XG4gICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gYXR0cnMuZm9yZWNhc3REYXRhO1xuICAgICAgICAgIHNob3dEYXRhUG9pbnRzID0gYXR0cnMuc2hvd0RhdGFQb2ludHM7XG4gICAgICAgICAgcHJldmlvdXNSYW5nZURhdGFQb2ludHMgPSBhdHRycy5wcmV2aW91c1JhbmdlRGF0YTtcbiAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IGF0dHJzLmFubm90YXRpb25EYXRhO1xuXG4gICAgICAgICAgY29uc3QgcmVnaXN0ZXJlZENoYXJ0VHlwZXM6IElDaGFydFR5cGVbXSA9IFtdO1xuICAgICAgICAgIHJlZ2lzdGVyZWRDaGFydFR5cGVzLnB1c2gobmV3IExpbmVDaGFydCgpKTtcbiAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5wdXNoKG5ldyBBcmVhQ2hhcnQoKSk7XG4gICAgICAgICAgcmVnaXN0ZXJlZENoYXJ0VHlwZXMucHVzaChuZXcgU2NhdHRlckNoYXJ0KCkpO1xuICAgICAgICAgIHJlZ2lzdGVyZWRDaGFydFR5cGVzLnB1c2gobmV3IFNjYXR0ZXJMaW5lQ2hhcnQoKSk7XG4gICAgICAgICAgcmVnaXN0ZXJlZENoYXJ0VHlwZXMucHVzaChuZXcgSGlzdG9ncmFtQ2hhcnQoKSk7XG4gICAgICAgICAgcmVnaXN0ZXJlZENoYXJ0VHlwZXMucHVzaChuZXcgUmhxQmFyQ2hhcnQoKSk7XG4gICAgICAgICAgcmVnaXN0ZXJlZENoYXJ0VHlwZXMucHVzaChuZXcgTXVsdGlMaW5lQ2hhcnQoKSk7XG5cbiAgICAgICAgICBmdW5jdGlvbiByZXNpemUoKTogdm9pZCB7XG4gICAgICAgICAgICAvLyBkZXN0cm95IGFueSBwcmV2aW91cyBjaGFydHNcbiAgICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuXG4gICAgICAgICAgICBjb25zdCBwYXJlbnROb2RlID0gZWxlbWVudFswXS5wYXJlbnROb2RlO1xuXG4gICAgICAgICAgICB3aWR0aCA9ICg8YW55PnBhcmVudE5vZGUpLmNsaWVudFdpZHRoO1xuICAgICAgICAgICAgaGVpZ2h0ID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50SGVpZ2h0O1xuXG4gICAgICAgICAgICBpZiAod2lkdGggPT09IDApIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3Igc2V0dGluZyB1cCBjaGFydC4gV2lkdGggaXMgMCBvbiBjaGFydCBwYXJlbnQgY29udGFpbmVyLmApO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGVpZ2h0ID09PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIHNldHRpbmcgdXAgY2hhcnQuIEhlaWdodCBpcyAwIG9uIGNoYXJ0IHBhcmVudCBjb250YWluZXIuYCk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20gLSBYX0FYSVNfSEVJR0hUO1xuXG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdNZXRyaWMgV2lkdGg6ICVpJywgd2lkdGgpO1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnTWV0cmljIEhlaWdodDogJWknLCBoZWlnaHQpO1xuXG4gICAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcDtcblxuICAgICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoICsgbWFyZ2luLmxlZnQgKyBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBpbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgICAgLy9jcmVhdGVTdmdEZWZzKGNoYXJ0KTtcblxuICAgICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywnICsgKG1hcmdpbi50b3ApICsgJyknKTtcblxuICAgICAgICAgICAgdGlwID0gZDMudGlwKClcbiAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2QzLXRpcCcpXG4gICAgICAgICAgICAgIC5vZmZzZXQoWy0xMCwgMF0pXG4gICAgICAgICAgICAgIC5odG1sKChkLCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ1aWxkSG92ZXIoZCwgaSk7XG4gICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuXG4gICAgICAgICAgICAvLyBhIHBsYWNlaG9sZGVyIGZvciB0aGUgYWxlcnRzXG4gICAgICAgICAgICBzdmcuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnYWxlcnRIb2xkZXInKTtcblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIHNldHVwRmlsdGVyZWREYXRhKGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKTogdm9pZCB7XG5cbiAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgIHBlYWsgPSBkMy5tYXgoZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyAoZC5hdmcgfHwgZC52YWx1ZSkgOiAwO1xuICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgICAgbWluID0gZDMubWluKGRhdGFQb2ludHMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpID8gKGQuYXZnIHx8IGQudmFsdWUpIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vLyBsZXRzIGFkanVzdCB0aGUgbWluIGFuZCBtYXggdG8gYWRkIHNvbWUgdmlzdWFsIHNwYWNpbmcgYmV0d2VlbiBpdCBhbmQgdGhlIGF4ZXNcbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluICogLjk1O1xuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcblxuICAgICAgICAgICAgLy8vIGNoZWNrIGlmIHdlIG5lZWQgdG8gYWRqdXN0IGhpZ2gvbG93IGJvdW5kIHRvIGZpdCBhbGVydCB2YWx1ZVxuICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IE1hdGgubWF4KHZpc3VhbGx5QWRqdXN0ZWRNYXgsIGFsZXJ0VmFsdWUgKiAxLjIpO1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluID0gTWF0aC5taW4odmlzdWFsbHlBZGp1c3RlZE1pbiwgYWxlcnRWYWx1ZSAqIC45NSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vLyB1c2UgZGVmYXVsdCBZIHNjYWxlIGluIGNhc2UgaGlnaCBhbmQgbG93IGJvdW5kIGFyZSAwIChpZSwgbm8gdmFsdWVzIG9yIGFsbCAwKVxuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9ICEhIXZpc3VhbGx5QWRqdXN0ZWRNYXggJiYgISEhdmlzdWFsbHlBZGp1c3RlZE1pbiA/IERFRkFVTFRfWV9TQ0FMRSA6XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXg7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gZ2V0WVNjYWxlKCk6IGFueSB7XG4gICAgICAgICAgICByZXR1cm4gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgLmNsYW1wKHRydWUpXG4gICAgICAgICAgICAgIC5yYW5nZVJvdW5kKFttb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsIDBdKVxuICAgICAgICAgICAgICAuZG9tYWluKFt2aXN1YWxseUFkanVzdGVkTWluLCB2aXN1YWxseUFkanVzdGVkTWF4XSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lU2NhbGUoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICAgICAgICAgIGxldCB4VGlja3MgPSBkZXRlcm1pbmVYQXhpc1RpY2tzRnJvbVNjcmVlbldpZHRoKHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQpLFxuICAgICAgICAgICAgICB5VGlja3MgPSBkZXRlcm1pbmVZQXhpc1RpY2tzRnJvbVNjcmVlbkhlaWdodChtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG5cbiAgICAgICAgICAgICAgY2hhcnREYXRhID0gZGF0YVBvaW50cztcblxuICAgICAgICAgICAgICBzZXR1cEZpbHRlcmVkRGF0YShkYXRhUG9pbnRzKTtcblxuICAgICAgICAgICAgICB5U2NhbGUgPSBnZXRZU2NhbGUoKTtcblxuICAgICAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAgIC50aWNrcyh5VGlja3MpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgICAgIGxldCB0aW1lU2NhbGVNaW4gPSBkMy5taW4oZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZC50aW1lc3RhbXA7XG4gICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgICBsZXQgdGltZVNjYWxlTWF4O1xuICAgICAgICAgICAgICBpZiAoZm9yZWNhc3REYXRhUG9pbnRzICYmIGZvcmVjYXN0RGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdGltZVNjYWxlTWF4ID0gZm9yZWNhc3REYXRhUG9pbnRzW2ZvcmVjYXN0RGF0YVBvaW50cy5sZW5ndGggLSAxXS50aW1lc3RhbXA7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGltZVNjYWxlTWF4ID0gZDMubWF4KGRhdGFQb2ludHMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZC50aW1lc3RhbXA7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0XSlcbiAgICAgICAgICAgICAgICAubmljZSgpXG4gICAgICAgICAgICAgICAgLmRvbWFpbihbdGltZVNjYWxlTWluLCB0aW1lU2NhbGVNYXhdKTtcblxuICAgICAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgICAgIC50aWNrcyh4VGlja3MpXG4gICAgICAgICAgICAgICAgLnRpY2tGb3JtYXQoeEF4aXNUaW1lRm9ybWF0cygpKVxuICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgIC5vcmllbnQoJ2JvdHRvbScpO1xuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gc2V0dXBGaWx0ZXJlZE11bHRpRGF0YShtdWx0aURhdGFQb2ludHM6IElNdWx0aURhdGFQb2ludFtdKTogYW55IHtcbiAgICAgICAgICAgIGxldCBhbGVydFBlYWs6IG51bWJlcixcbiAgICAgICAgICAgICAgaGlnaFBlYWs6IG51bWJlcjtcblxuICAgICAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lTXVsdGlEYXRhTWluTWF4KCkge1xuICAgICAgICAgICAgICBsZXQgY3VycmVudE1heDogbnVtYmVyLFxuICAgICAgICAgICAgICAgIGN1cnJlbnRNaW46IG51bWJlcixcbiAgICAgICAgICAgICAgICBzZXJpZXNNYXg6IG51bWJlcixcbiAgICAgICAgICAgICAgICBzZXJpZXNNaW46IG51bWJlcixcbiAgICAgICAgICAgICAgICBtYXhMaXN0OiBudW1iZXJbXSA9IFtdLFxuICAgICAgICAgICAgICAgIG1pbkxpc3Q6IG51bWJlcltdID0gW107XG5cbiAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzLmZvckVhY2goKHNlcmllcykgPT4ge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRNYXggPSBkMy5tYXgoc2VyaWVzLnZhbHVlcy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6IGQuYXZnO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICBtYXhMaXN0LnB1c2goY3VycmVudE1heCk7XG4gICAgICAgICAgICAgICAgY3VycmVudE1pbiA9IGQzLm1pbihzZXJpZXMudmFsdWVzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpID8gZC5hdmcgOiBOdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICBtaW5MaXN0LnB1c2goY3VycmVudE1pbik7XG5cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHNlcmllc01heCA9IGQzLm1heChtYXhMaXN0KTtcbiAgICAgICAgICAgICAgc2VyaWVzTWluID0gZDMubWluKG1pbkxpc3QpO1xuICAgICAgICAgICAgICByZXR1cm4gW3Nlcmllc01pbiwgc2VyaWVzTWF4XTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbWluTWF4ID0gZGV0ZXJtaW5lTXVsdGlEYXRhTWluTWF4KCk7XG4gICAgICAgICAgICBwZWFrID0gbWluTWF4WzFdO1xuICAgICAgICAgICAgbWluID0gbWluTWF4WzBdO1xuXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluID0gdXNlWmVyb01pblZhbHVlID8gMCA6IG1pbiAtIChtaW4gKiAwLjA1KTtcbiAgICAgICAgICAgIGlmIChhbGVydFZhbHVlKSB7XG4gICAgICAgICAgICAgIGFsZXJ0UGVhayA9IChhbGVydFZhbHVlICogMS4yKTtcbiAgICAgICAgICAgICAgaGlnaFBlYWsgPSBwZWFrICsgKChwZWFrIC0gbWluKSAqIDAuMik7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBhbGVydFBlYWsgPiBoaWdoUGVhayA/IGFsZXJ0UGVhayA6IGhpZ2hQZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIFt2aXN1YWxseUFkanVzdGVkTWluLCAhISF2aXN1YWxseUFkanVzdGVkTWF4ICYmICEhIXZpc3VhbGx5QWRqdXN0ZWRNaW4gPyBERUZBVUxUX1lfU0NBTEUgOlxuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4XTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVNdWx0aVNjYWxlKG11bHRpRGF0YVBvaW50czogSU11bHRpRGF0YVBvaW50W10pIHtcbiAgICAgICAgICAgIGNvbnN0IHhUaWNrcyA9IGRldGVybWluZVhBeGlzVGlja3NGcm9tU2NyZWVuV2lkdGgod2lkdGggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCksXG4gICAgICAgICAgICAgIHlUaWNrcyA9IGRldGVybWluZVhBeGlzVGlja3NGcm9tU2NyZWVuV2lkdGgobW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgICAgaWYgKG11bHRpRGF0YVBvaW50cyAmJiBtdWx0aURhdGFQb2ludHNbMF0gJiYgbXVsdGlEYXRhUG9pbnRzWzBdLnZhbHVlcykge1xuXG4gICAgICAgICAgICAgIGxldCBsb3dIaWdoID0gc2V0dXBGaWx0ZXJlZE11bHRpRGF0YShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluID0gbG93SGlnaFswXTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IGxvd0hpZ2hbMV07XG5cbiAgICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt2aXN1YWxseUFkanVzdGVkTWluLCB2aXN1YWxseUFkanVzdGVkTWF4XSk7XG5cbiAgICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAudGlja3MoeVRpY2tzKVxuICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHRdKVxuICAgICAgICAgICAgICAgIC5kb21haW4oW2QzLm1pbihtdWx0aURhdGFQb2ludHMsIChkKSA9PiBkMy5taW4oZC52YWx1ZXMsIChwKSA9PiBwLnRpbWVzdGFtcCkpLFxuICAgICAgICAgICAgICAgICAgZDMubWF4KG11bHRpRGF0YVBvaW50cywgKGQpID0+IGQzLm1heChkLnZhbHVlcywgKHApID0+IHAudGltZXN0YW1wKSldKTtcblxuICAgICAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgICAgIC50aWNrcyh4VGlja3MpXG4gICAgICAgICAgICAgICAgLnRpY2tGb3JtYXQoeEF4aXNUaW1lRm9ybWF0cygpKVxuICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgIC5vcmllbnQoJ2JvdHRvbScpO1xuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLyoqXG4gICAgICAgICAgICogTG9hZCBtZXRyaWNzIGRhdGEgZGlyZWN0bHkgZnJvbSBhIHJ1bm5pbmcgSGF3a3VsYXItTWV0cmljcyBzZXJ2ZXJcbiAgICAgICAgICAgKiBAcGFyYW0gdXJsXG4gICAgICAgICAgICogQHBhcmFtIG1ldHJpY0lkXG4gICAgICAgICAgICogQHBhcmFtIHN0YXJ0VGltZXN0YW1wXG4gICAgICAgICAgICogQHBhcmFtIGVuZFRpbWVzdGFtcFxuICAgICAgICAgICAqIEBwYXJhbSBidWNrZXRzXG4gICAgICAgICAgICovXG4gICAgICAgICAgZnVuY3Rpb24gbG9hZFN0YW5kQWxvbmVNZXRyaWNzRm9yVGltZVJhbmdlKHVybDogVXJsVHlwZSxcbiAgICAgICAgICAgIG1ldHJpY0lkOiBNZXRyaWNJZCxcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOiBUaW1lSW5NaWxsaXMsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgICAgICAgIGJ1Y2tldHMgPSA2MCkge1xuXG4gICAgICAgICAgICBsZXQgcmVxdWVzdENvbmZpZzogbmcuSVJlcXVlc3RDb25maWcgPSA8YW55PntcbiAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICdIYXdrdWxhci1UZW5hbnQnOiBtZXRyaWNUZW5hbnRJZFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICBzdGFydDogc3RhcnRUaW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgZW5kOiBlbmRUaW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgYnVja2V0czogYnVja2V0c1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAoc3RhcnRUaW1lc3RhbXAgPj0gZW5kVGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgICRsb2cubG9nKCdTdGFydCBkYXRlIHdhcyBhZnRlciBlbmQgZGF0ZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodXJsICYmIG1ldHJpY1R5cGUgJiYgbWV0cmljSWQpIHtcblxuICAgICAgICAgICAgICBsZXQgbWV0cmljVHlwZUFuZERhdGEgPSBtZXRyaWNUeXBlLnNwbGl0KCctJyk7XG4gICAgICAgICAgICAgIC8vLyBzYW1wbGUgdXJsOlxuICAgICAgICAgICAgICAvLy8gaHR0cDovL2xvY2FsaG9zdDo4MDgwL2hhd2t1bGFyL21ldHJpY3MvZ2F1Z2VzLzQ1YjIyNTZlZmYxOWNiOTgyNTQyYjE2N2IzOTU3MDM2LnN0YXR1cy5kdXJhdGlvbi9kYXRhP1xuICAgICAgICAgICAgICAvLyBidWNrZXRzPTEyMCZlbmQ9MTQzNjgzMTc5NzUzMyZzdGFydD0xNDM2ODI4MTk3NTMzJ1xuICAgICAgICAgICAgICAkaHR0cC5nZXQodXJsICsgJy8nICsgbWV0cmljVHlwZUFuZERhdGFbMF0gKyAncy8nICsgbWV0cmljSWQgKyAnLycgKyAobWV0cmljVHlwZUFuZERhdGFbMV0gfHwgJ2RhdGEnKSxcbiAgICAgICAgICAgICAgICByZXF1ZXN0Q29uZmlnKS5zdWNjZXNzKChyZXNwb25zZSkgPT4ge1xuXG4gICAgICAgICAgICAgICAgICBwcm9jZXNzZWROZXdEYXRhID0gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChyZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG5cbiAgICAgICAgICAgICAgICB9KS5lcnJvcigocmVhc29uLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICRsb2cuZXJyb3IoJ0Vycm9yIExvYWRpbmcgQ2hhcnQgRGF0YTonICsgc3RhdHVzICsgJywgJyArIHJlYXNvbik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvKipcbiAgICAgICAgICAgKiBUcmFuc2Zvcm0gdGhlIHJhdyBodHRwIHJlc3BvbnNlIGZyb20gTWV0cmljcyB0byBvbmUgdXNhYmxlIGluIGNoYXJ0c1xuICAgICAgICAgICAqIEBwYXJhbSByZXNwb25zZVxuICAgICAgICAgICAqIEByZXR1cm5zIHRyYW5zZm9ybWVkIHJlc3BvbnNlIHRvIElDaGFydERhdGFQb2ludFtdLCByZWFkeSB0byBiZSBjaGFydGVkXG4gICAgICAgICAgICovXG4gICAgICAgICAgZnVuY3Rpb24gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChyZXNwb25zZSk6IElDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAgIC8vICBUaGUgc2NoZW1hIGlzIGRpZmZlcmVudCBmb3IgYnVja2V0ZWQgb3V0cHV0XG4gICAgICAgICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6IElDaGFydERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IHBvaW50LnRpbWVzdGFtcCB8fCAocG9pbnQuc3RhcnQgKyAocG9pbnQuZW5kIC0gcG9pbnQuc3RhcnQpIC8gMik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgZGF0ZTogbmV3IERhdGUodGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlOiAhYW5ndWxhci5pc051bWJlcihwb2ludC52YWx1ZSkgPyB1bmRlZmluZWQgOiBwb2ludC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICAgIG1pbjogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWluKSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1pbixcbiAgICAgICAgICAgICAgICAgIG1heDogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWF4KSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1heCxcbiAgICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGJ1aWxkSG92ZXIoZDogSUNoYXJ0RGF0YVBvaW50LCBpOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGxldCBob3ZlcixcbiAgICAgICAgICAgICAgcHJldlRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgY3VycmVudFRpbWVzdGFtcCA9IGQudGltZXN0YW1wLFxuICAgICAgICAgICAgICBiYXJEdXJhdGlvbixcbiAgICAgICAgICAgICAgZm9ybWF0dGVkRGF0ZVRpbWUgPSBtb21lbnQoZC50aW1lc3RhbXApLmZvcm1hdChIT1ZFUl9EQVRFX1RJTUVfRk9STUFUKTtcblxuICAgICAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgICAgIHByZXZUaW1lc3RhbXAgPSBjaGFydERhdGFbaSAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgYmFyRHVyYXRpb24gPSBtb21lbnQoY3VycmVudFRpbWVzdGFtcCkuZnJvbShtb21lbnQocHJldlRpbWVzdGFtcCksIHRydWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNFbXB0eURhdGFQb2ludChkKSkge1xuICAgICAgICAgICAgICAvLyBub2RhdGFcbiAgICAgICAgICAgICAgaG92ZXIgPSBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICAgICAgPHNtYWxsIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7bm9EYXRhTGFiZWx9PC9zbWFsbD5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2R1cmF0aW9uTGFiZWx9PC9zcGFuPjxzcGFuPjpcbiAgICAgICAgICAgICAgICA8L3NwYW4+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+PC9zbWFsbD4gPC9kaXY+XG4gICAgICAgICAgICAgICAgPGhyLz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46XG4gICAgICAgICAgICAgICAgPC9zcGFuPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7Zm9ybWF0dGVkRGF0ZVRpbWV9PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChpc1Jhd01ldHJpYyhkKSkge1xuICAgICAgICAgICAgICAgIC8vIHJhdyBzaW5nbGUgdmFsdWUgZnJvbSByYXcgdGFibGVcbiAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7YmFyRHVyYXRpb259PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgICA8aHIvPlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtzaW5nbGVWYWx1ZUxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZDMucm91bmQoZC52YWx1ZSwgMil9PC9zcGFuPjwvc21hbGw+IDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPC9kaXY+IGA7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gYWdncmVnYXRlIHdpdGggbWluL2F2Zy9tYXhcbiAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtmb3JtYXR0ZWREYXRlVGltZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gYmVmb3JlLXNlcGFyYXRvcic+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21heExhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1heCwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2F2Z0xhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLmF2ZywgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21pbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1pbiwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PiBgO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaG92ZXI7XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVZQXhpc0dyaWRMaW5lcygpIHtcbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgeSBheGlzIGdyaWQgbGluZXNcbiAgICAgICAgICAgIGNvbnN0IG51bWJlck9mWUF4aXNHcmlkTGluZXMgPSBkZXRlcm1pbmVZQXhpc0dyaWRMaW5lVGlja3NGcm9tU2NyZWVuSGVpZ2h0KG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICAgIHlTY2FsZSA9IGdldFlTY2FsZSgpO1xuXG4gICAgICAgICAgICBpZiAoeVNjYWxlKSB7XG4gICAgICAgICAgICAgIGxldCB5QXhpcyA9IHN2Zy5zZWxlY3RBbGwoJ2cuZ3JpZC55X2dyaWQnKTtcbiAgICAgICAgICAgICAgaWYgKCF5QXhpc1swXS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB5QXhpcyA9IHN2Zy5hcHBlbmQoJ2cnKS5jbGFzc2VkKCdncmlkIHlfZ3JpZCcsIHRydWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHlBeGlzXG4gICAgICAgICAgICAgICAgLmNhbGwoZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKVxuICAgICAgICAgICAgICAgICAgLnRpY2tzKG51bWJlck9mWUF4aXNHcmlkTGluZXMpXG4gICAgICAgICAgICAgICAgICAudGlja1NpemUoLXdpZHRoLCAwKVxuICAgICAgICAgICAgICAgICAgLnRpY2tGb3JtYXQoJycpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVYYW5kWUF4ZXMoKSB7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGF4aXNUcmFuc2l0aW9uKHNlbGVjdGlvbikge1xuICAgICAgICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgICAgLmRlbGF5KDI1MClcbiAgICAgICAgICAgICAgICAuZHVyYXRpb24oNzUwKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMS4wKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHlBeGlzKSB7XG5cbiAgICAgICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAgICAgLyogdHNsaW50OmRpc2FibGU6bm8tdW51c2VkLXZhcmlhYmxlICovXG5cbiAgICAgICAgICAgICAgLy8gY3JlYXRlIHgtYXhpc1xuICAgICAgICAgICAgICBsZXQgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd4IGF4aXMnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKDAsJyArIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCArICcpJylcbiAgICAgICAgICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuMylcbiAgICAgICAgICAgICAgICAuY2FsbCh4QXhpcylcbiAgICAgICAgICAgICAgICAuY2FsbChheGlzVHJhbnNpdGlvbik7XG5cbiAgICAgICAgICAgICAgLy8gY3JlYXRlIHktYXhpc1xuICAgICAgICAgICAgICBsZXQgeUF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd5IGF4aXMnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgIC5jYWxsKHlBeGlzKVxuICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcblxuICAgICAgICAgICAgICBsZXQgeUF4aXNMYWJlbCA9IHN2Zy5zZWxlY3RBbGwoJy55QXhpc1VuaXRzTGFiZWwnKTtcbiAgICAgICAgICAgICAgaWYgKG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCA+PSAxNTAgJiYgYXR0cnMueUF4aXNVbml0cykge1xuICAgICAgICAgICAgICAgIHlBeGlzTGFiZWwgPSBzdmcuYXBwZW5kKCd0ZXh0JykuYXR0cignY2xhc3MnLCAneUF4aXNVbml0c0xhYmVsJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAncm90YXRlKC05MCksdHJhbnNsYXRlKC0yMCwtNTApJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCd4JywgLW1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCAvIDIpXG4gICAgICAgICAgICAgICAgICAuc3R5bGUoJ3RleHQtYW5jaG9yJywgJ2NlbnRlcicpXG4gICAgICAgICAgICAgICAgICAudGV4dChhdHRycy55QXhpc1VuaXRzID09PSAnTk9ORScgPyAnJyA6IGF0dHJzLnlBeGlzVW5pdHMpXG4gICAgICAgICAgICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuMylcbiAgICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlQ2VudGVyZWRMaW5lKG5ld0ludGVycG9sYXRpb24pIHtcbiAgICAgICAgICAgIGxldCBpbnRlcnBvbGF0ZSA9IG5ld0ludGVycG9sYXRpb24gfHwgJ21vbm90b25lJyxcbiAgICAgICAgICAgICAgbGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGUpXG4gICAgICAgICAgICAgICAgLmRlZmluZWQoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC54KChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC55KChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gbGluZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVBdmdMaW5lcygpIHtcbiAgICAgICAgICAgIGlmIChjaGFydFR5cGUgPT09ICdiYXInIHx8IGNoYXJ0VHlwZSA9PT0gJ3NjYXR0ZXJsaW5lJykge1xuICAgICAgICAgICAgICBsZXQgcGF0aEF2Z0xpbmUgPSBzdmcuc2VsZWN0QWxsKCcuYmFyQXZnTGluZScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgICAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICAgICAgcGF0aEF2Z0xpbmUuYXR0cignY2xhc3MnLCAnYmFyQXZnTGluZScpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVDZW50ZXJlZExpbmUoJ21vbm90b25lJykpO1xuICAgICAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICAgICAgcGF0aEF2Z0xpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdiYXJBdmdMaW5lJylcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUNlbnRlcmVkTGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgICAgICBwYXRoQXZnTGluZS5leGl0KCkucmVtb3ZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlWEF4aXNCcnVzaCgpIHtcblxuICAgICAgICAgICAgYnJ1c2hHcm91cCA9IHN2Zy5zZWxlY3RBbGwoJ2cuYnJ1c2gnKTtcbiAgICAgICAgICAgIGlmIChicnVzaEdyb3VwLmVtcHR5KCkpIHtcbiAgICAgICAgICAgICAgYnJ1c2hHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdicnVzaCcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAgIC54KHRpbWVTY2FsZSlcbiAgICAgICAgICAgICAgLm9uKCdicnVzaHN0YXJ0JywgYnJ1c2hTdGFydClcbiAgICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGJydXNoRW5kKTtcblxuICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoKTtcblxuICAgICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJy5yZXNpemUnKS5hcHBlbmQoJ3BhdGgnKTtcblxuICAgICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gYnJ1c2hTdGFydCgpIHtcbiAgICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsIHRydWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBicnVzaEVuZCgpIHtcbiAgICAgICAgICAgICAgbGV0IGV4dGVudCA9IGJydXNoLmV4dGVudCgpLFxuICAgICAgICAgICAgICAgIHN0YXJ0VGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgICAgZW5kVGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzFdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgICAgZHJhZ1NlbGVjdGlvbkRlbHRhID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcblxuICAgICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgIWQzLmV2ZW50LnRhcmdldC5lbXB0eSgpKTtcbiAgICAgICAgICAgICAgLy8gaWdub3JlIHJhbmdlIHNlbGVjdGlvbnMgbGVzcyB0aGFuIDEgbWludXRlXG4gICAgICAgICAgICAgIGlmIChkcmFnU2VsZWN0aW9uRGVsdGEgPj0gNjAwMDApIHtcbiAgICAgICAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHMgPSBbXTtcblxuICAgICAgICAgICAgICAgIGxldCBjaGFydE9wdGlvbnM6IENoYXJ0T3B0aW9ucyA9IG5ldyBDaGFydE9wdGlvbnMoc3ZnLCB0aW1lU2NhbGUsIHlTY2FsZSwgY2hhcnREYXRhLCBtdWx0aURhdGFQb2ludHMsXG4gICAgICAgICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsIGhlaWdodCwgdGlwLCB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMsIGludGVycG9sYXRpb24pO1xuXG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEV2ZW50TmFtZXMuQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQudG9TdHJpbmcoKSwgZXh0ZW50KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyBjbGVhciB0aGUgYnJ1c2ggc2VsZWN0aW9uXG4gICAgICAgICAgICAgIGJydXNoR3JvdXAuY2FsbChicnVzaC5jbGVhcigpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVByZXZpb3VzUmFuZ2VPdmVybGF5KHByZXZSYW5nZURhdGEpIHtcbiAgICAgICAgICAgIGlmIChwcmV2UmFuZ2VEYXRhKSB7XG4gICAgICAgICAgICAgIHN2Zy5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgICAgIC5kYXR1bShwcmV2UmFuZ2VEYXRhKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdwcmV2UmFuZ2VBdmdMaW5lJylcbiAgICAgICAgICAgICAgICAuc3R5bGUoJ3N0cm9rZS1kYXNoYXJyYXknLCAoJzksMycpKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlQ2VudGVyZWRMaW5lKCdsaW5lYXInKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBhbm5vdGF0ZUNoYXJ0KGFubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICBpZiAoYW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnLmFubm90YXRpb25Eb3QnKVxuICAgICAgICAgICAgICAgIC5kYXRhKGFubm90YXRpb25EYXRhKVxuICAgICAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYW5ub3RhdGlvbkRvdCcpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3InLCA1KVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjeScsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBoZWlnaHQgLSB5U2NhbGUodmlzdWFsbHlBZGp1c3RlZE1heCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKGQuc2V2ZXJpdHkgPT09ICcxJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGQuc2V2ZXJpdHkgPT09ICcyJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ3llbGxvdyc7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ3doaXRlJztcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEsIG9sZERhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdEYXRhIHx8IG9sZERhdGEpIHtcbiAgICAgICAgICAgICAgcHJvY2Vzc2VkTmV3RGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24obmV3RGF0YSB8fCBbXSk7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgnbXVsdGlEYXRhJywgKG5ld011bHRpRGF0YSwgb2xkTXVsdGlEYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3TXVsdGlEYXRhIHx8IG9sZE11bHRpRGF0YSkge1xuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMgPSBhbmd1bGFyLmZyb21Kc29uKG5ld011bHRpRGF0YSB8fCBbXSk7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgncHJldmlvdXNSYW5nZURhdGEnLCAobmV3UHJldmlvdXNSYW5nZVZhbHVlcykgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld1ByZXZpb3VzUmFuZ2VWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEgPSBhbmd1bGFyLmZyb21Kc29uKG5ld1ByZXZpb3VzUmFuZ2VWYWx1ZXMpO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ2Fubm90YXRpb25EYXRhJywgKG5ld0Fubm90YXRpb25EYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3QW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGEgPSBhbmd1bGFyLmZyb21Kc29uKG5ld0Fubm90YXRpb25EYXRhKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdmb3JlY2FzdERhdGEnLCAobmV3Rm9yZWNhc3REYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3Rm9yZWNhc3REYXRhKSB7XG4gICAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IGFuZ3VsYXIuZnJvbUpzb24obmV3Rm9yZWNhc3REYXRhKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydhbGVydFZhbHVlJywgJ2NoYXJ0VHlwZScsICdoaWRlSGlnaExvd1ZhbHVlcycsICd1c2VaZXJvTWluVmFsdWUnLCAnc2hvd0F2Z0xpbmUnXSxcbiAgICAgICAgICAgIChjaGFydEF0dHJzKSA9PiB7XG4gICAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSBjaGFydEF0dHJzWzBdIHx8IGFsZXJ0VmFsdWU7XG4gICAgICAgICAgICAgIGNoYXJ0VHlwZSA9IGNoYXJ0QXR0cnNbMV0gfHwgY2hhcnRUeXBlO1xuICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyA9ICh0eXBlb2YgY2hhcnRBdHRyc1syXSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1syXSA6IGhpZGVIaWdoTG93VmFsdWVzO1xuICAgICAgICAgICAgICB1c2VaZXJvTWluVmFsdWUgPSAodHlwZW9mIGNoYXJ0QXR0cnNbM10gIT09ICd1bmRlZmluZWQnKSA/IGNoYXJ0QXR0cnNbM10gOiB1c2VaZXJvTWluVmFsdWU7XG4gICAgICAgICAgICAgIHNob3dBdmdMaW5lID0gKHR5cGVvZiBjaGFydEF0dHJzWzRdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzRdIDogc2hvd0F2Z0xpbmU7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgZnVuY3Rpb24gbG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdygpIHtcbiAgICAgICAgICAgIGVuZFRpbWVzdGFtcCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBzdGFydFRpbWVzdGFtcCA9IG1vbWVudCgpLnN1YnRyYWN0KHRpbWVSYW5nZUluU2Vjb25kcywgJ3NlY29uZHMnKS52YWx1ZU9mKCk7XG4gICAgICAgICAgICBsb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UoZGF0YVVybCwgbWV0cmljSWQsIHN0YXJ0VGltZXN0YW1wLCBlbmRUaW1lc3RhbXAsIDYwKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLy8gc3RhbmRhbG9uZSBjaGFydHMgYXR0cmlidXRlc1xuICAgICAgICAgIHNjb3BlLiR3YXRjaEdyb3VwKFsnbWV0cmljVXJsJywgJ21ldHJpY0lkJywgJ21ldHJpY1R5cGUnLCAnbWV0cmljVGVuYW50SWQnLCAndGltZVJhbmdlSW5TZWNvbmRzJ10sXG4gICAgICAgICAgICAoc3RhbmRBbG9uZVBhcmFtcykgPT4ge1xuICAgICAgICAgICAgICBkYXRhVXJsID0gc3RhbmRBbG9uZVBhcmFtc1swXSB8fCBkYXRhVXJsO1xuICAgICAgICAgICAgICBtZXRyaWNJZCA9IHN0YW5kQWxvbmVQYXJhbXNbMV0gfHwgbWV0cmljSWQ7XG4gICAgICAgICAgICAgIG1ldHJpY1R5cGUgPSBzdGFuZEFsb25lUGFyYW1zWzJdIHx8IG1ldHJpY0lkO1xuICAgICAgICAgICAgICBtZXRyaWNUZW5hbnRJZCA9IHN0YW5kQWxvbmVQYXJhbXNbM10gfHwgbWV0cmljVGVuYW50SWQ7XG4gICAgICAgICAgICAgIHRpbWVSYW5nZUluU2Vjb25kcyA9IHN0YW5kQWxvbmVQYXJhbXNbNF0gfHwgdGltZVJhbmdlSW5TZWNvbmRzO1xuICAgICAgICAgICAgICBsb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93KCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgncmVmcmVzaEludGVydmFsSW5TZWNvbmRzJywgKG5ld1JlZnJlc2hJbnRlcnZhbCkgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld1JlZnJlc2hJbnRlcnZhbCkge1xuICAgICAgICAgICAgICByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgPSArbmV3UmVmcmVzaEludGVydmFsO1xuICAgICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHN0YXJ0SW50ZXJ2YWxQcm9taXNlKTtcbiAgICAgICAgICAgICAgc3RhcnRJbnRlcnZhbFByb21pc2UgPSAkaW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc1RpbWVSYW5nZUZyb21Ob3coKTtcbiAgICAgICAgICAgICAgfSwgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzICogMTAwMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgKCkgPT4ge1xuICAgICAgICAgICAgJGludGVydmFsLmNhbmNlbChzdGFydEludGVydmFsUHJvbWlzZSk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzY29wZS4kb24oRXZlbnROYW1lcy5EQVRFX1JBTkdFX0RSQUdfQ0hBTkdFRCwgKGV2ZW50LCBleHRlbnQpID0+IHtcbiAgICAgICAgICAgIHNjb3BlLiRlbWl0KEV2ZW50TmFtZXMuQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQsIGV4dGVudCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzY29wZS4kb24oRXZlbnROYW1lcy5DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCwgKGV2ZW50LCBleHRlbnQpID0+IHtcbiAgICAgICAgICAgIC8vIGZvcmVjYXN0IGRhdGEgbm90IHJlbGV2YW50IHRvIHBhc3QgZGF0YVxuICAgICAgICAgICAgYXR0cnMuZm9yZWNhc3REYXRhID0gW107XG4gICAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHMgPSBbXTtcbiAgICAgICAgICAgIHNjb3BlLiRkaWdlc3QoKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZUNoYXJ0VHlwZUFuZERyYXcoY2hhcnRUeXBlOiBzdHJpbmcsIGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zKSB7XG5cbiAgICAgICAgICAgIC8vQHRvZG86IGFkZCBpbiBtdWx0aWxpbmUgYW5kIHJocWJhciBjaGFydCB0eXBlc1xuICAgICAgICAgICAgLy9AdG9kbzogYWRkIHZhbGlkYXRpb24gaWYgbm90IGluIHZhbGlkIGNoYXJ0IHR5cGVzXG4gICAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5mb3JFYWNoKChhQ2hhcnRUeXBlKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChhQ2hhcnRUeXBlLm5hbWUgPT09IGNoYXJ0VHlwZSkge1xuICAgICAgICAgICAgICAgIGFDaGFydFR5cGUuZHJhd0NoYXJ0KGNoYXJ0T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc2NvcGUucmVuZGVyID0gKGRhdGFQb2ludHMpID0+IHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgZGF0YSwgZG9uJ3QgYm90aGVyLi5cbiAgICAgICAgICAgIGlmICghZGF0YVBvaW50cyAmJiAhbXVsdGlEYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRlYnVnKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXAoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgICBjb25zb2xlLnRpbWUoJ2NoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIHJlc2l6ZSgpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50cykge1xuICAgICAgICAgICAgICBkZXRlcm1pbmVTY2FsZShkYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vbXVsdGlEYXRhUG9pbnRzIGV4aXN0XG4gICAgICAgICAgICAgIGRldGVybWluZU11bHRpU2NhbGUobXVsdGlEYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zID0gbmV3IENoYXJ0T3B0aW9ucyhzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCBjaGFydERhdGEsIG11bHRpRGF0YVBvaW50cyxcbiAgICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCBoZWlnaHQsIHRpcCwgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMsIGludGVycG9sYXRpb24pO1xuXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+IHZpc3VhbGx5QWRqdXN0ZWRNaW4gJiYgYWxlcnRWYWx1ZSA8IHZpc3VhbGx5QWRqdXN0ZWRNYXgpKSB7XG4gICAgICAgICAgICAgIGNyZWF0ZUFsZXJ0Qm91bmRzQXJlYShjaGFydE9wdGlvbnMsIGFsZXJ0VmFsdWUsIHZpc3VhbGx5QWRqdXN0ZWRNYXgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjcmVhdGVYQXhpc0JydXNoKCk7XG4gICAgICAgICAgICBjcmVhdGVZQXhpc0dyaWRMaW5lcygpO1xuICAgICAgICAgICAgZGV0ZXJtaW5lQ2hhcnRUeXBlQW5kRHJhdyhjaGFydFR5cGUsIGNoYXJ0T3B0aW9ucyk7XG5cbiAgICAgICAgICAgIGlmIChzaG93RGF0YVBvaW50cykge1xuICAgICAgICAgICAgICBjcmVhdGVEYXRhUG9pbnRzKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIHRpcCwgY2hhcnREYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNyZWF0ZVByZXZpb3VzUmFuZ2VPdmVybGF5KHByZXZpb3VzUmFuZ2VEYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIGNyZWF0ZVhhbmRZQXhlcygpO1xuICAgICAgICAgICAgaWYgKHNob3dBdmdMaW5lKSB7XG4gICAgICAgICAgICAgIGNyZWF0ZUF2Z0xpbmVzKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhbGVydFZhbHVlICYmIChhbGVydFZhbHVlID4gdmlzdWFsbHlBZGp1c3RlZE1pbiAmJiBhbGVydFZhbHVlIDwgdmlzdWFsbHlBZGp1c3RlZE1heCkpIHtcbiAgICAgICAgICAgICAgLy8vIE5PVEU6IHRoaXMgYWxlcnQgbGluZSBoYXMgaGlnaGVyIHByZWNlZGVuY2UgZnJvbSBhbGVydCBhcmVhIGFib3ZlXG4gICAgICAgICAgICAgIGNyZWF0ZUFsZXJ0TGluZShjaGFydE9wdGlvbnMsIGFsZXJ0VmFsdWUsICdhbGVydExpbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgIGFubm90YXRlQ2hhcnQoYW5ub3RhdGlvbkRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZvcmVjYXN0RGF0YVBvaW50cyAmJiBmb3JlY2FzdERhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YVBvaW50cywgY2hhcnRPcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICBjb25zb2xlLnRpbWVFbmQoJ2NoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGxpbms6IGxpbmssXG4gICAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgICByZXBsYWNlOiB0cnVlLFxuICAgICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICBkYXRhOiAnPScsXG4gICAgICAgICAgICBtdWx0aURhdGE6ICc9JyxcbiAgICAgICAgICAgIGZvcmVjYXN0RGF0YTogJz0nLFxuICAgICAgICAgICAgbWV0cmljVXJsOiAnQCcsXG4gICAgICAgICAgICBtZXRyaWNJZDogJ0AnLFxuICAgICAgICAgICAgbWV0cmljVHlwZTogJ0AnLFxuICAgICAgICAgICAgbWV0cmljVGVuYW50SWQ6ICdAJyxcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgICAgICAgIHRpbWVSYW5nZUluU2Vjb25kczogJ0AnLFxuICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzOiAnQCcsXG4gICAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YTogJ0AnLFxuICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGE6ICdAJyxcbiAgICAgICAgICAgIHNob3dEYXRhUG9pbnRzOiAnPScsXG4gICAgICAgICAgICBhbGVydFZhbHVlOiAnQCcsXG4gICAgICAgICAgICBpbnRlcnBvbGF0aW9uOiAnQCcsXG4gICAgICAgICAgICBjaGFydFR5cGU6ICdAJyxcbiAgICAgICAgICAgIHlBeGlzVW5pdHM6ICdAJyxcbiAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZTogJz0nLFxuICAgICAgICAgICAgY2hhcnRIb3ZlckRhdGVGb3JtYXQ6ICdAJyxcbiAgICAgICAgICAgIGNoYXJ0SG92ZXJUaW1lRm9ybWF0OiAnQCcsXG4gICAgICAgICAgICBzaW5nbGVWYWx1ZUxhYmVsOiAnQCcsXG4gICAgICAgICAgICBub0RhdGFMYWJlbDogJ0AnLFxuICAgICAgICAgICAgZHVyYXRpb25MYWJlbDogJ0AnLFxuICAgICAgICAgICAgbWluTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIG1heExhYmVsOiAnQCcsXG4gICAgICAgICAgICBhdmdMYWJlbDogJ0AnLFxuICAgICAgICAgICAgdGltZXN0YW1wTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIHNob3dBdmdMaW5lOiAnPScsXG4gICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlczogJz0nXG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgXVxuICAgIClcbiAgICA7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkZWNsYXJlIGxldCBkMzogYW55O1xuXG4gLy8gTWFuYWdlSVEgRXh0ZXJuYWwgTWFuYWdlbWVudCBTeXN0ZW0gRXZlbnRcbiAgZXhwb3J0IGNsYXNzIEVtc0V2ZW50IHtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgICAgICAgICAgICBwdWJsaWMgZXZlbnRTb3VyY2U6IHN0cmluZyxcbiAgICAgICAgICAgICAgICBwdWJsaWMgcHJvdmlkZXI6IHN0cmluZyxcbiAgICAgICAgICAgICAgICBwdWJsaWMgbWVzc2FnZT86IHN0cmluZyxcbiAgICAgICAgICAgICAgICBwdWJsaWMgbWlkZGxld2FyZVJlc291cmNlPzogc3RyaW5nKSB7XG4gICAgfVxuICB9XG5cbi8vIFRpbWVsaW5lIHNwZWNpZmljIGZvciBNYW5hZ2VJUSBUaW1lbGluZSBjb21wb25lbnRcbiAgLyoqXG4gICAqIFRpbWVsaW5lRXZlbnQgaXMgYSBzdWJjbGFzcyBvZiBFbXNFdmVudCB0aGF0IGlzIHNwZWNpYWxpemVkIHRvd2FyZCBzY3JlZW4gZGlzcGxheVxuICAgKi9cbiAgZXhwb3J0IGNsYXNzIFRpbWVsaW5lRXZlbnQgZXh0ZW5kcyBFbXNFdmVudCB7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXMsXG4gICAgICAgICAgICAgICAgcHVibGljIGV2ZW50U291cmNlOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIHByb3ZpZGVyOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIG1lc3NhZ2U/OiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIG1pZGRsZXdhcmVSZXNvdXJjZT86IHN0cmluZyxcbiAgICAgICAgICAgICAgICBwdWJsaWMgZm9ybWF0dGVkRGF0ZT86IHN0cmluZyxcbiAgICAgICAgICAgICAgICBwdWJsaWMgY29sb3I/OiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIHJvdz86IG51bWJlcixcbiAgICAgICAgICAgICAgICBwdWJsaWMgc2VsZWN0ZWQ/OiBib29sZWFuKSB7XG4gICAgICBzdXBlcih0aW1lc3RhbXAsIGV2ZW50U291cmNlLCBwcm92aWRlciwgbWVzc2FnZSwgbWlkZGxld2FyZVJlc291cmNlKTtcbiAgICAgIHRoaXMuZm9ybWF0dGVkRGF0ZSA9IG1vbWVudCh0aW1lc3RhbXApLmZvcm1hdCgnTU1NTSBEbyBZWVlZLCBoOm1tOnNzIGEnKTtcbiAgICAgIHRoaXMuc2VsZWN0ZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCdWlsZCBUaW1lbGluZUV2ZW50cyBmcm9tIEVtc0V2ZW50c1xuICAgICAqIEBwYXJhbSBlbXNFdmVudHNcbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIGJ1aWxkRXZlbnRzKGVtc0V2ZW50czogRW1zRXZlbnRbXSk6IFRpbWVsaW5lRXZlbnRbXSB7XG4gICAgICAvLyAgVGhlIHNjaGVtYSBpcyBkaWZmZXJlbnQgZm9yIGJ1Y2tldGVkIG91dHB1dFxuICAgICAgaWYgKGVtc0V2ZW50cykge1xuICAgICAgICByZXR1cm4gZW1zRXZlbnRzLm1hcCgoZW1zRXZlbnQ6IEVtc0V2ZW50KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHRpbWVzdGFtcDogZW1zRXZlbnQudGltZXN0YW1wLFxuICAgICAgICAgICAgZXZlbnRTb3VyY2U6IGVtc0V2ZW50LmV2ZW50U291cmNlLFxuICAgICAgICAgICAgcHJvdmlkZXI6IGVtc0V2ZW50LmV2ZW50U291cmNlLFxuICAgICAgICAgICAgbWVzc2FnZTogZW1zRXZlbnQubWVzc2FnZSxcbiAgICAgICAgICAgIG1pZGRsZXdhcmVSZXNvdXJjZTogZW1zRXZlbnQubWlkZGxld2FyZVJlc291cmNlLFxuICAgICAgICAgICAgZm9ybWF0dGVkRGF0ZTogbW9tZW50KGVtc0V2ZW50LnRpbWVzdGFtcCkuZm9ybWF0KCdNTU1NIERvIFlZWVksIGg6bW06c3MgYScpLFxuICAgICAgICAgICAgY29sb3I6IGVtc0V2ZW50LmV2ZW50U291cmNlID09PSAnSGF3a3VsYXInID8gJyMwMDg4Y2UnIDogJyNlYzdhMDgnLFxuICAgICAgICAgICAgcm93OiBSb3dOdW1iZXIubmV4dFJvdygpLFxuICAgICAgICAgICAgc2VsZWN0ZWQ6IGZhbHNlXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQnVpbGRGYWtlRXZlbnRzIGlzIGEgZmFrZSBldmVudCBidWlsZGVyIGZvciB0ZXN0aW5nL3Byb3RvdHlwaW5nXG4gICAgICogQHBhcmFtIG4gdGhlIG51bWJlciBvZiBldmVudHMgeW91IHdhbnQgZ2VuZXJhdGVkXG4gICAgICogQHBhcmFtIHN0YXJ0VGltZVN0YW1wXG4gICAgICogQHBhcmFtIGVuZFRpbWVzdGFtcFxuICAgICAqIEByZXR1cm5zIHtUaW1lbGluZUV2ZW50W119XG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBidWlsZEZha2VFdmVudHMobjogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VGltZVN0YW1wOiBUaW1lSW5NaWxsaXMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kVGltZXN0YW1wOiBUaW1lSW5NaWxsaXMpOiBUaW1lbGluZUV2ZW50W10ge1xuICAgICAgbGV0IGV2ZW50czogVGltZWxpbmVFdmVudFtdID0gW107XG4gICAgICBjb25zdCBzdGVwID0gKGVuZFRpbWVzdGFtcCAtIHN0YXJ0VGltZVN0YW1wKSAvIG47XG5cbiAgICAgIGZvcihsZXQgaSA9ICBzdGFydFRpbWVTdGFtcDsgaSA8IGVuZFRpbWVzdGFtcDsgaSArPSBzdGVwKSB7XG4gICAgICAgIGxldCByYW5kb21UaW1lID0gUmFuZG9tLnJhbmRvbUJldHdlZW4oc3RhcnRUaW1lU3RhbXAsIGVuZFRpbWVzdGFtcCk7XG4gICAgICAgIGNvbnN0IGV2ZW50ID0gbmV3IFRpbWVsaW5lRXZlbnQocmFuZG9tVGltZSwgJ0hhd2t1bGFyJywgJ0hhd2t1bGFyIFByb3ZpZGVyJyxcbiAgICAgICAgICAnU29tZSBNZXNzYWdlJywgJ1Jlc291cmNlJyArICctJyArIFJhbmRvbS5yYW5kb21CZXR3ZWVuKDEwLDEwMCksXG4gICAgICAgICAgbW9tZW50KGkpLmZvcm1hdCgnTU1NTSBEbyBZWVlZLCBoOm1tOnNzIGEnKSwgJzAwODhjZScsIFJvd051bWJlci5uZXh0Um93KCkpO1xuXG4gICAgICAgIGV2ZW50cy5wdXNoKGV2ZW50KTtcblxuICAgICAgfVxuICAgICAgcmV0dXJuIGV2ZW50cztcbiAgICB9XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBSYW5kb20gbnVtYmVyIGdlbmVyYXRvclxuICAgKi9cbiAgZXhwb3J0IGNsYXNzIFJhbmRvbSB7XG4gICAgcHVibGljIHN0YXRpYyByYW5kb21CZXR3ZWVuKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbiArIDEpKSArIG1pbjtcbiAgICB9XG4gIH1cbiAgLyoqXG4gICAqIFJvd051bWJlciBjbGFzcyB1c2VkIHRvIGNhbGN1bGF0ZSB3aGljaCByb3cgaW4gdGhlIFRpbWVsaW5lQ2hhcnQgYW4gRXZlbnQgc2hvdWxkIGJlIHBsYWNlZC5cbiAgICogVGhpcyBpcyBzbyBldmVudHMgZG9uJ3QgcGlsZSB1cCBvbiBlYWNoIG90aGVyLiBUaGUgbmV4dCBldmVudCB3aWxsIGJlIHBsYWNlZCBvbiB0aGUgbmV4dCByb3dcbiAgICogc3VjaCB0aGF0IGxhYmVscyBjYW4gYmUgcGxhY2VkXG4gICAqL1xuICBjbGFzcyBSb3dOdW1iZXIge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX2N1cnJlbnRSb3cgPSAwO1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHJvdyBudW1iZXIgZnJvbSAxIHRvIDUgZm9yIGRldGVybWluaW5nIHdoaWNoIHJvdyBhbiBldmVudCBzaG91bGQgYmUgcGxhY2VkIG9uLlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBuZXh0Um93KCk6IG51bWJlciB7XG4gICAgICBjb25zdCBNQVhfUk9XUyA9IDU7XG5cbiAgICAgIFJvd051bWJlci5fY3VycmVudFJvdysrO1xuXG4gICAgICBpZihSb3dOdW1iZXIuX2N1cnJlbnRSb3cgPiBNQVhfUk9XUykge1xuICAgICAgICBSb3dOdW1iZXIuX2N1cnJlbnRSb3cgPSAxOyAvLyByZXNldCBiYWNrIHRvIHplcm9cbiAgICAgIH1cbiAgICAgIC8vIHJldmVyc2UgdGhlIG9yZGVyaW5nIG9mIHRoZSBudW1iZXJzIHNvIHRoYXQgMSBiZWNvbWVzIDVcbiAgICAgIC8vIHNvIHRoYXQgdGhlIGV2ZW50cyBhcmUgbGFpZCBvdXQgZnJvbSB0b3AgLT4gYm90dG9tIGluc3RlYWQgb2YgYm90dG9tIC0+IHRvcFxuICAgICAgcmV0dXJuIChNQVhfUk9XUyArIDEgKSAtIFJvd051bWJlci5fY3VycmVudFJvdztcbiAgICB9XG5cbiAgfVxuXG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cbiAgZXhwb3J0IGNsYXNzIFRpbWVsaW5lQ2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX0hFSUdIVCA9IDE1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfV0lEVEggPSA3NTA7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGV2ZW50czogJz0nLFxuICAgICAgc3RhcnRUaW1lc3RhbXA6ICdAJywgLy8gdG8gcHJvdmlkZSBmb3IgZXhhY3QgYm91bmRhcmllcyBvZiBzdGFydC9zdG9wIHRpbWVzIChpZiBvbWl0dGVkLCBpdCB3aWxsIGJlIGNhbGN1bGF0ZWQpXG4gICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6IChzY29wZTogYW55LCBlbGVtZW50OiBuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczogYW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIGV2ZW50czogVGltZWxpbmVFdmVudFtdO1xuXG4gICAgY29uc3RydWN0b3IoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpIHtcblxuICAgICAgdGhpcy5saW5rID0gKHNjb3BlLCBlbGVtZW50LCBhdHRycykgPT4ge1xuXG4gICAgICAgIC8vIGRhdGEgc3BlY2lmaWMgdmFyc1xuICAgICAgICBsZXQgc3RhcnRUaW1lc3RhbXA6IG51bWJlciA9ICthdHRycy5zdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICBlbmRUaW1lc3RhbXA6IG51bWJlciA9ICthdHRycy5lbmRUaW1lc3RhbXAsXG4gICAgICAgICAgY2hhcnRIZWlnaHQ6IG51bWJlciA9IFRpbWVsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVDtcblxuICAgICAgICAvLyBjaGFydCBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBtYXJnaW4gPSB7IHRvcDogMTAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDEwIH0sXG4gICAgICAgICAgd2lkdGggPSBUaW1lbGluZUNoYXJ0RGlyZWN0aXZlLl9DSEFSVF9XSURUSCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0LFxuICAgICAgICAgIGFkanVzdGVkQ2hhcnRIZWlnaHQgPSBjaGFydEhlaWdodCAtIDUwLFxuICAgICAgICAgIGhlaWdodCA9IGFkanVzdGVkQ2hhcnRIZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICB0aXRsZUhlaWdodCA9IDMwLFxuICAgICAgICAgIHRpdGxlU3BhY2UgPSAxMCxcbiAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCAtIHRpdGxlSGVpZ2h0IC0gdGl0bGVTcGFjZSxcbiAgICAgICAgICBhZGp1c3RlZENoYXJ0SGVpZ2h0MiA9ICt0aXRsZUhlaWdodCArIHRpdGxlU3BhY2UgKyBtYXJnaW4udG9wLFxuICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgeUF4aXMsXG4gICAgICAgICAgeEF4aXMsXG4gICAgICAgICAgeEF4aXNHcm91cCxcbiAgICAgICAgICBicnVzaCxcbiAgICAgICAgICBicnVzaEdyb3VwLFxuICAgICAgICAgIHRpcCxcbiAgICAgICAgICBjaGFydCxcbiAgICAgICAgICBjaGFydFBhcmVudCxcbiAgICAgICAgICBzdmc7XG5cbiAgICAgICAgZnVuY3Rpb24gVGltZWxpbmVIb3ZlcihkOiBUaW1lbGluZUV2ZW50KSB7XG4gICAgICAgICAgcmV0dXJuIGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSc+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPkV2ZW50IFNvdXJjZTo8L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZC5ldmVudFNvdXJjZX08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSc+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPlByb3ZpZGVyOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLnByb3ZpZGVyfTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+TWVzc2FnZTo8L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZC5tZXNzYWdlfTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+TWlkZGxld2FyZSBSZXNvdXJjZTo8L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZC5taWRkbGV3YXJlUmVzb3VyY2V9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz5EYXRlIFRpbWU6PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke21vbWVudChkLnRpbWVzdGFtcCkuZm9ybWF0KCdNL2QvWVksIEg6bW06c3MgJyl9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHRpbWVsaW5lQ2hhcnRTZXR1cCgpOiB2b2lkIHtcbiAgICAgICAgICAvLyBkZXN0cm95IGFueSBwcmV2aW91cyBjaGFydHNcbiAgICAgICAgICBpZiAoY2hhcnQpIHtcbiAgICAgICAgICAgIGNoYXJ0UGFyZW50LnNlbGVjdEFsbCgnKicpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjaGFydFBhcmVudCA9IGQzLnNlbGVjdChlbGVtZW50WzBdKTtcbiAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgIC5hdHRyKCd2aWV3Qm94JywgJzAgMCA3NjAgMTUwJykuYXR0cigncHJlc2VydmVBc3BlY3RSYXRpbycsICd4TWluWU1pbiBtZWV0Jyk7XG5cbiAgICAgICAgICB0aXAgPSBkMy50aXAoKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2QzLXRpcCcpXG4gICAgICAgICAgICAub2Zmc2V0KFstMTAsIDBdKVxuICAgICAgICAgICAgLmh0bWwoKGQgKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBUaW1lbGluZUhvdmVyKGQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgd2lkdGggKyBtYXJnaW4ubGVmdCArIG1hcmdpbi5yaWdodClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBpbm5lckNoYXJ0SGVpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywnICsgKGFkanVzdGVkQ2hhcnRIZWlnaHQyKSArICcpJyk7XG5cbiAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lVGltZWxpbmVTY2FsZSh0aW1lbGluZUV2ZW50OiBUaW1lbGluZUV2ZW50W10pIHtcbiAgICAgICAgICBsZXQgYWRqdXN0ZWRUaW1lUmFuZ2U6IG51bWJlcltdID0gW107XG5cbiAgICAgICAgICBzdGFydFRpbWVzdGFtcCA9ICthdHRycy5zdGFydFRpbWVzdGFtcCB8fFxuICAgICAgICAgICAgZDMubWluKHRpbWVsaW5lRXZlbnQsIChkOiBUaW1lbGluZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgIH0pIHx8ICttb21lbnQoKS5zdWJ0cmFjdCgyNCwgJ2hvdXInKTtcblxuICAgICAgICAgIGlmICh0aW1lbGluZUV2ZW50ICYmIHRpbWVsaW5lRXZlbnQubGVuZ3RoID4gMCkge1xuXG4gICAgICAgICAgICBhZGp1c3RlZFRpbWVSYW5nZVswXSA9IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgICAgYWRqdXN0ZWRUaW1lUmFuZ2VbMV0gPSBlbmRUaW1lc3RhbXAgfHwgK21vbWVudCgpO1xuXG4gICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlUm91bmQoWzcwLCAwXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihbMCwgMTc1XSk7XG5cbiAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAudGlja3MoMClcbiAgICAgICAgICAgICAgLnRpY2tTaXplKDAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgICAuZG9tYWluKGFkanVzdGVkVGltZVJhbmdlKTtcblxuICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgIC50aWNrU2l6ZSgtNzAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ3RvcCcpXG4gICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSk7XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVUaW1lbGluZUNoYXJ0KHRpbWVsaW5lRXZlbnRzdDogVGltZWxpbmVFdmVudFtdKSB7XG4gICAgICAgICAgbGV0IHhBeGlzTWluID0gZDMubWluKHRpbWVsaW5lRXZlbnRzdCwgKGQ6IFRpbWVsaW5lRXZlbnQpID0+IHtcbiAgICAgICAgICAgcmV0dXJuICtkLnRpbWVzdGFtcDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgeEF4aXNNYXggPSBkMy5tYXgodGltZWxpbmVFdmVudHN0LCAoZDogVGltZWxpbmVFdmVudCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICtkLnRpbWVzdGFtcDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgdGltZWxpbmVUaW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgLmRvbWFpbihbeEF4aXNNaW4sIHhBeGlzTWF4XSk7XG5cbiAgICAgICAgICAvLyAwLTYgaXMgdGhlIHktYXhpcyByYW5nZSwgdGhpcyBtZWFucyAxLTUgaXMgdGhlIHZhbGlkIHJhbmdlIGZvclxuICAgICAgICAgIC8vIHZhbHVlcyB0aGF0IHdvbid0IGJlIGN1dCBvZmYgaGFsZiB3YXkgYmUgZWl0aGVyIGF4aXMuXG4gICAgICAgICAgbGV0IHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2UoW2hlaWdodCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oWzAsIDZdKTtcblxuICAgICAgICAgIC8vIFRoZSBib3R0b20gbGluZSBvZiB0aGUgdGltZWxpbmUgY2hhcnRcbiAgICAgICAgICBzdmcuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAgIC5hdHRyKCd4MScsIDApXG4gICAgICAgICAgICAuYXR0cigneTEnLCA3MClcbiAgICAgICAgICAgIC5hdHRyKCd4MicsIDczNSlcbiAgICAgICAgICAgIC5hdHRyKCd5MicsIDcwKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywnaGtUaW1lbGluZUJvdHRvbUxpbmUnKTtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2NpcmNsZScpXG4gICAgICAgICAgICAuZGF0YSh0aW1lbGluZUV2ZW50c3QpXG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsIChkOiBUaW1lbGluZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkLnNlbGVjdGVkID8gJ2hrRXZlbnRTZWxlY3RlZCcgOiAnaGtFdmVudCc7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2N4JywgKGQ6IFRpbWVsaW5lRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRpbWVsaW5lVGltZVNjYWxlKG5ldyBEYXRlKGQudGltZXN0YW1wKSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2N5JywgKGQ6IFRpbWVsaW5lRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHlTY2FsZShkLnJvdyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZDogVGltZWxpbmVFdmVudCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gIGQuY29sb3I7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ3InLCAoZCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gMztcbiAgICAgICAgICAgIH0pIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICAgICAgICB9KS5vbignZGJsY2xpY2snLCAoZDogVGltZWxpbmVFdmVudCkgPT4ge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRG91YmxlLUNsaWNrZWQ6JyArIGQubWlkZGxld2FyZVJlc291cmNlKTtcbiAgICAgICAgICAgICAgZC5zZWxlY3RlZCA9ICFkLnNlbGVjdGVkO1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5USU1FTElORV9DSEFSVF9ET1VCTEVfQ0xJQ0tfRVZFTlQudG9TdHJpbmcoKSwgZCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVYYW5kWUF4ZXMoKSB7XG5cbiAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgIC8vIGNyZWF0ZSB4LWF4aXNcbiAgICAgICAgICB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneCBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHhBeGlzKTtcblxuICAgICAgICAgIC8vIGNyZWF0ZSB5LWF4aXNcbiAgICAgICAgICBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd5IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeUF4aXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWEF4aXNCcnVzaCgpIHtcblxuICAgICAgICAgIGJydXNoID0gZDMuc3ZnLmJydXNoKClcbiAgICAgICAgICAgIC54KHRpbWVTY2FsZSlcbiAgICAgICAgICAgIC5vbignYnJ1c2hzdGFydCcsIGJydXNoU3RhcnQpXG4gICAgICAgICAgICAub24oJ2JydXNoZW5kJywgYnJ1c2hFbmQpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JydXNoJylcbiAgICAgICAgICAgIC5jYWxsKGJydXNoKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCcucmVzaXplJykuYXBwZW5kKCdwYXRoJyk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgNzApO1xuXG4gICAgICAgICAgZnVuY3Rpb24gYnJ1c2hTdGFydCgpIHtcbiAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCB0cnVlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBicnVzaEVuZCgpIHtcbiAgICAgICAgICAgIGxldCBleHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMF0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgZW5kVGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzFdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgICAgIC8vc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsICFkMy5ldmVudC50YXJnZXQuZW1wdHkoKSk7XG4gICAgICAgICAgICBpZiAoZHJhZ1NlbGVjdGlvbkRlbHRhID49IDYwMDAwKSB7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChFdmVudE5hbWVzLlRJTUVMSU5FX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGV4dGVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2guY2xlYXIoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignZXZlbnRzJywgKG5ld0V2ZW50cykgPT4ge1xuICAgICAgICAgIGlmIChuZXdFdmVudHMpIHtcbiAgICAgICAgICAgIHRoaXMuZXZlbnRzID0gVGltZWxpbmVFdmVudC5idWlsZEV2ZW50cyhhbmd1bGFyLmZyb21Kc29uKG5ld0V2ZW50cykpO1xuICAgICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMuZXZlbnRzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLiR3YXRjaEdyb3VwKFsnc3RhcnRUaW1lc3RhbXAnLCAnZW5kVGltZXN0YW1wJ10sIChuZXdUaW1lc3RhbXApID0+IHtcbiAgICAgICAgICBzdGFydFRpbWVzdGFtcCA9ICtuZXdUaW1lc3RhbXBbMF0gfHwgc3RhcnRUaW1lc3RhbXA7XG4gICAgICAgICAgZW5kVGltZXN0YW1wID0gK25ld1RpbWVzdGFtcFsxXSB8fCBlbmRUaW1lc3RhbXA7XG4gICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMuZXZlbnRzKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUucmVuZGVyID0gKHRpbWVsaW5lRXZlbnQ6IFRpbWVsaW5lRXZlbnRbXSkgPT4ge1xuICAgICAgICAgIGlmICh0aW1lbGluZUV2ZW50ICYmIHRpbWVsaW5lRXZlbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgdGltZWxpbmVDaGFydFNldHVwKCk7XG4gICAgICAgICAgICBkZXRlcm1pbmVUaW1lbGluZVNjYWxlKHRpbWVsaW5lRXZlbnQpO1xuICAgICAgICAgICAgY3JlYXRlWGFuZFlBeGVzKCk7XG4gICAgICAgICAgICBjcmVhdGVYQXhpc0JydXNoKCk7XG4gICAgICAgICAgICBjcmVhdGVUaW1lbGluZUNoYXJ0KHRpbWVsaW5lRXZlbnQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcHVibGljIHN0YXRpYyBGYWN0b3J5KCkge1xuICAgICAgbGV0IGRpcmVjdGl2ZSA9ICgkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IFRpbWVsaW5lQ2hhcnREaXJlY3RpdmUoJHJvb3RTY29wZSk7XG4gICAgICB9O1xuXG4gICAgICBkaXJlY3RpdmVbJyRpbmplY3QnXSA9IFsnJHJvb3RTY29wZSddO1xuXG4gICAgICByZXR1cm4gZGlyZWN0aXZlO1xuICAgIH1cblxuICB9XG5cbiAgX21vZHVsZS5kaXJlY3RpdmUoJ2hrVGltZWxpbmVDaGFydCcsIFRpbWVsaW5lQ2hhcnREaXJlY3RpdmUuRmFjdG9yeSgpKTtcbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLy8gVHlwZSB2YWx1ZXMgYW5kIElEIHR5cGVzXG4gIGV4cG9ydCB0eXBlIEFsZXJ0VGhyZXNob2xkID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBUaW1lSW5NaWxsaXMgPSBudW1iZXI7XG4gIGV4cG9ydCB0eXBlIFVybFR5cGUgPSBudW1iZXI7XG4gIGV4cG9ydCB0eXBlIE1ldHJpY0lkID0gc3RyaW5nO1xuICBleHBvcnQgdHlwZSBNZXRyaWNWYWx1ZSA9IG51bWJlcjtcblxuICAvKipcbiAgICogTWV0cmljcyBSZXNwb25zZSBmcm9tIEhhd2t1bGFyIE1ldHJpY3NcbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSU1ldHJpY3NSZXNwb25zZURhdGFQb2ludCB7XG4gICAgc3RhcnQ6IFRpbWVJbk1pbGxpcztcbiAgICBlbmQ6IFRpbWVJbk1pbGxpcztcbiAgICB2YWx1ZT86IE1ldHJpY1ZhbHVlOyAvLy8gT25seSBmb3IgUmF3IGRhdGEgKG5vIGJ1Y2tldHMgb3IgYWdncmVnYXRlcylcbiAgICBhdmc/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgbWluPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIG1heD86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBtZWRpYW4/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgcGVyY2VudGlsZTk1dGg/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgZW1wdHk6IGJvb2xlYW47XG4gIH1cblxuICAvKipcbiAgICogU2ltcGxlc3QgTWV0cmljIGRhdGEgdHlwZVxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJU2ltcGxlTWV0cmljIHtcbiAgICB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcztcbiAgICB2YWx1ZTogTWV0cmljVmFsdWU7XG4gIH1cblxuICAvKipcbiAgICogRGF0YSBmb3IgcHJlZGljdGl2ZSAnY29uZSdcbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVByZWRpY3RpdmVNZXRyaWMgZXh0ZW5kcyBJU2ltcGxlTWV0cmljIHtcbiAgICBtaW46IE1ldHJpY1ZhbHVlO1xuICAgIG1heDogTWV0cmljVmFsdWU7XG4gIH1cblxuICBleHBvcnQgaW50ZXJmYWNlIElCYXNlQ2hhcnREYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDogVGltZUluTWlsbGlzO1xuICAgIHN0YXJ0PzogVGltZUluTWlsbGlzO1xuICAgIGVuZD86IFRpbWVJbk1pbGxpcztcbiAgICB2YWx1ZT86IE1ldHJpY1ZhbHVlOyAvLy8gT25seSBmb3IgUmF3IGRhdGEgKG5vIGJ1Y2tldHMgb3IgYWdncmVnYXRlcylcbiAgICBhdmc6IE1ldHJpY1ZhbHVlOyAvLy8gbW9zdCBvZiB0aGUgdGltZSB0aGlzIGlzIHRoZSB1c2VmdWwgdmFsdWUgZm9yIGFnZ3JlZ2F0ZXNcbiAgICBlbXB0eTogYm9vbGVhbjsgLy8vIHdpbGwgc2hvdyB1cCBpbiB0aGUgY2hhcnQgYXMgYmxhbmsgLSBzZXQgdGhpcyB3aGVuIHlvdSBoYXZlIE5hTlxuICB9XG5cbiAgLyoqXG4gICAqIFJlcHJlc2VudGF0aW9uIG9mIGRhdGEgcmVhZHkgdG8gYmUgY29uc3VtZWQgYnkgY2hhcnRzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQ2hhcnREYXRhUG9pbnQgZXh0ZW5kcyBJQmFzZUNoYXJ0RGF0YVBvaW50IHtcbiAgICBkYXRlPzogRGF0ZTtcbiAgICBtaW46IE1ldHJpY1ZhbHVlO1xuICAgIG1heDogTWV0cmljVmFsdWU7XG4gICAgcGVyY2VudGlsZTk1dGg6IE1ldHJpY1ZhbHVlO1xuICAgIG1lZGlhbjogTWV0cmljVmFsdWU7XG4gIH1cblxuICAvKipcbiAgICogRGF0YSBzdHJ1Y3R1cmUgZm9yIGEgTXVsdGktTWV0cmljIGNoYXJ0LiBDb21wb3NlZCBvZiBJQ2hhcnREYXRhRGF0YVBvaW50W10uXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNdWx0aURhdGFQb2ludCB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAga2V5SGFzaD86IHN0cmluZzsgLy8gZm9yIHVzaW5nIGFzIHZhbGlkIGh0bWwgaWRcbiAgICBjb2xvcj86IHN0cmluZzsgLy8vICNmZmZlZWVcbiAgICB2YWx1ZXM6IElDaGFydERhdGFQb2ludFtdO1xuICB9XG5cbiAgLyoqXG4gICAqXG4gICAqL1xuICBleHBvcnQgY2xhc3MgQ2hhcnRPcHRpb25zIHtcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgc3ZnOiBhbnksXG4gICAgICBwdWJsaWMgdGltZVNjYWxlOiBhbnksXG4gICAgICBwdWJsaWMgeVNjYWxlOiBhbnksXG4gICAgICBwdWJsaWMgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICAgIHB1YmxpYyBtdWx0aUNoYXJ0RGF0YTogSU11bHRpRGF0YVBvaW50W10sXG4gICAgICBwdWJsaWMgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0OiBudW1iZXIsXG4gICAgICBwdWJsaWMgaGVpZ2h0OiBudW1iZXIsXG4gICAgICBwdWJsaWMgdGlwPzogYW55LFxuICAgICAgcHVibGljIHZpc3VhbGx5QWRqdXN0ZWRNYXg/OiBudW1iZXIsXG4gICAgICBwdWJsaWMgaGlkZUhpZ2hMb3dWYWx1ZXM/OiBib29sZWFuLFxuICAgICAgcHVibGljIGludGVycG9sYXRpb24/OiBzdHJpbmcpIHtcbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvKiB0c2xpbnQ6ZGlzYWJsZTpuby1iaXR3aXNlICovXG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJXaWR0aCh3aWR0aDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciwgYmFyT2Zmc2V0ID0gQkFSX09GRlNFVCkge1xuICAgIHJldHVybiAod2lkdGggLyBsZW5ndGggLSBiYXJPZmZzZXQpO1xuICB9XG5cbiAgLy8gQ2FsY3VsYXRlcyB0aGUgYmFyIHdpZHRoIGFkanVzdGVkIHNvIHRoYXQgdGhlIGZpcnN0IGFuZCBsYXN0IGFyZSBoYWxmLXdpZHRoIG9mIHRoZSBvdGhlcnNcbiAgLy8gc2VlIGh0dHBzOi8vaXNzdWVzLmpib3NzLm9yZy9icm93c2UvSEFXS1VMQVItODA5IGZvciBpbmZvIG9uIHdoeSB0aGlzIGlzIG5lZWRlZFxuICBleHBvcnQgZnVuY3Rpb24gY2FsY0JhcldpZHRoQWRqdXN0ZWQoaSwgbGVuZ3RoOiBudW1iZXIpIHtcbiAgICByZXR1cm4gKGkgPT09IDAgfHwgaSA9PT0gbGVuZ3RoIC0gMSkgPyBjYWxjQmFyV2lkdGgod2lkdGgsIGxlbmd0aCwgQkFSX09GRlNFVCkgLyAyIDpcbiAgICAgIGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKTtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZXMgdGhlIGJhciBYIHBvc2l0aW9uLiBXaGVuIHVzaW5nIGNhbGNCYXJXaWR0aEFkanVzdGVkLCBpdCBpcyByZXF1aXJlZCB0byBwdXNoIGJhcnNcbiAgLy8gb3RoZXIgdGhhbiB0aGUgZmlyc3QgaGFsZiBiYXIgdG8gdGhlIGxlZnQsIHRvIG1ha2UgdXAgZm9yIHRoZSBmaXJzdCBiZWluZyBqdXN0IGhhbGYgd2lkdGhcbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJYUG9zKGQsIGksIHRpbWVTY2FsZTogYW55LCBsZW5ndGg6IG51bWJlcikge1xuICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApIC0gKGkgPT09IDAgPyAwIDogY2FsY0JhcldpZHRoKHdpZHRoLCBsZW5ndGgsIEJBUl9PRkZTRVQpIC8gMik7XG4gIH1cblxuICAvKipcbiAgICogQW4gZW1wdHkgZGF0YXBvaW50IGhhcyAnZW1wdHknIGF0dHJpYnV0ZSBzZXQgdG8gdHJ1ZS4gVXNlZCB0byBkaXN0aW5ndWlzaCBmcm9tIHJlYWwgMCB2YWx1ZXMuXG4gICAqIEBwYXJhbSBkXG4gICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgKi9cbiAgZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHlEYXRhUG9pbnQoZDogSUNoYXJ0RGF0YVBvaW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGQuZW1wdHk7XG4gIH1cblxuICAvKipcbiAgICogUmF3IG1ldHJpY3MgaGF2ZSBhICd2YWx1ZScgc2V0IGluc3RlYWQgb2YgYXZnL21pbi9tYXggb2YgYWdncmVnYXRlc1xuICAgKiBAcGFyYW0gZFxuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBpc1Jhd01ldHJpYyhkOiBJQ2hhcnREYXRhUG9pbnQpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdHlwZW9mIGQuYXZnID09PSAndW5kZWZpbmVkJztcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiB4QXhpc1RpbWVGb3JtYXRzKCkge1xuICAgIHJldHVybiBkMy50aW1lLmZvcm1hdC5tdWx0aShbXG4gICAgICBbJy4lTCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldE1pbGxpc2Vjb25kcygpO1xuICAgICAgfV0sXG4gICAgICBbJzolUycsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldFNlY29uZHMoKTtcbiAgICAgIH1dLFxuICAgICAgWyclSDolTScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldE1pbnV0ZXMoKTtcbiAgICAgIH1dLFxuICAgICAgWyclSDolTScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldEhvdXJzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJWEgJWQnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXREYXkoKSAmJiBkLmdldERhdGUoKSAhPT0gMTtcbiAgICAgIH1dLFxuICAgICAgWyclYiAlZCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldERhdGUoKSAhPT0gMTtcbiAgICAgIH1dLFxuICAgICAgWyclQicsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBkLmdldE1vbnRoKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJVknLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfV1cbiAgICBdKTtcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdmdEZWZzKGNoYXJ0KSB7XG5cbiAgICBsZXQgZGVmcyA9IGNoYXJ0LmFwcGVuZCgnZGVmcycpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ25vRGF0YVN0cmlwZXMnKVxuICAgICAgLmF0dHIoJ3BhdHRlcm5Vbml0cycsICd1c2VyU3BhY2VPblVzZScpXG4gICAgICAuYXR0cigneCcsICcwJylcbiAgICAgIC5hdHRyKCd5JywgJzAnKVxuICAgICAgLmF0dHIoJ3dpZHRoJywgJzYnKVxuICAgICAgLmF0dHIoJ2hlaWdodCcsICczJylcbiAgICAgIC5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJylcbiAgICAgIC5hdHRyKCdzdHlsZScsICdzdHJva2U6I0NDQ0NDQzsgZmlsbDpub25lOycpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ3Vua25vd25TdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiMyRTlFQzI7IGZpbGw6bm9uZTsnKVxuICAgICAgLmFwcGVuZCgncGF0aCcpLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJyk7XG5cbiAgICBkZWZzLmFwcGVuZCgncGF0dGVybicpXG4gICAgICAuYXR0cignaWQnLCAnZG93blN0cmlwZXMnKVxuICAgICAgLmF0dHIoJ3BhdHRlcm5Vbml0cycsICd1c2VyU3BhY2VPblVzZScpXG4gICAgICAuYXR0cigneCcsICcwJylcbiAgICAgIC5hdHRyKCd5JywgJzAnKVxuICAgICAgLmF0dHIoJ3dpZHRoJywgJzYnKVxuICAgICAgLmF0dHIoJ2hlaWdodCcsICczJylcbiAgICAgIC5hdHRyKCdzdHlsZScsICdzdHJva2U6I2ZmOGE5YTsgZmlsbDpub25lOycpXG4gICAgICAuYXBwZW5kKCdwYXRoJykuYXR0cignZCcsICdNIDAgMCA2IDAnKTtcblxuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlOiBhbnkpIHtcbiAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgfVxuXG4gIC8vIGFkYXB0ZWQgZnJvbSBodHRwOi8vd2VyeGx0ZC5jb20vd3AvMjAxMC8wNS8xMy9qYXZhc2NyaXB0LWltcGxlbWVudGF0aW9uLW9mLWphdmFzLXN0cmluZy1oYXNoY29kZS1tZXRob2QvXG4gIGV4cG9ydCBmdW5jdGlvbiBoYXNoU3RyaW5nKHN0cjogc3RyaW5nKTogbnVtYmVyIHtcbiAgICBsZXQgaGFzaCA9IDAsIGksIGNociwgbGVuO1xuICAgIGlmIChzdHIubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gaGFzaDtcbiAgICB9XG4gICAgZm9yIChpID0gMCwgbGVuID0gc3RyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBjaHIgPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgIGhhc2ggPSAoKGhhc2ggPDwgNSkgLSBoYXNoKSArIGNocjtcbiAgICAgIGhhc2ggfD0gMDsgLy8gQ29udmVydCB0byAzMmJpdCBpbnRlZ2VyXG4gICAgfVxuICAgIHJldHVybiBoYXNoO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGRldGVybWluZVhBeGlzVGlja3NGcm9tU2NyZWVuV2lkdGgod2lkdGhJblBpeGVsczogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBsZXQgeFRpY2tzO1xuICAgIGlmICh3aWR0aEluUGl4ZWxzIDw9IDIwMCkge1xuICAgICAgeFRpY2tzID0gMjtcbiAgICB9IGVsc2UgaWYgKHdpZHRoSW5QaXhlbHMgPD0gMzUwICYmIHdpZHRoSW5QaXhlbHMgPiAyMDApIHtcbiAgICAgIHhUaWNrcyA9IDQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHhUaWNrcyA9IDk7XG4gICAgfVxuICAgIHJldHVybiB4VGlja3M7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gZGV0ZXJtaW5lWUF4aXNUaWNrc0Zyb21TY3JlZW5IZWlnaHQoaGVpZ2h0SW5QaXhlbHM6IG51bWJlcik6IG51bWJlciB7XG4gICAgbGV0IHlUaWNrcztcbiAgICBpZiAoaGVpZ2h0SW5QaXhlbHMgPD0gMTIwKSB7XG4gICAgICB5VGlja3MgPSAzO1xuICAgIH0gZWxzZSB7XG4gICAgICB5VGlja3MgPSA5O1xuICAgIH1cbiAgICByZXR1cm4geVRpY2tzO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGRldGVybWluZVlBeGlzR3JpZExpbmVUaWNrc0Zyb21TY3JlZW5IZWlnaHQoaGVpZ2h0SW5QaXhlbHM6IG51bWJlcik6IG51bWJlciB7XG4gICAgbGV0IHlUaWNrcztcbiAgICBpZiAoaGVpZ2h0SW5QaXhlbHMgPD0gNjApIHtcbiAgICAgIHlUaWNrcyA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHlUaWNrcyA9IDEwO1xuICAgIH1cbiAgICByZXR1cm4geVRpY2tzO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGV4cG9ydCBjb25zdCBCQVJfT0ZGU0VUID0gMjtcblxuICBleHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RIaXN0b2dyYW1DaGFydCBpbXBsZW1lbnRzIElDaGFydFR5cGUge1xuXG4gICAgcHVibGljIG5hbWUgPSAnaGlzdG9ncmFtJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zLCBzdGFja2VkID0gZmFsc2UpIHtcblxuICAgICAgY29uc3QgYmFyQ2xhc3MgPSBzdGFja2VkID8gJ2xlYWRlckJhcicgOiAnaGlzdG9ncmFtJztcblxuICAgICAgY29uc3QgcmVjdEhpc3RvZ3JhbSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdyZWN0LicgKyBiYXJDbGFzcykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcblxuICAgICAgZnVuY3Rpb24gYnVpbGRCYXJzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgYmFyQ2xhc3MpXG4gICAgICAgICAgLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgY2hhcnRPcHRpb25zLnRpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy50aXAuaGlkZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgIC5hdHRyKCd4JywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0T3B0aW9ucy5jaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLm1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCAtIGNoYXJ0T3B0aW9ucy55U2NhbGUoaXNFbXB0eURhdGFQb2ludChkKSA/XG4gICAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy55U2NhbGUoY2hhcnRPcHRpb25zLnZpc3VhbGx5QWRqdXN0ZWRNYXgpIDogZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCBzdGFja2VkID8gJy42JyA6ICcxJylcbiAgICAgICAgICAuYXR0cignZmlsbCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/ICd1cmwoI25vRGF0YVN0cmlwZXMpJyA6IChzdGFja2VkID8gJyNEM0QzRDYnIDogJyNDMEMwQzAnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcjNzc3JztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcwJztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdkYXRhLWhhd2t1bGFyLXZhbHVlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgICB9KTtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZEhpZ2hCYXIoc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQubWluID09PSBkLm1heCA/ICdzaW5nbGVWYWx1ZScgOiAnaGlnaCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneCcsIGZ1bmN0aW9uKGQsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNOYU4oZC5tYXgpID8gY2hhcnRPcHRpb25zLnlTY2FsZShjaGFydE9wdGlvbnMudmlzdWFsbHlBZGp1c3RlZE1heCkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogKGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpIC0gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCkgfHwgMik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0T3B0aW9ucy5jaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC45KVxuICAgICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy50aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRMb3dlckJhcihzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICAgIHNlbGVjdGlvblxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdsb3cnKVxuICAgICAgICAgIC5hdHRyKCd4JywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNOYU4oZC5hdmcpID8gY2hhcnRPcHRpb25zLmhlaWdodCA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/IDAgOiAoY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbikgLSBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGNoYXJ0T3B0aW9ucy5jaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC45KVxuICAgICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy50aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZFRvcFN0ZW0oc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtVG9wU3RlbScpXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZExvd1N0ZW0oc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtQm90dG9tU3RlbScpXG4gICAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICB9KS5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICAgIH0pO1xuXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkVG9wQ3Jvc3Moc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtVG9wQ3Jvc3MnKVxuICAgICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkQm90dG9tQ3Jvc3Moc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKVxuICAgICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZUhpc3RvZ3JhbUhpZ2hMb3dWYWx1ZXMoc3ZnOiBhbnksIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sIHN0YWNrZWQ/OiBib29sZWFuKSB7XG4gICAgICAgIGlmIChzdGFja2VkKSB7XG4gICAgICAgICAgLy8gdXBwZXIgcG9ydGlvbiByZXByZXNlbnRpbmcgYXZnIHRvIGhpZ2hcbiAgICAgICAgICBjb25zdCByZWN0SGlnaCA9IHN2Zy5zZWxlY3RBbGwoJ3JlY3QuaGlnaCwgcmVjdC5zaW5nbGVWYWx1ZScpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIHJlY3RIaWdoLmNhbGwoYnVpbGRIaWdoQmFyKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIHJlY3RIaWdoXG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuY2FsbChidWlsZEhpZ2hCYXIpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgcmVjdEhpZ2guZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgLy8gbG93ZXIgcG9ydGlvbiByZXByZXNlbnRpbmcgYXZnIHRvIGxvd1xuICAgICAgICAgIGNvbnN0IHJlY3RMb3cgPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmxvdycpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICByZWN0TG93LmNhbGwoYnVpbGRMb3dlckJhcik7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICByZWN0TG93XG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuY2FsbChidWlsZExvd2VyQmFyKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIHJlY3RMb3cuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgY29uc3QgbGluZUhpc3RvSGlnaFN0ZW0gPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtVG9wU3RlbScpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbS5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbVxuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRUb3BTdGVtKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIGxpbmVIaXN0b0hpZ2hTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIGNvbnN0IGxpbmVIaXN0b0xvd1N0ZW0gPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtQm90dG9tU3RlbScpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtLmNhbGwoYnVpbGRMb3dTdGVtKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIGxpbmVIaXN0b0xvd1N0ZW1cbiAgICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAgIC5jYWxsKGJ1aWxkTG93U3RlbSk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIGNvbnN0IGxpbmVIaXN0b1RvcENyb3NzID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcENyb3NzJykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcblxuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIGxpbmVIaXN0b1RvcENyb3NzLmNhbGwoYnVpbGRUb3BDcm9zcyk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zc1xuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRUb3BDcm9zcyk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgICBjb25zdCBsaW5lSGlzdG9Cb3R0b21Dcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Cb3R0b21Dcm9zcycpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgbGluZUhpc3RvQm90dG9tQ3Jvc3MuY2FsbChidWlsZEJvdHRvbUNyb3NzKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzXG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuY2FsbChidWlsZEJvdHRvbUNyb3NzKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIHJlY3RIaXN0b2dyYW0uY2FsbChidWlsZEJhcnMpO1xuXG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIHJlY3RIaXN0b2dyYW0uZW50ZXIoKVxuICAgICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgICAgLmNhbGwoYnVpbGRCYXJzKTtcblxuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICByZWN0SGlzdG9ncmFtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgaWYgKCFjaGFydE9wdGlvbnMuaGlkZUhpZ2hMb3dWYWx1ZXMpIHtcbiAgICAgICAgY3JlYXRlSGlzdG9ncmFtSGlnaExvd1ZhbHVlcyhjaGFydE9wdGlvbnMuc3ZnLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLCBzdGFja2VkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHdlIHNob3VsZCBoaWRlIGhpZ2gtbG93IHZhbHVlcy4uIG9yIHJlbW92ZSBpZiBleGlzdGluZ1xuICAgICAgICBjaGFydE9wdGlvbnMuc3ZnXG4gICAgICAgICAgLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcFN0ZW0sIC5oaXN0b2dyYW1Cb3R0b21TdGVtLCAuaGlzdG9ncmFtVG9wQ3Jvc3MsIC5oaXN0b2dyYW1Cb3R0b21Dcm9zcycpLnJlbW92ZSgpO1xuICAgICAgfVxuXG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGNsYXNzIEFyZWFDaGFydCBpbXBsZW1lbnRzIElDaGFydFR5cGUge1xuXG4gICAgcHVibGljIG5hbWUgPSAnYXJlYSc7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucyk6IHZvaWQge1xuXG4gICAgICBsZXRcbiAgICAgICAgaGlnaEFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgLmludGVycG9sYXRlKGNoYXJ0T3B0aW9ucy5pbnRlcnBvbGF0aW9uKVxuICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgLFxuXG4gICAgICAgIGF2Z0FyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgLmludGVycG9sYXRlKGNoYXJ0T3B0aW9ucy5pbnRlcnBvbGF0aW9uKVxuICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KS55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLmhpZGVIaWdoTG93VmFsdWVzID8gY2hhcnRPcHRpb25zLmhlaWdodCA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICxcblxuICAgICAgICBsb3dBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueTAoKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy5tb2RpZmllZElubmVyQ2hhcnRIZWlnaHQ7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIGlmICghY2hhcnRPcHRpb25zLmhpZGVIaWdoTG93VmFsdWVzKSB7XG4gICAgICAgIGxldFxuICAgICAgICAgIGhpZ2hBcmVhUGF0aCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdwYXRoLmhpZ2hBcmVhJykuZGF0YShbY2hhcnRPcHRpb25zLmNoYXJ0RGF0YV0pO1xuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgaGlnaEFyZWFQYXRoXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hBcmVhJylcbiAgICAgICAgICAuYXR0cignZCcsIGhpZ2hBcmVhKTtcbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGhpZ2hBcmVhUGF0aFxuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hBcmVhJylcbiAgICAgICAgICAuYXR0cignZCcsIGhpZ2hBcmVhKTtcbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGhpZ2hBcmVhUGF0aFxuICAgICAgICAgIC5leGl0KClcbiAgICAgICAgICAucmVtb3ZlKCk7XG5cbiAgICAgICAgbGV0XG4gICAgICAgICAgbG93QXJlYVBhdGggPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aC5sb3dBcmVhJykuZGF0YShbY2hhcnRPcHRpb25zLmNoYXJ0RGF0YV0pO1xuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgbG93QXJlYVBhdGhcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93QXJlYScpXG4gICAgICAgICAgLmF0dHIoJ2QnLCBsb3dBcmVhKTtcbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGxvd0FyZWFQYXRoXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93QXJlYScpXG4gICAgICAgICAgLmF0dHIoJ2QnLCBsb3dBcmVhKTtcbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxvd0FyZWFQYXRoXG4gICAgICAgICAgLmV4aXQoKVxuICAgICAgICAgIC5yZW1vdmUoKTtcbiAgICAgIH1cblxuICAgICAgbGV0XG4gICAgICAgIGF2Z0FyZWFQYXRoID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGguYXZnQXJlYScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgYXZnQXJlYVBhdGguYXR0cignY2xhc3MnLCAnYXZnQXJlYScpXG4gICAgICAgIC5hdHRyKCdkJywgYXZnQXJlYSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGF2Z0FyZWFQYXRoLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2Z0FyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGF2Z0FyZWEpO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBhdmdBcmVhUGF0aC5leGl0KCkucmVtb3ZlKCk7XG4gICAgfVxuXG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxuaW1wb3J0IENoYXJ0T3B0aW9ucyA9IENoYXJ0cy5DaGFydE9wdGlvbnM7XG5pbnRlcmZhY2UgSUNoYXJ0VHlwZSB7XG4gIG5hbWU6IHN0cmluZztcbiAgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zLCBvcHRpb25hbEJvb2xlYW4/OiBib29sZWFuKTogdm9pZDtcbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGV4cG9ydCBjbGFzcyBIaXN0b2dyYW1DaGFydCBleHRlbmRzIEFic3RyYWN0SGlzdG9ncmFtQ2hhcnQge1xuXG4gICAgcHVibGljIG5hbWUgPSAnaGlzdG9ncmFtJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zLCBzdGFja2VkID0gZmFsc2UpIHtcbiAgICAgIHN1cGVyLmRyYXdDaGFydChjaGFydE9wdGlvbnMsIHN0YWNrZWQpO1xuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBjbGFzcyBMaW5lQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ2xpbmUnO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpIHtcblxuICAgICAgbGV0IG1ldHJpY0NoYXJ0TGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgLmludGVycG9sYXRlKGNoYXJ0T3B0aW9ucy5pbnRlcnBvbGF0aW9uKVxuICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KTtcblxuICAgICAgbGV0IHBhdGhNZXRyaWMgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aC5tZXRyaWNMaW5lJykuZGF0YShbY2hhcnRPcHRpb25zLmNoYXJ0RGF0YV0pO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBwYXRoTWV0cmljLmF0dHIoJ2NsYXNzJywgJ21ldHJpY0xpbmUnKVxuICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgIC5hdHRyKCdkJywgbWV0cmljQ2hhcnRMaW5lKTtcblxuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBwYXRoTWV0cmljLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ21ldHJpY0xpbmUnKVxuICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgIC5hdHRyKCdkJywgbWV0cmljQ2hhcnRMaW5lKTtcblxuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBwYXRoTWV0cmljLmV4aXQoKS5yZW1vdmUoKTtcbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgY2xhc3MgTXVsdGlMaW5lQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ211bHRpbGluZSc7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucykge1xuXG4gICAgICBsZXQgY29sb3JTY2FsZSA9IDxhbnk+ZDMuc2NhbGUuY2F0ZWdvcnkxMCgpLFxuICAgICAgICBnID0gMDtcblxuICAgICAgaWYgKGNoYXJ0T3B0aW9ucy5tdWx0aUNoYXJ0RGF0YSkge1xuICAgICAgICAvLyBiZWZvcmUgdXBkYXRpbmcsIGxldCdzIHJlbW92ZSB0aG9zZSBtaXNzaW5nIGZyb20gZGF0YXBvaW50cyAoaWYgYW55KVxuICAgICAgICBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aFtpZF49XFwnbXVsdGlMaW5lXFwnXScpWzBdLmZvckVhY2goKGV4aXN0aW5nUGF0aDogYW55KSA9PiB7XG4gICAgICAgICAgbGV0IHN0aWxsRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgY2hhcnRPcHRpb25zLm11bHRpQ2hhcnREYXRhLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgICBzaW5nbGVDaGFydERhdGEua2V5SGFzaCA9IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoXG4gICAgICAgICAgICAgIHx8ICgnbXVsdGlMaW5lJyArIGhhc2hTdHJpbmcoc2luZ2xlQ2hhcnREYXRhLmtleSkpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nUGF0aC5nZXRBdHRyaWJ1dGUoJ2lkJykgPT09IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKSB7XG4gICAgICAgICAgICAgIHN0aWxsRXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAoIXN0aWxsRXhpc3RzKSB7XG4gICAgICAgICAgICBleGlzdGluZ1BhdGgucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjaGFydE9wdGlvbnMubXVsdGlDaGFydERhdGEuZm9yRWFjaCgoc2luZ2xlQ2hhcnREYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICBpZiAoc2luZ2xlQ2hhcnREYXRhICYmIHNpbmdsZUNoYXJ0RGF0YS52YWx1ZXMpIHtcbiAgICAgICAgICAgIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoID0gc2luZ2xlQ2hhcnREYXRhLmtleUhhc2hcbiAgICAgICAgICAgICAgfHwgKCdtdWx0aUxpbmUnICsgaGFzaFN0cmluZyhzaW5nbGVDaGFydERhdGEua2V5KSk7XG4gICAgICAgICAgICBsZXQgcGF0aE11bHRpTGluZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdwYXRoIycgKyBzaW5nbGVDaGFydERhdGEua2V5SGFzaClcbiAgICAgICAgICAgICAgLmRhdGEoW3NpbmdsZUNoYXJ0RGF0YS52YWx1ZXNdKTtcbiAgICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgICAgcGF0aE11bHRpTGluZS5hdHRyKCdpZCcsIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKVxuICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbXVsdGlMaW5lJylcbiAgICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnbm9uZScpXG4gICAgICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNpbmdsZUNoYXJ0RGF0YS5jb2xvciB8fCBjb2xvclNjYWxlKGcrKyk7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgLmF0dHIoJ2QnLCB0aGlzLmNyZWF0ZUxpbmUoJ2xpbmVhcicsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUsIGNoYXJ0T3B0aW9ucy55U2NhbGUpKTtcbiAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgcGF0aE11bHRpTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgIC5hdHRyKCdpZCcsIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKVxuICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbXVsdGlMaW5lJylcbiAgICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnbm9uZScpXG4gICAgICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHNpbmdsZUNoYXJ0RGF0YS5jb2xvcikge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHNpbmdsZUNoYXJ0RGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbG9yU2NhbGUoZysrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgLmF0dHIoJ2QnLCB0aGlzLmNyZWF0ZUxpbmUoJ2xpbmVhcicsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUsIGNoYXJ0T3B0aW9ucy55U2NhbGUpKTtcbiAgICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgICAgcGF0aE11bHRpTGluZS5leGl0KCkucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybignTm8gbXVsdGktZGF0YSBzZXQgZm9yIG11bHRpbGluZSBjaGFydCcpO1xuICAgICAgfVxuXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjcmVhdGVMaW5lKG5ld0ludGVycG9sYXRpb24sIHRpbWVTY2FsZSwgeVNjYWxlKSB7XG4gICAgICBsZXQgaW50ZXJwb2xhdGUgPSBuZXdJbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRlKVxuICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgcmV0dXJuIGxpbmU7XG4gICAgfVxuXG4gIH1cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGV4cG9ydCBjbGFzcyBSaHFCYXJDaGFydCBleHRlbmRzIEFic3RyYWN0SGlzdG9ncmFtQ2hhcnQge1xuXG4gICAgcHVibGljIG5hbWUgPSAncmhxYmFyJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zLCBzdGFja2VkID0gdHJ1ZSkge1xuICAgICAgc3VwZXIuZHJhd0NoYXJ0KGNoYXJ0T3B0aW9ucywgc3RhY2tlZCk7XG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGNsYXNzIFNjYXR0ZXJDaGFydCBpbXBsZW1lbnRzIElDaGFydFR5cGUge1xuXG4gICAgcHVibGljIG5hbWUgPSAnc2NhdHRlcic7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucykge1xuXG4gICAgICBpZiAoIWNoYXJ0T3B0aW9ucy5oaWRlSGlnaExvd1ZhbHVlcykge1xuXG4gICAgICAgIGxldCBoaWdoRG90Q2lyY2xlID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5oaWdoRG90JykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGhpZ2hEb3RDaXJjbGUuYXR0cignY2xhc3MnLCAnaGlnaERvdCcpXG4gICAgICAgICAgLmZpbHRlcigoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnI2ZmMWExMyc7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGhpZ2hEb3RDaXJjbGUuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hEb3QnKVxuICAgICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcjZmYxYTEzJztcbiAgICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgaGlnaERvdENpcmNsZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgbGV0IGxvd0RvdENpcmNsZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcubG93RG90JykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxvd0RvdENpcmNsZS5hdHRyKCdjbGFzcycsICdsb3dEb3QnKVxuICAgICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgbG93RG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdsb3dEb3QnKVxuICAgICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgbG93RG90Q2lyY2xlLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gd2Ugc2hvdWxkIGhpZGUgaGlnaC1sb3cgdmFsdWVzLi4gb3IgcmVtb3ZlIGlmIGV4aXN0aW5nXG4gICAgICAgIGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuaGlnaERvdCwgLmxvd0RvdCcpLnJlbW92ZSgpO1xuICAgICAgfVxuXG4gICAgICBsZXQgYXZnRG90Q2lyY2xlID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5hdmdEb3QnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBhdmdEb3RDaXJjbGUuYXR0cignY2xhc3MnLCAnYXZnRG90JylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnI0ZGRic7XG4gICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBhdmdEb3RDaXJjbGUuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmdEb3QnKVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjRkZGJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGF2Z0RvdENpcmNsZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgY2xhc3MgU2NhdHRlckxpbmVDaGFydCBpbXBsZW1lbnRzIElDaGFydFR5cGUge1xuXG4gICAgcHVibGljIG5hbWUgPSAnc2NhdHRlcmxpbmUnO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpIHtcblxuICAgICAgbGV0IGxpbmVTY2F0dGVyVG9wU3RlbSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVUb3BTdGVtJykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgbGluZVNjYXR0ZXJUb3BTdGVtLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wU3RlbScpXG4gICAgICAgIC5maWx0ZXIoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbGluZVNjYXR0ZXJUb3BTdGVtLmVudGVyKCkuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wU3RlbScpXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIGxldCBsaW5lU2NhdHRlckJvdHRvbVN0ZW0gPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lQm90dG9tU3RlbScpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxpbmVTY2F0dGVyQm90dG9tU3RlbS5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZUJvdHRvbVN0ZW0nKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21TdGVtJylcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgbGluZVNjYXR0ZXJCb3R0b21TdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgbGV0IGxpbmVTY2F0dGVyVG9wQ3Jvc3MgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lVG9wQ3Jvc3MnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBsaW5lU2NhdHRlclRvcENyb3NzLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wQ3Jvc3MnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpIC0gMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSArIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbGluZVNjYXR0ZXJUb3BDcm9zcy5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZVRvcENyb3NzJylcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcyA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAuNSc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBsaW5lU2NhdHRlckJvdHRvbUNyb3NzLmVudGVyKCkuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpIC0gMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSArIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIGxldCBjaXJjbGVTY2F0dGVyRG90ID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyRG90JykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgY2lyY2xlU2NhdHRlckRvdC5hdHRyKCdjbGFzcycsICdzY2F0dGVyRG90JylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnb3BhY2l0eScsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzEnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgY2lyY2xlU2NhdHRlckRvdC5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJEb3QnKVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdvcGFjaXR5JywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMSc7XG4gICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBjaXJjbGVTY2F0dGVyRG90LmV4aXQoKS5yZW1vdmUoKTtcblxuICAgIH1cbiAgfVxufVxuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
