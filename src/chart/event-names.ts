///
/// Copyright 2015 Red Hat, Inc. and/or its affiliates
/// and other contributors as indicated by the @author tags.
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///    http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// <reference path='../../typings/tsd.d.ts' />

namespace Charts {
  'use strict';

  /// NOTE: this pattern is used because enums cant be used with strings
  export class EventNames {

    public static CHART_TIMERANGE_CHANGED = new EventNames('ChartTimeRangeChanged');
    public static AVAIL_CHART_TIMERANGE_CHANGED = new EventNames('AvailChartTimeRangeChanged');
    public static TIMELINE_CHART_TIMERANGE_CHANGED = new EventNames('TimelineChartTimeRangeChanged');
    public static TIMELINE_CHART_DOUBLE_CLICK_EVENT = new EventNames('TimelineChartDoubleClickEvent');
    public static CONTEXT_CHART_TIMERANGE_CHANGED = new EventNames('ContextChartTimeRangeChanged');
    public static DATE_RANGE_DRAG_CHANGED = new EventNames('DateRangeDragChanged');
    constructor(public value: string) {
      // empty
    }

    public toString(): string {
      return this.value;
    }
  }

}
