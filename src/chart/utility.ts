/// <reference path='../../vendor/vendor.d.ts' />

namespace Charts {
  'use strict';


  export function xAxisTimeFormats() {
    return d3.time.format.multi([
      [".%L", (d) => {
        return d.getMilliseconds();
      }],
      [":%S", (d) => {
        return d.getSeconds();
      }],
      ["%H:%M", (d) => {
        return d.getMinutes()
      }],
      ["%H:%M", (d) => {
        return d.getHours();
      }],
      ["%a %d", (d) => {
        return d.getDay() && d.getDate() != 1;
      }],
      ["%b %d", (d) => {
        return d.getDate() != 1;
      }],
      ["%B", (d) => {
        return d.getMonth();
      }],
      ["%Y", () => {
        return true;
      }]
    ]);
  }


}
