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
                startTimestamp: '@',
                endTimestamp: '@',
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
                    //let's use 92.5% of parents width
                    width = parentNode.clientWidth * 0.925;
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
                function redrawBrush(startTimestamp, endTimestamp) {
                    if (brush) {
                        brush.extent([new Date(startTimestamp), new Date(endTimestamp)]);
                        brush(d3.select('hk-context-chart .brush').transition());
                        brush.event(d3.select('hk-context-chart .brush').transition());
                    }
                }
                //d3.select(window).on('resize', scope.render(this.dataPoints));
                scope.$watchCollection('data', function (newData) {
                    if (newData) {
                        _this.dataPoints = formatBucketedChartOutput(angular.fromJson(newData));
                        scope.render(_this.dataPoints);
                    }
                });
                scope.$watchGroup(['startTimestamp', 'endTimestamp'], function (newTimestamp) {
                    var startTimestamp = +newTimestamp[0] || +scope.startTimestamp;
                    var endTimestamp = +newTimestamp[1] || +scope.endTimestamp;
                    redrawBrush(startTimestamp, endTimestamp);
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
        function EmsEvent(timestamp, eventSource, provider, html, message, resource) {
            this.timestamp = timestamp;
            this.eventSource = eventSource;
            this.provider = provider;
            this.html = html;
            this.message = message;
            this.resource = resource;
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
        function TimelineEvent(timestamp, eventSource, provider, html, message, resource, formattedDate, color, row, selected) {
            _super.call(this, timestamp, eventSource, provider, html, message, resource);
            this.timestamp = timestamp;
            this.eventSource = eventSource;
            this.provider = provider;
            this.html = html;
            this.message = message;
            this.resource = resource;
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
                        html: emsEvent.html && "<div class='chartHover'> " + emsEvent.html + "</div>",
                        message: emsEvent.message,
                        resource: emsEvent.resource,
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
                var event_1 = new TimelineEvent(randomTime, 'Hawkular', 'Hawkular Provider', null, 'Some Message', 'Resource' + '-' + Random.randomBetween(10, 100), moment(i).format('MMMM Do YYYY, h:mm:ss a'), '0088ce', RowNumber.nextRow());
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
                var startTimestamp = +scope.startTimestamp, endTimestamp = +scope.endTimestamp, chartHeight = TimelineChartDirective._CHART_HEIGHT;
                // chart specific vars
                var margin = { top: 10, right: 5, bottom: 5, left: 10 }, width = TimelineChartDirective._CHART_WIDTH - margin.left - margin.right, adjustedChartHeight = chartHeight - 50, height = adjustedChartHeight - margin.top - margin.bottom, titleHeight = 30, titleSpace = 10, innerChartHeight = height + margin.top - titleHeight - titleSpace, adjustedChartHeight2 = +titleHeight + titleSpace + margin.top, yScale, timeScale, yAxis, xAxis, xAxisGroup, brush, brushGroup, tip, chart, chartParent, svg;
                function TimelineHover(d) {
                    return "<div class='chartHover'>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Event Source:</span>\n              <span class='chartHoverValue'>" + d.eventSource + "</span>\n            </div>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Provider:</span>\n              <span class='chartHoverValue'>" + d.provider + "</span>\n            </div>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Message:</span>\n              <span class='chartHoverValue'>" + d.message + "</span>\n            </div>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Middleware Resource:</span>\n              <span class='chartHoverValue'>" + d.resource + "</span>\n            </div>\n            <div class='info-item'>\n              <span class='chartHoverLabel'>Date Time:</span>\n              <span class='chartHoverValue'>" + moment(d.timestamp).format('M/D/YY, H:mm:ss ') + "</span>\n            </div>\n          </div>";
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
                        .html(function (d) {
                        return (d.html) ? d.html : TimelineHover(d);
                    });
                    svg = chart.append('g')
                        .attr('width', width + margin.left + margin.right)
                        .attr('height', innerChartHeight)
                        .attr('transform', 'translate(' + margin.left + ',' + (adjustedChartHeight2) + ')');
                    svg.call(tip);
                }
                function positionTip(circle, d, i) {
                    tip.show(d, i);
                    var tipPosition = Number(circle.attr('cx')) + Number(tip.style('width').slice(0, -2));
                    if (tipPosition > TimelineChartDirective._CHART_WIDTH) {
                        tip.direction('w')
                            .offset([0, -10])
                            .show(d, i);
                    }
                    else {
                        tip.direction('e')
                            .offset([0, 10])
                            .show(d, i);
                    }
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
                function createTimelineChart(timelineEvents) {
                    var xAxisMin = +attrs.startTimestamp ||
                        d3.min(timelineEvents, function (d) {
                            return +d.timestamp;
                        });
                    var xAxisMax = +attrs.endTimestamp || d3.max(timelineEvents, function (d) {
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
                        .data(timelineEvents)
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
                        var circle = d3.select(this);
                        positionTip(circle, d, i);
                    }).on('mouseout', function () {
                        tip.hide();
                    }).on('dblclick', function (d) {
                        console.log('Double-Clicked:', d);
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImhhd2t1bGFyLW1ldHJpY3MtY2hhcnRzLm1vZHVsZS50cyIsImNoYXJ0L2FsZXJ0cy50cyIsImNoYXJ0L2F2YWlsLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L2NvbnRleHQtY2hhcnQtZGlyZWN0aXZlLnRzIiwiY2hhcnQvZXZlbnQtbmFtZXMudHMiLCJjaGFydC9mZWF0dXJlcy50cyIsImNoYXJ0L2ZvcmVjYXN0LnRzIiwiY2hhcnQvbWV0cmljLWNoYXJ0LWRpcmVjdGl2ZS50cyIsImNoYXJ0L3RpbWVsaW5lLWRpcmVjdGl2ZS50cyIsImNoYXJ0L3R5cGVzLnRzIiwiY2hhcnQvdXRpbGl0eS50cyIsImNoYXJ0L2NoYXJ0LXR5cGUvYWJzdHJhY3QtaGlzdG9ncmFtLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9hcmVhLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9jaGFydC10eXBlLnRzIiwiY2hhcnQvY2hhcnQtdHlwZS9oaXN0b2dyYW0udHMiLCJjaGFydC9jaGFydC10eXBlL2xpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL211bHRpLWxpbmUudHMiLCJjaGFydC9jaGFydC10eXBlL3JocS1iYXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXIudHMiLCJjaGFydC9jaGFydC10eXBlL3NjYXR0ZXJMaW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7O0FDUHRDLCtDQUErQztBQUUvQyxJQUFVLE1BQU0sQ0FxSmY7QUFySkQsV0FBVSxNQUFNLEVBQUMsQ0FBQztJQUNoQixZQUFZLENBQUM7SUFFYjs7O09BR0c7SUFDSDtRQUlFLG9CQUFtQixjQUE0QixFQUN0QyxZQUEwQixFQUMxQixVQUFrQjtZQUZSLG1CQUFjLEdBQWQsY0FBYyxDQUFjO1lBQ3RDLGlCQUFZLEdBQVosWUFBWSxDQUFjO1lBQzFCLGVBQVUsR0FBVixVQUFVLENB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QUF3UEMsSUFBQTtJQXhQWSx1QkFBZ0IsbUJBd1A1QixDQUFBO0FBQ0gsQ0FBQyxFQTlQUyxNQUFNLEtBQU4sTUFBTSxRQThQZiIsImZpbGUiOiJoYXdrdWxhci1jaGFydHMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBuYW1lICBoYXdrdWxhci1jaGFydHNcbiAqXG4gKiBAZGVzY3JpcHRpb25cbiAqICAgQmFzZSBtb2R1bGUgZm9yIGhhd2t1bGFyLWNoYXJ0cy5cbiAqXG4gKi9cbmFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnLCBbXSk7XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8qKlxuICAgKiBEZWZpbmVzIGFuIGluZGl2aWR1YWwgYWxlcnQgYm91bmRzICB0byBiZSB2aXN1YWxseSBoaWdobGlnaHRlZCBpbiBhIGNoYXJ0XG4gICAqIHRoYXQgYW4gYWxlcnQgd2FzIGFib3ZlL2JlbG93IGEgdGhyZXNob2xkLlxuICAgKi9cbiAgZXhwb3J0IGNsYXNzIEFsZXJ0Qm91bmQge1xuICAgIHB1YmxpYyBzdGFydERhdGU6IERhdGU7XG4gICAgcHVibGljIGVuZERhdGU6IERhdGU7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgc3RhcnRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgIHB1YmxpYyBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgIHB1YmxpYyBhbGVydFZhbHVlOiBudW1iZXIpIHtcbiAgICAgIHRoaXMuc3RhcnREYXRlID0gbmV3IERhdGUoc3RhcnRUaW1lc3RhbXApO1xuICAgICAgdGhpcy5lbmREYXRlID0gbmV3IERhdGUoZW5kVGltZXN0YW1wKTtcbiAgICB9XG5cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUFsZXJ0TGluZURlZih0aW1lU2NhbGU6IGFueSxcbiAgICB5U2NhbGU6IGFueSxcbiAgICBhbGVydFZhbHVlOiBudW1iZXIpIHtcbiAgICBsZXQgbGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgIC5pbnRlcnBvbGF0ZSgnbW9ub3RvbmUnKVxuICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgIH0pXG4gICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB5U2NhbGUoYWxlcnRWYWx1ZSk7XG4gICAgICB9KTtcblxuICAgIHJldHVybiBsaW5lO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFsZXJ0TGluZShjaGFydE9wdGlvbnM6IENoYXJ0T3B0aW9ucyxcbiAgICBhbGVydFZhbHVlOiBudW1iZXIsXG4gICAgY3NzQ2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBsZXQgcGF0aEFsZXJ0TGluZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdwYXRoLmFsZXJ0TGluZScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICBwYXRoQWxlcnRMaW5lLmF0dHIoJ2NsYXNzJywgY3NzQ2xhc3NOYW1lKVxuICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVBbGVydExpbmVEZWYoY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLnlTY2FsZSwgYWxlcnRWYWx1ZSkpO1xuXG4gICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgcGF0aEFsZXJ0TGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAuYXR0cignY2xhc3MnLCBjc3NDbGFzc05hbWUpXG4gICAgICAuYXR0cignZCcsIGNyZWF0ZUFsZXJ0TGluZURlZihjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlLCBhbGVydFZhbHVlKSk7XG5cbiAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICBwYXRoQWxlcnRMaW5lLmV4aXQoKS5yZW1vdmUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGV4dHJhY3RBbGVydFJhbmdlcyhjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCB0aHJlc2hvbGQ6IEFsZXJ0VGhyZXNob2xkKTogQWxlcnRCb3VuZFtdIHtcbiAgICBsZXQgYWxlcnRCb3VuZEFyZWFJdGVtczogQWxlcnRCb3VuZFtdO1xuICAgIGxldCBzdGFydFBvaW50czogbnVtYmVyW107XG5cbiAgICBmdW5jdGlvbiBmaW5kU3RhcnRQb2ludHMoY2hhcnREYXRhOiBJQ2hhcnREYXRhUG9pbnRbXSwgdGhyZXNob2xkOiBBbGVydFRocmVzaG9sZCkge1xuICAgICAgbGV0IHN0YXJ0UG9pbnRzID0gW107XG4gICAgICBsZXQgcHJldkl0ZW06IElDaGFydERhdGFQb2ludDtcblxuICAgICAgY2hhcnREYXRhLmZvckVhY2goKGNoYXJ0SXRlbTogSUNoYXJ0RGF0YVBvaW50LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgaWYgKGkgPT09IDAgJiYgY2hhcnRJdGVtLmF2ZyA+IHRocmVzaG9sZCkge1xuICAgICAgICAgIHN0YXJ0UG9pbnRzLnB1c2goaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHJldkl0ZW0gPSBjaGFydERhdGFbaSAtIDFdO1xuICAgICAgICAgIGlmIChjaGFydEl0ZW0uYXZnID4gdGhyZXNob2xkICYmIHByZXZJdGVtICYmICghcHJldkl0ZW0uYXZnIHx8IHByZXZJdGVtLmF2ZyA8PSB0aHJlc2hvbGQpKSB7XG4gICAgICAgICAgICBzdGFydFBvaW50cy5wdXNoKHByZXZJdGVtLmF2ZyA/IChpIC0gMSkgOiBpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgfSk7XG4gICAgICByZXR1cm4gc3RhcnRQb2ludHM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleChzdGFydFBvaW50czogbnVtYmVyW10sIHRocmVzaG9sZDogQWxlcnRUaHJlc2hvbGQpOiBBbGVydEJvdW5kW10ge1xuICAgICAgbGV0IGFsZXJ0Qm91bmRBcmVhSXRlbXM6IEFsZXJ0Qm91bmRbXSA9IFtdO1xuICAgICAgbGV0IGN1cnJlbnRJdGVtOiBJQ2hhcnREYXRhUG9pbnQ7XG4gICAgICBsZXQgbmV4dEl0ZW06IElDaGFydERhdGFQb2ludDtcbiAgICAgIGxldCBzdGFydEl0ZW06IElDaGFydERhdGFQb2ludDtcblxuICAgICAgc3RhcnRQb2ludHMuZm9yRWFjaCgoc3RhcnRQb2ludEluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgc3RhcnRJdGVtID0gY2hhcnREYXRhW3N0YXJ0UG9pbnRJbmRleF07XG5cbiAgICAgICAgZm9yIChsZXQgaiA9IHN0YXJ0UG9pbnRJbmRleDsgaiA8IGNoYXJ0RGF0YS5sZW5ndGggLSAxOyBqKyspIHtcbiAgICAgICAgICBjdXJyZW50SXRlbSA9IGNoYXJ0RGF0YVtqXTtcbiAgICAgICAgICBuZXh0SXRlbSA9IGNoYXJ0RGF0YVtqICsgMV07XG5cbiAgICAgICAgICBpZiAoKGN1cnJlbnRJdGVtLmF2ZyA+IHRocmVzaG9sZCAmJiBuZXh0SXRlbS5hdmcgPD0gdGhyZXNob2xkKVxuICAgICAgICAgICAgfHwgKGN1cnJlbnRJdGVtLmF2ZyA+IHRocmVzaG9sZCAmJiAhbmV4dEl0ZW0uYXZnKSkge1xuICAgICAgICAgICAgYWxlcnRCb3VuZEFyZWFJdGVtcy5wdXNoKG5ldyBBbGVydEJvdW5kKHN0YXJ0SXRlbS50aW1lc3RhbXAsXG4gICAgICAgICAgICAgIG5leHRJdGVtLmF2ZyA/IG5leHRJdGVtLnRpbWVzdGFtcCA6IGN1cnJlbnRJdGVtLnRpbWVzdGFtcCwgdGhyZXNob2xkKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLy8gbWVhbnMgdGhlIGxhc3QgcGllY2UgZGF0YSBpcyBhbGwgYWJvdmUgdGhyZXNob2xkLCB1c2UgbGFzdCBkYXRhIHBvaW50XG4gICAgICBpZiAoYWxlcnRCb3VuZEFyZWFJdGVtcy5sZW5ndGggPT09IChzdGFydFBvaW50cy5sZW5ndGggLSAxKSkge1xuICAgICAgICBhbGVydEJvdW5kQXJlYUl0ZW1zLnB1c2gobmV3IEFsZXJ0Qm91bmQoY2hhcnREYXRhW3N0YXJ0UG9pbnRzW3N0YXJ0UG9pbnRzLmxlbmd0aCAtIDFdXS50aW1lc3RhbXAsXG4gICAgICAgICAgY2hhcnREYXRhW2NoYXJ0RGF0YS5sZW5ndGggLSAxXS50aW1lc3RhbXAsIHRocmVzaG9sZCkpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYWxlcnRCb3VuZEFyZWFJdGVtcztcbiAgICB9XG5cbiAgICBzdGFydFBvaW50cyA9IGZpbmRTdGFydFBvaW50cyhjaGFydERhdGEsIHRocmVzaG9sZCk7XG5cbiAgICBhbGVydEJvdW5kQXJlYUl0ZW1zID0gZmluZEVuZFBvaW50c0ZvclN0YXJ0UG9pbnRJbmRleChzdGFydFBvaW50cywgdGhyZXNob2xkKTtcblxuICAgIHJldHVybiBhbGVydEJvdW5kQXJlYUl0ZW1zO1xuXG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlQWxlcnRCb3VuZHNBcmVhKGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zLFxuICAgIGFsZXJ0VmFsdWU6IG51bWJlcixcbiAgICBoaWdoQm91bmQ6IG51bWJlclxuICApIHtcbiAgICBjb25zdCBhbGVydEJvdW5kczogQWxlcnRCb3VuZFtdID0gZXh0cmFjdEFsZXJ0UmFuZ2VzKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEsIGFsZXJ0VmFsdWUpO1xuICAgIGxldCByZWN0QWxlcnQgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdCgnZy5hbGVydEhvbGRlcicpLnNlbGVjdEFsbCgncmVjdC5hbGVydEJvdW5kcycpLmRhdGEoYWxlcnRCb3VuZHMpO1xuXG4gICAgZnVuY3Rpb24gYWxlcnRCb3VuZGluZ1JlY3Qoc2VsZWN0aW9uKSB7XG4gICAgICBzZWxlY3Rpb25cbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2FsZXJ0Qm91bmRzJylcbiAgICAgICAgLmF0dHIoJ3gnLCAoZDogQWxlcnRCb3VuZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQuc3RhcnRUaW1lc3RhbXApO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneScsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShoaWdoQm91bmQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQ6IEFsZXJ0Qm91bmQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLmhlaWdodCAtIDQwO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignd2lkdGgnLCAoZDogQWxlcnRCb3VuZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQuZW5kVGltZXN0YW1wKSAtIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC5zdGFydFRpbWVzdGFtcCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIHJlY3RBbGVydC5jYWxsKGFsZXJ0Qm91bmRpbmdSZWN0KTtcblxuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIHJlY3RBbGVydC5lbnRlcigpXG4gICAgICAuYXBwZW5kKCdyZWN0JylcbiAgICAgIC5jYWxsKGFsZXJ0Qm91bmRpbmdSZWN0KTtcblxuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIHJlY3RBbGVydC5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZGVjbGFyZSBsZXQgZDM6IGFueTtcblxuICBjb25zdCBfbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoJ2hhd2t1bGFyLmNoYXJ0cycpO1xuXG4gIGV4cG9ydCBjbGFzcyBBdmFpbFN0YXR1cyB7XG5cbiAgICBwdWJsaWMgc3RhdGljIFVQID0gJ3VwJztcbiAgICBwdWJsaWMgc3RhdGljIERPV04gPSAnZG93bic7XG4gICAgcHVibGljIHN0YXRpYyBVTktOT1dOID0gJ3Vua25vd24nO1xuXG4gICAgY29uc3RydWN0b3IocHVibGljIHZhbHVlOiBzdHJpbmcpIHtcbiAgICAgIC8vIGVtcHR5XG4gICAgfVxuXG4gICAgcHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICByZXR1cm4gdGhpcy52YWx1ZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyB0aGUgaW5wdXQgZGF0YSBmb3JtYXQsIGRpcmVjdGx5IGZyb20gTWV0cmljcy5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSUF2YWlsRGF0YVBvaW50IHtcbiAgICB0aW1lc3RhbXA6IG51bWJlcjtcbiAgICB2YWx1ZTogc3RyaW5nO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgaXMgdGhlIHRyYW5zZm9ybWVkIG91dHB1dCBkYXRhIGZvcm1hdC4gRm9ybWF0dGVkIHRvIHdvcmsgd2l0aCBhdmFpbGFiaWxpdHkgY2hhcnQgKGJhc2ljYWxseSBhIERUTykuXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IHtcbiAgICBzdGFydDogbnVtYmVyO1xuICAgIGVuZDogbnVtYmVyO1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gICAgc3RhcnREYXRlPzogRGF0ZTsgLy8vIE1haW5seSBmb3IgZGVidWdnZXIgaHVtYW4gcmVhZGFibGUgZGF0ZXMgaW5zdGVhZCBvZiBhIG51bWJlclxuICAgIGVuZERhdGU/OiBEYXRlO1xuICAgIGR1cmF0aW9uPzogc3RyaW5nO1xuICAgIG1lc3NhZ2U/OiBzdHJpbmc7XG4gIH1cblxuICBleHBvcnQgY2xhc3MgVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCBpbXBsZW1lbnRzIElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50IHtcblxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBzdGFydDogbnVtYmVyLFxuICAgICAgcHVibGljIGVuZDogbnVtYmVyLFxuICAgICAgcHVibGljIHZhbHVlOiBzdHJpbmcsXG4gICAgICBwdWJsaWMgc3RhcnREYXRlPzogRGF0ZSxcbiAgICAgIHB1YmxpYyBlbmREYXRlPzogRGF0ZSxcbiAgICAgIHB1YmxpYyBkdXJhdGlvbj86IHN0cmluZyxcbiAgICAgIHB1YmxpYyBtZXNzYWdlPzogc3RyaW5nKSB7XG5cbiAgICAgIHRoaXMuZHVyYXRpb24gPSBtb21lbnQoZW5kKS5mcm9tKG1vbWVudChzdGFydCksIHRydWUpO1xuICAgICAgdGhpcy5zdGFydERhdGUgPSBuZXcgRGF0ZShzdGFydCk7XG4gICAgICB0aGlzLmVuZERhdGUgPSBuZXcgRGF0ZShlbmQpO1xuICAgIH1cblxuICB9XG5cbiAgZXhwb3J0IGNsYXNzIEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlIHtcblxuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9IRUlHSFQgPSAxNTA7XG4gICAgcHJpdmF0ZSBzdGF0aWMgX0NIQVJUX1dJRFRIID0gNzUwO1xuXG4gICAgcHVibGljIHJlc3RyaWN0ID0gJ0UnO1xuICAgIHB1YmxpYyByZXBsYWNlID0gdHJ1ZTtcblxuICAgIC8vIENhbid0IHVzZSAxLjQgZGlyZWN0aXZlIGNvbnRyb2xsZXJzIGJlY2F1c2Ugd2UgbmVlZCB0byBzdXBwb3J0IDEuMytcbiAgICBwdWJsaWMgc2NvcGUgPSB7XG4gICAgICBkYXRhOiAnPScsXG4gICAgICBzdGFydFRpbWVzdGFtcDogJ0AnLFxuICAgICAgZW5kVGltZXN0YW1wOiAnQCcsXG4gICAgICB0aW1lTGFiZWw6ICdAJyxcbiAgICAgIGRhdGVMYWJlbDogJ0AnLFxuICAgICAgY2hhcnRUaXRsZTogJ0AnXG4gICAgfTtcblxuICAgIHB1YmxpYyBsaW5rOiAoc2NvcGU6IGFueSwgZWxlbWVudDogbmcuSUF1Z21lbnRlZEpRdWVyeSwgYXR0cnM6IGFueSkgPT4gdm9pZDtcblxuICAgIHB1YmxpYyB0cmFuc2Zvcm1lZERhdGFQb2ludHM6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W107XG5cbiAgICBjb25zdHJ1Y3Rvcigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBzdGFydFRpbWVzdGFtcDogbnVtYmVyID0gK2F0dHJzLnN0YXJ0VGltZXN0YW1wLFxuICAgICAgICAgIGVuZFRpbWVzdGFtcDogbnVtYmVyID0gK2F0dHJzLmVuZFRpbWVzdGFtcCxcbiAgICAgICAgICBjaGFydEhlaWdodCA9IEF2YWlsYWJpbGl0eUNoYXJ0RGlyZWN0aXZlLl9DSEFSVF9IRUlHSFQ7XG5cbiAgICAgICAgLy8gY2hhcnQgc3BlY2lmaWMgdmFyc1xuICAgICAgICBsZXQgbWFyZ2luID0geyB0b3A6IDEwLCByaWdodDogNSwgYm90dG9tOiA1LCBsZWZ0OiA5MCB9LFxuICAgICAgICAgIHdpZHRoID0gQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gNTAsXG4gICAgICAgICAgaGVpZ2h0ID0gYWRqdXN0ZWRDaGFydEhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tLFxuICAgICAgICAgIHRpdGxlSGVpZ2h0ID0gMzAsXG4gICAgICAgICAgdGl0bGVTcGFjZSA9IDEwLFxuICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wIC0gdGl0bGVIZWlnaHQgLSB0aXRsZVNwYWNlLFxuICAgICAgICAgIGFkanVzdGVkQ2hhcnRIZWlnaHQyID0gK3RpdGxlSGVpZ2h0ICsgdGl0bGVTcGFjZSArIG1hcmdpbi50b3AsXG4gICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGJydXNoLFxuICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgdGlwLFxuICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgIHN2ZztcblxuICAgICAgICBmdW5jdGlvbiBidWlsZEF2YWlsSG92ZXIoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICByZXR1cm4gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+U3RhdHVzOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLnZhbHVlLnRvVXBwZXJDYXNlKCl9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0gYmVmb3JlLXNlcGFyYXRvcic+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPkR1cmF0aW9uOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLmR1cmF0aW9ufTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvbmVUaW1lQ2hhcnRTZXR1cCgpOiB2b2lkIHtcbiAgICAgICAgICAvLyBkZXN0cm95IGFueSBwcmV2aW91cyBjaGFydHNcbiAgICAgICAgICBpZiAoY2hhcnQpIHtcbiAgICAgICAgICAgIGNoYXJ0UGFyZW50LnNlbGVjdEFsbCgnKicpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjaGFydFBhcmVudCA9IGQzLnNlbGVjdChlbGVtZW50WzBdKTtcbiAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgIC5hdHRyKCd2aWV3Qm94JywgJzAgMCA3NjAgMTUwJykuYXR0cigncHJlc2VydmVBc3BlY3RSYXRpbycsICd4TWluWU1pbiBtZWV0Jyk7XG5cbiAgICAgICAgICB0aXAgPSBkMy50aXAoKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2QzLXRpcCcpXG4gICAgICAgICAgICAub2Zmc2V0KFstMTAsIDBdKVxuICAgICAgICAgICAgLmh0bWwoKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBidWlsZEF2YWlsSG92ZXIoZCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyAoYWRqdXN0ZWRDaGFydEhlaWdodDIpICsgJyknKTtcblxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2RlZnMnKVxuICAgICAgICAgICAgLmFwcGVuZCgncGF0dGVybicpXG4gICAgICAgICAgICAuYXR0cignaWQnLCAnZGlhZ29uYWwtc3RyaXBlcycpXG4gICAgICAgICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgICAgICAgIC5hdHRyKCdwYXR0ZXJuVHJhbnNmb3JtJywgJ3NjYWxlKDAuNyknKVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgNClcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCA0KVxuICAgICAgICAgICAgLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuYXR0cignZCcsICdNLTEsMSBsMiwtMiBNMCw0IGw0LC00IE0zLDUgbDIsLTInKVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICcjQjZCNkI2JylcbiAgICAgICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAxLjIpO1xuXG4gICAgICAgICAgc3ZnLmNhbGwodGlwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRldGVybWluZUF2YWlsU2NhbGUodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSkge1xuICAgICAgICAgIGxldCBhZGp1c3RlZFRpbWVSYW5nZTogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gK2F0dHJzLnN0YXJ0VGltZXN0YW1wIHx8XG4gICAgICAgICAgICBkMy5taW4odHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCwgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkLnN0YXJ0O1xuICAgICAgICAgICAgfSkgfHwgK21vbWVudCgpLnN1YnRyYWN0KDEsICdob3VyJyk7XG5cbiAgICAgICAgICBpZiAodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCAmJiB0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50Lmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgICAgYWRqdXN0ZWRUaW1lUmFuZ2VbMF0gPSBzdGFydFRpbWVzdGFtcDtcbiAgICAgICAgICAgIGFkanVzdGVkVGltZVJhbmdlWzFdID0gZW5kVGltZXN0YW1wIHx8ICttb21lbnQoKTtcblxuICAgICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgLmNsYW1wKHRydWUpXG4gICAgICAgICAgICAgIC5yYW5nZVJvdW5kKFs3MCwgMF0pXG4gICAgICAgICAgICAgIC5kb21haW4oWzAsIDE3NV0pO1xuXG4gICAgICAgICAgICB5QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgLnRpY2tzKDApXG4gICAgICAgICAgICAgIC50aWNrU2l6ZSgwLCAwKVxuICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgICAucmFuZ2UoWzAsIHdpZHRoXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihhZGp1c3RlZFRpbWVSYW5nZSk7XG5cbiAgICAgICAgICAgIHhBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAuc2NhbGUodGltZVNjYWxlKVxuICAgICAgICAgICAgICAudGlja1NpemUoLTcwLCAwKVxuICAgICAgICAgICAgICAub3JpZW50KCd0b3AnKVxuICAgICAgICAgICAgICAudGlja0Zvcm1hdCh4QXhpc1RpbWVGb3JtYXRzKCkpO1xuXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaXNVcChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBkLnZhbHVlID09PSBBdmFpbFN0YXR1cy5VUC50b1N0cmluZygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9mdW5jdGlvbiBpc0Rvd24oZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgLy8gIHJldHVybiBkLnZhbHVlID09PSBBdmFpbFN0YXR1cy5ET1dOLnRvU3RyaW5nKCk7XG4gICAgICAgIC8vfVxuXG4gICAgICAgIGZ1bmN0aW9uIGlzVW5rbm93bihkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgIHJldHVybiBkLnZhbHVlID09PSBBdmFpbFN0YXR1cy5VTktOT1dOLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBmb3JtYXRUcmFuc2Zvcm1lZERhdGFQb2ludHMoaW5BdmFpbERhdGE6IElBdmFpbERhdGFQb2ludFtdKTogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSB7XG4gICAgICAgICAgbGV0IG91dHB1dERhdGE6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50W10gPSBbXTtcbiAgICAgICAgICBsZXQgaXRlbUNvdW50ID0gaW5BdmFpbERhdGEubGVuZ3RoO1xuXG4gICAgICAgICAgZnVuY3Rpb24gc29ydEJ5VGltZXN0YW1wKGE6IElBdmFpbERhdGFQb2ludCwgYjogSUF2YWlsRGF0YVBvaW50KSB7XG4gICAgICAgICAgICBpZiAoYS50aW1lc3RhbXAgPCBiLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYS50aW1lc3RhbXAgPiBiLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGluQXZhaWxEYXRhLnNvcnQoc29ydEJ5VGltZXN0YW1wKTtcblxuICAgICAgICAgIGlmIChpbkF2YWlsRGF0YSAmJiBpdGVtQ291bnQgPiAwICYmIGluQXZhaWxEYXRhWzBdLnRpbWVzdGFtcCkge1xuICAgICAgICAgICAgbGV0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgICAgICAgICBpZiAoaXRlbUNvdW50ID09PSAxKSB7XG4gICAgICAgICAgICAgIGxldCBhdmFpbEl0ZW0gPSBpbkF2YWlsRGF0YVswXTtcblxuICAgICAgICAgICAgICAvLyB3ZSBvbmx5IGhhdmUgb25lIGl0ZW0gd2l0aCBzdGFydCB0aW1lLiBBc3N1bWUgdW5rbm93biBmb3IgdGhlIHRpbWUgYmVmb3JlIChsYXN0IDFoKVxuICAgICAgICAgICAgICAvLyBAVE9ETyBhZGp1c3QgdG8gdGltZSBwaWNrZXJcbiAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KG5vdyAtIDYwICogNjAgKiAxMDAwLFxuICAgICAgICAgICAgICAgIGF2YWlsSXRlbS50aW1lc3RhbXAsIEF2YWlsU3RhdHVzLlVOS05PV04udG9TdHJpbmcoKSkpO1xuICAgICAgICAgICAgICAvLyBhbmQgdGhlIGRldGVybWluZWQgdmFsdWUgdXAgdW50aWwgdGhlIGVuZC5cbiAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KGF2YWlsSXRlbS50aW1lc3RhbXAsIG5vdywgYXZhaWxJdGVtLnZhbHVlKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBsZXQgYmFja3dhcmRzRW5kVGltZSA9IG5vdztcblxuICAgICAgICAgICAgICBmb3IgKGxldCBpID0gaW5BdmFpbERhdGEubGVuZ3RoOyBpID4gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBkYXRhIHN0YXJ0aW5nIGluIHRoZSBmdXR1cmUuLi4gZGlzY2FyZCBpdFxuICAgICAgICAgICAgICAgIC8vaWYgKGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXAgPiArbW9tZW50KCkpIHtcbiAgICAgICAgICAgICAgICAvLyAgY29udGludWU7XG4gICAgICAgICAgICAgICAgLy99XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0VGltZXN0YW1wID49IGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgICAgIG91dHB1dERhdGEucHVzaChuZXcgVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludChzdGFydFRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSwgaW5BdmFpbERhdGFbaSAtIDFdLnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgb3V0cHV0RGF0YS5wdXNoKG5ldyBUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIGJhY2t3YXJkc0VuZFRpbWUsIGluQXZhaWxEYXRhW2kgLSAxXS52YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRW5kVGltZSA9IGluQXZhaWxEYXRhW2kgLSAxXS50aW1lc3RhbXA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBvdXRwdXREYXRhO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlU2lkZVlBeGlzTGFiZWxzKCkge1xuICAgICAgICAgIC8vL0BUb2RvOiBtb3ZlIG91dCB0byBzdHlsZXNoZWV0XG4gICAgICAgICAgc3ZnLmFwcGVuZCgndGV4dCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZhaWxVcExhYmVsJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgLTEwKVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAyNSlcbiAgICAgICAgICAgIC5zdHlsZSgnZm9udC1mYW1pbHknLCAnQXJpYWwsIFZlcmRhbmEsIHNhbnMtc2VyaWY7JylcbiAgICAgICAgICAgIC5zdHlsZSgnZm9udC1zaXplJywgJzEycHgnKVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnIzk5OScpXG4gICAgICAgICAgICAuc3R5bGUoJ3RleHQtYW5jaG9yJywgJ2VuZCcpXG4gICAgICAgICAgICAudGV4dCgnVXAnKTtcblxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ3RleHQnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2YWlsRG93bkxhYmVsJylcbiAgICAgICAgICAgIC5hdHRyKCd4JywgLTEwKVxuICAgICAgICAgICAgLmF0dHIoJ3knLCA1NSlcbiAgICAgICAgICAgIC5zdHlsZSgnZm9udC1mYW1pbHknLCAnQXJpYWwsIFZlcmRhbmEsIHNhbnMtc2VyaWY7JylcbiAgICAgICAgICAgIC5zdHlsZSgnZm9udC1zaXplJywgJzEycHgnKVxuICAgICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAnIzk5OScpXG4gICAgICAgICAgICAuc3R5bGUoJ3RleHQtYW5jaG9yJywgJ2VuZCcpXG4gICAgICAgICAgICAudGV4dCgnRG93bicpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVBdmFpbGFiaWxpdHlDaGFydCh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50OiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludFtdKSB7XG4gICAgICAgICAgLy9sZXQgeEF4aXNNaW4gPSBkMy5taW4odHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCwgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgLy8gIHJldHVybiArZC5zdGFydDtcbiAgICAgICAgICAvL30pLFxuICAgICAgICAgIGxldCB4QXhpc01heCA9IGQzLm1heCh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50LCAoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiArZC5lbmQ7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgYXZhaWxUaW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGhdKVxuICAgICAgICAgICAgLmRvbWFpbihbc3RhcnRUaW1lc3RhbXAsIGVuZFRpbWVzdGFtcCB8fCB4QXhpc01heF0pLFxuXG4gICAgICAgICAgICB5U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgICAuY2xhbXAodHJ1ZSlcbiAgICAgICAgICAgICAgLnJhbmdlKFtoZWlnaHQsIDBdKVxuICAgICAgICAgICAgICAuZG9tYWluKFswLCA0XSk7XG5cbiAgICAgICAgICAvL2F2YWlsWEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgLy8gIC5zY2FsZShhdmFpbFRpbWVTY2FsZSlcbiAgICAgICAgICAvLyAgLnRpY2tzKDgpXG4gICAgICAgICAgLy8gIC50aWNrU2l6ZSgxMywgMClcbiAgICAgICAgICAvLyAgLm9yaWVudCgndG9wJyk7XG5cbiAgICAgICAgICAvLyBGb3IgZWFjaCBkYXRhcG9pbnQgY2FsY3VsYXRlIHRoZSBZIG9mZnNldCBmb3IgdGhlIGJhclxuICAgICAgICAgIC8vIFVwIG9yIFVua25vd246IG9mZnNldCAwLCBEb3duOiBvZmZzZXQgMzVcbiAgICAgICAgICBmdW5jdGlvbiBjYWxjQmFyWShkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkge1xuICAgICAgICAgICAgcmV0dXJuIGhlaWdodCAtIHlTY2FsZSgwKSArICgoaXNVcChkKSB8fCBpc1Vua25vd24oZCkpID8gMCA6IDM1KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBGb3IgZWFjaCBkYXRhcG9pbnQgY2FsY3VsYXRlIHRoZSBZIHJlbW92ZWQgaGVpZ2h0IGZvciB0aGUgYmFyXG4gICAgICAgICAgLy8gVW5rbm93bjogZnVsbCBoZWlnaHQgMTUsIFVwIG9yIERvd246IGhhbGYgaGVpZ2h0LCA1MFxuICAgICAgICAgIGZ1bmN0aW9uIGNhbGNCYXJIZWlnaHQoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIHJldHVybiB5U2NhbGUoMCkgLSAoaXNVbmtub3duKGQpID8gMTUgOiA1MCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY2FsY0JhckZpbGwoZDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpIHtcbiAgICAgICAgICAgIGlmIChpc1VwKGQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAnIzU0QTI0RSc7IC8vIGdyZWVuXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzVW5rbm93bihkKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3VybCgjZGlhZ29uYWwtc3RyaXBlcyknOyAvLyBncmF5IHN0cmlwZXNcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiAnI0Q4NTA1NCc7IC8vIHJlZFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ3JlY3QuYXZhaWxCYXJzJylcbiAgICAgICAgICAgIC5kYXRhKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpXG4gICAgICAgICAgICAuZW50ZXIoKS5hcHBlbmQoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2F2YWlsQmFycycpXG4gICAgICAgICAgICAuYXR0cigneCcsIChkOiBJVHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gYXZhaWxUaW1lU2NhbGUoK2Quc3RhcnQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCd5JywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBjYWxjQmFyWShkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbGNCYXJIZWlnaHQoZCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIGxldCBkRW5kID0gZW5kVGltZXN0YW1wID8gKE1hdGgubWluKCtkLmVuZCwgZW5kVGltZXN0YW1wKSkgOiAoK2QuZW5kKTtcbiAgICAgICAgICAgICAgcmV0dXJuIGF2YWlsVGltZVNjYWxlKGRFbmQpIC0gYXZhaWxUaW1lU2NhbGUoK2Quc3RhcnQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgKGQ6IElUcmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBjYWxjQmFyRmlsbChkKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuYXR0cignb3BhY2l0eScsICgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIDAuODU7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgICAgdGlwLmhpZGUoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNlZG93bicsICgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IGJydXNoRWxlbSA9IHN2Zy5zZWxlY3QoJy5icnVzaCcpLm5vZGUoKTtcbiAgICAgICAgICAgICAgbGV0IGNsaWNrRXZlbnQ6IGFueSA9IG5ldyBFdmVudCgnbW91c2Vkb3duJyk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQucGFnZVggPSBkMy5ldmVudC5wYWdlWDtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5jbGllbnRYID0gZDMuZXZlbnQuY2xpZW50WDtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWSA9IGQzLmV2ZW50LnBhZ2VZO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFkgPSBkMy5ldmVudC5jbGllbnRZO1xuICAgICAgICAgICAgICBicnVzaEVsZW0uZGlzcGF0Y2hFdmVudChjbGlja0V2ZW50KTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ21vdXNldXAnLCAoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBicnVzaEVsZW0gPSBzdmcuc2VsZWN0KCcuYnJ1c2gnKS5ub2RlKCk7XG4gICAgICAgICAgICAgIGxldCBjbGlja0V2ZW50OiBhbnkgPSBuZXcgRXZlbnQoJ21vdXNldXAnKTtcbiAgICAgICAgICAgICAgY2xpY2tFdmVudC5wYWdlWCA9IGQzLmV2ZW50LnBhZ2VYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LmNsaWVudFggPSBkMy5ldmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICBjbGlja0V2ZW50LnBhZ2VZID0gZDMuZXZlbnQucGFnZVk7XG4gICAgICAgICAgICAgIGNsaWNrRXZlbnQuY2xpZW50WSA9IGQzLmV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICAgIGJydXNoRWxlbS5kaXNwYXRjaEV2ZW50KGNsaWNrRXZlbnQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBUaGUgYm90dG9tIGxpbmUgb2YgdGhlIGF2YWlsYWJpbGl0eSBjaGFydFxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmF0dHIoJ3gxJywgMClcbiAgICAgICAgICAgIC5hdHRyKCd5MScsIDcwKVxuICAgICAgICAgICAgLmF0dHIoJ3gyJywgNjU1KVxuICAgICAgICAgICAgLmF0dHIoJ3kyJywgNzApXG4gICAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgMC41KVxuICAgICAgICAgICAgLmF0dHIoJ3N0cm9rZScsICcjRDBEMEQwJyk7XG5cbiAgICAgICAgICBjcmVhdGVTaWRlWUF4aXNMYWJlbHMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhhbmRZQXhlcygpIHtcblxuICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgLy8gY3JlYXRlIHgtYXhpc1xuICAgICAgICAgIHhBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICd4IGF4aXMnKVxuICAgICAgICAgICAgLmNhbGwoeEF4aXMpO1xuXG4gICAgICAgICAgLy8gY3JlYXRlIHktYXhpc1xuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3kgYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh5QXhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgYnJ1c2ggPSBkMy5zdmcuYnJ1c2goKVxuICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgLm9uKCdicnVzaHN0YXJ0JywgYnJ1c2hTdGFydClcbiAgICAgICAgICAgIC5vbignYnJ1c2hlbmQnLCBicnVzaEVuZCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYnJ1c2gnKVxuICAgICAgICAgICAgLmNhbGwoYnJ1c2gpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJy5yZXNpemUnKS5hcHBlbmQoJ3BhdGgnKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCA3MCk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBicnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsIHRydWUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGJydXNoRW5kKCkge1xuICAgICAgICAgICAgbGV0IGV4dGVudCA9IGJydXNoLmV4dGVudCgpLFxuICAgICAgICAgICAgICBzdGFydFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFswXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBlbmRUaW1lID0gTWF0aC5yb3VuZChleHRlbnRbMV0uZ2V0VGltZSgpKSxcbiAgICAgICAgICAgICAgZHJhZ1NlbGVjdGlvbkRlbHRhID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcblxuICAgICAgICAgICAgLy9zdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgIWQzLmV2ZW50LnRhcmdldC5lbXB0eSgpKTtcbiAgICAgICAgICAgIGlmIChkcmFnU2VsZWN0aW9uRGVsdGEgPj0gNjAwMDApIHtcbiAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEV2ZW50TmFtZXMuQVZBSUxfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQudG9TdHJpbmcoKSwgZXh0ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJydXNoR3JvdXAuY2FsbChicnVzaC5jbGVhcigpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgdGhpcy50cmFuc2Zvcm1lZERhdGFQb2ludHMgPSBmb3JtYXRUcmFuc2Zvcm1lZERhdGFQb2ludHMoYW5ndWxhci5mcm9tSnNvbihuZXdEYXRhKSk7XG4gICAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy50cmFuc2Zvcm1lZERhdGFQb2ludHMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydzdGFydFRpbWVzdGFtcCcsICdlbmRUaW1lc3RhbXAnXSwgKG5ld1RpbWVzdGFtcCkgPT4ge1xuICAgICAgICAgIHN0YXJ0VGltZXN0YW1wID0gK25ld1RpbWVzdGFtcFswXSB8fCBzdGFydFRpbWVzdGFtcDtcbiAgICAgICAgICBlbmRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzFdIHx8IGVuZFRpbWVzdGFtcDtcbiAgICAgICAgICBzY29wZS5yZW5kZXIodGhpcy50cmFuc2Zvcm1lZERhdGFQb2ludHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS5yZW5kZXIgPSAodHJhbnNmb3JtZWRBdmFpbERhdGFQb2ludDogSVRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnRbXSkgPT4ge1xuICAgICAgICAgIGlmICh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50ICYmIHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy9jb25zb2xlLnRpbWUoJ2F2YWlsQ2hhcnRSZW5kZXInKTtcbiAgICAgICAgICAgIC8vL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIG9uZVRpbWVDaGFydFNldHVwKCk7XG4gICAgICAgICAgICBkZXRlcm1pbmVBdmFpbFNjYWxlKHRyYW5zZm9ybWVkQXZhaWxEYXRhUG9pbnQpO1xuICAgICAgICAgICAgY3JlYXRlWGFuZFlBeGVzKCk7XG4gICAgICAgICAgICBjcmVhdGVYQXhpc0JydXNoKCk7XG4gICAgICAgICAgICBjcmVhdGVBdmFpbGFiaWxpdHlDaGFydCh0cmFuc2Zvcm1lZEF2YWlsRGF0YVBvaW50KTtcbiAgICAgICAgICAgIC8vY29uc29sZS50aW1lRW5kKCdhdmFpbENoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3RhdGljIEZhY3RvcnkoKSB7XG4gICAgICBsZXQgZGlyZWN0aXZlID0gKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgQXZhaWxhYmlsaXR5Q2hhcnREaXJlY3RpdmUoJHJvb3RTY29wZSk7XG4gICAgICB9O1xuXG4gICAgICBkaXJlY3RpdmVbJyRpbmplY3QnXSA9IFsnJHJvb3RTY29wZSddO1xuXG4gICAgICByZXR1cm4gZGlyZWN0aXZlO1xuICAgIH1cblxuICB9XG5cbiAgX21vZHVsZS5kaXJlY3RpdmUoJ2hrQXZhaWxhYmlsaXR5Q2hhcnQnLCBBdmFpbGFiaWxpdHlDaGFydERpcmVjdGl2ZS5GYWN0b3J5KCkpO1xufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgY29uc3QgX21vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKTtcblxuICBleHBvcnQgY2xhc3MgQ29udGV4dENoYXJ0RGlyZWN0aXZlIHtcblxuICAgIC8vIHRoZXNlIGFyZSBqdXN0IHN0YXJ0aW5nIHBhcmFtZXRlciBoaW50c1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9XSURUSF9ISU5UID0gNzUwO1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9IRUlHSFRfSElOVCA9IDUwO1xuICAgIHByaXZhdGUgc3RhdGljIF9YQVhJU19IRUlHSFQgPSAxNTtcblxuICAgIHB1YmxpYyByZXN0cmljdCA9ICdFJztcbiAgICBwdWJsaWMgcmVwbGFjZSA9IHRydWU7XG5cbiAgICAvLyBDYW4ndCB1c2UgMS40IGRpcmVjdGl2ZSBjb250cm9sbGVycyBiZWNhdXNlIHdlIG5lZWQgdG8gc3VwcG9ydCAxLjMrXG4gICAgcHVibGljIHNjb3BlID0ge1xuICAgICAgZGF0YTogJz0nLFxuICAgICAgc2hvd1lBeGlzVmFsdWVzOiAnPScsXG4gICAgICBzdGFydFRpbWVzdGFtcDogJ0AnLFxuICAgICAgZW5kVGltZXN0YW1wOiAnQCcsXG4gICAgfTtcblxuICAgIHB1YmxpYyBsaW5rOiAoc2NvcGU6IGFueSwgZWxlbWVudDogbmcuSUF1Z21lbnRlZEpRdWVyeSwgYXR0cnM6IGFueSkgPT4gdm9pZDtcblxuICAgIHB1YmxpYyBkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKCRyb290U2NvcGU6IG5nLklSb290U2NvcGVTZXJ2aWNlKSB7XG5cbiAgICAgIHRoaXMubGluayA9IChzY29wZSwgZWxlbWVudCwgYXR0cnMpID0+IHtcblxuICAgICAgICBjb25zdCBtYXJnaW4gPSB7IHRvcDogMCwgcmlnaHQ6IDUsIGJvdHRvbTogNSwgbGVmdDogOTAgfTtcblxuICAgICAgICAvLyBkYXRhIHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IGNoYXJ0SGVpZ2h0ID0gQ29udGV4dENoYXJ0RGlyZWN0aXZlLl9DSEFSVF9IRUlHSFRfSElOVCxcbiAgICAgICAgICB3aWR0aCA9IENvbnRleHRDaGFydERpcmVjdGl2ZS5fQ0hBUlRfV0lEVEhfSElOVCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0LFxuICAgICAgICAgIGhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20sXG4gICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20gLSAxNSxcbiAgICAgICAgICBpbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0ICsgbWFyZ2luLnRvcCxcbiAgICAgICAgICBzaG93WUF4aXNWYWx1ZXM6IGJvb2xlYW4sXG4gICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgIHlBeGlzLFxuICAgICAgICAgIHlBeGlzR3JvdXAsXG4gICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgIHhBeGlzLFxuICAgICAgICAgIHhBeGlzR3JvdXAsXG4gICAgICAgICAgYnJ1c2gsXG4gICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICBjaGFydCxcbiAgICAgICAgICBjaGFydFBhcmVudCxcbiAgICAgICAgICBzdmc7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhdHRycy5zaG93WUF4aXNWYWx1ZXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgc2hvd1lBeGlzVmFsdWVzID0gYXR0cnMuc2hvd1lBeGlzVmFsdWVzID09PSAndHJ1ZSc7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiByZXNpemUoKTogdm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG5cbiAgICAgICAgICBjb25zdCBwYXJlbnROb2RlID0gZWxlbWVudFswXS5wYXJlbnROb2RlO1xuXG4gICAgICAgICAgLy9sZXQncyB1c2UgOTIuNSUgb2YgcGFyZW50cyB3aWR0aFxuICAgICAgICAgIHdpZHRoID0gKDxhbnk+cGFyZW50Tm9kZSkuY2xpZW50V2lkdGggKiAwLjkyNTtcbiAgICAgICAgICBoZWlnaHQgPSAoPGFueT5wYXJlbnROb2RlKS5jbGllbnRIZWlnaHQ7XG4gICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b20gLSBDb250ZXh0Q2hhcnREaXJlY3RpdmUuX1hBWElTX0hFSUdIVCxcblxuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnQ29udGV4dCBXaWR0aDogJWknLHdpZHRoKTtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ0NvbnRleHQgSGVpZ2h0OiAlaScsaGVpZ2h0KTtcblxuICAgICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3A7XG5cbiAgICAgICAgICBjaGFydCA9IGNoYXJ0UGFyZW50LmFwcGVuZCgnc3ZnJylcbiAgICAgICAgICAgIC5hdHRyKCd3aWR0aCcsIHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICBzdmcgPSBjaGFydC5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIG1hcmdpbi5sZWZ0ICsgJywgMCknKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbnRleHRDaGFydCcpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVDb250ZXh0Q2hhcnQoZGF0YVBvaW50czogSUNoYXJ0RGF0YVBvaW50W10pIHtcblxuICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aCAtIDEwXSlcbiAgICAgICAgICAgIC5uaWNlKClcbiAgICAgICAgICAgIC5kb21haW4oW2RhdGFQb2ludHNbMF0udGltZXN0YW1wLCBkYXRhUG9pbnRzW2RhdGFQb2ludHMubGVuZ3RoIC0gMV0udGltZXN0YW1wXSk7XG5cbiAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgIC5zY2FsZSh0aW1lU2NhbGUpXG4gICAgICAgICAgICAudGlja1NpemUoNCwgMClcbiAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgIC5vcmllbnQoJ2JvdHRvbScpO1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICB4QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneCBheGlzJylcbiAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKDAsJyArIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCArICcpJylcbiAgICAgICAgICAgIC5jYWxsKHhBeGlzKTtcblxuICAgICAgICAgIGxldCB5TWluID0gZDMubWluKGRhdGFQb2ludHMsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgbGV0IHlNYXggPSBkMy5tYXgoZGF0YVBvaW50cywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLmF2ZztcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIGdpdmUgYSBwYWQgb2YgJSB0byBtaW4vbWF4IHNvIHdlIGFyZSBub3QgYWdhaW5zdCB4LWF4aXNcbiAgICAgICAgICB5TWF4ID0geU1heCArICh5TWF4ICogMC4wMyk7XG4gICAgICAgICAgeU1pbiA9IHlNaW4gLSAoeU1pbiAqIDAuMDUpO1xuXG4gICAgICAgICAgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgIC5yYW5nZVJvdW5kKFttb2RpZmllZElubmVyQ2hhcnRIZWlnaHQsIDBdKVxuICAgICAgICAgICAgLm5pY2UoKVxuICAgICAgICAgICAgLmRvbWFpbihbeU1pbiwgeU1heF0pO1xuXG4gICAgICAgICAgbGV0IG51bWJlck9mVGlja3MgPSBzaG93WUF4aXNWYWx1ZXMgPyAyIDogMDtcblxuICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgIC50aWNrcyhudW1iZXJPZlRpY2tzKVxuICAgICAgICAgICAgLnRpY2tTaXplKDQsIDApXG4gICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICB5QXhpc0dyb3VwID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcblxuICAgICAgICAgIGxldCBhcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgICAgLmludGVycG9sYXRlKCdjYXJkaW5hbCcpXG4gICAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAhZC5lbXB0eTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC55MCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQ7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnkxKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCBjb250ZXh0TGluZSA9IGQzLnN2Zy5saW5lKClcbiAgICAgICAgICAgIC5pbnRlcnBvbGF0ZSgnY2FyZGluYWwnKVxuICAgICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gIWQuZW1wdHk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5hdmcpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBsZXQgcGF0aENvbnRleHRMaW5lID0gc3ZnLnNlbGVjdEFsbCgncGF0aC5jb250ZXh0TGluZScpLmRhdGEoW2RhdGFQb2ludHNdKTtcblxuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIHBhdGhDb250ZXh0TGluZS5hdHRyKCdjbGFzcycsICdjb250ZXh0TGluZScpXG4gICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAuYXR0cignZCcsIGNvbnRleHRMaW5lKTtcblxuICAgICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICAgIHBhdGhDb250ZXh0TGluZS5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dExpbmUnKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmF0dHIoJ2QnLCBjb250ZXh0TGluZSk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBwYXRoQ29udGV4dExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgbGV0IGNvbnRleHRBcmVhID0gc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnY29udGV4dCcpO1xuXG4gICAgICAgICAgY29udGV4dEFyZWEuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgIC5kYXR1bShkYXRhUG9pbnRzKVxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgLmR1cmF0aW9uKDUwMClcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdjb250ZXh0QXJlYScpXG4gICAgICAgICAgICAuYXR0cignZCcsIGFyZWEpO1xuXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVYQXhpc0JydXNoKCkge1xuXG4gICAgICAgICAgYnJ1c2ggPSBkMy5zdmcuYnJ1c2goKVxuICAgICAgICAgICAgLngodGltZVNjYWxlKVxuICAgICAgICAgICAgLm9uKCdicnVzaHN0YXJ0JywgY29udGV4dEJydXNoU3RhcnQpXG4gICAgICAgICAgICAub24oJ2JydXNoZW5kJywgY29udGV4dEJydXNoRW5kKTtcblxuICAgICAgICAgIHhBeGlzR3JvdXAuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ3knLCAwKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGhlaWdodCAtIDEwKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGhlaWdodCArIDE3KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGNvbnRleHRCcnVzaFN0YXJ0KCkge1xuICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsIHRydWUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNvbnRleHRCcnVzaEVuZCgpIHtcbiAgICAgICAgICAgIGxldCBicnVzaEV4dGVudCA9IGJydXNoLmV4dGVudCgpLFxuICAgICAgICAgICAgICBzdGFydFRpbWUgPSBNYXRoLnJvdW5kKGJydXNoRXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGJydXNoRXh0ZW50WzFdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG4gICAgICAgICAgICAvLy8gV2UgaWdub3JlIGRyYWcgc2VsZWN0aW9ucyB1bmRlciBhIG1pbnV0ZVxuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5DT05URVhUX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGJydXNoRXh0ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJlZHJhd0JydXNoKHN0YXJ0VGltZXN0YW1wLCBlbmRUaW1lc3RhbXApIHtcbiAgICAgICAgICBpZiAoYnJ1c2gpIHtcbiAgICAgICAgICAgIGJydXNoLmV4dGVudChbbmV3IERhdGUoc3RhcnRUaW1lc3RhbXApLCBuZXcgRGF0ZShlbmRUaW1lc3RhbXApXSk7XG4gICAgICAgICAgICBicnVzaChkMy5zZWxlY3QoJ2hrLWNvbnRleHQtY2hhcnQgLmJydXNoJykudHJhbnNpdGlvbigpKTtcbiAgICAgICAgICAgIGJydXNoLmV2ZW50KGQzLnNlbGVjdCgnaGstY29udGV4dC1jaGFydCAuYnJ1c2gnKS50cmFuc2l0aW9uKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vZDMuc2VsZWN0KHdpbmRvdykub24oJ3Jlc2l6ZScsIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpKTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKCdkYXRhJywgKG5ld0RhdGEpID0+IHtcbiAgICAgICAgICBpZiAobmV3RGF0YSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhUG9pbnRzID0gZm9ybWF0QnVja2V0ZWRDaGFydE91dHB1dChhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLmRhdGFQb2ludHMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoR3JvdXAoWydzdGFydFRpbWVzdGFtcCcsICdlbmRUaW1lc3RhbXAnXSwgKG5ld1RpbWVzdGFtcCkgPT4ge1xuICAgICAgICAgIGxldCBzdGFydFRpbWVzdGFtcCA9ICtuZXdUaW1lc3RhbXBbMF0gfHwgK3Njb3BlLnN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgIGxldCBlbmRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzFdIHx8ICtzY29wZS5lbmRUaW1lc3RhbXA7XG4gICAgICAgICAgcmVkcmF3QnJ1c2goc3RhcnRUaW1lc3RhbXAsIGVuZFRpbWVzdGFtcCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOiBJQ2hhcnREYXRhUG9pbnRbXSB7XG4gICAgICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5tYXAoKHBvaW50OiBJQ2hhcnREYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHRpbWVzdGFtcDogVGltZUluTWlsbGlzID0gcG9pbnQudGltZXN0YW1wIHx8IChwb2ludC5zdGFydCArIChwb2ludC5lbmQgLSBwb2ludC5zdGFydCkgLyAyKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAvL2RhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgdmFsdWU6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50LnZhbHVlKSA/IHVuZGVmaW5lZCA6IHBvaW50LnZhbHVlLFxuICAgICAgICAgICAgICAgIGF2ZzogKHBvaW50LmVtcHR5KSA/IHVuZGVmaW5lZCA6IHBvaW50LmF2ZyxcbiAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgbWF4OiAhYW5ndWxhci5pc051bWJlcihwb2ludC5tYXgpID8gdW5kZWZpbmVkIDogcG9pbnQubWF4LFxuICAgICAgICAgICAgICAgIGVtcHR5OiBwb2ludC5lbXB0eVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUucmVuZGVyID0gKGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSA9PiB7XG4gICAgICAgICAgaWYgKGRhdGFQb2ludHMgJiYgZGF0YVBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLnRpbWUoJ2NvbnRleHRDaGFydFJlbmRlcicpO1xuXG4gICAgICAgICAgICAvLy9OT1RFOiBsYXllcmluZyBvcmRlciBpcyBpbXBvcnRhbnQhXG4gICAgICAgICAgICByZXNpemUoKTtcbiAgICAgICAgICAgIGNyZWF0ZUNvbnRleHRDaGFydChkYXRhUG9pbnRzKTtcbiAgICAgICAgICAgIGNyZWF0ZVhBeGlzQnJ1c2goKTtcbiAgICAgICAgICAgIGNvbnNvbGUudGltZUVuZCgnY29udGV4dENoYXJ0UmVuZGVyJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcblxuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb250ZXh0Q2hhcnREaXJlY3RpdmUoJHJvb3RTY29wZSk7XG4gICAgICB9O1xuXG4gICAgICBkaXJlY3RpdmVbJyRpbmplY3QnXSA9IFsnJHJvb3RTY29wZSddO1xuXG4gICAgICByZXR1cm4gZGlyZWN0aXZlO1xuICAgIH1cblxuICB9XG5cbiAgX21vZHVsZS5kaXJlY3RpdmUoJ2hrQ29udGV4dENoYXJ0JywgQ29udGV4dENoYXJ0RGlyZWN0aXZlLkZhY3RvcnkoKSk7XG59XG4iLCIvLy9cbi8vLyBDb3B5cmlnaHQgMjAxNSBSZWQgSGF0LCBJbmMuIGFuZC9vciBpdHMgYWZmaWxpYXRlc1xuLy8vIGFuZCBvdGhlciBjb250cmlidXRvcnMgYXMgaW5kaWNhdGVkIGJ5IHRoZSBAYXV0aG9yIHRhZ3MuXG4vLy9cbi8vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vL1xuLy8vICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy8vXG4vLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4vLy9cbi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLy8vIE5PVEU6IHRoaXMgcGF0dGVybiBpcyB1c2VkIGJlY2F1c2UgZW51bXMgY2FudCBiZSB1c2VkIHdpdGggc3RyaW5nc1xuICBleHBvcnQgY2xhc3MgRXZlbnROYW1lcyB7XG5cbiAgICBwdWJsaWMgc3RhdGljIENIQVJUX1RJTUVSQU5HRV9DSEFOR0VEID0gbmV3IEV2ZW50TmFtZXMoJ0NoYXJ0VGltZVJhbmdlQ2hhbmdlZCcpO1xuICAgIHB1YmxpYyBzdGF0aWMgQVZBSUxfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnQXZhaWxDaGFydFRpbWVSYW5nZUNoYW5nZWQnKTtcbiAgICBwdWJsaWMgc3RhdGljIFRJTUVMSU5FX0NIQVJUX1RJTUVSQU5HRV9DSEFOR0VEID0gbmV3IEV2ZW50TmFtZXMoJ1RpbWVsaW5lQ2hhcnRUaW1lUmFuZ2VDaGFuZ2VkJyk7XG4gICAgcHVibGljIHN0YXRpYyBUSU1FTElORV9DSEFSVF9ET1VCTEVfQ0xJQ0tfRVZFTlQgPSBuZXcgRXZlbnROYW1lcygnVGltZWxpbmVDaGFydERvdWJsZUNsaWNrRXZlbnQnKTtcbiAgICBwdWJsaWMgc3RhdGljIENPTlRFWFRfQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnQ29udGV4dENoYXJ0VGltZVJhbmdlQ2hhbmdlZCcpO1xuICAgIHB1YmxpYyBzdGF0aWMgREFURV9SQU5HRV9EUkFHX0NIQU5HRUQgPSBuZXcgRXZlbnROYW1lcygnRGF0ZVJhbmdlRHJhZ0NoYW5nZWQnKTtcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykge1xuICAgICAgLy8gZW1wdHlcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlO1xuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvKipcbiAgICogQ3JlYXRlIGRhdGEgcG9pbnRzIGFsb25nIHRoZSBsaW5lIHRvIHNob3cgdGhlIGFjdHVhbCB2YWx1ZXMuXG4gICAqIEBwYXJhbSBzdmdcbiAgICogQHBhcmFtIHRpbWVTY2FsZVxuICAgKiBAcGFyYW0geVNjYWxlXG4gICAqIEBwYXJhbSB0aXBcbiAgICogQHBhcmFtIGRhdGFQb2ludHNcbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEYXRhUG9pbnRzKHN2ZzogYW55LFxuICAgIHRpbWVTY2FsZTogYW55LFxuICAgIHlTY2FsZTogYW55LFxuICAgIHRpcDogYW55LFxuICAgIGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSB7XG4gICAgbGV0IHJhZGl1cyA9IDE7XG4gICAgbGV0IGRvdERhdGFwb2ludCA9IHN2Zy5zZWxlY3RBbGwoJy5kYXRhUG9pbnREb3QnKS5kYXRhKGRhdGFQb2ludHMpO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGRvdERhdGFwb2ludC5hdHRyKCdjbGFzcycsICdkYXRhUG9pbnREb3QnKVxuICAgICAgLmF0dHIoJ3InLCByYWRpdXMpXG4gICAgICAuYXR0cignY3gnLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgcmV0dXJuIGQuYXZnID8geVNjYWxlKGQuYXZnKSA6IC05OTk5OTk5O1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIGZ1bmN0aW9uKGQsIGkpIHtcbiAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgIC8vIGFkZCBuZXcgb25lc1xuICAgIGRvdERhdGFwb2ludC5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgIC5hdHRyKCdjbGFzcycsICdkYXRhUG9pbnREb3QnKVxuICAgICAgLmF0dHIoJ3InLCByYWRpdXMpXG4gICAgICAuYXR0cignY3gnLCBmdW5jdGlvbihkKSB7XG4gICAgICAgIHJldHVybiB0aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgfSlcbiAgICAgIC5hdHRyKCdjeScsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgcmV0dXJuIGQuYXZnID8geVNjYWxlKGQuYXZnKSA6IC05OTk5OTk5O1xuICAgICAgfSkub24oJ21vdXNlb3ZlcicsIGZ1bmN0aW9uKGQsIGkpIHtcbiAgICAgICAgdGlwLnNob3coZCwgaSk7XG4gICAgICB9KS5vbignbW91c2VvdXQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdGlwLmhpZGUoKTtcbiAgICAgIH0pO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGRvdERhdGFwb2ludC5leGl0KCkucmVtb3ZlKCk7XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBmdW5jdGlvbiBjcmVhdGVGb3JlY2FzdExpbmUobmV3SW50ZXJwb2xhdGlvbiwgdGltZVNjYWxlLCB5U2NhbGUpIHtcbiAgICBsZXQgaW50ZXJwb2xhdGUgPSBuZXdJbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAuaW50ZXJwb2xhdGUoaW50ZXJwb2xhdGUpXG4gICAgICAgIC54KChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiB5U2NhbGUoZC52YWx1ZSk7XG4gICAgICAgIH0pO1xuXG4gICAgcmV0dXJuIGxpbmU7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gc2hvd0ZvcmVjYXN0RGF0YShmb3JlY2FzdERhdGE6IElQcmVkaWN0aXZlTWV0cmljW10sIGNoYXJ0T3B0aW9uczogQ2hhcnRPcHRpb25zKSB7XG4gICAgbGV0IGV4aXN0c01pbk9yTWF4LFxuICAgICAgbGFzdEZvcmVjYXN0UG9pbnQgPSBmb3JlY2FzdERhdGFbZm9yZWNhc3REYXRhLmxlbmd0aCAtIDFdO1xuXG4gICAgZXhpc3RzTWluT3JNYXggPSBsYXN0Rm9yZWNhc3RQb2ludC5taW4gfHwgbGFzdEZvcmVjYXN0UG9pbnQubWF4O1xuXG4gICAgaWYgKGV4aXN0c01pbk9yTWF4KSB7XG4gICAgICBsZXRcbiAgICAgICAgbWF4QXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgICAuaW50ZXJwb2xhdGUoY2hhcnRPcHRpb25zLmludGVycG9sYXRpb24pXG4gICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnkwKChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgbGV0XG4gICAgICAgIHByZWRpY3RpdmVDb25lQXJlYVBhdGggPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aC5Db25lQXJlYScpLmRhdGEoW2ZvcmVjYXN0RGF0YV0pO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBwcmVkaWN0aXZlQ29uZUFyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2NvbmVBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBtYXhBcmVhKTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgcHJlZGljdGl2ZUNvbmVBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdjb25lQXJlYScpXG4gICAgICAgIC5hdHRyKCdkJywgbWF4QXJlYSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIHByZWRpY3RpdmVDb25lQXJlYVBhdGguZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgfVxuXG4gICAgbGV0IGZvcmVjYXN0UGF0aExpbmUgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLmZvcmVjYXN0TGluZScpLmRhdGEoW2ZvcmVjYXN0RGF0YV0pO1xuICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgIGZvcmVjYXN0UGF0aExpbmUuYXR0cignY2xhc3MnLCAnZm9yZWNhc3RMaW5lJylcbiAgICAgIC5hdHRyKCdkJywgY3JlYXRlRm9yZWNhc3RMaW5lKCdtb25vdG9uZScsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUsIGNoYXJ0T3B0aW9ucy55U2NhbGUpKTtcbiAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICBmb3JlY2FzdFBhdGhMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdjbGFzcycsICdmb3JlY2FzdExpbmUnKVxuICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVGb3JlY2FzdExpbmUoJ21vbm90b25lJywgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLnlTY2FsZSkpO1xuICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgIGZvcmVjYXN0UGF0aExpbmUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gIGltcG9ydCBjcmVhdGVTdmdEZWZzID0gQ2hhcnRzLmNyZWF0ZVN2Z0RlZnM7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkZWNsYXJlIGxldCBkMzogYW55O1xuICBkZWNsYXJlIGxldCBjb25zb2xlOiBhbnk7XG5cbiAgbGV0IGRlYnVnOiBib29sZWFuID0gZmFsc2U7XG5cbiAgLy8gdGhlIHNjYWxlIHRvIHVzZSBmb3IgeS1heGlzIHdoZW4gYWxsIHZhbHVlcyBhcmUgMCwgWzAsIERFRkFVTFRfWV9TQ0FMRV1cbiAgZXhwb3J0IGNvbnN0IERFRkFVTFRfWV9TQ0FMRSA9IDEwO1xuICBleHBvcnQgY29uc3QgWF9BWElTX0hFSUdIVCA9IDI1OyAvLyB3aXRoIHJvb20gZm9yIGxhYmVsXG4gIGV4cG9ydCBjb25zdCBIT1ZFUl9EQVRFX1RJTUVfRk9STUFUID0gJ01NL0REL1lZWVkgaDptbSBhJztcbiAgZXhwb3J0IGNvbnN0IG1hcmdpbiA9IHsgdG9wOiAxMCwgcmlnaHQ6IDUsIGJvdHRvbTogNSwgbGVmdDogOTAgfTsgLy8gbGVmdCBtYXJnaW4gcm9vbSBmb3IgbGFiZWxcbiAgZXhwb3J0IGxldCB3aWR0aDtcblxuICAvKipcbiAgICogQG5nZG9jIGRpcmVjdGl2ZVxuICAgKiBAbmFtZSBoYXdrdWxhckNoYXJ0XG4gICAqIEBkZXNjcmlwdGlvbiBBIGQzIGJhc2VkIGNoYXJ0aW5nIGRpcmVjdGlvbiB0byBwcm92aWRlIGNoYXJ0aW5nIHVzaW5nIHZhcmlvdXMgc3R5bGVzIG9mIGNoYXJ0cy5cbiAgICpcbiAgICovXG4gIGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKVxuICAgIC5kaXJlY3RpdmUoJ2hrTWV0cmljQ2hhcnQnLCBbJyRyb290U2NvcGUnLCAnJGh0dHAnLCAnJHdpbmRvdycsICckaW50ZXJ2YWwnLCAnJGxvZycsXG4gICAgICBmdW5jdGlvbigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSxcbiAgICAgICAgJGh0dHA6IG5nLklIdHRwU2VydmljZSxcbiAgICAgICAgJHdpbmRvdzogbmcuSVdpbmRvd1NlcnZpY2UsXG4gICAgICAgICRpbnRlcnZhbDogbmcuSUludGVydmFsU2VydmljZSxcbiAgICAgICAgJGxvZzogbmcuSUxvZ1NlcnZpY2UpOiBuZy5JRGlyZWN0aXZlIHtcblxuICAgICAgICBmdW5jdGlvbiBsaW5rKHNjb3BlLCBlbGVtZW50LCBhdHRycykge1xuXG4gICAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgICAgbGV0IGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdID0gW10sXG4gICAgICAgICAgICBtdWx0aURhdGFQb2ludHM6IElNdWx0aURhdGFQb2ludFtdLFxuICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzOiBJUHJlZGljdGl2ZU1ldHJpY1tdLFxuICAgICAgICAgICAgZGF0YVVybCA9IGF0dHJzLm1ldHJpY1VybCxcbiAgICAgICAgICAgIG1ldHJpY0lkID0gYXR0cnMubWV0cmljSWQgfHwgJycsXG4gICAgICAgICAgICBtZXRyaWNUZW5hbnRJZCA9IGF0dHJzLm1ldHJpY1RlbmFudElkIHx8ICcnLFxuICAgICAgICAgICAgbWV0cmljVHlwZSA9IGF0dHJzLm1ldHJpY1R5cGUgfHwgJ2dhdWdlJyxcbiAgICAgICAgICAgIHRpbWVSYW5nZUluU2Vjb25kcyA9ICthdHRycy50aW1lUmFuZ2VJblNlY29uZHMgfHwgNDMyMDAsXG4gICAgICAgICAgICByZWZyZXNoSW50ZXJ2YWxJblNlY29uZHMgPSArYXR0cnMucmVmcmVzaEludGVydmFsSW5TZWNvbmRzIHx8IDM2MDAsXG4gICAgICAgICAgICBhbGVydFZhbHVlID0gK2F0dHJzLmFsZXJ0VmFsdWUsXG4gICAgICAgICAgICBpbnRlcnBvbGF0aW9uID0gYXR0cnMuaW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICAgICAgZW5kVGltZXN0YW1wOiBUaW1lSW5NaWxsaXMgPSBEYXRlLm5vdygpLFxuICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyA9IGVuZFRpbWVzdGFtcCAtIHRpbWVSYW5nZUluU2Vjb25kcyxcbiAgICAgICAgICAgIHByZXZpb3VzUmFuZ2VEYXRhUG9pbnRzID0gW10sXG4gICAgICAgICAgICBhbm5vdGF0aW9uRGF0YSA9IFtdLFxuICAgICAgICAgICAgY2hhcnRUeXBlID0gYXR0cnMuY2hhcnRUeXBlIHx8ICdsaW5lJyxcbiAgICAgICAgICAgIHNpbmdsZVZhbHVlTGFiZWwgPSBhdHRycy5zaW5nbGVWYWx1ZUxhYmVsIHx8ICdSYXcgVmFsdWUnLFxuICAgICAgICAgICAgbm9EYXRhTGFiZWwgPSBhdHRycy5ub0RhdGFMYWJlbCB8fCAnTm8gRGF0YScsXG4gICAgICAgICAgICBkdXJhdGlvbkxhYmVsID0gYXR0cnMuZHVyYXRpb25MYWJlbCB8fCAnSW50ZXJ2YWwnLFxuICAgICAgICAgICAgbWluTGFiZWwgPSBhdHRycy5taW5MYWJlbCB8fCAnTWluJyxcbiAgICAgICAgICAgIG1heExhYmVsID0gYXR0cnMubWF4TGFiZWwgfHwgJ01heCcsXG4gICAgICAgICAgICBhdmdMYWJlbCA9IGF0dHJzLmF2Z0xhYmVsIHx8ICdBdmcnLFxuICAgICAgICAgICAgdGltZXN0YW1wTGFiZWwgPSBhdHRycy50aW1lc3RhbXBMYWJlbCB8fCAnVGltZXN0YW1wJyxcbiAgICAgICAgICAgIHNob3dBdmdMaW5lID0gdHJ1ZSxcbiAgICAgICAgICAgIHNob3dEYXRhUG9pbnRzID0gZmFsc2UsXG4gICAgICAgICAgICBoaWRlSGlnaExvd1ZhbHVlcyA9IGZhbHNlLFxuICAgICAgICAgICAgdXNlWmVyb01pblZhbHVlID0gZmFsc2U7XG5cbiAgICAgICAgICAvLyBjaGFydCBzcGVjaWZpYyB2YXJzXG5cbiAgICAgICAgICBsZXQgaGVpZ2h0LFxuICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LFxuICAgICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3AgKyBtYXJnaW4uYm90dG9tLFxuICAgICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgICAgdGltZVNjYWxlLFxuICAgICAgICAgICAgeUF4aXMsXG4gICAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICAgIHRpcCxcbiAgICAgICAgICAgIGJydXNoLFxuICAgICAgICAgICAgYnJ1c2hHcm91cCxcbiAgICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgICAgY2hhcnRQYXJlbnQsXG4gICAgICAgICAgICBzdmcsXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluLFxuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgIHBlYWssXG4gICAgICAgICAgICBtaW4sXG4gICAgICAgICAgICBwcm9jZXNzZWROZXdEYXRhLFxuICAgICAgICAgICAgcHJvY2Vzc2VkUHJldmlvdXNSYW5nZURhdGEsXG4gICAgICAgICAgICBzdGFydEludGVydmFsUHJvbWlzZTtcblxuICAgICAgICAgIGRhdGFQb2ludHMgPSBhdHRycy5kYXRhO1xuICAgICAgICAgIGZvcmVjYXN0RGF0YVBvaW50cyA9IGF0dHJzLmZvcmVjYXN0RGF0YTtcbiAgICAgICAgICBzaG93RGF0YVBvaW50cyA9IGF0dHJzLnNob3dEYXRhUG9pbnRzO1xuICAgICAgICAgIHByZXZpb3VzUmFuZ2VEYXRhUG9pbnRzID0gYXR0cnMucHJldmlvdXNSYW5nZURhdGE7XG4gICAgICAgICAgYW5ub3RhdGlvbkRhdGEgPSBhdHRycy5hbm5vdGF0aW9uRGF0YTtcblxuICAgICAgICAgIGNvbnN0IHJlZ2lzdGVyZWRDaGFydFR5cGVzOiBJQ2hhcnRUeXBlW10gPSBbXTtcbiAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5wdXNoKG5ldyBMaW5lQ2hhcnQoKSk7XG4gICAgICAgICAgcmVnaXN0ZXJlZENoYXJ0VHlwZXMucHVzaChuZXcgQXJlYUNoYXJ0KCkpO1xuICAgICAgICAgIHJlZ2lzdGVyZWRDaGFydFR5cGVzLnB1c2gobmV3IFNjYXR0ZXJDaGFydCgpKTtcbiAgICAgICAgICByZWdpc3RlcmVkQ2hhcnRUeXBlcy5wdXNoKG5ldyBTY2F0dGVyTGluZUNoYXJ0KCkpO1xuICAgICAgICAgIHJlZ2lzdGVyZWRDaGFydFR5cGVzLnB1c2gobmV3IEhpc3RvZ3JhbUNoYXJ0KCkpO1xuICAgICAgICAgIHJlZ2lzdGVyZWRDaGFydFR5cGVzLnB1c2gobmV3IFJocUJhckNoYXJ0KCkpO1xuICAgICAgICAgIHJlZ2lzdGVyZWRDaGFydFR5cGVzLnB1c2gobmV3IE11bHRpTGluZUNoYXJ0KCkpO1xuXG4gICAgICAgICAgZnVuY3Rpb24gcmVzaXplKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgICBpZiAoY2hhcnQpIHtcbiAgICAgICAgICAgICAgY2hhcnRQYXJlbnQuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaGFydFBhcmVudCA9IGQzLnNlbGVjdChlbGVtZW50WzBdKTtcblxuICAgICAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGVsZW1lbnRbMF0ucGFyZW50Tm9kZTtcblxuICAgICAgICAgICAgd2lkdGggPSAoPGFueT5wYXJlbnROb2RlKS5jbGllbnRXaWR0aDtcbiAgICAgICAgICAgIGhlaWdodCA9ICg8YW55PnBhcmVudE5vZGUpLmNsaWVudEhlaWdodDtcblxuICAgICAgICAgICAgaWYgKHdpZHRoID09PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIHNldHRpbmcgdXAgY2hhcnQuIFdpZHRoIGlzIDAgb24gY2hhcnQgcGFyZW50IGNvbnRhaW5lci5gKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGhlaWdodCA9PT0gMCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBzZXR0aW5nIHVwIGNoYXJ0LiBIZWlnaHQgaXMgMCBvbiBjaGFydCBwYXJlbnQgY29udGFpbmVyLmApO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tIC0gWF9BWElTX0hFSUdIVDtcblxuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnTWV0cmljIFdpZHRoOiAlaScsIHdpZHRoKTtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ01ldHJpYyBIZWlnaHQ6ICVpJywgaGVpZ2h0KTtcblxuICAgICAgICAgICAgaW5uZXJDaGFydEhlaWdodCA9IGhlaWdodCArIG1hcmdpbi50b3A7XG5cbiAgICAgICAgICAgIGNoYXJ0ID0gY2hhcnRQYXJlbnQuYXBwZW5kKCdzdmcnKVxuICAgICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgICAuYXR0cignaGVpZ2h0JywgaW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICAgIC8vY3JlYXRlU3ZnRGVmcyhjaGFydCk7XG5cbiAgICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBtYXJnaW4ubGVmdCArICcsJyArIChtYXJnaW4udG9wKSArICcpJyk7XG5cbiAgICAgICAgICAgIHRpcCA9IGQzLnRpcCgpXG4gICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdkMy10aXAnKVxuICAgICAgICAgICAgICAub2Zmc2V0KFstMTAsIDBdKVxuICAgICAgICAgICAgICAuaHRtbCgoZCwgaSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBidWlsZEhvdmVyKGQsIGkpO1xuICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgc3ZnLmNhbGwodGlwKTtcblxuICAgICAgICAgICAgLy8gYSBwbGFjZWhvbGRlciBmb3IgdGhlIGFsZXJ0c1xuICAgICAgICAgICAgc3ZnLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2FsZXJ0SG9sZGVyJyk7XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBzZXR1cEZpbHRlcmVkRGF0YShkYXRhUG9pbnRzOiBJQ2hhcnREYXRhUG9pbnRbXSk6IHZvaWQge1xuXG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50cykge1xuICAgICAgICAgICAgICBwZWFrID0gZDMubWF4KGRhdGFQb2ludHMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpID8gKGQuYXZnIHx8IGQudmFsdWUpIDogMDtcbiAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgIG1pbiA9IGQzLm1pbihkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKSA/IChkLmF2ZyB8fCBkLnZhbHVlKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLy8gbGV0cyBhZGp1c3QgdGhlIG1pbiBhbmQgbWF4IHRvIGFkZCBzb21lIHZpc3VhbCBzcGFjaW5nIGJldHdlZW4gaXQgYW5kIHRoZSBheGVzXG4gICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWluID0gdXNlWmVyb01pblZhbHVlID8gMCA6IG1pbiAqIC45NTtcbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBwZWFrICsgKChwZWFrIC0gbWluKSAqIDAuMik7XG5cbiAgICAgICAgICAgIC8vLyBjaGVjayBpZiB3ZSBuZWVkIHRvIGFkanVzdCBoaWdoL2xvdyBib3VuZCB0byBmaXQgYWxlcnQgdmFsdWVcbiAgICAgICAgICAgIGlmIChhbGVydFZhbHVlKSB7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBNYXRoLm1heCh2aXN1YWxseUFkanVzdGVkTWF4LCBhbGVydFZhbHVlICogMS4yKTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbiA9IE1hdGgubWluKHZpc3VhbGx5QWRqdXN0ZWRNaW4sIGFsZXJ0VmFsdWUgKiAuOTUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLy8gdXNlIGRlZmF1bHQgWSBzY2FsZSBpbiBjYXNlIGhpZ2ggYW5kIGxvdyBib3VuZCBhcmUgMCAoaWUsIG5vIHZhbHVlcyBvciBhbGwgMClcbiAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSAhISF2aXN1YWxseUFkanVzdGVkTWF4ICYmICEhIXZpc3VhbGx5QWRqdXN0ZWRNaW4gPyBERUZBVUxUX1lfU0NBTEUgOlxuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGdldFlTY2FsZSgpOiBhbnkge1xuICAgICAgICAgICAgcmV0dXJuIGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihbdmlzdWFsbHlBZGp1c3RlZE1pbiwgdmlzdWFsbHlBZGp1c3RlZE1heF0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZVNjYWxlKGRhdGFQb2ludHM6IElDaGFydERhdGFQb2ludFtdKSB7XG4gICAgICAgICAgICBsZXQgeFRpY2tzID0gZGV0ZXJtaW5lWEF4aXNUaWNrc0Zyb21TY3JlZW5XaWR0aCh3aWR0aCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0KSxcbiAgICAgICAgICAgICAgeVRpY2tzID0gZGV0ZXJtaW5lWUF4aXNUaWNrc0Zyb21TY3JlZW5IZWlnaHQobW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0KTtcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuXG4gICAgICAgICAgICAgIGNoYXJ0RGF0YSA9IGRhdGFQb2ludHM7XG5cbiAgICAgICAgICAgICAgc2V0dXBGaWx0ZXJlZERhdGEoZGF0YVBvaW50cyk7XG5cbiAgICAgICAgICAgICAgeVNjYWxlID0gZ2V0WVNjYWxlKCk7XG5cbiAgICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgLnNjYWxlKHlTY2FsZSlcbiAgICAgICAgICAgICAgICAudGlja3MoeVRpY2tzKVxuICAgICAgICAgICAgICAgIC50aWNrU2l6ZSg0LCA0LCAwKVxuICAgICAgICAgICAgICAgIC5vcmllbnQoJ2xlZnQnKTtcblxuICAgICAgICAgICAgICBsZXQgdGltZVNjYWxlTWluID0gZDMubWluKGRhdGFQb2ludHMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGQudGltZXN0YW1wO1xuICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgICAgbGV0IHRpbWVTY2FsZU1heDtcbiAgICAgICAgICAgICAgaWYgKGZvcmVjYXN0RGF0YVBvaW50cyAmJiBmb3JlY2FzdERhdGFQb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHRpbWVTY2FsZU1heCA9IGZvcmVjYXN0RGF0YVBvaW50c1tmb3JlY2FzdERhdGFQb2ludHMubGVuZ3RoIC0gMV0udGltZXN0YW1wO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRpbWVTY2FsZU1heCA9IGQzLm1heChkYXRhUG9pbnRzLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGQudGltZXN0YW1wO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgICAgIC5yYW5nZShbMCwgd2lkdGggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodF0pXG4gICAgICAgICAgICAgICAgLm5pY2UoKVxuICAgICAgICAgICAgICAgIC5kb21haW4oW3RpbWVTY2FsZU1pbiwgdGltZVNjYWxlTWF4XSk7XG5cbiAgICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgLnNjYWxlKHRpbWVTY2FsZSlcbiAgICAgICAgICAgICAgICAudGlja3MoeFRpY2tzKVxuICAgICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdib3R0b20nKTtcblxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIHNldHVwRmlsdGVyZWRNdWx0aURhdGEobXVsdGlEYXRhUG9pbnRzOiBJTXVsdGlEYXRhUG9pbnRbXSk6IGFueSB7XG4gICAgICAgICAgICBsZXQgYWxlcnRQZWFrOiBudW1iZXIsXG4gICAgICAgICAgICAgIGhpZ2hQZWFrOiBudW1iZXI7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGRldGVybWluZU11bHRpRGF0YU1pbk1heCgpIHtcbiAgICAgICAgICAgICAgbGV0IGN1cnJlbnRNYXg6IG51bWJlcixcbiAgICAgICAgICAgICAgICBjdXJyZW50TWluOiBudW1iZXIsXG4gICAgICAgICAgICAgICAgc2VyaWVzTWF4OiBudW1iZXIsXG4gICAgICAgICAgICAgICAgc2VyaWVzTWluOiBudW1iZXIsXG4gICAgICAgICAgICAgICAgbWF4TGlzdDogbnVtYmVyW10gPSBbXSxcbiAgICAgICAgICAgICAgICBtaW5MaXN0OiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgICAgICAgIG11bHRpRGF0YVBvaW50cy5mb3JFYWNoKChzZXJpZXMpID0+IHtcbiAgICAgICAgICAgICAgICBjdXJyZW50TWF4ID0gZDMubWF4KHNlcmllcy52YWx1ZXMubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/IDAgOiBkLmF2ZztcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgbWF4TGlzdC5wdXNoKGN1cnJlbnRNYXgpO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRNaW4gPSBkMy5taW4oc2VyaWVzLnZhbHVlcy5tYXAoKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKSA/IGQuYXZnIDogTnVtYmVyLk1BWF9WQUxVRTtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgbWluTGlzdC5wdXNoKGN1cnJlbnRNaW4pO1xuXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBzZXJpZXNNYXggPSBkMy5tYXgobWF4TGlzdCk7XG4gICAgICAgICAgICAgIHNlcmllc01pbiA9IGQzLm1pbihtaW5MaXN0KTtcbiAgICAgICAgICAgICAgcmV0dXJuIFtzZXJpZXNNaW4sIHNlcmllc01heF07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG1pbk1heCA9IGRldGVybWluZU11bHRpRGF0YU1pbk1heCgpO1xuICAgICAgICAgICAgcGVhayA9IG1pbk1heFsxXTtcbiAgICAgICAgICAgIG1pbiA9IG1pbk1heFswXTtcblxuICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbiA9IHVzZVplcm9NaW5WYWx1ZSA/IDAgOiBtaW4gLSAobWluICogMC4wNSk7XG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSkge1xuICAgICAgICAgICAgICBhbGVydFBlYWsgPSAoYWxlcnRWYWx1ZSAqIDEuMik7XG4gICAgICAgICAgICAgIGhpZ2hQZWFrID0gcGVhayArICgocGVhayAtIG1pbikgKiAwLjIpO1xuICAgICAgICAgICAgICB2aXN1YWxseUFkanVzdGVkTWF4ID0gYWxlcnRQZWFrID4gaGlnaFBlYWsgPyBhbGVydFBlYWsgOiBoaWdoUGVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBwZWFrICsgKChwZWFrIC0gbWluKSAqIDAuMik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBbdmlzdWFsbHlBZGp1c3RlZE1pbiwgISEhdmlzdWFsbHlBZGp1c3RlZE1heCAmJiAhISF2aXN1YWxseUFkanVzdGVkTWluID8gREVGQVVMVF9ZX1NDQUxFIDpcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1heF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gZGV0ZXJtaW5lTXVsdGlTY2FsZShtdWx0aURhdGFQb2ludHM6IElNdWx0aURhdGFQb2ludFtdKSB7XG4gICAgICAgICAgICBjb25zdCB4VGlja3MgPSBkZXRlcm1pbmVYQXhpc1RpY2tzRnJvbVNjcmVlbldpZHRoKHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQpLFxuICAgICAgICAgICAgICB5VGlja3MgPSBkZXRlcm1pbmVYQXhpc1RpY2tzRnJvbVNjcmVlbldpZHRoKG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICAgIGlmIChtdWx0aURhdGFQb2ludHMgJiYgbXVsdGlEYXRhUG9pbnRzWzBdICYmIG11bHRpRGF0YVBvaW50c1swXS52YWx1ZXMpIHtcblxuICAgICAgICAgICAgICBsZXQgbG93SGlnaCA9IHNldHVwRmlsdGVyZWRNdWx0aURhdGEobXVsdGlEYXRhUG9pbnRzKTtcbiAgICAgICAgICAgICAgdmlzdWFsbHlBZGp1c3RlZE1pbiA9IGxvd0hpZ2hbMF07XG4gICAgICAgICAgICAgIHZpc3VhbGx5QWRqdXN0ZWRNYXggPSBsb3dIaWdoWzFdO1xuXG4gICAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgICAgLmNsYW1wKHRydWUpXG4gICAgICAgICAgICAgICAgLnJhbmdlUm91bmQoW21vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgMF0pXG4gICAgICAgICAgICAgICAgLmRvbWFpbihbdmlzdWFsbHlBZGp1c3RlZE1pbiwgdmlzdWFsbHlBZGp1c3RlZE1heF0pO1xuXG4gICAgICAgICAgICAgIHlBeGlzID0gZDMuc3ZnLmF4aXMoKVxuICAgICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgICAgLnRpY2tzKHlUaWNrcylcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0Jyk7XG5cbiAgICAgICAgICAgICAgdGltZVNjYWxlID0gZDMudGltZS5zY2FsZSgpXG4gICAgICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aCAtIG1hcmdpbi5sZWZ0IC0gbWFyZ2luLnJpZ2h0XSlcbiAgICAgICAgICAgICAgICAuZG9tYWluKFtkMy5taW4obXVsdGlEYXRhUG9pbnRzLCAoZCkgPT4gZDMubWluKGQudmFsdWVzLCAocCkgPT4gcC50aW1lc3RhbXApKSxcbiAgICAgICAgICAgICAgICAgIGQzLm1heChtdWx0aURhdGFQb2ludHMsIChkKSA9PiBkMy5tYXgoZC52YWx1ZXMsIChwKSA9PiBwLnRpbWVzdGFtcCkpXSk7XG5cbiAgICAgICAgICAgICAgeEF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgICAgLnNjYWxlKHRpbWVTY2FsZSlcbiAgICAgICAgICAgICAgICAudGlja3MoeFRpY2tzKVxuICAgICAgICAgICAgICAgIC50aWNrRm9ybWF0KHhBeGlzVGltZUZvcm1hdHMoKSlcbiAgICAgICAgICAgICAgICAudGlja1NpemUoNCwgNCwgMClcbiAgICAgICAgICAgICAgICAub3JpZW50KCdib3R0b20nKTtcblxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8qKlxuICAgICAgICAgICAqIExvYWQgbWV0cmljcyBkYXRhIGRpcmVjdGx5IGZyb20gYSBydW5uaW5nIEhhd2t1bGFyLU1ldHJpY3Mgc2VydmVyXG4gICAgICAgICAgICogQHBhcmFtIHVybFxuICAgICAgICAgICAqIEBwYXJhbSBtZXRyaWNJZFxuICAgICAgICAgICAqIEBwYXJhbSBzdGFydFRpbWVzdGFtcFxuICAgICAgICAgICAqIEBwYXJhbSBlbmRUaW1lc3RhbXBcbiAgICAgICAgICAgKiBAcGFyYW0gYnVja2V0c1xuICAgICAgICAgICAqL1xuICAgICAgICAgIGZ1bmN0aW9uIGxvYWRTdGFuZEFsb25lTWV0cmljc0ZvclRpbWVSYW5nZSh1cmw6IFVybFR5cGUsXG4gICAgICAgICAgICBtZXRyaWNJZDogTWV0cmljSWQsXG4gICAgICAgICAgICBzdGFydFRpbWVzdGFtcDogVGltZUluTWlsbGlzLFxuICAgICAgICAgICAgZW5kVGltZXN0YW1wOiBUaW1lSW5NaWxsaXMsXG4gICAgICAgICAgICBidWNrZXRzID0gNjApIHtcblxuICAgICAgICAgICAgbGV0IHJlcXVlc3RDb25maWc6IG5nLklSZXF1ZXN0Q29uZmlnID0gPGFueT57XG4gICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnSGF3a3VsYXItVGVuYW50JzogbWV0cmljVGVuYW50SWRcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgc3RhcnQ6IHN0YXJ0VGltZXN0YW1wLFxuICAgICAgICAgICAgICAgIGVuZDogZW5kVGltZXN0YW1wLFxuICAgICAgICAgICAgICAgIGJ1Y2tldHM6IGJ1Y2tldHNcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKHN0YXJ0VGltZXN0YW1wID49IGVuZFRpbWVzdGFtcCkge1xuICAgICAgICAgICAgICAkbG9nLmxvZygnU3RhcnQgZGF0ZSB3YXMgYWZ0ZXIgZW5kIGRhdGUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHVybCAmJiBtZXRyaWNUeXBlICYmIG1ldHJpY0lkKSB7XG5cbiAgICAgICAgICAgICAgbGV0IG1ldHJpY1R5cGVBbmREYXRhID0gbWV0cmljVHlwZS5zcGxpdCgnLScpO1xuICAgICAgICAgICAgICAvLy8gc2FtcGxlIHVybDpcbiAgICAgICAgICAgICAgLy8vIGh0dHA6Ly9sb2NhbGhvc3Q6ODA4MC9oYXdrdWxhci9tZXRyaWNzL2dhdWdlcy80NWIyMjU2ZWZmMTljYjk4MjU0MmIxNjdiMzk1NzAzNi5zdGF0dXMuZHVyYXRpb24vZGF0YT9cbiAgICAgICAgICAgICAgLy8gYnVja2V0cz0xMjAmZW5kPTE0MzY4MzE3OTc1MzMmc3RhcnQ9MTQzNjgyODE5NzUzMydcbiAgICAgICAgICAgICAgJGh0dHAuZ2V0KHVybCArICcvJyArIG1ldHJpY1R5cGVBbmREYXRhWzBdICsgJ3MvJyArIG1ldHJpY0lkICsgJy8nICsgKG1ldHJpY1R5cGVBbmREYXRhWzFdIHx8ICdkYXRhJyksXG4gICAgICAgICAgICAgICAgcmVxdWVzdENvbmZpZykuc3VjY2VzcygocmVzcG9uc2UpID0+IHtcblxuICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkTmV3RGF0YSA9IGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuXG4gICAgICAgICAgICAgICAgfSkuZXJyb3IoKHJlYXNvbiwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAkbG9nLmVycm9yKCdFcnJvciBMb2FkaW5nIENoYXJ0IERhdGE6JyArIHN0YXR1cyArICcsICcgKyByZWFzb24pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLyoqXG4gICAgICAgICAgICogVHJhbnNmb3JtIHRoZSByYXcgaHR0cCByZXNwb25zZSBmcm9tIE1ldHJpY3MgdG8gb25lIHVzYWJsZSBpbiBjaGFydHNcbiAgICAgICAgICAgKiBAcGFyYW0gcmVzcG9uc2VcbiAgICAgICAgICAgKiBAcmV0dXJucyB0cmFuc2Zvcm1lZCByZXNwb25zZSB0byBJQ2hhcnREYXRhUG9pbnRbXSwgcmVhZHkgdG8gYmUgY2hhcnRlZFxuICAgICAgICAgICAqL1xuICAgICAgICAgIGZ1bmN0aW9uIGZvcm1hdEJ1Y2tldGVkQ2hhcnRPdXRwdXQocmVzcG9uc2UpOiBJQ2hhcnREYXRhUG9pbnRbXSB7XG4gICAgICAgICAgICAvLyAgVGhlIHNjaGVtYSBpcyBkaWZmZXJlbnQgZm9yIGJ1Y2tldGVkIG91dHB1dFxuICAgICAgICAgICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5tYXAoKHBvaW50OiBJQ2hhcnREYXRhUG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXMgPSBwb2ludC50aW1lc3RhbXAgfHwgKHBvaW50LnN0YXJ0ICsgKHBvaW50LmVuZCAtIHBvaW50LnN0YXJ0KSAvIDIpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgICAgIGRhdGU6IG5ldyBEYXRlKHRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgICB2YWx1ZTogIWFuZ3VsYXIuaXNOdW1iZXIocG9pbnQudmFsdWUpID8gdW5kZWZpbmVkIDogcG9pbnQudmFsdWUsXG4gICAgICAgICAgICAgICAgICBhdmc6IChwb2ludC5lbXB0eSkgPyB1bmRlZmluZWQgOiBwb2ludC5hdmcsXG4gICAgICAgICAgICAgICAgICBtaW46ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1pbikgPyB1bmRlZmluZWQgOiBwb2ludC5taW4sXG4gICAgICAgICAgICAgICAgICBtYXg6ICFhbmd1bGFyLmlzTnVtYmVyKHBvaW50Lm1heCkgPyB1bmRlZmluZWQgOiBwb2ludC5tYXgsXG4gICAgICAgICAgICAgICAgICBlbXB0eTogcG9pbnQuZW1wdHlcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBidWlsZEhvdmVyKGQ6IElDaGFydERhdGFQb2ludCwgaTogbnVtYmVyKSB7XG4gICAgICAgICAgICBsZXQgaG92ZXIsXG4gICAgICAgICAgICAgIHByZXZUaW1lc3RhbXAsXG4gICAgICAgICAgICAgIGN1cnJlbnRUaW1lc3RhbXAgPSBkLnRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgYmFyRHVyYXRpb24sXG4gICAgICAgICAgICAgIGZvcm1hdHRlZERhdGVUaW1lID0gbW9tZW50KGQudGltZXN0YW1wKS5mb3JtYXQoSE9WRVJfREFURV9USU1FX0ZPUk1BVCk7XG5cbiAgICAgICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgICAgICBwcmV2VGltZXN0YW1wID0gY2hhcnREYXRhW2kgLSAxXS50aW1lc3RhbXA7XG4gICAgICAgICAgICAgIGJhckR1cmF0aW9uID0gbW9tZW50KGN1cnJlbnRUaW1lc3RhbXApLmZyb20obW9tZW50KHByZXZUaW1lc3RhbXApLCB0cnVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzRW1wdHlEYXRhUG9pbnQoZCkpIHtcbiAgICAgICAgICAgICAgLy8gbm9kYXRhXG4gICAgICAgICAgICAgIGhvdmVyID0gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgICAgIDxzbWFsbCBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz4ke25vRGF0YUxhYmVsfTwvc21hbGw+XG4gICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHtkdXJhdGlvbkxhYmVsfTwvc3Bhbj48c3Bhbj46XG4gICAgICAgICAgICAgICAgPC9zcGFuPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7YmFyRHVyYXRpb259PC9zcGFuPjwvc21hbGw+IDwvZGl2PlxuICAgICAgICAgICAgICAgIDxoci8+XG4gICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHt0aW1lc3RhbXBMYWJlbH08L3NwYW4+PHNwYW4+OlxuICAgICAgICAgICAgICAgIDwvc3Bhbj48c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2Zvcm1hdHRlZERhdGVUaW1lfTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAoaXNSYXdNZXRyaWMoZCkpIHtcbiAgICAgICAgICAgICAgICAvLyByYXcgc2luZ2xlIHZhbHVlIGZyb20gcmF3IHRhYmxlXG4gICAgICAgICAgICAgICAgaG92ZXIgPSBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICAgICAgPGRpdj48c21hbGw+PHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHt0aW1lc3RhbXBMYWJlbH08L3NwYW4+PHNwYW4+OiA8L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtmb3JtYXR0ZWREYXRlVGltZX08L3NwYW4+PC9zbWFsbD48L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7ZHVyYXRpb25MYWJlbH08L3NwYW4+PHNwYW4+OiA8L3NwYW4+XG4gICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2JhckR1cmF0aW9ufTwvc3Bhbj48L3NtYWxsPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGhyLz5cbiAgICAgICAgICAgICAgICAgIDxkaXY+PHNtYWxsPjxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7c2luZ2xlVmFsdWVMYWJlbH08L3NwYW4+PHNwYW4+OiA8L3NwYW4+XG4gICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QzLnJvdW5kKGQudmFsdWUsIDIpfTwvc3Bhbj48L3NtYWxsPiA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PiBgO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGFnZ3JlZ2F0ZSB3aXRoIG1pbi9hdmcvbWF4XG4gICAgICAgICAgICAgICAgaG92ZXIgPSBgPGRpdiBjbGFzcz0nY2hhcnRIb3Zlcic+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSc+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHt0aW1lc3RhbXBMYWJlbH06PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7Zm9ybWF0dGVkRGF0ZVRpbWV9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtIGJlZm9yZS1zZXBhcmF0b3InPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyTGFiZWwnPiR7ZHVyYXRpb25MYWJlbH06PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7YmFyRHVyYXRpb259PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtIHNlcGFyYXRvcic+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHttYXhMYWJlbH06PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZDMucm91bmQoZC5tYXgsIDIpfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSc+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHthdmdMYWJlbH06PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZDMucm91bmQoZC5hdmcsIDIpfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9J2luZm8taXRlbSc+XG4gICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+JHttaW5MYWJlbH06PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPSdjaGFydEhvdmVyVmFsdWUnPiR7ZDMucm91bmQoZC5taW4sIDIpfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj4gYDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGhvdmVyO1xuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlWUF4aXNHcmlkTGluZXMoKSB7XG4gICAgICAgICAgICAvLyBjcmVhdGUgdGhlIHkgYXhpcyBncmlkIGxpbmVzXG4gICAgICAgICAgICBjb25zdCBudW1iZXJPZllBeGlzR3JpZExpbmVzID0gZGV0ZXJtaW5lWUF4aXNHcmlkTGluZVRpY2tzRnJvbVNjcmVlbkhlaWdodChtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQpO1xuXG4gICAgICAgICAgICB5U2NhbGUgPSBnZXRZU2NhbGUoKTtcblxuICAgICAgICAgICAgaWYgKHlTY2FsZSkge1xuICAgICAgICAgICAgICBsZXQgeUF4aXMgPSBzdmcuc2VsZWN0QWxsKCdnLmdyaWQueV9ncmlkJyk7XG4gICAgICAgICAgICAgIGlmICgheUF4aXNbMF0ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgeUF4aXMgPSBzdmcuYXBwZW5kKCdnJykuY2xhc3NlZCgnZ3JpZCB5X2dyaWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB5QXhpc1xuICAgICAgICAgICAgICAgIC5jYWxsKGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgICAgICAub3JpZW50KCdsZWZ0JylcbiAgICAgICAgICAgICAgICAgIC50aWNrcyhudW1iZXJPZllBeGlzR3JpZExpbmVzKVxuICAgICAgICAgICAgICAgICAgLnRpY2tTaXplKC13aWR0aCwgMClcbiAgICAgICAgICAgICAgICAgIC50aWNrRm9ybWF0KCcnKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlWGFuZFlBeGVzKCkge1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBheGlzVHJhbnNpdGlvbihzZWxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgICAgIC5kZWxheSgyNTApXG4gICAgICAgICAgICAgICAgLmR1cmF0aW9uKDc1MClcbiAgICAgICAgICAgICAgICAuYXR0cignb3BhY2l0eScsIDEuMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh5QXhpcykge1xuXG4gICAgICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJ2cuYXhpcycpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgICAgIC8qIHRzbGludDpkaXNhYmxlOm5vLXVudXNlZC12YXJpYWJsZSAqL1xuXG4gICAgICAgICAgICAgIC8vIGNyZWF0ZSB4LWF4aXNcbiAgICAgICAgICAgICAgbGV0IHhBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneCBheGlzJylcbiAgICAgICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgwLCcgKyBtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgKyAnKScpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgLmNhbGwoeEF4aXMpXG4gICAgICAgICAgICAgICAgLmNhbGwoYXhpc1RyYW5zaXRpb24pO1xuXG4gICAgICAgICAgICAgIC8vIGNyZWF0ZSB5LWF4aXNcbiAgICAgICAgICAgICAgbGV0IHlBeGlzR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuMylcbiAgICAgICAgICAgICAgICAuY2FsbCh5QXhpcylcbiAgICAgICAgICAgICAgICAuY2FsbChheGlzVHJhbnNpdGlvbik7XG5cbiAgICAgICAgICAgICAgbGV0IHlBeGlzTGFiZWwgPSBzdmcuc2VsZWN0QWxsKCcueUF4aXNVbml0c0xhYmVsJyk7XG4gICAgICAgICAgICAgIGlmIChtb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgPj0gMTUwICYmIGF0dHJzLnlBeGlzVW5pdHMpIHtcbiAgICAgICAgICAgICAgICB5QXhpc0xhYmVsID0gc3ZnLmFwcGVuZCgndGV4dCcpLmF0dHIoJ2NsYXNzJywgJ3lBeGlzVW5pdHNMYWJlbCcpXG4gICAgICAgICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3JvdGF0ZSgtOTApLHRyYW5zbGF0ZSgtMjAsLTUwKScpXG4gICAgICAgICAgICAgICAgICAuYXR0cigneCcsIC1tb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgLyAyKVxuICAgICAgICAgICAgICAgICAgLnN0eWxlKCd0ZXh0LWFuY2hvcicsICdjZW50ZXInKVxuICAgICAgICAgICAgICAgICAgLnRleHQoYXR0cnMueUF4aXNVbml0cyA9PT0gJ05PTkUnID8gJycgOiBhdHRycy55QXhpc1VuaXRzKVxuICAgICAgICAgICAgICAgICAgLmF0dHIoJ29wYWNpdHknLCAwLjMpXG4gICAgICAgICAgICAgICAgICAuY2FsbChheGlzVHJhbnNpdGlvbik7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZUNlbnRlcmVkTGluZShuZXdJbnRlcnBvbGF0aW9uKSB7XG4gICAgICAgICAgICBsZXQgaW50ZXJwb2xhdGUgPSBuZXdJbnRlcnBvbGF0aW9uIHx8ICdtb25vdG9uZScsXG4gICAgICAgICAgICAgIGxpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgICAgICAgICAgLmludGVycG9sYXRlKGludGVycG9sYXRlKVxuICAgICAgICAgICAgICAgIC5kZWZpbmVkKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAueCgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAueSgoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8geVNjYWxlKGQudmFsdWUpIDogeVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gY3JlYXRlQXZnTGluZXMoKSB7XG4gICAgICAgICAgICBpZiAoY2hhcnRUeXBlID09PSAnYmFyJyB8fCBjaGFydFR5cGUgPT09ICdzY2F0dGVybGluZScpIHtcbiAgICAgICAgICAgICAgbGV0IHBhdGhBdmdMaW5lID0gc3ZnLnNlbGVjdEFsbCgnLmJhckF2Z0xpbmUnKS5kYXRhKFtjaGFydERhdGFdKTtcbiAgICAgICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmF0dHIoJ2NsYXNzJywgJ2JhckF2Z0xpbmUnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdkJywgY3JlYXRlQ2VudGVyZWRMaW5lKCdtb25vdG9uZScpKTtcbiAgICAgICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgICAgIHBhdGhBdmdMaW5lLmVudGVyKCkuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnYmFyQXZnTGluZScpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBjcmVhdGVDZW50ZXJlZExpbmUoJ21vbm90b25lJykpO1xuICAgICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgICAgcGF0aEF2Z0xpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuc2VsZWN0QWxsKCdnLmJydXNoJyk7XG4gICAgICAgICAgICBpZiAoYnJ1c2hHcm91cC5lbXB0eSgpKSB7XG4gICAgICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnYnJ1c2gnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYnJ1c2ggPSBkMy5zdmcuYnJ1c2goKVxuICAgICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAgIC5vbignYnJ1c2hzdGFydCcsIGJydXNoU3RhcnQpXG4gICAgICAgICAgICAgIC5vbignYnJ1c2hlbmQnLCBicnVzaEVuZCk7XG5cbiAgICAgICAgICAgIGJydXNoR3JvdXAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCcucmVzaXplJykuYXBwZW5kKCdwYXRoJyk7XG5cbiAgICAgICAgICAgIGJydXNoR3JvdXAuc2VsZWN0QWxsKCdyZWN0JylcbiAgICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCk7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICAgIHN2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCB0cnVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gYnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICAgIGxldCBleHRlbnQgPSBicnVzaC5leHRlbnQoKSxcbiAgICAgICAgICAgICAgICBzdGFydFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFswXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICAgIGRyYWdTZWxlY3Rpb25EZWx0YSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgICAgICAgc3ZnLmNsYXNzZWQoJ3NlbGVjdGluZycsICFkMy5ldmVudC50YXJnZXQuZW1wdHkoKSk7XG4gICAgICAgICAgICAgIC8vIGlnbm9yZSByYW5nZSBzZWxlY3Rpb25zIGxlc3MgdGhhbiAxIG1pbnV0ZVxuICAgICAgICAgICAgICBpZiAoZHJhZ1NlbGVjdGlvbkRlbHRhID49IDYwMDAwKSB7XG4gICAgICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gW107XG5cbiAgICAgICAgICAgICAgICBsZXQgY2hhcnRPcHRpb25zOiBDaGFydE9wdGlvbnMgPSBuZXcgQ2hhcnRPcHRpb25zKHN2ZywgdGltZVNjYWxlLCB5U2NhbGUsIGNoYXJ0RGF0YSwgbXVsdGlEYXRhUG9pbnRzLFxuICAgICAgICAgICAgICAgICAgbW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0LCBoZWlnaHQsIHRpcCwgdmlzdWFsbHlBZGp1c3RlZE1heCxcbiAgICAgICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzLCBpbnRlcnBvbGF0aW9uKTtcblxuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChFdmVudE5hbWVzLkNIQVJUX1RJTUVSQU5HRV9DSEFOR0VELnRvU3RyaW5nKCksIGV4dGVudCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gY2xlYXIgdGhlIGJydXNoIHNlbGVjdGlvblxuICAgICAgICAgICAgICBicnVzaEdyb3VwLmNhbGwoYnJ1c2guY2xlYXIoKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVQcmV2aW91c1JhbmdlT3ZlcmxheShwcmV2UmFuZ2VEYXRhKSB7XG4gICAgICAgICAgICBpZiAocHJldlJhbmdlRGF0YSkge1xuICAgICAgICAgICAgICBzdmcuYXBwZW5kKCdwYXRoJylcbiAgICAgICAgICAgICAgICAuZGF0dW0ocHJldlJhbmdlRGF0YSlcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAncHJldlJhbmdlQXZnTGluZScpXG4gICAgICAgICAgICAgICAgLnN0eWxlKCdzdHJva2UtZGFzaGFycmF5JywgKCc5LDMnKSlcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIGNyZWF0ZUNlbnRlcmVkTGluZSgnbGluZWFyJykpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYW5ub3RhdGVDaGFydChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgaWYgKGFubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgIHN2Zy5zZWxlY3RBbGwoJy5hbm5vdGF0aW9uRG90JylcbiAgICAgICAgICAgICAgICAuZGF0YShhbm5vdGF0aW9uRGF0YSlcbiAgICAgICAgICAgICAgICAuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2Fubm90YXRpb25Eb3QnKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdyJywgNSlcbiAgICAgICAgICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuYXR0cignY3knLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gaGVpZ2h0IC0geVNjYWxlKHZpc3VhbGx5QWRqdXN0ZWRNYXgpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnN0eWxlKCdmaWxsJywgKGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmIChkLnNldmVyaXR5ID09PSAnMScpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdyZWQnO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkLnNldmVyaXR5ID09PSAnMicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICd5ZWxsb3cnO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICd3aGl0ZSc7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoQ29sbGVjdGlvbignZGF0YScsIChuZXdEYXRhLCBvbGREYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAobmV3RGF0YSB8fCBvbGREYXRhKSB7XG4gICAgICAgICAgICAgIHByb2Nlc3NlZE5ld0RhdGEgPSBhbmd1bGFyLmZyb21Kc29uKG5ld0RhdGEgfHwgW10pO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ211bHRpRGF0YScsIChuZXdNdWx0aURhdGEsIG9sZE11bHRpRGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld011bHRpRGF0YSB8fCBvbGRNdWx0aURhdGEpIHtcbiAgICAgICAgICAgICAgbXVsdGlEYXRhUG9pbnRzID0gYW5ndWxhci5mcm9tSnNvbihuZXdNdWx0aURhdGEgfHwgW10pO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ3ByZXZpb3VzUmFuZ2VEYXRhJywgKG5ld1ByZXZpb3VzUmFuZ2VWYWx1ZXMpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdQcmV2aW91c1JhbmdlVmFsdWVzKSB7XG4gICAgICAgICAgICAgIHByb2Nlc3NlZFByZXZpb3VzUmFuZ2VEYXRhID0gYW5ndWxhci5mcm9tSnNvbihuZXdQcmV2aW91c1JhbmdlVmFsdWVzKTtcbiAgICAgICAgICAgICAgc2NvcGUucmVuZGVyKHByb2Nlc3NlZE5ld0RhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgc2NvcGUuJHdhdGNoKCdhbm5vdGF0aW9uRGF0YScsIChuZXdBbm5vdGF0aW9uRGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld0Fubm90YXRpb25EYXRhKSB7XG4gICAgICAgICAgICAgIGFubm90YXRpb25EYXRhID0gYW5ndWxhci5mcm9tSnNvbihuZXdBbm5vdGF0aW9uRGF0YSk7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaCgnZm9yZWNhc3REYXRhJywgKG5ld0ZvcmVjYXN0RGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5ld0ZvcmVjYXN0RGF0YSkge1xuICAgICAgICAgICAgICBmb3JlY2FzdERhdGFQb2ludHMgPSBhbmd1bGFyLmZyb21Kc29uKG5ld0ZvcmVjYXN0RGF0YSk7XG4gICAgICAgICAgICAgIHNjb3BlLnJlbmRlcihwcm9jZXNzZWROZXdEYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgIHNjb3BlLiR3YXRjaEdyb3VwKFsnYWxlcnRWYWx1ZScsICdjaGFydFR5cGUnLCAnaGlkZUhpZ2hMb3dWYWx1ZXMnLCAndXNlWmVyb01pblZhbHVlJywgJ3Nob3dBdmdMaW5lJ10sXG4gICAgICAgICAgICAoY2hhcnRBdHRycykgPT4ge1xuICAgICAgICAgICAgICBhbGVydFZhbHVlID0gY2hhcnRBdHRyc1swXSB8fCBhbGVydFZhbHVlO1xuICAgICAgICAgICAgICBjaGFydFR5cGUgPSBjaGFydEF0dHJzWzFdIHx8IGNoYXJ0VHlwZTtcbiAgICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXMgPSAodHlwZW9mIGNoYXJ0QXR0cnNbMl0gIT09ICd1bmRlZmluZWQnKSA/IGNoYXJ0QXR0cnNbMl0gOiBoaWRlSGlnaExvd1ZhbHVlcztcbiAgICAgICAgICAgICAgdXNlWmVyb01pblZhbHVlID0gKHR5cGVvZiBjaGFydEF0dHJzWzNdICE9PSAndW5kZWZpbmVkJykgPyBjaGFydEF0dHJzWzNdIDogdXNlWmVyb01pblZhbHVlO1xuICAgICAgICAgICAgICBzaG93QXZnTGluZSA9ICh0eXBlb2YgY2hhcnRBdHRyc1s0XSAhPT0gJ3VuZGVmaW5lZCcpID8gY2hhcnRBdHRyc1s0XSA6IHNob3dBdmdMaW5lO1xuICAgICAgICAgICAgICBzY29wZS5yZW5kZXIocHJvY2Vzc2VkTmV3RGF0YSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGxvYWRTdGFuZEFsb25lTWV0cmljc1RpbWVSYW5nZUZyb21Ob3coKSB7XG4gICAgICAgICAgICBlbmRUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSBtb21lbnQoKS5zdWJ0cmFjdCh0aW1lUmFuZ2VJblNlY29uZHMsICdzZWNvbmRzJykudmFsdWVPZigpO1xuICAgICAgICAgICAgbG9hZFN0YW5kQWxvbmVNZXRyaWNzRm9yVGltZVJhbmdlKGRhdGFVcmwsIG1ldHJpY0lkLCBzdGFydFRpbWVzdGFtcCwgZW5kVGltZXN0YW1wLCA2MCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8vIHN0YW5kYWxvbmUgY2hhcnRzIGF0dHJpYnV0ZXNcbiAgICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ21ldHJpY1VybCcsICdtZXRyaWNJZCcsICdtZXRyaWNUeXBlJywgJ21ldHJpY1RlbmFudElkJywgJ3RpbWVSYW5nZUluU2Vjb25kcyddLFxuICAgICAgICAgICAgKHN0YW5kQWxvbmVQYXJhbXMpID0+IHtcbiAgICAgICAgICAgICAgZGF0YVVybCA9IHN0YW5kQWxvbmVQYXJhbXNbMF0gfHwgZGF0YVVybDtcbiAgICAgICAgICAgICAgbWV0cmljSWQgPSBzdGFuZEFsb25lUGFyYW1zWzFdIHx8IG1ldHJpY0lkO1xuICAgICAgICAgICAgICBtZXRyaWNUeXBlID0gc3RhbmRBbG9uZVBhcmFtc1syXSB8fCBtZXRyaWNJZDtcbiAgICAgICAgICAgICAgbWV0cmljVGVuYW50SWQgPSBzdGFuZEFsb25lUGFyYW1zWzNdIHx8IG1ldHJpY1RlbmFudElkO1xuICAgICAgICAgICAgICB0aW1lUmFuZ2VJblNlY29uZHMgPSBzdGFuZEFsb25lUGFyYW1zWzRdIHx8IHRpbWVSYW5nZUluU2Vjb25kcztcbiAgICAgICAgICAgICAgbG9hZFN0YW5kQWxvbmVNZXRyaWNzVGltZVJhbmdlRnJvbU5vdygpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzY29wZS4kd2F0Y2goJ3JlZnJlc2hJbnRlcnZhbEluU2Vjb25kcycsIChuZXdSZWZyZXNoSW50ZXJ2YWwpID0+IHtcbiAgICAgICAgICAgIGlmIChuZXdSZWZyZXNoSW50ZXJ2YWwpIHtcbiAgICAgICAgICAgICAgcmVmcmVzaEludGVydmFsSW5TZWNvbmRzID0gK25ld1JlZnJlc2hJbnRlcnZhbDtcbiAgICAgICAgICAgICAgJGludGVydmFsLmNhbmNlbChzdGFydEludGVydmFsUHJvbWlzZSk7XG4gICAgICAgICAgICAgIHN0YXJ0SW50ZXJ2YWxQcm9taXNlID0gJGludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2FkU3RhbmRBbG9uZU1ldHJpY3NUaW1lUmFuZ2VGcm9tTm93KCk7XG4gICAgICAgICAgICAgIH0sIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kcyAqIDEwMDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJG9uKCckZGVzdHJveScsICgpID0+IHtcbiAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc3RhcnRJbnRlcnZhbFByb21pc2UpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJG9uKEV2ZW50TmFtZXMuREFURV9SQU5HRV9EUkFHX0NIQU5HRUQsIChldmVudCwgZXh0ZW50KSA9PiB7XG4gICAgICAgICAgICBzY29wZS4kZW1pdChFdmVudE5hbWVzLkNIQVJUX1RJTUVSQU5HRV9DSEFOR0VELCBleHRlbnQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2NvcGUuJG9uKEV2ZW50TmFtZXMuQ0hBUlRfVElNRVJBTkdFX0NIQU5HRUQsIChldmVudCwgZXh0ZW50KSA9PiB7XG4gICAgICAgICAgICAvLyBmb3JlY2FzdCBkYXRhIG5vdCByZWxldmFudCB0byBwYXN0IGRhdGFcbiAgICAgICAgICAgIGF0dHJzLmZvcmVjYXN0RGF0YSA9IFtdO1xuICAgICAgICAgICAgZm9yZWNhc3REYXRhUG9pbnRzID0gW107XG4gICAgICAgICAgICBzY29wZS4kZGlnZXN0KCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBkZXRlcm1pbmVDaGFydFR5cGVBbmREcmF3KGNoYXJ0VHlwZTogc3RyaW5nLCBjaGFydE9wdGlvbnM6IENoYXJ0T3B0aW9ucykge1xuXG4gICAgICAgICAgICAvL0B0b2RvOiBhZGQgaW4gbXVsdGlsaW5lIGFuZCByaHFiYXIgY2hhcnQgdHlwZXNcbiAgICAgICAgICAgIC8vQHRvZG86IGFkZCB2YWxpZGF0aW9uIGlmIG5vdCBpbiB2YWxpZCBjaGFydCB0eXBlc1xuICAgICAgICAgICAgcmVnaXN0ZXJlZENoYXJ0VHlwZXMuZm9yRWFjaCgoYUNoYXJ0VHlwZSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoYUNoYXJ0VHlwZS5uYW1lID09PSBjaGFydFR5cGUpIHtcbiAgICAgICAgICAgICAgICBhQ2hhcnRUeXBlLmRyYXdDaGFydChjaGFydE9wdGlvbnMpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIH1cblxuICAgICAgICAgIHNjb3BlLnJlbmRlciA9IChkYXRhUG9pbnRzKSA9PiB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBkb24ndCBoYXZlIGRhdGEsIGRvbid0IGJvdGhlci4uXG4gICAgICAgICAgICBpZiAoIWRhdGFQb2ludHMgJiYgIW11bHRpRGF0YVBvaW50cykge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwKCdSZW5kZXIgQ2hhcnQnKTtcbiAgICAgICAgICAgICAgY29uc29sZS50aW1lKCdjaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy9OT1RFOiBsYXllcmluZyBvcmRlciBpcyBpbXBvcnRhbnQhXG4gICAgICAgICAgICByZXNpemUoKTtcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgZGV0ZXJtaW5lU2NhbGUoZGF0YVBvaW50cyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvL211bHRpRGF0YVBvaW50cyBleGlzdFxuICAgICAgICAgICAgICBkZXRlcm1pbmVNdWx0aVNjYWxlKG11bHRpRGF0YVBvaW50cyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGxldCBjaGFydE9wdGlvbnM6IENoYXJ0T3B0aW9ucyA9IG5ldyBDaGFydE9wdGlvbnMoc3ZnLCB0aW1lU2NhbGUsIHlTY2FsZSwgY2hhcnREYXRhLCBtdWx0aURhdGFQb2ludHMsXG4gICAgICAgICAgICAgIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodCwgaGVpZ2h0LCB0aXAsIHZpc3VhbGx5QWRqdXN0ZWRNYXgsXG4gICAgICAgICAgICAgIGhpZGVIaWdoTG93VmFsdWVzLCBpbnRlcnBvbGF0aW9uKTtcblxuICAgICAgICAgICAgaWYgKGFsZXJ0VmFsdWUgJiYgKGFsZXJ0VmFsdWUgPiB2aXN1YWxseUFkanVzdGVkTWluICYmIGFsZXJ0VmFsdWUgPCB2aXN1YWxseUFkanVzdGVkTWF4KSkge1xuICAgICAgICAgICAgICBjcmVhdGVBbGVydEJvdW5kc0FyZWEoY2hhcnRPcHRpb25zLCBhbGVydFZhbHVlLCB2aXN1YWxseUFkanVzdGVkTWF4KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuICAgICAgICAgICAgY3JlYXRlWUF4aXNHcmlkTGluZXMoKTtcbiAgICAgICAgICAgIGRldGVybWluZUNoYXJ0VHlwZUFuZERyYXcoY2hhcnRUeXBlLCBjaGFydE9wdGlvbnMpO1xuXG4gICAgICAgICAgICBpZiAoc2hvd0RhdGFQb2ludHMpIHtcbiAgICAgICAgICAgICAgY3JlYXRlRGF0YVBvaW50cyhzdmcsIHRpbWVTY2FsZSwgeVNjYWxlLCB0aXAsIGNoYXJ0RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjcmVhdGVQcmV2aW91c1JhbmdlT3ZlcmxheShwcmV2aW91c1JhbmdlRGF0YVBvaW50cyk7XG4gICAgICAgICAgICBjcmVhdGVYYW5kWUF4ZXMoKTtcbiAgICAgICAgICAgIGlmIChzaG93QXZnTGluZSkge1xuICAgICAgICAgICAgICBjcmVhdGVBdmdMaW5lcygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYWxlcnRWYWx1ZSAmJiAoYWxlcnRWYWx1ZSA+IHZpc3VhbGx5QWRqdXN0ZWRNaW4gJiYgYWxlcnRWYWx1ZSA8IHZpc3VhbGx5QWRqdXN0ZWRNYXgpKSB7XG4gICAgICAgICAgICAgIC8vLyBOT1RFOiB0aGlzIGFsZXJ0IGxpbmUgaGFzIGhpZ2hlciBwcmVjZWRlbmNlIGZyb20gYWxlcnQgYXJlYSBhYm92ZVxuICAgICAgICAgICAgICBjcmVhdGVBbGVydExpbmUoY2hhcnRPcHRpb25zLCBhbGVydFZhbHVlLCAnYWxlcnRMaW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhbm5vdGF0aW9uRGF0YSkge1xuICAgICAgICAgICAgICBhbm5vdGF0ZUNoYXJ0KGFubm90YXRpb25EYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmb3JlY2FzdERhdGFQb2ludHMgJiYgZm9yZWNhc3REYXRhUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgc2hvd0ZvcmVjYXN0RGF0YShmb3JlY2FzdERhdGFQb2ludHMsIGNoYXJ0T3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZGVidWcpIHtcbiAgICAgICAgICAgICAgY29uc29sZS50aW1lRW5kKCdjaGFydFJlbmRlcicpO1xuICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCdSZW5kZXIgQ2hhcnQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBsaW5rOiBsaW5rLFxuICAgICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgICAgcmVwbGFjZTogdHJ1ZSxcbiAgICAgICAgICBzY29wZToge1xuICAgICAgICAgICAgZGF0YTogJz0nLFxuICAgICAgICAgICAgbXVsdGlEYXRhOiAnPScsXG4gICAgICAgICAgICBmb3JlY2FzdERhdGE6ICc9JyxcbiAgICAgICAgICAgIG1ldHJpY1VybDogJ0AnLFxuICAgICAgICAgICAgbWV0cmljSWQ6ICdAJyxcbiAgICAgICAgICAgIG1ldHJpY1R5cGU6ICdAJyxcbiAgICAgICAgICAgIG1ldHJpY1RlbmFudElkOiAnQCcsXG4gICAgICAgICAgICBzdGFydFRpbWVzdGFtcDogJ0AnLFxuICAgICAgICAgICAgZW5kVGltZXN0YW1wOiAnQCcsXG4gICAgICAgICAgICB0aW1lUmFuZ2VJblNlY29uZHM6ICdAJyxcbiAgICAgICAgICAgIHJlZnJlc2hJbnRlcnZhbEluU2Vjb25kczogJ0AnLFxuICAgICAgICAgICAgcHJldmlvdXNSYW5nZURhdGE6ICdAJyxcbiAgICAgICAgICAgIGFubm90YXRpb25EYXRhOiAnQCcsXG4gICAgICAgICAgICBzaG93RGF0YVBvaW50czogJz0nLFxuICAgICAgICAgICAgYWxlcnRWYWx1ZTogJ0AnLFxuICAgICAgICAgICAgaW50ZXJwb2xhdGlvbjogJ0AnLFxuICAgICAgICAgICAgY2hhcnRUeXBlOiAnQCcsXG4gICAgICAgICAgICB5QXhpc1VuaXRzOiAnQCcsXG4gICAgICAgICAgICB1c2VaZXJvTWluVmFsdWU6ICc9JyxcbiAgICAgICAgICAgIGNoYXJ0SG92ZXJEYXRlRm9ybWF0OiAnQCcsXG4gICAgICAgICAgICBjaGFydEhvdmVyVGltZUZvcm1hdDogJ0AnLFxuICAgICAgICAgICAgc2luZ2xlVmFsdWVMYWJlbDogJ0AnLFxuICAgICAgICAgICAgbm9EYXRhTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIGR1cmF0aW9uTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIG1pbkxhYmVsOiAnQCcsXG4gICAgICAgICAgICBtYXhMYWJlbDogJ0AnLFxuICAgICAgICAgICAgYXZnTGFiZWw6ICdAJyxcbiAgICAgICAgICAgIHRpbWVzdGFtcExhYmVsOiAnQCcsXG4gICAgICAgICAgICBzaG93QXZnTGluZTogJz0nLFxuICAgICAgICAgICAgaGlkZUhpZ2hMb3dWYWx1ZXM6ICc9J1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgIF1cbiAgICApXG4gICAgO1xufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZGVjbGFyZSBsZXQgZDM6IGFueTtcblxuIC8vIE1hbmFnZUlRIEV4dGVybmFsIE1hbmFnZW1lbnQgU3lzdGVtIEV2ZW50XG4gIGV4cG9ydCBjbGFzcyBFbXNFdmVudCB7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXMsXG4gICAgICAgICAgICAgICAgcHVibGljIGV2ZW50U291cmNlOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIHByb3ZpZGVyOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIGh0bWw/OiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIG1lc3NhZ2U/OiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIHJlc291cmNlPzogc3RyaW5nKSB7XG4gICAgfVxuICB9XG5cbi8vIFRpbWVsaW5lIHNwZWNpZmljIGZvciBNYW5hZ2VJUSBUaW1lbGluZSBjb21wb25lbnRcbiAgLyoqXG4gICAqIFRpbWVsaW5lRXZlbnQgaXMgYSBzdWJjbGFzcyBvZiBFbXNFdmVudCB0aGF0IGlzIHNwZWNpYWxpemVkIHRvd2FyZCBzY3JlZW4gZGlzcGxheVxuICAgKi9cbiAgZXhwb3J0IGNsYXNzIFRpbWVsaW5lRXZlbnQgZXh0ZW5kcyBFbXNFdmVudCB7XG5cbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXMsXG4gICAgICAgICAgICAgICAgcHVibGljIGV2ZW50U291cmNlOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIHByb3ZpZGVyOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIGh0bWw/OiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIG1lc3NhZ2U/OiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHVibGljIHJlc291cmNlPzogc3RyaW5nLFxuICAgICAgICAgICAgICAgIHB1YmxpYyBmb3JtYXR0ZWREYXRlPzogc3RyaW5nLFxuICAgICAgICAgICAgICAgIHB1YmxpYyBjb2xvcj86IHN0cmluZyxcbiAgICAgICAgICAgICAgICBwdWJsaWMgcm93PzogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHB1YmxpYyBzZWxlY3RlZD86IGJvb2xlYW4pIHtcbiAgICAgIHN1cGVyKHRpbWVzdGFtcCwgZXZlbnRTb3VyY2UsIHByb3ZpZGVyLCBodG1sLCBtZXNzYWdlLCByZXNvdXJjZSk7XG4gICAgICB0aGlzLmZvcm1hdHRlZERhdGUgPSBtb21lbnQodGltZXN0YW1wKS5mb3JtYXQoJ01NTU0gRG8gWVlZWSwgaDptbTpzcyBhJyk7XG4gICAgICB0aGlzLnNlbGVjdGVkID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQnVpbGQgVGltZWxpbmVFdmVudHMgZnJvbSBFbXNFdmVudHNcbiAgICAgKiBAcGFyYW0gZW1zRXZlbnRzXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBidWlsZEV2ZW50cyhlbXNFdmVudHM6IEVtc0V2ZW50W10pOiBUaW1lbGluZUV2ZW50W10ge1xuICAgICAgLy8gIFRoZSBzY2hlbWEgaXMgZGlmZmVyZW50IGZvciBidWNrZXRlZCBvdXRwdXRcbiAgICAgIGlmIChlbXNFdmVudHMpIHtcbiAgICAgICAgcmV0dXJuIGVtc0V2ZW50cy5tYXAoKGVtc0V2ZW50OiBFbXNFdmVudCkgPT4ge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0aW1lc3RhbXA6IGVtc0V2ZW50LnRpbWVzdGFtcCxcbiAgICAgICAgICAgIGV2ZW50U291cmNlOiBlbXNFdmVudC5ldmVudFNvdXJjZSxcbiAgICAgICAgICAgIHByb3ZpZGVyOiBlbXNFdmVudC5ldmVudFNvdXJjZSxcbiAgICAgICAgICAgIGh0bWw6IGVtc0V2ZW50Lmh0bWwgJiYgYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPiAke2Vtc0V2ZW50Lmh0bWx9PC9kaXY+YCxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVtc0V2ZW50Lm1lc3NhZ2UsXG4gICAgICAgICAgICByZXNvdXJjZTogZW1zRXZlbnQucmVzb3VyY2UsXG4gICAgICAgICAgICBmb3JtYXR0ZWREYXRlOiBtb21lbnQoZW1zRXZlbnQudGltZXN0YW1wKS5mb3JtYXQoJ01NTU0gRG8gWVlZWSwgaDptbTpzcyBhJyksXG4gICAgICAgICAgICBjb2xvcjogZW1zRXZlbnQuZXZlbnRTb3VyY2UgPT09ICdIYXdrdWxhcicgPyAnIzAwODhjZScgOiAnI2VjN2EwOCcsXG4gICAgICAgICAgICByb3c6IFJvd051bWJlci5uZXh0Um93KCksXG4gICAgICAgICAgICBzZWxlY3RlZDogZmFsc2VcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCdWlsZEZha2VFdmVudHMgaXMgYSBmYWtlIGV2ZW50IGJ1aWxkZXIgZm9yIHRlc3RpbmcvcHJvdG90eXBpbmdcbiAgICAgKiBAcGFyYW0gbiB0aGUgbnVtYmVyIG9mIGV2ZW50cyB5b3Ugd2FudCBnZW5lcmF0ZWRcbiAgICAgKiBAcGFyYW0gc3RhcnRUaW1lU3RhbXBcbiAgICAgKiBAcGFyYW0gZW5kVGltZXN0YW1wXG4gICAgICogQHJldHVybnMge1RpbWVsaW5lRXZlbnRbXX1cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIGJ1aWxkRmFrZUV2ZW50cyhuOiBudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRUaW1lU3RhbXA6IFRpbWVJbk1pbGxpcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRUaW1lc3RhbXA6IFRpbWVJbk1pbGxpcyk6IFRpbWVsaW5lRXZlbnRbXSB7XG4gICAgICBsZXQgZXZlbnRzOiBUaW1lbGluZUV2ZW50W10gPSBbXTtcbiAgICAgIGNvbnN0IHN0ZXAgPSAoZW5kVGltZXN0YW1wIC0gc3RhcnRUaW1lU3RhbXApIC8gbjtcblxuICAgICAgZm9yKGxldCBpID0gIHN0YXJ0VGltZVN0YW1wOyBpIDwgZW5kVGltZXN0YW1wOyBpICs9IHN0ZXApIHtcbiAgICAgICAgbGV0IHJhbmRvbVRpbWUgPSBSYW5kb20ucmFuZG9tQmV0d2VlbihzdGFydFRpbWVTdGFtcCwgZW5kVGltZXN0YW1wKTtcbiAgICAgICAgY29uc3QgZXZlbnQgPSBuZXcgVGltZWxpbmVFdmVudChyYW5kb21UaW1lLCAnSGF3a3VsYXInLCAnSGF3a3VsYXIgUHJvdmlkZXInLCBudWxsLFxuICAgICAgICAgICdTb21lIE1lc3NhZ2UnLCAnUmVzb3VyY2UnICsgJy0nICsgUmFuZG9tLnJhbmRvbUJldHdlZW4oMTAsMTAwKSxcbiAgICAgICAgICBtb21lbnQoaSkuZm9ybWF0KCdNTU1NIERvIFlZWVksIGg6bW06c3MgYScpLCAnMDA4OGNlJywgUm93TnVtYmVyLm5leHRSb3coKSk7XG5cbiAgICAgICAgZXZlbnRzLnB1c2goZXZlbnQpO1xuXG4gICAgICB9XG4gICAgICByZXR1cm4gZXZlbnRzO1xuICAgIH1cblxuICB9XG5cbiAgLyoqXG4gICAqIFJhbmRvbSBudW1iZXIgZ2VuZXJhdG9yXG4gICAqL1xuICBleHBvcnQgY2xhc3MgUmFuZG9tIHtcbiAgICBwdWJsaWMgc3RhdGljIHJhbmRvbUJldHdlZW4obWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgIHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluICsgMSkpICsgbWluO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogUm93TnVtYmVyIGNsYXNzIHVzZWQgdG8gY2FsY3VsYXRlIHdoaWNoIHJvdyBpbiB0aGUgVGltZWxpbmVDaGFydCBhbiBFdmVudCBzaG91bGQgYmUgcGxhY2VkLlxuICAgKiBUaGlzIGlzIHNvIGV2ZW50cyBkb24ndCBwaWxlIHVwIG9uIGVhY2ggb3RoZXIuIFRoZSBuZXh0IGV2ZW50IHdpbGwgYmUgcGxhY2VkIG9uIHRoZSBuZXh0IHJvd1xuICAgKiBzdWNoIHRoYXQgbGFiZWxzIGNhbiBiZSBwbGFjZWRcbiAgICovXG4gIGNsYXNzIFJvd051bWJlciB7XG5cbiAgICBwcml2YXRlIHN0YXRpYyBfY3VycmVudFJvdyA9IDA7XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgcm93IG51bWJlciBmcm9tIDEgdG8gNSBmb3IgZGV0ZXJtaW5pbmcgd2hpY2ggcm93IGFuIGV2ZW50IHNob3VsZCBiZSBwbGFjZWQgb24uXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIG5leHRSb3coKTogbnVtYmVyIHtcbiAgICAgIGNvbnN0IE1BWF9ST1dTID0gNTtcblxuICAgICAgUm93TnVtYmVyLl9jdXJyZW50Um93Kys7XG5cbiAgICAgIGlmKFJvd051bWJlci5fY3VycmVudFJvdyA+IE1BWF9ST1dTKSB7XG4gICAgICAgIFJvd051bWJlci5fY3VycmVudFJvdyA9IDE7IC8vIHJlc2V0IGJhY2sgdG8gemVyb1xuICAgICAgfVxuICAgICAgLy8gcmV2ZXJzZSB0aGUgb3JkZXJpbmcgb2YgdGhlIG51bWJlcnMgc28gdGhhdCAxIGJlY29tZXMgNVxuICAgICAgLy8gc28gdGhhdCB0aGUgZXZlbnRzIGFyZSBsYWlkIG91dCBmcm9tIHRvcCAtPiBib3R0b20gaW5zdGVhZCBvZiBib3R0b20gLT4gdG9wXG4gICAgICByZXR1cm4gKE1BWF9ST1dTICsgMSApIC0gUm93TnVtYmVyLl9jdXJyZW50Um93O1xuICAgIH1cblxuICB9XG5cbiAgY29uc3QgX21vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdoYXdrdWxhci5jaGFydHMnKTtcblxuICBleHBvcnQgY2xhc3MgVGltZWxpbmVDaGFydERpcmVjdGl2ZSB7XG5cbiAgICBwcml2YXRlIHN0YXRpYyBfQ0hBUlRfSEVJR0hUID0gMTUwO1xuICAgIHByaXZhdGUgc3RhdGljIF9DSEFSVF9XSURUSCA9IDc1MDtcblxuICAgIHB1YmxpYyByZXN0cmljdCA9ICdFJztcbiAgICBwdWJsaWMgcmVwbGFjZSA9IHRydWU7XG5cbiAgICAvLyBDYW4ndCB1c2UgMS40IGRpcmVjdGl2ZSBjb250cm9sbGVycyBiZWNhdXNlIHdlIG5lZWQgdG8gc3VwcG9ydCAxLjMrXG4gICAgcHVibGljIHNjb3BlID0ge1xuICAgICAgZXZlbnRzOiAnPScsXG4gICAgICBzdGFydFRpbWVzdGFtcDogJ0AnLCAvLyB0byBwcm92aWRlIGZvciBleGFjdCBib3VuZGFyaWVzIG9mIHN0YXJ0L3N0b3AgdGltZXMgKGlmIG9taXR0ZWQsIGl0IHdpbGwgYmUgY2FsY3VsYXRlZClcbiAgICAgIGVuZFRpbWVzdGFtcDogJ0AnLFxuICAgIH07XG5cbiAgICBwdWJsaWMgbGluazogKHNjb3BlOiBhbnksIGVsZW1lbnQ6IG5nLklBdWdtZW50ZWRKUXVlcnksIGF0dHJzOiBhbnkpID0+IHZvaWQ7XG5cbiAgICBwdWJsaWMgZXZlbnRzOiBUaW1lbGluZUV2ZW50W107XG5cbiAgICBjb25zdHJ1Y3Rvcigkcm9vdFNjb3BlOiBuZy5JUm9vdFNjb3BlU2VydmljZSkge1xuXG4gICAgICB0aGlzLmxpbmsgPSAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSA9PiB7XG5cbiAgICAgICAgLy8gZGF0YSBzcGVjaWZpYyB2YXJzXG4gICAgICAgIGxldCBzdGFydFRpbWVzdGFtcDogbnVtYmVyID0gK3Njb3BlLnN0YXJ0VGltZXN0YW1wLFxuICAgICAgICAgIGVuZFRpbWVzdGFtcDogbnVtYmVyID0gK3Njb3BlLmVuZFRpbWVzdGFtcCxcbiAgICAgICAgICBjaGFydEhlaWdodDogbnVtYmVyID0gVGltZWxpbmVDaGFydERpcmVjdGl2ZS5fQ0hBUlRfSEVJR0hUO1xuXG4gICAgICAgIC8vIGNoYXJ0IHNwZWNpZmljIHZhcnNcbiAgICAgICAgbGV0IG1hcmdpbiA9IHsgdG9wOiAxMCwgcmlnaHQ6IDUsIGJvdHRvbTogNSwgbGVmdDogMTAgfSxcbiAgICAgICAgICB3aWR0aCA9IFRpbWVsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQsXG4gICAgICAgICAgYWRqdXN0ZWRDaGFydEhlaWdodCA9IGNoYXJ0SGVpZ2h0IC0gNTAsXG4gICAgICAgICAgaGVpZ2h0ID0gYWRqdXN0ZWRDaGFydEhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tLFxuICAgICAgICAgIHRpdGxlSGVpZ2h0ID0gMzAsXG4gICAgICAgICAgdGl0bGVTcGFjZSA9IDEwLFxuICAgICAgICAgIGlubmVyQ2hhcnRIZWlnaHQgPSBoZWlnaHQgKyBtYXJnaW4udG9wIC0gdGl0bGVIZWlnaHQgLSB0aXRsZVNwYWNlLFxuICAgICAgICAgIGFkanVzdGVkQ2hhcnRIZWlnaHQyID0gK3RpdGxlSGVpZ2h0ICsgdGl0bGVTcGFjZSArIG1hcmdpbi50b3AsXG4gICAgICAgICAgeVNjYWxlLFxuICAgICAgICAgIHRpbWVTY2FsZSxcbiAgICAgICAgICB5QXhpcyxcbiAgICAgICAgICB4QXhpcyxcbiAgICAgICAgICB4QXhpc0dyb3VwLFxuICAgICAgICAgIGJydXNoLFxuICAgICAgICAgIGJydXNoR3JvdXAsXG4gICAgICAgICAgdGlwLFxuICAgICAgICAgIGNoYXJ0LFxuICAgICAgICAgIGNoYXJ0UGFyZW50LFxuICAgICAgICAgIHN2ZztcblxuICAgICAgICBmdW5jdGlvbiBUaW1lbGluZUhvdmVyKGQ6IFRpbWVsaW5lRXZlbnQpIHtcbiAgICAgICAgICByZXR1cm4gYDxkaXYgY2xhc3M9J2NoYXJ0SG92ZXInPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+RXZlbnQgU291cmNlOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLmV2ZW50U291cmNlfTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+UHJvdmlkZXI6PC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlclZhbHVlJz4ke2QucHJvdmlkZXJ9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz5NZXNzYWdlOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLm1lc3NhZ2V9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPSdpbmZvLWl0ZW0nPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz0nY2hhcnRIb3ZlckxhYmVsJz5NaWRkbGV3YXJlIFJlc291cmNlOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHtkLnJlc291cmNlfTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz0naW5mby1pdGVtJz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJMYWJlbCc+RGF0ZSBUaW1lOjwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9J2NoYXJ0SG92ZXJWYWx1ZSc+JHttb21lbnQoZC50aW1lc3RhbXApLmZvcm1hdCgnTS9EL1lZLCBIOm1tOnNzICcpfTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB0aW1lbGluZUNoYXJ0U2V0dXAoKTogdm9pZCB7XG4gICAgICAgICAgLy8gZGVzdHJveSBhbnkgcHJldmlvdXMgY2hhcnRzXG4gICAgICAgICAgaWYgKGNoYXJ0KSB7XG4gICAgICAgICAgICBjaGFydFBhcmVudC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hhcnRQYXJlbnQgPSBkMy5zZWxlY3QoZWxlbWVudFswXSk7XG4gICAgICAgICAgY2hhcnQgPSBjaGFydFBhcmVudC5hcHBlbmQoJ3N2ZycpXG4gICAgICAgICAgICAuYXR0cigndmlld0JveCcsICcwIDAgNzYwIDE1MCcpLmF0dHIoJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLCAneE1pbllNaW4gbWVldCcpO1xuXG4gICAgICAgICAgdGlwID0gZDMudGlwKClcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdkMy10aXAnKVxuICAgICAgICAgICAgLmh0bWwoKGQgKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAoZC5odG1sKSA/IGQuaHRtbCA6IFRpbWVsaW5lSG92ZXIoZCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIHN2ZyA9IGNoYXJ0LmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignd2lkdGgnLCB3aWR0aCArIG1hcmdpbi5sZWZ0ICsgbWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIGlubmVyQ2hhcnRIZWlnaHQpXG4gICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgbWFyZ2luLmxlZnQgKyAnLCcgKyAoYWRqdXN0ZWRDaGFydEhlaWdodDIpICsgJyknKTtcblxuICAgICAgICAgIHN2Zy5jYWxsKHRpcCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBwb3NpdGlvblRpcChjaXJjbGUsIGQsIGkpIHtcbiAgICAgICAgICB0aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICBsZXQgdGlwUG9zaXRpb24gPSBOdW1iZXIoY2lyY2xlLmF0dHIoJ2N4JykpICsgTnVtYmVyKHRpcC5zdHlsZSgnd2lkdGgnKS5zbGljZSgwLCAtMikpO1xuICAgICAgICAgIGlmICh0aXBQb3NpdGlvbiA+IFRpbWVsaW5lQ2hhcnREaXJlY3RpdmUuX0NIQVJUX1dJRFRIKSB7XG4gICAgICAgICAgICB0aXAuZGlyZWN0aW9uKCd3JylcbiAgICAgICAgICAgICAgLm9mZnNldChbMCwgLTEwXSlcbiAgICAgICAgICAgICAgLnNob3coZCwgaSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRpcC5kaXJlY3Rpb24oJ2UnKVxuICAgICAgICAgICAgICAub2Zmc2V0KFswLCAxMF0pXG4gICAgICAgICAgICAgIC5zaG93KGQsIGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRldGVybWluZVRpbWVsaW5lU2NhbGUodGltZWxpbmVFdmVudDogVGltZWxpbmVFdmVudFtdKSB7XG4gICAgICAgICAgbGV0IGFkanVzdGVkVGltZVJhbmdlOiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAgfHxcbiAgICAgICAgICAgIGQzLm1pbih0aW1lbGluZUV2ZW50LCAoZDogVGltZWxpbmVFdmVudCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZC50aW1lc3RhbXA7XG4gICAgICAgICAgICB9KSB8fCArbW9tZW50KCkuc3VidHJhY3QoMjQsICdob3VyJyk7XG5cbiAgICAgICAgICBpZiAodGltZWxpbmVFdmVudCAmJiB0aW1lbGluZUV2ZW50Lmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgICAgYWRqdXN0ZWRUaW1lUmFuZ2VbMF0gPSBzdGFydFRpbWVzdGFtcDtcbiAgICAgICAgICAgIGFkanVzdGVkVGltZVJhbmdlWzFdID0gZW5kVGltZXN0YW1wIHx8ICttb21lbnQoKTtcbiAgICAgICAgICAgIHlTY2FsZSA9IGQzLnNjYWxlLmxpbmVhcigpXG4gICAgICAgICAgICAgIC5jbGFtcCh0cnVlKVxuICAgICAgICAgICAgICAucmFuZ2VSb3VuZChbNzAsIDBdKVxuICAgICAgICAgICAgICAuZG9tYWluKFswLCAxNzVdKTtcblxuICAgICAgICAgICAgeUF4aXMgPSBkMy5zdmcuYXhpcygpXG4gICAgICAgICAgICAgIC5zY2FsZSh5U2NhbGUpXG4gICAgICAgICAgICAgIC50aWNrcygwKVxuICAgICAgICAgICAgICAudGlja1NpemUoMCwgMClcbiAgICAgICAgICAgICAgLm9yaWVudCgnbGVmdCcpO1xuXG4gICAgICAgICAgICB0aW1lU2NhbGUgPSBkMy50aW1lLnNjYWxlKClcbiAgICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAgIC5kb21haW4oYWRqdXN0ZWRUaW1lUmFuZ2UpO1xuXG4gICAgICAgICAgICB4QXhpcyA9IGQzLnN2Zy5heGlzKClcbiAgICAgICAgICAgICAgLnNjYWxlKHRpbWVTY2FsZSlcbiAgICAgICAgICAgICAgLnRpY2tTaXplKC03MCwgMClcbiAgICAgICAgICAgICAgLm9yaWVudCgndG9wJylcbiAgICAgICAgICAgICAgLnRpY2tGb3JtYXQoeEF4aXNUaW1lRm9ybWF0cygpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVUaW1lbGluZUNoYXJ0KHRpbWVsaW5lRXZlbnRzOiBUaW1lbGluZUV2ZW50W10pIHtcbiAgICAgICAgICBsZXQgeEF4aXNNaW4gPSArYXR0cnMuc3RhcnRUaW1lc3RhbXAgfHxcbiAgICAgICAgICAgIGQzLm1pbih0aW1lbGluZUV2ZW50cywgKGQ6IFRpbWVsaW5lRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICtkLnRpbWVzdGFtcDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCB4QXhpc01heCA9ICthdHRycy5lbmRUaW1lc3RhbXAgfHwgZDMubWF4KHRpbWVsaW5lRXZlbnRzLCAoZDogVGltZWxpbmVFdmVudCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICtkLnRpbWVzdGFtcDtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGxldCB0aW1lbGluZVRpbWVTY2FsZSA9IGQzLnRpbWUuc2NhbGUoKVxuICAgICAgICAgICAgLnJhbmdlKFswLCB3aWR0aF0pXG4gICAgICAgICAgICAuZG9tYWluKFt4QXhpc01pbiwgeEF4aXNNYXhdKTtcblxuICAgICAgICAgIC8vIDAtNiBpcyB0aGUgeS1heGlzIHJhbmdlLCB0aGlzIG1lYW5zIDEtNSBpcyB0aGUgdmFsaWQgcmFuZ2UgZm9yXG4gICAgICAgICAgLy8gdmFsdWVzIHRoYXQgd29uJ3QgYmUgY3V0IG9mZiBoYWxmIHdheSBiZSBlaXRoZXIgYXhpcy5cbiAgICAgICAgICBsZXQgeVNjYWxlID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgICAgLmNsYW1wKHRydWUpXG4gICAgICAgICAgICAgIC5yYW5nZShbaGVpZ2h0LCAwXSlcbiAgICAgICAgICAgICAgLmRvbWFpbihbMCwgNl0pO1xuXG4gICAgICAgICAgLy8gVGhlIGJvdHRvbSBsaW5lIG9mIHRoZSB0aW1lbGluZSBjaGFydFxuICAgICAgICAgIHN2Zy5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmF0dHIoJ3gxJywgMClcbiAgICAgICAgICAgIC5hdHRyKCd5MScsIDcwKVxuICAgICAgICAgICAgLmF0dHIoJ3gyJywgNzM1KVxuICAgICAgICAgICAgLmF0dHIoJ3kyJywgNzApXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCdoa1RpbWVsaW5lQm90dG9tTGluZScpO1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnY2lyY2xlJylcbiAgICAgICAgICAgIC5kYXRhKHRpbWVsaW5lRXZlbnRzKVxuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAoZDogVGltZWxpbmVFdmVudCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZC5zZWxlY3RlZCA/ICdoa0V2ZW50U2VsZWN0ZWQnIDogJ2hrRXZlbnQnO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdjeCcsIChkOiBUaW1lbGluZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aW1lbGluZVRpbWVTY2FsZShuZXcgRGF0ZShkLnRpbWVzdGFtcCkpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdjeScsIChkOiBUaW1lbGluZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB5U2NhbGUoZC5yb3cpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgKGQ6IFRpbWVsaW5lRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuICBkLmNvbG9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5hdHRyKCdyJywgKGQpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIDM7XG4gICAgICAgICAgICB9KSAub24oJ21vdXNlb3ZlcicsIGZ1bmN0aW9uKGQsIGkpIHtcbiAgICAgICAgICAgICAgbGV0IGNpcmNsZSA9IGQzLnNlbGVjdCh0aGlzKTtcbiAgICAgICAgICAgICAgcG9zaXRpb25UaXAoY2lyY2xlLCBkLCBpKTtcbiAgICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgICAgdGlwLmhpZGUoKTtcbiAgICAgICAgICAgIH0pLm9uKCdkYmxjbGljaycsIChkOiBUaW1lbGluZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdEb3VibGUtQ2xpY2tlZDonLCAgZCk7XG4gICAgICAgICAgICAgIGQuc2VsZWN0ZWQgPSAhZC5zZWxlY3RlZDtcbiAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEV2ZW50TmFtZXMuVElNRUxJTkVfQ0hBUlRfRE9VQkxFX0NMSUNLX0VWRU5ULnRvU3RyaW5nKCksIGQpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlWGFuZFlBeGVzKCkge1xuXG4gICAgICAgICAgc3ZnLnNlbGVjdEFsbCgnZy5heGlzJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeC1heGlzXG4gICAgICAgICAgeEF4aXNHcm91cCA9IHN2Zy5hcHBlbmQoJ2cnKVxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3ggYXhpcycpXG4gICAgICAgICAgICAuY2FsbCh4QXhpcyk7XG5cbiAgICAgICAgICAvLyBjcmVhdGUgeS1heGlzXG4gICAgICAgICAgc3ZnLmFwcGVuZCgnZycpXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAneSBheGlzJylcbiAgICAgICAgICAgIC5jYWxsKHlBeGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVhBeGlzQnJ1c2goKSB7XG5cbiAgICAgICAgICBicnVzaCA9IGQzLnN2Zy5icnVzaCgpXG4gICAgICAgICAgICAueCh0aW1lU2NhbGUpXG4gICAgICAgICAgICAub24oJ2JydXNoc3RhcnQnLCBicnVzaFN0YXJ0KVxuICAgICAgICAgICAgLm9uKCdicnVzaGVuZCcsIGJydXNoRW5kKTtcblxuICAgICAgICAgIGJydXNoR3JvdXAgPSBzdmcuYXBwZW5kKCdnJylcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdicnVzaCcpXG4gICAgICAgICAgICAuY2FsbChicnVzaCk7XG5cbiAgICAgICAgICBicnVzaEdyb3VwLnNlbGVjdEFsbCgnLnJlc2l6ZScpLmFwcGVuZCgncGF0aCcpO1xuXG4gICAgICAgICAgYnJ1c2hHcm91cC5zZWxlY3RBbGwoJ3JlY3QnKVxuICAgICAgICAgICAgLmF0dHIoJ2hlaWdodCcsIDcwKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGJydXNoU3RhcnQoKSB7XG4gICAgICAgICAgICBzdmcuY2xhc3NlZCgnc2VsZWN0aW5nJywgdHJ1ZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnVuY3Rpb24gYnJ1c2hFbmQoKSB7XG4gICAgICAgICAgICBsZXQgZXh0ZW50ID0gYnJ1c2guZXh0ZW50KCksXG4gICAgICAgICAgICAgIHN0YXJ0VGltZSA9IE1hdGgucm91bmQoZXh0ZW50WzBdLmdldFRpbWUoKSksXG4gICAgICAgICAgICAgIGVuZFRpbWUgPSBNYXRoLnJvdW5kKGV4dGVudFsxXS5nZXRUaW1lKCkpLFxuICAgICAgICAgICAgICBkcmFnU2VsZWN0aW9uRGVsdGEgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICAvL3N2Zy5jbGFzc2VkKCdzZWxlY3RpbmcnLCAhZDMuZXZlbnQudGFyZ2V0LmVtcHR5KCkpO1xuICAgICAgICAgICAgaWYgKGRyYWdTZWxlY3Rpb25EZWx0YSA+PSA2MDAwMCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoRXZlbnROYW1lcy5USU1FTElORV9DSEFSVF9USU1FUkFOR0VfQ0hBTkdFRC50b1N0cmluZygpLCBleHRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJ1c2hHcm91cC5jYWxsKGJydXNoLmNsZWFyKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oJ2V2ZW50cycsIChuZXdFdmVudHMpID0+IHtcbiAgICAgICAgICBpZiAobmV3RXZlbnRzKSB7XG4gICAgICAgICAgICB0aGlzLmV2ZW50cyA9IFRpbWVsaW5lRXZlbnQuYnVpbGRFdmVudHMoYW5ndWxhci5mcm9tSnNvbihuZXdFdmVudHMpKTtcbiAgICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLmV2ZW50cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2hHcm91cChbJ3N0YXJ0VGltZXN0YW1wJywgJ2VuZFRpbWVzdGFtcCddLCAobmV3VGltZXN0YW1wKSA9PiB7XG4gICAgICAgICAgc3RhcnRUaW1lc3RhbXAgPSArbmV3VGltZXN0YW1wWzBdIHx8IHN0YXJ0VGltZXN0YW1wO1xuICAgICAgICAgIGVuZFRpbWVzdGFtcCA9ICtuZXdUaW1lc3RhbXBbMV0gfHwgZW5kVGltZXN0YW1wO1xuICAgICAgICAgIHNjb3BlLnJlbmRlcih0aGlzLmV2ZW50cyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLnJlbmRlciA9ICh0aW1lbGluZUV2ZW50OiBUaW1lbGluZUV2ZW50W10pID0+IHtcbiAgICAgICAgICBpZiAodGltZWxpbmVFdmVudCAmJiB0aW1lbGluZUV2ZW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vL05PVEU6IGxheWVyaW5nIG9yZGVyIGlzIGltcG9ydGFudCFcbiAgICAgICAgICAgIHRpbWVsaW5lQ2hhcnRTZXR1cCgpO1xuICAgICAgICAgICAgZGV0ZXJtaW5lVGltZWxpbmVTY2FsZSh0aW1lbGluZUV2ZW50KTtcbiAgICAgICAgICAgIGNyZWF0ZVhhbmRZQXhlcygpO1xuICAgICAgICAgICAgY3JlYXRlWEF4aXNCcnVzaCgpO1xuICAgICAgICAgICAgY3JlYXRlVGltZWxpbmVDaGFydCh0aW1lbGluZUV2ZW50KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgRmFjdG9yeSgpIHtcbiAgICAgIGxldCBkaXJlY3RpdmUgPSAoJHJvb3RTY29wZTogbmcuSVJvb3RTY29wZVNlcnZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBUaW1lbGluZUNoYXJ0RGlyZWN0aXZlKCRyb290U2NvcGUpO1xuICAgICAgfTtcblxuICAgICAgZGlyZWN0aXZlWyckaW5qZWN0J10gPSBbJyRyb290U2NvcGUnXTtcblxuICAgICAgcmV0dXJuIGRpcmVjdGl2ZTtcbiAgICB9XG5cbiAgfVxuXG4gIF9tb2R1bGUuZGlyZWN0aXZlKCdoa1RpbWVsaW5lQ2hhcnQnLCBUaW1lbGluZUNoYXJ0RGlyZWN0aXZlLkZhY3RvcnkoKSk7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8vIFR5cGUgdmFsdWVzIGFuZCBJRCB0eXBlc1xuICBleHBvcnQgdHlwZSBBbGVydFRocmVzaG9sZCA9IG51bWJlcjtcbiAgZXhwb3J0IHR5cGUgVGltZUluTWlsbGlzID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBVcmxUeXBlID0gbnVtYmVyO1xuICBleHBvcnQgdHlwZSBNZXRyaWNJZCA9IHN0cmluZztcbiAgZXhwb3J0IHR5cGUgTWV0cmljVmFsdWUgPSBudW1iZXI7XG5cbiAgLyoqXG4gICAqIE1ldHJpY3MgUmVzcG9uc2UgZnJvbSBIYXdrdWxhciBNZXRyaWNzXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElNZXRyaWNzUmVzcG9uc2VEYXRhUG9pbnQge1xuICAgIHN0YXJ0OiBUaW1lSW5NaWxsaXM7XG4gICAgZW5kOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIG1pbj86IE1ldHJpY1ZhbHVlOyAvLy8gd2hlbiB1c2luZyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXNcbiAgICBtYXg/OiBNZXRyaWNWYWx1ZTsgLy8vIHdoZW4gdXNpbmcgYnVja2V0cyBvciBhZ2dyZWdhdGVzXG4gICAgbWVkaWFuPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIHBlcmNlbnRpbGU5NXRoPzogTWV0cmljVmFsdWU7IC8vLyB3aGVuIHVzaW5nIGJ1Y2tldHMgb3IgYWdncmVnYXRlc1xuICAgIGVtcHR5OiBib29sZWFuO1xuICB9XG5cbiAgLyoqXG4gICAqIFNpbXBsZXN0IE1ldHJpYyBkYXRhIHR5cGVcbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZU1ldHJpYyB7XG4gICAgdGltZXN0YW1wOiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU6IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgLyoqXG4gICAqIERhdGEgZm9yIHByZWRpY3RpdmUgJ2NvbmUnXG4gICAqL1xuICBleHBvcnQgaW50ZXJmYWNlIElQcmVkaWN0aXZlTWV0cmljIGV4dGVuZHMgSVNpbXBsZU1ldHJpYyB7XG4gICAgbWluOiBNZXRyaWNWYWx1ZTtcbiAgICBtYXg6IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgZXhwb3J0IGludGVyZmFjZSBJQmFzZUNoYXJ0RGF0YVBvaW50IHtcbiAgICB0aW1lc3RhbXA6IFRpbWVJbk1pbGxpcztcbiAgICBzdGFydD86IFRpbWVJbk1pbGxpcztcbiAgICBlbmQ/OiBUaW1lSW5NaWxsaXM7XG4gICAgdmFsdWU/OiBNZXRyaWNWYWx1ZTsgLy8vIE9ubHkgZm9yIFJhdyBkYXRhIChubyBidWNrZXRzIG9yIGFnZ3JlZ2F0ZXMpXG4gICAgYXZnOiBNZXRyaWNWYWx1ZTsgLy8vIG1vc3Qgb2YgdGhlIHRpbWUgdGhpcyBpcyB0aGUgdXNlZnVsIHZhbHVlIGZvciBhZ2dyZWdhdGVzXG4gICAgZW1wdHk6IGJvb2xlYW47IC8vLyB3aWxsIHNob3cgdXAgaW4gdGhlIGNoYXJ0IGFzIGJsYW5rIC0gc2V0IHRoaXMgd2hlbiB5b3UgaGF2ZSBOYU5cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXByZXNlbnRhdGlvbiBvZiBkYXRhIHJlYWR5IHRvIGJlIGNvbnN1bWVkIGJ5IGNoYXJ0cy5cbiAgICovXG4gIGV4cG9ydCBpbnRlcmZhY2UgSUNoYXJ0RGF0YVBvaW50IGV4dGVuZHMgSUJhc2VDaGFydERhdGFQb2ludCB7XG4gICAgZGF0ZT86IERhdGU7XG4gICAgbWluOiBNZXRyaWNWYWx1ZTtcbiAgICBtYXg6IE1ldHJpY1ZhbHVlO1xuICAgIHBlcmNlbnRpbGU5NXRoOiBNZXRyaWNWYWx1ZTtcbiAgICBtZWRpYW46IE1ldHJpY1ZhbHVlO1xuICB9XG5cbiAgLyoqXG4gICAqIERhdGEgc3RydWN0dXJlIGZvciBhIE11bHRpLU1ldHJpYyBjaGFydC4gQ29tcG9zZWQgb2YgSUNoYXJ0RGF0YURhdGFQb2ludFtdLlxuICAgKi9cbiAgZXhwb3J0IGludGVyZmFjZSBJTXVsdGlEYXRhUG9pbnQge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGtleUhhc2g/OiBzdHJpbmc7IC8vIGZvciB1c2luZyBhcyB2YWxpZCBodG1sIGlkXG4gICAgY29sb3I/OiBzdHJpbmc7IC8vLyAjZmZmZWVlXG4gICAgdmFsdWVzOiBJQ2hhcnREYXRhUG9pbnRbXTtcbiAgfVxuXG4gIC8qKlxuICAgKlxuICAgKi9cbiAgZXhwb3J0IGNsYXNzIENoYXJ0T3B0aW9ucyB7XG4gICAgY29uc3RydWN0b3IocHVibGljIHN2ZzogYW55LFxuICAgICAgcHVibGljIHRpbWVTY2FsZTogYW55LFxuICAgICAgcHVibGljIHlTY2FsZTogYW55LFxuICAgICAgcHVibGljIGNoYXJ0RGF0YTogSUNoYXJ0RGF0YVBvaW50W10sXG4gICAgICBwdWJsaWMgbXVsdGlDaGFydERhdGE6IElNdWx0aURhdGFQb2ludFtdLFxuICAgICAgcHVibGljIG1vZGlmaWVkSW5uZXJDaGFydEhlaWdodDogbnVtYmVyLFxuICAgICAgcHVibGljIGhlaWdodDogbnVtYmVyLFxuICAgICAgcHVibGljIHRpcD86IGFueSxcbiAgICAgIHB1YmxpYyB2aXN1YWxseUFkanVzdGVkTWF4PzogbnVtYmVyLFxuICAgICAgcHVibGljIGhpZGVIaWdoTG93VmFsdWVzPzogYm9vbGVhbixcbiAgICAgIHB1YmxpYyBpbnRlcnBvbGF0aW9uPzogc3RyaW5nKSB7XG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgLyogdHNsaW50OmRpc2FibGU6bm8tYml0d2lzZSAqL1xuXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyV2lkdGgod2lkdGg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIGJhck9mZnNldCA9IEJBUl9PRkZTRVQpIHtcbiAgICByZXR1cm4gKHdpZHRoIC8gbGVuZ3RoIC0gYmFyT2Zmc2V0KTtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZXMgdGhlIGJhciB3aWR0aCBhZGp1c3RlZCBzbyB0aGF0IHRoZSBmaXJzdCBhbmQgbGFzdCBhcmUgaGFsZi13aWR0aCBvZiB0aGUgb3RoZXJzXG4gIC8vIHNlZSBodHRwczovL2lzc3Vlcy5qYm9zcy5vcmcvYnJvd3NlL0hBV0tVTEFSLTgwOSBmb3IgaW5mbyBvbiB3aHkgdGhpcyBpcyBuZWVkZWRcbiAgZXhwb3J0IGZ1bmN0aW9uIGNhbGNCYXJXaWR0aEFkanVzdGVkKGksIGxlbmd0aDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIChpID09PSAwIHx8IGkgPT09IGxlbmd0aCAtIDEpID8gY2FsY0JhcldpZHRoKHdpZHRoLCBsZW5ndGgsIEJBUl9PRkZTRVQpIC8gMiA6XG4gICAgICBjYWxjQmFyV2lkdGgod2lkdGgsIGxlbmd0aCwgQkFSX09GRlNFVCk7XG4gIH1cblxuICAvLyBDYWxjdWxhdGVzIHRoZSBiYXIgWCBwb3NpdGlvbi4gV2hlbiB1c2luZyBjYWxjQmFyV2lkdGhBZGp1c3RlZCwgaXQgaXMgcmVxdWlyZWQgdG8gcHVzaCBiYXJzXG4gIC8vIG90aGVyIHRoYW4gdGhlIGZpcnN0IGhhbGYgYmFyIHRvIHRoZSBsZWZ0LCB0byBtYWtlIHVwIGZvciB0aGUgZmlyc3QgYmVpbmcganVzdCBoYWxmIHdpZHRoXG4gIGV4cG9ydCBmdW5jdGlvbiBjYWxjQmFyWFBvcyhkLCBpLCB0aW1lU2NhbGU6IGFueSwgbGVuZ3RoOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKSAtIChpID09PSAwID8gMCA6IGNhbGNCYXJXaWR0aCh3aWR0aCwgbGVuZ3RoLCBCQVJfT0ZGU0VUKSAvIDIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFuIGVtcHR5IGRhdGFwb2ludCBoYXMgJ2VtcHR5JyBhdHRyaWJ1dGUgc2V0IHRvIHRydWUuIFVzZWQgdG8gZGlzdGluZ3Vpc2ggZnJvbSByZWFsIDAgdmFsdWVzLlxuICAgKiBAcGFyYW0gZFxuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5RGF0YVBvaW50KGQ6IElDaGFydERhdGFQb2ludCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBkLmVtcHR5O1xuICB9XG5cbiAgLyoqXG4gICAqIFJhdyBtZXRyaWNzIGhhdmUgYSAndmFsdWUnIHNldCBpbnN0ZWFkIG9mIGF2Zy9taW4vbWF4IG9mIGFnZ3JlZ2F0ZXNcbiAgICogQHBhcmFtIGRcbiAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAqL1xuICBleHBvcnQgZnVuY3Rpb24gaXNSYXdNZXRyaWMoZDogSUNoYXJ0RGF0YVBvaW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHR5cGVvZiBkLmF2ZyA9PT0gJ3VuZGVmaW5lZCc7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24geEF4aXNUaW1lRm9ybWF0cygpIHtcbiAgICByZXR1cm4gZDMudGltZS5mb3JtYXQubXVsdGkoW1xuICAgICAgWycuJUwnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaWxsaXNlY29uZHMoKTtcbiAgICAgIH1dLFxuICAgICAgWyc6JVMnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRTZWNvbmRzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJUg6JU0nLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNaW51dGVzKCk7XG4gICAgICB9XSxcbiAgICAgIFsnJUg6JU0nLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRIb3VycygpO1xuICAgICAgfV0sXG4gICAgICBbJyVhICVkJywgKGQpID0+IHtcbiAgICAgICAgcmV0dXJuIGQuZ2V0RGF5KCkgJiYgZC5nZXREYXRlKCkgIT09IDE7XG4gICAgICB9XSxcbiAgICAgIFsnJWIgJWQnLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXREYXRlKCkgIT09IDE7XG4gICAgICB9XSxcbiAgICAgIFsnJUInLCAoZCkgPT4ge1xuICAgICAgICByZXR1cm4gZC5nZXRNb250aCgpO1xuICAgICAgfV0sXG4gICAgICBbJyVZJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1dXG4gICAgXSk7XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlU3ZnRGVmcyhjaGFydCkge1xuXG4gICAgbGV0IGRlZnMgPSBjaGFydC5hcHBlbmQoJ2RlZnMnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICdub0RhdGFTdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAgIC5hdHRyKCdkJywgJ00gMCAwIDYgMCcpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiNDQ0NDQ0M7IGZpbGw6bm9uZTsnKTtcblxuICAgIGRlZnMuYXBwZW5kKCdwYXR0ZXJuJylcbiAgICAgIC5hdHRyKCdpZCcsICd1bmtub3duU3RyaXBlcycpXG4gICAgICAuYXR0cigncGF0dGVyblVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJylcbiAgICAgIC5hdHRyKCd4JywgJzAnKVxuICAgICAgLmF0dHIoJ3knLCAnMCcpXG4gICAgICAuYXR0cignd2lkdGgnLCAnNicpXG4gICAgICAuYXR0cignaGVpZ2h0JywgJzMnKVxuICAgICAgLmF0dHIoJ3N0eWxlJywgJ3N0cm9rZTojMkU5RUMyOyBmaWxsOm5vbmU7JylcbiAgICAgIC5hcHBlbmQoJ3BhdGgnKS5hdHRyKCdkJywgJ00gMCAwIDYgMCcpO1xuXG4gICAgZGVmcy5hcHBlbmQoJ3BhdHRlcm4nKVxuICAgICAgLmF0dHIoJ2lkJywgJ2Rvd25TdHJpcGVzJylcbiAgICAgIC5hdHRyKCdwYXR0ZXJuVW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKVxuICAgICAgLmF0dHIoJ3gnLCAnMCcpXG4gICAgICAuYXR0cigneScsICcwJylcbiAgICAgIC5hdHRyKCd3aWR0aCcsICc2JylcbiAgICAgIC5hdHRyKCdoZWlnaHQnLCAnMycpXG4gICAgICAuYXR0cignc3R5bGUnLCAnc3Ryb2tlOiNmZjhhOWE7IGZpbGw6bm9uZTsnKVxuICAgICAgLmFwcGVuZCgncGF0aCcpLmF0dHIoJ2QnLCAnTSAwIDAgNiAwJyk7XG5cbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIHRpbWVTY2FsZTogYW55KSB7XG4gICAgcmV0dXJuIHRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gIH1cblxuICAvLyBhZGFwdGVkIGZyb20gaHR0cDovL3dlcnhsdGQuY29tL3dwLzIwMTAvMDUvMTMvamF2YXNjcmlwdC1pbXBsZW1lbnRhdGlvbi1vZi1qYXZhcy1zdHJpbmctaGFzaGNvZGUtbWV0aG9kL1xuICBleHBvcnQgZnVuY3Rpb24gaGFzaFN0cmluZyhzdHI6IHN0cmluZyk6IG51bWJlciB7XG4gICAgbGV0IGhhc2ggPSAwLCBpLCBjaHIsIGxlbjtcbiAgICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGhhc2g7XG4gICAgfVxuICAgIGZvciAoaSA9IDAsIGxlbiA9IHN0ci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgY2hyID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICBoYXNoID0gKChoYXNoIDw8IDUpIC0gaGFzaCkgKyBjaHI7XG4gICAgICBoYXNoIHw9IDA7IC8vIENvbnZlcnQgdG8gMzJiaXQgaW50ZWdlclxuICAgIH1cbiAgICByZXR1cm4gaGFzaDtcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBkZXRlcm1pbmVYQXhpc1RpY2tzRnJvbVNjcmVlbldpZHRoKHdpZHRoSW5QaXhlbHM6IG51bWJlcik6IG51bWJlciB7XG4gICAgbGV0IHhUaWNrcztcbiAgICBpZiAod2lkdGhJblBpeGVscyA8PSAyMDApIHtcbiAgICAgIHhUaWNrcyA9IDI7XG4gICAgfSBlbHNlIGlmICh3aWR0aEluUGl4ZWxzIDw9IDM1MCAmJiB3aWR0aEluUGl4ZWxzID4gMjAwKSB7XG4gICAgICB4VGlja3MgPSA0O1xuICAgIH0gZWxzZSB7XG4gICAgICB4VGlja3MgPSA5O1xuICAgIH1cbiAgICByZXR1cm4geFRpY2tzO1xuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIGRldGVybWluZVlBeGlzVGlja3NGcm9tU2NyZWVuSGVpZ2h0KGhlaWdodEluUGl4ZWxzOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGxldCB5VGlja3M7XG4gICAgaWYgKGhlaWdodEluUGl4ZWxzIDw9IDEyMCkge1xuICAgICAgeVRpY2tzID0gMztcbiAgICB9IGVsc2Uge1xuICAgICAgeVRpY2tzID0gOTtcbiAgICB9XG4gICAgcmV0dXJuIHlUaWNrcztcbiAgfVxuXG4gIGV4cG9ydCBmdW5jdGlvbiBkZXRlcm1pbmVZQXhpc0dyaWRMaW5lVGlja3NGcm9tU2NyZWVuSGVpZ2h0KGhlaWdodEluUGl4ZWxzOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGxldCB5VGlja3M7XG4gICAgaWYgKGhlaWdodEluUGl4ZWxzIDw9IDYwKSB7XG4gICAgICB5VGlja3MgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICB5VGlja3MgPSAxMDtcbiAgICB9XG4gICAgcmV0dXJuIHlUaWNrcztcbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgY29uc3QgQkFSX09GRlNFVCA9IDI7XG5cbiAgZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0SGlzdG9ncmFtQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ2hpc3RvZ3JhbSc7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucywgc3RhY2tlZCA9IGZhbHNlKSB7XG5cbiAgICAgIGNvbnN0IGJhckNsYXNzID0gc3RhY2tlZCA/ICdsZWFkZXJCYXInIDogJ2hpc3RvZ3JhbSc7XG5cbiAgICAgIGNvbnN0IHJlY3RIaXN0b2dyYW0gPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncmVjdC4nICsgYmFyQ2xhc3MpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkQmFycyhzZWxlY3Rpb246IGQzLlNlbGVjdGlvbjxhbnk+KSB7XG4gICAgICAgIHNlbGVjdGlvblxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsIGJhckNsYXNzKVxuICAgICAgICAgIC5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIGNoYXJ0T3B0aW9ucy50aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLmhpZGUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAuYXR0cigneCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2FsY0JhclhQb3MoZCwgaSwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLmNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNFbXB0eURhdGFQb2ludChkKSA/IDAgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy5tb2RpZmllZElubmVyQ2hhcnRIZWlnaHQgLSBjaGFydE9wdGlvbnMueVNjYWxlKGlzRW1wdHlEYXRhUG9pbnQoZCkgP1xuICAgICAgICAgICAgICBjaGFydE9wdGlvbnMueVNjYWxlKGNoYXJ0T3B0aW9ucy52aXN1YWxseUFkanVzdGVkTWF4KSA6IGQuYXZnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdvcGFjaXR5Jywgc3RhY2tlZCA/ICcuNicgOiAnMScpXG4gICAgICAgICAgLmF0dHIoJ2ZpbGwnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAndXJsKCNub0RhdGFTdHJpcGVzKScgOiAoc3RhY2tlZCA/ICcjRDNEM0Q2JyA6ICcjQzBDMEMwJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnIzc3Nyc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnMCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignZGF0YS1oYXdrdWxhci12YWx1ZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZC5hdmc7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRIaWdoQmFyKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkLm1pbiA9PT0gZC5tYXggPyAnc2luZ2xlVmFsdWUnIDogJ2hpZ2gnO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gnLCBmdW5jdGlvbihkLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsY0JhclhQb3MoZCwgaSwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLmNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3knLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzTmFOKGQubWF4KSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoY2hhcnRPcHRpb25zLnZpc3VhbGx5QWRqdXN0ZWRNYXgpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignaGVpZ2h0JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc0VtcHR5RGF0YVBvaW50KGQpID8gMCA6IChjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKSAtIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpIHx8IDIpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuOSlcbiAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgY2hhcnRPcHRpb25zLnRpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkTG93ZXJCYXIoc2VsZWN0aW9uOiBkMy5TZWxlY3Rpb248YW55Pikge1xuICAgICAgICBzZWxlY3Rpb25cbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93JylcbiAgICAgICAgICAuYXR0cigneCcsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2FsY0JhclhQb3MoZCwgaSwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSwgY2hhcnRPcHRpb25zLmNoYXJ0RGF0YS5sZW5ndGgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3knLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzTmFOKGQuYXZnKSA/IGNoYXJ0T3B0aW9ucy5oZWlnaHQgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdoZWlnaHQnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzRW1wdHlEYXRhUG9pbnQoZCkgPyAwIDogKGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pIC0gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2ZykpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3dpZHRoJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjYWxjQmFyV2lkdGhBZGp1c3RlZChpLCBjaGFydE9wdGlvbnMuY2hhcnREYXRhLmxlbmd0aCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignb3BhY2l0eScsIDAuOSlcbiAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICBjaGFydE9wdGlvbnMudGlwLnNob3coZCwgaSk7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgY2hhcnRPcHRpb25zLnRpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRUb3BTdGVtKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbVRvcFN0ZW0nKVxuICAgICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRMb3dTdGVtKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbUJvdHRvbVN0ZW0nKVxuICAgICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgfSkuYXR0cignc3Ryb2tlLW9wYWNpdHknLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIDAuNjtcbiAgICAgICAgICB9KTtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZFRvcENyb3NzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbVRvcENyb3NzJylcbiAgICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZEJvdHRvbUNyb3NzKHNlbGVjdGlvbjogZDMuU2VsZWN0aW9uPGFueT4pIHtcbiAgICAgICAgc2VsZWN0aW9uXG4gICAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2hpc3RvZ3JhbUJvdHRvbUNyb3NzJylcbiAgICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdzdHJva2Utb3BhY2l0eScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gMC42O1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGVIaXN0b2dyYW1IaWdoTG93VmFsdWVzKHN2ZzogYW55LCBjaGFydERhdGE6IElDaGFydERhdGFQb2ludFtdLCBzdGFja2VkPzogYm9vbGVhbikge1xuICAgICAgICBpZiAoc3RhY2tlZCkge1xuICAgICAgICAgIC8vIHVwcGVyIHBvcnRpb24gcmVwcmVzZW50aW5nIGF2ZyB0byBoaWdoXG4gICAgICAgICAgY29uc3QgcmVjdEhpZ2ggPSBzdmcuc2VsZWN0QWxsKCdyZWN0LmhpZ2gsIHJlY3Quc2luZ2xlVmFsdWUnKS5kYXRhKGNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICByZWN0SGlnaC5jYWxsKGJ1aWxkSGlnaEJhcik7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICByZWN0SGlnaFxuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRIaWdoQmFyKTtcblxuICAgICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICAgIHJlY3RIaWdoLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgICAgIC8vIGxvd2VyIHBvcnRpb24gcmVwcmVzZW50aW5nIGF2ZyB0byBsb3dcbiAgICAgICAgICBjb25zdCByZWN0TG93ID0gc3ZnLnNlbGVjdEFsbCgncmVjdC5sb3cnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgcmVjdExvdy5jYWxsKGJ1aWxkTG93ZXJCYXIpO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgcmVjdExvd1xuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ3JlY3QnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRMb3dlckJhcik7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICByZWN0TG93LmV4aXQoKS5yZW1vdmUoKTtcbiAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgIGNvbnN0IGxpbmVIaXN0b0hpZ2hTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbVRvcFN0ZW0nKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgbGluZUhpc3RvSGlnaFN0ZW0uY2FsbChidWlsZFRvcFN0ZW0pO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgbGluZUhpc3RvSGlnaFN0ZW1cbiAgICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wU3RlbSk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9IaWdoU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgICBjb25zdCBsaW5lSGlzdG9Mb3dTdGVtID0gc3ZnLnNlbGVjdEFsbCgnLmhpc3RvZ3JhbUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuXG4gICAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgICAgbGluZUhpc3RvTG93U3RlbS5jYWxsKGJ1aWxkTG93U3RlbSk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Mb3dTdGVtXG4gICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgLmFwcGVuZCgnbGluZScpXG4gICAgICAgICAgICAuY2FsbChidWlsZExvd1N0ZW0pO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgbGluZUhpc3RvTG93U3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgICAgICBjb25zdCBsaW5lSGlzdG9Ub3BDcm9zcyA9IHN2Zy5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Ub3BDcm9zcycpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG5cbiAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICBsaW5lSGlzdG9Ub3BDcm9zcy5jYWxsKGJ1aWxkVG9wQ3Jvc3MpO1xuXG4gICAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3NcbiAgICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgICAuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgICAgIC5jYWxsKGJ1aWxkVG9wQ3Jvc3MpO1xuXG4gICAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgICAgbGluZUhpc3RvVG9wQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgY29uc3QgbGluZUhpc3RvQm90dG9tQ3Jvc3MgPSBzdmcuc2VsZWN0QWxsKCcuaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICAgIGxpbmVIaXN0b0JvdHRvbUNyb3NzLmNhbGwoYnVpbGRCb3R0b21Dcm9zcyk7XG5cbiAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zc1xuICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgIC5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAgICAgLmNhbGwoYnVpbGRCb3R0b21Dcm9zcyk7XG5cbiAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICBsaW5lSGlzdG9Cb3R0b21Dcm9zcy5leGl0KCkucmVtb3ZlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICByZWN0SGlzdG9ncmFtLmNhbGwoYnVpbGRCYXJzKTtcblxuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICByZWN0SGlzdG9ncmFtLmVudGVyKClcbiAgICAgICAgLmFwcGVuZCgncmVjdCcpXG4gICAgICAgIC5jYWxsKGJ1aWxkQmFycyk7XG5cbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgcmVjdEhpc3RvZ3JhbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIGlmICghY2hhcnRPcHRpb25zLmhpZGVIaWdoTG93VmFsdWVzKSB7XG4gICAgICAgIGNyZWF0ZUhpc3RvZ3JhbUhpZ2hMb3dWYWx1ZXMoY2hhcnRPcHRpb25zLnN2ZywgY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSwgc3RhY2tlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyB3ZSBzaG91bGQgaGlkZSBoaWdoLWxvdyB2YWx1ZXMuLiBvciByZW1vdmUgaWYgZXhpc3RpbmdcbiAgICAgICAgY2hhcnRPcHRpb25zLnN2Z1xuICAgICAgICAgIC5zZWxlY3RBbGwoJy5oaXN0b2dyYW1Ub3BTdGVtLCAuaGlzdG9ncmFtQm90dG9tU3RlbSwgLmhpc3RvZ3JhbVRvcENyb3NzLCAuaGlzdG9ncmFtQm90dG9tQ3Jvc3MnKS5yZW1vdmUoKTtcbiAgICAgIH1cblxuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBjbGFzcyBBcmVhQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ2FyZWEnO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpOiB2b2lkIHtcblxuICAgICAgbGV0XG4gICAgICAgIGhpZ2hBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICAgIH0pXG4gICAgICAgICxcblxuICAgICAgICBhdmdBcmVhID0gZDMuc3ZnLmFyZWEoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnRpbWVTY2FsZShkLnRpbWVzdGFtcCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueSgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSkueTAoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy5oaWRlSGlnaExvd1ZhbHVlcyA/IGNoYXJ0T3B0aW9ucy5oZWlnaHQgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KVxuICAgICAgICAsXG5cbiAgICAgICAgbG93QXJlYSA9IGQzLnN2Zy5hcmVhKClcbiAgICAgICAgICAuaW50ZXJwb2xhdGUoY2hhcnRPcHRpb25zLmludGVycG9sYXRpb24pXG4gICAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUoZC50aW1lc3RhbXApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGlzUmF3TWV0cmljKGQpID8gY2hhcnRPcHRpb25zLnlTY2FsZShkLnZhbHVlKSA6IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnkwKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMubW9kaWZpZWRJbm5lckNoYXJ0SGVpZ2h0O1xuICAgICAgICAgIH0pO1xuXG4gICAgICBpZiAoIWNoYXJ0T3B0aW9ucy5oaWRlSGlnaExvd1ZhbHVlcykge1xuICAgICAgICBsZXRcbiAgICAgICAgICBoaWdoQXJlYVBhdGggPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aC5oaWdoQXJlYScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGhpZ2hBcmVhUGF0aFxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdoaWdoQXJlYScpXG4gICAgICAgICAgLmF0dHIoJ2QnLCBoaWdoQXJlYSk7XG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBoaWdoQXJlYVBhdGhcbiAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgIC5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdoaWdoQXJlYScpXG4gICAgICAgICAgLmF0dHIoJ2QnLCBoaWdoQXJlYSk7XG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBoaWdoQXJlYVBhdGhcbiAgICAgICAgICAuZXhpdCgpXG4gICAgICAgICAgLnJlbW92ZSgpO1xuXG4gICAgICAgIGxldFxuICAgICAgICAgIGxvd0FyZWFQYXRoID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGgubG93QXJlYScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICAgIGxvd0FyZWFQYXRoXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xvd0FyZWEnKVxuICAgICAgICAgIC5hdHRyKCdkJywgbG93QXJlYSk7XG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBsb3dBcmVhUGF0aFxuICAgICAgICAgIC5lbnRlcigpXG4gICAgICAgICAgLmFwcGVuZCgncGF0aCcpXG4gICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xvd0FyZWEnKVxuICAgICAgICAgIC5hdHRyKCdkJywgbG93QXJlYSk7XG4gICAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgICBsb3dBcmVhUGF0aFxuICAgICAgICAgIC5leGl0KClcbiAgICAgICAgICAucmVtb3ZlKCk7XG4gICAgICB9XG5cbiAgICAgIGxldFxuICAgICAgICBhdmdBcmVhUGF0aCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCdwYXRoLmF2Z0FyZWEnKS5kYXRhKFtjaGFydE9wdGlvbnMuY2hhcnREYXRhXSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGF2Z0FyZWFQYXRoLmF0dHIoJ2NsYXNzJywgJ2F2Z0FyZWEnKVxuICAgICAgICAuYXR0cignZCcsIGF2Z0FyZWEpO1xuICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICBhdmdBcmVhUGF0aC5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdhdmdBcmVhJylcbiAgICAgICAgLmF0dHIoJ2QnLCBhdmdBcmVhKTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgYXZnQXJlYVBhdGguZXhpdCgpLnJlbW92ZSgpO1xuICAgIH1cblxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbmltcG9ydCBDaGFydE9wdGlvbnMgPSBDaGFydHMuQ2hhcnRPcHRpb25zO1xuaW50ZXJmYWNlIElDaGFydFR5cGUge1xuICBuYW1lOiBzdHJpbmc7XG4gIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0T3B0aW9ucywgb3B0aW9uYWxCb29sZWFuPzogYm9vbGVhbik6IHZvaWQ7XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgY2xhc3MgSGlzdG9ncmFtQ2hhcnQgZXh0ZW5kcyBBYnN0cmFjdEhpc3RvZ3JhbUNoYXJ0IHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ2hpc3RvZ3JhbSc7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucywgc3RhY2tlZCA9IGZhbHNlKSB7XG4gICAgICBzdXBlci5kcmF3Q2hhcnQoY2hhcnRPcHRpb25zLCBzdGFja2VkKTtcbiAgICB9XG4gIH1cblxufVxuIiwiLy8vIDxyZWZlcmVuY2UgcGF0aD0nLi4vLi4vLi4vdHlwaW5ncy90c2QuZC50cycgLz5cblxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpbXBvcnQgSUNoYXJ0RGF0YVBvaW50ID0gQ2hhcnRzLklDaGFydERhdGFQb2ludDtcblxuICBleHBvcnQgY2xhc3MgTGluZUNoYXJ0IGltcGxlbWVudHMgSUNoYXJ0VHlwZSB7XG5cbiAgICBwdWJsaWMgbmFtZSA9ICdsaW5lJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zKSB7XG5cbiAgICAgIGxldCBtZXRyaWNDaGFydExpbmUgPSBkMy5zdmcubGluZSgpXG4gICAgICAgIC5pbnRlcnBvbGF0ZShjaGFydE9wdGlvbnMuaW50ZXJwb2xhdGlvbilcbiAgICAgICAgLmRlZmluZWQoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLngoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMudGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnkoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGxldCBwYXRoTWV0cmljID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGgubWV0cmljTGluZScpLmRhdGEoW2NoYXJ0T3B0aW9ucy5jaGFydERhdGFdKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgcGF0aE1ldHJpYy5hdHRyKCdjbGFzcycsICdtZXRyaWNMaW5lJylcbiAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAuYXR0cignZCcsIG1ldHJpY0NoYXJ0TGluZSk7XG5cbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgcGF0aE1ldHJpYy5lbnRlcigpLmFwcGVuZCgncGF0aCcpXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdtZXRyaWNMaW5lJylcbiAgICAgICAgLnRyYW5zaXRpb24oKVxuICAgICAgICAuYXR0cignZCcsIG1ldHJpY0NoYXJ0TGluZSk7XG5cbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgcGF0aE1ldHJpYy5leGl0KCkucmVtb3ZlKCk7XG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGNsYXNzIE11bHRpTGluZUNoYXJ0IGltcGxlbWVudHMgSUNoYXJ0VHlwZSB7XG5cbiAgICBwdWJsaWMgbmFtZSA9ICdtdWx0aWxpbmUnO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpIHtcblxuICAgICAgbGV0IGNvbG9yU2NhbGUgPSA8YW55PmQzLnNjYWxlLmNhdGVnb3J5MTAoKSxcbiAgICAgICAgZyA9IDA7XG5cbiAgICAgIGlmIChjaGFydE9wdGlvbnMubXVsdGlDaGFydERhdGEpIHtcbiAgICAgICAgLy8gYmVmb3JlIHVwZGF0aW5nLCBsZXQncyByZW1vdmUgdGhvc2UgbWlzc2luZyBmcm9tIGRhdGFwb2ludHMgKGlmIGFueSlcbiAgICAgICAgY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJ3BhdGhbaWRePVxcJ211bHRpTGluZVxcJ10nKVswXS5mb3JFYWNoKChleGlzdGluZ1BhdGg6IGFueSkgPT4ge1xuICAgICAgICAgIGxldCBzdGlsbEV4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgIGNoYXJ0T3B0aW9ucy5tdWx0aUNoYXJ0RGF0YS5mb3JFYWNoKChzaW5nbGVDaGFydERhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2ggPSBzaW5nbGVDaGFydERhdGEua2V5SGFzaFxuICAgICAgICAgICAgICB8fCAoJ211bHRpTGluZScgKyBoYXNoU3RyaW5nKHNpbmdsZUNoYXJ0RGF0YS5rZXkpKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZ1BhdGguZ2V0QXR0cmlidXRlKCdpZCcpID09PSBzaW5nbGVDaGFydERhdGEua2V5SGFzaCkge1xuICAgICAgICAgICAgICBzdGlsbEV4aXN0cyA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgaWYgKCFzdGlsbEV4aXN0cykge1xuICAgICAgICAgICAgZXhpc3RpbmdQYXRoLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY2hhcnRPcHRpb25zLm11bHRpQ2hhcnREYXRhLmZvckVhY2goKHNpbmdsZUNoYXJ0RGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKHNpbmdsZUNoYXJ0RGF0YSAmJiBzaW5nbGVDaGFydERhdGEudmFsdWVzKSB7XG4gICAgICAgICAgICBzaW5nbGVDaGFydERhdGEua2V5SGFzaCA9IHNpbmdsZUNoYXJ0RGF0YS5rZXlIYXNoXG4gICAgICAgICAgICAgIHx8ICgnbXVsdGlMaW5lJyArIGhhc2hTdHJpbmcoc2luZ2xlQ2hhcnREYXRhLmtleSkpO1xuICAgICAgICAgICAgbGV0IHBhdGhNdWx0aUxpbmUgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgncGF0aCMnICsgc2luZ2xlQ2hhcnREYXRhLmtleUhhc2gpXG4gICAgICAgICAgICAgIC5kYXRhKFtzaW5nbGVDaGFydERhdGEudmFsdWVzXSk7XG4gICAgICAgICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuYXR0cignaWQnLCBzaW5nbGVDaGFydERhdGEua2V5SGFzaClcbiAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ211bHRpTGluZScpXG4gICAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgJ25vbmUnKVxuICAgICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBzaW5nbGVDaGFydERhdGEuY29sb3IgfHwgY29sb3JTY2FsZShnKyspO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgIC5hdHRyKCdkJywgdGhpcy5jcmVhdGVMaW5lKCdsaW5lYXInLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlKSk7XG4gICAgICAgICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuZW50ZXIoKS5hcHBlbmQoJ3BhdGgnKVxuICAgICAgICAgICAgICAuYXR0cignaWQnLCBzaW5nbGVDaGFydERhdGEua2V5SGFzaClcbiAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ211bHRpTGluZScpXG4gICAgICAgICAgICAgIC5hdHRyKCdmaWxsJywgJ25vbmUnKVxuICAgICAgICAgICAgICAuYXR0cignc3Ryb2tlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChzaW5nbGVDaGFydERhdGEuY29sb3IpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBzaW5nbGVDaGFydERhdGEuY29sb3I7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBjb2xvclNjYWxlKGcrKyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgIC5hdHRyKCdkJywgdGhpcy5jcmVhdGVMaW5lKCdsaW5lYXInLCBjaGFydE9wdGlvbnMudGltZVNjYWxlLCBjaGFydE9wdGlvbnMueVNjYWxlKSk7XG4gICAgICAgICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgICAgICAgIHBhdGhNdWx0aUxpbmUuZXhpdCgpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oJ05vIG11bHRpLWRhdGEgc2V0IGZvciBtdWx0aWxpbmUgY2hhcnQnKTtcbiAgICAgIH1cblxuICAgIH1cblxuICAgIHByaXZhdGUgY3JlYXRlTGluZShuZXdJbnRlcnBvbGF0aW9uLCB0aW1lU2NhbGUsIHlTY2FsZSkge1xuICAgICAgbGV0IGludGVycG9sYXRlID0gbmV3SW50ZXJwb2xhdGlvbiB8fCAnbW9ub3RvbmUnLFxuICAgICAgICBsaW5lID0gZDMuc3ZnLmxpbmUoKVxuICAgICAgICAgIC5pbnRlcnBvbGF0ZShpbnRlcnBvbGF0ZSlcbiAgICAgICAgICAuZGVmaW5lZCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAueCgoZDogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdGltZVNjYWxlKGQudGltZXN0YW1wKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC55KChkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IHlTY2FsZShkLnZhbHVlKSA6IHlTY2FsZShkLmF2Zyk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBsaW5lO1xuICAgIH1cblxuICB9XG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxubmFtZXNwYWNlIENoYXJ0cyB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBleHBvcnQgY2xhc3MgUmhxQmFyQ2hhcnQgZXh0ZW5kcyBBYnN0cmFjdEhpc3RvZ3JhbUNoYXJ0IHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ3JocWJhcic7XG5cbiAgICBwdWJsaWMgZHJhd0NoYXJ0KGNoYXJ0T3B0aW9uczogQ2hhcnRzLkNoYXJ0T3B0aW9ucywgc3RhY2tlZCA9IHRydWUpIHtcbiAgICAgIHN1cGVyLmRyYXdDaGFydChjaGFydE9wdGlvbnMsIHN0YWNrZWQpO1xuICAgIH1cbiAgfVxuXG59XG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPScuLi8uLi8uLi90eXBpbmdzL3RzZC5kLnRzJyAvPlxuXG5uYW1lc3BhY2UgQ2hhcnRzIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGltcG9ydCBJQ2hhcnREYXRhUG9pbnQgPSBDaGFydHMuSUNoYXJ0RGF0YVBvaW50O1xuXG4gIGV4cG9ydCBjbGFzcyBTY2F0dGVyQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ3NjYXR0ZXInO1xuXG4gICAgcHVibGljIGRyYXdDaGFydChjaGFydE9wdGlvbnM6IENoYXJ0cy5DaGFydE9wdGlvbnMpIHtcblxuICAgICAgaWYgKCFjaGFydE9wdGlvbnMuaGlkZUhpZ2hMb3dWYWx1ZXMpIHtcblxuICAgICAgICBsZXQgaGlnaERvdENpcmNsZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuaGlnaERvdCcpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBoaWdoRG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2hpZ2hEb3QnKVxuICAgICAgICAgIC5maWx0ZXIoKGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAgIC5hdHRyKCdjeCcsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdjeScsIChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc3R5bGUoJ2ZpbGwnLCAoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJyNmZjFhMTMnO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgICBoaWdoRG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdoaWdoRG90JylcbiAgICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnI2ZmMWExMyc7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGhpZ2hEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICAgIGxldCBsb3dEb3RDaXJjbGUgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLmxvd0RvdCcpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgICBsb3dEb3RDaXJjbGUuYXR0cignY2xhc3MnLCAnbG93RG90JylcbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gYWRkIG5ldyBvbmVzXG4gICAgICAgIGxvd0RvdENpcmNsZS5lbnRlcigpLmFwcGVuZCgnY2lyY2xlJylcbiAgICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbG93RG90JylcbiAgICAgICAgICAuYXR0cigncicsIDMpXG4gICAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICAgIGxvd0RvdENpcmNsZS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHdlIHNob3VsZCBoaWRlIGhpZ2gtbG93IHZhbHVlcy4uIG9yIHJlbW92ZSBpZiBleGlzdGluZ1xuICAgICAgICBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLmhpZ2hEb3QsIC5sb3dEb3QnKS5yZW1vdmUoKTtcbiAgICAgIH1cblxuICAgICAgbGV0IGF2Z0RvdENpcmNsZSA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuYXZnRG90JykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgYXZnRG90Q2lyY2xlLmF0dHIoJ2NsYXNzJywgJ2F2Z0RvdCcpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyNGRkYnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgYXZnRG90Q2lyY2xlLmVudGVyKCkuYXBwZW5kKCdjaXJjbGUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnYXZnRG90JylcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnI0ZGRic7XG4gICAgICAgIH0pLm9uKCdtb3VzZW92ZXInLCAoZCwgaSkgPT4ge1xuICAgICAgICAgIC8vdGlwLnNob3coZCwgaSk7XG4gICAgICAgIH0pLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAvL3RpcC5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBhdmdEb3RDaXJjbGUuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgfVxuICB9XG5cbn1cbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9Jy4uLy4uLy4uL3R5cGluZ3MvdHNkLmQudHMnIC8+XG5cbm5hbWVzcGFjZSBDaGFydHMge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaW1wb3J0IElDaGFydERhdGFQb2ludCA9IENoYXJ0cy5JQ2hhcnREYXRhUG9pbnQ7XG5cbiAgZXhwb3J0IGNsYXNzIFNjYXR0ZXJMaW5lQ2hhcnQgaW1wbGVtZW50cyBJQ2hhcnRUeXBlIHtcblxuICAgIHB1YmxpYyBuYW1lID0gJ3NjYXR0ZXJsaW5lJztcblxuICAgIHB1YmxpYyBkcmF3Q2hhcnQoY2hhcnRPcHRpb25zOiBDaGFydHMuQ2hhcnRPcHRpb25zKSB7XG5cbiAgICAgIGxldCBsaW5lU2NhdHRlclRvcFN0ZW0gPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lVG9wU3RlbScpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZVRvcFN0ZW0nKVxuICAgICAgICAuZmlsdGVyKChkOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyVG9wU3RlbS5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZVRvcFN0ZW0nKVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBsaW5lU2NhdHRlclRvcFN0ZW0uZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgbGluZVNjYXR0ZXJCb3R0b21TdGVtID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZUJvdHRvbVN0ZW0nKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBsaW5lU2NhdHRlckJvdHRvbVN0ZW0uYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVCb3R0b21TdGVtJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbGluZVNjYXR0ZXJCb3R0b21TdGVtLmVudGVyKCkuYXBwZW5kKCdsaW5lJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tU3RlbScpXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5hdmcpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyQm90dG9tU3RlbS5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICAgIGxldCBsaW5lU2NhdHRlclRvcENyb3NzID0gY2hhcnRPcHRpb25zLnN2Zy5zZWxlY3RBbGwoJy5zY2F0dGVyTGluZVRvcENyb3NzJykuZGF0YShjaGFydE9wdGlvbnMuY2hhcnREYXRhKTtcbiAgICAgIC8vIHVwZGF0ZSBleGlzdGluZ1xuICAgICAgbGluZVNjYXR0ZXJUb3BDcm9zcy5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZVRvcENyb3NzJylcbiAgICAgICAgLmZpbHRlcigoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAhaXNFbXB0eURhdGFQb2ludChkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWF4KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyVG9wQ3Jvc3MuZW50ZXIoKS5hcHBlbmQoJ2xpbmUnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY2xhc3MnLCAnc2NhdHRlckxpbmVUb3BDcm9zcycpXG4gICAgICAgIC5hdHRyKCd4MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgLSAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpICsgMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1heCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5tYXgpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyMwMDAnO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignc3Ryb2tlLXdpZHRoJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzAuNSc7XG4gICAgICAgIH0pO1xuICAgICAgLy8gcmVtb3ZlIG9sZCBvbmVzXG4gICAgICBsaW5lU2NhdHRlclRvcENyb3NzLmV4aXQoKS5yZW1vdmUoKTtcblxuICAgICAgbGV0IGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MgPSBjaGFydE9wdGlvbnMuc3ZnLnNlbGVjdEFsbCgnLnNjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKS5kYXRhKGNoYXJ0T3B0aW9ucy5jaGFydERhdGEpO1xuICAgICAgLy8gdXBkYXRlIGV4aXN0aW5nXG4gICAgICBsaW5lU2NhdHRlckJvdHRvbUNyb3NzLmF0dHIoJ2NsYXNzJywgJ3NjYXR0ZXJMaW5lQm90dG9tQ3Jvc3MnKVxuICAgICAgICAuZmlsdGVyKChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFpc0VtcHR5RGF0YVBvaW50KGQpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneDEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpIC0gMztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3gyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSArIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd5MScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGNoYXJ0T3B0aW9ucy55U2NhbGUoZC5taW4pO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTInLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZScsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcjMDAwJztcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3N0cm9rZS13aWR0aCcsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcwLjUnO1xuICAgICAgICB9KTtcbiAgICAgIC8vIGFkZCBuZXcgb25lc1xuICAgICAgbGluZVNjYXR0ZXJCb3R0b21Dcm9zcy5lbnRlcigpLmFwcGVuZCgnbGluZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyTGluZUJvdHRvbUNyb3NzJylcbiAgICAgICAgLmF0dHIoJ3gxJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKSAtIDM7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCd4MicsIChkKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHhNaWRQb2ludFN0YXJ0UG9zaXRpb24oZCwgY2hhcnRPcHRpb25zLnRpbWVTY2FsZSkgKyAzO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cigneTEnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBjaGFydE9wdGlvbnMueVNjYWxlKGQubWluKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ3kyJywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gY2hhcnRPcHRpb25zLnlTY2FsZShkLm1pbik7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2UnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzAwMCc7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdzdHJva2Utd2lkdGgnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnMC41JztcbiAgICAgICAgfSk7XG4gICAgICAvLyByZW1vdmUgb2xkIG9uZXNcbiAgICAgIGxpbmVTY2F0dGVyQm90dG9tQ3Jvc3MuZXhpdCgpLnJlbW92ZSgpO1xuXG4gICAgICBsZXQgY2lyY2xlU2NhdHRlckRvdCA9IGNoYXJ0T3B0aW9ucy5zdmcuc2VsZWN0QWxsKCcuc2NhdHRlckRvdCcpLmRhdGEoY2hhcnRPcHRpb25zLmNoYXJ0RGF0YSk7XG4gICAgICAvLyB1cGRhdGUgZXhpc3RpbmdcbiAgICAgIGNpcmNsZVNjYXR0ZXJEb3QuYXR0cignY2xhc3MnLCAnc2NhdHRlckRvdCcpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdyJywgMylcbiAgICAgICAgLmF0dHIoJ2N4JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4geE1pZFBvaW50U3RhcnRQb3NpdGlvbihkLCBjaGFydE9wdGlvbnMudGltZVNjYWxlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmF0dHIoJ2N5JywgKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaXNSYXdNZXRyaWMoZCkgPyBjaGFydE9wdGlvbnMueVNjYWxlKGQudmFsdWUpIDogY2hhcnRPcHRpb25zLnlTY2FsZShkLmF2Zyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnZmlsbCcsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJyM3MGM0ZTInO1xuICAgICAgICB9KVxuICAgICAgICAuc3R5bGUoJ29wYWNpdHknLCAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuICcxJztcbiAgICAgICAgfSkub24oJ21vdXNlb3ZlcicsIChkLCBpKSA9PiB7XG4gICAgICAgICAgLy90aXAuc2hvdyhkLCBpKTtcbiAgICAgICAgfSkub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgIC8vdGlwLmhpZGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAvLyBhZGQgbmV3IG9uZXNcbiAgICAgIGNpcmNsZVNjYXR0ZXJEb3QuZW50ZXIoKS5hcHBlbmQoJ2NpcmNsZScpXG4gICAgICAgIC5maWx0ZXIoKGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gIWlzRW1wdHlEYXRhUG9pbnQoZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzY2F0dGVyRG90JylcbiAgICAgICAgLmF0dHIoJ3InLCAzKVxuICAgICAgICAuYXR0cignY3gnLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiB4TWlkUG9pbnRTdGFydFBvc2l0aW9uKGQsIGNoYXJ0T3B0aW9ucy50aW1lU2NhbGUpO1xuICAgICAgICB9KVxuICAgICAgICAuYXR0cignY3knLCAoZCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpc1Jhd01ldHJpYyhkKSA/IGNoYXJ0T3B0aW9ucy55U2NhbGUoZC52YWx1ZSkgOiBjaGFydE9wdGlvbnMueVNjYWxlKGQuYXZnKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnN0eWxlKCdmaWxsJywgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiAnIzcwYzRlMic7XG4gICAgICAgIH0pXG4gICAgICAgIC5zdHlsZSgnb3BhY2l0eScsICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gJzEnO1xuICAgICAgICB9KS5vbignbW91c2VvdmVyJywgKGQsIGkpID0+IHtcbiAgICAgICAgICAvL3RpcC5zaG93KGQsIGkpO1xuICAgICAgICB9KS5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICAgLy90aXAuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgIC8vIHJlbW92ZSBvbGQgb25lc1xuICAgICAgY2lyY2xlU2NhdHRlckRvdC5leGl0KCkucmVtb3ZlKCk7XG5cbiAgICB9XG4gIH1cbn1cbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
