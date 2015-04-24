/// <reference path="../../vendor/vendor.d.ts" />

module Charts {
  'use strict';

  declare
  var angular:ng.IAngularStatic;

  declare
  var d3:any;
  declare
  var console:any;

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
    duration?:string;
    message?:string;
  }

  export class TransformedAvailDataPoint implements ITransformedAvailDataPoint {

    constructor(public start:number,
                public end:number,
                public value:string,
                public duration?:string,
                public message?:string) {

    }

  }


  /**
   * @ngdoc directive
   * @name availability-chart
   * @description A d3 based charting directive for charting availability.
   *
   */
  angular.module('hawkular.charts')
    .directive('availabilityChart', () => {
      return new Charts.AvailabilityChartDirective();
    });

  export class AvailabilityChartDirective {

    public restrict = 'EA';
    public replace = true;

    public scope = {
      data: '@',
      chartHeight: '@',
      timeLabel: '@',
      dateLabel: '@',
      noDataLabel: '@',
      chartTitle: '@'
    };

    public controller = ['$scope', '$element', '$attrs', ($scope, $element, $attrs) => {

    }];


    public link = (scope, element, attrs) => {

      // data specific vars
      var dataPoints:IAvailDataPoint[] = [],
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
        tip,
        brush,
        timeScaleForBrush,
        chart,
        chartParent,
        svg;

      dataPoints = []; // dont care when the first come in


      function getChartWidth():number {
        //return angular.element("#" + chartContext.chartHandle).width();
        return 760;
      }

      function oneTimeChartSetup():void {
        console.log("OneTimeChartSetup");
        // destroy any previous charts
        if (chart) {
          chartParent.selectAll('*').remove();
        }
        chartParent = d3.select(element[0]);
        chart = chartParent.append("svg");

        //tip = d3.tip()
        //  .attr('class', 'd3-tip')
        //  .offset([-10, 0])
        //  .html((d, i) => {
        //    return buildHover(d, i);
        //  });

        svg = chart.append("g")
          .attr("width", width + margin.left + margin.right)
          .attr("height", innerChartHeight)
          .attr("transform", "translate(" + margin.left + "," + (adjustedChartHeight2) + ")");

        //svg.call(tip);

      }


      function determineAvailScale(dataPoints:ITransformedAvailDataPoint[]) {
        var xTicks = 8, xTickSubDivide = 5;

        if (dataPoints) {

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
            .domain(d3.extent(dataPoints, (d:ITransformedAvailDataPoint) => {
              return d.start;
            }));

          xAxis = d3.svg.axis()
            .scale(timeScale)
            .ticks(xTicks)
            .tickSubdivide(xTickSubDivide)
            .tickSize(4, 0)
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
        if (inAvailData && inAvailData[0].timestamp) {
          var previousItem:IAvailDataPoint;

          _.each(inAvailData, (availItem:IAvailDataPoint, i:number) => {
            if (i > 0) {
              previousItem = inAvailData[i - 1];
              outputData.push(new TransformedAvailDataPoint(previousItem.timestamp, availItem.timestamp, availItem.value));
            } else {
              outputData.push(new TransformedAvailDataPoint(availItem.timestamp, availItem.timestamp, availItem.value));
            }

          });
        }
        return outputData;
      }

      function createSideYAxisLabels() {

        svg.append("text")
          .attr("class", "availUpLabel")
          .attr("x", -10)
          .attr("y", 20)
          .style("font-family", "Arial, Verdana, sans-serif;")
          .style("font-size", "14px")
          .attr("fill", "#999")
          .style("text-anchor", "end")
          .text("Up");

        svg.append("text")
          .attr("class", "availDownLabel")
          .attr("x", -10)
          .attr("y", 55)
          .style("font-family", "Arial, Verdana, sans-serif;")
          .style("font-size", "14px")
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
          }),

          availTimeScale = d3.time.scale()
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
            offset = 30;
          }
          return height - yScale(0) + offset;

        }

        function calcBarHeight(d:ITransformedAvailDataPoint) {
          var offset;

          if (isUp(d) || isUnknown(d)) {
            offset = 20;
          } else {
            offset = 50;
          }
          return yScale(0) - offset;

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
          //.attr("opacity", ".90")
          .attr("fill", (d:ITransformedAvailDataPoint) => {
            return calcBarFill(d);
          });

        // create x-axis
        svg.append("g")
          .attr("class", "x axis")
          .attr("fill", "#000")
          .attr("stroke-width", "2px")

          .call(availXAxis);

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



