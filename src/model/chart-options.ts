import { INumericDataPoint, INamedMetric } from './types'
import { ChartLayout } from './chart-layout'
import { ComputedChartAxis } from './computed-chart-axis'

export class ChartOptions {
  constructor(
    public svg: any, // d3.Selection<any>
    public layout: ChartLayout,
    public axis: ComputedChartAxis,
    public data: INumericDataPoint[],
    public multiData: INamedMetric[],
    public tip?: any,
    public hideHighLowValues?: boolean,
    public interpolation?: string) {
  }
}
