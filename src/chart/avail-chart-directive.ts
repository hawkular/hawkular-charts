/// <reference path="../../vendor/vendor.d.ts" />

module Charts {
  'use strict';

  declare var angular:ng.IAngularStatic;

  declare var d3:any;
  declare var console:any;

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
var hawkularCharts =  angular.module('hawkular.charts')
    .directive('availabilityChart', () => {
      return new Charts.AvailabilityChartDirective();
    });

  export class AvailabilityChartDirective {

    public restrict = 'EA';
    public replace = true;

    public scope = {
      data: '@',
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
      var dataPoints:IAvailDataPoint[] = [],
        startTimestamp:number = +attrs.startTimestamp,
        endTimestamp:number = +attrs.endTimestamp,
        transformedDataPoints:ITransformedAvailDataPoint[],
        chartHeight = +attrs.chartHeight || 150,
        noDataLabel = attrs.noDataLabel || 'No Data';

      // chart specific vars
      var margin = {top: 10, right: 5, bottom: 5, left: 90},
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
        ///return angular.element("#" + chartContext.chartHandle).width();
        return 760;
      }

      function buildAvailHover(d:ITransformedAvailDataPoint ) {

        return  "<div class='chartHover'><div><small><span class='chartHoverLabel'>Status: </span><span>: </span><span class='chartHoverValue'>" + d.value.toUpperCase() + "</span></small></div>" +
          "<div><small><span class='chartHoverLabel'>Duration</span><span>: </span><span class='chartHoverValue'>" + d.duration + "</span></small> </div>";


      }

      function oneTimeChartSetup():void {
        console.log("OneTimeChartSetup");
        // destroy any previous charts
        if (chart) {
          chartParent.selectAll('*').remove();
        }
        chartParent = d3.select(element[0]);
        chart = chartParent.append("svg");

        tip = d3.tip()
          .attr('class', 'd3-tip')
          .offset([-10, 0])
          .html((d:ITransformedAvailDataPoint) => {
            return buildAvailHover(d);
          });

        svg = chart.append("g")
          .attr("width", width + margin.left + margin.right)
          .attr("height", innerChartHeight)
          .attr("transform", "translate(" + margin.left + "," + (adjustedChartHeight2) + ")");

        svg.call(tip);
      }


      function determineAvailScale(dataPoints:ITransformedAvailDataPoint[]) {
        var adjustedTimeRange:number[] = [];

        var oneHourAgo = +moment().subtract('hours', 1);

        if (dataPoints) {

          // Data points only have the start
          if (dataPoints.length > 1) {
            adjustedTimeRange[0] = d3.min(dataPoints, (d:ITransformedAvailDataPoint) => {
              return d.start;
            });

            // Provide "now" as end // TODO adjust to date range picker
            adjustedTimeRange[1] = +moment();
          } else {
            adjustedTimeRange = [+moment(), oneHourAgo]; // default to 1 hour same as graph
          }

          yScale = d3.scale.linear()
            .clamp(true)
            .rangeRound([innerChartHeight, 0])
            .domain([0, 175]);

          yAxis = d3.svg.axis()
            .scale(yScale)
            .ticks(0)
            .tickSize(0, 0)
            .orient("left");

          timeScale = d3.time.scale()
            .range([0, width])
            .domain(adjustedTimeRange);

          xAxis = d3.svg.axis()
            .scale(timeScale)
            .tickSize(-70, 0)
            .orient("top");

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
        var outputData:ITransformedAvailDataPoint[] = [];
        var itemCount = inAvailData.length;
        if (inAvailData && itemCount > 0 && inAvailData[0].timestamp) {
          var now = new Date().getTime();

          if (itemCount === 1) {
            var availItem = inAvailData[0];

            // we only have one item with start time. Assume unknown for the time before (last 1h) TODO adjust to time picker
            outputData.push(new TransformedAvailDataPoint(now - 60 * 60 * 1000, availItem.timestamp, 'unknown'));
            // and the determined value up until the end.
            outputData.push(new TransformedAvailDataPoint(availItem.timestamp, now, availItem.value));
          }
          else {

            var backwardsEndTime:number;
            var i:number;

            backwardsEndTime = now;
            for (i = inAvailData.length; i > 0; i--) {
              outputData.push(new TransformedAvailDataPoint(inAvailData[i - 1].timestamp, backwardsEndTime, inAvailData[i - 1].value));
              backwardsEndTime = inAvailData[i - 1].timestamp;
            }
          }
        }
        return outputData;
      }


      function createSideYAxisLabels() {

        svg.append("text")
          .attr("class", "availUpLabel")
          .attr("x", -10)
          .attr("y", 25)
          .style("font-family", "Arial, Verdana, sans-serif;")
          .style("font-size", "12px")
          .attr("fill", "#999")
          .style("text-anchor", "end")
          .text("Up");

        svg.append("text")
          .attr("class", "availDownLabel")
          .attr("x", -10)
          .attr("y", 55)
          .style("font-family", "Arial, Verdana, sans-serif;")
          .style("font-size", "12px")
          .attr("fill", "#999")
          .style("text-anchor", "end")
          .text("Down");

      }


      function createAvailabilityChart(dataPoints:ITransformedAvailDataPoint[]) {
        var xAxisMin = d3.min(dataPoints, (d:ITransformedAvailDataPoint) => {
            return +d.start;
          }),
          xAxisMax = d3.max(dataPoints, (d:ITransformedAvailDataPoint) => {
            return +d.end;
          });

          var availTimeScale = d3.time.scale()
            .range([0, width])
            .domain([xAxisMin, xAxisMax]),

          yScale = d3.scale.linear()
            .clamp(true)
            .range([height, 0])
            .domain([0, 4]),

          availXAxis = d3.svg.axis()
            .scale(availTimeScale)
            .ticks(8)
            .tickSize(13, 0)
            .orient("top");


        function calcBarY(d:ITransformedAvailDataPoint) {
          var offset;

          if (isUp(d) || isUnknown(d)) {
            offset = 0;
          } else {
            offset = 35;
          }
          return height - yScale(0) + offset;

        }

        function calcBarHeight(d:ITransformedAvailDataPoint) {
          var height;

          if (isUnknown(d)) {
            height = 15;
          } else {
            height = 50;
          }
          return yScale(0) - height;

        }

        function calcBarFill(d:ITransformedAvailDataPoint) {
          if (isUp(d)) {
            return "#4AA544"; // green
          } else if (isUnknown(d)) {
            return "#B5B5B5"; // gray
          } else {
            return "#E52527"; // red
          }
        }

        svg.selectAll("rect.availBars")
          .data(dataPoints)
          .enter().append("rect")
          .attr("class", "availBars")
          .attr("x", (d:ITransformedAvailDataPoint) => {
            return availTimeScale(+d.start);
          })
          .attr("y", (d:ITransformedAvailDataPoint)  => {
            return calcBarY(d);
          })
          .attr("height", (d) => {
            return calcBarHeight(d);
          })
          .attr("width", (d:ITransformedAvailDataPoint) => {
            return availTimeScale(+d.end) - availTimeScale(+d.start);
          })
          .attr("fill", (d:ITransformedAvailDataPoint) => {
            return calcBarFill(d);
          })
          .on("mouseover", (d, i) => {
            tip.show(d, i);
          }).on("mouseout", () => {
            tip.hide();
          });


        // create x-axis
        svg.append("g")
          .attr("class", "x axis")
          .call(availXAxis);


        var bottomYAxisLine = d3.svg.line()
          .x((d:ITransformedAvailDataPoint) => {
            return timeScale(d.start);
          })
          .y((d:ITransformedAvailDataPoint) => {
            return height - yScale(0) + 70;
          });

        svg.append("path")
          .datum(dataPoints)
          .attr("class", "availYAxisLine")
          .attr("d", bottomYAxisLine);

        createSideYAxisLabels();
      }


      function createXandYAxes() {
        var xAxisGroup;

        svg.selectAll('g.axis').remove();


        // create x-axis
        xAxisGroup = svg.append("g")
          .attr("class", "x axis")
          .call(xAxis);

        //xAxisGroup.append("g")
        //  .attr("class", "x brush")
        //  .call(brush)
        //  .selectAll("rect")
        //  .attr("y", -6)
        //  .attr("height", 30);

        // create y-axis
        svg.append("g")
          .attr("class", "y axis")
          .call(yAxis);
      }


      function createXAxisBrush() {

        brush = d3.svg.brush()
          .x(timeScaleForBrush)
          .on("brushstart", brushStart)
          .on("brush", brushMove)
          .on("brushend", brushEnd);

        //brushGroup = svg.append("g")
        //    .attr("class", "brush")
        //    .call(brush);
        //
        //brushGroup.selectAll(".resize").append("path");
        //
        //brushGroup.selectAll("rect")
        //    .attr("height", height);

        function brushStart() {
          svg.classed("selecting", true);
        }

        function brushMove() {
          //useful for showing the daterange change dynamically while selecting
          var extent = brush.extent();
          //scope.$emit('DateRangeMove', extent);
        }

        function brushEnd() {
          var extent = brush.extent(),
            startTime = Math.round(extent[0].getTime()),
            endTime = Math.round(extent[1].getTime()),
            dragSelectionDelta = endTime - startTime >= 60000;

          svg.classed("selecting", !d3.event.target.empty());
          // ignore range selections less than 1 minute
          if (dragSelectionDelta) {
            scope.$emit('DateRangeChanged', extent);
          }
        }
      }

      scope.$watch('data', (newData) => {
        console.debug('Avail Chart Data Changed');
        if (newData) {
          transformedDataPoints = formatTransformedDataPoints(angular.fromJson(newData));
          console.dir(transformedDataPoints);
          scope.render(transformedDataPoints);
        }
      }, true);

      scope.$watch('startTimestamp', (newStartTimestap) => {
        console.debug('Avail Chart Start Timestamp Changed');
        if (newStartTimestap) {
          startTimestamp = newStartTimestap;
          scope.render(transformedDataPoints);
        }
      }, false);

      scope.$watch('endTimestamp', (newEndTimestap) => {
        console.debug('Avail Chart End Timestamp Changed');
        if (newEndTimestap) {
          endTimestamp = newEndTimestap;
          scope.render(transformedDataPoints);
        }
      }, false);

      scope.render = (dataPoints:ITransformedAvailDataPoint[]) => {
        console.debug("Starting Avail Chart Directive Render");
        console.group('Render Avail Chart');
        if (dataPoints) {
          console.time('availChartRender');
          //NOTE: layering order is important!
          console.dir(dataPoints);
          oneTimeChartSetup();
          determineAvailScale(dataPoints);
          createXAxisBrush();
          createAvailabilityChart(dataPoints);
          createXandYAxes();

          console.timeEnd('availChartRender');
        }
        console.groupEnd();
      };

    };
  }
}



