import { Ranges } from './types'

declare const d3: any;

export interface ComputedChartAxis extends Ranges {
  xAxis: any;
  yAxis: any;
  timeScale: any; // d3.time.Scale<number, number>
  yScale: any; // d3.scale.Linear<number, number>
}
