import { Ranges, D3ScaleFunc } from './types'

export interface ComputedChartAxis extends Ranges {
  xAxis: any;
  yAxis: any;
  timeScale: D3ScaleFunc<number>;
  yScale: D3ScaleFunc<number>;
}
