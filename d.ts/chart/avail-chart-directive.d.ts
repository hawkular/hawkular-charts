/// <reference path="../../vendor/vendor.d.ts" />
declare namespace Charts {
    /**
     * This is the input data format, directly from Metrics.
     */
    interface IAvailDataPoint {
        timestamp: number;
        value: string;
    }
    /**
     * This is the transformed output data format. Formatted to work with availability chart (basically a DTO).
     */
    interface ITransformedAvailDataPoint {
        start: number;
        end: number;
        value: string;
        startDate?: Date;
        endDate?: Date;
        duration?: string;
        message?: string;
    }
    class TransformedAvailDataPoint implements ITransformedAvailDataPoint {
        start: number;
        end: number;
        value: string;
        startDate: Date;
        endDate: Date;
        duration: string;
        message: string;
        constructor(start: number, end: number, value: string, startDate?: Date, endDate?: Date, duration?: string, message?: string);
    }
    class AvailabilityChartDirective {
        restrict: string;
        replace: boolean;
        scope: {
            data: string;
            startTimestamp: string;
            endTimestamp: string;
            chartHeight: string;
            timeLabel: string;
            dateLabel: string;
            noDataLabel: string;
            chartTitle: string;
        };
        link: (scope: any, element: any, attrs: any) => void;
    }
}
