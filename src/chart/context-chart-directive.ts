/// <reference path='../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';
  import IChartDataPoint = Charts.IChartDataPoint;

  const _module = angular.module('hawkular.charts');

  export class ContextChartDirective {

    private static _CHART_WIDTH = 750;
    private static _CHART_HEIGHT = 50;

    public restrict = 'E';
    public replace = true;

    // Can't use 1.4 directive controllers because we need to support 1.3+
    public scope = {
      data: '=',
      showYAxisValues: '='
    };

    public link: (scope: any, element: ng.IAugmentedJQuery, attrs: any) => void;

    public dataPoints: IChartDataPoint[];

    constructor($rootScope: ng.IRootScopeService) {

      this.link = (scope, element, attrs) => {

        const margin = { top: 0, right: 5, bottom: 5, left: 90 };

        // data specific vars
        let chartHeight = ContextChartDirective._CHART_HEIGHT,
          width = ContextChartDirective._CHART_WIDTH - margin.left - margin.right,
          height = chartHeight - margin.top - margin.bottom,
          innerChartHeight = height + margin.top,
          showYAxisValues: boolean,
          yScale,
          yAxis,
          yAxisGroup,
          timeScale,
          xAxis,
          xAxisGroup,
          brush,
          brushGroup,
          chart,
          chartParent,
          svg;

        if (typeof attrs.showYAxisValues != 'undefined') {
          showYAxisValues = attrs.showYAxisValues === 'true';
        }


        function setup(): void {
          // destroy any previous charts
          if (chart) {
            chartParent.selectAll('*').remove();
          }
          chartParent = d3.select(element[0]);
          chart = chartParent.append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', innerChartHeight)
            .attr('viewBox', '0 0 760 50').attr('preserveAspectRatio', 'xMinYMin meet');

          svg = chart.append('g')
            .attr('transform', 'translate(' + margin.left + ', 0)')
            .attr('class', 'contextChart');

        }


        function createContextChart(dataPoints: IChartDataPoint[]) {
          //console.log('dataPoints.length: ' + dataPoints.length);

          timeScale = d3.time.scale()
            .range([0, width - 10])
            .nice()
            .domain([dataPoints[0].timestamp, dataPoints[dataPoints.length - 1].timestamp]);

          xAxis = d3.svg.axis()
            .scale(timeScale)
            .ticks(5)
            .tickSize(4, 0)
            .tickFormat(xAxisTimeFormats())
            .orient('bottom');

          svg.selectAll('g.axis').remove();

          xAxisGroup = svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + height + ')')
            .call(xAxis);


          let yMin = d3.min(dataPoints, (d) => {
            return d.avg;
          });
          let yMax = d3.max(dataPoints, (d) => {
            return d.avg;
          });

          // give a pad of % to min/max so we are not against x-axis
          yMax = yMax + (yMax * 0.03);
          yMin = yMin - (yMin * 0.05);

          yScale = d3.scale.linear()
            .rangeRound([ContextChartDirective._CHART_HEIGHT - 10, 0])
            .nice()
            .domain([yMin, yMax]);


          let numberOfTicks = showYAxisValues ? 2 : 0;

          yAxis = d3.svg.axis()
            .scale(yScale)
            .ticks(numberOfTicks)
            .tickSize(4, 0)
            .orient("left");

          yAxisGroup = svg.append('g')
            .attr('class', 'y axis')
            .call(yAxis);

          let area = d3.svg.area()
            .interpolate('cardinal')
            .defined((d: any) => {
              return !d.empty;
            })
            .x((d: any) => {
              return timeScale(d.timestamp);
            })
            .y0((d: any) => {
              return height;
            })
            .y1((d: any) => {
              return yScale(d.avg);
            });

          let contextLine = d3.svg.line()
            .interpolate('cardinal')
            .defined((d: any) => {
              return !d.empty;
            })
            .x((d: any) => {
              return timeScale(d.timestamp);
            })
            .y((d: any) => {
              return yScale(d.avg);
            });

          let pathContextLine = svg.selectAll('path.contextLine').data([dataPoints]);

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


          let contextArea = svg.append("g")
            .attr("class", "context");

          contextArea.append("path")
            .datum(dataPoints)
            .transition()
            .duration(500)
            .attr("class", "contextArea")
            .attr("d", area);

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
            let brushExtent = brush.extent(),
              startTime = Math.round(brushExtent[0].getTime()),
              endTime = Math.round(brushExtent[1].getTime()),
              dragSelectionDelta = endTime - startTime;

            /// We ignore drag selections under a minute
            if (dragSelectionDelta >= 60000) {
              $rootScope.$broadcast(EventNames.CONTEXT_CHART_TIMERANGE_CHANGED.toString(), brushExtent);
            }
            //brushGroup.call(brush.clear());
          }
        }

        scope.$watchCollection('data', (newData) => {
          if (newData) {
            this.dataPoints = formatBucketedChartOutput(angular.fromJson(newData));
            scope.render(this.dataPoints);
          }
        });


        function formatBucketedChartOutput(response): IChartDataPoint[] {
          //  The schema is different for bucketed output
          if (response) {
            return response.map((point: IChartDataPoint) => {
              let timestamp: TimeInMillis = point.timestamp || (point.start + (point.end - point.start) / 2);
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


        scope.render = (dataPoints: IChartDataPoint[]) => {
          if (dataPoints && dataPoints.length > 0) {
            //console.time('contextChartRender');

            ///NOTE: layering order is important!
            setup();
            createContextChart(dataPoints);
            createXAxisBrush();
            //console.timeEnd('contextChartRender');
          }
        };
      };
    }

    public static Factory() {
      let directive = ($rootScope: ng.IRootScopeService) => {
        return new ContextChartDirective($rootScope);
      };

      directive['$inject'] = ['$rootScope'];

      return directive;
    }

  }

  _module.directive('hawkularContextChart', ContextChartDirective.Factory());
}
