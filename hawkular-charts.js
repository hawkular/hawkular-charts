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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImhhd2t1bGFyLW1ldHJpY3MtY2hhcnRzLm1vZHVsZS50cyIsImNoYXJ0L2FsZXJ0cy50cyIsImNoYXJ0L2F2YWlsLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L2NvbnRleHQtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvZXZlbnQtbmFtZXMudHMiLCJjaGFydC9mZWF0dXJlcy50cyIsImNoYXJ0L21ldHJpYy1jaGFydC1kaXJlY3RpdmUudHMiLCJjaGFydC9zcGFya2xpbmUtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvdHlwZXMudHMiLCJjaGFydC91dGlsaXR5LnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9hcmVhLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9oaXN0b2dyYW0udHMiLCJjaGFydC9jaGFydC10eXBlL2xpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXJMaW5lLnRzIl0sIm5hbWVzIjpbIkNoYXJ0cyIsIkNoYXJ0cy5BbGVydEJvdW5kIiwiQ2hhcnRzLkFsZXJ0Qm91bmQuY29uc3RydWN0b3IiLCJDaGFydHMuY3JlYXRlQWxlcnRMaW5lRGVmIiwiQ2hhcnRzLmNyZWF0ZUFsZXJ0TGluZSIsIkNoYXJ0cy5leHRyYWN0QWxlcnRSYW5nZXMiLCJDaGFydHMuZXh0cmFjdEFsZXJ0UmFuZ2VzLmZpbmRTdGFydFBvaW50cyIsIkNoYXJ0cy5leHRyYWN0QWxlcnRSYW5nZXMuZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleCIsIkNoYXJ0cy5jcmVhdGVBbGVydEJvdW5kc0FyZWEiLCJDaGFydHMuY3JlYXRlQWxlcnRCb3VuZHNBcmVhLmFsZXJ0Qm91bmRpbmdSZWN0IiwiQ2hhcnRzLkF2YWlsU3RhdHVzIiwiQ2hhcnRzLkF2YWlsU3RhdHVzLmNvbnN0cnVjdG9yIiwiQ2hhcnRzLkF2YWlsU3RhdHVzLnRvU3RyaW5nIiwiQ2hhcnRzLlRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQiLCJDaGFydHMuVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3RvciIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5idWlsZEF2YWlsSG92ZXIiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3Iub25lVGltZUNoYXJ0U2V0dXAiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZGV0ZXJtaW5lQXZhaWxTY2FsZSIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5pc1VwIiwiQ2hhcnRzLkF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmlzVW5rbm93biIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5mb3JtYXRUcmFuc2Zvcm1lZERhdGFQb2ludHMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZm9ybWF0VHJhbnNmb3JtZWREYXRhUG9pbnRzLnNvcnRCeVRpbWVzdGFtcCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVTaWRlWUF4aXNMYWJlbHMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQuY2FsY0JhclkiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQuY2FsY0JhckhlaWdodCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVBdmFpbGFiaWxpdHlDaGFydC5jYWxjQmFyRmlsbCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYYW5kWUF4ZXMiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlWEF4aXNCcnVzaCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmJydXNoU3RhcnQiLCJDaGFydHMuQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlWEF4aXNCcnVzaC5icnVzaEVuZCIsIkNoYXJ0cy5BdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5GYWN0b3J5IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZSIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IiLCJDaGFydHMuQ29udGV4dENoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLnJlc2l6ZSIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuY3JlYXRlQ29udGV4dENoYXJ0IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoIiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmNvbnRleHRCcnVzaFN0YXJ0IiwiQ2hhcnRzLkNvbnRleHRDaGFydERpcmVjdGl2ZS5jb25zdHJ1Y3Rvci5jcmVhdGVYQXhpc0JydXNoLmNvbnRleHRCcnVzaEVuZCIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuY29uc3RydWN0b3IuZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dCIsIkNoYXJ0cy5Db250ZXh0Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSIsIkNoYXJ0cy5FdmVudE5hbWVzIiwiQ2hhcnRzLkV2ZW50TmFtZXMuY29uc3RydWN0b3IiLCJDaGFydHMuRXZlbnROYW1lcy50b1N0cmluZyIsIkNoYXJ0cy5jcmVhdGVEYXRhUG9pbnRzIiwibGluayIsImxpbmsuZ2V0Q2hhcnRXaWR0aCIsImxpbmsucmVzaXplIiwibGluay5zZXR1cEZpbHRlcmVkRGF0YSIsImxpbmsuZGV0ZXJtaW5lU2NhbGUiLCJsaW5rLnNldHVwRmlsdGVyZWRNdWx0aURhdGEiLCJsaW5rLnNldHVwRmlsdGVyZWRNdWx0aURhdGEuZGV0ZXJtaW5lTXVsdGlEYXRhTWluTWF4IiwibGluay5kZXRlcm1pbmVNdWx0aVNjYWxlIiwibGluay5sb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UiLCJsaW5rLmZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQiLCJsaW5rLmJ1aWxkSG92ZXIiLCJsaW5rLmNyZWF0ZU11bHRpTGluZUNoYXJ0IiwibGluay5jcmVhdGVZQXhpc0dyaWRMaW5lcyIsImxpbmsuY3JlYXRlWGFuZFlBeGVzIiwibGluay5jcmVhdGVYYW5kWUF4ZXMuYXhpc1RyYW5zaXRpb24iLCJsaW5rLmNyZWF0ZUNlbnRlcmVkTGluZSIsImxpbmsuY3JlYXRlTGluZSIsImxpbmsuY3JlYXRlQXZnTGluZXMiLCJsaW5rLmNyZWF0ZVhBeGlzQnJ1c2giLCJsaW5rLmNyZWF0ZVhBeGlzQnJ1c2guYnJ1c2hTdGFydCIsImxpbmsuY3JlYXRlWEF4aXNCcnVzaC5icnVzaEVuZCIsImxpbmsuY3JlYXRlUHJldmlvdXNSYW5nZU92ZXJsYXkiLCJsaW5rLmFubm90YXRlQ2hhcnQiLCJsaW5rLmNyZWF0ZUZvcmVjYXN0TGluZSIsImxpbmsuc2hvd0ZvcmVjYXN0RGF0YSIsImxpbmsubG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdyIsImxpbmsuZGV0ZXJtaW5lQ2hhcnRUeXBlIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLnNldHVwIiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmNyZWF0ZVNwYXJrbGluZUNoYXJ0IiwiQ2hhcnRzLlNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLmNvbnN0cnVjdG9yLmZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQiLCJDaGFydHMuU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuRmFjdG9yeSIsIkNoYXJ0cy5jYWxjQmFyV2lkdGgiLCJDaGFydHMuY2FsY0JhcldpZHRoQWRqdXN0ZWQiLCJDaGFydHMuY2FsY0JhclhQb3MiLCJDaGFydHMuaXNFbXB0eURhdGFQb2ludCIsIkNoYXJ0cy5pc1Jhd01ldHJpYyIsIkNoYXJ0cy54QXhpc1RpbWVGb3JtYXRzIiwiQ2hhcnRzLmNyZWF0ZVN2Z0RlZnMiLCJDaGFydHMueE1pZFBvaW50U3RhcnRQb3NpdGlvbiIsIkNoYXJ0cy5oYXNoU3RyaW5nIiwiQ2hhcnRzLmNyZWF0ZUFyZWFDaGFydCIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydCIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5idWlsZEJhcnMiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRIaWdoQmFyIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkTG93ZXJCYXIiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuYnVpbGRUb3BTdGVtIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkTG93U3RlbSIsIkNoYXJ0cy5jcmVhdGVIaXN0b2dyYW1DaGFydC5idWlsZFRvcENyb3NzIiwiQ2hhcnRzLmNyZWF0ZUhpc3RvZ3JhbUNoYXJ0LmJ1aWxkQm90dG9tQ3Jvc3MiLCJDaGFydHMuY3JlYXRlSGlzdG9ncmFtQ2hhcnQuY3JlYXRlSGlzdG9ncmFtSGlnaExvd1ZhbHVlcyIsIkNoYXJ0cy5jcmVhdGVMaW5lQ2hhcnQiLCJDaGFydHMuY3JlYXRlU2NhdHRlckNoYXJ0IiwiQ2hhcnRzLmNyZWF0ZVNjYXR0ZXJMaW5lQ2hhcnQiXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7O0FDUHRDLCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0EySmY7QUEzSkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQkEsWUFBWUEsQ0FBQ0E7SUFDYkE7OztPQUdHQTtJQUNIQTtRQUlFQyxvQkFBbUJBLGNBQTRCQSxFQUN0Q0EsWUFBMEJBLEVBQzFCQSxVQUFrQkE7WUFGUkMsbUJBQWNBLEdBQWRBLGNBQWNBLENBQWNBO1lBQ3RDQSxpQkFBWUEsR0FBWkEsWUFBWUEsQ0FBY0E7WUFDMUJBLGVBQVVBLEdBQVZBLFVBQVVBLENBQVFBO1lBQ3pCQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtZQUMxQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO1FBRUhELGlCQUFDQTtJQUFEQSxDQVhBRCxBQVdDQyxJQUFBRDtJQVhZQSxpQkFBVUEsYUFXdEJBLENBQUFBO0lBRURBLDRCQUE0QkEsU0FBY0EsRUFDeENBLE1BQVdBLEVBQ1hBLFVBQWtCQTtRQUNsQkcsSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUE7YUFDckJBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBO2FBQ3ZCQSxDQUFDQSxDQUFDQSxVQUFDQSxDQUFNQTtZQUNSQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0EsQ0FBQ0E7YUFD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Q3hCQSxDQUFDQSxDQUFDQTt5QkFDREEsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUE7d0JBQ2ZBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO29CQUNkQSxDQUFDQSxDQUFDQTt5QkFDREEsRUFBRUEsQ0FBQ0EsV0FBV0EsRUFBRUEsVUFBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7d0JBQ3BCQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDakJBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFVBQVVBLEVBQUVBO3dCQUNoQkEsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7b0JBQ2JBLENBQUNBLENBQUNBO3lCQUNEQSxFQUFFQSxDQUFDQSxXQUFXQSxFQUFFQTt3QkFDZkEsSUFBSUEsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7d0JBQzVDQSxJQUFJQSxVQUFVQSxHQUFRQSxJQUFJQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTt3QkFDN0NBLFVBQVVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO3dCQUNsQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7d0JBQ3RDQSxVQUFVQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTt3QkFDbENBLFVBQVVBLENBQUNBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBO3dCQUN0Q0EsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7b0JBQ3RDQSxDQUFDQSxDQUFDQTt5QkFDREEsRUFBRUEsQ0FBQ0EsU0FBU0EsRUFBRUE7d0JBQ2JBLElBQUlBLFNBQVNBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO3dCQUM1Q0EsSUFBSUEsVUFBVUEsR0FBUUEsSUFBSUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7d0JBQzNDQSxVQUFVQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTt3QkFDbENBLFVBQVVBLENBQUNBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBO3dCQUN0Q0EsVUFBVUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7d0JBQ2xDQSxVQUFVQSxDQUFDQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTt3QkFDdENBLFNBQVNBLENBQUNBLGFBQWFBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO29CQUN0Q0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRUxBLDRDQUE0Q0E7b0JBQzVDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTt5QkFDZkEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7eUJBQ2JBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO3lCQUNkQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQTt5QkFDZkEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7eUJBQ2RBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLEdBQUdBLENBQUNBO3lCQUN6QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7b0JBRTdCQSxxQkFBcUJBLEVBQUVBLENBQUNBO2dCQUMxQkEsQ0FBQ0E7Z0JBRURUO29CQUVFYSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtvQkFFakNBLGdCQUFnQkE7b0JBQ2hCQSxVQUFVQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTt5QkFDekJBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLFFBQVFBLENBQUNBO3lCQUN2QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBRWZBLGdCQUFnQkE7b0JBQ2hCQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTt5QkFDWkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsUUFBUUEsQ0FBQ0E7eUJBQ3ZCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDakJBLENBQUNBO2dCQUVEYjtvQkFFRWMsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsRUFBRUE7eUJBQ25CQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQTt5QkFDWkEsRUFBRUEsQ0FBQ0EsWUFBWUEsRUFBRUEsVUFBVUEsQ0FBQ0E7eUJBQzVCQSxFQUFFQSxDQUFDQSxVQUFVQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFFNUJBLFVBQVVBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO3lCQUN6QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsT0FBT0EsQ0FBQ0E7eUJBQ3RCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFFZkEsVUFBVUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7b0JBRS9DQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQTt5QkFDekJBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO29CQUV0QkE7d0JBQ0VDLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO29CQUNqQ0EsQ0FBQ0E7b0JBRUREO3dCQUNFRSxJQUFJQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUN6QkEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsRUFDM0NBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLEVBQ3pDQSxrQkFBa0JBLEdBQUdBLE9BQU9BLEdBQUdBLFNBQVNBLENBQUNBO3dCQUUzQ0EscURBQXFEQTt3QkFDckRBLEVBQUVBLENBQUNBLENBQUNBLGtCQUFrQkEsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQ2hDQSxVQUFVQSxDQUFDQSxVQUFVQSxDQUFDQSxpQkFBVUEsQ0FBQ0EsNkJBQTZCQSxDQUFDQSxRQUFRQSxFQUFFQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDckZBLENBQUNBO3dCQUNEQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtvQkFDakNBLENBQUNBO2dCQUNIRixDQUFDQTtnQkFFRGQsS0FBS0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFDQSxPQUFPQTtvQkFDckNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO3dCQUNaQSxLQUFJQSxDQUFDQSxxQkFBcUJBLEdBQUdBLDJCQUEyQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3BGQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBO29CQUMzQ0EsQ0FBQ0E7Z0JBQ0hBLENBQUNBLENBQUNBLENBQUNBO2dCQUVIQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLGNBQWNBLENBQUNBLEVBQUVBLFVBQUNBLFlBQVlBO29CQUNqRUEsY0FBY0EsR0FBR0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsY0FBY0EsQ0FBQ0E7b0JBQ3BEQSxZQUFZQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxZQUFZQSxDQUFDQTtvQkFDaERBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFSEEsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsVUFBQ0EseUJBQXVEQTtvQkFDckVBLEVBQUVBLENBQUNBLENBQUNBLHlCQUF5QkEsSUFBSUEseUJBQXlCQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDdEVBLG1DQUFtQ0E7d0JBQ25DQSxxQ0FBcUNBO3dCQUNyQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTt3QkFDcEJBLG1CQUFtQkEsQ0FBQ0EseUJBQXlCQSxDQUFDQSxDQUFDQTt3QkFDL0NBLGVBQWVBLEVBQUVBLENBQUNBO3dCQUNsQkEsZ0JBQWdCQSxFQUFFQSxDQUFDQTt3QkFDbkJBLHVCQUF1QkEsQ0FBQ0EseUJBQXlCQSxDQUFDQSxDQUFDQTtvQkFFckRBLENBQUNBO2dCQUNIQSxDQUFDQSxDQUFDQTtZQUNKQSxDQUFDQSxDQUFDQTtRQUNKQSxDQUFDQTtRQUVhRCxrQ0FBT0EsR0FBckJBO1lBQ0VrQixJQUFJQSxTQUFTQSxHQUFHQSxVQUFDQSxVQUFnQ0E7Z0JBQy9DQSxNQUFNQSxDQUFDQSxJQUFJQSwwQkFBMEJBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ3BEQSxDQUFDQSxDQUFDQTtZQUVGQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtZQUV0Q0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDbkJBLENBQUNBO1FBNVpjbEIsd0NBQWFBLEdBQUdBLEdBQUdBLENBQUNBO1FBQ3BCQSx1Q0FBWUEsR0FBR0EsR0FBR0EsQ0FBQ0E7UUE2WnBDQSxpQ0FBQ0E7SUFBREEsQ0FoYUFmLEFBZ2FDZSxJQUFBZjtJQWhhWUEsaUNBQTBCQSw2QkFnYXRDQSxDQUFBQTtJQUVEQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxtQkFBbUJBLEVBQUVBLDBCQUEwQkEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7QUFDL0VBLENBQUNBLEVBL2RTLE1BQU0sS0FBTixNQUFNLFFBK2RmOztBQ2hlRCwrQ0FBK0M7QUFFL0MsSUFBVSxNQUFNLENBNFJmO0FBNVJELFdBQVUsTUFBTSxFQUFDLENBQUM7SUFDaEJBLFlBQVlBLENBQUNBO0lBR2JBLElBQU1BLE9BQU9BLEdBQUdBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7SUFHbERBO1FBb0JFa0MsK0JBQVlBLFVBQWdDQTtZQXBCOUNDLGlCQWtSQ0E7WUEzUVFBLGFBQVFBLEdBQUdBLEdBQUdBLENBQUNBO1lBQ2ZBLFlBQU9BLEdBQUdBLElBQUlBLENBQUNBO1lBRXRCQSxzRUFBc0VBO1lBQy9EQSxVQUFLQSxHQUFHQTtnQkFDYkEsSUFBSUEsRUFBRUEsR0FBR0E7Z0JBQ1RBLGVBQWVBLEVBQUVBLEdBQUdBO2FBQ3JCQSxDQUFDQTtZQVFBQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxVQUFDQSxLQUFLQSxFQUFFQSxPQUFPQSxFQUFFQSxLQUFLQTtnQkFFaENBLElBQU1BLE1BQU1BLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUV6REEscUJBQXFCQTtnQkFDckJBLElBQUlBLFdBQVdBLEdBQUdBLHFCQUFxQkEsQ0FBQ0Esa0JBQWtCQSxFQUN4REEsS0FBS0EsR0FBR0EscUJBQXFCQSxDQUFDQSxpQkFBaUJBLEdBQUdBLE1BQU1BLENBQUNBLElBQUlBLEdBQUdBLE1BQU1BLENBQUNBLEtBQUtBLEVBQzVFQSxNQUFNQSxHQUFHQSxXQUFXQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUNqREEsd0JBQXdCQSxHQUFHQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxFQUFFQSxFQUNuRUEsZ0JBQWdCQSxHQUFHQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUN0Q0EsZUFBd0JBLEVBQ3hCQSxNQUFNQSxFQUNOQSxLQUFLQSxFQUNMQSxVQUFVQSxFQUNWQSxTQUFTQSxFQUNUQSxLQUFLQSxFQUNMQSxVQUFVQSxFQUNWQSxLQUFLQSxFQUNMQSxVQUFVQSxFQUNWQSxLQUFLQSxFQUNMQSxXQUFXQSxFQUNYQSxHQUFHQSxDQUFDQTtnQkFFTkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsS0FBS0EsQ0FBQ0EsZUFBZUEsS0FBS0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2pEQSxlQUFlQSxHQUFHQSxLQUFLQSxDQUFDQSxlQUFlQSxLQUFLQSxNQUFNQSxDQUFDQTtnQkFDckRBLENBQUNBO2dCQUVEQTtvQkFDRUMsOEJBQThCQTtvQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO3dCQUNWQSxXQUFXQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtvQkFDdENBLENBQUNBO29CQUNEQSxXQUFXQSxHQUFHQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFcENBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUN4QkEsSUFBTUEsVUFBVUEsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0E7b0JBRXpDQSxLQUFLQSxHQUFTQSxVQUFXQSxDQUFDQSxXQUFXQSxDQUFDQTtvQkFDdENBLE1BQU1BLEdBQVNBLFVBQVdBLENBQUNBLFlBQVlBLENBQUNBO29CQUV4Q0Esd0JBQXdCQSxHQUFHQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxxQkFBcUJBLENBQUNBLGFBQWFBO3dCQUVsR0EseUNBQXlDQTt3QkFDekNBLDJDQUEyQ0E7d0JBRTNDQSxnQkFBZ0JBLEdBQUdBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO29CQUV6Q0EsS0FBS0EsR0FBR0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7eUJBQzlCQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTt5QkFDakRBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7b0JBRXBDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTt5QkFDcEJBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLFlBQVlBLEdBQUdBLE1BQU1BLENBQUNBLElBQUlBLEdBQUdBLE1BQU1BLENBQUNBO3lCQUN0REEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsY0FBY0EsQ0FBQ0EsQ0FBQ0E7Z0JBRW5DQSxDQUFDQTtnQkFFREQsNEJBQTRCQSxVQUE2QkE7b0JBQ3ZERSwwREFBMERBO29CQUUxREEsU0FBU0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUE7eUJBQ3hCQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQTt5QkFDdEJBLElBQUlBLEVBQUVBO3lCQUNOQSxNQUFNQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxFQUFFQSxVQUFVQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFbEZBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBO3lCQUNsQkEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7eUJBQ2hCQSxRQUFRQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTt5QkFDZEEsVUFBVUEsQ0FBQ0EsdUJBQWdCQSxFQUFFQSxDQUFDQTt5QkFDOUJBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO29CQUVwQkEsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7b0JBRWpDQSxVQUFVQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTt5QkFDekJBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLFFBQVFBLENBQUNBO3lCQUN2QkEsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsY0FBY0EsR0FBR0Esd0JBQXdCQSxHQUFHQSxHQUFHQSxDQUFDQTt5QkFDbEVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO29CQUVmQSxJQUFJQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFVQSxFQUFFQSxVQUFDQSxDQUFDQTt3QkFDOUJBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO29CQUNmQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDSEEsSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7d0JBQzlCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQTtvQkFDZkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRUhBLDBEQUEwREE7b0JBQzFEQSxJQUFJQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDNUJBLElBQUlBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO29CQUU1QkEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUE7eUJBQ3ZCQSxVQUFVQSxDQUFDQSxDQUFDQSx3QkFBd0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO3lCQUN6Q0EsSUFBSUEsRUFBRUE7eUJBQ05BLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO29CQUV4QkEsSUFBSUEsYUFBYUEsR0FBR0EsZUFBZUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBRTVDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxFQUFFQTt5QkFDbEJBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO3lCQUNiQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQTt5QkFDcEJBLFFBQVFBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO3lCQUNkQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtvQkFFbEJBLFVBQVVBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO3lCQUN6QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsUUFBUUEsQ0FBQ0E7eUJBQ3ZCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFFZkEsSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUE7eUJBQ3JCQSxXQUFXQSxDQUFDQSxVQUFVQSxDQUFDQTt5QkFDdkJBLE9BQU9BLENBQUNBLFVBQUNBLENBQU1BO3dCQUNkQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtvQkFDbEJBLENBQUNBLENBQUNBO3lCQUNEQSxDQUFDQSxDQUFDQSxVQUFDQSxDQUFNQTt3QkFDUkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hDQSxDQUFDQSxDQUFDQTt5QkFDREEsRUFBRUEsQ0FBQ0EsVUFBQ0EsQ0FBTUE7d0JBQ1RBLE1BQU1BLENBQUNBLHdCQUF3QkEsQ0FBQ0E7b0JBQ2xDQSxDQUFDQSxDQUFDQTt5QkFDREEsRUFBRUEsQ0FBQ0EsVUFBQ0EsQ0FBTUE7d0JBQ1RBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUN2QkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRUxBLElBQUlBLFdBQVdBLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBO3lCQUM1QkEsV0FBV0EsQ0FBQ0EsVUFBVUEsQ0FBQ0E7eUJBQ3ZCQSxPQUFPQSxDQUFDQSxVQUFDQSxDQUFNQTt3QkFDZEEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7b0JBQ2xCQSxDQUFDQSxDQUFDQTt5QkFDREEsQ0FBQ0EsQ0FBQ0EsVUFBQ0EsQ0FBTUE7d0JBQ1JBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO29CQUNoQ0EsQ0FBQ0EsQ0FBQ0E7eUJBQ0RBLENBQUNBLENBQUNBLFVBQUNBLENBQU1BO3dCQUNSQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDdkJBLENBQUNBLENBQUNBLENBQUNBO29CQUVMQSxJQUFJQSxlQUFlQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLFVBQVVB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QUFBO0lBRURBO1FBQ0VxRixNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMxQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7b0JBQ1JBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO2dCQUM3QkEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsQ0FBQ0EsS0FBS0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7b0JBQ1JBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO2dCQUN4QkEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsQ0FBQ0EsT0FBT0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7b0JBQ1ZBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO2dCQUN4QkEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsQ0FBQ0EsT0FBT0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7b0JBQ1ZBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO2dCQUN0QkEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsQ0FBQ0EsT0FBT0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7b0JBQ1ZBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN6Q0EsQ0FBQ0EsQ0FBQ0E7WUFDRkEsQ0FBQ0EsT0FBT0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7b0JBQ1ZBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO2dCQUMzQkEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7b0JBQ1BBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO2dCQUN0QkEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsQ0FBQ0EsSUFBSUEsRUFBRUE7b0JBQ0xBLE1B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Q0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFVBQUNBLENBQU1BO1lBQ1hBLE1BQU1BLENBQUNBLGlCQUFpQkEsR0FBR0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDcERBLENBQUNBLENBQUNBLEVBRUpBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBO2FBQ3BCQSxXQUFXQSxDQUFDQSxhQUFhQSxDQUFDQTthQUMxQkEsT0FBT0EsQ0FBQ0EsVUFBQ0EsQ0FBTUE7WUFDZEEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsdUJBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsQ0FBQ0EsQ0FBQ0EsVUFBQ0EsQ0FBTUE7WUFDUkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDaENBLENBQUNBLENBQUNBO2FBQ0RBLENBQUNBLENBQUNBLFVBQUNBLENBQU1BO1lBQ1JBLE1BQU1BLENBQUNBLGtCQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMxREEsQ0FBQ0EsQ0FBQ0E7YUFDREEsRUFBRUEsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDaEJBLENBQUNBLENBQUNBLENBQUNBO1FBRVBBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLElBQUlBLFlBQVlBLEdBQUdBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENB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QUlBLEVBQUVBLENBQUNBO1lBQ2JBLENBQUNBLENBQUNBLENBQUNBO1FBQ1BBLENBQUNBO1FBRURGLHVCQUF1QkEsU0FBNEJBO1lBQ2pERyxTQUFTQTtpQkFDTkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0E7aUJBQ3BCQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDZEEsTUFBTUEsQ0FBQ0Esa0JBQVdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLFNBQVNBLEVBQUVBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3hEQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ1hBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQy9DQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ2hCQSxNQUFNQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ25FQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsVUFBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ2xCQSxNQUFNQSxDQUFDQSwyQkFBb0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ25EQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0E7aUJBQ3BCQSxFQUFFQSxDQUFDQSxXQUFXQSxFQUFFQSxVQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDcEJBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxVQUFVQSxFQUFFQTtnQkFDaEJBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1lBQ2JBLENBQUNBLENBQUNBLENBQUNBO1FBRVBBLENBQUNBO1FBRURILHNCQUFzQkEsU0FBNEJBO1lBQ2hESSxTQUFTQTtpQkFDTkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsa0JBQWtCQSxDQUFDQTtpQkFDakNBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBO2dCQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUM5Q0EsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2QkEsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2QkEsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNoQkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDZkEsQ0FBQ0EsQ0FBQ0E7aUJBQ0RBLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ3hCQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNiQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUVESixzQkFBc0JBLFNBQTRCQTtZQUNoREssU0FBU0E7aUJBQ05BLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBO2dCQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEscUJBQXFCQSxDQUFDQTtpQkFDcENBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1lBQzlDQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDaEJBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1lBQ2ZBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQzFCQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNiQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUVQQSxDQUFDQTtRQUVETCx1QkFBdUJBLFNBQTRCQTtZQUNqRE0sU0FBU0E7aUJBQ05BLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBO2dCQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsbUJBQW1CQSxDQUFDQTtpQkFDbENBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2xEQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbERBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7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Q0EsQ0FBQ0E7WUFDMURBLENBQUNBLENBQUNBO2lCQUNEQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQTtnQkFDYkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDbkJBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFdBQVdBLEVBQUVBLFVBQUNBLENBQUNBLEVBQUVBLENBQUNBO2dCQUN0QkEsaUJBQWlCQTtZQUNuQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsRUFBRUE7Z0JBQ2hCQSxhQUFhQTtZQUNmQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNMQSxlQUFlQTtZQUNmQSxZQUFZQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtpQkFDbENBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBO2dCQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxDQUFDQSxDQUFDQTtpQkFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsUUFBUUEsQ0FBQ0E7aUJBQ3ZCQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQTtpQkFDWkEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLENBQUNBLENBQUNBO2lCQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0Esa0JBQVdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFEQSxDQUFDQSxDQUFDQTtpQkFDREEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUE7Z0JBQ2JBLE1BQU1BLENB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c0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ2hCQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNoQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDTEEsZUFBZUE7UUFDZkEscUJBQXFCQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTthQUN6Q0EsTUFBTUEsQ0FBQ0EsVUFBQ0EsQ0FBQ0E7WUFDUkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsdUJBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsdUJBQXVCQSxDQUFDQTthQUN0Q0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsNkJBQXNCQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNoQkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDaEJBLENBQUNBLENBQUNBLENBQUNBO1FBQ0xBLGtCQUFrQkE7UUFDbEJBLHFCQUFxQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7UUFFdENBLElBQUlBLG1CQUFtQkEsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNoRkEsa0JBQWtCQTtRQUNsQkEsbUJBQW1CQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxxQkFBcUJBLENBQUNBO2FBQ3JEQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQSxDQUFDQSx1QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xEQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSw2QkFBc0JBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xEQSxDQUFDQSxDQUFDQTthQUNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ2hCQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNoQkEsQ0FBQ0EsQ0FBQ0E7YUFDREEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsVUFBQ0EsQ0FBQ0E7WUFDdEJBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBQ2ZBLENBQUNBLENBQUNBLENBQUNBO1FBQ0xBLGVBQWVBO1FBQ2ZBLG1CQUFtQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7YUFDdkNBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBO1lBQ1JBLE1BQU1BLENBQUNBLENBQUNBLHVCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBLENBQUNBO2FBQ0RBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLHFCQUFxQkEsQ0FBQ0E7YUFDcENBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLENBQUNBO1lBQ1pBLE1BQU1BLENBQUNBLDZCQUFzQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FB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Q0FBQ0E7UUFDTEEsa0JBQWtCQTtRQUNsQkEsZ0JBQWdCQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtJQUVuQ0EsQ0FBQ0E7SUF4UGVyRyw2QkFBc0JBLHlCQXdQckNBLENBQUFBO0FBRUhBLENBQUNBLEVBL1BTLE1BQU0sS0FBTixNQUFNLFFBK1BmIiwiZmlsZSI6Imhhd2t1bGFyLWNoYXJ0cy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG5hbWUgIGhhd2t1bGFyLWNoYXJ0c1xuICpcbiAqIEBkZXNjcmlwdGlvblxuICogICBCYXNlIG1vZHVsZSBmb3IgaGF3a3VsYXItY2hhcnRzLlxuICpcbiAqL1xuYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycsIFtdKTtcbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG4gIC8qKlxuICAgKiBEZWZpbmVzIGFuIGluZGl2aWR1YWwgYWxlcnQgYm91bmRzICB0byBiZSB2aXN1YWxseSBoaWdobGlnaHRlZCBpbiBhIGNoYXJ0XG4gICAqIHRoYXQgYW4gYWxlcnQgd2FzIGFib3ZlL2JlbG93IGEgdGhyZXNob2xkLlxuICAgKi9cbiAgZXhwb3J0IGNsYXNzIEFsZXJ0Qm91bmQge1xuICAgIHB1YmxpYyBzdGFydERhdGU6IERhdGU7XG4gICAgcHVibGljIGVuZERhdGU6IERhdGU7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgc3RhcnRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgIHB1YmxpYyBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgIHB1YmxpYyBhbGVydFZhbHVlOiBudW1iZXIpIHtcbiAgICAgIHRoaXMuc3RhcnREYXRlID0gbmV3IERhdGUoc3RhcnRUaW1lc3RhbXApO1xuICAgICAgdGhpcy5lbmREYXRlID0gbmV3IERhdGUoZW5kVGltZXN0YW1wKTtcbiAgICB9XG5cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBhbGVydFZhbHVlOiBudW1iZXIpIHtcbiAgICBsZXQgbGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgIC5pbnRlcnBvbGF0ZSgnbW9ub3RvbmUnKVxuICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB5U2NhbGUoYWxlcnRWYWx1ZSk7XG4gICAgICB9KTtcblxuICAgIHJldHVybiBsaW5lO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFsZXJ0TGluZShzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcixcbiAgICBjc3NDbGFzc05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGxldCBwYXRoQWxlcnRMaW5lID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5hbGVydExpbmUnKS5kYXRhKFtjaGFydERhdGFdKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBwYXRoQWxlcnRMaW5lLmF0dHIoJ2NsYXNzJywgY3NzQ2xhc3NOYW1lKVxuICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVBbGVydExpbmVEZWYodGltZVNjYWxlLCB5U2NhbGUsIGFsZXJ0VmFsdWUpKTtcblxuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIHBhdGhBbGVydExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgLmF0dHIoJ2NsYXNzJywgY3NzQ2xhc3NOYW1lKVxuICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVBbGVydExpbmVEZWYodGltZVNjYWxlLCB5U2NhbGUsIGFsZXJ0VmFsdWUpKTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHBhdGhBbGVydExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RBbGVydFJhbmdlcyhjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCB0aHJlc2hvbGQ6IEFsZXJ0VGhyZXNob2xkKTogQWxlcnRCb3VuZFtdIHtcbiAgICBsZXQgYWxlcnRCb3VuZEFyZWFJdGVtczogQWxlcnRCb3VuZFtdO1xuICAgIGxldCBzdGFydFBvaW50czogbnVtYmVyW107XG5cbiAgICBmdW5jdGlvbiBmaW5kU3RhcnRQb2ludHMoY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSwgdGhyZXNob2xkOiBBbGVydFRocmVzaG9sZCkge1xuICAgICAgbGV0IHN0YXJ0UG9pbnRzID0gW107XG4gICAgICBsZXQgcHJldkl0ZW06IElDaGFydERhdGFQb2ludDtcblxuICAgICAgY2hhcnREYXRhLmZvckVhY2goKGNoYXJ0SXRlbTogSUNoYXJ0RGF0YVBvaW50LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgaWYgKGkgPT09IDAgJiYgY2hhcnRJdGVtLmF2ZyA+IHRocmVzaG9sZCkge1xuICAgICAgICAgIHN0YXJ0UG9pbnRzLnB1c2goaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHJldkl0ZW0gPSBjaGFydERhdGFbaSAtIDFdO1xuICAgICAgICAgIGlmIChjaGFydEl0ZW0uYXZnID4gdGhyZXNob2xkICYmIHByZXZJdGVtICYmICghcHJldkl0ZW0uYXZnIHx8IHByZXZJdGVtLmF2ZyA8PSB0aHJlc2hvbGQpKSB7XG4gICAgICAgICAgICBzdGFydFBvaW50cy5wdXNoKHByZXZJdGVtLmF2ZyA/IChpIC0gMSkgOiBpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgfSk7XG4gICAgICByZXR1cm4gc3RhcnRQb2ludHM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleChzdGFydFBvaW50czogbnVtYmVyW10sIHRocmVzaG9sZDogQWxlcnRUaHJlc2hvbGQpOiBBbGVydEJvdW5kW10ge1xuICAgICAgbGV0IGFsZXJ0Qm91bmRBcmVhSXRlbXM6IEFsZXJ0Qm91bmRbXSA9IFtdO1xuICAgICAgbGV0IGN1cnJlbnRJdGVtOiBJQ2hhcnREYXRhUG9pbnQ7XG4gICAgICBsZXQgbmV4dEl0ZW06IElDaGFydERhdGFQb2ludDtcbiAgICAgIGxldCBzdGFydEl0ZW06IElDaGFydERhdGFQb2ludDtcblxuICAgICAgc3RhcnRQb2ludHMuZm9yRWFjaCgoc3RhcnRQb2ludEluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgc3RhcnRJdGVtID0gY2hhcnREYXRhW3N0YXJ0UG9pbnRJbmRleF07XG5cbiAgICAgICAgZm9yIChsZXQgaiA9IHN0YXJ0UG9pbnRJbmRleDsgaiA8IGNoYXJ0RGF0YS5sZW5ndGggLSAxOyBqKyspIHtcbiAgICAgICAgICBjdXJyZW50SXRlbSA9IGNoYXJ0RGF0YVtqXTtcbiAgICAgICAgICBuZXh0SXRlbSA9IGNoYXJ0RGF0YVtqICsgMV07XG5cbiAgICAgICAgICBpZiAoKGN1cnJlbnRJdGVtLmF2ZyA+IHRocmVzaG9sZCAmJiBuZXh0SXRlbS5hdmcgPD0gdGhyZXNob2xkKVxuICAgICAgICAgICAgfHwgKGN1cnJlbnRJdGVtLmF2ZyA+IHRocmVzaG9sZCAmJiAhbmV4dEl0ZW0uYXZnKSkge1xuICAgICAgICAgICAgYWxlcnRCb3VuZEFyZWFJdGVtcy5wdXNoKG5ldyBBbGVydEJvdW5kKHN0YXJ0SXRlbS50aW1lc3RhbXAsXG4gICAgICAgICAgICAgIG5leHRJdGVtLmF2ZyA/IG5leHRJdGVtLnRpbWVzdGFtcCA6IGN1cnJlbnRJdGVtLnRpbWVzdGFtcCwgdGhyZXNob2xkKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLy8gbWVhbnMgdGhlIGxhc3QgcGllY2UgZGF0YSBpcyBhbGwgYWJvdmUgdGhyZXNob2xkLCB1c2UgbGFzdCBkYXRhIHBvaW50XG4gICAgICBpZiAoYWxlcnRCb3VuZEFyZWFJdGVtcy5sZW5ndGggPT09IChzdGFydFBvaW50cy5sZW5ndGggLSAxKSkge1xuICAgICAgICBhbGVydEJvdW5kQXJlYUl0ZW1zLnB1c2gobmV3IEFsZXJ0Qm91bmQoY2hhcnREYXRhW3N0YXJ0UG9pbnRzW3N0YXJ0UG9pbnRzLmxlbmd0aCAtIDFdXS50aW1lc3RhbXAsXG4gICAgICAgICAgY2hhcnREYXRhW2NoYXJ0RGF0YS5sZW5ndGggLSAxXS50aW1lc3RhbXAsIHRocmVzaG9sZCkpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYWxlcnRCb3VuZEFyZWFJdGVtcztcbiAgICB9XG5cbiAgICBzdGFydFBvaW50cyA9IGZpbmRTdGFydFBvaW50cyhjaGFydERhdGEsIHRocmVzaG9sZCk7XG5cbiAgICBhbGVydEJvdW5kQXJlYUl0ZW1zID0gZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleChzdGFydFBvaW50cywgdGhyZXNob2xkKTtcblxuICAgIHJldHVybiBhbGVydEJvdW5kQXJlYUl0ZW1zO1xuXG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlQWxlcnRCb3VuZHNBcmVhKHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGhlaWdodDogbnVtYmVyLFxuICAgIGhpZ2hCb3VuZDogbnVtYmVyLFxuICAgIGFsZXJ0Qm91bmRzOiBBbGVydEJvdW5kW10pIHtcbiAgICBsZXQgcmVjdEFsZXJ0ID0gc3ZnLnNlbGVjdCgnZy5hbGVydEhvbGRlcicpLnNlbGVjdEFsbCgncmVjdC5hbGVydEJvdW5kcycpLmRhdGEoYWxlcnRCb3VuZHMpO1xuXG4gICAgZnVuY3Rpb24gYWxlcnRCb3VuZGluZ1JlY3Qoc2VsZWN0aW9uKSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2FsZXJ0Qm91bmRzJylcbiAgICAgICAgLmF0dHIoJ3gnLCAoZDogQWxlcnRCb3VuZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC5zdGFydFRpbWVzdGFtcCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5JywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoaGlnaEJvdW5kKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkOiBBbGVydEJvdW5kKSA9PiB7XG4gICAgICAgICAgLy8vQHRvZG86IG1ha2UgdGhlIGhlaWdodCBhZGp1c3RhYmxlXG4gICAgICAgICAgLy9yZXR1cm4gMTg1O1xuICAgICAgICAgIHJldHVybiBoZWlnaHQ7XG4gICAgICAgICAgLy9yZXR1cm4geVNjYWxlKDApIC0gaGVpZ2h0O1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignd2lkdGgnLCAoZDogQWxlcnRCb3VuZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC5lbmRUaW1lc3RhbXApIC0gdGltZVNjYWxlKGQuc3RhcnRUaW1lc3RhbXApO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICByZWN0QWxlcnQuY2FsbChhbGVydEJvdW5kaW5nUmVjdCk7XG5cbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICByZWN0QWxlcnQuZW50ZXIoKVxuICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAuY2FsbChhbGVydEJvdW5kaW5nUmVjdCk7XG5cbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICByZWN0QWxlcnQuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGRlY2xhcmUgbGV0IGQzOiBhbnk7XG5cbiAgY29uc3QgX21vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKTtcblxuICBleHBvcnQgY2xhc3MgQXZhaWxTdGF0dXMge1xuXG4gICAgcHVibGljIHN0YXRpYyBVUCA9ICd1cCc7XG4gICAgcHVibGljIHN0YXRpYyBET1dOID0gJ2Rvd24nO1xuICAgIHB1YmxpYyBzdGF0aWMgVU5LTk9XTiA9ICd1bmtub3duJztcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAvLyBlbXB0eVxuICAgIH1cblxuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgcmV0dXJuIHRoaXMudmFsdWU7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgaXMgdGhlIGlucHV0IGRhdGEgZm9ybWF0LCBkaXJlY3RseSBmcm9tIE1ldHJpY3MuXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElBdmFpbERhdGFQb2ludCB7XG4gICAgdGltZXN0YW1wOiBudW1iZXI7XG4gICAgdmFsdWU6IHN0cmluZztcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSB0cmFuc2Zvcm1lZCBvdXRwdXQgZGF0YSBmb3JtYXQuIEZvcm1hdHRlZCB0byB3b3JrIHdpdGggYXZhaWxhYmlsaXR5IGNoYXJ0IChiYXNpY2FsbHkgYSBEVE8pLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCB7XG4gICAgc3RhcnQ6IG51bWJlcjtcbiAgICBlbmQ6IG51bWJlcjtcbiAgICB2YWx1ZTogc3RyaW5nO1xuICAgIHN0YXJ0RGF0ZT86IERhdGU7IC8vLyBNYWlubHkgZm9yIGRlYnVnZ2VyIGh1bWFuIHJlYWRhYmxlIGRhdGVzIGluc3RlYWQgb2YgYSBudW1iZXJcbiAgICBlbmREYXRlPzogRGF0ZTtcbiAgICBkdXJhdGlvbj86IHN0cmluZztcbiAgICBtZXNzYWdlPzogc3RyaW5nO1xuICB9XG5cbiAgZXhwb3J0IGNsYXNzIFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQgaW1wbGVtZW50cyBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCB7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgc3RhcnQ6IG51bWJlcixcbiAgICAgIHB1YmxpYyBlbmQ6IG51bWJlcixcbiAgICAgIHB1YmxpYyB2YWx1ZTogc3RyaW5nLFxuICAgICAgcHVibGljIHN0YXJ0RGF0ZT86IERhdGUsXG4gICAgICBwdWJsaWMgZW5kRGF0ZT86IERhdGUsXG4gICAgICBwdWJsaWMgZHVyYXRpb24/OiBzdHJpbmcsXG4gICAgICBwdWJsaWMgbWVzc2FnZT86IHN0cmluZykge1xuXG4gICAgICB0aGlzLmR1cmF0aW9uID0gbW9tZW50KGVuZCkuZnJvbShtb21lbnQoc3RhcnQpLCB0cnVlKTtcbiAgICAgIHRoaXMuc3RhcnREYXRlID0gbmV3IERhdGUoc3RhcnQpO1xuICAgICAgdGhpcy5lbmREYXRlID0gbmV3IERhdGUoZW5kKTtcbiAgICB9XG5cbiAgfVxuXG4gIGV4cG9ydCBjbGFzcyBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZSB7XG5cbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfSEVJR0hUID0gMTUwO1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9XSURUSCA9IDc1MDtcblxuICAgIHB1YmxpYyByZXN0cmljdCA9ICdFJztcbiAgICBwdWJsaWMgcmVwbGFjZSA9IHRydWU7XG5cbiAgICAvLyBDYW4ndCB1c2UgMS40IGRpcmVjdGl2ZSBjb250cm9sbGVycyBiZWNhdXNlIHdlIG5lZWQgdG8gc3VwcG9ydCAxLjMrXG4gICAgcHVibGljIHNjb3BlID0ge1xuICAgICAgZGF0YTogJz0nLFxuICAgICAgc3RhcnRUaW1lc3RhbXA6ICdAJyxcbiAgICAgIGVuZFRpbWVzdGFtcDogJ0AnLFxuICAgICAgdGltZUxhYmVsOiAnQCcsXG4gICAgICBkYXRlTGFiZWw6ICdAJyxcbiAgICAgIGNoYXJ0VGl0bGU6ICdAJ1xuICAgIH07XG5cbiAgICBwdWJsaWMgbGluazogKHNjb3BlOiBhbnksIGVsZW1lbnQ6IG5nLklBdWdtZW50ZWRKUXVlcnksIGF0dHJzOiBhbnkpID0+IHZvaWQ7XG5cbiAgICBwdWJsaWMgdHJhbnNmb3JtZWREYXRhUG9pbnRzOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdO1xuXG4gICAgY29uc3RydWN0b3IoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpIHtcblxuICAgICAgdGhpcy5saW5rID0gKHNjb3BlLCBlbGVtZW50LCBhdHRycykgPT4ge1xuXG4gICAgICAgIC8vIGRhdGEgc3BlY2lmaWMgdmFyc1xuICAgICAgICBsZXQgc3RhcnRUaW1lc3RhbXA6IG51bWJlciA9ICthdHRycy5zdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICBlbmRUaW1lc3RhbXA6IG51bWJlciA9ICthdHRycy5lbmRUaW1lc3RhbXAsXG4gICAgICAgICAgY2hhcnRIZWlnaHQgPSBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hUO1xuXG4gICAgICAgIC8vIGNoYXJ0IHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IG1hcmdpbiA9IHsgdG9wOiAxMCwgcmlnaHQ6IDUsIGJvdHRvbTogNSwgbGVmdDogOTAgfSxcbiAgICAgICAgICB3aWR0aCA9IEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLl9DSEFSVF9XSURUSCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0LFxuICAgICAgICAgIGFkanVzdGVkQ2hhcnRIZWlnaHQgPSBjaGFydEhlaWdodCAtIDUwLFxuICAgICAgICAgIGhlaWdodCA9IGFkanVzdGVkQ2hhcnRIZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICB0aXRsZUhlaWdodCA9IDMwLFxuICAgICAgICAgIHRpdGxlU3BhY2UgPSAxMCxcbiAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCAtIHRpdGxlSGVpZ2h0IC0gdGl0bGVTcGFjZSxcbiAgICAgICAgICBhZGp1c3RlZENoYXJ0SGVpZ2h0MiA9ICt0aXRsZUhlaWdodCArIHRpdGxlU3BhY2UgKyBtYXJnaW4udG9wLFxuICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgeUF4aXMsXG4gICAgICAgICAgeEF4aXMsXG4gICAgICAgICAgeEF4aXNHcm91cCxcbiAgICAgICAgICBicnVzaCxcbiAgICAgICAgICBicnVzaEdyb3VwLFxuICAgICAgICAgIHRpcCxcbiAgICAgICAgICBjaGFydCxcbiAgICAgICAgICBjaGFydFBhcmVudCxcbiAgICAgICAgICBzdmc7XG5cbiAgICAgICAgZnVuY3Rpb24gYnVpbGRBdmFpbEhvdmVyKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgcmV0dXJuIGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSc+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPlN0YXR1czo8L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZC52YWx1ZS50b1VwcGVyQ2FzZSgpfTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtIGJlZm9yZS1zZXBhcmF0b3InPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz5EdXJhdGlvbjo8L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZC5kdXJhdGlvbn08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5gO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb25lVGltZUNoYXJ0U2V0dXAoKTogdm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG4gICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAuYXR0cigndmlld0JveCcsICcwIDAgNzYwIDE1MCcpLmF0dHIoJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLCAneE1pbllNaW4gbWVldCcpO1xuXG4gICAgICAgICAgdGlwID0gZDMudGlwKClcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdkMy10aXAnKVxuICAgICAgICAgICAgLm9mZnNldChbLTEwLCAwXSlcbiAgICAgICAgICAgIC5odG1sKChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gYnVpbGRBdmFpbEhvdmVyKGQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgd2lkdGggKyBtYXJnaW4ubGVmdCArIG1hcmdpbi5yaWdodClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBpbm5lckNoYXJ0SGVpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywnICsgKGFkanVzdGVkQ2hhcnRIZWlnaHQyKSArICcpJyk7XG5cbiAgICAgICAgICBzdmcuYXBwZW5kKCdkZWZzJylcbiAgICAgICAgICAgIC5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgICAgICAgLmF0dHIoJ2lkJywgJ2RpYWdvbmFsLXN0cmlwZXMnKVxuICAgICAgICAgICAgLmF0dHIoJ3BhdHRlcm5Vbml0cycsICd1c2VyU3BhY2VPblVzZScpXG4gICAgICAgICAgICAuYXR0cigncGF0dGVyblRyYW5zZm9ybScsICdzY2FsZSgwLjcpJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIDQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgNClcbiAgICAgICAgICAgIC5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCAnTS0xLDEgbDIsLTIgTTAsNCBsNCwtNCBNMyw1IGwyLC0yJylcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAnI0I2QjZCNicpXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgMS4yKTtcblxuICAgICAgICAgIHN2Zy5jYWxsKHRpcCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVBdmFpbFNjYWxlKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10pIHtcbiAgICAgICAgICBsZXQgYWRqdXN0ZWRUaW1lUmFuZ2U6IG51bWJlcltdID0gW107XG5cbiAgICAgICAgICBzdGFydFRpbWVzdGFtcCA9ICthdHRycy5zdGFydFRpbWVzdGFtcCB8fFxuICAgICAgICAgICAgZDMubWluKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZC5zdGFydDtcbiAgICAgICAgICAgIH0pIHx8ICttb21lbnQoKS5zdWJ0cmFjdCgxLCAnaG91cicpO1xuXG4gICAgICAgICAgaWYgKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQgJiYgdHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludC5sZW5ndGggPiAwKSB7XG5cbiAgICAgICAgICAgIGFkanVzdGVkVGltZVJhbmdlWzBdID0gc3RhcnRUaW1lc3RhbXA7XG4gICAgICAgICAgICBhZGp1c3RlZFRpbWVSYW5nZVsxXSA9IGVuZFRpbWVzdGFtcCB8fCArbW9tZW50KCk7XG5cbiAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbNzAsIDBdKVxuICAgICAgICAgICAgICAuZG9tYWluKFswLCAxNzVdKTtcblxuICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgIC50aWNrcygwKVxuICAgICAgICAgICAgICAudGlja1NpemUoMCwgMClcbiAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAgIC5kb21haW4oYWRqdXN0ZWRUaW1lUmFuZ2UpO1xuXG4gICAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgLnNjYWxlKHRpbWVTY2FsZSlcbiAgICAgICAgICAgICAgLnRpY2tTaXplKC03MCwgMClcbiAgICAgICAgICAgICAgLm9yaWVudCgndG9wJylcbiAgICAgICAgICAgICAgLnRpY2tGb3JtYXQoeEF4aXNUaW1lRm9ybWF0cygpKTtcblxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGlzVXAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICByZXR1cm4gZC52YWx1ZSA9PT0gQXZhaWxTdGF0dXMuVVAudG9TdHJpbmcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vZnVuY3Rpb24gaXNEb3duKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgIC8vICByZXR1cm4gZC52YWx1ZSA9PT0gQXZhaWxTdGF0dXMuRE9XTi50b1N0cmluZygpO1xuICAgICAgICAvL31cblxuICAgICAgICBmdW5jdGlvbiBpc1Vua25vd24oZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICByZXR1cm4gZC52YWx1ZSA9PT0gQXZhaWxTdGF0dXMuVU5LTk9XTi50b1N0cmluZygpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZm9ybWF0VHJhbnNmb3JtZWREYXRhUG9pbnRzKGluQXZhaWxEYXRhOiBJQXZhaWxEYXRhUG9pbnRbXSk6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10ge1xuICAgICAgICAgIGxldCBvdXRwdXREYXRhOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdID0gW107XG4gICAgICAgICAgbGV0IGl0ZW1Db3VudCA9IGluQXZhaWxEYXRhLmxlbmd0aDtcblxuICAgICAgICAgIGZ1bmN0aW9uIHNvcnRCeVRpbWVzdGFtcChhOiBJQXZhaWxEYXRhUG9pbnQsIGI6IElBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgaWYgKGEudGltZXN0YW1wIDwgYi50aW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGEudGltZXN0YW1wID4gYi50aW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpbkF2YWlsRGF0YS5zb3J0KHNvcnRCeVRpbWVzdGFtcCk7XG5cbiAgICAgICAgICBpZiAoaW5BdmFpbERhdGEgJiYgaXRlbUNvdW50ID4gMCAmJiBpbkF2YWlsRGF0YVswXS50aW1lc3RhbXApIHtcbiAgICAgICAgICAgIGxldCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblxuICAgICAgICAgICAgaWYgKGl0ZW1Db3VudCA9PT0gMSkge1xuICAgICAgICAgICAgICBsZXQgYXZhaWxJdGVtID0gaW5BdmFpbERhdGFbMF07XG5cbiAgICAgICAgICAgICAgLy8gd2Ugb25seSBoYXZlIG9uZSBpdGVtIHdpdGggc3RhcnQgdGltZS4gQXNzdW1lIHVua25vd24gZm9yIHRoZSB0aW1lIGJlZm9yZSAobGFzdCAxaClcbiAgICAgICAgICAgICAgLy8gQFRPRE8gYWRqdXN0IHRvIHRpbWUgcGlja2VyXG4gICAgICAgICAgICAgIG91dHB1dERhdGEucHVzaChuZXcgVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludChub3cgLSA2MCAqIDYwICogMTAwMCxcbiAgICAgICAgICAgICAgICBhdmFpbEl0ZW0udGltZXN0YW1wLCBBdmFpbFN0YXR1cy5VTktOT1dOLnRvU3RyaW5nKCkpKTtcbiAgICAgICAgICAgICAgLy8gYW5kIHRoZSBkZXRlcm1pbmVkIHZhbHVlIHVwIHVudGlsIHRoZSBlbmQuXG4gICAgICAgICAgICAgIG91dHB1dERhdGEucHVzaChuZXcgVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludChhdmFpbEl0ZW0udGltZXN0YW1wLCBub3csIGF2YWlsSXRlbS52YWx1ZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbGV0IGJhY2t3YXJkc0VuZFRpbWUgPSBub3c7XG5cbiAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGluQXZhaWxEYXRhLmxlbmd0aDsgaSA+IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHdlIGhhdmUgZGF0YSBzdGFydGluZyBpbiB0aGUgZnV0dXJlLi4uIGRpc2NhcmQgaXRcbiAgICAgICAgICAgICAgICAvL2lmIChpbkF2YWlsRGF0YVtpIC0gMV0udGltZXN0YW1wID4gK21vbWVudCgpKSB7XG4gICAgICAgICAgICAgICAgLy8gIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIC8vfVxuICAgICAgICAgICAgICAgIGlmIChzdGFydFRpbWVzdGFtcCA+PSBpbkF2YWlsRGF0YVtpIC0gMV0udGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgICAgICBvdXRwdXREYXRhLnB1c2gobmV3IFRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQoc3RhcnRUaW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIGJhY2t3YXJkc0VuZFRpbWUsIGluQXZhaWxEYXRhW2kgLSAxXS52YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIG91dHB1dERhdGEucHVzaChuZXcgVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludChpbkF2YWlsRGF0YVtpIC0gMV0udGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgICBiYWNrd2FyZHNFbmRUaW1lLCBpbkF2YWlsRGF0YVtpIC0gMV0udmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgIGJhY2t3YXJkc0VuZFRpbWUgPSBpbkF2YWlsRGF0YVtpIC0gMV0udGltZXN0YW1wO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gb3V0cHV0RGF0YTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVNpZGVZQXhpc0xhYmVscygpIHtcbiAgICAgICAgICAvLy9AVG9kbzogbW92ZSBvdXQgdG8gc3R5bGVzaGVldFxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ3RleHQnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2YWlsVXBMYWJlbCcpXG4gICAgICAgICAgICAuYXR0cigneCcsIC0xMClcbiAgICAgICAgICAgIC5hdHRyKCd5JywgMjUpXG4gICAgICAgICAgICAuc3R5bGUoJ2ZvbnQtZmFtaWx5JywgJ0FyaWFsLCBWZXJkYW5hLCBzYW5zLXNlcmlmOycpXG4gICAgICAgICAgICAuc3R5bGUoJ2ZvbnQtc2l6ZScsICcxMnB4JylcbiAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgJyM5OTknKVxuICAgICAgICAgICAgLnN0eWxlKCd0ZXh0LWFuY2hvcicsICdlbmQnKVxuICAgICAgICAgICAgLnRleHQoJ1VwJyk7XG5cbiAgICAgICAgICBzdmcuYXBwZW5kKCd0ZXh0JylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmFpbERvd25MYWJlbCcpXG4gICAgICAgICAgICAuYXR0cigneCcsIC0xMClcbiAgICAgICAgICAgIC5hdHRyKCd5JywgNTUpXG4gICAgICAgICAgICAuc3R5bGUoJ2ZvbnQtZmFtaWx5JywgJ0FyaWFsLCBWZXJkYW5hLCBzYW5zLXNlcmlmOycpXG4gICAgICAgICAgICAuc3R5bGUoJ2ZvbnQtc2l6ZScsICcxMnB4JylcbiAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgJyM5OTknKVxuICAgICAgICAgICAgLnN0eWxlKCd0ZXh0LWFuY2hvcicsICdlbmQnKVxuICAgICAgICAgICAgLnRleHQoJ0Rvd24nKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSkge1xuICAgICAgICAgIC8vbGV0IHhBeGlzTWluID0gZDMubWluKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgIC8vICByZXR1cm4gK2Quc3RhcnQ7XG4gICAgICAgICAgLy99KSxcbiAgICAgICAgICBsZXQgeEF4aXNNYXggPSBkMy5tYXgodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCwgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gK2QuZW5kO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IGF2YWlsVGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoXSlcbiAgICAgICAgICAgIC5kb21haW4oW3N0YXJ0VGltZXN0YW1wLCBlbmRUaW1lc3RhbXAgfHwgeEF4aXNNYXhdKSxcblxuICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgLmNsYW1wKHRydWUpXG4gICAgICAgICAgICAgIC5yYW5nZShbaGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihbMCwgNF0pO1xuXG4gICAgICAgICAgLy9hdmFpbFhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgIC8vICAuc2NhbGUoYXZhaWxUaW1lU2NhbGUpXG4gICAgICAgICAgLy8gIC50aWNrcyg4KVxuICAgICAgICAgIC8vICAudGlja1NpemUoMTMsIDApXG4gICAgICAgICAgLy8gIC5vcmllbnQoJ3RvcCcpO1xuXG4gICAgICAgICAgLy8gRm9yIGVhY2ggZGF0YXBvaW50IGNhbGN1bGF0ZSB0aGUgWSBvZmZzZXQgZm9yIHRoZSBiYXJcbiAgICAgICAgICAvLyBVcCBvciBVbmtub3duOiBvZmZzZXQgMCwgRG93bjogb2Zmc2V0IDM1XG4gICAgICAgICAgZnVuY3Rpb24gY2FsY0JhclkoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBoZWlnaHQgLSB5U2NhbGUoMCkgKyAoKGlzVXAoZCkgfHwgaXNVbmtub3duKGQpKSA/IDAgOiAzNSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gRm9yIGVhY2ggZGF0YXBvaW50IGNhbGN1bGF0ZSB0aGUgWSByZW1vdmVkIGhlaWdodCBmb3IgdGhlIGJhclxuICAgICAgICAgIC8vIFVua25vd246IGZ1bGwgaGVpZ2h0IDE1LCBVcCBvciBEb3duOiBoYWxmIGhlaWdodCwgNTBcbiAgICAgICAgICBmdW5jdGlvbiBjYWxjQmFySGVpZ2h0KGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgICByZXR1cm4geVNjYWxlKDApIC0gKGlzVW5rbm93bihkKSA/IDE1IDogNTApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNhbGNCYXJGaWxsKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgICBpZiAoaXNVcChkKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJyM1NEEyNEUnOyAvLyBncmVlblxuICAgICAgICAgICAgfSBlbHNlIGlmIChpc1Vua25vd24oZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICd1cmwoI2RpYWdvbmFsLXN0cmlwZXMpJzsgLy8gZ3JheSBzdHJpcGVzXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gJyNEODUwNTQnOyAvLyByZWRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdyZWN0LmF2YWlsQmFycycpXG4gICAgICAgICAgICAuZGF0YSh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KVxuICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmFpbEJhcnMnKVxuICAgICAgICAgICAgLmF0dHIoJ3gnLCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGF2YWlsVGltZVNjYWxlKCtkLnN0YXJ0KTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cigneScsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gY2FsY0JhclkoZCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBjYWxjQmFySGVpZ2h0KGQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgZEVuZCA9IGVuZFRpbWVzdGFtcCA/IChNYXRoLm1pbigrZC5lbmQsIGVuZFRpbWVzdGFtcCkpIDogKCtkLmVuZCk7XG4gICAgICAgICAgICAgIHJldHVybiBhdmFpbFRpbWVTY2FsZShkRW5kKSAtIGF2YWlsVGltZVNjYWxlKCtkLnN0YXJ0KTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignZmlsbCcsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gY2FsY0JhckZpbGwoZCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAwLjg1O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLm9uKCdtb3VzZWRvd24nLCAoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBicnVzaEVsZW0gPSBzdmcuc2VsZWN0KCcuYnJ1c2gnKS5ub2RlKCk7XG4gICAgICAgICAgICAgIGxldCBjbGlja0V2ZW50OiBhbnkgPSBuZXcgRXZlbnQoJ21vdXNlZG93bicpO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VYID0gZDMuZXZlbnQucGFnZVg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WCA9IGQzLmV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVkgPSBkMy5ldmVudC5wYWdlWTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRZID0gZDMuZXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgYnJ1c2hFbGVtLmRpc3BhdGNoRXZlbnQoY2xpY2tFdmVudCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLm9uKCdtb3VzZXVwJywgKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgYnJ1c2hFbGVtID0gc3ZnLnNlbGVjdCgnLmJydXNoJykubm9kZSgpO1xuICAgICAgICAgICAgICBsZXQgY2xpY2tFdmVudDogYW55ID0gbmV3IEV2ZW50KCdtb3VzZXVwJyk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVggPSBkMy5ldmVudC5wYWdlWDtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRYID0gZDMuZXZlbnQuY2xpZW50WDtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWSA9IGQzLmV2ZW50LnBhZ2VZO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFkgPSBkMy5ldmVudC5jbGllbnRZO1xuICAgICAgICAgICAgICBicnVzaEVsZW0uZGlzcGF0Y2hFdmVudChjbGlja0V2ZW50KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gVGhlIGJvdHRvbSBsaW5lIG9mIHRoZSBhdmFpbGFiaWxpdHkgY2hhcnRcbiAgICAgICAgICBzdmcuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAgIC5hdHRyKCd4MScsIDApXG4gICAgICAgICAgICAuYXR0cigneTEnLCA3MClcbiAgICAgICAgICAgIC5hdHRyKCd4MicsIDY1NSlcbiAgICAgICAgICAgIC5hdHRyKCd5MicsIDcwKVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIDAuNSlcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAnI0QwRDBEMCcpO1xuXG4gICAgICAgICAgY3JlYXRlU2lkZVlBeGlzTGFiZWxzKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVYYW5kWUF4ZXMoKSB7XG5cbiAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgIC8vIGNyZWF0ZSB4LWF4aXNcbiAgICAgICAgICB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneCBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHhBeGlzKTtcblxuICAgICAgICAgIC8vIGNyZWF0ZSB5LWF4aXNcbiAgICAgICAgICBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd5IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeUF4aXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWEF4aXNCcnVzaCgpIHtcblxuICAgICAgICAgIGJydXNoID0gZDMuc3ZnLmJydXNoKClcbiAgICAgICAgICAgIC54KHRpbWVTY2FsZSlcbiAgICAgICAgICAgIC5vbignYnJ1c2hzdGFydCcsIGJydXNoU3RhcnQpXG4gICAgICAgICAgICAub24oJ2JydXNoZW5kJywgYnJ1c2hFbmQpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JydXNoJylcbiAgICAgICAgICAgIC5jYWxsKGJydXNoKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCcucmVzaXplJykuYXBwZW5kKCdwYXRoJyk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgNzApO1xuXG4gICAgICAgICAgZnVuY3Rpb24gYnJ1c2hTdGFydCgpIHtcbiAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCB0cnVlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBicnVzaEVuZCgpIHtcbiAgICAgICAgICAgIGxldCBleHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMF0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgZW5kVGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzFdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgICAgIC8vc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsICFkMy5ldmVudC50YXJnZXQuZW1wdHkoKSk7XG4gICAgICAgICAgICBpZiAoZHJhZ1NlbGVjdGlvbkRlbHRhID49IDYwMDAwKSB7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChFdmVudE5hbWVzLkFWQUlMX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGV4dGVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2guY2xlYXIoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignZGF0YScsIChuZXdEYXRhKSA9PiB7XG4gICAgICAgICAgaWYgKG5ld0RhdGEpIHtcbiAgICAgICAgICAgIHRoaXMudHJhbnNmb3JtZWREYXRhUG9pbnRzID0gZm9ybWF0VHJhbnNmb3JtZWREYXRhUG9pbnRzKGFuZ3VsYXIuZnJvbUpzb24obmV3RGF0YSkpO1xuICAgICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMudHJhbnNmb3JtZWREYXRhUG9pbnRzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLiR3YXRjaEdyb3VwKFsnc3RhcnRUaW1lc3RhbXAnLCAnZW5kVGltZXN0YW1wJ10sIChuZXdUaW1lc3RhbXApID0+IHtcbiAgICAgICAgICBzdGFydFRpbWVzdGFtcCA9ICtuZXdUaW1lc3RhbXBbMF0gfHwgc3RhcnRUaW1lc3RhbXA7XG4gICAgICAgICAgZW5kVGltZXN0YW1wID0gK25ld1RpbWVzdGFtcFsxXSB8fCBlbmRUaW1lc3RhbXA7XG4gICAgICAgICAgc2NvcGUucmVuZGVyKHRoaXMudHJhbnNmb3JtZWREYXRhUG9pbnRzKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUucmVuZGVyID0gKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10pID0+IHtcbiAgICAgICAgICBpZiAodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCAmJiB0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vY29uc29sZS50aW1lKCdhdmFpbENoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAvLy9OT1RFOiBsYXllcmluZyBvcmRlciBpcyBpbXBvcnRhbnQhXG4gICAgICAgICAgICBvbmVUaW1lQ2hhcnRTZXR1cCgpO1xuICAgICAgICAgICAgZGV0ZXJtaW5lQXZhaWxTY2FsZSh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KTtcbiAgICAgICAgICAgIGNyZWF0ZVhhbmRZQXhlcygpO1xuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuICAgICAgICAgICAgY3JlYXRlQXZhaWxhYmlsaXR5Q2hhcnQodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCk7XG4gICAgICAgICAgICAvL2NvbnNvbGUudGltZUVuZCgnYXZhaWxDaGFydFJlbmRlcicpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcHVibGljIHN0YXRpYyBGYWN0b3J5KCkge1xuICAgICAgbGV0IGRpcmVjdGl2ZSA9ICgkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlKCRyb290U2NvcGUpO1xuICAgICAgfTtcblxuICAgICAgZGlyZWN0aXZlWyckaW5qZWN0J10gPSBbJyRyb290U2NvcGUnXTtcblxuICAgICAgcmV0dXJuIGRpcmVjdGl2ZTtcbiAgICB9XG5cbiAgfVxuXG4gIF9tb2R1bGUuZGlyZWN0aXZlKCdhdmFpbGFiaWxpdHlDaGFydCcsIEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLkZhY3RvcnkoKSk7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBjb25zdCBfbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycpO1xuXG5cbiAgZXhwb3J0IGNsYXNzIENvbnRleHRDaGFydERpcmVjdGl2ZSB7XG5cbiAgICAvLyB0aGVzZSBhcmUganVzdCBzdGFydGluZyBwYXJhbWV0ZXIgaGludHNcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfV0lEVEhfSElOVCA9IDc1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfSEVJR0hUX0hJTlQgPSA1MDtcbiAgICBwcml2YXRlIHN0YXRpYyBfWEFYSVNfSEVJR0hUID0gMTU7XG5cbiAgICBwdWJsaWMgcmVzdHJpY3QgPSAnRSc7XG4gICAgcHVibGljIHJlcGxhY2UgPSB0cnVlO1xuXG4gICAgLy8gQ2FuJ3QgdXNlIDEuNCBkaXJlY3RpdmUgY29udHJvbGxlcnMgYmVjYXVzZSB3ZSBuZWVkIHRvIHN1cHBvcnQgMS4zK1xuICAgIHB1YmxpYyBzY29wZSA9IHtcbiAgICAgIGRhdGE6ICc9JyxcbiAgICAgIHNob3dZQXhpc1ZhbHVlczogJz0nLFxuICAgIH07XG5cbiAgICBwdWJsaWMgbGluazogKHNjb3BlOiBhbnksIGVsZW1lbnQ6IG5nLklBdWdtZW50ZWRKUXVlcnksIGF0dHJzOiBhbnkpID0+IHZvaWQ7XG5cbiAgICBwdWJsaWMgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W107XG5cbiAgICBjb25zdHJ1Y3Rvcigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgY29uc3QgbWFyZ2luID0geyB0b3A6IDAsIHJpZ2h0OiA1LCBib3R0b206IDUsIGxlZnQ6IDkwIH07XG5cbiAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBjaGFydEhlaWdodCA9IENvbnRleHRDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hUX0hJTlQsXG4gICAgICAgICAgd2lkdGggPSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIX0hJTlQgLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodCxcbiAgICAgICAgICBoZWlnaHQgPSBjaGFydEhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tLFxuICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tIC0gMTUsXG4gICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AsXG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzOiBib29sZWFuLFxuICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB5QXhpc0dyb3VwLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGJydXNoLFxuICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgc3ZnO1xuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuc2hvd1lBeGlzVmFsdWVzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlcyA9IGF0dHJzLnNob3dZQXhpc1ZhbHVlcyA9PT0gJ3RydWUnO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcmVzaXplKCk6IHZvaWQge1xuICAgICAgICAgIC8vIGRlc3Ryb3kgYW55IHByZXZpb3VzIGNoYXJ0c1xuICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuXG4gICAgICAgICAgY29uc29sZS5kaXIoZWxlbWVudFswXSk7XG4gICAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGVsZW1lbnRbMF0ucGFyZW50Tm9kZTtcblxuICAgICAgICAgIHdpZHRoID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50V2lkdGg7XG4gICAgICAgICAgaGVpZ2h0ID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50SGVpZ2h0O1xuXG4gICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20gLSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX1hBWElTX0hFSUdIVCxcblxuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnQ29udGV4dCBXaWR0aDogJWknLHdpZHRoKTtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ0NvbnRleHQgSGVpZ2h0OiAlaScsaGVpZ2h0KTtcblxuICAgICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3A7XG5cbiAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywgMCknKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRDaGFydCcpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVDb250ZXh0Q2hhcnQoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICAgICAgICAvL2NvbnNvbGUud2FybignZGF0YVBvaW50cy5sZW5ndGg6ICcgKyBkYXRhUG9pbnRzLmxlbmd0aCk7XG5cbiAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGggLSAxMF0pXG4gICAgICAgICAgICAubmljZSgpXG4gICAgICAgICAgICAuZG9tYWluKFtkYXRhUG9pbnRzWzBdLnRpbWVzdGFtcCwgZGF0YVBvaW50c1tkYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcF0pO1xuXG4gICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgLnRpY2tTaXplKDQsIDApXG4gICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAub3JpZW50KCdib3R0b20nKTtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgwLCcgKyBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgKyAnKScpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICBsZXQgeU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCB5TWF4ID0gZDMubWF4KGRhdGFQb2ludHMsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBnaXZlIGEgcGFkIG9mICUgdG8gbWluL21heCBzbyB3ZSBhcmUgbm90IGFnYWluc3QgeC1heGlzXG4gICAgICAgICAgeU1heCA9IHlNYXggKyAoeU1heCAqIDAuMDMpO1xuICAgICAgICAgIHlNaW4gPSB5TWluIC0gKHlNaW4gKiAwLjA1KTtcblxuICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAucmFuZ2VSb3VuZChbbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCAwXSlcbiAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgIC5kb21haW4oW3lNaW4sIHlNYXhdKTtcblxuICAgICAgICAgIGxldCBudW1iZXJPZlRpY2tzID0gc2hvd1lBeGlzVmFsdWVzID8gMiA6IDA7XG5cbiAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAudGlja3MobnVtYmVyT2ZUaWNrcylcbiAgICAgICAgICAgIC50aWNrU2l6ZSg0LCAwKVxuICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgeUF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh5QXhpcyk7XG5cbiAgICAgICAgICBsZXQgYXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgICAgIC5pbnRlcnBvbGF0ZSgnY2FyZGluYWwnKVxuICAgICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gIWQuZW1wdHk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55MSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgY29udGV4dExpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAuaW50ZXJwb2xhdGUoJ2NhcmRpbmFsJylcbiAgICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IHBhdGhDb250ZXh0TGluZSA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGguY29udGV4dExpbmUnKS5kYXRhKFtkYXRhUG9pbnRzXSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuYXR0cignY2xhc3MnLCAnY29udGV4dExpbmUnKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBjb250ZXh0TGluZSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRMaW5lJylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5hdHRyKCdkJywgY29udGV4dExpbmUpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgcGF0aENvbnRleHRMaW5lLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIGxldCBjb250ZXh0QXJlYSA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHQnKTtcblxuICAgICAgICAgIGNvbnRleHRBcmVhLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuZGF0dW0oZGF0YVBvaW50cylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5kdXJhdGlvbig1MDApXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dEFyZWEnKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBhcmVhKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWEF4aXNCcnVzaCgpIHtcblxuICAgICAgICAgIGJydXNoID0gZDMuc3ZnLmJydXNoKClcbiAgICAgICAgICAgIC54KHRpbWVTY2FsZSlcbiAgICAgICAgICAgIC5vbignYnJ1c2hzdGFydCcsIGNvbnRleHRCcnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGNvbnRleHRCcnVzaEVuZCk7XG5cbiAgICAgICAgICB4QXhpc0dyb3VwLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCd5JywgMClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBoZWlnaHQgLSAxMCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYnJ1c2gnKVxuICAgICAgICAgICAgLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJy5yZXNpemUnKS5hcHBlbmQoJ3BhdGgnKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBoZWlnaHQgKyAxNyk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBjb250ZXh0QnJ1c2hTdGFydCgpIHtcbiAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCB0cnVlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjb250ZXh0QnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgYnJ1c2hFeHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChicnVzaEV4dGVudFswXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChicnVzaEV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvLy8gV2UgaWdub3JlIGRyYWcgc2VsZWN0aW9ucyB1bmRlciBhIG1pbnV0ZVxuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5DT05URVhUX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGJydXNoRXh0ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vZDMuc2VsZWN0KHdpbmRvdykub24oJ3Jlc2l6ZScsIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpKTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhUG9pbnRzID0gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZnVuY3Rpb24gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChyZXNwb25zZSk6IElDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAvLyAgVGhlIHNjaGVtYSBpcyBkaWZmZXJlbnQgZm9yIGJ1Y2tldGVkIG91dHB1dFxuICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6IElDaGFydERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXMgPSBwb2ludC50aW1lc3RhbXAgfHwgKHBvaW50LnN0YXJ0ICsgKHBvaW50LmVuZCAtIHBvaW50LnN0YXJ0KSAvIDIpO1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wLFxuICAgICAgICAgICAgICAgIC8vZGF0ZTogbmV3IERhdGUodGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQudmFsdWUpID8gdW5kZWZpbmVkIDogcG9pbnQudmFsdWUsXG4gICAgICAgICAgICAgICAgYXZnOiAocG9pbnQuZW1wdHkpID8gdW5kZWZpbmVkIDogcG9pbnQuYXZnLFxuICAgICAgICAgICAgICAgIG1pbjogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWluKSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1pbixcbiAgICAgICAgICAgICAgICBtYXg6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1heCkgPyB1bmRlZmluZWQgOiBwb2ludC5tYXgsXG4gICAgICAgICAgICAgICAgZW1wdHk6IHBvaW50LmVtcHR5XG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS5yZW5kZXIgPSAoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pID0+IHtcbiAgICAgICAgICBpZiAoZGF0YVBvaW50cyAmJiBkYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUudGltZSgnY29udGV4dENoYXJ0UmVuZGVyJyk7XG5cbiAgICAgICAgICAgIC8vL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIHJlc2l6ZSgpO1xuICAgICAgICAgICAgY3JlYXRlQ29udGV4dENoYXJ0KGRhdGFQb2ludHMpO1xuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuICAgICAgICAgICAgY29uc29sZS50aW1lRW5kKCdjb250ZXh0Q2hhcnRSZW5kZXInKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuXG4gICAgfVxuXG4gICAgcHVibGljIHN0YXRpYyBGYWN0b3J5KCkge1xuICAgICAgbGV0IGRpcmVjdGl2ZSA9ICgkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IENvbnRleHRDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnaGF3a3VsYXJDb250ZXh0Q2hhcnQnLCBDb250ZXh0Q2hhcnREaXJlY3RpdmUuRmFjdG9yeSgpKTtcbn1cbiIsIi8vL1xuLy8vIENvcHlyaWdodCAyMDE1IFJlZCBIYXQsIEluYy4gYW5kL29yIGl0cyBhZmZpbGlhdGVzXG4vLy8gYW5kIG90aGVyIGNvbnRyaWJ1dG9ycyBhcyBpbmRpY2F0ZWQgYnkgdGhlIEBhdXRob3IgdGFncy5cbi8vL1xuLy8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy8vXG4vLy8gICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vLy9cbi8vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8vL1xuLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvLy8gTk9URTogdGhpcyBwYXR0ZXJuIGlzIHVzZWQgYmVjYXVzZSBlbnVtcyBjYW50IGJlIHVzZWQgd2l0aCBzdHJpbmdzXG4gIGV4cG9ydCBjbGFzcyBFdmVudE5hbWVzIHtcblxuICAgIHB1YmxpYyBzdGF0aWMgQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnQ2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG4gICAgcHVibGljIHN0YXRpYyBBVkFJTF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdBdmFpbENoYXJ0VGltZVJhbmdlQ2hhbmdlZCcpO1xuICAgIHB1YmxpYyBzdGF0aWMgQ09OVEVYVF9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRCA9IG5ldyBFdmVudE5hbWVzKCdDb250ZXh0Q2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykge1xuICAgICAgLy8gZW1wdHlcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlRGF0YVBvaW50cyhzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICB0aXA6IGFueSxcbiAgICBkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSkge1xuICAgIGxldCByYWRpdXMgPSAxO1xuICAgIGxldCBkb3REYXRhcG9pbnQgPSBzdmcuc2VsZWN0QWxsKCcuZGF0YVBvaW50RG90JykuZGF0YShkYXRhUG9pbnRzKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBkb3REYXRhcG9pbnQuYXR0cignY2xhc3MnLCAnZGF0YVBvaW50RG90JylcbiAgICAgIC5hdHRyKCdyJywgcmFkaXVzKVxuICAgICAgLmF0dHIoJ2N4JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiBkLmF2ZyA/IHlTY2FsZShkLmF2ZykgOiAtOTk5OTk5OTtcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBkb3REYXRhcG9pbnQuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAuYXR0cignY2xhc3MnLCAnZGF0YVBvaW50RG90JylcbiAgICAgIC5hdHRyKCdyJywgcmFkaXVzKVxuICAgICAgLmF0dHIoJ2N4JywgZnVuY3Rpb24oZCkge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiBkLmF2ZyA/IHlTY2FsZShkLmF2ZykgOiAtOTk5OTk5OTtcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgIHRpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBkb3REYXRhcG9pbnQuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICBpbXBvcnQgY3JlYXRlU3ZnRGVmcyA9IENoYXJ0cy5jcmVhdGVTdmdEZWZzO1xuICAndXNlIHN0cmljdCc7XG5cbiAgZGVjbGFyZSBsZXQgZDM6IGFueTtcbiAgZGVjbGFyZSBsZXQgY29uc29sZTogYW55O1xuXG4gIGxldCBkZWJ1ZzogYm9vbGVhbiA9IGZhbHNlO1xuXG4gIC8vIHRoZSBzY2FsZSB0byB1c2UgZm9yIHktYXhpcyB3aGVuIGFsbCB2YWx1ZXMgYXJlIDAsIFswLCBERUZBVUxUX1lfU0NBTEVdXG4gIGV4cG9ydCBjb25zdCBERUZBVUxUX1lfU0NBTEUgPSAxMDtcbiAgZXhwb3J0IGNvbnN0IFhfQVhJU19IRUlHSFQgPSAyNTsgLy8gd2l0aCByb29tIGZvciBsYWJlbFxuICBleHBvcnQgY29uc3QgQ0hBUlRfSEVJR0hUID0gMjUwO1xuICBleHBvcnQgY29uc3QgQ0hBUlRfV0lEVEggPSA3NTA7XG4gIGV4cG9ydCBjb25zdCBIT1ZFUl9EQVRFX1RJTUVfRk9STUFUID0gJ01NL0REL1lZWVkgaDptbSBhJztcbiAgZXhwb3J0IGNvbnN0IEJBUl9PRkZTRVQgPSAyO1xuICBleHBvcnQgY29uc3QgbWFyZ2luID0geyB0b3A6IDEwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA5MCB9O1xuICBleHBvcnQgbGV0IHdpZHRoID0gQ0hBUlRfV0lEVEggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodDtcblxuICAvKipcbiAgICogQG5nZG9jIGRpcmVjdGl2ZVxuICAgKiBAbmFtZSBoYXdrdWxhckNoYXJ0XG4gICAqIEBkZXNjcmlwdGlvbiBBIGQzIGJhc2VkIGNoYXJ0aW5nIGRpcmVjdGlvbiB0byBwcm92aWRlIGNoYXJ0aW5nIHVzaW5nIHZhcmlvdXMgc3R5bGVzIG9mIGNoYXJ0cy5cbiAgICpcbiAgICovXG4gIGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKVxuICAgIC5kaXJlY3RpdmUoJ2hhd2t1bGFyQ2hhcnQnLCBbJyRyb290U2NvcGUnLCAnJGh0dHAnLCAnJGludGVydmFsJywgJyRsb2cnLFxuICAgICAgZnVuY3Rpb24oJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UsXG4gICAgICAgICRodHRwOiBuZy5JSHR0cFNlcnZpY2UsXG4gICAgICAgICRpbnRlcnZhbDogbmcuSUludGVydmFsU2VydmljZSxcbiAgICAgICAgJGxvZzogbmcuSUxvZ1NlcnZpY2UpOiBuZy5JRGlyZWN0aXZlIHtcblxuICAgICAgICBmdW5jdGlvbiBsaW5rKHNjb3BlLCBlbGVtZW50LCBhdHRycykge1xuXG4gICAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgICAgbGV0IGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdID0gW10sXG4gICAgICAgICAgICBtdWx0aURhdGFQb2ludHM6IElNdWx0aURhdGFQb2ludFtdLFxuICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzOiBJU2ltcGxlTWV0cmljW10sXG4gICAgICAgICAgICBkYXRhVXJsID0gYXR0cnMubWV0cmljVXJsLFxuICAgICAgICAgICAgbWV0cmljSWQgPSBhdHRycy5tZXRyaWNJZCB8fCAnJyxcbiAgICAgICAgICAgIG1ldHJpY1RlbmFudElkID0gYXR0cnMubWV0cmljVGVuYW50SWQgfHwgJycsXG4gICAgICAgICAgICBtZXRyaWNUeXBlID0gYXR0cnMubWV0cmljVHlwZSB8fCAnZ2F1Z2UnLFxuICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzID0gK2F0dHJzLnRpbWVSYW5nZUluU2Vjb25kcyB8fCA0MzIwMCxcbiAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyA9ICthdHRycy5yZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgfHwgMzYwMCxcbiAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSArYXR0cnMuYWxlcnRWYWx1ZSxcbiAgICAgICAgICAgIGludGVycG9sYXRpb24gPSBhdHRycy5pbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IERhdGUubm93KCksXG4gICAgICAgICAgICBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gZW5kVGltZXN0YW1wIC0gdGltZVJhbmdlSW5TZWNvbmRzLFxuICAgICAgICAgICAgcHJldmlvdXNSYW5nZURhdGFQb2ludHMgPSBbXSxcbiAgICAgICAgICAgIGFubm90YXRpb25EYXRhID0gW10sXG4gICAgICAgICAgICBjaGFydFR5cGUgPSBhdHRycy5jaGFydFR5cGUgfHwgJ2xpbmUnLFxuICAgICAgICAgICAgc2luZ2xlVmFsdWVMYWJlbCA9IGF0dHJzLnNpbmdsZVZhbHVlTGFiZWwgfHwgJ1JhdyBWYWx1ZScsXG4gICAgICAgICAgICBub0RhdGFMYWJlbCA9IGF0dHJzLm5vRGF0YUxhYmVsIHx8ICdObyBEYXRhJyxcbiAgICAgICAgICAgIGR1cmF0aW9uTGFiZWwgPSBhdHRycy5kdXJhdGlvbkxhYmVsIHx8ICdJbnRlcnZhbCcsXG4gICAgICAgICAgICBtaW5MYWJlbCA9IGF0dHJzLm1pbkxhYmVsIHx8ICdNaW4nLFxuICAgICAgICAgICAgbWF4TGFiZWwgPSBhdHRycy5tYXhMYWJlbCB8fCAnTWF4JyxcbiAgICAgICAgICAgIGF2Z0xhYmVsID0gYXR0cnMuYXZnTGFiZWwgfHwgJ0F2ZycsXG4gICAgICAgICAgICB0aW1lc3RhbXBMYWJlbCA9IGF0dHJzLnRpbWVzdGFtcExhYmVsIHx8ICdUaW1lc3RhbXAnLFxuICAgICAgICAgICAgc2hvd0F2Z0xpbmUgPSB0cnVlLFxuICAgICAgICAgICAgc2hvd0RhdGFQb2ludHMgPSBmYWxzZSxcbiAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzID0gZmFsc2UsXG4gICAgICAgICAgICB1c2VaZXJvTWluVmFsdWUgPSBmYWxzZTtcblxuICAgICAgICAgIC8vIGNoYXJ0IHNwZWNpZmljIHZhcnNcblxuICAgICAgICAgIGxldCBoZWlnaHQsXG4gICAgICAgICAgICBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsXG4gICAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCArIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgICBjaGFydERhdGEsXG4gICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgICAgdGlwLFxuICAgICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgICBicnVzaEdyb3VwLFxuICAgICAgICAgICAgY2hhcnQsXG4gICAgICAgICAgICBjaGFydFBhcmVudCxcbiAgICAgICAgICAgIHN2ZyxcbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4sXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgcGVhayxcbiAgICAgICAgICAgIG1pbixcbiAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEsXG4gICAgICAgICAgICBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YTtcblxuICAgICAgICAgIGRhdGFQb2ludHMgPSBhdHRycy5kYXRhO1xuICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IGF0dHJzLmZvcmVjYXN0RGF0YTtcbiAgICAgICAgICBzaG93RGF0YVBvaW50cyA9IGF0dHJzLnNob3dEYXRhUG9pbnRzO1xuICAgICAgICAgIHByZXZpb3VzUmFuZ2VEYXRhUG9pbnRzID0gYXR0cnMucHJldmlvdXNSYW5nZURhdGE7XG4gICAgICAgICAgYW5ub3RhdGlvbkRhdGEgPSBhdHRycy5hbm5vdGF0aW9uRGF0YTtcblxuICAgICAgICAgIGxldCBzdGFydEludGVydmFsUHJvbWlzZTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGdldENoYXJ0V2lkdGgoKTogbnVtYmVyIHtcbiAgICAgICAgICAgIC8vcmV0dXJuIGFuZ3VsYXIuZWxlbWVudCgnIycgKyBjaGFydENvbnRleHQuY2hhcnRIYW5kbGUpLndpZHRoKCk7XG4gICAgICAgICAgICByZXR1cm4gQ0hBUlRfV0lEVEg7XG4gICAgICAgICAgfVxuXG5cbiAgICAgICAgICBmdW5jdGlvbiByZXNpemUoKTogdm9pZCB7XG4gICAgICAgICAgICAvLyBkZXN0cm95IGFueSBwcmV2aW91cyBjaGFydHNcbiAgICAgICAgICAgIGlmIChjaGFydCkge1xuICAgICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNoYXJ0UGFyZW50ID0gZDMuc2VsZWN0KGVsZW1lbnRbMF0pO1xuXG4gICAgICAgICAgICBjb25zb2xlLmRpcihlbGVtZW50WzBdKTtcblxuICAgICAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGVsZW1lbnRbMF0ucGFyZW50Tm9kZTtcblxuICAgICAgICAgICAgd2lkdGggPSAoPGFueT5wYXJlbnROb2RlKS5jbGllbnRXaWR0aDtcbiAgICAgICAgICAgIGhlaWdodCA9ICg8YW55PnBhcmVudE5vZGUpLmNsaWVudEhlaWdodDtcblxuICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20gLSBYX0FYSVNfSEVJR0hULFxuXG4gICAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ01ldHJpYyBXaWR0aDogJWknLCB3aWR0aCk7XG4gICAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ01ldHJpYyBIZWlnaHQ6ICVpJywgaGVpZ2h0KTtcblxuICAgICAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcDtcblxuICAgICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBpbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgICAgLy9jcmVhdGVTdmdEZWZzKGNoYXJ0KTtcblxuICAgICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywnICsgKG1hcmdpbi50b3ApICsgJyknKTtcblxuICAgICAgICAgICAgdGlwID0gZDMudGlwKClcbiAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2QzLXRpcCcpXG4gICAgICAgICAgICAgIC5vZmZzZXQoWy0xMCwgMF0pXG4gICAgICAgICAgICAgIC5odG1sKChkLCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ1aWxkSG92ZXIoZCwgaSk7XG4gICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzdmcuY2FsbCh0aXApO1xuXG4gICAgICAgICAgICAvLyBhIHBsYWNlaG9sZGVyIGZvciB0aGUgYWxlcnRzXG4gICAgICAgICAgICBzdmcuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnYWxlcnRIb2xkZXInKTtcblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIHNldHVwRmlsdGVyZWREYXRhKGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKTogdm9pZCB7XG5cbiAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzKSB7XG4gICAgICAgICAgICAgIHBlYWsgPSBkMy5tYXgoZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyAoZC5hdmcgfHwgZC52YWx1ZSkgOiAwO1xuICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgICAgbWluID0gZDMubWluKGRhdGFQb2ludHMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpID8gKGQuYXZnIHx8IGQudmFsdWUpIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vLyBsZXRzIGFkanVzdCB0aGUgbWluIGFuZCBtYXggdG8gYWRkIHNvbWUgdmlzdWFsIHNwYWNpbmcgYmV0d2VlbiBpdCBhbmQgdGhlIGF4ZXNcbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluICogLjk1O1xuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcblxuICAgICAgICAgICAgLy8vIGNoZWNrIGlmIHdlIG5lZWQgdG8gYWRqdXN0IGhpZ2gvbG93IGJvdW5kIHRvIGZpdCBhbGVydCB2YWx1ZVxuICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IE1hdGgubWF4KHZpc3VhbGx5QWRqdXN0ZWRNYXgsIGFsZXJ0VmFsdWUgKiAxLjIpO1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluID0gTWF0aC5taW4odmlzdWFsbHlBZGp1c3RlZE1pbiwgYWxlcnRWYWx1ZSAqIC45NSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vLyB1c2UgZGVmYXVsdCBZIHNjYWxlIGluIGNhc2UgaGlnaCBhbmQgbG93IGJvdW5kIGFyZSAwIChpZSwgbm8gdmFsdWVzIG9yIGFsbCAwKVxuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9ICEhIXZpc3VhbGx5QWRqdXN0ZWRNYXggJiYgISEhdmlzdWFsbHlBZGp1c3RlZE1pbiA/IERFRkFVTFRfWV9TQ0FMRSA6XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXg7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lU2NhbGUoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcbiAgICAgICAgICAgIGxldCB4VGlja3MsIG51bWJlck9mQmFyc0ZvclNtYWxsR3JhcGggPSAyMDtcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuXG5cbiAgICAgICAgICAgICAgLy8gIHdlIHVzZSB0aGUgd2lkdGggYWxyZWFkeSBkZWZpbmVkIGFib3ZlXG4gICAgICAgICAgICAgIHhUaWNrcyA9IDk7XG4gICAgICAgICAgICAgIGNoYXJ0RGF0YSA9IGRhdGFQb2ludHM7XG5cbiAgICAgICAgICAgICAgc2V0dXBGaWx0ZXJlZERhdGEoZGF0YVBvaW50cyk7XG5cbiAgICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt2aXN1YWxseUFkanVzdGVkTWluLCB2aXN1YWxseUFkanVzdGVkTWF4XSk7XG5cbiAgICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAudGlja3MoNSlcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgICAgbGV0IHRpbWVTY2FsZU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgIGxldCB0aW1lU2NhbGVNYXg7XG4gICAgICAgICAgICAgIGlmIChmb3JlY2FzdERhdGFQb2ludHMgJiYgZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBmb3JlY2FzdERhdGFQb2ludHNbZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aW1lU2NhbGVNYXggPSBkMy5tYXgoZGF0YVBvaW50cy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoXSlcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt0aW1lU2NhbGVNaW4sIHRpbWVTY2FsZU1heF0pO1xuXG4gICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBzZXR1cEZpbHRlcmVkTXVsdGlEYXRhKG11bHRpRGF0YVBvaW50czogSU11bHRpRGF0YVBvaW50W10pOiBhbnkge1xuICAgICAgICAgICAgbGV0IGFsZXJ0UGVhazogbnVtYmVyLFxuICAgICAgICAgICAgICBoaWdoUGVhazogbnVtYmVyO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKSB7XG4gICAgICAgICAgICAgIGxldCBjdXJyZW50TWF4OiBudW1iZXIsXG4gICAgICAgICAgICAgICAgY3VycmVudE1pbjogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlcmllc01heDogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlcmllc01pbjogbnVtYmVyLFxuICAgICAgICAgICAgICAgIG1heExpc3Q6IG51bWJlcltdID0gW10sXG4gICAgICAgICAgICAgICAgbWluTGlzdDogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMuZm9yRWFjaCgoc2VyaWVzKSA9PiB7XG4gICAgICAgICAgICAgICAgY3VycmVudE1heCA9IGQzLm1heChzZXJpZXMudmFsdWVzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogZC5hdmc7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIG1heExpc3QucHVzaChjdXJyZW50TWF4KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50TWluID0gZDMubWluKHNlcmllcy52YWx1ZXMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCkgPyBkLmF2ZyA6IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIG1pbkxpc3QucHVzaChjdXJyZW50TWluKTtcblxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgc2VyaWVzTWF4ID0gZDMubWF4KG1heExpc3QpO1xuICAgICAgICAgICAgICBzZXJpZXNNaW4gPSBkMy5taW4obWluTGlzdCk7XG4gICAgICAgICAgICAgIHJldHVybiBbc2VyaWVzTWluLCBzZXJpZXNNYXhdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBtaW5NYXggPSBkZXRlcm1pbmVNdWx0aURhdGFNaW5NYXgoKTtcbiAgICAgICAgICAgIHBlYWsgPSBtaW5NYXhbMV07XG4gICAgICAgICAgICBtaW4gPSBtaW5NYXhbMF07XG5cbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNaW4gPSB1c2VaZXJvTWluVmFsdWUgPyAwIDogbWluIC0gKG1pbiAqIDAuMDUpO1xuICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgICAgYWxlcnRQZWFrID0gKGFsZXJ0VmFsdWUgKiAxLjIpO1xuICAgICAgICAgICAgICBoaWdoUGVhayA9IHBlYWsgKyAoKHBlYWsgLSBtaW4pICogMC4yKTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IGFsZXJ0UGVhayA+IGhpZ2hQZWFrID8gYWxlcnRQZWFrIDogaGlnaFBlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gW3Zpc3VhbGx5QWRqdXN0ZWRNaW4sICEhIXZpc3VhbGx5QWRqdXN0ZWRNYXggJiYgISEhdmlzdWFsbHlBZGp1c3RlZE1pbiA/IERFRkFVTFRfWV9TQ0FMRSA6XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXhdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZU11bHRpU2NhbGUobXVsdGlEYXRhUG9pbnRzOiBJTXVsdGlEYXRhUG9pbnRbXSkge1xuICAgICAgICAgICAgY29uc3QgeFRpY2tzID0gOTtcblxuICAgICAgICAgICAgaWYgKG11bHRpRGF0YVBvaW50cyAmJiBtdWx0aURhdGFQb2ludHNbMF0gJiYgbXVsdGlEYXRhUG9pbnRzWzBdLnZhbHVlcykge1xuXG4gICAgICAgICAgICAgIGxldCBsb3dIaWdoID0gc2V0dXBGaWx0ZXJlZE11bHRpRGF0YShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluID0gbG93SGlnaFswXTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCA9IGxvd0hpZ2hbMV07XG5cbiAgICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbaGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgICAuZG9tYWluKFt2aXN1YWxseUFkanVzdGVkTWluLCB2aXN1YWxseUFkanVzdGVkTWF4XSk7XG5cbiAgICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAudGlja3MoNSlcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAgICAgLmRvbWFpbihbZDMubWluKG11bHRpRGF0YVBvaW50cywgKGQpID0+IGQzLm1pbihkLnZhbHVlcywgKHApID0+IHAudGltZXN0YW1wKSksXG4gICAgICAgICAgICAgICAgICBkMy5tYXgobXVsdGlEYXRhUG9pbnRzLCAoZCkgPT4gZDMubWF4KGQudmFsdWVzLCAocCkgPT4gcC50aW1lc3RhbXApKV0pO1xuXG4gICAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHhUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpXG4gICAgICAgICAgICAgICAgLnRpY2tTaXplKDQsIDQsIDApXG4gICAgICAgICAgICAgICAgLm9yaWVudCgnYm90dG9tJyk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvKipcbiAgICAgICAgICAgKiBMb2FkIG1ldHJpY3MgZGF0YSBkaXJlY3RseSBmcm9tIGEgcnVubmluZyBIYXdrdWxhci1NZXRyaWNzIHNlcnZlclxuICAgICAgICAgICAqIEBwYXJhbSB1cmxcbiAgICAgICAgICAgKiBAcGFyYW0gbWV0cmljSWRcbiAgICAgICAgICAgKiBAcGFyYW0gc3RhcnRUaW1lc3RhbXBcbiAgICAgICAgICAgKiBAcGFyYW0gZW5kVGltZXN0YW1wXG4gICAgICAgICAgICogQHBhcmFtIGJ1Y2tldHNcbiAgICAgICAgICAgKi9cbiAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NGb3JUaW1lUmFuZ2UodXJsOiBVcmxUeXBlLFxuICAgICAgICAgICAgbWV0cmljSWQ6IE1ldHJpY0lkLFxuICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgICAgICAgIGVuZFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgICAgICAgYnVja2V0cyA9IDYwKSB7XG5cbiAgICAgICAgICAgIGxldCByZXF1ZXN0Q29uZmlnOiBuZy5JUmVxdWVzdENvbmZpZyA9IDxhbnk+e1xuICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0hhd2t1bGFyLVRlbmFudCc6IG1ldHJpY1RlbmFudElkXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBlbmQ6IGVuZFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICBidWNrZXRzOiBidWNrZXRzXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzdGFydFRpbWVzdGFtcCA+PSBlbmRUaW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgJGxvZy5sb2coJ1N0YXJ0IGRhdGUgd2FzIGFmdGVyIGVuZCBkYXRlJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh1cmwgJiYgbWV0cmljVHlwZSAmJiBtZXRyaWNJZCkge1xuXG4gICAgICAgICAgICAgIGxldCBtZXRyaWNUeXBlQW5kRGF0YSA9IG1ldHJpY1R5cGUuc3BsaXQoJy0nKTtcbiAgICAgICAgICAgICAgLy8vIHNhbXBsZSB1cmw6XG4gICAgICAgICAgICAgIC8vLyBodHRwOi8vbG9jYWxob3N0OjgwODAvaGF3a3VsYXIvbWV0cmljcy9nYXVnZXMvNDViMjI1NmVmZjE5Y2I5ODI1NDJiMTY3YjM5NTcwMzYuc3RhdHVzLmR1cmF0aW9uL2RhdGE/XG4gICAgICAgICAgICAgIC8vIGJ1Y2tldHM9MTIwJmVuZD0xNDM2ODMxNzk3NTMzJnN0YXJ0PTE0MzY4MjgxOTc1MzMnXG4gICAgICAgICAgICAgICRodHRwLmdldCh1cmwgKyAnLycgKyBtZXRyaWNUeXBlQW5kRGF0YVswXSArICdzLycgKyBtZXRyaWNJZCArICcvJyArIChtZXRyaWNUeXBlQW5kRGF0YVsxXSB8fCAnZGF0YScpLFxuICAgICAgICAgICAgICAgIHJlcXVlc3RDb25maWcpLnN1Y2Nlc3MoKHJlc3BvbnNlKSA9PiB7XG5cbiAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBmb3JtYXRCdWNrZXRlZENoYXJ0T3V0cHV0KHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG5cbiAgICAgICAgICAgICAgICB9KS5lcnJvcigocmVhc29uLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICRsb2cuZXJyb3IoJ0Vycm9yIExvYWRpbmcgQ2hhcnQgRGF0YTonICsgc3RhdHVzICsgJywgJyArIHJlYXNvbik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvKipcbiAgICAgICAgICAgKiBUcmFuc2Zvcm0gdGhlIHJhdyBodHRwIHJlc3BvbnNlIGZyb20gTWV0cmljcyB0byBvbmUgdXNhYmxlIGluIGNoYXJ0c1xuICAgICAgICAgICAqIEBwYXJhbSByZXNwb25zZVxuICAgICAgICAgICAqIEByZXR1cm5zIHRyYW5zZm9ybWVkIHJlc3BvbnNlIHRvIElDaGFydERhdGFQb2ludFtdLCByZWFkeSB0byBiZSBjaGFydGVkXG4gICAgICAgICAgICovXG4gICAgICAgICAgZnVuY3Rpb24gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChyZXNwb25zZSk6IElDaGFydERhdGFQb2ludFtdIHtcbiAgICAgICAgICAgIC8vICBUaGUgc2NoZW1hIGlzIGRpZmZlcmVudCBmb3IgYnVja2V0ZWQgb3V0cHV0XG4gICAgICAgICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLm1hcCgocG9pbnQ6IElDaGFydERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IHBvaW50LnRpbWVzdGFtcCB8fCAocG9pbnQuc3RhcnQgKyAocG9pbnQuZW5kIC0gcG9pbnQuc3RhcnQpIC8gMik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wLFxuICAgICAgICAgICAgICAgICAgZGF0ZTogbmV3IERhdGUodGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlOiAhYW5ndWxhci5pc051bWJlcihwb2ludC52YWx1ZSkgPyB1bmRlZmluZWQgOiBwb2ludC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICAgIG1pbjogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWluKSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1pbixcbiAgICAgICAgICAgICAgICAgIG1heDogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQubWF4KSA/IHVuZGVmaW5lZCA6IHBvaW50Lm1heCxcbiAgICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGJ1aWxkSG92ZXIoZDogSUNoYXJ0RGF0YVBvaW50LCBpOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGxldCBob3ZlcixcbiAgICAgICAgICAgICAgcHJldlRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgY3VycmVudFRpbWVzdGFtcCA9IGQudGltZXN0YW1wLFxuICAgICAgICAgICAgICBiYXJEdXJhdGlvbixcbiAgICAgICAgICAgICAgZm9ybWF0dGVkRGF0ZVRpbWUgPSBtb21lbnQoZC50aW1lc3RhbXApLmZvcm1hdChIT1ZFUl9EQVRFX1RJTUVfRk9STUFUKTtcblxuICAgICAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgICAgIHByZXZUaW1lc3RhbXAgPSBjaGFydERhdGFbaSAtIDFdLnRpbWVzdGFtcDtcbiAgICAgICAgICAgICAgYmFyRHVyYXRpb24gPSBtb21lbnQoY3VycmVudFRpbWVzdGFtcCkuZnJvbShtb21lbnQocHJldlRpbWVzdGFtcCksIHRydWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNFbXB0eURhdGFQb2ludChkKSkge1xuICAgICAgICAgICAgICAvLyBub2RhdGFcbiAgICAgICAgICAgICAgaG92ZXIgPSBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICAgICAgPHNtYWxsIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7bm9EYXRhTGFiZWx9PC9zbWFsbD5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2R1cmF0aW9uTGFiZWx9PC9zcGFuPjxzcGFuPjpcbiAgICAgICAgICAgICAgICA8L3NwYW4+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+PC9zbWFsbD4gPC9kaXY+XG4gICAgICAgICAgICAgICAgPGhyLz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46XG4gICAgICAgICAgICAgICAgPC9zcGFuPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7Zm9ybWF0dGVkRGF0ZVRpbWV9PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChpc1Jhd01ldHJpYyhkKSkge1xuICAgICAgICAgICAgICAgIC8vIHJhdyBzaW5nbGUgdmFsdWUgZnJvbSByYXcgdGFibGVcbiAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICA8ZGl2PjxzbWFsbD48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7YmFyRHVyYXRpb259PC9zcGFuPjwvc21hbGw+PC9kaXY+XG4gICAgICAgICAgICAgICAgICA8aHIvPlxuICAgICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtzaW5nbGVWYWx1ZUxhYmVsfTwvc3Bhbj48c3Bhbj46IDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZDMucm91bmQoZC52YWx1ZSwgMil9PC9zcGFuPjwvc21hbGw+IDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPC9kaXY+IGA7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gYWdncmVnYXRlIHdpdGggbWluL2F2Zy9tYXhcbiAgICAgICAgICAgICAgICBob3ZlciA9IGA8ZGl2IGNsYXNzPSdjaGFydEhvdmVyJz5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke3RpbWVzdGFtcExhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtmb3JtYXR0ZWREYXRlVGltZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gYmVmb3JlLXNlcGFyYXRvcic+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtiYXJEdXJhdGlvbn08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gc2VwYXJhdG9yJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21heExhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1heCwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke2F2Z0xhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLmF2ZywgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke21pbkxhYmVsfTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkMy5yb3VuZChkLm1pbiwgMil9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PiBgO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaG92ZXI7XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVNdWx0aUxpbmVDaGFydChtdWx0aURhdGFQb2ludHM6IElNdWx0aURhdGFQb2ludFtdKSB7XG4gICAgICAgICAgICBsZXQgY29sb3JTY2FsZSA9IGQzLnNjYWxlLmNhdGVnb3J5MTAoKSxcbiAgICAgICAgICAgICAgZyA9IDA7XG5cbiAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgLy8gYmVmb3JlIHVwZGF0aW5nLCBsZXQncyByZW1vdmUgdGhvc2UgbWlzc2luZyBmcm9tIGRhdGFwb2ludHMgKGlmIGFueSlcbiAgICAgICAgICAgICAgc3ZnLnNlbGVjdEFsbCgncGF0aFtpZF49XFwnbXVsdGlMaW5lXFwnXScpWzBdLmZvckVhY2goKGV4aXN0aW5nUGF0aDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHN0aWxsRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICBzaW5nbGVDaGFydERhdGEua2V5SGFzaCA9IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoXG4gICAgICAgICAgICAgICAgICAgIHx8ICgnbXVsdGlMaW5lJyArIGhhc2hTdHJpbmcoc2luZ2xlQ2hhcnREYXRhLmtleSkpO1xuICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nUGF0aC5nZXRBdHRyaWJ1dGUoJ2lkJykgPT09IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0aWxsRXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoIXN0aWxsRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICBleGlzdGluZ1BhdGgucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMuZm9yRWFjaCgoc2luZ2xlQ2hhcnREYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoc2luZ2xlQ2hhcnREYXRhICYmIHNpbmdsZUNoYXJ0RGF0YS52YWx1ZXMpIHtcbiAgICAgICAgICAgICAgICAgIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoID0gc2luZ2xlQ2hhcnREYXRhLmtleUhhc2hcbiAgICAgICAgICAgICAgICAgICAgfHwgKCdtdWx0aUxpbmUnICsgaGFzaFN0cmluZyhzaW5nbGVDaGFydERhdGEua2V5KSk7XG4gICAgICAgICAgICAgICAgICBsZXQgcGF0aE11bHRpTGluZSA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGgjJyArIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKVxuICAgICAgICAgICAgICAgICAgICAuZGF0YShbc2luZ2xlQ2hhcnREYXRhLnZhbHVlc10pO1xuICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgICAgICBwYXRoTXVsdGlMaW5lLmF0dHIoJ2lkJywgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2gpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdtdWx0aUxpbmUnKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignZmlsbCcsICdub25lJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2luZ2xlQ2hhcnREYXRhLmNvbG9yIHx8IGNvbG9yU2NhbGUoZysrKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUxpbmUoJ2xpbmVhcicpKTtcbiAgICAgICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICAgICAgcGF0aE11bHRpTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdpZCcsIHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbXVsdGlMaW5lJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnbm9uZScpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdzdHJva2UnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgaWYgKHNpbmdsZUNoYXJ0RGF0YS5jb2xvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNpbmdsZUNoYXJ0RGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbG9yU2NhbGUoZysrKTtcbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVMaW5lKCdsaW5lYXInKSk7XG4gICAgICAgICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAkbG9nLndhcm4oJ05vIG11bHRpLWRhdGEgc2V0IGZvciBtdWx0aWxpbmUgY2hhcnQnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVlBeGlzR3JpZExpbmVzKCkge1xuICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSB5IGF4aXMgZ3JpZCBsaW5lc1xuICAgICAgICAgICAgaWYgKHlTY2FsZSkge1xuICAgICAgICAgICAgICBsZXQgeUF4aXMgPSBzdmcuc2VsZWN0QWxsKCdnLmdyaWQueV9ncmlkJyk7XG4gICAgICAgICAgICAgIGlmICgheUF4aXNbMF0ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgeUF4aXMgPSBzdmcuYXBwZW5kKCdnJykuY2xhc3NlZCgnZ3JpZCB5X2dyaWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB5QXhpc1xuICAgICAgICAgICAgICAgIC5jYWxsKGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0JylcbiAgICAgICAgICAgICAgICAgIC50aWNrcygxMClcbiAgICAgICAgICAgICAgICAgIC50aWNrU2l6ZSgtd2lkdGgsIDApXG4gICAgICAgICAgICAgICAgICAudGlja0Zvcm1hdCgnJylcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgICAgZnVuY3Rpb24gYXhpc1RyYW5zaXRpb24oc2VsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAuZGVsYXkoMjUwKVxuICAgICAgICAgICAgICAgIC5kdXJhdGlvbig3NTApXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAxLjApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoeUF4aXMpIHtcblxuICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCdnLmF4aXMnKS5yZW1vdmUoKTtcblxuICAgICAgICAgICAgICAvKiB0c2xpbnQ6ZGlzYWJsZTpuby11bnVzZWQtdmFyaWFibGUgKi9cblxuICAgICAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgICAgIGxldCB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwnICsgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ICsgJyknKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgIC5jYWxsKHhBeGlzKVxuICAgICAgICAgICAgICAgIC5jYWxsKGF4aXNUcmFuc2l0aW9uKTtcblxuICAgICAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgICAgIGxldCB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgLmNhbGwoeUF4aXMpXG4gICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuXG4gICAgICAgICAgICAgIGxldCB5QXhpc0xhYmVsID0gc3ZnLnNlbGVjdEFsbCgnLnlBeGlzVW5pdHNMYWJlbCcpO1xuICAgICAgICAgICAgICBpZiAobW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID49IDE1MCAmJiBhdHRycy55QXhpc1VuaXRzKSB7XG4gICAgICAgICAgICAgICAgeUF4aXNMYWJlbCA9IHN2Zy5hcHBlbmQoJ3RleHQnKS5hdHRyKCdjbGFzcycsICd5QXhpc1VuaXRzTGFiZWwnKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICdyb3RhdGUoLTkwKSx0cmFuc2xhdGUoLTIwLC01MCknKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ3gnLCAtbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0IC8gMilcbiAgICAgICAgICAgICAgICAgIC5zdHlsZSgndGV4dC1hbmNob3InLCAnY2VudGVyJylcbiAgICAgICAgICAgICAgICAgIC50ZXh0KGF0dHJzLnlBeGlzVW5pdHMgPT09ICdOT05FJyA/ICcnIDogYXR0cnMueUF4aXNVbml0cylcbiAgICAgICAgICAgICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC4zKVxuICAgICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVDZW50ZXJlZExpbmUobmV3SW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAgICAgICAuZGVmaW5lZCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnkoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBsaW5lO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUxpbmUobmV3SW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAgICAgICAuZGVmaW5lZCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLngoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnkoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBsaW5lO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUF2Z0xpbmVzKCkge1xuICAgICAgICAgICAgaWYgKGNoYXJ0VHlwZSA9PT0gJ2JhcicgfHwgY2hhcnRUeXBlID09PSAnc2NhdHRlcmxpbmUnKSB7XG4gICAgICAgICAgICAgIGxldCBwYXRoQXZnTGluZSA9IHN2Zy5zZWxlY3RBbGwoJy5iYXJBdmdMaW5lJykuZGF0YShbY2hhcnREYXRhXSk7XG4gICAgICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgICAgICBwYXRoQXZnTGluZS5hdHRyKCdjbGFzcycsICdiYXJBdmdMaW5lJylcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUNlbnRlcmVkTGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgICAgICBwYXRoQXZnTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JhckF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlQ2VudGVyZWRMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLnNlbGVjdEFsbCgnZy5icnVzaCcpO1xuICAgICAgICAgICAgaWYgKGJydXNoR3JvdXAuZW1wdHkoKSkge1xuICAgICAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2JydXNoJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJydXNoID0gZDMuc3ZnLmJydXNoKClcbiAgICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgICAub24oJ2JydXNoZW5kJywgYnJ1c2hFbmQpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgncmVjdCcpXG4gICAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBicnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGJydXNoRW5kKCkge1xuICAgICAgICAgICAgICBsZXQgZXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgICAgc3RhcnRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMF0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMV0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgICAvLyBpZ25vcmUgcmFuZ2Ugc2VsZWN0aW9ucyBsZXNzIHRoYW4gMSBtaW51dGVcbiAgICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IFtdO1xuICAgICAgICAgICAgICAgIHNob3dGb3JlY2FzdERhdGEoZm9yZWNhc3REYXRhUG9pbnRzKTtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBleHRlbnQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIGNsZWFyIHRoZSBicnVzaCBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlUHJldmlvdXNSYW5nZU92ZXJsYXkocHJldlJhbmdlRGF0YSkge1xuICAgICAgICAgICAgaWYgKHByZXZSYW5nZURhdGEpIHtcbiAgICAgICAgICAgICAgc3ZnLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAgICAgLmRhdHVtKHByZXZSYW5nZURhdGEpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ByZXZSYW5nZUF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgIC5zdHlsZSgnc3Ryb2tlLWRhc2hhcnJheScsICgnOSwzJykpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVDZW50ZXJlZExpbmUoJ2xpbmVhcicpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGFubm90YXRlQ2hhcnQoYW5ub3RhdGlvbkRhdGEpIHtcbiAgICAgICAgICAgIGlmIChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBzdmcuc2VsZWN0QWxsKCcuYW5ub3RhdGlvbkRvdCcpXG4gICAgICAgICAgICAgICAgLmRhdGEoYW5ub3RhdGlvbkRhdGEpXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdhbm5vdGF0aW9uRG90JylcbiAgICAgICAgICAgICAgICAuYXR0cigncicsIDUpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2N5JywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGhlaWdodCAtIHlTY2FsZSh2aXN1YWxseUFkanVzdGVkTWF4KTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5zdHlsZSgnZmlsbCcsIChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoZC5zZXZlcml0eSA9PT0gJzEnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAncmVkJztcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZC5zZXZlcml0eSA9PT0gJzInKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAneWVsbG93JztcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnd2hpdGUnO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUZvcmVjYXN0TGluZShuZXdJbnRlcnBvbGF0aW9uKSB7XG4gICAgICAgICAgICBsZXQgaW50ZXJwb2xhdGUgPSBuZXdJbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRlKVxuICAgICAgICAgICAgICAgIC54KChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC55KChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQudmFsdWUpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gbGluZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBzaG93Rm9yZWNhc3REYXRhKGZvcmVjYXN0RGF0YTogSVNpbXBsZU1ldHJpY1tdKSB7XG4gICAgICAgICAgICBsZXQgZm9yZWNhc3RQYXRoTGluZSA9IHN2Zy5zZWxlY3RBbGwoJy5mb3JlY2FzdExpbmUnKS5kYXRhKFtmb3JlY2FzdERhdGFdKTtcbiAgICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgICAgZm9yZWNhc3RQYXRoTGluZS5hdHRyKCdjbGFzcycsICdmb3JlY2FzdExpbmUnKVxuICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUZvcmVjYXN0TGluZSgnbW9ub3RvbmUnKSk7XG4gICAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICAgIGZvcmVjYXN0UGF0aExpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZm9yZWNhc3RMaW5lJylcbiAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVGb3JlY2FzdExpbmUoJ21vbm90b25lJykpO1xuICAgICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgICBmb3JlY2FzdFBhdGhMaW5lLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIH1cblxuICAgICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2RhdGEnLCAobmV3RGF0YSwgb2xkRGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld0RhdGEgfHwgb2xkRGF0YSkge1xuICAgICAgICAgICAgICBwcm9jZXNzZWROZXdEYXRhID0gYW5ndWxhci5mcm9tSnNvbihuZXdEYXRhIHx8IFtdKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEsIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgnbXVsdGlEYXRhJywgKG5ld011bHRpRGF0YSwgb2xkTXVsdGlEYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3TXVsdGlEYXRhIHx8IG9sZE11bHRpRGF0YSkge1xuICAgICAgICAgICAgICBtdWx0aURhdGFQb2ludHMgPSBhbmd1bGFyLmZyb21Kc29uKG5ld011bHRpRGF0YSB8fCBbXSk7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhLCBwcm9jZXNzZWRQcmV2aW91c1JhbmdlRGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ3ByZXZpb3VzUmFuZ2VEYXRhJywgKG5ld1ByZXZpb3VzUmFuZ2VWYWx1ZXMpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdQcmV2aW91c1JhbmdlVmFsdWVzKSB7XG4gICAgICAgICAgICAgIC8vJGxvZy5kZWJ1ZygnUHJldmlvdXMgUmFuZ2UgZGF0YSBjaGFuZ2VkJyk7XG4gICAgICAgICAgICAgIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhID0gYW5ndWxhci5mcm9tSnNvbihuZXdQcmV2aW91c1JhbmdlVmFsdWVzKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEsIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgnYW5ub3RhdGlvbkRhdGEnLCAobmV3QW5ub3RhdGlvbkRhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdBbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24obmV3QW5ub3RhdGlvbkRhdGEpO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdmb3JlY2FzdERhdGEnLCAobmV3Rm9yZWNhc3REYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3Rm9yZWNhc3REYXRhKSB7XG4gICAgICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IGFuZ3VsYXIuZnJvbUpzb24obmV3Rm9yZWNhc3REYXRhKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEsIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaEdyb3VwKFsnYWxlcnRWYWx1ZScsICdjaGFydFR5cGUnLCAnaGlkZUhpZ2hMb3dWYWx1ZXMnLCAndXNlWmVyb01pblZhbHVlJywgJ3Nob3dBdmdMaW5lJ10sXG4gICAgICAgICAgICAoY2hhcnRBdHRycykgPT4ge1xuICAgICAgICAgICAgICBhbGVydFZhbHVlID0gY2hhcnRBdHRyc1swXSB8fCBhbGVydFZhbHVlO1xuICAgICAgICAgICAgICBjaGFydFR5cGUgPSBjaGFydEF0dHJzWzFdIHx8IGNoYXJ0VHlwZTtcbiAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMgPSAodHlwZW9mIGNoYXJ0QXR0cnNbMl0gIT09ICd1bmRlZmluZWQnKSA/IGNoYXJ0QXR0cnNbMl0gOiBoaWRlSGlnaExvd1ZhbHVlcztcbiAgICAgICAgICAgICAgdXNlWmVyb01pblZhbHVlID0gKHR5cGVvZiBjaGFydEF0dHJzWzNdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzNdIDogdXNlWmVyb01pblZhbHVlO1xuICAgICAgICAgICAgICBzaG93QXZnTGluZSA9ICh0eXBlb2YgY2hhcnRBdHRyc1s0XSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1s0XSA6IHNob3dBdmdMaW5lO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSwgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBsb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93KCkge1xuICAgICAgICAgICAgZW5kVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gbW9tZW50KCkuc3VidHJhY3QodGltZVJhbmdlSW5TZWNvbmRzLCAnc2Vjb25kcycpLnZhbHVlT2YoKTtcbiAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc0ZvclRpbWVSYW5nZShkYXRhVXJsLCBtZXRyaWNJZCwgc3RhcnRUaW1lc3RhbXAsIGVuZFRpbWVzdGFtcCwgNjApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vLyBzdGFuZGFsb25lIGNoYXJ0cyBhdHRyaWJ1dGVzXG4gICAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydtZXRyaWNVcmwnLCAnbWV0cmljSWQnLCAnbWV0cmljVHlwZScsICdtZXRyaWNUZW5hbnRJZCcsICd0aW1lUmFuZ2VJblNlY29uZHMnXSxcbiAgICAgICAgICAgIChzdGFuZEFsb25lUGFyYW1zKSA9PiB7XG4gICAgICAgICAgICAgIGRhdGFVcmwgPSBzdGFuZEFsb25lUGFyYW1zWzBdIHx8IGRhdGFVcmw7XG4gICAgICAgICAgICAgIG1ldHJpY0lkID0gc3RhbmRBbG9uZVBhcmFtc1sxXSB8fCBtZXRyaWNJZDtcbiAgICAgICAgICAgICAgbWV0cmljVHlwZSA9IHN0YW5kQWxvbmVQYXJhbXNbMl0gfHwgbWV0cmljSWQ7XG4gICAgICAgICAgICAgIG1ldHJpY1RlbmFudElkID0gc3RhbmRBbG9uZVBhcmFtc1szXSB8fCBtZXRyaWNUZW5hbnRJZDtcbiAgICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzID0gc3RhbmRBbG9uZVBhcmFtc1s0XSB8fCB0aW1lUmFuZ2VJblNlY29uZHM7XG4gICAgICAgICAgICAgIGxvYWRTdGFuZEFsb25lTWV0cmljc1RpbWVSYW5nZUZyb21Ob3coKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdyZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMnLCAobmV3UmVmcmVzaEludGVydmFsKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3UmVmcmVzaEludGVydmFsKSB7XG4gICAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyA9ICtuZXdSZWZyZXNoSW50ZXJ2YWw7XG4gICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc3RhcnRJbnRlcnZhbFByb21pc2UpO1xuICAgICAgICAgICAgICBzdGFydEludGVydmFsUHJvbWlzZSA9ICRpbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdygpO1xuICAgICAgICAgICAgICB9LCByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgKiAxMDAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiRvbignJGRlc3Ryb3knLCAoKSA9PiB7XG4gICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHN0YXJ0SW50ZXJ2YWxQcm9taXNlKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHNjb3BlLiRvbignRGF0ZVJhbmdlRHJhZ0NoYW5nZWQnLCAoZXZlbnQsIGV4dGVudCkgPT4ge1xuICAgICAgICAgICAgc2NvcGUuJGVtaXQoJ0dyYXBoVGltZVJhbmdlQ2hhbmdlZEV2ZW50JywgZXh0ZW50KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZUNoYXJ0VHlwZShjaGFydFR5cGU6IHN0cmluZykge1xuXG4gICAgICAgICAgICBzd2l0Y2ggKGNoYXJ0VHlwZSkge1xuICAgICAgICAgICAgICBjYXNlICdyaHFiYXInOlxuICAgICAgICAgICAgICAgIGNyZWF0ZUhpc3RvZ3JhbUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgIHRpcCxcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCxcbiAgICAgICAgICAgICAgICAgIHRydWUsXG4gICAgICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4LFxuICAgICAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdoaXN0b2dyYW0nOlxuICAgICAgICAgICAgICAgIGNyZWF0ZUhpc3RvZ3JhbUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgIHRpcCxcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSAnbGluZSc6XG4gICAgICAgICAgICAgICAgY3JlYXRlTGluZUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCxcbiAgICAgICAgICAgICAgICAgIGludGVycG9sYXRpb24pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdoYXdrdWxhcm1ldHJpYyc6XG4gICAgICAgICAgICAgICAgJGxvZy5pbmZvKCdERVBSRUNBVElPTiBXQVJOSU5HOiBUaGUgY2hhcnQgdHlwZSBoYXdrdWxhcm1ldHJpYyBoYXMgYmVlbiBkZXByZWNhdGVkIGFuZCB3aWxsIGJlJyArXG4gICAgICAgICAgICAgICAgICAnIHJlbW92ZWQgaW4gYSBmdXR1cmUnICtcbiAgICAgICAgICAgICAgICAgICcgcmVsZWFzZS4gUGxlYXNlIHVzZSB0aGUgbGluZSBjaGFydCB0eXBlIGluIGl0cyBwbGFjZScpO1xuICAgICAgICAgICAgICAgIGNyZWF0ZUxpbmVDaGFydChzdmcsXG4gICAgICAgICAgICAgICAgICB0aW1lU2NhbGUsXG4gICAgICAgICAgICAgICAgICB5U2NhbGUsXG4gICAgICAgICAgICAgICAgICBjaGFydERhdGEsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgICAgICAgICBpbnRlcnBvbGF0aW9uKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSAnbXVsdGlsaW5lJzpcbiAgICAgICAgICAgICAgICBjcmVhdGVNdWx0aUxpbmVDaGFydChtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdhcmVhJzpcbiAgICAgICAgICAgICAgICBjcmVhdGVBcmVhQ2hhcnQoc3ZnLFxuICAgICAgICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgaW50ZXJwb2xhdGlvbixcbiAgICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSAnc2NhdHRlcic6XG4gICAgICAgICAgICAgICAgY3JlYXRlU2NhdHRlckNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCxcbiAgICAgICAgICAgICAgICAgIGludGVycG9sYXRpb24sXG4gICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ3NjYXR0ZXJsaW5lJzpcbiAgICAgICAgICAgICAgICBjcmVhdGVTY2F0dGVyTGluZUNoYXJ0KHN2ZyxcbiAgICAgICAgICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICAgICAgICAgIGNoYXJ0RGF0YSxcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCxcbiAgICAgICAgICAgICAgICAgIGludGVycG9sYXRpb24sXG4gICAgICAgICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgJGxvZy53YXJuKCdjaGFydC10eXBlIGlzIG5vdCB2YWxpZC4gTXVzdCBiZSBpbicgK1xuICAgICAgICAgICAgICAgICAgJyBbcmhxYmFyLGxpbmUsYXJlYSxtdWx0aWxpbmUsc2NhdHRlcixzY2F0dGVybGluZSxoaXN0b2dyYW1dIGNoYXJ0IHR5cGU6ICcgKyBjaGFydFR5cGUpO1xuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc2NvcGUucmVuZGVyID0gKGRhdGFQb2ludHMsIHByZXZpb3VzUmFuZ2VEYXRhUG9pbnRzKSA9PiB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBkb24ndCBoYXZlIGRhdGEsIGRvbid0IGJvdGhlci4uXG4gICAgICAgICAgICBpZiAoIWRhdGFQb2ludHMgJiYgIW11bHRpRGF0YVBvaW50cykge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwKCdSZW5kZXIgQ2hhcnQnKTtcbiAgICAgICAgICAgICAgY29uc29sZS50aW1lKCdjaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy9OT1RFOiBsYXllcmluZyBvcmRlciBpcyBpbXBvcnRhbnQhXG4gICAgICAgICAgICByZXNpemUoKTtcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgZGV0ZXJtaW5lU2NhbGUoZGF0YVBvaW50cyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgZGV0ZXJtaW5lTXVsdGlTY2FsZShtdWx0aURhdGFQb2ludHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+IHZpc3VhbGx5QWRqdXN0ZWRNaW4gJiYgYWxlcnRWYWx1ZSA8IHZpc3VhbGx5QWRqdXN0ZWRNYXgpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGFsZXJ0Qm91bmRzOiBBbGVydEJvdW5kW10gPSBleHRyYWN0QWxlcnRSYW5nZXMoY2hhcnREYXRhLCBhbGVydFZhbHVlKTtcbiAgICAgICAgICAgICAgY3JlYXRlQWxlcnRCb3VuZHNBcmVhKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgdmlzdWFsbHlBZGp1c3RlZE1heCwgYWxlcnRCb3VuZHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuXG4gICAgICAgICAgICBjcmVhdGVZQXhpc0dyaWRMaW5lcygpO1xuICAgICAgICAgICAgZGV0ZXJtaW5lQ2hhcnRUeXBlKGNoYXJ0VHlwZSk7XG4gICAgICAgICAgICBpZiAoc2hvd0RhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgY3JlYXRlRGF0YVBvaW50cyhzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCB0aXAsIGNoYXJ0RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjcmVhdGVQcmV2aW91c1JhbmdlT3ZlcmxheShwcmV2aW91c1JhbmdlRGF0YVBvaW50cyk7XG4gICAgICAgICAgICBjcmVhdGVYYW5kWUF4ZXMoKTtcbiAgICAgICAgICAgIGlmIChzaG93QXZnTGluZSkge1xuICAgICAgICAgICAgICBjcmVhdGVBdmdMaW5lcygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+IHZpc3VhbGx5QWRqdXN0ZWRNaW4gJiYgYWxlcnRWYWx1ZSA8IHZpc3VhbGx5QWRqdXN0ZWRNYXgpKSB7XG4gICAgICAgICAgICAgIC8vLyBOT1RFOiB0aGlzIGFsZXJ0IGxpbmUgaGFzIGhpZ2hlciBwcmVjZWRlbmNlIGZyb20gYWxlcnQgYXJlYSBhYm92ZVxuICAgICAgICAgICAgICBjcmVhdGVBbGVydExpbmUoc3ZnLCB0aW1lU2NhbGUsIHlTY2FsZSwgY2hhcnREYXRhLCBhbGVydFZhbHVlLCAnYWxlcnRMaW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBhbm5vdGF0ZUNoYXJ0KGFubm90YXRpb25EYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmb3JlY2FzdERhdGFQb2ludHMgJiYgZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgc2hvd0ZvcmVjYXN0RGF0YShmb3JlY2FzdERhdGFQb2ludHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRlYnVnKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUudGltZUVuZCgnY2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgnUmVuZGVyIENoYXJ0Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgbGluazogbGluayxcbiAgICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICAgIHJlcGxhY2U6IHRydWUsXG4gICAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIGRhdGE6ICc9JyxcbiAgICAgICAgICAgIG11bHRpRGF0YTogJz0nLFxuICAgICAgICAgICAgZm9yZWNhc3REYXRhOiAnPScsXG4gICAgICAgICAgICBtZXRyaWNVcmw6ICdAJyxcbiAgICAgICAgICAgIG1ldHJpY0lkOiAnQCcsXG4gICAgICAgICAgICBtZXRyaWNUeXBlOiAnQCcsXG4gICAgICAgICAgICBtZXRyaWNUZW5hbnRJZDogJ0AnLFxuICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXA6ICdAJyxcbiAgICAgICAgICAgIGVuZFRpbWVzdGFtcDogJ0AnLFxuICAgICAgICAgICAgdGltZVJhbmdlSW5TZWNvbmRzOiAnQCcsXG4gICAgICAgICAgICByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHM6ICdAJyxcbiAgICAgICAgICAgIHByZXZpb3VzUmFuZ2VEYXRhOiAnQCcsXG4gICAgICAgICAgICBhbm5vdGF0aW9uRGF0YTogJ0AnLFxuICAgICAgICAgICAgc2hvd0RhdGFQb2ludHM6ICc9JyxcbiAgICAgICAgICAgIGFsZXJ0VmFsdWU6ICdAJyxcbiAgICAgICAgICAgIGludGVycG9sYXRpb246ICdAJyxcbiAgICAgICAgICAgIGNoYXJ0VHlwZTogJ0AnLFxuICAgICAgICAgICAgeUF4aXNVbml0czogJ0AnLFxuICAgICAgICAgICAgdXNlWmVyb01pblZhbHVlOiAnPScsXG4gICAgICAgICAgICBjaGFydEhvdmVyRGF0ZUZvcm1hdDogJ0AnLFxuICAgICAgICAgICAgY2hhcnRIb3ZlclRpbWVGb3JtYXQ6ICdAJyxcbiAgICAgICAgICAgIHNpbmdsZVZhbHVlTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIG5vRGF0YUxhYmVsOiAnQCcsXG4gICAgICAgICAgICBkdXJhdGlvbkxhYmVsOiAnQCcsXG4gICAgICAgICAgICBtaW5MYWJlbDogJ0AnLFxuICAgICAgICAgICAgbWF4TGFiZWw6ICdAJyxcbiAgICAgICAgICAgIGF2Z0xhYmVsOiAnQCcsXG4gICAgICAgICAgICB0aW1lc3RhbXBMYWJlbDogJ0AnLFxuICAgICAgICAgICAgc2hvd0F2Z0xpbmU6ICc9JyxcbiAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzOiAnPSdcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICBdXG4gICAgKVxuICAgIDtcbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGNvbnN0IFlfQVhJU19IRUlHSFQgPSAxNTtcbiAgY29uc3QgX21vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKTtcblxuICBleHBvcnQgY2xhc3MgU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUge1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX1dJRFRIID0gMzAwO1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9IRUlHSFQgPSA4MDtcblxuICAgIHB1YmxpYyByZXN0cmljdCA9ICdFJztcbiAgICBwdWJsaWMgcmVwbGFjZSA9IHRydWU7XG5cbiAgICBwdWJsaWMgc2NvcGUgPSB7XG4gICAgICBkYXRhOiAnPScsXG4gICAgICBzaG93WUF4aXNWYWx1ZXM6ICc9JyxcbiAgICAgIHNob3dYQXhpc1ZhbHVlczogJz0nLFxuICAgICAgYWxlcnRWYWx1ZTogJ0AnLFxuICAgIH07XG5cbiAgICBwdWJsaWMgbGluazogKHNjb3BlOiBhbnksIGVsZW1lbnQ6IG5nLklBdWdtZW50ZWRKUXVlcnksIGF0dHJzOiBhbnkpID0+IHZvaWQ7XG5cbiAgICBwdWJsaWMgZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W107XG5cbiAgICBjb25zdHJ1Y3Rvcigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgY29uc3QgbWFyZ2luID0geyB0b3A6IDEwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA0NSB9O1xuXG4gICAgICAgIC8vIGRhdGEgc3BlY2lmaWMgdmFyc1xuICAgICAgICBsZXQgY2hhcnRIZWlnaHQgPSBTcGFya2xpbmVDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hULFxuICAgICAgICAgIHdpZHRoID0gU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgaGVpZ2h0ID0gY2hhcnRIZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbSxcbiAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICBzaG93WEF4aXNWYWx1ZXM6IGJvb2xlYW4sXG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzOiBib29sZWFuLFxuICAgICAgICAgIHlTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB5QXhpc0dyb3VwLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgIHN2ZyxcbiAgICAgICAgICBhbGVydFZhbHVlO1xuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuYWxlcnRWYWx1ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBhbGVydFZhbHVlID0gK2F0dHJzLmFsZXJ0VmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGF0dHJzLnNob3dYQXhpc1ZhbHVlcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBzaG93WEF4aXNWYWx1ZXMgPSBhdHRycy5zaG93WEF4aXNWYWx1ZXMgPT09ICd0cnVlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgYXR0cnMuc2hvd1lBeGlzVmFsdWVzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHNob3dZQXhpc1ZhbHVlcyA9IGF0dHJzLnNob3dZQXhpc1ZhbHVlcyA9PT0gJ3RydWUnO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2V0dXAoKTogdm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG4gICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAuYXR0cigndmlld0JveCcsICcwIDAgJyArICh3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KSArICcgJyArIChoZWlnaHQgKyBtYXJnaW4udG9wICtcbiAgICAgICAgICAgICAgbWFyZ2luLmJvdHRvbSArIFlfQVhJU19IRUlHSFQpKVxuICAgICAgICAgICAgLmF0dHIoJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLCAneE1pbllNaW4gbWVldCcpO1xuXG4gICAgICAgICAgc3ZnID0gY2hhcnQuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsJyArIG1hcmdpbi50b3AgKyAnKScpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnc3BhcmtsaW5lJyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVNwYXJrbGluZUNoYXJ0KGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSB7XG5cbiAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGggLSAxMF0pXG4gICAgICAgICAgICAubmljZSgpXG4gICAgICAgICAgICAuZG9tYWluKFtkYXRhUG9pbnRzWzBdLnRpbWVzdGFtcCwgZGF0YVBvaW50c1tkYXRhUG9pbnRzLmxlbmd0aCAtIDFdLnRpbWVzdGFtcF0pO1xuXG4gICAgICAgICAgbGV0IG51bWJlck9mWFRpY2tzID0gc2hvd1hBeGlzVmFsdWVzID8gMiA6IDA7XG5cbiAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAudGlja3MobnVtYmVyT2ZYVGlja3MpXG4gICAgICAgICAgICAudGlja1NpemUoNCwgMClcbiAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgIC5vcmllbnQoJ2JvdHRvbScpO1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICBsZXQgeU1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCB5TWF4ID0gZDMubWF4KGRhdGFQb2ludHMsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBnaXZlIGEgcGFkIG9mICUgdG8gbWluL21heCBzbyB3ZSBhcmUgbm90IGFnYWluc3QgeC1heGlzXG4gICAgICAgICAgeU1heCA9IHlNYXggKyAoeU1heCAqIDAuMDMpO1xuICAgICAgICAgIHlNaW4gPSB5TWluIC0gKHlNaW4gKiAwLjA1KTtcblxuICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAucmFuZ2VSb3VuZChbU3BhcmtsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX0hFSUdIVCAtIFlfQVhJU19IRUlHSFQsIDBdKVxuICAgICAgICAgICAgLmRvbWFpbihbeU1pbiwgeU1heF0pO1xuXG4gICAgICAgICAgbGV0IG51bWJlck9mWVRpY2tzID0gc2hvd1lBeGlzVmFsdWVzID8gMiA6IDA7XG5cbiAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAudGlja3MobnVtYmVyT2ZZVGlja3MpXG4gICAgICAgICAgICAudGlja1NpemUoMywgMClcbiAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgIGxldCBpbnRlcnBvbGF0aW9uVHlwZSA9ICdiYXNpcyc7XG4gICAgICAgICAgbGV0IGFyZWEgPSBkMy5zdmcuYXJlYSgpXG4gICAgICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvblR5cGUpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAhZC5lbXB0eTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBTcGFya2xpbmVDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hUIC0gWV9BWElTX0hFSUdIVDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueTEoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gdGhpcyBpcyB0aGUgbGluZSB0aGF0IGNhcHMgdGhlIGFyZWFcbiAgICAgICAgICBsZXQgc3BhcmtsaW5lTGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0aW9uVHlwZSlcbiAgICAgICAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICFkLmVtcHR5O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAvLyAtMiBwaXhlbHMgdG8ga2VlcCB0aGUgMiBwaXhlbCBsaW5lIGZyb20gY3Jvc3Npbmcgb3ZlciB0aGUgeC1heGlzXG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpIC0gMjtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IHBhdGhTcGFya2xpbmVMaW5lID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5zcGFya2xpbmVMaW5lJylcbiAgICAgICAgICAgIC5kYXRhKFtkYXRhUG9pbnRzXSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBwYXRoU3BhcmtsaW5lTGluZS5hdHRyKCdjbGFzcycsICdzcGFya2xpbmVMaW5lJylcbiAgICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAgIC5hdHRyKCdkJywgc3BhcmtsaW5lTGluZSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBwYXRoU3BhcmtsaW5lTGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnc3BhcmtsaW5lTGluZScpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuYXR0cignZCcsIHNwYXJrbGluZUxpbmUpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgcGF0aFNwYXJrbGluZUxpbmUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgbGV0IHNwYXJrbGluZUFyZWEgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdzcGFya2xpbmUnKTtcblxuICAgICAgICAgIHNwYXJrbGluZUFyZWEuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5kYXR1bShkYXRhUG9pbnRzKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmR1cmF0aW9uKDUwMClcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdzcGFya2xpbmVBcmVhJylcbiAgICAgICAgICAgIC5hdHRyKCdkJywgYXJlYSk7XG5cbiAgICAgICAgICAvL2lmIChhbGVydFZhbHVlICYmIChhbGVydFZhbHVlID49IHlNaW4gJiYgYWxlcnRWYWx1ZSA8PSB5TWF4KSkge1xuICAgICAgICAgIC8vICBsZXQgYWxlcnRCb3VuZHM6IEFsZXJ0Qm91bmRbXSA9IGV4dHJhY3RBbGVydFJhbmdlcyhkYXRhUG9pbnRzLCBhbGVydFZhbHVlKTtcbiAgICAgICAgICAvLyAgY3JlYXRlQWxlcnRCb3VuZHNBcmVhKHN2Zyx0aW1lU2NhbGUsIHlTY2FsZSx5TWF4LCBhbGVydEJvdW5kcyk7XG4gICAgICAgICAgLy99XG5cbiAgICAgICAgICAvLyBwbGFjZSB0aGUgeCBhbmQgeSBheGVzIGFib3ZlIHRoZSBjaGFydFxuICAgICAgICAgIHlBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd5IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeUF4aXMpO1xuXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgwLCcgKyBoZWlnaHQgKyAnKScpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+PSB5TWluICYmIGFsZXJ0VmFsdWUgPD0geU1heCkpIHtcbiAgICAgICAgICAgIC8vLyBOT1RFOiB0aGlzIGFsZXJ0IGxpbmUgaGFzIGhpZ2hlciBwcmVjZWRlbmNlIGZyb20gYWxlcnQgYXJlYSBhYm92ZVxuICAgICAgICAgICAgY3JlYXRlQWxlcnRMaW5lKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIGRhdGFQb2ludHMsIGFsZXJ0VmFsdWUsICdzcGFya2xpbmVBbGVydExpbmUnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhUG9pbnRzID0gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignYWxlcnRWYWx1ZScsIChuZXdBbGVydFZhbHVlKSA9PiB7XG4gICAgICAgICAgaWYgKG5ld0FsZXJ0VmFsdWUpIHtcbiAgICAgICAgICAgIGFsZXJ0VmFsdWUgPSBuZXdBbGVydFZhbHVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YVBvaW50cykge1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy5kYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOiBJQ2hhcnREYXRhUG9pbnRbXSB7XG4gICAgICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5tYXAoKHBvaW50OiBJQ2hhcnREYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAvL2RhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUucmVuZGVyID0gKGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKGRhdGFQb2ludHMgJiYgZGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUuZ3JvdXAoJ1JlbmRlciBTcGFya2xpbmUgQ2hhcnQnKTtcbiAgICAgICAgICAgIC8vY29uc29sZS50aW1lKCdTcGFya2xpbmVDaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgLy8vTk9URTogbGF5ZXJpbmcgb3JkZXIgaXMgaW1wb3J0YW50IVxuICAgICAgICAgICAgc2V0dXAoKTtcbiAgICAgICAgICAgIGNyZWF0ZVNwYXJrbGluZUNoYXJ0KGRhdGFQb2ludHMpO1xuICAgICAgICAgICAgLy9jb25zb2xlLnRpbWVFbmQoJ1NwYXJrbGluZUNoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgICAvL2NvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBTcGFya2xpbmVDaGFydERpcmVjdGl2ZSgkcm9vdFNjb3BlKTtcbiAgICAgIH07XG5cbiAgICAgIGRpcmVjdGl2ZVsnJGluamVjdCddID0gWyckcm9vdFNjb3BlJ107XG5cbiAgICAgIHJldHVybiBkaXJlY3RpdmU7XG4gICAgfVxuXG4gIH1cblxuICBfbW9kdWxlLmRpcmVjdGl2ZSgnaGF3a3VsYXJTcGFya2xpbmVDaGFydCcsIFNwYXJrbGluZUNoYXJ0RGlyZWN0aXZlLkZhY3RvcnkoKSk7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8vIFR5cGUgdmFsdWVzIGFuZCBJRCB0eXBlc1xuICBleHBvcnQgdHlwZSBBbGVydFRocmVzaG9sZCA9IG51bWJlcjtcbiAgZXhwb3J0IHR5cGUgVGltZUluTWlsbGlzID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBVcmxUeXBlID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBNZXRyaWNJZCA9IHN0cmluZztcbiAgZXhwb3J0IHR5cGUgTWV0cmljVmFsdWUgPSBudW1iZXI7XG5cbiAgLyoqXG4gICAqIE1ldHJpY3MgUmVzcG9uc2UgZnJvbSBIYXdrdWxhciBNZXRyaWNzXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNZXRyaWNzUmVzcG9uc2VEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBUaW1lSW5NaWxsaXM7XG4gICAgZW5kOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIG1pbj86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBtYXg/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgbWVkaWFuPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIHBlcmNlbnRpbGU5NXRoPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIGVtcHR5OiBib29sZWFuO1xuICB9XG5cbiAgZXhwb3J0IGludGVyZmFjZSBJU2ltcGxlTWV0cmljIHtcbiAgICB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcztcbiAgICB2YWx1ZTogTWV0cmljVmFsdWU7XG4gIH1cblxuICBleHBvcnQgaW50ZXJmYWNlIElCYXNlQ2hhcnREYXRhUG9pbnQge1xuICAgIHRpbWVzdGFtcDogVGltZUluTWlsbGlzO1xuICAgIHN0YXJ0PzogVGltZUluTWlsbGlzO1xuICAgIGVuZD86IFRpbWVJbk1pbGxpcztcbiAgICB2YWx1ZT86IE1ldHJpY1ZhbHVlOyAvLy8gT25seSBmb3IgUmF3IGRhdGEgKG5vIGJ1Y2tldHMgb3IgYWdncmVnYXRlcylcbiAgICBhdmc6IE1ldHJpY1ZhbHVlOyAvLy8gbW9zdCBvZiB0aGUgdGltZSB0aGlzIGlzIHRoZSB1c2VmdWwgdmFsdWUgZm9yIGFnZ3JlZ2F0ZXNcbiAgICBlbXB0eTogYm9vbGVhbjsgLy8vIHdpbGwgc2hvdyB1cCBpbiB0aGUgY2hhcnQgYXMgYmxhbmsgLSBzZXQgdGhpcyB3aGVuIHlvdSBoYXZlIE5hTlxuICB9XG5cbiAgLyoqXG4gICAqIFJlcHJlc2VudGF0aW9uIG9mIGRhdGEgcmVhZHkgdG8gYmUgY29uc3VtZWQgYnkgY2hhcnRzLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJQ2hhcnREYXRhUG9pbnQgZXh0ZW5kcyBJQmFzZUNoYXJ0RGF0YVBvaW50IHtcbiAgICBkYXRlPzogRGF0ZTtcbiAgICBtaW46IE1ldHJpY1ZhbHVlO1xuICAgIG1heDogTWV0cmljVmFsdWU7XG4gICAgcGVyY2VudGlsZTk1dGg6IE1ldHJpY1ZhbHVlO1xuICAgIG1lZGlhbjogTWV0cmljVmFsdWU7XG4gIH1cblxuICAvKipcbiAgICogRGF0YSBzdHJ1Y3R1cmUgZm9yIGEgTXVsdGktTWV0cmljIGNoYXJ0LiBDb21wb3NlZCBvZiBJQ2hhcnREYXRhRGF0YVBvaW50W10uXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNdWx0aURhdGFQb2ludCB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAga2V5SGFzaD86IHN0cmluZzsgLy8gZm9yIHVzaW5nIGFzIHZhbGlkIGh0bWwgaWRcbiAgICBjb2xvcj86IHN0cmluZzsgLy8vICNmZmZlZWVcbiAgICB2YWx1ZXM6IElDaGFydERhdGFQb2ludFtdO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLyogdHNsaW50OmRpc2FibGU6bm8tYml0d2lzZSAqL1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyV2lkdGgod2lkdGg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIGJhck9mZnNldCA9IEJBUl9PRkZTRVQpIHtcbiAgICByZXR1cm4gKHdpZHRoIC8gbGVuZ3RoIC0gYmFyT2Zmc2V0KTtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZXMgdGhlIGJhciB3aWR0aCBhZGp1c3RlZCBzbyB0aGF0IHRoZSBmaXJzdCBhbmQgbGFzdCBhcmUgaGFsZi13aWR0aCBvZiB0aGUgb3RoZXJzXG4gIC8vIHNlZSBodHRwczovL2lzc3Vlcy5qYm9zcy5vcmcvYnJvd3NlL0hBV0tVTEFSLTgwOSBmb3IgaW5mbyBvbiB3aHkgdGhpcyBpcyBuZWVkZWRcbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGxlbmd0aDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIChpID09PSAwIHx8IGkgPT09IGxlbmd0aCAtIDEpID8gY2FsY0JhcldpZHRoKHdpZHRoLCBsZW5ndGgsIEJBUl9PRkZTRVQpIC8gMiA6XG4gICAgICBjYWxjQmFyV2lkdGgod2lkdGgsIGxlbmd0aCwgQkFSX09GRlNFVCk7XG4gIH1cblxuICAvLyBDYWxjdWxhdGVzIHRoZSBiYXIgWCBwb3NpdGlvbi4gV2hlbiB1c2luZyBjYWxjQmFyV2lkdGhBZGp1c3RlZCwgaXQgaXMgcmVxdWlyZWQgdG8gcHVzaCBiYXJzXG4gIC8vIG90aGVyIHRoYW4gdGhlIGZpcnN0IGhhbGYgYmFyIHRvIHRoZSBsZWZ0LCB0byBtYWtlIHVwIGZvciB0aGUgZmlyc3QgYmVpbmcganVzdCBoYWxmIHdpZHRoXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGU6IGFueSwgbGVuZ3RoOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKSAtIChpID09PSAwID8gMCA6IGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKSAvIDIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFuIGVtcHR5IGRhdGFwb2ludCBoYXMgJ2VtcHR5JyBhdHRyaWJ1dGUgc2V0IHRvIHRydWUuIFVzZWQgdG8gZGlzdGluZ3Vpc2ggZnJvbSByZWFsIDAgdmFsdWVzLlxuICAgKiBAcGFyYW0gZFxuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5RGF0YVBvaW50KGQ6IElDaGFydERhdGFQb2ludCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBkLmVtcHR5O1xuICB9XG5cbiAgLyoqXG4gICAqIFJhdyBtZXRyaWNzIGhhdmUgYSAndmFsdWUnIHNldCBpbnN0ZWFkIG9mIGF2Zy9taW4vbWF4IG9mIGFnZ3JlZ2F0ZXNcbiAgICogQHBhcmFtIGRcbiAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAqL1xuICBleHBvcnQgZnVuY3Rpb24gaXNSYXdNZXRyaWMoZDogSUNoYXJ0RGF0YVBvaW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHR5cGVvZiBkLmF2ZyA9PT0gJ3VuZGVmaW5lZCc7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24geEF4aXNUaW1lRm9ybWF0cygpIHtcbiAgICByZXR1cm4gZDMudGltZS5mb3JtYXQubXVsdGkoW1xuICAgICAgWycuJUwnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaWxsaXNlY29uZHMoKTtcbiAgICAgIH1dLFxuICAgICAgWyc6JVMnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRTZWNvbmRzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJUg6JU0nLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaW51dGVzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJUg6JU0nLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRIb3VycygpO1xuICAgICAgfV0sXG4gICAgICBbJyVhICVkJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0RGF5KCkgJiYgZC5nZXREYXRlKCkgIT09IDE7XG4gICAgICB9XSxcbiAgICAgIFsnJWIgJWQnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXREYXRlKCkgIT09IDE7XG4gICAgICB9XSxcbiAgICAgIFsnJUInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNb250aCgpO1xuICAgICAgfV0sXG4gICAgICBbJyVZJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1dXG4gICAgXSk7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlU3ZnRGVmcyhjaGFydCkge1xuXG4gICAgbGV0IGRlZnMgPSBjaGFydC5hcHBlbmQoJ2RlZnMnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICdub0RhdGFTdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdkJywgJ00gMCAwIDYgMCcpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiNDQ0NDQ0M7IGZpbGw6bm9uZTsnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICd1bmtub3duU3RyaXBlcycpXG4gICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgIC5hdHRyKCd4JywgJzAnKVxuICAgICAgLmF0dHIoJ3knLCAnMCcpXG4gICAgICAuYXR0cignd2lkdGgnLCAnNicpXG4gICAgICAuYXR0cignaGVpZ2h0JywgJzMnKVxuICAgICAgLmF0dHIoJ3N0eWxlJywgJ3N0cm9rZTojMkU5RUMyOyBmaWxsOm5vbmU7JylcbiAgICAgIC5hcHBlbmQoJ3BhdGgnKS5hdHRyKCdkJywgJ00gMCAwIDYgMCcpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ2Rvd25TdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiNmZjhhOWE7IGZpbGw6bm9uZTsnKVxuICAgICAgLmFwcGVuZCgncGF0aCcpLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJyk7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZTogYW55KSB7XG4gICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gIH1cblxuICAvLyBhZGFwdGVkIGZyb20gaHR0cDovL3dlcnhsdGQuY29tL3dwLzIwMTAvMDUvMTMvamF2YXNjcmlwdC1pbXBsZW1lbnRhdGlvbi1vZi1qYXZhcy1zdHJpbmctaGFzaGNvZGUtbWV0aG9kL1xuICBleHBvcnQgZnVuY3Rpb24gaGFzaFN0cmluZyhzdHI6IHN0cmluZyk6IG51bWJlciB7XG4gICAgbGV0IGhhc2ggPSAwLCBpLCBjaHIsIGxlbjtcbiAgICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGhhc2g7XG4gICAgfVxuICAgIGZvciAoaSA9IDAsIGxlbiA9IHN0ci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgY2hyID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICBoYXNoID0gKChoYXNoIDw8IDUpIC0gaGFzaCkgKyBjaHI7XG4gICAgICBoYXNoIHw9IDA7IC8vIENvbnZlcnQgdG8gMzJiaXQgaW50ZWdlclxuICAgIH1cbiAgICByZXR1cm4gaGFzaDtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBcmVhQ2hhcnQoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICBoZWlnaHQ/OiBudW1iZXIsXG4gICAgaW50ZXJwb2xhdGlvbj86IHN0cmluZyxcbiAgICBoaWRlSGlnaExvd1ZhbHVlcz86IGJvb2xlYW4pIHtcblxuICAgIGxldCBoaWdoQXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0aW9uKVxuICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1heCk7XG4gICAgICB9KVxuICAgICAgLnkwKChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pLFxuXG4gICAgICBhdmdBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSkueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBoaWRlSGlnaExvd1ZhbHVlcyA/IGhlaWdodCA6IHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pLFxuXG4gICAgICBsb3dBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnkwKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gaGVpZ2h0O1xuICAgICAgICB9KTtcblxuICAgIGlmICghaGlkZUhpZ2hMb3dWYWx1ZXMpIHtcbiAgICAgIGxldCBoaWdoQXJlYVBhdGggPSBzdmcuc2VsZWN0QWxsKCdwYXRoLmhpZ2hBcmVhJykuZGF0YShbY2hhcnREYXRhXSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGhpZ2hBcmVhUGF0aC5hdHRyKCdjbGFzcycsICdoaWdoQXJlYScpXG4gICAgICAgIC5hdHRyKCdkJywgaGlnaEFyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBoaWdoQXJlYVBhdGguZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlnaEFyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGhpZ2hBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgaGlnaEFyZWFQYXRoLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgbGV0IGxvd0FyZWFQYXRoID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5sb3dBcmVhJykuZGF0YShbY2hhcnREYXRhXSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxvd0FyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2xvd0FyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGxvd0FyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBsb3dBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdsb3dBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBsb3dBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgbG93QXJlYVBhdGguZXhpdCgpLnJlbW92ZSgpO1xuICAgIH1cblxuICAgIGxldCBhdmdBcmVhUGF0aCA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGguYXZnQXJlYScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGF2Z0FyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2F2Z0FyZWEnKVxuICAgICAgLmF0dHIoJ2QnLCBhdmdBcmVhKTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBhdmdBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignY2xhc3MnLCAnYXZnQXJlYScpXG4gICAgICAuYXR0cignZCcsIGF2Z0FyZWEpO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGF2Z0FyZWFQYXRoLmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlSGlzdG9ncmFtQ2hhcnQoc3ZnOiBhbnksXG4gICAgdGltZVNjYWxlOiBhbnksXG4gICAgeVNjYWxlOiBhbnksXG4gICAgY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSxcbiAgICB0aXA6IGFueSxcbiAgICBoZWlnaHQ/OiBudW1iZXIsXG4gICAgc3RhY2tlZD86IGJvb2xlYW4sXG4gICAgdmlzdWFsbHlBZGp1c3RlZE1heD86IG51bWJlcixcbiAgICBoaWRlSGlnaExvd1ZhbHVlcz86IGJvb2xlYW4pIHtcblxuICAgIGNvbnN0IGJhckNsYXNzID0gc3RhY2tlZCA/ICdsZWFkZXJCYXInIDogJ2hpc3RvZ3JhbSc7XG5cbiAgICBjb25zdCByZWN0SGlzdG9ncmFtID0gc3ZnLnNlbGVjdEFsbCgncmVjdC4nICsgYmFyQ2xhc3MpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgIGZ1bmN0aW9uIGJ1aWxkQmFycyhzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgYmFyQ2xhc3MpXG4gICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgLmF0dHIoJ3gnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGUsIGNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBoZWlnaHQgLSB5U2NhbGUoaXNFbXB0eURhdGFQb2ludChkKSA/IHlTY2FsZSh2aXN1YWxseUFkanVzdGVkTWF4KSA6IGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ29wYWNpdHknLCBzdGFja2VkID8gJy42JyA6ICcxJylcbiAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gJ3VybCgjbm9EYXRhU3RyaXBlcyknIDogKHN0YWNrZWQgPyAnI0QzRDNENicgOiAnI0MwQzBDMCcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3NzcnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignZGF0YS1oYXdrdWxhci12YWx1ZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGQuYXZnO1xuICAgICAgICB9KTtcblxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkSGlnaEJhcihzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gZC5taW4gPT09IGQubWF4ID8gJ3NpbmdsZVZhbHVlJyA6ICdoaWdoJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gnLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJYUG9zKGQsIGksIHRpbWVTY2FsZSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNOYU4oZC5tYXgpID8geVNjYWxlKHZpc3VhbGx5QWRqdXN0ZWRNYXgpIDogeVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogKHlTY2FsZShkLmF2ZykgLSB5U2NhbGUoZC5tYXgpIHx8IDIpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignd2lkdGgnLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydERhdGEubGVuZ3RoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjkpXG4gICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIHRpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkTG93ZXJCYXIoc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgc2VsZWN0aW9uXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdsb3cnKVxuICAgICAgICAuYXR0cigneCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNhbGNCYXJYUG9zKGQsIGksIHRpbWVTY2FsZSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNOYU4oZC5hdmcpID8gaGVpZ2h0IDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2hlaWdodCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogKHlTY2FsZShkLm1pbikgLSB5U2NhbGUoZC5hdmcpKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2FsY0JhcldpZHRoQWRqdXN0ZWQoaSwgY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdvcGFjaXR5JywgMC45KVxuICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICB0aXAuaGlkZSgpO1xuICAgICAgICB9KTtcblxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkVG9wU3RlbShzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbVRvcFN0ZW0nKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAwLjY7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkTG93U3RlbShzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbUJvdHRvbVN0ZW0nKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICB9KS5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZFRvcENyb3NzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtVG9wQ3Jvc3MnKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZEJvdHRvbUNyb3NzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgIHNlbGVjdGlvblxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS1vcGFjaXR5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVIaXN0b2dyYW1IaWdoTG93VmFsdWVzKHN2ZzogYW55LCBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCBzdGFja2VkPzogYm9vbGVhbikge1xuICAgICAgaWYgKHN0YWNrZWQpIHtcbiAgICAgICAgLy8gdXBwZXIgcG9ydGlvbiByZXByZXNlbnRpbmcgYXZnIHRvIGhpZ2hcbiAgICAgICAgY29uc3QgcmVjdEhpZ2ggPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmhpZ2gsIHJlY3Quc2luZ2xlVmFsdWUnKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIHJlY3RIaWdoLmNhbGwoYnVpbGRIaWdoQmFyKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgcmVjdEhpZ2hcbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgICAgIC5jYWxsKGJ1aWxkSGlnaEJhcik7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIHJlY3RIaWdoLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAvLyBsb3dlciBwb3J0aW9uIHJlcHJlc2VudGluZyBhdmcgdG8gbG93XG4gICAgICAgIGNvbnN0IHJlY3RMb3cgPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmxvdycpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgcmVjdExvdy5jYWxsKGJ1aWxkTG93ZXJCYXIpO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICByZWN0TG93XG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgICAgICAuY2FsbChidWlsZExvd2VyQmFyKTtcblxuICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgcmVjdExvdy5leGl0KCkucmVtb3ZlKCk7XG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIGNvbnN0IGxpbmVIaXN0b0hpZ2hTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcFN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxpbmVIaXN0b0hpZ2hTdGVtLmNhbGwoYnVpbGRUb3BTdGVtKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgbGluZUhpc3RvSGlnaFN0ZW1cbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxpbmVIaXN0b0hpZ2hTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICBjb25zdCBsaW5lSGlzdG9Mb3dTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxpbmVIaXN0b0xvd1N0ZW0uY2FsbChidWlsZExvd1N0ZW0pO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtXG4gICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAuY2FsbChidWlsZExvd1N0ZW0pO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICBjb25zdCBsaW5lSGlzdG9Ub3BDcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Ub3BDcm9zcycpLmRhdGEoY2hhcnREYXRhKTtcblxuICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3MuY2FsbChidWlsZFRvcENyb3NzKTtcblxuICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3NcbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wQ3Jvc3MpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgY29uc3QgbGluZUhpc3RvQm90dG9tQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zcy5jYWxsKGJ1aWxkQm90dG9tQ3Jvc3MpO1xuXG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zc1xuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgLmNhbGwoYnVpbGRCb3R0b21Dcm9zcyk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzLmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICByZWN0SGlzdG9ncmFtLmNhbGwoYnVpbGRCYXJzKTtcblxuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIHJlY3RIaXN0b2dyYW0uZW50ZXIoKVxuICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAuY2FsbChidWlsZEJhcnMpO1xuXG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgcmVjdEhpc3RvZ3JhbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBpZiAoIWhpZGVIaWdoTG93VmFsdWVzKSB7XG4gICAgICBjcmVhdGVIaXN0b2dyYW1IaWdoTG93VmFsdWVzKHN2ZywgY2hhcnREYXRhLCBzdGFja2VkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gd2Ugc2hvdWxkIGhpZGUgaGlnaC1sb3cgdmFsdWVzLi4gb3IgcmVtb3ZlIGlmIGV4aXN0aW5nXG4gICAgICBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtVG9wU3RlbSwgLmhpc3RvZ3JhbUJvdHRvbVN0ZW0sIC5oaXN0b2dyYW1Ub3BDcm9zcywgLmhpc3RvZ3JhbUJvdHRvbUNyb3NzJykucmVtb3ZlKCk7XG4gICAgfVxuXG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlTGluZUNoYXJ0KHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgaGVpZ2h0PzogbnVtYmVyLFxuICAgIGludGVycG9sYXRpb24/OiBzdHJpbmcpIHtcblxuICAgIGxldCBtZXRyaWNDaGFydExpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGlvbilcbiAgICAgIC5kZWZpbmVkKChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICB9KVxuICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSk7XG5cbiAgICBsZXQgcGF0aE1ldHJpYyA9IHN2Zy5zZWxlY3RBbGwoJ3BhdGgubWV0cmljTGluZScpLmRhdGEoW2NoYXJ0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHBhdGhNZXRyaWMuYXR0cignY2xhc3MnLCAnbWV0cmljTGluZScpXG4gICAgICAudHJhbnNpdGlvbigpXG4gICAgICAuYXR0cignZCcsIG1ldHJpY0NoYXJ0TGluZSk7XG5cbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBwYXRoTWV0cmljLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdjbGFzcycsICdtZXRyaWNMaW5lJylcbiAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgIC5hdHRyKCdkJywgbWV0cmljQ2hhcnRMaW5lKTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHBhdGhNZXRyaWMuZXhpdCgpLnJlbW92ZSgpO1xuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNjYXR0ZXJDaGFydChzdmc6IGFueSxcbiAgICB0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLFxuICAgIGhlaWdodD86IG51bWJlcixcbiAgICBpbnRlcnBvbGF0aW9uPzogc3RyaW5nLFxuICAgIGhpZGVIaWdoTG93VmFsdWVzPzogYm9vbGVhbikge1xuXG4gICAgaWYgKCFoaWRlSGlnaExvd1ZhbHVlcykge1xuXG4gICAgICBsZXQgaGlnaERvdENpcmNsZSA9IHN2Zy5zZWxlY3RBbGwoJy5oaWdoRG90JykuZGF0YShjaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBoaWdoRG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2hpZ2hEb3QnKVxuICAgICAgICAuZmlsdGVyKChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyNmZjFhMTMnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgaGlnaERvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hEb3QnKVxuICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjZmYxYTEzJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGhpZ2hEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgbG93RG90Q2lyY2xlID0gc3ZnLnNlbGVjdEFsbCgnLmxvd0RvdCcpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgbG93RG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2xvd0RvdCcpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbG93RG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93RG90JylcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBsb3dEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHdlIHNob3VsZCBoaWRlIGhpZ2gtbG93IHZhbHVlcy4uIG9yIHJlbW92ZSBpZiBleGlzdGluZ1xuICAgICAgc3ZnLnNlbGVjdEFsbCgnLmhpZ2hEb3QsIC5sb3dEb3QnKS5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBsZXQgYXZnRG90Q2lyY2xlID0gc3ZnLnNlbGVjdEFsbCgnLmF2Z0RvdCcpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBhdmdEb3RDaXJjbGUuYXR0cignY2xhc3MnLCAnYXZnRG90JylcbiAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiAnI0ZGRic7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgYXZnRG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2Z0RvdCcpXG4gICAgICAuYXR0cigncicsIDMpXG4gICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gJyNGRkYnO1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGF2Z0RvdENpcmNsZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTY2F0dGVyTGluZUNoYXJ0KHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgaGVpZ2h0PzogbnVtYmVyLFxuICAgIGludGVycG9sYXRpb24/OiBzdHJpbmcsXG4gICAgaGlkZUhpZ2hMb3dWYWx1ZXM/OiBib29sZWFuKSB7XG4gICAgbGV0IGxpbmVTY2F0dGVyVG9wU3RlbSA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZVRvcFN0ZW0nKS5kYXRhKGNoYXJ0RGF0YSk7XG4gICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgbGluZVNjYXR0ZXJUb3BTdGVtLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lVG9wU3RlbScpXG4gICAgICAuZmlsdGVyKChkOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BTdGVtJylcbiAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBsZXQgbGluZVNjYXR0ZXJCb3R0b21TdGVtID0gc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lQm90dG9tU3RlbScpLmRhdGEoY2hhcnREYXRhKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21TdGVtJylcbiAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGxpbmVTY2F0dGVyQm90dG9tU3RlbS5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21TdGVtJylcbiAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZSk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQuYXZnKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGxpbmVTY2F0dGVyQm90dG9tU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBsZXQgbGluZVNjYXR0ZXJUb3BDcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZVRvcENyb3NzJykuZGF0YShjaGFydERhdGEpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BDcm9zcycpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgbGluZVNjYXR0ZXJUb3BDcm9zcy5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BDcm9zcycpXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWF4KTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgbGluZVNjYXR0ZXJUb3BDcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBsZXQgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZUJvdHRvbUNyb3NzJykuZGF0YShjaGFydERhdGEpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgfSk7XG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcy5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21Dcm9zcycpXG4gICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpIC0gMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpICsgMztcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geVNjYWxlKGQubWluKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgIH0pXG4gICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcy5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICBsZXQgY2lyY2xlU2NhdHRlckRvdCA9IHN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyRG90JykuZGF0YShjaGFydERhdGEpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGNpcmNsZVNjYXR0ZXJEb3QuYXR0cignY2xhc3MnLCAnc2NhdHRlckRvdCcpXG4gICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cigncicsIDMpXG4gICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCB0aW1lU2NhbGUpO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICB9KVxuICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnb3BhY2l0eScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcxJztcbiAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICB9KTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBjaXJjbGVTY2F0dGVyRG90LmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICB9KVxuICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJEb3QnKVxuICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgdGltZVNjYWxlKTtcbiAgICAgIH0pXG4gICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyB5U2NhbGUoZC52YWx1ZSkgOiB5U2NhbGUoZC5hdmcpO1xuICAgICAgfSlcbiAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuICcjNzBjNGUyJztcbiAgICAgIH0pXG4gICAgICAuc3R5bGUoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiAnMSc7XG4gICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgfSk7XG4gICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgY2lyY2xlU2NhdHRlckRvdC5leGl0KCkucmVtb3ZlKCk7XG5cbiAgfVxuXG59XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
