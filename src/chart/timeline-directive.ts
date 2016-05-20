/// <reference path='../../typings/tsd.d.ts' />
namespace Charts {
  'use strict';

  declare let d3: any;

 // ManageIQ External Management System Event
  export class EmsEvent {

    constructor(public timestamp: TimeInMillis,
                public eventSource: string,
                public provider: string,
                public message?: string,
                public middlewareResource?: string) {
    }
  }

// Timeline specific for ManageIQ Timeline component
  export class TimelineEvent extends EmsEvent {

    constructor(public timestamp: TimeInMillis,
                public eventSource: string,
                public provider: string,
                public message?: string,
                public middlewareResource?: string,
                public formattedDate?: string,
                public color?: string,
                public row?:number) {
      super(timestamp, eventSource, provider, message, middlewareResource);
      this.formattedDate = moment(timestamp).format('MMMM Do YYYY, h:mm:ss a');
    }

    /**
     * Build TimelineEvents from EmsEvents
     * @param emsEvents
     */
    public static buildEvents(emsEvents: EmsEvent[]): TimelineEvent[] {
      //  The schema is different for bucketed output
      if (emsEvents) {
        return emsEvents.map((emsEvent: EmsEvent) => {
          return {
            timestamp: emsEvent.timestamp,
            eventSource: emsEvent.eventSource,
            provider: emsEvent.eventSource,
            message: emsEvent.message,
            middlewareResource: emsEvent.middlewareResource,
            formattedDate: moment(emsEvent.timestamp).format('MMMM Do YYYY, h:mm:ss a'),
            color: emsEvent.eventSource === 'Hawkular' ? '#0088ce' : '#ec7a08',
            row: RowNumber.nextRow()
          };
        });
      }
    }

    /**
     * BuildFakeEvents is a fake event builder for testing/prototyping
     * @param n the number of events you want generated
     * @param startTimeStamp
     * @param endTimestamp
     * @returns {TimelineEvent[]}
     */
    public static buildFakeEvents(n: number,
                                  startTimeStamp: TimeInMillis,
                                  endTimestamp: TimeInMillis): TimelineEvent[] {
      let events: TimelineEvent[] = [];
      const step = (endTimestamp - startTimeStamp) / n;

      for(let i =  startTimeStamp; i < endTimestamp; i += step) {
        let randomTime = Random.randomBetween(startTimeStamp, endTimestamp);
        const event = new TimelineEvent(randomTime, 'Hawkular', 'Hawkular Provider',
          'Some Message', 'Resource' + '-' + Random.randomBetween(10,100),
          moment(i).format('MMMM Do YYYY, h:mm:ss a'), '0088ce', RowNumber.nextRow());

        events.push(event);

      }
      return events;
    }

  }

  /**
   * Random number generator
   */
  export class Random {
    public static randomBetween(min: number, max: number): number {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
  }
  /**
   * RowNumber class used to calculate which row in the TimelineChart an Event should be placed.
   * This is so events don't pile up on each other. The next event will be placed on the next row
   * such that labels can be placed
   */
  class RowNumber {

    private static _currentRow = 0;

    /**
     * Returns a row number from 1 to 5 for determining which row an event should be placed on.
     * @returns {number}
     */
    public static nextRow(): number {
      const MAX_ROWS = 5;

      RowNumber._currentRow++;

      if(RowNumber._currentRow > MAX_ROWS) {
        RowNumber._currentRow = 1; // reset back to zero
      }
      // reverse the ordering of the numbers so that 1 becomes 5
      // so that the events are laid out from top -> bottom instead of bottom -> top
      return (MAX_ROWS + 1 ) - RowNumber._currentRow;
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
      showLabels: '@'
    };

    public link: (scope: any, element: ng.IAugmentedJQuery, attrs: any) => void;

    public events: TimelineEvent[];

    constructor($rootScope: ng.IRootScopeService) {

      this.link = (scope, element, attrs) => {

        // data specific vars
        let startTimestamp: number = +attrs.startTimestamp,
          endTimestamp: number = +attrs.endTimestamp,
          chartHeight = TimelineChartDirective._CHART_HEIGHT,
          showLabels = attrs.showLabels;

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

        function TimelineHover(d: TimelineEvent) {
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

        function determineTimelineScale(timelineEvent: TimelineEvent[]) {
          let adjustedTimeRange: number[] = [];

          startTimestamp = +attrs.startTimestamp ||
            d3.min(timelineEvent, (d: TimelineEvent) => {
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
              .tickFormat(xAxisTimeFormats());

          }
        }

        function createTimelineChart(timelineEvent: TimelineEvent[]) {
          let xAxisMin = d3.min(timelineEvent, (d: TimelineEvent) => {
           return +d.timestamp;
          });
          let xAxisMax = d3.max(timelineEvent, (d: TimelineEvent) => {
            return +d.timestamp;
          });
          let timelineTimeScale = d3.time.scale()
            .range([0, width])
            .domain([xAxisMin, xAxisMax]);

          // 0-6 is the y-axis range, this means 1-5 is the valid range for
          // values that won't be cut off half way be either axis.
          let yScale = d3.scale.linear()
              .clamp(true)
              .range([height, 0])
              .domain([0, 6]);

          // The bottom line of the timeline chart
          svg.append('line')
            .attr('x1', 0)
            .attr('y1', 70)
            .attr('x2', 735)
            .attr('y2', 70)
            .attr('class','hkTimelineBottomLine');

          svg.selectAll('circle')
            .data(timelineEvent)
            .enter()
            .append('circle')
            .attr('class', 'hkEvent')
            .attr('cx', (d: TimelineEvent) => {
              return timelineTimeScale(new Date(d.timestamp));
            })
            .attr('cy', (d: TimelineEvent) => {
              return yScale(d.row);
            })
            .attr('fill', (d: TimelineEvent) => {
              return  d.color;
            })
            .attr('r', (d) => {
              return 6;
            }) .on('mouseover', (d, i) => {
              tip.show(d, i);
            }).on('mouseout', () => {
              tip.hide();
            });


          if (showLabels) {

            svg.selectAll('text')
              .data(timelineEvent)
              .enter()
              .append('text')
              .attr('class', 'hkEventLabel')
              .attr('x', (d:TimelineEvent) => {
                return timelineTimeScale(new Date(d.timestamp)) + 10;
              })
              .attr('y', (d:TimelineEvent) => {
                return yScale(d.row) + 5;
              })
              .style('text-anchor', 'start')
              .text((d:TimelineEvent) => {
                return d.middlewareResource;
              });
          }

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
            this.events = TimelineEvent.buildEvents(angular.fromJson(newEvents));
            scope.render(this.events);
          }
        });

        scope.$watchGroup(['startTimestamp', 'endTimestamp'], (newTimestamp) => {
          startTimestamp = +newTimestamp[0] || startTimestamp;
          endTimestamp = +newTimestamp[1] || endTimestamp;
          scope.render(this.events);
        });

        scope.render = (timelineEvent: TimelineEvent[]) => {
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
