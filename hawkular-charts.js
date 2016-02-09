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
    function createAlertBoundsArea(svg, timeScale, yScale, height, highBound, alertBounds) {
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
                    console.dir(element[0]);
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
                    //console.warn('dataPoints.length: ' + dataPoints.length);
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
    Charts.X_AXIS_HEIGHT = 25; // with room for label
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
                var height, modifiedInnerChartHeight, innerChartHeight = height + Charts.margin.top + Charts.margin.bottom, chartData, yScale, timeScale, yAxis, xAxis, tip, brush, brushGroup, chart, chartParent, svg, visuallyAdjustedMin, visuallyAdjustedMax, peak, min, processedNewData, processedPreviousRangeData;
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
                function resize() {
                    // destroy any previous charts
                    if (chart) {
                        chartParent.selectAll('*').remove();
                    }
                    chartParent = d3.select(element[0]);
                    console.dir(element[0]);
                    var parentNode = element[0].parentNode;
                    Charts.width = parentNode.clientWidth;
                    height = parentNode.clientHeight;
                    modifiedInnerChartHeight = height - Charts.margin.top - Charts.margin.bottom - Charts.X_AXIS_HEIGHT,
                        //console.log('Metric Width: %i', width);
                        //console.log('Metric Height: %i', height);
                        innerChartHeight = height + Charts.margin.top;
                    chart = chartParent.append('svg')
                        .attr('width', Charts.width - Charts.margin.left - Charts.margin.right)
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
                function determineScale(dataPoints) {
                    var xTicks, numberOfBarsForSmallGraph = 20;
                    if (dataPoints.length > 0) {
                        //  we use the width already defined above
                        xTicks = 9;
                        chartData = dataPoints;
                        setupFilteredData(dataPoints);
                        yScale = d3.scale.linear()
                            .clamp(true)
                            .rangeRound([modifiedInnerChartHeight, 0])
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
                            Charts.createHistogramChart(svg, timeScale, yScale, chartData, tip, modifiedInnerChartHeight, true, visuallyAdjustedMax, hideHighLowValues);
                            break;
                        case 'histogram':
                            Charts.createHistogramChart(svg, timeScale, yScale, chartData, tip, modifiedInnerChartHeight, false, visuallyAdjustedMax, hideHighLowValues);
                            break;
                        case 'line':
                            Charts.createLineChart(svg, timeScale, yScale, chartData, modifiedInnerChartHeight, interpolation);
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
                            Charts.createAreaChart(svg, timeScale, yScale, chartData, modifiedInnerChartHeight, interpolation, hideHighLowValues);
                            break;
                        case 'scatter':
                            Charts.createScatterChart(svg, timeScale, yScale, chartData, modifiedInnerChartHeight, interpolation, hideHighLowValues);
                            break;
                        case 'scatterline':
                            Charts.createScatterLineChart(svg, timeScale, yScale, chartData, modifiedInnerChartHeight, interpolation, hideHighLowValues);
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
                    resize();
                    if (dataPoints) {
                        determineScale(dataPoints);
                    }
                    if (multiDataPoints) {
                        determineMultiScale(multiDataPoints);
                    }
                    if (alertValue && (alertValue > visuallyAdjustedMin && alertValue < visuallyAdjustedMax)) {
                        var alertBounds = Charts.extractAlertRanges(chartData, alertValue);
                        Charts.createAlertBoundsArea(svg, timeScale, yScale, modifiedInnerChartHeight, visuallyAdjustedMax, alertBounds);
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImhhd2t1bGFyLW1ldHJpY3MtY2hhcnRzLm1vZHVsZS50cyIsImNoYXJ0L2FsZXJ0cy50cyIsImNoYXJ0L2F2YWlsLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L2NvbnRleHQtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvZXZlbnQtbmFtZXMudHMiLCJjaGFydC9mZWF0dXJlcy50cyIsImNoYXJ0L21ldHJpYy1jaGFydC1kaXJlY3RpdmUudHMiLCJjaGFydC9zcGFya2xpbmUtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvdHlwZXMudHMiLCJjaGFydC91dGlsaXR5LnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9hcmVhLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9oaXN0b2dyYW0udHMiLCJjaGFydC9jaGFydC10eXBlL2xpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXJMaW5lLnRzIl0sIm5hbWVzIjpbIkNoYXJ0cyIsIkNoYXJ0cy5BbGVydEJvdW5kIiwiQ2hhcnRzLkFsZXJ0Qm91bmQuY29uc3RydWN0b3IiLCJDaGFydHMuY3JlYXRlQWxlcnRMaW5lRGVmIiwiQ2hhcnRzLmNyZWF0ZUFsZXJ0TGluZSIsIkNoYXJ0cy5leHRyYWN0QWxlcnRSYW5nZXMiLCJDaGFydHMuZXh0cmFjdEFsZXJ0UmFuZ2VzLmZpbmRTdGFydFBvaW50cyIsIkNoYXJ0cy5leHRyYWN0QWxlcnRSYW5nZXMuZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleCIsIkNoYXJ0cy5jcmVhdGVBbGVydEJvdW5kc0FyZWEiLCJDaGFydHMuY3JlYXRlQWxlcnRCb3VuZHNBcmVhLmFsZXJ0Qm91bmRpbmdSZWN0IiwiQ2hhcnRzLkF2YWlsU3RhdHVzIiwiQ2hhcnRzLkF2YWlsU3RhdHVzLmNvbnN0cnVjdG9yIiwiQ2hhcnRzLkF2YWlsU3RhdHVzLnRvU3RyaW5nIiwiQ2hhcnRzLlRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQiLCJDaGFydHMuVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5idWlsZEF2YWlsSG92ZXIiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3Iub25lVGltZUNoYXJ0U2V0dXAiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZGV0ZXJtaW5lQXZhaWxTY2FsZSIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5pc1VwIiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmlzVW5rbm93biIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5mb3JtYXRUcmFuc2Zvcm1lZERhdGFQb2ludHMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZm9ybWF0VHJhbnNmb3JtZWREYXRhUG9pbnRzLnNvcnRCeVRpbWVzdGFtcCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVTaWRlWUF4aXNMYWJlbHMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQuY2FsY0JhclkiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQuY2FsY0JhckhlaWdodCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVBdmFpbGFiaWxpdHlDaGFydC5jYWxjQmFyRmlsbCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYYW5kWUF4ZXMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlWEF4aXNCcnVzaCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmJydXNoU3RhcnQiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlWEF4aXNCcnVzaC5icnVzaEVuZCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5GYWN0b3J5IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZSIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IiLCJDaGFydHMuQ29udGV4dENoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLnJlc2l6ZSIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQ29udGV4dENoYXJ0IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoIiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmNvbnRleHRCcnVzaFN0YXJ0IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmNvbnRleHRCcnVzaEVuZCIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dCIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSIsIkNoYXJ0cy5FdmVudE5hbWVzIiwiQ2hhcnRzLkV2ZW50TmFtZXMuY29uc3RydWN0b3IiLCJDaGFydHMuRXZlbnROYW1lcy50b1N0cmluZyIsIkNoYXJ0cy5jcmVhdGVEYXRhUG9pbnRzIiwibGluayIsImxpbmsuZ2V0Q2hhcnRXaWR0aCIsImxpbmsucmVzaXplIiwibGluay5zZXR1cEZpbHRlcmVkRGF0YSIsImxpbmsuZGV0ZXJtaW5lU2NhbGUiLCJsaW5rLnNldHVwRmlsdGVyZWRNdWx0aURhdGEiLCJsaW5rLnNldHVwRmlsdGVyZWRNdWx0aURhdGEuZGV0ZXJtaW5lTXVsdGlEYXRhTWluTWF4IiwibGluay5kZXRlcm1pbmVNdWx0aVNjYWxlIiwibGluay5sb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UiLCJsaW5rLmZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQiLCJsaW5rLmJ1aWxkSG92ZXIiLCJsaW5rLmNyZWF0ZU11bHRpTGluZUNoYXJ0IiwibGluay5jcmVhdGVZQXhpc0dyaWRMaW5lcyIsImxpbmsuY3JlYXRlWGFuZFlBeGVzIiwibGluay5jcmVhdGVYYW5kWUF4ZXMuYXhpc1RyYW5zaXRpb24iLCJsaW5rLmNyZWF0ZUNlbnRlcmVkTGluZSIsImxpbmsuY3JlYXRlTGluZSIsImxpbmsuY3JlYXRlQXZnTGluZXMiLCJsaW5rLmNyZWF0ZVhBeGlzQnJ1c2giLCJsaW5rLmNyZWF0ZVhBeGlzQnJ1c2guYnJ1c2hTdGFydCIsImxpbmsuY3JlYXRlWEF4aXNCcnVzaC5icnVzaEVuZCIsImxpbmsuY3JlYXRlUHJldmlvdXNSYW5nZU92ZXJsYXkiLCJsaW5rLmFubm90YXRlQ2hhcnQiLCJsaW5rLmNyZWF0ZUZvcmVjYXN0TGluZSIsImxpbmsuc2hvd0ZvcmVjYXN0RGF0YSIsImxpbmsubG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdyIsImxpbmsuZGV0ZXJtaW5lQ2hhcnRUeXBlIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLnNldHVwIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZVNwYXJrbGluZUNoYXJ0IiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQiLCJDaGFydHMuU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuRmFjdG9yeSIsIkNoYXJ0cy5jYWxjQmFyV2lkdGgiLCJDaGFydHMuY2FsY0JhcldpZHRoQWRqdXN0ZWQiLCJDaGFydHMuY2FsY0JhclhQb3MiLCJDaGFydHMuaXNFbXB0eURhdGFQb2ludCIsIkNoYXJ0cy5pc1Jhd01ldHJpYyIsIkNoYXJ0cy54QXhpc1RpbWVGb3JtYXRzIiwiQ2hhcnRzLmNyZWF0ZVN2Z0RlZnMiLCJDaGFydHMueE1pZFBvaW50U3RhcnRQb3NpdGlvbiIsIkNoYXJ0cy5oYXNoU3RyaW5nIiwiQ2hhcnRzLmNyZWF0ZUFyZWFDaGFydCIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydCIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5idWlsZEJhcnMiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRIaWdoQmFyIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkTG93ZXJCYXIiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRUb3BTdGVtIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkTG93U3RlbSIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5idWlsZFRvcENyb3NzIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkQm90dG9tQ3Jvc3MiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuY3JlYXRlSGlzdG9ncmFtSGlnaExvd1ZhbHVlcyIsIkNoYXJ0cy5jcmVhdGVMaW5lQ2hhcnQiLCJDaGFydHMuY3JlYXRlU2NhdHRlckNoYXJ0IiwiQ2hhcnRzLmNyZWF0ZVNjYXR0ZXJMaW5lQ2hhcnQiXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7O0FDUHRDLCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0EySmY7QUEzSkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQkEsWUFBWUEsQ0FBQ0E7SUFDYkE7OztPQUdHQTtJQUNIQTtRQUlFQyxvQkFBbUJBLGNBQTRCQSxFQUN0Q0EsWUFBMEJBLEVBQzFCQSxVQUFrQkE7WUFGUkMsbUJBQWNBLEdBQWRBLGNBQWNBLENBQWNBO1lBQ3RDQSxpQkFBWUEsR0FBWkEsWUFBWUEsQ0FBY0E7WUFDMUJBLGVBQVVBLEdBQVZBLFVBQVVBLENBQVFBO1lBQ3pCQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtZQUMxQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO1FBRUhELGlCQUFDQTtJQUFEQSxDQVhBRCxBQVdDQyxJQUFBRDtJQVhZQSxpQkFBVUEsYUFXdEJBLENBQUFBO0lBRURBLDRCQUE0QkEsU0FBY0EsRUFDeENBLE1BQVdBLEVBQ1hBLFVBQWtCQTtRQUNsQkcsSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUE7YUFDckJBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBO2FBQ3ZCQSxDQUFDQSxDQUFDQSxVQUFDQSxDQUFNQTtZQUNSQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0EsQ0FBQ0E7YUFD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Q3hCQSxDQUFDQSxDQUFDQTt5QkFDREEsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUE7d0JBQ2ZBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO29CQUNkQSxDQUFDQSxDQUFDQTt5QkFDREEsRUFBRUEsQ0FBQ0EsV0FBV0EsRUFBRUEsVUFBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7d0JBQ3BCQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDakJBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFVBQVVBLEVBQUVBO3dCQUNoQkEsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7b0JBQ2JBLENBQUNBLENBQUNBO3lCQUNEQSxFQUFFQSxDQUFDQSxXQUFXQSxFQUFFQTt3QkFDZkEsSUFBSUEsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7d0JBQzVDQSxJQUFJQSxVQUFVQSxHQUFRQSxJQUFJQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTt3QkFDN0NBLFVBQVVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO3dCQUNsQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7d0JBQ3RDQSxVQUFVQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTt3QkFDbENBLFVBQVVBLENBQUNBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBO3dCQUN0Q0EsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7b0JBQ3RDQSxDQUFDQSxDQUFDQTt5QkFDREEsRUFBRUEsQ0FBQ0EsU0FBU0EsRUFBRUE7d0JBQ2JBLElBQUlBLFNBQVNBLEdBQUdBLEdB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O3dCQUNkQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtvQkFDbEJBLENBQUNBLENBQUNBO3lCQUNEQSxDQUFDQSxDQUFDQSxVQUFDQSxDQUFNQTt3QkFDUkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hDQSxDQUFDQSxDQUFDQTt5QkFDREEsRUFBRUEsQ0FBQ0EsVUFBQ0EsQ0FBTUE7d0JBQ1RBLE1BQU1BLENBQUNBLHdCQUF3QkEsQ0FBQ0E7b0JBQ2xDQSxDQUFDQSxDQUFDQTt5QkFDREEsRUFBRUEsQ0FBQ0EsVUFBQ0EsQ0FBTUE7d0JBQ1RBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUN2QkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRUxBLElBQUlBLFdBQVdBLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBO3lCQUM1QkEsV0FBV0EsQ0FBQ0EsVUFBVUEsQ0FBQ0E7eUJBQ3ZCQSxPQUFPQSxDQUFDQSxVQUFDQSxDQUFNQTt3QkFDZEEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7b0JBQ2xCQSxDQUFDQSxDQUFDQTt5QkFDREEsQ0FBQ0EsQ0FBQ0EsVUFBQ0EsQ0FBTUE7d0JBQ1JBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO29CQUNoQ0EsQ0FBQ0EsQ0FBQ0E7eUJBQ0RBLENBQUNBLENBQUNBLFVBQUNBLENBQU1BO3dCQUNSQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDdkJBLENBQUNBLENBQUNBLENBQUNBO29CQUVMQSxJQUFJQSxlQUFlQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLFVBQVVB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QUE7SUFFREE7UUFDRXFGLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1lBQzFCQSxDQUFDQSxLQUFLQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDUkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7Z0JBQzdCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxLQUFLQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDUkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7Z0JBQ3hCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDVkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7Z0JBQ3hCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDVkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7Z0JBQ3RCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDVkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pDQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDVkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtvQkFDUEEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7Z0JBQ3RCQSxDQUFDQSxDQUFDQTtZQUNGQSxDQUFDQSxJQUFJQSxFQUFFQTtvQkFDTEEsTUFB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QUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMxREEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBQ0EsQ0FBTUE7WUFDWEEsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxHQUFHQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNwREEsQ0FBQ0EsQ0FBQ0EsRUFFSkEsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUE7YUFDcEJBLFdBQVdBLENBQUNBLGFBQWFBLENBQUNBO2FBQzFCQSxPQUFPQSxDQUFDQSxVQUFDQSxDQUFNQTtZQUNkQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxDQUFDQSxDQUFDQSxVQUFDQSxDQUFNQTtZQUNSQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsQ0FBQ0EsQ0FBQ0EsVUFBQ0EsQ0FBTUE7WUFDUkEsTUFBTUEsQ0FBQ0Esa0JBQVdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzFEQSxDQUFDQSxDQUFDQTthQUNEQSxFQUFFQSxDQUFDQTtZQUNGQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNoQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFUEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsSUFBSUEsWUFBWUEsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FB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SUEsRUFBRUEsQ0FBQ0E7WUFDYkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDUEEsQ0FBQ0E7UUFFREYsdUJBQXVCQSxTQUE0QkE7WUFDakRHLFNBQVNBO2lCQUNOQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxLQUFLQSxDQUFDQTtpQkFDcEJBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLFVBQUNBLENBQUNBLEVBQUVBLENBQUNBO2dCQUNkQSxNQUFNQSxDQUFDQSxrQkFBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsU0FBU0EsRUFBRUEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDeERBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDaEJBLE1BQU1BLENBQUNBLHVCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkVBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDbEJBLE1BQU1BLENBQUNBLDJCQUFvQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQTtpQkFDcEJB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Q0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNoQkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDZkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDMUJBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO1lBQ2JBLENBQUNBLENBQUNBLENBQUNBO1FBRVBBLENBQUNBO1FBRURMLHVCQUF1QkEsU0FBNEJBO1lBQ2pETSxTQUFTQTtpQkFDTkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsQ0FBQ0E7Z0JBQ1JBLE1BQU1BLENBQUNBLENBQUNBLHVCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxtQkFBbUJBLENBQUNBO2lCQUNsQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbERBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsREEsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2QkEsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZ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Q0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDMURBLENBQUNBLENBQUNBO2lCQUNEQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQTtnQkFDYkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDbkJBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFdBQVdBLEVBQUVBLFVBQUNBLENBQUNBLEVBQUVBLENBQUNBO2dCQUN0QkEsaUJBQWlCQTtZQUNuQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsRUFBRUE7Z0JBQ2hCQSxhQUFhQTtZQUNmQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNMQSxlQUFlQTtZQUNmQSxhQUFhQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtpQkFDbkNBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBO2dCQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsU0FBU0EsQ0FBQ0E7aUJBQ3hCQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQTtpQkFDWkEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0Esa0JBQVdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFEQSxDQUFDQSxDQUFDQTtpQkFDREEsS0FBS0EsQ0FBQ0Es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Q0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLENBQUNBLENBQUNBO2FBQ0RBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBO1lBQ2JBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQ2hCQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxXQUFXQSxFQUFFQSxVQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN0QkEsaUJBQWlCQTtRQUNuQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsRUFBRUE7WUFDaEJBLGFBQWFBO1FBQ2ZBLENBQUNBLENBQUNBLENBQUNBO1FBQ0xBLGVBQWVBO1FBQ2ZBLFlBQVlBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO2FBQ2xDQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxRQUFRQSxDQUFDQTthQUN2QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7YUFDWkEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0Esa0JBQVdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNB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QkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDaEJBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQ2hCQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNMQSxlQUFlQTtRQUNmQSxxQkFBcUJBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO2FBQ3pDQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSx1QkFBdUJBLENBQUNBO2FBQ3RDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxV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QUFDQTtRQUNMQSxrQkFBa0JBO1FBQ2xCQSxnQkFBZ0JBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO0lBRW5DQSxDQUFDQTtJQXhQZXJHLDZCQUFzQkEseUJBd1ByQ0EsQ0FBQUE7QUFFSEEsQ0FBQ0EsRUEvUFMsTUFBTSxLQUFOLE1BQU0sUUErUGYiLCJmaWxlIjoiaGF3a3VsYXItY2hhcnRzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbmFtZSAgaGF3a3VsYXItY2hhcnRzXG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiAgIEJhc2UgbW9kdWxlIGZvciBoYXdrdWxhci1jaGFydHMuXG4gKlxuICovXG5hbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJywgW10pO1xuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcbiAgLyoqXG4gICAqIERlZmluZXMgYW4gaW5kaXZpZHVhbCBhbGVydCBib3VuZHMgIHRvIGJlIHZpc3VhbGx5IGhpZ2hsaWdodGVkIGluIGEgY2hhcnRcbiAgICogdGhhdCBhbiBhbGVydCB3YXMgYWJvdmUvYmVsb3cgYSB0aHJlc2hvbGQuXG4gICAqL1xuICBleHBvcnQgY2xhc3MgQWxlcnRCb3VuZCB7XG4gICAgcHVibGljIHN0YXJ0RGF0ZTogRGF0ZTtcbiAgICBwdWJsaWMgZW5kRGF0ZTogRGF0ZTtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgcHVibGljIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgcHVibGljIGFsZXJ0VmFsdWU6IG51bWJlcikge1xuICAgICAgdGhpcy5zdGFydERhdGUgPSBuZXcgRGF0ZShzdGFydFRpbWVzdGFtcCk7XG4gICAgICB0aGlzLmVuZERhdGUgPSBuZXcgRGF0ZShlbmRUaW1lc3RhbXApO1xuICAgIH1cblxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQWxlcnRMaW5lRGVmKHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcikge1xuICAgIGxldCBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgLmludGVycG9sYXRlKCdtb25vdG9uZScpXG4gICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHlTY2FsZShhbGVydFZhbHVlKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIGxpbmU7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlQWxlcnRMaW5lKHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgYWxlcnRWYWx1ZTogbnVtYmVyLFxuICAgIGNzc0NsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgbGV0IHBhdGhBbGVydExpbmUgPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmFsZXJ0TGluZScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHBhdGhBbGVydExpbmUuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGUsIHlTY2FsZSwgYWxlcnRWYWx1ZSkpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcGF0aEFsZXJ0TGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGUsIHlTY2FsZSwgYWxlcnRWYWx1ZSkpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcGF0aEFsZXJ0TGluZS5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gZXh0cmFjdEFsZXJ0UmFuZ2VzKGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sIHRocmVzaG9sZDogQWxlcnRUaHJlc2hvbGQpOiBBbGVydEJvdW5kW10ge1xuICAgIGxldCBhbGVydEJvdW5kQXJlYUl0ZW1zOiBBbGVydEJvdW5kW107XG4gICAgbGV0IHN0YXJ0UG9pbnRzOiBudW1iZXJbXTtcblxuICAgIGZ1bmN0aW9uIGZpbmRTdGFydFBvaW50cyhjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCB0aHJlc2hvbGQ6IEFsZXJ0VGhyZXNob2xkKSB7XG4gICAgICBsZXQgc3RhcnRQb2ludHMgPSBbXTtcbiAgICAgIGxldCBwcmV2SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBjaGFydERhdGEuZm9yRWFjaCgoY2hhcnRJdGVtOiBJQ2hhcnREYXRhUG9pbnQsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBpZiAoaSA9PT0gMCAmJiBjaGFydEl0ZW0uYXZnID4gdGhyZXNob2xkKSB7XG4gICAgICAgICAgc3RhcnRQb2ludHMucHVzaChpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwcmV2SXRlbSA9IGNoYXJ0RGF0YVtpIC0gMV07XG4gICAgICAgICAgaWYgKGNoYXJ0SXRlbS5hdmcgPiB0aHJlc2hvbGQgJiYgcHJldkl0ZW0gJiYgKCFwcmV2SXRlbS5hdmcgfHwgcHJldkl0ZW0uYXZnIDw9IHRocmVzaG9sZCkpIHtcbiAgICAgICAgICAgIHN0YXJ0UG9pbnRzLnB1c2gocHJldkl0ZW0uYXZnID8gKGkgLSAxKSA6IGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBzdGFydFBvaW50cztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzOiBudW1iZXJbXSwgdGhyZXNob2xkOiBBbGVydFRocmVzaG9sZCk6IEFsZXJ0Qm91bmRbXSB7XG4gICAgICBsZXQgYWxlcnRCb3VuZEFyZWFJdGVtczogQWxlcnRCb3VuZFtdID0gW107XG4gICAgICBsZXQgY3VycmVudEl0ZW06IElDaGFydERhdGFQb2ludDtcbiAgICAgIGxldCBuZXh0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuICAgICAgbGV0IHN0YXJ0SXRlbTogSUNoYXJ0RGF0YVBvaW50O1xuXG4gICAgICBzdGFydFBvaW50cy5mb3JFYWNoKChzdGFydFBvaW50SW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICBzdGFydEl0ZW0gPSBjaGFydERhdGFbc3RhcnRQb2ludEluZGV4XTtcblxuICAgICAgICBmb3IgKGxldCBqID0gc3RhcnRQb2ludEluZGV4OyBqIDwgY2hhcnREYXRhLmxlbmd0aCAtIDE7IGorKykge1xuICAgICAgICAgIGN1cnJlbnRJdGVtID0gY2hhcnREYXRhW2pdO1xuICAgICAgICAgIG5leHRJdGVtID0gY2hhcnREYXRhW2ogKyAxXTtcblxuICAgICAgICAgIGlmICgoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmIG5leHRJdGVtLmF2ZyA8PSB0aHJlc2hvbGQpXG4gICAgICAgICAgICB8fCAoY3VycmVudEl0ZW0uYXZnID4gdGhyZXNob2xkICYmICFuZXh0SXRlbS5hdmcpKSB7XG4gICAgICAgICAgICBhbGVydEJvdW5kQXJlYUl0ZW1zLnB1c2gobmV3IEFsZXJ0Qm91bmQoc3RhcnRJdGVtLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgbmV4dEl0ZW0uYXZnID8gbmV4dEl0ZW0udGltZXN0YW1wIDogY3VycmVudEl0ZW0udGltZXN0YW1wLCB0aHJlc2hvbGQpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vLyBtZWFucyB0aGUgbGFzdCBwaWVjZSBkYXRhIGlzIGFsbCBhYm92ZSB0aHJlc2hvbGQsIHVzZSBsYXN0IGRhdGEgcG9pbnRcbiAgICAgIGlmIChhbGVydEJvdW5kQXJlYUl0ZW1zLmxlbmd0aCA9PT0gKHN0YXJ0UG9pbnRzLmxlbmd0aCAtIDEpKSB7XG4gICAgICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMucHVzaChuZXcgQWxlcnRCb3VuZChjaGFydERhdGFbc3RhcnRQb2ludHNbc3RhcnRQb2ludHMubGVuZ3RoIC0gMV1dLnRpbWVzdGFtcCxcbiAgICAgICAgICBjaGFydERhdGFbY2hhcnREYXRhLmxlbmd0aCAtIDFdLnRpbWVzdGFtcCwgdGhyZXNob2xkKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBhbGVydEJvdW5kQXJlYUl0ZW1zO1xuICAgIH1cblxuICAgIHN0YXJ0UG9pbnRzID0gZmluZFN0YXJ0UG9pbnRzKGNoYXJ0RGF0YSwgdGhyZXNob2xkKTtcblxuICAgIGFsZXJ0Qm91bmRBcmVhSXRlbXMgPSBmaW5kRW5kUG9pbnRzRm9yU3RhcnRQb2ludEluZGV4KHN0YXJ0UG9pbnRzLCB0aHJlc2hvbGQpO1xuXG4gICAgcmV0dXJuIGFsZXJ0Qm91bmRBcmVhSXRlbXM7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBbGVydEJvdW5kc0FyZWEoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgaGVpZ2h0Om51bWJlcixcbiAgICBoaWdoQm91bmQ6IG51bWJlcixcbiAgICBhbGVydEJvdW5kczogQWxlcnRCb3VuZFtdKSB7XG4gICAgbGV0IHJlY3RBbGVydCA9IHN2Zy5zZWxlY3QoJ2cuYWxlcnRIb2xkZXInKS5zZWxlY3RBbGwoJ3JlY3QuYWxlcnRCb3VuZHMnKS5kYXRhKGFsZXJ0Qm91bmRzKTtcblxuICAgIGZ1bmN0aW9uIGFsZXJ0Qm91bmRpbmdSZWN0KHNlbGVjdGlvbikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdhbGVydEJvdW5kcycpXG4gICAgICAgIC5hdHRyKCd4JywgKGQ6IEFsZXJ0Qm91bmQpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQuc3RhcnRUaW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneScsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGhpZ2hCb3VuZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZDogQWxlcnRCb3VuZCkgPT4ge1xuICAgICAgICAgIC8vL0B0b2RvOiBtYWtlIHRoZSBoZWlnaHQgYWRqdXN0YWJsZVxuICAgICAgICAgIC8vcmV0dXJuIDE4NTtcbiAgICAgICAgICByZXR1cm4gaGVpZ2h0O1xuICAgICAgICAgIC8vcmV0dXJuIHlTY2FsZSgwKSAtIGhlaWdodDtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQ6IEFsZXJ0Qm91bmQpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQuZW5kVGltZXN0YW1wKSAtIHRpbWVTY2FsZShkLnN0YXJ0VGltZXN0YW1wKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgcmVjdEFsZXJ0LmNhbGwoYWxlcnRCb3VuZGluZ1JlY3QpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcmVjdEFsZXJ0LmVudGVyKClcbiAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgLmNhbGwoYWxlcnRCb3VuZGluZ1JlY3QpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcmVjdEFsZXJ0LmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkZWNsYXJlIGxldCBkMzogYW55O1xuXG4gIGNvbnN0IF9tb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJyk7XG5cbiAgZXhwb3J0IGNsYXNzIEF2YWlsU3RhdHVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgVVAgPSAndXAnO1xuICAgIHB1YmxpYyBzdGF0aWMgRE9XTiA9ICdkb3duJztcbiAgICBwdWJsaWMgc3RhdGljIFVOS05PV04gPSAndW5rbm93bic7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykge1xuICAgICAgLy8gZW1wdHlcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSBpbnB1dCBkYXRhIGZvcm1hdCwgZGlyZWN0bHkgZnJvbSBNZXRyaWNzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQXZhaWxEYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyB0aGUgdHJhbnNmb3JtZWQgb3V0cHV0IGRhdGEgZm9ybWF0LiBGb3JtYXR0ZWQgdG8gd29yayB3aXRoIGF2YWlsYWJpbGl0eSBjaGFydCAoYmFzaWNhbGx5IGEgRFRPKS5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBudW1iZXI7XG4gICAgZW5kOiBudW1iZXI7XG4gICAgdmFsdWU6IHN0cmluZztcbiAgICBzdGFydERhdGU/OiBEYXRlOyAvLy8gTWFpbmx5IGZvciBkZWJ1Z2dlciBodW1hbiByZWFkYWJsZSBkYXRlcyBpbnN0ZWFkIG9mIGEgbnVtYmVyXG4gICAgZW5kRGF0ZT86IERhdGU7XG4gICAgZHVyYXRpb24/OiBzdHJpbmc7XG4gICAgbWVzc2FnZT86IHN0cmluZztcbiAgfVxuXG4gIGV4cG9ydCBjbGFzcyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IGltcGxlbWVudHMgSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQge1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHN0YXJ0OiBudW1iZXIsXG4gICAgICBwdWJsaWMgZW5kOiBudW1iZXIsXG4gICAgICBwdWJsaWMgdmFsdWU6IHN0cmluZyxcbiAgICAgIHB1YmxpYyBzdGFydERhdGU/OiBEYXRlLFxuICAgICAgcHVibGljIGVuZERhdGU/OiBEYXRlLFxuICAgICAgcHVibGljIGR1cmF0aW9uPzogc3RyaW5nLFxuICAgICAgcHVibGljIG1lc3NhZ2U/OiBzdHJpbmcpIHtcblxuICAgICAgdGhpcy5kdXJhdGlvbiA9IG1vbWVudChlbmQpLmZyb20obW9tZW50KHN0YXJ0KSwgdHJ1ZSk7XG4gICAgICB0aGlzLnN0YXJ0RGF0ZSA9IG5ldyBEYXRlKHN0YXJ0KTtcbiAgICAgIHRoaXMuZW5kRGF0ZSA9IG5ldyBEYXRlKGVuZCk7XG4gICAgfVxuXG4gIH1cblxuICBleHBvcnQgY2xhc3MgQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX0hFSUdIVCA9IDE1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfV0lEVEggPSA3NTA7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGRhdGE6ICc9JyxcbiAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICBlbmRUaW1lc3RhbXA6ICdAJyxcbiAgICAgIHRpbWVMYWJlbDogJ0AnLFxuICAgICAgZGF0ZUxhYmVsOiAnQCcsXG4gICAgICBjaGFydFRpdGxlOiAnQCdcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6IChzY29wZTogYW55LCBlbGVtZW50OiBuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczogYW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIHRyYW5zZm9ybWVkRGF0YVBvaW50czogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSB7XG5cbiAgICAgIHRoaXMubGluayA9IChzY29wZSwgZWxlbWVudCwgYXR0cnMpID0+IHtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IHN0YXJ0VGltZXN0YW1wOiBudW1iZXIgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAsXG4gICAgICAgICAgZW5kVGltZXN0YW1wOiBudW1iZXIgPSArYXR0cnMuZW5kVGltZXN0YW1wLFxuICAgICAgICAgIGNoYXJ0SGVpZ2h0ID0gQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVDtcblxuICAgICAgICAvLyBjaGFydCBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBtYXJnaW4gPSB7IHRvcDogMTAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwIH0sXG4gICAgICAgICAgd2lkdGggPSBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5fQ0hBUlRfV0lEVEggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCxcbiAgICAgICAgICBhZGp1c3RlZENoYXJ0SGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSA1MCxcbiAgICAgICAgICBoZWlnaHQgPSBhZGp1c3RlZENoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgdGl0bGVIZWlnaHQgPSAzMCxcbiAgICAgICAgICB0aXRsZVNwYWNlID0gMTAsXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AgLSB0aXRsZUhlaWdodCAtIHRpdGxlU3BhY2UsXG4gICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodDIgPSArdGl0bGVIZWlnaHQgKyB0aXRsZVNwYWNlICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgIHhBeGlzR3JvdXAsXG4gICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICB0aXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnO1xuXG4gICAgICAgIGZ1bmN0aW9uIGJ1aWxkQXZhaWxIb3ZlcihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz5TdGF0dXM6PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QudmFsdWUudG9VcHBlckNhc2UoKX08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSBiZWZvcmUtc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+RHVyYXRpb246PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QuZHVyYXRpb259PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uZVRpbWVDaGFydFNldHVwKCk6IHZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgLmF0dHIoJ3ZpZXdCb3gnLCAnMCAwIDc2MCAxNTAnKS5hdHRyKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ3hNaW5ZTWluIG1lZXQnKTtcblxuICAgICAgICAgIHRpcCA9IGQzLnRpcCgpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZDMtdGlwJylcbiAgICAgICAgICAgIC5vZmZzZXQoWy0xMCwgMF0pXG4gICAgICAgICAgICAuaHRtbCgoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGJ1aWxkQXZhaWxIb3ZlcihkKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoICsgbWFyZ2luLmxlZnQgKyBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodClcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsJyArIChhZGp1c3RlZENoYXJ0SGVpZ2h0MikgKyAnKScpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZGVmcycpXG4gICAgICAgICAgICAuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgICAgICAgIC5hdHRyKCdpZCcsICdkaWFnb25hbC1zdHJpcGVzJylcbiAgICAgICAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgICAgICAgLmF0dHIoJ3BhdHRlcm5UcmFuc2Zvcm0nLCAnc2NhbGUoMC43KScpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCA0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDQpXG4gICAgICAgICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5hdHRyKCdkJywgJ00tMSwxIGwyLC0yIE0wLDQgbDQsLTQgTTMsNSBsMiwtMicpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgJyNCNkI2QjYnKVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIDEuMik7XG5cbiAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lQXZhaWxTY2FsZSh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSB7XG4gICAgICAgICAgbGV0IGFkanVzdGVkVGltZVJhbmdlOiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAgfHxcbiAgICAgICAgICAgIGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGQuc3RhcnQ7XG4gICAgICAgICAgICB9KSB8fCArbW9tZW50KCkuc3VidHJhY3QoMSwgJ2hvdXInKTtcblxuICAgICAgICAgIGlmICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50ICYmIHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQubGVuZ3RoID4gMCkge1xuXG4gICAgICAgICAgICBhZGp1c3RlZFRpbWVSYW5nZVswXSA9IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgICAgYWRqdXN0ZWRUaW1lUmFuZ2VbMV0gPSBlbmRUaW1lc3RhbXAgfHwgK21vbWVudCgpO1xuXG4gICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlUm91bmQoWzcwLCAwXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihbMCwgMTc1XSk7XG5cbiAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAuc2NhbGUoeVNjYWxlKVxuICAgICAgICAgICAgICAudGlja3MoMClcbiAgICAgICAgICAgICAgLnRpY2tTaXplKDAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgICAuZG9tYWluKGFkanVzdGVkVGltZVJhbmdlKTtcblxuICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgIC50aWNrU2l6ZSgtNzAsIDApXG4gICAgICAgICAgICAgIC5vcmllbnQoJ3RvcCcpXG4gICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSk7XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBpc1VwKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVQLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2Z1bmN0aW9uIGlzRG93bihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAvLyAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLkRPV04udG9TdHJpbmcoKTtcbiAgICAgICAgLy99XG5cbiAgICAgICAgZnVuY3Rpb24gaXNVbmtub3duKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGQudmFsdWUgPT09IEF2YWlsU3RhdHVzLlVOS05PV04udG9TdHJpbmcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhpbkF2YWlsRGF0YTogSUF2YWlsRGF0YVBvaW50W10pOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdIHtcbiAgICAgICAgICBsZXQgb3V0cHV0RGF0YTogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSA9IFtdO1xuICAgICAgICAgIGxldCBpdGVtQ291bnQgPSBpbkF2YWlsRGF0YS5sZW5ndGg7XG5cbiAgICAgICAgICBmdW5jdGlvbiBzb3J0QnlUaW1lc3RhbXAoYTogSUF2YWlsRGF0YVBvaW50LCBiOiBJQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIGlmIChhLnRpbWVzdGFtcCA8IGIudGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhLnRpbWVzdGFtcCA+IGIudGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaW5BdmFpbERhdGEuc29ydChzb3J0QnlUaW1lc3RhbXApO1xuXG4gICAgICAgICAgaWYgKGluQXZhaWxEYXRhICYmIGl0ZW1Db3VudCA+IDAgJiYgaW5BdmFpbERhdGFbMF0udGltZXN0YW1wKSB7XG4gICAgICAgICAgICBsZXQgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICAgICAgICAgIGlmIChpdGVtQ291bnQgPT09IDEpIHtcbiAgICAgICAgICAgICAgbGV0IGF2YWlsSXRlbSA9IGluQXZhaWxEYXRhWzBdO1xuXG4gICAgICAgICAgICAgIC8vIHdlIG9ubHkgaGF2ZSBvbmUgaXRlbSB3aXRoIHN0YXJ0IHRpbWUuIEFzc3VtZSB1bmtub3duIGZvciB0aGUgdGltZSBiZWZvcmUgKGxhc3QgMWgpXG4gICAgICAgICAgICAgIC8vIEBUT0RPIGFkanVzdCB0byB0aW1lIHBpY2tlclxuICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQobm93IC0gNjAgKiA2MCAqIDEwMDAsXG4gICAgICAgICAgICAgICAgYXZhaWxJdGVtLnRpbWVzdGFtcCwgQXZhaWxTdGF0dXMuVU5LTk9XTi50b1N0cmluZygpKSk7XG4gICAgICAgICAgICAgIC8vIGFuZCB0aGUgZGV0ZXJtaW5lZCB2YWx1ZSB1cCB1bnRpbCB0aGUgZW5kLlxuICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoYXZhaWxJdGVtLnRpbWVzdGFtcCwgbm93LCBhdmFpbEl0ZW0udmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxldCBiYWNrd2FyZHNFbmRUaW1lID0gbm93O1xuXG4gICAgICAgICAgICAgIGZvciAobGV0IGkgPSBpbkF2YWlsRGF0YS5sZW5ndGg7IGkgPiAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGRhdGEgc3RhcnRpbmcgaW4gdGhlIGZ1dHVyZS4uLiBkaXNjYXJkIGl0XG4gICAgICAgICAgICAgICAgLy9pZiAoaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCA+ICttb21lbnQoKSkge1xuICAgICAgICAgICAgICAgIC8vICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAvL31cbiAgICAgICAgICAgICAgICBpZiAoc3RhcnRUaW1lc3RhbXAgPj0gaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KHN0YXJ0VGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lLCBpbkF2YWlsRGF0YVtpIC0gMV0udmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSwgaW5BdmFpbERhdGFbaSAtIDFdLnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lID0gaW5BdmFpbERhdGFbaSAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG91dHB1dERhdGE7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVTaWRlWUF4aXNMYWJlbHMoKSB7XG4gICAgICAgICAgLy8vQFRvZG86IG1vdmUgb3V0IHRvIHN0eWxlc2hlZXRcbiAgICAgICAgICBzdmcuYXBwZW5kKCd0ZXh0JylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmFpbFVwTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDI1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdVcCcpO1xuXG4gICAgICAgICAgc3ZnLmFwcGVuZCgndGV4dCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxEb3duTGFiZWwnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAtMTApXG4gICAgICAgICAgICAuYXR0cigneScsIDU1KVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LWZhbWlseScsICdBcmlhbCwgVmVyZGFuYSwgc2Fucy1zZXJpZjsnKVxuICAgICAgICAgICAgLnN0eWxlKCdmb250LXNpemUnLCAnMTJweCcpXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsICcjOTk5JylcbiAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnZW5kJylcbiAgICAgICAgICAgIC50ZXh0KCdEb3duJyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10pIHtcbiAgICAgICAgICAvL2xldCB4QXhpc01pbiA9IGQzLm1pbih0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAvLyAgcmV0dXJuICtkLnN0YXJ0O1xuICAgICAgICAgIC8vfSksXG4gICAgICAgICAgbGV0IHhBeGlzTWF4ID0gZDMubWF4KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICtkLmVuZDtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBhdmFpbFRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAuZG9tYWluKFtzdGFydFRpbWVzdGFtcCwgZW5kVGltZXN0YW1wIHx8IHhBeGlzTWF4XSksXG5cbiAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2UoW2hlaWdodCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oWzAsIDRdKTtcblxuICAgICAgICAgIC8vYXZhaWxYQXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAvLyAgLnNjYWxlKGF2YWlsVGltZVNjYWxlKVxuICAgICAgICAgIC8vICAudGlja3MoOClcbiAgICAgICAgICAvLyAgLnRpY2tTaXplKDEzLCAwKVxuICAgICAgICAgIC8vICAub3JpZW50KCd0b3AnKTtcblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgb2Zmc2V0IGZvciB0aGUgYmFyXG4gICAgICAgICAgLy8gVXAgb3IgVW5rbm93bjogb2Zmc2V0IDAsIERvd246IG9mZnNldCAzNVxuICAgICAgICAgIGZ1bmN0aW9uIGNhbGNCYXJZKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgICByZXR1cm4gaGVpZ2h0IC0geVNjYWxlKDApICsgKChpc1VwKGQpIHx8IGlzVW5rbm93bihkKSkgPyAwIDogMzUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEZvciBlYWNoIGRhdGFwb2ludCBjYWxjdWxhdGUgdGhlIFkgcmVtb3ZlZCBoZWlnaHQgZm9yIHRoZSBiYXJcbiAgICAgICAgICAvLyBVbmtub3duOiBmdWxsIGhlaWdodCAxNSwgVXAgb3IgRG93bjogaGFsZiBoZWlnaHQsIDUwXG4gICAgICAgICAgZnVuY3Rpb24gY2FsY0JhckhlaWdodChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgcmV0dXJuIHlTY2FsZSgwKSAtIChpc1Vua25vd24oZCkgPyAxNSA6IDUwKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjYWxjQmFyRmlsbChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgaWYgKGlzVXAoZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjNTRBMjRFJzsgLy8gZ3JlZW5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNVbmtub3duKGQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndXJsKCNkaWFnb25hbC1zdHJpcGVzKSc7IC8vIGdyYXkgc3RyaXBlc1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuICcjRDg1MDU0JzsgLy8gcmVkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncmVjdC5hdmFpbEJhcnMnKVxuICAgICAgICAgICAgLmRhdGEodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludClcbiAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxCYXJzJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJZKGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gY2FsY0JhckhlaWdodChkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGRFbmQgPSBlbmRUaW1lc3RhbXAgPyAoTWF0aC5taW4oK2QuZW5kLCBlbmRUaW1lc3RhbXApKSA6ICgrZC5lbmQpO1xuICAgICAgICAgICAgICByZXR1cm4gYXZhaWxUaW1lU2NhbGUoZEVuZCkgLSBhdmFpbFRpbWVTY2FsZSgrZC5zdGFydCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJGaWxsKGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gMC44NTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2Vkb3duJywgKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgYnJ1c2hFbGVtID0gc3ZnLnNlbGVjdCgnLmJydXNoJykubm9kZSgpO1xuICAgICAgICAgICAgICBsZXQgY2xpY2tFdmVudDogYW55ID0gbmV3IEV2ZW50KCdtb3VzZWRvd24nKTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWCA9IGQzLmV2ZW50LnBhZ2VYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFggPSBkMy5ldmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VZID0gZDMuZXZlbnQucGFnZVk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WSA9IGQzLmV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICAgIGJydXNoRWxlbS5kaXNwYXRjaEV2ZW50KGNsaWNrRXZlbnQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2V1cCcsICgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGJydXNoRWxlbSA9IHN2Zy5zZWxlY3QoJy5icnVzaCcpLm5vZGUoKTtcbiAgICAgICAgICAgICAgbGV0IGNsaWNrRXZlbnQ6IGFueSA9IG5ldyBFdmVudCgnbW91c2V1cCcpO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VYID0gZDMuZXZlbnQucGFnZVg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WCA9IGQzLmV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVkgPSBkMy5ldmVudC5wYWdlWTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRZID0gZDMuZXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgYnJ1c2hFbGVtLmRpc3BhdGNoRXZlbnQoY2xpY2tFdmVudCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIFRoZSBib3R0b20gbGluZSBvZiB0aGUgYXZhaWxhYmlsaXR5IGNoYXJ0XG4gICAgICAgICAgc3ZnLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuYXR0cigneDEnLCAwKVxuICAgICAgICAgICAgLmF0dHIoJ3kxJywgNzApXG4gICAgICAgICAgICAuYXR0cigneDInLCA2NTUpXG4gICAgICAgICAgICAuYXR0cigneTInLCA3MClcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAwLjUpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgJyNEMEQwRDAnKTtcblxuICAgICAgICAgIGNyZWF0ZVNpZGVZQXhpc0xhYmVscygpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWGFuZFlBeGVzKCkge1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGJydXNoRW5kKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDcwKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgZXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgIHN0YXJ0VGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvL3N2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5BVkFJTF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBleHRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChuZXdEYXRhKSB7XG4gICAgICAgICAgICB0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyA9IGZvcm1hdFRyYW5zZm9ybWVkRGF0YVBvaW50cyhhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ3N0YXJ0VGltZXN0YW1wJywgJ2VuZFRpbWVzdGFtcCddLCAobmV3VGltZXN0YW1wKSA9PiB7XG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzBdIHx8IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgIGVuZFRpbWVzdGFtcCA9ICtuZXdUaW1lc3RhbXBbMV0gfHwgZW5kVGltZXN0YW1wO1xuICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLnRyYW5zZm9ybWVkRGF0YVBvaW50cyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLnJlbmRlciA9ICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQgJiYgdHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUudGltZSgnYXZhaWxDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgb25lVGltZUNoYXJ0U2V0dXAoKTtcbiAgICAgICAgICAgIGRldGVybWluZUF2YWlsU2NhbGUodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCk7XG4gICAgICAgICAgICBjcmVhdGVYYW5kWUF4ZXMoKTtcbiAgICAgICAgICAgIGNyZWF0ZVhBeGlzQnJ1c2goKTtcbiAgICAgICAgICAgIGNyZWF0ZUF2YWlsYWJpbGl0eUNoYXJ0KHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpO1xuICAgICAgICAgICAgLy9jb25zb2xlLnRpbWVFbmQoJ2F2YWlsQ2hhcnRSZW5kZXInKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnYXZhaWxhYmlsaXR5Q2hhcnQnLCBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5GYWN0b3J5KCkpO1xufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgY29uc3QgX21vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKTtcblxuXG4gIGV4cG9ydCBjbGFzcyBDb250ZXh0Q2hhcnREaXJlY3RpdmUge1xuXG4gICAgLy8gdGhlc2UgYXJlIGp1c3Qgc3RhcnRpbmcgcGFyYW1ldGVyIGhpbnRzXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX1dJRFRIX0hJTlQgPSA3NTA7XG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX0hFSUdIVF9ISU5UID0gNTA7XG4gICAgcHJpdmF0ZSBzdGF0aWMgX1hBWElTX0hFSUdIVCA9IDE1O1xuXG4gICAgcHVibGljIHJlc3RyaWN0ID0gJ0UnO1xuICAgIHB1YmxpYyByZXBsYWNlID0gdHJ1ZTtcblxuICAgIC8vIENhbid0IHVzZSAxLjQgZGlyZWN0aXZlIGNvbnRyb2xsZXJzIGJlY2F1c2Ugd2UgbmVlZCB0byBzdXBwb3J0IDEuMytcbiAgICBwdWJsaWMgc2NvcGUgPSB7XG4gICAgICBkYXRhOiAnPScsXG4gICAgICBzaG93WUF4aXNWYWx1ZXM6ICc9JyxcbiAgICB9O1xuXG4gICAgcHVibGljIGxpbms6IChzY29wZTogYW55LCBlbGVtZW50OiBuZy5JQXVnbWVudGVkSlF1ZXJ5LCBhdHRyczogYW55KSA9PiB2b2lkO1xuXG4gICAgcHVibGljIGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdO1xuXG4gICAgY29uc3RydWN0b3IoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpIHtcblxuICAgICAgdGhpcy5saW5rID0gKHNjb3BlLCBlbGVtZW50LCBhdHRycykgPT4ge1xuXG4gICAgICAgIGNvbnN0IG1hcmdpbiA9IHsgdG9wOiAwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA5MCB9O1xuXG4gICAgICAgIC8vIGRhdGEgc3BlY2lmaWMgdmFyc1xuICAgICAgICBsZXQgY2hhcnRIZWlnaHQgPSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVF9ISU5ULFxuICAgICAgICAgIHdpZHRoID0gQ29udGV4dENoYXJ0RGlyZWN0aXZlLl9DSEFSVF9XSURUSF9ISU5UIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgaGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSAtMTUsXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AsXG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzOiBib29sZWFuLFxuICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB5QXhpc0dyb3VwLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGJydXNoLFxuICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnO1xuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuc2hvd1lBeGlzVmFsdWVzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlcyA9IGF0dHJzLnNob3dZQXhpc1ZhbHVlcyA9PT0gJ3RydWUnO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcmVzaXplKCk6IHZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuXG4gICAgICAgICAgY29uc29sZS5kaXIoZWxlbWVudFswXSk7XG4gICAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGVsZW1lbnRbMF0ucGFyZW50Tm9kZTtcblxuICAgICAgICAgIHdpZHRoID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50V2lkdGg7XG4gICAgICAgICAgaGVpZ2h0ID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50SGVpZ2h0O1xuXG4gICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20gLSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX1hBWElTX0hFSUdIVCxcblxuICAgICAgICAgIC8vY29uc29sZS5sb2coJ0NvbnRleHQgV2lkdGg6ICVpJyx3aWR0aCk7XG4gICAgICAgICAgLy9jb25zb2xlLmxvZygnQ29udGV4dCBIZWlnaHQ6ICVpJyxoZWlnaHQpO1xuXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3A7XG5cbiAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywgMCknKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRDaGFydCcpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVDb250ZXh0Q2hhcnQoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICAgICAgICAvL2NvbnNvbGUud2FybignZGF0YVBvaW50cy5sZW5ndGg6ICcgKyBkYXRhUG9pbnRzLmxlbmd0aCk7XG5cbiAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGggLSAxMF0pXG4gICAgICAgICAgICAubmljZSgpXG4gICAgICAgICAgICAuZG9tYWluKFtkYXRhUG9pbnRzWzBdLnRpbWVzdGFtcCwgZGF0YVBvaW50c1tkYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcF0pO1xuXG4gICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgLnRpY2tTaXplKDQsIDApXG4gICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAub3JpZW50KCdib3R0b20nKTtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgwLCcgKyBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgKyAnKScpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICBsZXQgeU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCB5TWF4ID0gZDMubWF4KGRhdGFQb2ludHMsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBnaXZlIGEgcGFkIG9mICUgdG8gbWluL21heCBzbyB3ZSBhcmUgbm90IGFnYWluc3QgeC1heGlzXG4gICAgICAgICAgeU1heCA9IHlNYXggKyAoeU1heCAqIDAuMDMpO1xuICAgICAgICAgIHlNaW4gPSB5TWluIC0gKHlNaW4gKiAwLjA1KTtcblxuICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAucmFuZ2VSb3VuZChbbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCAwXSlcbiAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgIC5kb21haW4oW3lNaW4sIHlNYXhdKTtcblxuICAgICAgICAgIGxldCBudW1iZXJPZlRpY2tzID0gc2hvd1lBeGlzVmFsdWVzID8gMiA6IDA7XG5cbiAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAudGlja3MobnVtYmVyT2ZUaWNrcylcbiAgICAgICAgICAgIC50aWNrU2l6ZSg0LCAwKVxuICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgeUF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh5QXhpcyk7XG5cbiAgICAgICAgICBsZXQgYXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgICAgIC5pbnRlcnBvbGF0ZSgnY2FyZGluYWwnKVxuICAgICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gIWQuZW1wdHk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55MSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgY29udGV4dExpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAuaW50ZXJwb2xhdGUoJ2NhcmRpbmFsJylcbiAgICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IHBhdGhDb250ZXh0TGluZSA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGguY29udGV4dExpbmUnKS5kYXRhKFtkYXRhUG9pbnRzXSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuYXR0cignY2xhc3MnLCAnY29udGV4dExpbmUnKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBjb250ZXh0TGluZSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRMaW5lJylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5hdHRyKCdkJywgY29udGV4dExpbmUpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgcGF0aENvbnRleHRMaW5lLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIGxldCBjb250ZXh0QXJlYSA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHQnKTtcblxuICAgICAgICAgIGNvbnRleHRBcmVhLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuZGF0dW0oZGF0YVBvaW50cylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5kdXJhdGlvbig1MDApXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dEFyZWEnKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBhcmVhKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWEF4aXNCcnVzaCgpIHtcblxuICAgICAgICAgIGJydXNoID0gZDMuc3ZnLmJydXNoKClcbiAgICAgICAgICAgIC54KHRpbWVTY2FsZSlcbiAgICAgICAgICAgIC5vbignYnJ1c2hzdGFydCcsIGNvbnRleHRCcnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGNvbnRleHRCcnVzaEVuZCk7XG5cbiAgICAgICAgICB4QXhpc0dyb3VwLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCd5JywgMClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBoZWlnaHQgLSAxMCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYnJ1c2gnKVxuICAgICAgICAgICAgLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJy5yZXNpemUnKS5hcHBlbmQoJ3BhdGgnKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBoZWlnaHQgKyAxNyk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBjb250ZXh0QnJ1c2hTdGFydCgpIHtcbiAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCB0cnVlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjb250ZXh0QnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgYnJ1c2hFeHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChicnVzaEV4dGVudFswXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChicnVzaEV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvLy8gV2UgaWdub3JlIGRyYWcgc2VsZWN0aW9ucyB1bmRlciBhIG1pbnV0ZVxuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5DT05URVhUX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGJydXNoRXh0ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vZDMuc2VsZWN0KHdpbmRvdykub24oJ3Jlc2l6ZScsIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpKTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhUG9pbnRzID0gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZnVuY3Rpb24gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChyZXNwb25zZSk6IElDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAvLyAgVGhlIHNjaGVtYSBpcyBkaWZmZXJlbnQgZm9yIGJ1Y2tldGVkIG91dHB1dFxuICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6IElDaGFydERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXMgPSBwb2ludC50aW1lc3RhbXAgfHwgKHBvaW50LnN0YXJ0ICsgKHBvaW50LmVuZCAtIHBvaW50LnN0YXJ0KSAvIDIpO1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wLFxuICAgICAgICAgICAgICAgIC8vZGF0ZTogbmV3IERhdGUodGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQudmFsdWUpID8gdW5kZWZpbmVkIDogcG9pbnQudmFsdWUsXG4gICAgICAgICAgICAgICAgYXZnOiAocG9pbnQuZW1wdHkpID8gdW5kZWZpbmVkIDogcG9pbnQuYXZnLFxuICAgICAgICAgICAgICAgIG1pbjogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWluKSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1pbixcbiAgICAgICAgICAgICAgICBtYXg6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1heCkgPyB1bmRlZmluZWQgOiBwb2ludC5tYXgsXG4gICAgICAgICAgICAgICAgZW1wdHk6IHBvaW50LmVtcHR5XG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pID0+IHtcbiAgICAgICAgICBpZiAoZGF0YVBvaW50cyAmJiBkYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUudGltZSgnY29udGV4dENoYXJ0UmVuZGVyJyk7XG5cbiAgICAgICAgICAgIC8vL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIHJlc2l6ZSgpO1xuICAgICAgICAgICAgY3JlYXRlQ29udGV4dENoYXJ0KGRhdGFQb2ludHMpO1xuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuICAgICAgICAgICAgY29uc29sZS50aW1lRW5kKCdjb250ZXh0Q2hhcnRSZW5kZXInKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuXG4gICAgfVxuXG4gICAgcHVibGljIHN0YXRpYyBGYWN0b3J5KCkge1xuICAgICAgbGV0IGRpcmVjdGl2ZSA9ICgkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IENvbnRleHRDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnaGF3a3VsYXJDb250ZXh0Q2hhcnQnLCBDb250ZXh0Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSgpKTtcbn1cbiIsIi8vL1xuLy8vIENvcHlyaWdodCAyMDE1IFJlZCBIYXQsIEluYy4gYW5kL29yIGl0cyBhZmZpbGlhdGVzXG4vLy8gYW5kIG90aGVyIGNvbnRyaWJ1dG9ycyBhcyBpbmRpY2F0ZWQgYnkgdGhlIEBhdXRob3IgdGFncy5cbi8vL1xuLy8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy8vXG4vLy8gICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vLy9cbi8vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8vL1xuLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvLy8gTk9URTogdGhpcyBwYXR0ZXJuIGlzIHVzZWQgYmVjYXVzZSBlbnVtcyBjYW50IGJlIHVzZWQgd2l0aCBzdHJpbmdzXG4gIGV4cG9ydCBjbGFzcyBFdmVudE5hbWVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnQ2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG4gICAgcHVibGljIHN0YXRpYyBBVkFJTF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdBdmFpbENoYXJ0VGltZVJhbmdlQ2hhbmdlZCcpO1xuICAgIHB1YmxpYyBzdGF0aWMgQ09OVEVYVF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdDb250ZXh0Q2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykge1xuICAgICAgLy8gZW1wdHlcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlRGF0YVBvaW50cyhzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICB0aXA6IGFueSxcbiAgICBkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkge1xuICAgIGxldCByYWRpdXMgPSAxO1xuICAgIGxldCBkb3REYXRhcG9pbnQgPSBzdmcuc2VsZWN0QWxsKCcuZGF0YVBvaW50RG90JykuZGF0YShkYXRhUG9pbnRzKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBkb3REYXRhcG9pbnQuYXR0cignY2xhc3MnLCAnZGF0YVBvaW50RG90JylcbiAgICAgIC5hdHRyKCdyJywgcmFkaXVzKVxuICAgICAgLmF0dHIoJ2N4JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiBkLmF2ZyA/IHlTY2FsZShkLmF2ZykgOiAtOTk5OTk5OTtcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBkb3REYXRhcG9pbnQuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAuYXR0cignY2xhc3MnLCAnZGF0YVBvaW50RG90JylcbiAgICAgIC5hdHRyKCdyJywgcmFkaXVzKVxuICAgICAgLmF0dHIoJ2N4JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiBkLmF2ZyA/IHlTY2FsZShkLmF2ZykgOiAtOTk5OTk5OTtcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBkb3REYXRhcG9pbnQuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICBpbXBvcnQgY3JlYXRlU3ZnRGVmcyA9IENoYXJ0cy5jcmVhdGVTdmdEZWZzO1xuICAndXNlIHN0cmljdCc7XG5cbiAgZGVjbGFyZSBsZXQgZDM6YW55O1xuICBkZWNsYXJlIGxldCBjb25zb2xlOmFueTtcblxuICBsZXQgZGVidWc6Ym9vbGVhbiA9IGZhbHNlO1xuXG4gIC8vIHRoZSBzY2FsZSB0byB1c2UgZm9yIHktYXhpcyB3aGVuIGFsbCB2YWx1ZXMgYXJlIDAsIFswLCBERUZBVUxUX1lfU0NBTEVdXG4gIGV4cG9ydCBjb25zdCBERUZBVUxUX1lfU0NBTEUgPSAxMDtcbiAgZXhwb3J0IGNvbnN0IFhfQVhJU19IRUlHSFQgPSAyNTsgLy8gd2l0aCByb29tIGZvciBsYWJlbFxuICBleHBvcnQgY29uc3QgQ0hBUlRfSEVJR0hUID0gMjUwO1xuICBleHBvcnQgY29uc3QgQ0hBUlRfV0lEVEggPSA3NTA7XG4gIGV4cG9ydCBjb25zdCBIT1ZFUl9EQVRFX1RJTUVfRk9STUFUID0gJ01NL0REL1lZWVkgaDptbSBhJztcbiAgZXhwb3J0IGNvbnN0IEJBUl9PRkZTRVQgPSAyO1xuICBleHBvcnQgY29uc3QgbWFyZ2luID0ge3RvcDogMTAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwfTtcbiAgZXhwb3J0IGxldCB3aWR0aCA9IENIQVJUX1dJRFRIIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQ7XG5cbiAgLyoqXG4gICAqIEBuZ2RvYyBkaXJlY3RpdmVcbiAgICogQG5hbWUgaGF3a3VsYXJDaGFydFxuICAgKiBAZGVzY3JpcHRpb24gQSBkMyBiYXNlZCBjaGFydGluZyBkaXJlY3Rpb24gdG8gcHJvdmlkZSBjaGFydGluZyB1c2luZyB2YXJpb3VzIHN0eWxlcyBvZiBjaGFydHMuXG4gICAqXG4gICAqL1xuICBhbmd1bGFyLm1vZHVsZSgnaGF3a3VsYXIuY2hhcnRzJylcbiAgICAuZGlyZWN0aXZlKCdoYXdrdWxhckNoYXJ0JywgWyckcm9vdFNjb3BlJywgJyRodHRwJywgJyRpbnRlcnZhbCcsICckbG9nJyxcbiAgICAgICAgZnVuY3Rpb24gKCRyb290U2NvcGU6bmcuSVJvb3RTY29wZVNlcnZpY2UsXG4gICAgICAgICAgICAgICAgICAkaHR0cDpuZy5JSHR0cFNlcnZpY2UsXG4gICAgICAgICAgICAgICAgICAkaW50ZXJ2YWw6bmcuSUludGVydmFsU2VydmljZSxcbiAgICAgICAgICAgICAgICAgICRsb2c6bmcuSUxvZ1NlcnZpY2UpOm5nLklEaXJlY3RpdmUge1xuXG4gICAgICAgICAgZnVuY3Rpb24gbGluayhzY29wZSwgZWxlbWVudCwgYXR0cnMpIHtcblxuICAgICAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgICAgICBsZXQgZGF0YVBvaW50czpJQ2hhcnREYXRhUG9pbnRbXSA9IFtdLFxuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHM6SU11bHRpRGF0YVBvaW50W10sXG4gICAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50czpJU2ltcGxlTWV0cmljW10sXG4gICAgICAgICAgICAgIGRhdGFVcmwgPSBhdHRycy5tZXRyaWNVcmwsXG4gICAgICAgICAgICAgIG1ldHJpY0lkID0gYXR0cnMubWV0cmljSWQgfHwgJycsXG4gICAgICAgICAgICAgIG1ldHJpY1RlbmFudElkID0gYXR0cnMubWV0cmljVGVuYW50SWQgfHwgJycsXG4gICAgICAgICAgICAgIG1ldHJpY1R5cGUgPSBhdHRycy5tZXRyaWNUeXBlIHx8ICdnYXVnZScsXG4gICAgICAgICAgICAgIHRpbWVSYW5nZUluU2Vjb25kcyA9ICthdHRycy50aW1lUmFuZ2VJblNlY29uZHMgfHwgNDMyMDAsXG4gICAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyA9ICthdHRycy5yZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgfHwgMzYwMCxcbiAgICAgICAgICAgICAgYWxlcnRWYWx1ZSA9ICthdHRycy5hbGVydFZhbHVlLFxuICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uID0gYXR0cnMuaW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgICBlbmRUaW1lc3RhbXA6VGltZUluTWlsbGlzID0gRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXA6VGltZUluTWlsbGlzID0gZW5kVGltZXN0YW1wIC0gdGltZVJhbmdlSW5TZWNvbmRzLFxuICAgICAgICAgICAgICBwcmV2aW91c1JhbmdlRGF0YVBvaW50cyA9IFtdLFxuICAgICAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IFtdLFxuICAgICAgICAgICAgICBjaGFydFR5cGUgPSBhdHRycy5jaGFydFR5cGUgfHwgJ2xpbmUnLFxuICAgICAgICAgICAgICBzaW5nbGVWYWx1ZUxhYmVsID0gYXR0cnMuc2luZ2xlVmFsdWVMYWJlbCB8fCAnUmF3IFZhbHVlJyxcbiAgICAgICAgICAgICAgbm9EYXRhTGFiZWwgPSBhdHRycy5ub0RhdGFMYWJlbCB8fCAnTm8gRGF0YScsXG4gICAgICAgICAgICAgIGR1cmF0aW9uTGFiZWwgPSBhdHRycy5kdXJhdGlvbkxhYmVsIHx8ICdJbnRlcnZhbCcsXG4gICAgICAgICAgICAgIG1pbkxhYmVsID0gYXR0cnMubWluTGFiZWwgfHwgJ01pbicsXG4gICAgICAgICAgICAgIG1heExhYmVsID0gYXR0cnMubWF4TGFiZWwgfHwgJ01heCcsXG4gICAgICAgICAgICAgIGF2Z0xhYmVsID0gYXR0cnMuYXZnTGFiZWwgfHwgJ0F2ZycsXG4gICAgICAgICAgICAgIHRpbWVzdGFtcExhYmVsID0gYXR0cnMudGltZXN0YW1wTGFiZWwgfHwgJ1RpbWVzdGFtcCcsXG4gICAgICAgICAgICAgIHNob3dBdmdMaW5lID0gdHJ1ZSxcbiAgICAgICAgICAgICAgc2hvd0RhdGFQb2ludHMgPSBmYWxzZSxcbiAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMgPSBmYWxzZSxcbiAgICAgICAgICAgICAgdXNlWmVyb01pblZhbHVlID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vIGNoYXJ0IHNwZWNpZmljIHZhcnNcblxuICAgICAgICAgICAgbGV0IGhlaWdodCxcbiAgICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LFxuICAgICAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCArIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICAgICAgdGlwLFxuICAgICAgICAgICAgICBicnVzaCxcbiAgICAgICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgICAgICBzdmcsXG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4sXG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXgsXG4gICAgICAgICAgICAgIHBlYWssXG4gICAgICAgICAgICAgIG1pbixcbiAgICAgICAgICAgICAgcHJvY2Vzc2VkTmV3RGF0YSxcbiAgICAgICAgICAgICAgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGE7XG5cbiAgICAgICAgICAgIGRhdGFQb2ludHMgPSBhdHRycy5kYXRhO1xuICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gYXR0cnMuZm9yZWNhc3REYXRhO1xuICAgICAgICAgICAgc2hvd0RhdGFQb2ludHMgPSBhdHRycy5zaG93RGF0YVBvaW50cztcbiAgICAgICAgICAgIHByZXZpb3VzUmFuZ2VEYXRhUG9pbnRzID0gYXR0cnMucHJldmlvdXNSYW5nZURhdGE7XG4gICAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IGF0dHJzLmFubm90YXRpb25EYXRhO1xuXG4gICAgICAgICAgICBsZXQgc3RhcnRJbnRlcnZhbFByb21pc2U7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGdldENoYXJ0V2lkdGgoKTpudW1iZXIge1xuICAgICAgICAgICAgICAvL3JldHVybiBhbmd1bGFyLmVsZW1lbnQoJyMnICsgY2hhcnRDb250ZXh0LmNoYXJ0SGFuZGxlKS53aWR0aCgpO1xuICAgICAgICAgICAgICByZXR1cm4gQ0hBUlRfV0lEVEg7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgZnVuY3Rpb24gcmVzaXplKCk6dm9pZCB7XG4gICAgICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgICAgICBpZiAoY2hhcnQpIHtcbiAgICAgICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjaGFydFBhcmVudCA9IGQzLnNlbGVjdChlbGVtZW50WzBdKTtcblxuICAgICAgICAgICAgICBjb25zb2xlLmRpcihlbGVtZW50WzBdKTtcblxuICAgICAgICAgICAgICBjb25zdCBwYXJlbnROb2RlID0gZWxlbWVudFswXS5wYXJlbnROb2RlO1xuXG4gICAgICAgICAgICAgIHdpZHRoID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50V2lkdGg7XG4gICAgICAgICAgICAgIGhlaWdodCA9ICg8YW55PnBhcmVudE5vZGUpLmNsaWVudEhlaWdodDtcblxuICAgICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSAtIFhfQVhJU19IRUlHSFQsXG5cbiAgICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnTWV0cmljIFdpZHRoOiAlaScsIHdpZHRoKTtcbiAgICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnTWV0cmljIEhlaWdodDogJWknLCBoZWlnaHQpO1xuXG4gICAgICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wO1xuXG4gICAgICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICAgIC8vY3JlYXRlU3ZnRGVmcyhjaGFydCk7XG5cbiAgICAgICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyAobWFyZ2luLnRvcCkgKyAnKScpO1xuXG4gICAgICAgICAgICAgIHRpcCA9IGQzLnRpcCgpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2QzLXRpcCcpXG4gICAgICAgICAgICAgICAgLm9mZnNldChbLTEwLCAwXSlcbiAgICAgICAgICAgICAgICAuaHRtbCgoZCwgaSkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGJ1aWxkSG92ZXIoZCwgaSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgc3ZnLmNhbGwodGlwKTtcblxuICAgICAgICAgICAgICAvLyBhIHBsYWNlaG9sZGVyIGZvciB0aGUgYWxlcnRzXG4gICAgICAgICAgICAgIHN2Zy5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdhbGVydEhvbGRlcicpO1xuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHNldHVwRmlsdGVyZWREYXRhKGRhdGFQb2ludHM6SUNoYXJ0RGF0YVBvaW50W10pOnZvaWQge1xuXG4gICAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgICAgcGVhayA9IGQzLm1heChkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpID8gKGQuYXZnIHx8IGQudmFsdWUpIDogMDtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgICAgICBtaW4gPSBkMy5taW4oZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKSA/IChkLmF2ZyB8fCBkLnZhbHVlKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLy8gbGV0cyBhZGp1c3QgdGhlIG1pbiBhbmQgbWF4IHRvIGFkZCBzb21lIHZpc3VhbCBzcGFjaW5nIGJldHdlZW4gaXQgYW5kIHRoZSBheGVzXG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluICogLjk1O1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuXG4gICAgICAgICAgICAgIC8vLyBjaGVjayBpZiB3ZSBuZWVkIHRvIGFkanVzdCBoaWdoL2xvdyBib3VuZCB0byBmaXQgYWxlcnQgdmFsdWVcbiAgICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gTWF0aC5tYXgodmlzdWFsbHlBZGp1c3RlZE1heCwgYWxlcnRWYWx1ZSAqIDEuMik7XG4gICAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbiA9IE1hdGgubWluKHZpc3VhbGx5QWRqdXN0ZWRNaW4sIGFsZXJ0VmFsdWUgKiAuOTUpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8vIHVzZSBkZWZhdWx0IFkgc2NhbGUgaW4gY2FzZSBoaWdoIGFuZCBsb3cgYm91bmQgYXJlIDAgKGllLCBubyB2YWx1ZXMgb3IgYWxsIDApXG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSAhISF2aXN1YWxseUFkanVzdGVkTWF4ICYmICEhIXZpc3VhbGx5QWRqdXN0ZWRNaW4gPyBERUZBVUxUX1lfU0NBTEUgOlxuICAgICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZVNjYWxlKGRhdGFQb2ludHM6SUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICAgICAgICAgICAgbGV0IHhUaWNrcywgbnVtYmVyT2ZCYXJzRm9yU21hbGxHcmFwaCA9IDIwO1xuXG4gICAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcblxuXG4gICAgICAgICAgICAgICAgLy8gIHdlIHVzZSB0aGUgd2lkdGggYWxyZWFkeSBkZWZpbmVkIGFib3ZlXG4gICAgICAgICAgICAgICAgeFRpY2tzID0gOTtcbiAgICAgICAgICAgICAgICBjaGFydERhdGEgPSBkYXRhUG9pbnRzO1xuXG4gICAgICAgICAgICAgICAgc2V0dXBGaWx0ZXJlZERhdGEoZGF0YVBvaW50cyk7XG5cbiAgICAgICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAgICAgLmNsYW1wKHRydWUpXG4gICAgICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgICAgIC5kb21haW4oW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sIHZpc3VhbGx5QWRqdXN0ZWRNYXhdKTtcblxuICAgICAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAgIC50aWNrcyg1KVxuICAgICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgICAgICBsZXQgdGltZVNjYWxlTWluID0gZDMubWluKGRhdGFQb2ludHMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZC50aW1lc3RhbXA7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgICAgbGV0IHRpbWVTY2FsZU1heDtcbiAgICAgICAgICAgICAgICBpZiAoZm9yZWNhc3REYXRhUG9pbnRzICYmIGZvcmVjYXN0RGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBmb3JlY2FzdERhdGFQb2ludHNbZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgdGltZVNjYWxlTWF4ID0gZDMubWF4KGRhdGFQb2ludHMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgICAgICAgLmRvbWFpbihbdGltZVNjYWxlTWluLCB0aW1lU2NhbGVNYXhdKTtcblxuICAgICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgICAgLnNjYWxlKHRpbWVTY2FsZSlcbiAgICAgICAgICAgICAgICAgIC50aWNrcyh4VGlja3MpXG4gICAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAgIC5vcmllbnQoJ2JvdHRvbScpO1xuXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gc2V0dXBGaWx0ZXJlZE11bHRpRGF0YShtdWx0aURhdGFQb2ludHM6SU11bHRpRGF0YVBvaW50W10pOmFueSB7XG4gICAgICAgICAgICAgIGxldCBhbGVydFBlYWs6bnVtYmVyLFxuICAgICAgICAgICAgICAgIGhpZ2hQZWFrOm51bWJlcjtcblxuICAgICAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKSB7XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRNYXg6bnVtYmVyLFxuICAgICAgICAgICAgICAgICAgY3VycmVudE1pbjpudW1iZXIsXG4gICAgICAgICAgICAgICAgICBzZXJpZXNNYXg6bnVtYmVyLFxuICAgICAgICAgICAgICAgICAgc2VyaWVzTWluOm51bWJlcixcbiAgICAgICAgICAgICAgICAgIG1heExpc3Q6bnVtYmVyW10gPSBbXSxcbiAgICAgICAgICAgICAgICAgIG1pbkxpc3Q6bnVtYmVyW10gPSBbXTtcblxuICAgICAgICAgICAgICAgIG11bHRpRGF0YVBvaW50cy5mb3JFYWNoKChzZXJpZXMpID0+IHtcbiAgICAgICAgICAgICAgICAgIGN1cnJlbnRNYXggPSBkMy5tYXgoc2VyaWVzLnZhbHVlcy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogZC5hdmc7XG4gICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICBtYXhMaXN0LnB1c2goY3VycmVudE1heCk7XG4gICAgICAgICAgICAgICAgICBjdXJyZW50TWluID0gZDMubWluKHNlcmllcy52YWx1ZXMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKSA/IGQuYXZnIDogTnVtYmVyLk1BWF9WQUxVRTtcbiAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICAgIG1pbkxpc3QucHVzaChjdXJyZW50TWluKTtcblxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHNlcmllc01heCA9IGQzLm1heChtYXhMaXN0KTtcbiAgICAgICAgICAgICAgICBzZXJpZXNNaW4gPSBkMy5taW4obWluTGlzdCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtzZXJpZXNNaW4sIHNlcmllc01heF07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBjb25zdCBtaW5NYXggPSBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKTtcbiAgICAgICAgICAgICAgcGVhayA9IG1pbk1heFsxXTtcbiAgICAgICAgICAgICAgbWluID0gbWluTWF4WzBdO1xuXG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluIC0gKG1pbiAqIDAuMDUpO1xuICAgICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIGFsZXJ0UGVhayA9IChhbGVydFZhbHVlICogMS4yKTtcbiAgICAgICAgICAgICAgICBoaWdoUGVhayA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcbiAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gYWxlcnRQZWFrID4gaGlnaFBlYWsgPyBhbGVydFBlYWsgOiBoaWdoUGVhaztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmV0dXJuIFt2aXN1YWxseUFkanVzdGVkTWluLCAhISF2aXN1YWxseUFkanVzdGVkTWF4ICYmICEhIXZpc3VhbGx5QWRqdXN0ZWRNaW4gPyBERUZBVUxUX1lfU0NBTEUgOlxuICAgICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXhdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVNdWx0aVNjYWxlKG11bHRpRGF0YVBvaW50czpJTXVsdGlEYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgICBjb25zdCB4VGlja3MgPSA5O1xuXG4gICAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMgJiYgbXVsdGlEYXRhUG9pbnRzWzBdICYmIG11bHRpRGF0YVBvaW50c1swXS52YWx1ZXMpIHtcblxuICAgICAgICAgICAgICAgIGxldCBsb3dIaWdoID0gc2V0dXBGaWx0ZXJlZE11bHRpRGF0YShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSBsb3dIaWdoWzBdO1xuICAgICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBsb3dIaWdoWzFdO1xuXG4gICAgICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAgICAgLnJhbmdlUm91bmQoW2hlaWdodCwgMF0pXG4gICAgICAgICAgICAgICAgICAuZG9tYWluKFt2aXN1YWxseUFkanVzdGVkTWluLCB2aXN1YWxseUFkanVzdGVkTWF4XSk7XG5cbiAgICAgICAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgICAgICAudGlja3MoNSlcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoXSlcbiAgICAgICAgICAgICAgICAgIC5kb21haW4oW2QzLm1pbihtdWx0aURhdGFQb2ludHMsIChkKSA9PiBkMy5taW4oZC52YWx1ZXMsIChwKSA9PiBwLnRpbWVzdGFtcCkpLFxuICAgICAgICAgICAgICAgICAgICBkMy5tYXgobXVsdGlEYXRhUG9pbnRzLCAoZCkgPT4gZDMubWF4KGQudmFsdWVzLCAocCkgPT4gcC50aW1lc3RhbXApKV0pO1xuXG4gICAgICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIExvYWQgbWV0cmljcyBkYXRhIGRpcmVjdGx5IGZyb20gYSBydW5uaW5nIEhhd2t1bGFyLU1ldHJpY3Mgc2VydmVyXG4gICAgICAgICAgICAgKiBAcGFyYW0gdXJsXG4gICAgICAgICAgICAgKiBAcGFyYW0gbWV0cmljSWRcbiAgICAgICAgICAgICAqIEBwYXJhbSBzdGFydFRpbWVzdGFtcFxuICAgICAgICAgICAgICogQHBhcmFtIGVuZFRpbWVzdGFtcFxuICAgICAgICAgICAgICogQHBhcmFtIGJ1Y2tldHNcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgZnVuY3Rpb24gbG9hZFN0YW5kQWxvbmVNZXRyaWNzRm9yVGltZVJhbmdlKHVybDpVcmxUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY0lkOk1ldHJpY0lkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOlRpbWVJbk1pbGxpcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRUaW1lc3RhbXA6VGltZUluTWlsbGlzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1Y2tldHMgPSA2MCkge1xuXG4gICAgICAgICAgICAgIGxldCByZXF1ZXN0Q29uZmlnOm5nLklSZXF1ZXN0Q29uZmlnID0gPGFueT57XG4gICAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICAgJ0hhd2t1bGFyLVRlbmFudCc6IG1ldHJpY1RlbmFudElkXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgIGVuZDogZW5kVGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgYnVja2V0czogYnVja2V0c1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBpZiAoc3RhcnRUaW1lc3RhbXAgPj0gZW5kVGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgICAgJGxvZy5sb2coJ1N0YXJ0IGRhdGUgd2FzIGFmdGVyIGVuZCBkYXRlJyk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAodXJsICYmIG1ldHJpY1R5cGUgJiYgbWV0cmljSWQpIHtcblxuICAgICAgICAgICAgICAgIGxldCBtZXRyaWNUeXBlQW5kRGF0YSA9IG1ldHJpY1R5cGUuc3BsaXQoJy0nKTtcbiAgICAgICAgICAgICAgICAvLy8gc2FtcGxlIHVybDpcbiAgICAgICAgICAgICAgICAvLy8gaHR0cDovL2xvY2FsaG9zdDo4MDgwL2hhd2t1bGFyL21ldHJpY3MvZ2F1Z2VzLzQ1YjIyNTZlZmYxOWNiOTgyNTQyYjE2N2IzOTU3MDM2LnN0YXR1cy5kdXJhdGlvbi9kYXRhP1xuICAgICAgICAgICAgICAgIC8vIGJ1Y2tldHM9MTIwJmVuZD0xNDM2ODMxNzk3NTMzJnN0YXJ0PTE0MzY4MjgxOTc1MzMnXG4gICAgICAgICAgICAgICAgJGh0dHAuZ2V0KHVybCArICcvJyArIG1ldHJpY1R5cGVBbmREYXRhWzBdICsgJ3MvJyArIG1ldHJpY0lkICsgJy8nICsgKG1ldHJpY1R5cGVBbmREYXRhWzFdIHx8ICdkYXRhJyksXG4gICAgICAgICAgICAgICAgICByZXF1ZXN0Q29uZmlnKS5zdWNjZXNzKChyZXNwb25zZSkgPT4ge1xuXG4gICAgICAgICAgICAgICAgICBwcm9jZXNzZWROZXdEYXRhID0gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChyZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuXG4gICAgICAgICAgICAgICAgfSkuZXJyb3IoKHJlYXNvbiwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAkbG9nLmVycm9yKCdFcnJvciBMb2FkaW5nIENoYXJ0IERhdGE6JyArIHN0YXR1cyArICcsICcgKyByZWFzb24pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBUcmFuc2Zvcm0gdGhlIHJhdyBodHRwIHJlc3BvbnNlIGZyb20gTWV0cmljcyB0byBvbmUgdXNhYmxlIGluIGNoYXJ0c1xuICAgICAgICAgICAgICogQHBhcmFtIHJlc3BvbnNlXG4gICAgICAgICAgICAgKiBAcmV0dXJucyB0cmFuc2Zvcm1lZCByZXNwb25zZSB0byBJQ2hhcnREYXRhUG9pbnRbXSwgcmVhZHkgdG8gYmUgY2hhcnRlZFxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBmdW5jdGlvbiBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTpJQ2hhcnREYXRhUG9pbnRbXSB7XG4gICAgICAgICAgICAgIC8vICBUaGUgc2NoZW1hIGlzIGRpZmZlcmVudCBmb3IgYnVja2V0ZWQgb3V0cHV0XG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5tYXAoKHBvaW50OklDaGFydERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgICAgbGV0IHRpbWVzdGFtcDpUaW1lSW5NaWxsaXMgPSBwb2ludC50aW1lc3RhbXAgfHwgKHBvaW50LnN0YXJ0ICsgKHBvaW50LmVuZCAtIHBvaW50LnN0YXJ0KSAvIDIpO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiB0aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIGRhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiAhYW5ndWxhci5pc051bWJlcihwb2ludC52YWx1ZSkgPyB1bmRlZmluZWQgOiBwb2ludC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgYXZnOiAocG9pbnQuZW1wdHkpID8gdW5kZWZpbmVkIDogcG9pbnQuYXZnLFxuICAgICAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgICAgIG1heDogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWF4KSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1heCxcbiAgICAgICAgICAgICAgICAgICAgZW1wdHk6IHBvaW50LmVtcHR5XG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGJ1aWxkSG92ZXIoZDpJQ2hhcnREYXRhUG9pbnQsIGk6bnVtYmVyKSB7XG4gICAgICAgICAgICAgIGxldCBob3ZlcixcbiAgICAgICAgICAgICAgICBwcmV2VGltZXN0YW1wLFxuICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lc3RhbXAgPSBkLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBiYXJEdXJhdGlvbixcbiAgICAgICAgICAgICAgICBmb3JtYXR0ZWREYXRlVGltZSA9IG1vbWVudChkLnRpbWVzdGFtcCkuZm9ybWF0KEhPVkVSX0RBVEVfVElNRV9GT1JNQVQpO1xuXG4gICAgICAgICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgICAgICAgIHByZXZUaW1lc3RhbXAgPSBjaGFydERhdGFbaSAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICBiYXJEdXJhdGlvbiA9IG1vbWVudChjdXJyZW50VGltZXN0YW1wKS5mcm9tKG1vbWVudChwcmV2VGltZXN0YW1wKSwgdHJ1ZSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAoaXNFbXB0eURhdGFQb2ludChkKSkge1xuICAgICAgICAgICAgICAgIC8vIG5vZGF0YVxuICAgICAgICAgICAgICAgIGhvdmVyID0gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgICAgIDxzbWFsbCBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke25vRGF0YUxhYmVsfTwvc21hbGw+XG4gICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTwvc3Bhbj48c3Bhbj46XG4gICAgICAgICAgICAgICAgPC9zcGFuPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7YmFyRHVyYXRpb259PC9zcGFuPjwvc21hbGw+IDwvZGl2PlxuICAgICAgICAgICAgICAgIDxoci8+XG4gICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHt0aW1lc3RhbXBMYWJlbH08L3NwYW4+PHNwYW4+OlxuICAgICAgICAgICAgICAgIDwvc3Bhbj48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzUmF3TWV0cmljKGQpKSB7XG4gICAgICAgICAgICAgICAgICAvLyByYXcgc2luZ2xlIHZhbHVlIGZyb20gcmF3IHRhYmxlXG4gICAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7YmFyRHVyYXRpb259PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgICA8aHIvPlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtzaW5nbGVWYWx1ZUxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZDMucm91bmQoZC52YWx1ZSwgMil9PC9zcGFuPjwvc21hbGw+IDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPC9kaXY+IGA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIC8vIGFnZ3JlZ2F0ZSB3aXRoIG1pbi9hdmcvbWF4XG4gICAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtmb3JtYXR0ZWREYXRlVGltZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gYmVmb3JlLXNlcGFyYXRvcic+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21heExhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1heCwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2F2Z0xhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLmF2ZywgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21pbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1pbiwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PiBgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gaG92ZXI7XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gY3JlYXRlTXVsdGlMaW5lQ2hhcnQobXVsdGlEYXRhUG9pbnRzOklNdWx0aURhdGFQb2ludFtdKSB7XG4gICAgICAgICAgICAgIGxldCBjb2xvclNjYWxlID0gZDMuc2NhbGUuY2F0ZWdvcnkxMCgpLFxuICAgICAgICAgICAgICAgIGcgPSAwO1xuXG4gICAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgICAvLyBiZWZvcmUgdXBkYXRpbmcsIGxldCdzIHJlbW92ZSB0aG9zZSBtaXNzaW5nIGZyb20gZGF0YXBvaW50cyAoaWYgYW55KVxuICAgICAgICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ3BhdGhbaWRePVxcJ211bHRpTGluZVxcJ10nKVswXS5mb3JFYWNoKChleGlzdGluZ1BhdGg6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICBsZXQgc3RpbGxFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIG11bHRpRGF0YVBvaW50cy5mb3JFYWNoKChzaW5nbGVDaGFydERhdGE6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoID0gc2luZ2xlQ2hhcnREYXRhLmtleUhhc2hcbiAgICAgICAgICAgICAgICAgICAgICB8fCAoJ211bHRpTGluZScgKyBoYXNoU3RyaW5nKHNpbmdsZUNoYXJ0RGF0YS5rZXkpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nUGF0aC5nZXRBdHRyaWJ1dGUoJ2lkJykgPT09IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgc3RpbGxFeGlzdHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgIGlmICghc3RpbGxFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQYXRoLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTphbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmIChzaW5nbGVDaGFydERhdGEgJiYgc2luZ2xlQ2hhcnREYXRhLnZhbHVlcykge1xuICAgICAgICAgICAgICAgICAgICBzaW5nbGVDaGFydERhdGEua2V5SGFzaCA9IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoXG4gICAgICAgICAgICAgICAgICAgICAgfHwgKCdtdWx0aUxpbmUnICsgaGFzaFN0cmluZyhzaW5nbGVDaGFydERhdGEua2V5KSk7XG4gICAgICAgICAgICAgICAgICAgIGxldCBwYXRoTXVsdGlMaW5lID0gc3ZnLnNlbGVjdEFsbCgncGF0aCMnICsgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2gpXG4gICAgICAgICAgICAgICAgICAgICAgLmRhdGEoW3NpbmdsZUNoYXJ0RGF0YS52YWx1ZXNdKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuYXR0cignaWQnLCBzaW5nbGVDaGFydERhdGEua2V5SGFzaClcbiAgICAgICAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbXVsdGlMaW5lJylcbiAgICAgICAgICAgICAgICAgICAgICAuYXR0cignZmlsbCcsICdub25lJylcbiAgICAgICAgICAgICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNpbmdsZUNoYXJ0RGF0YS5jb2xvciB8fCBjb2xvclNjYWxlKGcrKyk7XG4gICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVMaW5lKCdsaW5lYXInKSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICAgICAgICBwYXRoTXVsdGlMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgICAgICAgICAgICAuYXR0cignaWQnLCBzaW5nbGVDaGFydERhdGEua2V5SGFzaClcbiAgICAgICAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbXVsdGlMaW5lJylcbiAgICAgICAgICAgICAgICAgICAgICAuYXR0cignZmlsbCcsICdub25lJylcbiAgICAgICAgICAgICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNpbmdsZUNoYXJ0RGF0YS5jb2xvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2luZ2xlQ2hhcnREYXRhLmNvbG9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbG9yU2NhbGUoZysrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUxpbmUoJ2xpbmVhcicpKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRsb2cud2FybignTm8gbXVsdGktZGF0YSBzZXQgZm9yIG11bHRpbGluZSBjaGFydCcpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gY3JlYXRlWUF4aXNHcmlkTGluZXMoKSB7XG4gICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgeSBheGlzIGdyaWQgbGluZXNcbiAgICAgICAgICAgICAgaWYgKHlTY2FsZSkge1xuICAgICAgICAgICAgICAgIGxldCB5QXhpcyA9IHN2Zy5zZWxlY3RBbGwoJ2cuZ3JpZC55X2dyaWQnKTtcbiAgICAgICAgICAgICAgICBpZiAoIXlBeGlzWzBdLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgeUF4aXMgPSBzdmcuYXBwZW5kKCdnJykuY2xhc3NlZCgnZ3JpZCB5X2dyaWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgeUF4aXNcbiAgICAgICAgICAgICAgICAgIC5jYWxsKGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpXG4gICAgICAgICAgICAgICAgICAgIC50aWNrcygxMClcbiAgICAgICAgICAgICAgICAgICAgLnRpY2tTaXplKC13aWR0aCwgMClcbiAgICAgICAgICAgICAgICAgICAgLnRpY2tGb3JtYXQoJycpXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgICAgICBmdW5jdGlvbiBheGlzVHJhbnNpdGlvbihzZWxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAgIC5kZWxheSgyNTApXG4gICAgICAgICAgICAgICAgICAuZHVyYXRpb24oNzUwKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAxLjApO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKHlBeGlzKSB7XG5cbiAgICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgICAgICAgIC8qIHRzbGludDpkaXNhYmxlOm5vLXVudXNlZC12YXJpYWJsZSAqL1xuXG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIHgtYXhpc1xuICAgICAgICAgICAgICAgIGxldCB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneCBheGlzJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKDAsJyArIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCArICcpJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgICAgLmNhbGwoeEF4aXMpXG4gICAgICAgICAgICAgICAgICAuY2FsbChheGlzVHJhbnNpdGlvbik7XG5cbiAgICAgICAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgICAgICAgbGV0IHlBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd5IGF4aXMnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgICAuY2FsbCh5QXhpcylcbiAgICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcblxuICAgICAgICAgICAgICAgIGxldCB5QXhpc0xhYmVsID0gc3ZnLnNlbGVjdEFsbCgnLnlBeGlzVW5pdHNMYWJlbCcpO1xuICAgICAgICAgICAgICAgIGlmIChtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgPj0gMTUwICYmIGF0dHJzLnlBeGlzVW5pdHMpIHtcbiAgICAgICAgICAgICAgICAgIHlBeGlzTGFiZWwgPSBzdmcuYXBwZW5kKCd0ZXh0JykuYXR0cignY2xhc3MnLCAneUF4aXNVbml0c0xhYmVsJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICdyb3RhdGUoLTkwKSx0cmFuc2xhdGUoLTIwLC01MCknKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cigneCcsIC1tb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgLyAyKVxuICAgICAgICAgICAgICAgICAgICAuc3R5bGUoJ3RleHQtYW5jaG9yJywgJ2NlbnRlcicpXG4gICAgICAgICAgICAgICAgICAgIC50ZXh0KGF0dHJzLnlBeGlzVW5pdHMgPT09ICdOT05FJyA/ICcnIDogYXR0cnMueUF4aXNVbml0cylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVDZW50ZXJlZExpbmUobmV3SW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgICBsZXQgaW50ZXJwb2xhdGUgPSBuZXdJbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICAgICAgbGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAgICAgICAgIC5kZWZpbmVkKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAueCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAueSgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUxpbmUobmV3SW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgICBsZXQgaW50ZXJwb2xhdGUgPSBuZXdJbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICAgICAgbGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAgICAgICAgIC5kZWZpbmVkKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAueCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAueSgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUF2Z0xpbmVzKCkge1xuICAgICAgICAgICAgICBpZiAoY2hhcnRUeXBlID09PSAnYmFyJyB8fCBjaGFydFR5cGUgPT09ICdzY2F0dGVybGluZScpIHtcbiAgICAgICAgICAgICAgICBsZXQgcGF0aEF2Z0xpbmUgPSBzdmcuc2VsZWN0QWxsKCcuYmFyQXZnTGluZScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmF0dHIoJ2NsYXNzJywgJ2JhckF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVDZW50ZXJlZExpbmUoJ21vbm90b25lJykpO1xuICAgICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdiYXJBdmdMaW5lJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlQ2VudGVyZWRMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgICAgICBwYXRoQXZnTGluZS5leGl0KCkucmVtb3ZlKCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gY3JlYXRlWEF4aXNCcnVzaCgpIHtcblxuICAgICAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLnNlbGVjdEFsbCgnZy5icnVzaCcpO1xuICAgICAgICAgICAgICBpZiAoYnJ1c2hHcm91cC5lbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgYnJ1c2hHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdicnVzaCcpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJ1c2ggPSBkMy5zdmcuYnJ1c2goKVxuICAgICAgICAgICAgICAgIC54KHRpbWVTY2FsZSlcbiAgICAgICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgICAgIC5vbignYnJ1c2hlbmQnLCBicnVzaEVuZCk7XG5cbiAgICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoKTtcblxuICAgICAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgICAgICBmdW5jdGlvbiBicnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCB0cnVlKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIGJydXNoRW5kKCkge1xuICAgICAgICAgICAgICAgIGxldCBleHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgICAgIHN0YXJ0VGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMV0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgIWQzLmV2ZW50LnRhcmdldC5lbXB0eSgpKTtcbiAgICAgICAgICAgICAgICAvLyBpZ25vcmUgcmFuZ2Ugc2VsZWN0aW9ucyBsZXNzIHRoYW4gMSBtaW51dGVcbiAgICAgICAgICAgICAgICBpZiAoZHJhZ1NlbGVjdGlvbkRlbHRhID49IDYwMDAwKSB7XG4gICAgICAgICAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHMgPSBbXTtcbiAgICAgICAgICAgICAgICAgIHNob3dGb3JlY2FzdERhdGEoZm9yZWNhc3REYXRhUG9pbnRzKTtcbiAgICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChFdmVudE5hbWVzLkNIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGV4dGVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIGNsZWFyIHRoZSBicnVzaCBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2guY2xlYXIoKSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVQcmV2aW91c1JhbmdlT3ZlcmxheShwcmV2UmFuZ2VEYXRhKSB7XG4gICAgICAgICAgICAgIGlmIChwcmV2UmFuZ2VEYXRhKSB7XG4gICAgICAgICAgICAgICAgc3ZnLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgICAuZGF0dW0ocHJldlJhbmdlRGF0YSlcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdwcmV2UmFuZ2VBdmdMaW5lJylcbiAgICAgICAgICAgICAgICAgIC5zdHlsZSgnc3Ryb2tlLWRhc2hhcnJheScsICgnOSwzJykpXG4gICAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUNlbnRlcmVkTGluZSgnbGluZWFyJykpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gYW5ub3RhdGVDaGFydChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBpZiAoYW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCcuYW5ub3RhdGlvbkRvdCcpXG4gICAgICAgICAgICAgICAgICAuZGF0YShhbm5vdGF0aW9uRGF0YSlcbiAgICAgICAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhbm5vdGF0aW9uRG90JylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdyJywgNSlcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdjeScsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhlaWdodCAtIHlTY2FsZSh2aXN1YWxseUFkanVzdGVkTWF4KTtcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZC5zZXZlcml0eSA9PT0gJzEnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGQuc2V2ZXJpdHkgPT09ICcyJykge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAneWVsbG93JztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ3doaXRlJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gY3JlYXRlRm9yZWNhc3RMaW5lKG5ld0ludGVycG9sYXRpb24pIHtcbiAgICAgICAgICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGUpXG4gICAgICAgICAgICAgICAgICAueCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAueSgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHNob3dGb3JlY2FzdERhdGEoZm9yZWNhc3REYXRhOklTaW1wbGVNZXRyaWNbXSkge1xuICAgICAgICAgICAgICBsZXQgZm9yZWNhc3RQYXRoTGluZSA9IHN2Zy5zZWxlY3RBbGwoJy5mb3JlY2FzdExpbmUnKS5kYXRhKFtmb3JlY2FzdERhdGFdKTtcbiAgICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgIGZvcmVjYXN0UGF0aExpbmUuYXR0cignY2xhc3MnLCAnZm9yZWNhc3RMaW5lJylcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUZvcmVjYXN0TGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICBmb3JlY2FzdFBhdGhMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZm9yZWNhc3RMaW5lJylcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUZvcmVjYXN0TGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgICAgICBmb3JlY2FzdFBhdGhMaW5lLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEsIG9sZERhdGEpID0+IHtcbiAgICAgICAgICAgICAgaWYgKG5ld0RhdGEgfHwgb2xkRGF0YSkge1xuICAgICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEgfHwgW10pO1xuICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzY29wZS4kd2F0Y2goJ211bHRpRGF0YScsIChuZXdNdWx0aURhdGEsIG9sZE11bHRpRGF0YSkgPT4ge1xuICAgICAgICAgICAgICBpZiAobmV3TXVsdGlEYXRhIHx8IG9sZE11bHRpRGF0YSkge1xuICAgICAgICAgICAgICAgIG11bHRpRGF0YVBvaW50cyA9IGFuZ3VsYXIuZnJvbUpzb24obmV3TXVsdGlEYXRhIHx8IFtdKTtcbiAgICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCdwcmV2aW91c1JhbmdlRGF0YScsIChuZXdQcmV2aW91c1JhbmdlVmFsdWVzKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChuZXdQcmV2aW91c1JhbmdlVmFsdWVzKSB7XG4gICAgICAgICAgICAgICAgLy8kbG9nLmRlYnVnKCdQcmV2aW91cyBSYW5nZSBkYXRhIGNoYW5nZWQnKTtcbiAgICAgICAgICAgICAgICBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24obmV3UHJldmlvdXNSYW5nZVZhbHVlcyk7XG4gICAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEsIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICAgIHNjb3BlLiR3YXRjaCgnYW5ub3RhdGlvbkRhdGEnLCAobmV3QW5ub3RhdGlvbkRhdGEpID0+IHtcbiAgICAgICAgICAgICAgaWYgKG5ld0Fubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgICAgYW5ub3RhdGlvbkRhdGEgPSBhbmd1bGFyLmZyb21Kc29uKG5ld0Fubm90YXRpb25EYXRhKTtcbiAgICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCdmb3JlY2FzdERhdGEnLCAobmV3Rm9yZWNhc3REYXRhKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChuZXdGb3JlY2FzdERhdGEpIHtcbiAgICAgICAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHMgPSBhbmd1bGFyLmZyb21Kc29uKG5ld0ZvcmVjYXN0RGF0YSk7XG4gICAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEsIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICAgIHNjb3BlLiR3YXRjaEdyb3VwKFsnYWxlcnRWYWx1ZScsICdjaGFydFR5cGUnLCAnaGlkZUhpZ2hMb3dWYWx1ZXMnLCAndXNlWmVyb01pblZhbHVlJywgJ3Nob3dBdmdMaW5lJ10sXG4gICAgICAgICAgICAgIChjaGFydEF0dHJzKSA9PiB7XG4gICAgICAgICAgICAgICAgYWxlcnRWYWx1ZSA9IGNoYXJ0QXR0cnNbMF0gfHwgYWxlcnRWYWx1ZTtcbiAgICAgICAgICAgICAgICBjaGFydFR5cGUgPSBjaGFydEF0dHJzWzFdIHx8IGNoYXJ0VHlwZTtcbiAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyA9ICh0eXBlb2YgY2hhcnRBdHRyc1syXSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1syXSA6IGhpZGVIaWdoTG93VmFsdWVzO1xuICAgICAgICAgICAgICAgIHVzZVplcm9NaW5WYWx1ZSA9ICh0eXBlb2YgY2hhcnRBdHRyc1szXSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1szXSA6IHVzZVplcm9NaW5WYWx1ZTtcbiAgICAgICAgICAgICAgICBzaG93QXZnTGluZSA9ICh0eXBlb2YgY2hhcnRBdHRyc1s0XSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1s0XSA6IHNob3dBdmdMaW5lO1xuICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG4gICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93KCkge1xuICAgICAgICAgICAgICBlbmRUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICBzdGFydFRpbWVzdGFtcCA9IG1vbWVudCgpLnN1YnRyYWN0KHRpbWVSYW5nZUluU2Vjb25kcywgJ3NlY29uZHMnKS52YWx1ZU9mKCk7XG4gICAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc0ZvclRpbWVSYW5nZShkYXRhVXJsLCBtZXRyaWNJZCwgc3RhcnRUaW1lc3RhbXAsIGVuZFRpbWVzdGFtcCwgNjApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLy8gc3RhbmRhbG9uZSBjaGFydHMgYXR0cmlidXRlc1xuICAgICAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydtZXRyaWNVcmwnLCAnbWV0cmljSWQnLCAnbWV0cmljVHlwZScsICdtZXRyaWNUZW5hbnRJZCcsICd0aW1lUmFuZ2VJblNlY29uZHMnXSxcbiAgICAgICAgICAgICAgKHN0YW5kQWxvbmVQYXJhbXMpID0+IHtcbiAgICAgICAgICAgICAgICBkYXRhVXJsID0gc3RhbmRBbG9uZVBhcmFtc1swXSB8fCBkYXRhVXJsO1xuICAgICAgICAgICAgICAgIG1ldHJpY0lkID0gc3RhbmRBbG9uZVBhcmFtc1sxXSB8fCBtZXRyaWNJZDtcbiAgICAgICAgICAgICAgICBtZXRyaWNUeXBlID0gc3RhbmRBbG9uZVBhcmFtc1syXSB8fCBtZXRyaWNJZDtcbiAgICAgICAgICAgICAgICBtZXRyaWNUZW5hbnRJZCA9IHN0YW5kQWxvbmVQYXJhbXNbM10gfHwgbWV0cmljVGVuYW50SWQ7XG4gICAgICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzID0gc3RhbmRBbG9uZVBhcmFtc1s0XSB8fCB0aW1lUmFuZ2VJblNlY29uZHM7XG4gICAgICAgICAgICAgICAgbG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdygpO1xuICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCdyZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMnLCAobmV3UmVmcmVzaEludGVydmFsKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChuZXdSZWZyZXNoSW50ZXJ2YWwpIHtcbiAgICAgICAgICAgICAgICByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgPSArbmV3UmVmcmVzaEludGVydmFsO1xuICAgICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc3RhcnRJbnRlcnZhbFByb21pc2UpO1xuICAgICAgICAgICAgICAgIHN0YXJ0SW50ZXJ2YWxQcm9taXNlID0gJGludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc1RpbWVSYW5nZUZyb21Ob3coKTtcbiAgICAgICAgICAgICAgICB9LCByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgKiAxMDAwKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHNjb3BlLiRvbignJGRlc3Ryb3knLCAoKSA9PiB7XG4gICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc3RhcnRJbnRlcnZhbFByb21pc2UpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHNjb3BlLiRvbignRGF0ZVJhbmdlRHJhZ0NoYW5nZWQnLCAoZXZlbnQsIGV4dGVudCkgPT4ge1xuICAgICAgICAgICAgICBzY29wZS4kZW1pdCgnR3JhcGhUaW1lUmFuZ2VDaGFuZ2VkRXZlbnQnLCBleHRlbnQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZUNoYXJ0VHlwZShjaGFydFR5cGU6c3RyaW5nKSB7XG5cbiAgICAgICAgICAgICAgc3dpdGNoIChjaGFydFR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdyaHFiYXInOlxuICAgICAgICAgICAgICAgICAgY3JlYXRlSGlzdG9ncmFtQ2hhcnQoc3ZnLFxuICAgICAgICAgICAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICAgICAgICB0aXAsXG4gICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnaGlzdG9ncmFtJzpcbiAgICAgICAgICAgICAgICAgIGNyZWF0ZUhpc3RvZ3JhbUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgdGlwLFxuICAgICAgICAgICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdsaW5lJzpcbiAgICAgICAgICAgICAgICAgIGNyZWF0ZUxpbmVDaGFydChzdmcsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICBjaGFydERhdGEsXG4gICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbik7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdoYXdrdWxhcm1ldHJpYyc6XG4gICAgICAgICAgICAgICAgICAkbG9nLmluZm8oJ0RFUFJFQ0FUSU9OIFdBUk5JTkc6IFRoZSBjaGFydCB0eXBlIGhhd2t1bGFybWV0cmljIGhhcyBiZWVuIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUnICtcbiAgICAgICAgICAgICAgICAgICAgJyByZW1vdmVkIGluIGEgZnV0dXJlJyArXG4gICAgICAgICAgICAgICAgICAgICcgcmVsZWFzZS4gUGxlYXNlIHVzZSB0aGUgbGluZSBjaGFydCB0eXBlIGluIGl0cyBwbGFjZScpO1xuICAgICAgICAgICAgICAgICAgY3JlYXRlTGluZUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ211bHRpbGluZSc6XG4gICAgICAgICAgICAgICAgICBjcmVhdGVNdWx0aUxpbmVDaGFydChtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYXJlYSc6XG4gICAgICAgICAgICAgICAgICBjcmVhdGVBcmVhQ2hhcnQoc3ZnLFxuICAgICAgICAgICAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgIGludGVycG9sYXRpb24sXG4gICAgICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NjYXR0ZXInOlxuICAgICAgICAgICAgICAgICAgY3JlYXRlU2NhdHRlckNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uLFxuICAgICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdzY2F0dGVybGluZSc6XG4gICAgICAgICAgICAgICAgICBjcmVhdGVTY2F0dGVyTGluZUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uLFxuICAgICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgJGxvZy53YXJuKCdjaGFydC10eXBlIGlzIG5vdCB2YWxpZC4gTXVzdCBiZSBpbicgK1xuICAgICAgICAgICAgICAgICAgICAnIFtyaHFiYXIsbGluZSxhcmVhLG11bHRpbGluZSxzY2F0dGVyLHNjYXR0ZXJsaW5lLGhpc3RvZ3JhbV0gY2hhcnQgdHlwZTogJyArIGNoYXJ0VHlwZSk7XG5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50cywgcHJldmlvdXNSYW5nZURhdGFQb2ludHMpID0+IHtcbiAgICAgICAgICAgICAgLy8gaWYgd2UgZG9uJ3QgaGF2ZSBkYXRhLCBkb24ndCBib3RoZXIuLlxuICAgICAgICAgICAgICBpZiAoIWRhdGFQb2ludHMgJiYgIW11bHRpRGF0YVBvaW50cykge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXAoJ1JlbmRlciBDaGFydCcpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUudGltZSgnY2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgICAgcmVzaXplKCk7XG5cbiAgICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgICBkZXRlcm1pbmVTY2FsZShkYXRhUG9pbnRzKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgICBkZXRlcm1pbmVNdWx0aVNjYWxlKG11bHRpRGF0YVBvaW50cyk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+IHZpc3VhbGx5QWRqdXN0ZWRNaW4gJiYgYWxlcnRWYWx1ZSA8IHZpc3VhbGx5QWRqdXN0ZWRNYXgpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWxlcnRCb3VuZHM6QWxlcnRCb3VuZFtdID0gZXh0cmFjdEFsZXJ0UmFuZ2VzKGNoYXJ0RGF0YSwgYWxlcnRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgY3JlYXRlQWxlcnRCb3VuZHNBcmVhKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgdmlzdWFsbHlBZGp1c3RlZE1heCwgYWxlcnRCb3VuZHMpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNyZWF0ZVhBeGlzQnJ1c2goKTtcblxuICAgICAgICAgICAgICBjcmVhdGVZQXhpc0dyaWRMaW5lcygpO1xuICAgICAgICAgICAgICBkZXRlcm1pbmVDaGFydFR5cGUoY2hhcnRUeXBlKTtcbiAgICAgICAgICAgICAgaWYgKHNob3dEYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgICAgY3JlYXRlRGF0YVBvaW50cyhzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCB0aXAsIGNoYXJ0RGF0YSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY3JlYXRlUHJldmlvdXNSYW5nZU92ZXJsYXkocHJldmlvdXNSYW5nZURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICBjcmVhdGVYYW5kWUF4ZXMoKTtcbiAgICAgICAgICAgICAgaWYgKHNob3dBdmdMaW5lKSB7XG4gICAgICAgICAgICAgICAgY3JlYXRlQXZnTGluZXMoKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChhbGVydFZhbHVlICYmIChhbGVydFZhbHVlID4gdmlzdWFsbHlBZGp1c3RlZE1pbiAmJiBhbGVydFZhbHVlIDwgdmlzdWFsbHlBZGp1c3RlZE1heCkpIHtcbiAgICAgICAgICAgICAgICAvLy8gTk9URTogdGhpcyBhbGVydCBsaW5lIGhhcyBoaWdoZXIgcHJlY2VkZW5jZSBmcm9tIGFsZXJ0IGFyZWEgYWJvdmVcbiAgICAgICAgICAgICAgICBjcmVhdGVBbGVydExpbmUoc3ZnLCB0aW1lU2NhbGUsIHlTY2FsZSwgY2hhcnREYXRhLCBhbGVydFZhbHVlLCAnYWxlcnRMaW5lJyk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAoYW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgICAgICBhbm5vdGF0ZUNoYXJ0KGFubm90YXRpb25EYXRhKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoZm9yZWNhc3REYXRhUG9pbnRzICYmIGZvcmVjYXN0RGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgc2hvd0ZvcmVjYXN0RGF0YShmb3JlY2FzdERhdGFQb2ludHMpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUudGltZUVuZCgnY2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCdSZW5kZXIgQ2hhcnQnKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbGluazogbGluayxcbiAgICAgICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgICAgICByZXBsYWNlOiB0cnVlLFxuICAgICAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgICAgZGF0YTogJz0nLFxuICAgICAgICAgICAgICBtdWx0aURhdGE6ICc9JyxcbiAgICAgICAgICAgICAgZm9yZWNhc3REYXRhOiAnPScsXG4gICAgICAgICAgICAgIG1ldHJpY1VybDogJ0AnLFxuICAgICAgICAgICAgICBtZXRyaWNJZDogJ0AnLFxuICAgICAgICAgICAgICBtZXRyaWNUeXBlOiAnQCcsXG4gICAgICAgICAgICAgIG1ldHJpY1RlbmFudElkOiAnQCcsXG4gICAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wOiAnQCcsXG4gICAgICAgICAgICAgIGVuZFRpbWVzdGFtcDogJ0AnLFxuICAgICAgICAgICAgICB0aW1lUmFuZ2VJblNlY29uZHM6ICdAJyxcbiAgICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzOiAnQCcsXG4gICAgICAgICAgICAgIHByZXZpb3VzUmFuZ2VEYXRhOiAnQCcsXG4gICAgICAgICAgICAgIGFubm90YXRpb25EYXRhOiAnQCcsXG4gICAgICAgICAgICAgIHNob3dEYXRhUG9pbnRzOiAnPScsXG4gICAgICAgICAgICAgIGFsZXJ0VmFsdWU6ICdAJyxcbiAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbjogJ0AnLFxuICAgICAgICAgICAgICBjaGFydFR5cGU6ICdAJyxcbiAgICAgICAgICAgICAgeUF4aXNVbml0czogJ0AnLFxuICAgICAgICAgICAgICB1c2VaZXJvTWluVmFsdWU6ICc9JyxcbiAgICAgICAgICAgICAgY2hhcnRIb3ZlckRhdGVGb3JtYXQ6ICdAJyxcbiAgICAgICAgICAgICAgY2hhcnRIb3ZlclRpbWVGb3JtYXQ6ICdAJyxcbiAgICAgICAgICAgICAgc2luZ2xlVmFsdWVMYWJlbDogJ0AnLFxuICAgICAgICAgICAgICBub0RhdGFMYWJlbDogJ0AnLFxuICAgICAgICAgICAgICBkdXJhdGlvbkxhYmVsOiAnQCcsXG4gICAgICAgICAgICAgIG1pbkxhYmVsOiAnQCcsXG4gICAgICAgICAgICAgIG1heExhYmVsOiAnQCcsXG4gICAgICAgICAgICAgIGF2Z0xhYmVsOiAnQCcsXG4gICAgICAgICAgICAgIHRpbWVzdGFtcExhYmVsOiAnQCcsXG4gICAgICAgICAgICAgIHNob3dBdmdMaW5lOiAnPScsXG4gICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzOiAnPSdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgIF1cbiAgICApXG4gIDtcbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGNvbnN0IFlfQVhJU19IRUlHSFQgPSAxNTtcbiAgY29uc3QgX21vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKTtcblxuICBleHBvcnQgY2xhc3MgU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX1dJRFRIID0gMzAwO1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9IRUlHSFQgPSA4MDtcblxuICAgIHB1YmxpYyByZXN0cmljdCA9ICdFJztcbiAgICBwdWJsaWMgcmVwbGFjZSA9IHRydWU7XG5cbiAgICBwdWJsaWMgc2NvcGUgPSB7XG4gICAgICBkYXRhOiAnPScsXG4gICAgICBzaG93WUF4aXNWYWx1ZXM6ICc9JyxcbiAgICAgIHNob3dYQXhpc1ZhbHVlczogJz0nLFxuICAgICAgYWxlcnRWYWx1ZTogJ0AnLFxuICAgIH07XG5cbiAgICBwdWJsaWMgbGluazogKHNjb3BlOiBhbnksIGVsZW1lbnQ6IG5nLklBdWdtZW50ZWRKUXVlcnksIGF0dHJzOiBhbnkpID0+IHZvaWQ7XG5cbiAgICBwdWJsaWMgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W107XG5cbiAgICBjb25zdHJ1Y3Rvcigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgY29uc3QgbWFyZ2luID0geyB0b3A6IDEwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA0NSB9O1xuXG4gICAgICAgIC8vIGRhdGEgc3BlY2lmaWMgdmFyc1xuICAgICAgICBsZXQgY2hhcnRIZWlnaHQgPSBTcGFya2xpbmVDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hULFxuICAgICAgICAgIHdpZHRoID0gU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgaGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICBzaG93WEF4aXNWYWx1ZXM6IGJvb2xlYW4sXG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzOiBib29sZWFuLFxuICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB5QXhpc0dyb3VwLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgIHN2ZyxcbiAgICAgICAgICBhbGVydFZhbHVlO1xuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuYWxlcnRWYWx1ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBhbGVydFZhbHVlID0gK2F0dHJzLmFsZXJ0VmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGF0dHJzLnNob3dYQXhpc1ZhbHVlcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBzaG93WEF4aXNWYWx1ZXMgPSBhdHRycy5zaG93WEF4aXNWYWx1ZXMgPT09ICd0cnVlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuc2hvd1lBeGlzVmFsdWVzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlcyA9IGF0dHJzLnNob3dZQXhpc1ZhbHVlcyA9PT0gJ3RydWUnO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2V0dXAoKTogdm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG4gICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAuYXR0cigndmlld0JveCcsICcwIDAgJyArICh3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KSArICcgJyArIChoZWlnaHQgKyBtYXJnaW4udG9wICtcbiAgICAgICAgICAgICAgbWFyZ2luLmJvdHRvbSArIFlfQVhJU19IRUlHSFQpKVxuICAgICAgICAgICAgLmF0dHIoJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLCAneE1pbllNaW4gbWVldCcpO1xuXG4gICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsJyArIG1hcmdpbi50b3AgKyAnKScpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnc3BhcmtsaW5lJyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVNwYXJrbGluZUNoYXJ0KGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSB7XG5cbiAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGggLSAxMF0pXG4gICAgICAgICAgICAubmljZSgpXG4gICAgICAgICAgICAuZG9tYWluKFtkYXRhUG9pbnRzWzBdLnRpbWVzdGFtcCwgZGF0YVBvaW50c1tkYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcF0pO1xuXG4gICAgICAgICAgbGV0IG51bWJlck9mWFRpY2tzID0gc2hvd1hBeGlzVmFsdWVzID8gMiA6IDA7XG5cbiAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAudGlja3MobnVtYmVyT2ZYVGlja3MpXG4gICAgICAgICAgICAudGlja1NpemUoNCwgMClcbiAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgIC5vcmllbnQoJ2JvdHRvbScpO1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICBsZXQgeU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCB5TWF4ID0gZDMubWF4KGRhdGFQb2ludHMsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBnaXZlIGEgcGFkIG9mICUgdG8gbWluL21heCBzbyB3ZSBhcmUgbm90IGFnYWluc3QgeC1heGlzXG4gICAgICAgICAgeU1heCA9IHlNYXggKyAoeU1heCAqIDAuMDMpO1xuICAgICAgICAgIHlNaW4gPSB5TWluIC0gKHlNaW4gKiAwLjA1KTtcblxuICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAucmFuZ2VSb3VuZChbU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVCAtIFlfQVhJU19IRUlHSFQsIDBdKVxuICAgICAgICAgICAgLmRvbWFpbihbeU1pbiwgeU1heF0pO1xuXG4gICAgICAgICAgbGV0IG51bWJlck9mWVRpY2tzID0gc2hvd1lBeGlzVmFsdWVzID8gMiA6IDA7XG5cbiAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAudGlja3MobnVtYmVyT2ZZVGlja3MpXG4gICAgICAgICAgICAudGlja1NpemUoMywgMClcbiAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgIGxldCBpbnRlcnBvbGF0aW9uVHlwZSA9ICdiYXNpcyc7XG4gICAgICAgICAgbGV0IGFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvblR5cGUpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAhZC5lbXB0eTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBTcGFya2xpbmVDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hUIC0gWV9BWElTX0hFSUdIVDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTEoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gdGhpcyBpcyB0aGUgbGluZSB0aGF0IGNhcHMgdGhlIGFyZWFcbiAgICAgICAgICBsZXQgc3BhcmtsaW5lTGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0aW9uVHlwZSlcbiAgICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAvLyAtMiBwaXhlbHMgdG8ga2VlcCB0aGUgMiBwaXhlbCBsaW5lIGZyb20gY3Jvc3Npbmcgb3ZlciB0aGUgeC1heGlzXG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpIC0gMjtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IHBhdGhTcGFya2xpbmVMaW5lID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5zcGFya2xpbmVMaW5lJylcbiAgICAgICAgICAgIC5kYXRhKFtkYXRhUG9pbnRzXSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBwYXRoU3BhcmtsaW5lTGluZS5hdHRyKCdjbGFzcycsICdzcGFya2xpbmVMaW5lJylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5hdHRyKCdkJywgc3BhcmtsaW5lTGluZSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBwYXRoU3BhcmtsaW5lTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnc3BhcmtsaW5lTGluZScpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuYXR0cignZCcsIHNwYXJrbGluZUxpbmUpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgcGF0aFNwYXJrbGluZUxpbmUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgbGV0IHNwYXJrbGluZUFyZWEgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdzcGFya2xpbmUnKTtcblxuICAgICAgICAgIHNwYXJrbGluZUFyZWEuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5kYXR1bShkYXRhUG9pbnRzKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmR1cmF0aW9uKDUwMClcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdzcGFya2xpbmVBcmVhJylcbiAgICAgICAgICAgIC5hdHRyKCdkJywgYXJlYSk7XG5cbiAgICAgICAgICAvL2lmIChhbGVydFZhbHVlICYmIChhbGVydFZhbHVlID49IHlNaW4gJiYgYWxlcnRWYWx1ZSA8PSB5TWF4KSkge1xuICAgICAgICAgIC8vICBsZXQgYWxlcnRCb3VuZHM6IEFsZXJ0Qm91bmRbXSA9IGV4dHJhY3RBbGVydFJhbmdlcyhkYXRhUG9pbnRzLCBhbGVydFZhbHVlKTtcbiAgICAgICAgICAvLyAgY3JlYXRlQWxlcnRCb3VuZHNBcmVhKHN2Zyx0aW1lU2NhbGUsIHlTY2FsZSx5TWF4LCBhbGVydEJvdW5kcyk7XG4gICAgICAgICAgLy99XG5cbiAgICAgICAgICAvLyBwbGFjZSB0aGUgeCBhbmQgeSBheGVzIGFib3ZlIHRoZSBjaGFydFxuICAgICAgICAgIHlBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd5IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeUF4aXMpO1xuXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgwLCcgKyBoZWlnaHQgKyAnKScpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+PSB5TWluICYmIGFsZXJ0VmFsdWUgPD0geU1heCkpIHtcbiAgICAgICAgICAgIC8vLyBOT1RFOiB0aGlzIGFsZXJ0IGxpbmUgaGFzIGhpZ2hlciBwcmVjZWRlbmNlIGZyb20gYWxlcnQgYXJlYSBhYm92ZVxuICAgICAgICAgICAgY3JlYXRlQWxlcnRMaW5lKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIGRhdGFQb2ludHMsIGFsZXJ0VmFsdWUsICdzcGFya2xpbmVBbGVydExpbmUnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhUG9pbnRzID0gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignYWxlcnRWYWx1ZScsIChuZXdBbGVydFZhbHVlKSA9PiB7XG4gICAgICAgICAgaWYgKG5ld0FsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSBuZXdBbGVydFZhbHVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YVBvaW50cykge1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy5kYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOiBJQ2hhcnREYXRhUG9pbnRbXSB7XG4gICAgICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5tYXAoKHBvaW50OiBJQ2hhcnREYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAvL2RhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUucmVuZGVyID0gKGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKGRhdGFQb2ludHMgJiYgZGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUuZ3JvdXAoJ1JlbmRlciBTcGFya2xpbmUgQ2hhcnQnKTtcbiAgICAgICAgICAgIC8vY29uc29sZS50aW1lKCdTcGFya2xpbmVDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgc2V0dXAoKTtcbiAgICAgICAgICAgIGNyZWF0ZVNwYXJrbGluZUNoYXJ0KGRhdGFQb2ludHMpO1xuICAgICAgICAgICAgLy9jb25zb2xlLnRpbWVFbmQoJ1NwYXJrbGluZUNoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAvL2NvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBTcGFya2xpbmVDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnaGF3a3VsYXJTcGFya2xpbmVDaGFydCcsIFNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLkZhY3RvcnkoKSk7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8vIFR5cGUgdmFsdWVzIGFuZCBJRCB0eXBlc1xuICBleHBvcnQgdHlwZSBBbGVydFRocmVzaG9sZCA9IG51bWJlcjtcbiAgZXhwb3J0IHR5cGUgVGltZUluTWlsbGlzID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBVcmxUeXBlID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBNZXRyaWNJZCA9IHN0cmluZztcbiAgZXhwb3J0IHR5cGUgTWV0cmljVmFsdWUgPSBudW1iZXI7XG5cbiAgLyoqXG4gICAqIE1ldHJpY3MgUmVzcG9uc2UgZnJvbSBIYXdrdWxhciBNZXRyaWNzXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNZXRyaWNzUmVzcG9uc2VEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBUaW1lSW5NaWxsaXM7XG4gICAgZW5kOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIG1pbj86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBtYXg/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgbWVkaWFuPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIHBlcmNlbnRpbGU5NXRoPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIGVtcHR5OiBib29sZWFuO1xuICB9XG5cbiAgZXhwb3J0IGludGVyZmFjZSBJU2ltcGxlTWV0cmljIHtcbiAgICB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcztcbiAgICB2YWx1ZTogTWV0cmljVmFsdWU7XG4gIH1cblxuICBleHBvcnQgaW50ZXJmYWNlIElCYXNlQ2hhcnREYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDogVGltZUluTWlsbGlzO1xuICAgIHN0YXJ0PzogVGltZUluTWlsbGlzO1xuICAgIGVuZD86IFRpbWVJbk1pbGxpcztcbiAgICB2YWx1ZT86IE1ldHJpY1ZhbHVlOyAvLy8gT25seSBmb3IgUmF3IGRhdGEgKG5vIGJ1Y2tldHMgb3IgYWdncmVnYXRlcylcbiAgICBhdmc6IE1ldHJpY1ZhbHVlOyAvLy8gbW9zdCBvZiB0aGUgdGltZSB0aGlzIGlzIHRoZSB1c2VmdWwgdmFsdWUgZm9yIGFnZ3JlZ2F0ZXNcbiAgICBlbXB0eTogYm9vbGVhbjsgLy8vIHdpbGwgc2hvdyB1cCBpbiB0aGUgY2hhcnQgYXMgYmxhbmsgLSBzZXQgdGhpcyB3aGVuIHlvdSBoYXZlIE5hTlxuICB9XG5cbiAgLyoqXG4gICAqIFJlcHJlc2VudGF0aW9uIG9mIGRhdGEgcmVhZHkgdG8gYmUgY29uc3VtZWQgYnkgY2hhcnRzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQ2hhcnREYXRhUG9pbnQgZXh0ZW5kcyBJQmFzZUNoYXJ0RGF0YVBvaW50IHtcbiAgICBkYXRlPzogRGF0ZTtcbiAgICBtaW46IE1ldHJpY1ZhbHVlO1xuICAgIG1heDogTWV0cmljVmFsdWU7XG4gICAgcGVyY2VudGlsZTk1dGg6IE1ldHJpY1ZhbHVlO1xuICAgIG1lZGlhbjogTWV0cmljVmFsdWU7XG4gIH1cblxuICAvKipcbiAgICogRGF0YSBzdHJ1Y3R1cmUgZm9yIGEgTXVsdGktTWV0cmljIGNoYXJ0LiBDb21wb3NlZCBvZiBJQ2hhcnREYXRhRGF0YVBvaW50W10uXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNdWx0aURhdGFQb2ludCB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAga2V5SGFzaD86IHN0cmluZzsgLy8gZm9yIHVzaW5nIGFzIHZhbGlkIGh0bWwgaWRcbiAgICBjb2xvcj86IHN0cmluZzsgLy8vICNmZmZlZWVcbiAgICB2YWx1ZXM6IElDaGFydERhdGFQb2ludFtdO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLyogdHNsaW50OmRpc2FibGU6bm8tYml0d2lzZSAqL1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyV2lkdGgod2lkdGg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIGJhck9mZnNldCA9IEJBUl9PRkZTRVQpIHtcbiAgICByZXR1cm4gKHdpZHRoIC8gbGVuZ3RoIC0gYmFyT2Zmc2V0KTtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZXMgdGhlIGJhciB3aWR0aCBhZGp1c3RlZCBzbyB0aGF0IHRoZSBmaXJzdCBhbmQgbGFzdCBhcmUgaGFsZi13aWR0aCBvZiB0aGUgb3RoZXJzXG4gIC8vIHNlZSBodHRwczovL2lzc3Vlcy5qYm9zcy5vcmcvYnJvd3NlL0hBV0tVTEFSLTgwOSBmb3IgaW5mbyBvbiB3aHkgdGhpcyBpcyBuZWVkZWRcbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGxlbmd0aDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIChpID09PSAwIHx8IGkgPT09IGxlbmd0aCAtIDEpID8gY2FsY0JhcldpZHRoKHdpZHRoLCBsZW5ndGgsIEJBUl9PRkZTRVQpIC8gMiA6XG4gICAgICBjYWxjQmFyV2lkdGgod2lkdGgsIGxlbmd0aCwgQkFSX09GRlNFVCk7XG4gIH1cblxuICAvLyBDYWxjdWxhdGVzIHRoZSBiYXIgWCBwb3NpdGlvbi4gV2hlbiB1c2luZyBjYWxjQmFyV2lkdGhBZGp1c3RlZCwgaXQgaXMgcmVxdWlyZWQgdG8gcHVzaCBiYXJzXG4gIC8vIG90aGVyIHRoYW4gdGhlIGZpcnN0IGhhbGYgYmFyIHRvIHRoZSBsZWZ0LCB0byBtYWtlIHVwIGZvciB0aGUgZmlyc3QgYmVpbmcganVzdCBoYWxmIHdpZHRoXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGU6IGFueSwgbGVuZ3RoOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKSAtIChpID09PSAwID8gMCA6IGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKSAvIDIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFuIGVtcHR5IGRhdGFwb2ludCBoYXMgJ2VtcHR5JyBhdHRyaWJ1dGUgc2V0IHRvIHRydWUuIFVzZWQgdG8gZGlzdGluZ3Vpc2ggZnJvbSByZWFsIDAgdmFsdWVzLlxuICAgKiBAcGFyYW0gZFxuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5RGF0YVBvaW50KGQ6IElDaGFydERhdGFQb2ludCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBkLmVtcHR5O1xuICB9XG5cbiAgLyoqXG4gICAqIFJhdyBtZXRyaWNzIGhhdmUgYSAndmFsdWUnIHNldCBpbnN0ZWFkIG9mIGF2Zy9taW4vbWF4IG9mIGFnZ3JlZ2F0ZXNcbiAgICogQHBhcmFtIGRcbiAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAqL1xuICBleHBvcnQgZnVuY3Rpb24gaXNSYXdNZXRyaWMoZDogSUNoYXJ0RGF0YVBvaW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHR5cGVvZiBkLmF2ZyA9PT0gJ3VuZGVmaW5lZCc7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24geEF4aXNUaW1lRm9ybWF0cygpIHtcbiAgICByZXR1cm4gZDMudGltZS5mb3JtYXQubXVsdGkoW1xuICAgICAgWycuJUwnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaWxsaXNlY29uZHMoKTtcbiAgICAgIH1dLFxuICAgICAgWyc6JVMnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRTZWNvbmRzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJUg6JU0nLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaW51dGVzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJUg6JU0nLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRIb3VycygpO1xuICAgICAgfV0sXG4gICAgICBbJyVhICVkJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0RGF5KCkgJiYgZC5nZXREYXRlKCkgIT09IDE7XG4gICAgICB9XSxcbiAgICAgIFsnJWIgJWQnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXREYXRlKCkgIT09IDE7XG4gICAgICB9XSxcbiAgICAgIFsnJUInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNb250aCgpO1xuICAgICAgfV0sXG4gICAgICBbJyVZJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1dXG4gICAgXSk7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlU3ZnRGVmcyhjaGFydCkge1xuXG4gICAgbGV0IGRlZnMgPSBjaGFydC5hcHBlbmQoJ2RlZnMnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICdub0RhdGFTdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdkJywgJ00gMCAwIDYgMCcpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiNDQ0NDQ0M7IGZpbGw6bm9uZTsnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICd1bmtub3duU3RyaXBlcycpXG4gICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgIC5hdHRyKCd4JywgJzAnKVxuICAgICAgLmF0dHIoJ3knLCAnMCcpXG4gICAgICAuYXR0cignd2lkdGgnLCAnNicpXG4gICAgICAuYXR0cignaGVpZ2h0JywgJzMnKVxuICAgICAgLmF0dHIoJ3N0eWxlJywgJ3N0cm9rZTojMkU5RUMyOyBmaWxsOm5vbmU7JylcbiAgICAgIC5hcHBlbmQoJ3BhdGgnKS5hdHRyKCdkJywgJ00gMCAwIDYgMCcpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ2Rvd25TdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiNmZjhhOWE7IGZpbGw6bm9uZTsnKVxuICAgICAgLmFwcGVuZCgncGF0aCcpLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJyk7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZTogYW55KSB7XG4gICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gIH1cblxuICAvLyBhZGFwdGVkIGZyb20gaHR0cDovL3dlcnhsdGQuY29tL3dwLzIwMTAvMDUvMTMvamF2YXNjcmlwdC1pbXBsZW1lbnRhdGlvbi1vZi1qYXZhcy1zdHJpbmctaGFzaGNvZGUtbWV0aG9kL1xuICBleHBvcnQgZnVuY3Rpb24gaGFzaFN0cmluZyhzdHI6IHN0cmluZyk6IG51bWJlciB7XG4gICAgbGV0IGhhc2ggPSAwLCBpLCBjaHIsIGxlbjtcbiAgICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGhhc2g7XG4gICAgfVxuICAgIGZvciAoaSA9IDAsIGxlbiA9IHN0ci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgY2hyID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICBoYXNoID0gKChoYXNoIDw8IDUpIC0gaGFzaCkgKyBjaHI7XG4gICAgICBoYXNoIHw9IDA7IC8vIENvbnZlcnQgdG8gMzJiaXQgaW50ZWdlclxuICAgIH1cbiAgICByZXR1cm4gaGFzaDtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBcmVhQ2hhcnQoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICBoZWlnaHQ/OiBudW1iZXIsXG4gICAgaW50ZXJwb2xhdGlvbj86IHN0cmluZyxcbiAgICBoaWRlSGlnaExvd1ZhbHVlcz86IGJvb2xlYW4pIHtcblxuICAgIGxldCBoaWdoQXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0aW9uKVxuICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLnkwKChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pLFxuXG4gICAgICBhdmdBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSkueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBoaWRlSGlnaExvd1ZhbHVlcyA/IGhlaWdodCA6IHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pLFxuXG4gICAgICBsb3dBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnkwKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gaGVpZ2h0O1xuICAgICAgICB9KTtcblxuICAgIGlmICghaGlkZUhpZ2hMb3dWYWx1ZXMpIHtcbiAgICAgIGxldCBoaWdoQXJlYVBhdGggPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmhpZ2hBcmVhJykuZGF0YShbY2hhcnREYXRhXSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGhpZ2hBcmVhUGF0aC5hdHRyKCdjbGFzcycsICdoaWdoQXJlYScpXG4gICAgICAgIC5hdHRyKCdkJywgaGlnaEFyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBoaWdoQXJlYVBhdGguZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlnaEFyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGhpZ2hBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgaGlnaEFyZWFQYXRoLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgbGV0IGxvd0FyZWFQYXRoID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5sb3dBcmVhJykuZGF0YShbY2hhcnREYXRhXSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxvd0FyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2xvd0FyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGxvd0FyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBsb3dBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdsb3dBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBsb3dBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgbG93QXJlYVBhdGguZXhpdCgpLnJlbW92ZSgpO1xuICAgIH1cblxuICAgIGxldCBhdmdBcmVhUGF0aCA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGguYXZnQXJlYScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGF2Z0FyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2F2Z0FyZWEnKVxuICAgICAgLmF0dHIoJ2QnLCBhdmdBcmVhKTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBhdmdBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignY2xhc3MnLCAnYXZnQXJlYScpXG4gICAgICAuYXR0cignZCcsIGF2Z0FyZWEpO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGF2Z0FyZWFQYXRoLmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlSGlzdG9ncmFtQ2hhcnQoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICB0aXA6IGFueSxcbiAgICBoZWlnaHQ/OiBudW1iZXIsXG4gICAgc3RhY2tlZD86IGJvb2xlYW4sXG4gICAgdmlzdWFsbHlBZGp1c3RlZE1heD86IG51bWJlcixcbiAgICBoaWRlSGlnaExvd1ZhbHVlcz86IGJvb2xlYW4pIHtcblxuICAgIGNvbnN0IGJhckNsYXNzID0gc3RhY2tlZCA/ICdsZWFkZXJCYXInIDogJ2hpc3RvZ3JhbSc7XG5cbiAgICBjb25zdCByZWN0SGlzdG9ncmFtID0gc3ZnLnNlbGVjdEFsbCgncmVjdC4nICsgYmFyQ2xhc3MpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgIGZ1bmN0aW9uIGJ1aWxkQmFycyhzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgYmFyQ2xhc3MpXG4gICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgLmF0dHIoJ3gnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGUsIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBoZWlnaHQgLSB5U2NhbGUoaXNFbXB0eURhdGFQb2ludChkKSA/IHlTY2FsZSh2aXN1YWxseUFkanVzdGVkTWF4KSA6IGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ29wYWNpdHknLCBzdGFja2VkID8gJy42JyA6ICcxJylcbiAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gJ3VybCgjbm9EYXRhU3RyaXBlcyknIDogKHN0YWNrZWQgPyAnI0QzRDNENicgOiAnI0MwQzBDMCcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3NzcnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignZGF0YS1oYXdrdWxhci12YWx1ZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICB9KTtcblxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkSGlnaEJhcihzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gZC5taW4gPT09IGQubWF4ID8gJ3NpbmdsZVZhbHVlJyA6ICdoaWdoJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gnLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJYUG9zKGQsIGksIHRpbWVTY2FsZSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNOYU4oZC5tYXgpID8geVNjYWxlKHZpc3VhbGx5QWRqdXN0ZWRNYXgpIDogeVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogKHlTY2FsZShkLmF2ZykgLSB5U2NhbGUoZC5tYXgpIHx8IDIpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjkpXG4gICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkTG93ZXJCYXIoc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdsb3cnKVxuICAgICAgICAuYXR0cigneCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJYUG9zKGQsIGksIHRpbWVTY2FsZSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNOYU4oZC5hdmcpID8gaGVpZ2h0IDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogKHlTY2FsZShkLm1pbikgLSB5U2NhbGUoZC5hdmcpKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2FsY0JhcldpZHRoQWRqdXN0ZWQoaSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC45KVxuICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgICB9KTtcblxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkVG9wU3RlbShzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbVRvcFN0ZW0nKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkTG93U3RlbShzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbUJvdHRvbVN0ZW0nKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICB9KS5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZFRvcENyb3NzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtVG9wQ3Jvc3MnKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZEJvdHRvbUNyb3NzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVIaXN0b2dyYW1IaWdoTG93VmFsdWVzKHN2ZzogYW55LCBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCBzdGFja2VkPzogYm9vbGVhbikge1xuICAgICAgaWYgKHN0YWNrZWQpIHtcbiAgICAgICAgLy8gdXBwZXIgcG9ydGlvbiByZXByZXNlbnRpbmcgYXZnIHRvIGhpZ2hcbiAgICAgICAgY29uc3QgcmVjdEhpZ2ggPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmhpZ2gsIHJlY3Quc2luZ2xlVmFsdWUnKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIHJlY3RIaWdoLmNhbGwoYnVpbGRIaWdoQmFyKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgcmVjdEhpZ2hcbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgICAgIC5jYWxsKGJ1aWxkSGlnaEJhcik7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIHJlY3RIaWdoLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAvLyBsb3dlciBwb3J0aW9uIHJlcHJlc2VudGluZyBhdmcgdG8gbG93XG4gICAgICAgIGNvbnN0IHJlY3RMb3cgPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmxvdycpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgcmVjdExvdy5jYWxsKGJ1aWxkTG93ZXJCYXIpO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICByZWN0TG93XG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgICAgICAuY2FsbChidWlsZExvd2VyQmFyKTtcblxuICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgcmVjdExvdy5leGl0KCkucmVtb3ZlKCk7XG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIGNvbnN0IGxpbmVIaXN0b0hpZ2hTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcFN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxpbmVIaXN0b0hpZ2hTdGVtLmNhbGwoYnVpbGRUb3BTdGVtKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgbGluZUhpc3RvSGlnaFN0ZW1cbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxpbmVIaXN0b0hpZ2hTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICBjb25zdCBsaW5lSGlzdG9Mb3dTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxpbmVIaXN0b0xvd1N0ZW0uY2FsbChidWlsZExvd1N0ZW0pO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAuY2FsbChidWlsZExvd1N0ZW0pO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICBjb25zdCBsaW5lSGlzdG9Ub3BDcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Ub3BDcm9zcycpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3MuY2FsbChidWlsZFRvcENyb3NzKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3NcbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wQ3Jvc3MpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgY29uc3QgbGluZUhpc3RvQm90dG9tQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zcy5jYWxsKGJ1aWxkQm90dG9tQ3Jvc3MpO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zc1xuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgLmNhbGwoYnVpbGRCb3R0b21Dcm9zcyk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICByZWN0SGlzdG9ncmFtLmNhbGwoYnVpbGRCYXJzKTtcblxuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIHJlY3RIaXN0b2dyYW0uZW50ZXIoKVxuICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAuY2FsbChidWlsZEJhcnMpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcmVjdEhpc3RvZ3JhbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBpZiAoIWhpZGVIaWdoTG93VmFsdWVzKSB7XG4gICAgICBjcmVhdGVIaXN0b2dyYW1IaWdoTG93VmFsdWVzKHN2ZywgY2hhcnREYXRhLCBzdGFja2VkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gd2Ugc2hvdWxkIGhpZGUgaGlnaC1sb3cgdmFsdWVzLi4gb3IgcmVtb3ZlIGlmIGV4aXN0aW5nXG4gICAgICBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtVG9wU3RlbSwgLmhpc3RvZ3JhbUJvdHRvbVN0ZW0sIC5oaXN0b2dyYW1Ub3BDcm9zcywgLmhpc3RvZ3JhbUJvdHRvbUNyb3NzJykucmVtb3ZlKCk7XG4gICAgfVxuXG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlTGluZUNoYXJ0KHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgaGVpZ2h0PzogbnVtYmVyLFxuICAgIGludGVycG9sYXRpb24/OiBzdHJpbmcpIHtcblxuICAgIGxldCBtZXRyaWNDaGFydExpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSk7XG5cbiAgICBsZXQgcGF0aE1ldHJpYyA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGgubWV0cmljTGluZScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHBhdGhNZXRyaWMuYXR0cignY2xhc3MnLCAnbWV0cmljTGluZScpXG4gICAgICAudHJhbnNpdGlvbigpXG4gICAgICAuYXR0cignZCcsIG1ldHJpY0NoYXJ0TGluZSk7XG5cbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBwYXRoTWV0cmljLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdjbGFzcycsICdtZXRyaWNMaW5lJylcbiAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgIC5hdHRyKCdkJywgbWV0cmljQ2hhcnRMaW5lKTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHBhdGhNZXRyaWMuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNjYXR0ZXJDaGFydChzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLFxuICAgIGhlaWdodD86IG51bWJlcixcbiAgICBpbnRlcnBvbGF0aW9uPzogc3RyaW5nLFxuICAgIGhpZGVIaWdoTG93VmFsdWVzPzogYm9vbGVhbikge1xuXG4gICAgaWYgKCFoaWRlSGlnaExvd1ZhbHVlcykge1xuXG4gICAgICBsZXQgaGlnaERvdENpcmNsZSA9IHN2Zy5zZWxlY3RBbGwoJy5oaWdoRG90JykuZGF0YShjaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBoaWdoRG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2hpZ2hEb3QnKVxuICAgICAgICAuZmlsdGVyKChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyNmZjFhMTMnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgaGlnaERvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hEb3QnKVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjZmYxYTEzJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGhpZ2hEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgbG93RG90Q2lyY2xlID0gc3ZnLnNlbGVjdEFsbCgnLmxvd0RvdCcpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgbG93RG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2xvd0RvdCcpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbG93RG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93RG90JylcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBsb3dEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHdlIHNob3VsZCBoaWRlIGhpZ2gtbG93IHZhbHVlcy4uIG9yIHJlbW92ZSBpZiBleGlzdGluZ1xuICAgICAgc3ZnLnNlbGVjdEFsbCgnLmhpZ2hEb3QsIC5sb3dEb3QnKS5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBsZXQgYXZnRG90Q2lyY2xlID0gc3ZnLnNlbGVjdEFsbCgnLmF2Z0RvdCcpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBhdmdEb3RDaXJjbGUuYXR0cignY2xhc3MnLCAnYXZnRG90JylcbiAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiAnI0ZGRic7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgYXZnRG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2Z0RvdCcpXG4gICAgICAuYXR0cigncicsIDMpXG4gICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gJyNGRkYnO1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGF2Z0RvdENpcmNsZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTY2F0dGVyTGluZUNoYXJ0KHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgaGVpZ2h0PzogbnVtYmVyLFxuICAgIGludGVycG9sYXRpb24/OiBzdHJpbmcsXG4gICAgaGlkZUhpZ2hMb3dWYWx1ZXM/OiBib29sZWFuKSB7XG4gICAgbGV0IGxpbmVTY2F0dGVyVG9wU3RlbSA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZVRvcFN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgbGluZVNjYXR0ZXJUb3BTdGVtLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wU3RlbScpXG4gICAgICAuZmlsdGVyKChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BTdGVtJylcbiAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBsZXQgbGluZVNjYXR0ZXJCb3R0b21TdGVtID0gc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lQm90dG9tU3RlbScpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21TdGVtJylcbiAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGxpbmVTY2F0dGVyQm90dG9tU3RlbS5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21TdGVtJylcbiAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGxpbmVTY2F0dGVyQm90dG9tU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBsZXQgbGluZVNjYXR0ZXJUb3BDcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZVRvcENyb3NzJykuZGF0YShjaGFydERhdGEpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BDcm9zcycpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgbGluZVNjYXR0ZXJUb3BDcm9zcy5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BDcm9zcycpXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgbGluZVNjYXR0ZXJUb3BDcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBsZXQgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZUJvdHRvbUNyb3NzJykuZGF0YShjaGFydERhdGEpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcy5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBsZXQgY2lyY2xlU2NhdHRlckRvdCA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyRG90JykuZGF0YShjaGFydERhdGEpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGNpcmNsZVNjYXR0ZXJEb3QuYXR0cignY2xhc3MnLCAnc2NhdHRlckRvdCcpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigncicsIDMpXG4gICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnb3BhY2l0eScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcxJztcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBjaXJjbGVTY2F0dGVyRG90LmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJEb3QnKVxuICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgIH0pXG4gICAgICAuc3R5bGUoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiAnMSc7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgY2lyY2xlU2NhdHRlckRvdC5leGl0KCkucmVtb3ZlKCk7XG5cbiAgfVxuXG59XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
