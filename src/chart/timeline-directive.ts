/// <reference path='../../typings/tsd.d.ts' />
namespace Charts {
  'use strict';

  declare let d3: any;

// Timeline specific for ManageIQ Timeline component
  export class TimelineDataPoint {


    constructor(public timestamp: TimeInMillis,
                public eventSource: string,
                public provider: string,
                public message?: string,
                public middlewareResource?: string,
                public formattedDate?: Date,
                public color?:string) {

      this.formattedDate = moment(timestamp).format('MMMM Do YYYY, h:mm:ss a');
    }

  }

  const _module = angular.module('hawkular.charts');

  export class TimelineChartDirective {

    private static _CHART_HEIGHT = 150;
    private static _CHART_WIDTH = 750;

    public restrict = 'E';
    public replace = true;

    // Can't use 1.4 directive controllers because we need to support 1.3+
    public scope = {
      events: '=',
      startTimestamp: '@', // to provide for exact boundaries of start/stop times (if omitted, it will be calculated)
      endTimestamp: '@',
      timeLabel: '@',
      dateLabel: '@',
    };

    public link: (scope: any, element: ng.IAugmentedJQuery, attrs: any) => void;

    public events: TimelineDataPoint[];

    constructor($rootScope: ng.IRootScopeService) {

      this.link = (scope, element, attrs) => {

        // data specific vars
        let startTimestamp: number = +attrs.startTimestamp,
          endTimestamp: number = +attrs.endTimestamp,
          chartHeight = TimelineChartDirective._CHART_HEIGHT;

        // chart specific vars
        let margin = { top: 10, right: 5, bottom: 5, left: 10 },
          width = TimelineChartDirective._CHART_WIDTH - margin.left - margin.right,
          adjustedChartHeight = chartHeight - 50,
          height = adjustedChartHeight - margin.top - margin.bottom,
          titleHeight = 30,
          titleSpace = 10,
          innerChartHeight = height + margin.top - titleHeight - titleSpace,
          adjustedChartHeight2 = +titleHeight + titleSpace + margin.top,
          yScale,
          timeScale,
          yAxis,
          xAxis,
          xAxisGroup,
          brush,
          brushGroup,
          tip,
          chart,
          chartParent,
          svg;

        function TimelineHover(d: TimelineDataPoint) {
          return `<div class='chartHover'>
            <div class='info-item'>
              <span class='chartHoverLabel'>Event Source:</span>
              <span class='chartHoverValue'>${d.eventSource}</span>
            </div>
            <div class='info-item'>
              <span class='chartHoverLabel'>Provider:</span>
              <span class='chartHoverValue'>${d.provider}</span>
            </div>
            <div class='info-item'>
              <span class='chartHoverLabel'>Message:</span>
              <span class='chartHoverValue'>${d.message}</span>
            </div>
            <div class='info-item'>
              <span class='chartHoverLabel'>Middleware Resource:</span>
              <span class='chartHoverValue'>${d.middlewareResource}</span>
            </div>
            <div class='info-item'>
              <span class='chartHoverLabel'>Date Time:</span>
              <span class='chartHoverValue'>${moment(d.timestamp).format('M/d/YY, H:mm:ss ')}</span>
            </div>
          </div>`;
        }

        function timelineChartSetup(): void {
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
            .html((d ) => {
              return TimelineHover(d);
            });

          svg = chart.append('g')
            .attr('width', width + margin.left + margin.right)
            .attr('height', innerChartHeight)
            .attr('transform', 'translate(' + margin.left + ',' + (adjustedChartHeight2) + ')');

          svg.call(tip);
        }

        function determineTimelineScale(timelineDataPoints: TimelineDataPoint[]) {
          let adjustedTimeRange: number[] = [];

          startTimestamp = +attrs.startTimestamp ||
            d3.min(timelineDataPoints, (d: TimelineDataPoint) => {
              return d.timestamp;
            }) || +moment().subtract(1, 'hour');

          if (timelineDataPoints && timelineDataPoints.length > 0) {

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
              .tickFormat(xAxisTimeFormats());

          }
        }

        function createTimelineChart(timelineDataPoints: TimelineDataPoint[]) {
          let xAxisMin = d3.min(timelineDataPoints, (d: TimelineDataPoint) => {
           return +d.timestamp;
          });
          let xAxisMax = d3.max(timelineDataPoints, (d: TimelineDataPoint) => {
            return +d.timestamp;
          });
          let timelineTimeScale = d3.time.scale()
            .range([0, width])
            .domain([xAxisMin, xAxisMax);

          // 0-6 is the y-axis range, this means 1-5 is the valid range for
          // values that won't be cut off half way be either axis.
          let yScale = d3.scale.linear()
              .clamp(true)
              .range([height, 0])
              .domain([0, 6]);

          svg.selectAll('circle')
            .data(timelineDataPoints)
            .enter()
            .append('circle')
            .attr('class', 'hkEvent')
            .attr('cx', (d:TimelineDataPoint) => {
              return timelineTimeScale(d.timestamp);
            })
            .attr('cy', (d) => {
              return yScale(5);
            })
            .attr('r', (d) => {
              return 6;
            }) .on('mouseover', (d, i) => {
              tip.show(d, i);
            }).on('mouseout', () => {
              tip.hide();
            });

          // The bottom line of the availability chart
          svg.append('line')
            .attr('x1', 0)
            .attr('y1', 70)
            .attr('x2', 735)
            .attr('y2', 70)
            .attr('stroke-width', 1)
            .attr('stroke', '#D0D0D0');

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
            let extent = brush.extent(),
              startTime = Math.round(extent[0].getTime()),
              endTime = Math.round(extent[1].getTime()),
              dragSelectionDelta = endTime - startTime;

            //svg.classed('selecting', !d3.event.target.empty());
            if (dragSelectionDelta >= 60000) {
              $rootScope.$broadcast(EventNames.TIMELINE_CHART_TIMERANGE_CHANGED.toString(), extent);
            }
            brushGroup.call(brush.clear());
          }
        }

        scope.$watchCollection('events', (newEvents) => {
          if (newEvents) {
            console.log('new timeline events');
            this.events = angular.fromJson(newEvents);
            scope.render(this.events);
          }
        });

        scope.$watchGroup(['startTimestamp', 'endTimestamp'], (newTimestamp) => {
          startTimestamp = +newTimestamp[0] || startTimestamp;
          endTimestamp = +newTimestamp[1] || endTimestamp;
          scope.render(this.events);
        });

        scope.render = (timelineDataPoints: TimelineDataPoint[]) => {
          if (timelineDataPoints && timelineDataPoints.length > 0) {
            ///NOTE: layering order is important!
            timelineChartSetup();
            determineTimelineScale(timelineDataPoints);
            createXandYAxes();
            createXAxisBrush();
            createTimelineChart(timelineDataPoints);
          }
        };
      };
    }

    public static Factory() {
      let directive = ($rootScope: ng.IRootScopeService) => {
        return new TimelineChartDirective($rootScope);
      };

      directive['$inject'] = ['$rootScope'];

      return directive;
    }

  }

  _module.directive('hkTimelineChart', TimelineChartDirective.Factory());
}
