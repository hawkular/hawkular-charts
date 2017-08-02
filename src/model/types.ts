// Type values and ID types
export type AlertThreshold = number;
export type TimeInMillis = number;
export type UrlType = number;
export type MetricId = string;
export type MetricValue = number;
export type TimeRangeFromNow = number;

declare const moment: any;

export interface FixedTimeRange {
  start: TimeInMillis;
  end?: TimeInMillis;
}

export type TimeRange = TimeRangeFromNow | FixedTimeRange;
export function isFixedTimeRange(timerange: TimeRange) {
  return (timerange.hasOwnProperty('start'));
}
export function getFixedTimeRange(tr: TimeRange): FixedTimeRange {
  if (isFixedTimeRange(tr)) {
    return <FixedTimeRange>tr;
  } else {
    return {
      start: Date.now() - 1000 * <TimeRangeFromNow>tr
    }
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
export class PredictiveMetric extends NumericDataPoint {
  min: MetricValue;
  max: MetricValue;

  constructor(from: PredictiveMetric) {
    super(from);
    this.min = from.min;
    this.max = from.max;
  }
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

export interface IAnnotation {
  timestamp: number;
  severity: string;
}

export interface IAvailDataPoint {
  timestamp: TimeInMillis;
  value: string;
}

export class TransformedAvailDataPoint {
  duration: string;

  constructor(public start: number, public end: number, public value: string) {
    this.updateDuration();
  }

  updateDuration() {
    this.duration = moment(this.end).from(moment(this.start), true);
  }

  isUp(): boolean {
    return this.value === 'up';
  }

  isDown(): boolean {
    return this.value === 'down';
  }

  isUnknown(): boolean {
    return this.value === 'unknown';
  }
}

export class Range {
  constructor(public low: number, public high: number) {
  }

  amplitude(): number {
    return this.high - this.low;
  }

  asD3Range() {
    return [this.low, this.high];
  }

  contains(value: number): boolean {
    return value >= this.low && value <= this.high;
  }
}

export interface Ranges {
  dataRange: Range;
  chartRange: Range;
}
