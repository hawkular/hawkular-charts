import { INumericDataPoint, IMultiDataPoint } from './types'

export class ChartOptions {
  constructor(public svg: any,
    public timeScale: (x: number) => any,
    public yScale: (y?: number) => any,
    public chartData: INumericDataPoint[],
    public multiChartData: IMultiDataPoint[],
    public modifiedInnerChartHeight: number,
    public height: number,
    public tip?: any,
    public visuallyAdjustedMax?: number,
    public hideHighLowValues?: boolean,
    public interpolation?: string) {
  }
}
