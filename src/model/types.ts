// Type values and ID types
export type AlertThreshold = number;
export type TimeInMillis = number;
export type UrlType = number;
export type MetricId = string;
export type MetricValue = number;
export type TimeRangeFromNow = number;

export interface FixedTimeRange {
  start: TimeInMillis;
  end?: TimeInMillis;
}

export type TimeRange = TimeRangeFromNow | FixedTimeRange;
export function isFixedTimeRange(timerange: TimeRange, ifTrue: (fixed: FixedTimeRange) => void, ifFalse: (fixed: TimeRangeFromNow) => void) {
  if (timerange.hasOwnProperty('start')) {
    if (ifTrue) {
      ifTrue(<FixedTimeRange>timerange);
    }
    return true;
  } else {
    if (ifFalse) {
      ifFalse(<TimeRangeFromNow>timerange);
    }
    return false;
  }
}

export interface INumericDataPoint {
  timestampSupplier: () => TimeInMillis;
  valueSupplier: () => MetricValue | undefined;
  isEmpty(): boolean;
  isRaw(): boolean;
}

export class NumericDataPoint implements INumericDataPoint {
  public timestamp: TimeInMillis;
  public value: MetricValue;

  constructor(from: NumericDataPoint) {
    this.timestamp = from.timestamp;
    this.value = from.value;
  }

  timestampSupplier = () => this.timestamp;
  valueSupplier = () => this.value;
  isEmpty() { return false; }
  isRaw() { return true; }
}

export class NumericBucketPoint implements INumericDataPoint {
  public start: TimeInMillis;
  public end: TimeInMillis;
  public empty: boolean;
  public avg?: MetricValue;
  public min?: MetricValue;
  public max?: MetricValue;
  public percentile95th?: MetricValue;
  public median?: MetricValue;

  constructor(from: NumericBucketPoint) {
    this.start = from.start;
    this.end = from.end;
    this.empty = from.empty;
    this.avg = from.avg;
    this.min = from.min;
    this.max = from.max;
    this.percentile95th = from.percentile95th;
    this.median = from.median;
  }

  timestampSupplier = () => (this.start + (this.end - this.start) / 2);
  valueSupplier = () => this.avg;
  isEmpty() { return this.empty; }
  isRaw() { return false; }
}

/**
 * Data for predictive 'cone'
 */
export class IPredictiveMetric extends NumericDataPoint {
  min: MetricValue;
  max: MetricValue;
}

/**
 * Data structure for a Multi-Metric chart. Composed of IChartDataDataPoint[].
 */
export interface IMultiDataPoint {
  key: string;
  keyHash?: string; // for using as valid html id
  color?: string; /// #fffeee
  values: INumericDataPoint[];
}
