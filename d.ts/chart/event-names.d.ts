declare namespace Charts {
    class EventNames {
        value: string;
        static CHART_TIMERANGE_CHANGED: EventNames;
        static AVAIL_CHART_TIMERANGE_CHANGED: EventNames;
        static REFRESH_CHART: EventNames;
        static REFRESH_AVAIL_CHART: EventNames;
        constructor(value: string);
        toString(): string;
    }
}
