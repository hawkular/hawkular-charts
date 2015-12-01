/// <reference path='../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';

  declare let angular:ng.IAngularStatic;

  declare let d3:any;
  declare let console:any;

  const Y_AXIS_HEIGHT = 25;


  let _module = angular.module('hawkular.charts');


  export class SparklineChartDirective {

    private static _CHART_WIDTH = 300;
    private static _CHART_HEIGHT = 80;

    public restrict = 'E';
    public replace = true;

    public scope = {
      data: '=',
      showYAxisValues: '=',
      showXAxisValues: '='
    };

    public link:(scope:any, element:ng.IAugmentedJQuery, attrs:any) => void;

    public dataPoints:IChartDataPoint[];

    constructor($rootScope:ng.IRootScopeService) {

      this.link = (scope, element, attrs) => {

        const margin = {top: 10, right: 5, bottom: 5, left: 35};

        // data specific vars
        let chartHeight = SparklineChartDirective._CHART_HEIGHT,
          width = SparklineChartDirective._CHART_WIDTH - margin.left - margin.right,
          height = chartHeight - margin.top - margin.bottom,
          innerChartHeight = height + margin.top,
          showXAxisValues:boolean,
          showYAxisValues:boolean,
          yScale,
          yAxis,
          yAxisGroup,
          timeScale,
          xAxis,
          xAxisGroup,
          chart,
          chartParent,
          svg;

        if (typeof attrs.showXAxisValues != 'undefined') {
          showXAxisValues = attrs.showXAxisValues === 'true';
        }

        if (typeof attrs.showYAxisValues != 'undefined') {
          showYAxisValues = attrs.showYAxisValues === 'true';
        }


        function setup():void {
          // destroy any previous charts
          if (chart) {
            chartParent.selectAll('*').remove();
          }
          chartParent = d3.select(element[0]);
          chart = chartParent.append('svg')
            .attr('viewBox', '0 0 ' + (width + margin.left + margin.right) + ' ' + (height + margin.top + margin.bottom
              + Y_AXIS_HEIGHT ))
            .attr('preserveAspectRatio', 'xMinYMin meet');

          svg = chart.append('g')
            .attr('width', width + margin.left + margin.right)
            .attr('height', innerChartHeight)
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        }


        function createSparklineChart(dataPoints:IChartDataPoint[]) {
          console.log('dataPoints.length: ' + dataPoints.length);

          timeScale = d3.time.scale()
            .range([0, width - 10])
            .domain([dataPoints[0].timestamp, dataPoints[dataPoints.length - 1].timestamp]);


          let numberOfXTicks = showXAxisValues ? 5 : 0;

          xAxis = d3.svg.axis()
            .scale(timeScale)
            .ticks(numberOfXTicks)
            .tickSize(4, 0)
            .orient('bottom');

          svg.selectAll('g.axis').remove();

          xAxisGroup = svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + height + ')')
            .call(xAxis);


          let yMin = d3.min(dataPoints, (d)  => {
            return d.avg;
          });
          let yMax = d3.max(dataPoints, (d) => {
            return d.avg;
          });

          // give a pad of % to min/max so we are not against x-axis
          yMax = yMax + (yMax * 0.03);
          yMin = yMin - (yMin * 0.05);

          yScale = d3.scale.linear()
            .rangeRound([SparklineChartDirective._CHART_HEIGHT, 0])
            .domain([yMin, yMax]);

          let numberOfYTicks = showYAxisValues ? 3 : 0;

          yAxis = d3.svg.axis()
            .scale(yScale)
            .ticks(numberOfYTicks)
            .tickSize(4, 0)
            .orient("left");

          yAxisGroup = svg.append('g')
            .attr('class', 'y axis')
            .call(yAxis);

          let interpolationType = 'basis';
          let area = d3.svg.area()
            .interpolate(interpolationType)
            .defined((d) => {
              return !d.empty;
            })
            .x((d:IChartDataPoint) => {
              return timeScale(d.timestamp);
            })
            .y0((d:IChartDataPoint) => {
              return SparklineChartDirective._CHART_HEIGHT - 15;
            })
            .y1((d:IChartDataPoint) => {
              return yScale(d.avg);
            });

          // this is the line that caps the area
          let sparklineLine = d3.svg.line()
            .interpolate(interpolationType)
            .defined((d) => {
              return !d.empty;
            })
            .x((d) => {
              return timeScale(d.timestamp);
            })
            .y((d) => {
              return yScale(d.avg);
            });

          let pathSparklineLine = svg.selectAll('path.sparklineLine')
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


          let sparklineArea = svg.append("g")
            .attr("class", "sparkline");

          sparklineArea.append("path")
            .datum(dataPoints)
            .transition()
            .duration(500)
            .attr("class", "sparklineArea")
            .attr("d", area);

        }


        scope.$watchCollection('data', (newData) => {
          console.log('Sparkline Chart Data Changed');
          if (newData) {
            this.dataPoints = formatBucketedChartOutput(angular.fromJson(newData));
            scope.render(this.dataPoints);
          }
        });


        function formatBucketedChartOutput(response):IChartDataPoint[] {
          //  The schema is different for bucketed output
          if (response) {
            return response.map((point:IChartDataPoint) => {
              let timestamp:TimeInMillis = point.timestamp || (point.start + (point.end - point.start) / 2);
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


        scope.render = (dataPoints:IChartDataPoint[]) => {
          if (dataPoints && dataPoints.length > 0) {
            console.group('Render Sparkline Chart');
            console.time('SparklineChartRender');
            ///NOTE: layering order is important!
            setup();
            createSparklineChart(dataPoints);
            console.timeEnd('SparklineChartRender');
            console.groupEnd();
          }
        };
      };
    }

    public static Factory() {
      let directive = ($rootScope:ng.IRootScopeService) => {
        return new SparklineChartDirective($rootScope);
      };

      directive['$inject'] = ['$rootScope'];

      return directive;
    }

  }

  _module.directive('hawkularSparklineChart', SparklineChartDirective.Factory());
}



