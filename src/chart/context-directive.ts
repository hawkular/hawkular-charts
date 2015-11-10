/// <reference path='../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

  declare let angular:ng.IAngularStatic;

  declare let d3:any;
  declare let console:any;


  let _module = angular.module('hawkular.charts');


  export class ContextChartDirective {

    public restrict = 'E';
    public replace = true;

    // Can't use 1.4 directive controllers because we need to support 1.3+
    public scope = {
      data: '=',
      timeLabel: '@',
      dateLabel: '@',
      noDataLabel: '@',
    };

    public link:(scope:any, element:ng.IAugmentedJQuery, attrs:any) => void;

    public transformedDataPoints:ITransformedAvailDataPoint[];

    constructor($rootScope:ng.IRootScopeService) {

      this.link = (scope, element, attrs) => {

        // data specific vars
        let startTimestamp:number = +attrs.startTimestamp,
          endTimestamp:number = +attrs.endTimestamp,
          chartHeight = +attrs.chartHeight || 150,
          noDataLabel = attrs.noDataLabel || 'No Data';

        const titleHeight = 30,
          titleSpace = 10;

        // chart specific vars
        let margin = {top: 10, right: 5, bottom: 5, left: 90},
          width = 750 - margin.left - margin.right,
          adjustedChartHeight = chartHeight - 50,
          height = adjustedChartHeight - margin.top - margin.bottom,
          innerChartHeight = height + margin.top - titleHeight - titleSpace,
          adjustedChartHeight2 = +titleHeight + titleSpace + margin.top,
          yScale,
          timeScale,
          yAxis,
          xAxis,
          xAxisGroup,
          brush,
          brushGroup,
          timeScaleForBrush,
          chart,
          chartParent,
          svg;

        function getChartWidth():number {
          ///return angular.element('#' + chartContext.chartHandle).width();
          return 760;
        }


        function setup():void {
          // destroy any previous charts
          if (chart) {
            chartParent.selectAll('*').remove();
          }
          chartParent = d3.select(element[0]);
          chart = chartParent.append('svg')
            .attr('viewBox', '0 0 760 150').attr('preserveAspectRatio', 'xMinYMin meet');


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

        }


        function determineContextScale(transformedAvailDataPoint:ITransformedAvailDataPoint[]) {
          let adjustedTimeRange:number[] = [];

          startTimestamp = +attrs.startTimestamp || d3.min(transformedAvailDataPoint, (d:ITransformedAvailDataPoint) => {
              return d.start;
            }) || +moment().subtract(1, 'year');

          if (transformedAvailDataPoint && transformedAvailDataPoint.length > 0) {

            adjustedTimeRange[0] = startTimestamp;
            adjustedTimeRange[1] = +moment(); // @TODO: Fix when we support end != now

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
                [".%L", (d) => {
                  return d.getMilliseconds();
                }],
                [":%S", (d) => {
                  return d.getSeconds();
                }],
                ["%H:%M", (d) => {
                  return d.getMinutes()
                }],
                ["%H:%M", (d) => {
                  return d.getHours();
                }],
                ["%a %d", (d) => {
                  return d.getDay() && d.getDate() != 1;
                }],
                ["%b %d", (d) => {
                  return d.getDate() != 1;
                }],
                ["%B", (d) => {
                  return d.getMonth();
                }],
                ["%Y", () => {
                  return true;
                }]
              ]));
          }
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


        function createAvailabilityChart(transformedAvailDataPoint:ITransformedAvailDataPoint[]) {
          let xAxisMin = d3.min(transformedAvailDataPoint, (d:ITransformedAvailDataPoint) => {
              return +d.start;
            }),
            xAxisMax = d3.max(transformedAvailDataPoint, (d:ITransformedAvailDataPoint) => {
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
              return 'url(#diagonal-stripes)'; // gray stripes
            } else {
              return '#D85054'; // red
            }
          }

          svg.selectAll('rect.availBars')
            .data(transformedAvailDataPoint)
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
            .attr('opacity', () => {
              return 0.85;
            })
            .on('mouseover', (d, i) => {
              tip.show(d, i);
            }).on('mouseout', () => {
              tip.hide();
            });

          // The bottom line of the availability chart
          svg.append('line')
            .attr("x1", 0)
            .attr("y1", 70)
            .attr("x2", 655)
            .attr("y2", 70)
            .attr("stroke-width", 0.5)
            .attr("stroke", "#D0D0D0");

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

          xAxisGroup.append('g')
            .attr('class', 'x brush')
            .call(brush)
            .selectAll('rect')
            .attr('y', 0)
            .attr('height', 70);

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
              console.log('Drag: AvailTimeRangeChanged:' + extent);
              $rootScope.$broadcast(EventNames.CONTEXT_CHART_TIMERANGE_CHANGED.toString(), extent);
            }
            brushGroup.call(brush.clear());
          }
        }

        scope.$watchCollection('data', (newData) => {
          console.log('Context Chart Data Changed');
          if (newData) {
            this.transformedDataPoints = formatTransformedDataPoints(angular.fromJson(newData));
            scope.render(this.transformedDataPoints);
          }
        });



        scope.render = (transformedAvailDataPoint:ITransformedAvailDataPoint[]) => {
          console.log('Starting Context Chart Directive Render');
          if (transformedAvailDataPoint && transformedAvailDataPoint.length > 0) {
            console.group('Render Context Chart');
            console.time('contextChartRender');
            ///NOTE: layering order is important!
            setup();
            determineContextScale(transformedAvailDataPoint);
            createXandYAxes();
            createAvailabilityChart(transformedAvailDataPoint);
            createXAxisBrush();
            console.timeEnd('contextChartRender');
            console.groupEnd();
          }
        };
      };
    }

    public static Factory() {
      let directive = ($rootScope:ng.IRootScopeService) => {
        return new ContextChartDirective($rootScope);
      };

      directive['$inject'] = ['$rootScope'];

      return directive;
    }

  }

  _module.directive('contextChart', ContextChartDirective.Factory());
}



