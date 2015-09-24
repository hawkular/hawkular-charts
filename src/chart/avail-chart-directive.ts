/// <reference path='../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

  declare let angular:ng.IAngularStatic;

  declare let d3:any;
  declare let console:any;

  /**
   * This is the input data format.
   */
  export interface IAvailDataPoint {
    timestamp:number;
    value:string;
  }

  /**
   * This is the transformed output data format. Formatted to work with availability chart (basically a DTO).
   */
  export interface ITransformedAvailDataPoint {
    start:number;
    end:number;
    value:string;
    startDate?:Date; /// Mainly for debugger human readable dates instead of a number
    endDate?:Date;
    duration?:string;
    message?:string;
  }

  export class TransformedAvailDataPoint implements ITransformedAvailDataPoint {

    constructor(public start:number,
                public end:number,
                public value:string,
                public startDate?:Date,
                public endDate?:Date,
                public duration?:string,
                public message?:string) {

      this.duration = moment(end).from(moment(start), true);
      this.startDate = new Date(start);
      this.endDate = new Date(end);
    }

  }


  /**
   * @ngdoc directive
   * @name availability-chart
   * @description A d3 based charting directive for charting availability.
   *
   */
  let _module = angular.module('hawkular.charts')
    .directive('availabilityChart', () => {
      return new Charts.AvailabilityChartDirective();
    });

  export class AvailabilityChartDirective {

    public restrict = 'E';
    public replace = true;

    public scope = {
      data: '=',
      startTimestamp: '@',
      endTimestamp: '@',
      chartHeight: '@',
      timeLabel: '@',
      dateLabel: '@',
      noDataLabel: '@',
      chartTitle: '@'
    };


    public link = (scope, element, attrs) => {

      // data specific vars
      let dataPoints:IAvailDataPoint[] = [],
        startTimestamp:number = +attrs.startTimestamp,
        endTimestamp:number = +attrs.endTimestamp,
        transformedDataPoints:ITransformedAvailDataPoint[],
        chartHeight = +attrs.chartHeight || 150,
        noDataLabel = attrs.noDataLabel || 'No Data';

      // chart specific vars
      let margin = {top: 10, right: 5, bottom: 5, left: 90},
        width = 750 - margin.left - margin.right,
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
        brush,
        tip,
        timeScaleForBrush,
        chart,
        chartParent,
        svg;

      function getChartWidth():number {
        ///return angular.element('#' + chartContext.chartHandle).width();
        return 760;
      }

      function buildAvailHover(d:ITransformedAvailDataPoint) {
        return `<div class='chartHover'><div><small><span class='chartHoverLabel'>Status: </span><span>: </span><span class='chartHoverValue'>${d.value.toUpperCase()}</span></small></div>
          <div><small><span class='chartHoverLabel'>Duration</span><span>: </span><span class='chartHoverValue'>${d.duration}</span></small> </div>`;
      }

      function oneTimeChartSetup():void {
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
          .html((d:ITransformedAvailDataPoint) => {
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


      function determineAvailScale(dataPoints:ITransformedAvailDataPoint[]) {
        let adjustedTimeRange:number[] = [];

        startTimestamp = +attrs.startTimestamp || d3.min(dataPoints, (d:ITransformedAvailDataPoint) => { return d.start; }) || +moment().subtract(1, 'hour');

        if (dataPoints) {

          adjustedTimeRange[0] = startTimestamp;
          adjustedTimeRange[1] = +moment(); // TODO: Fix wehn we support end != now

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
            .tickFormat(d3.time.format.multi([
              [".%L", function(d) { return d.getMilliseconds(); }],
              [":%S", function(d) { return d.getSeconds(); }],
              ["%H:%M", function(d) { return d.getMinutes() }],
              ["%H:%M", function(d) { return d.getHours(); }],
              ["%a %d", function(d) { return d.getDay() && d.getDate() != 1; }],
              ["%b %d", function(d) { return d.getDate() != 1; }],
              ["%B", function(d) { return d.getMonth(); }],
              ["%Y", function() { return true; }]
          ]));
        }
      }


      function isUp(d:ITransformedAvailDataPoint) {
        return d.value === 'up';
      }

      function isDown(d:ITransformedAvailDataPoint) {
        return d.value === 'down';
      }

      function isUnknown(d:ITransformedAvailDataPoint) {
        return d.value === 'unknown';
      }

      function formatTransformedDataPoints(inAvailData:IAvailDataPoint[]):ITransformedAvailDataPoint[] {
        let outputData:ITransformedAvailDataPoint[] = [];
        let itemCount = inAvailData.length;
        if (inAvailData && itemCount > 0 && inAvailData[0].timestamp) {
          let now = new Date().getTime();

          if (itemCount === 1) {
            let availItem = inAvailData[0];

            // we only have one item with start time. Assume unknown for the time before (last 1h) TODO adjust to time picker
            outputData.push(new TransformedAvailDataPoint(now - 60 * 60 * 1000, availItem.timestamp, 'unknown'));
            // and the determined value up until the end.
            outputData.push(new TransformedAvailDataPoint(availItem.timestamp, now, availItem.value));
          }
          else {

            let backwardsEndTime:number;
            let i:number;

            backwardsEndTime = now;
            for (i = inAvailData.length; i > 0; i--) {
              // if we have data starting in the future... discard it
              if(inAvailData[i - 1].timestamp > +moment()) {
                continue;
              }
              if(startTimestamp >= inAvailData[i - 1].timestamp) {
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


      function createAvailabilityChart(dataPoints:ITransformedAvailDataPoint[]) {
        let xAxisMin = d3.min(dataPoints, (d:ITransformedAvailDataPoint) => {
            return +d.start;
          }),
          xAxisMax = d3.max(dataPoints, (d:ITransformedAvailDataPoint) => {
            return +d.end;
          });

        let availTimeScale = d3.time.scale()
            .range([0, width])
            .domain([startTimestamp, xAxisMax]),

          yScale = d3.scale.linear()
            .clamp(true)
            .range([height, 0])
            .domain([0, 4]),

          availXAxis = d3.svg.axis()
            .scale(availTimeScale)
            .ticks(8)
            .tickSize(13, 0)
            .orient('top');

        // For each datapoint calculate the Y offset for the bar
        // Up or Unknown: offset 0, Down: offset 35
        function calcBarY(d:ITransformedAvailDataPoint) {
          return height - yScale(0) + ((isUp(d) || isUnknown(d)) ? 0 : 35);
        }

        // For each datapoint calculate the Y removed height for the bar
        // Unknown: full height 15, Up or Down: half height, 50
        function calcBarHeight(d:ITransformedAvailDataPoint) {
          return yScale(0) - (isUnknown(d) ? 15 : 50);
        }

        function calcBarFill(d:ITransformedAvailDataPoint) {
          if (isUp(d)) {
            return '#54A24E'; // green
          } else if (isUnknown(d)) {
            return 'url(#diagonal-stripes)'; // gray
          } else {
            return '#D85054'; // red
          }
        }

        svg.selectAll('rect.availBars')
          .data(dataPoints)
          .enter().append('rect')
          .attr('class', 'availBars')
          .attr('x', (d:ITransformedAvailDataPoint) => {
            return availTimeScale(+d.start);
          })
          .attr('y', (d:ITransformedAvailDataPoint)  => {
            return calcBarY(d);
          })
          .attr('height', (d) => {
            return calcBarHeight(d);
          })
          .attr('width', (d:ITransformedAvailDataPoint) => {
            return availTimeScale(+d.end) - availTimeScale(+d.start);
          })
          .attr('fill', (d:ITransformedAvailDataPoint) => {
            return calcBarFill(d);
          })
          .on('mouseover', (d, i) => {
            tip.show(d, i);
          }).on('mouseout', () => {
            tip.hide();
          });

        // The bottom line of the availability chart
        svg.append('line')
          .attr("x1", 0).attr("y1", 70)
          .attr("x2", 655).attr("y2", 70)
          .attr("stroke-width", 0.5)
          .attr("stroke", "#D0D0D0");

        createSideYAxisLabels();
      }


      function createXandYAxes() {
        let xAxisGroup;

        svg.selectAll('g.axis').remove();


        // create x-axis
        xAxisGroup = svg.append('g')
          .attr('class', 'x axis')
          .call(xAxis);

        //xAxisGroup.append('g')
        //  .attr('class', 'x brush')
        //  .call(brush)
        //  .selectAll('rect')
        //  .attr('y', -6)
        //  .attr('height', 30);

        // create y-axis
        svg.append('g')
          .attr('class', 'y axis')
          .call(yAxis);
      }


      function createXAxisBrush() {

        brush = d3.svg.brush()
          .x(timeScaleForBrush)
          .on('brushstart', brushStart)
          .on('brush', brushMove)
          .on('brushend', brushEnd);

        //brushGroup = svg.append('g')
        //    .attr('class', 'brush')
        //    .call(brush);
        //
        //brushGroup.selectAll('.resize').append('path');
        //
        //brushGroup.selectAll('rect')
        //    .attr('height', height);

        function brushStart() {
          svg.classed('selecting', true);
        }

        function brushMove() {
          //useful for showing the daterange change dynamically while selecting
          let extent = brush.extent();
          //scope.$emit('DateRangeMove', extent);
        }

        function brushEnd() {
          let extent = brush.extent(),
            startTime = Math.round(extent[0].getTime()),
            endTime = Math.round(extent[1].getTime()),
            dragSelectionDelta = endTime - startTime >= 60000;

          svg.classed('selecting', !d3.event.target.empty());
          // ignore range selections less than 1 minute
          if (dragSelectionDelta) {
            scope.$emit('DateRangeChanged', extent);
          }
        }
      }

      scope.$watchCollection('data', (newData) => {
        console.debug('Avail Chart Data Changed');
        if (newData) {
          transformedDataPoints = formatTransformedDataPoints(angular.fromJson(newData));
          scope.render(transformedDataPoints);
        }
      });

      scope.$watchGroup(['startTimestamp', 'endTimestamp'], (newTimestamp) => {
        console.debug('Avail Chart Start/End Timestamp Changed');
        startTimestamp = newTimestamp[0] || startTimestamp;
        endTimestamp = newTimestamp[1] || endTimestamp;
        scope.render(transformedDataPoints);
      });

      scope.render = (dataPoints:ITransformedAvailDataPoint[]) => {
        console.debug('Starting Avail Chart Directive Render');
        console.group('Render Avail Chart');
        if (dataPoints) {
          console.time('availChartRender');
          ///NOTE: layering order is important!
          oneTimeChartSetup();
          determineAvailScale(dataPoints);
          createXAxisBrush();
          createXandYAxes();
          createAvailabilityChart(dataPoints);

          console.timeEnd('availChartRender');
        }
        console.groupEnd();
      };

    };
  }
}



