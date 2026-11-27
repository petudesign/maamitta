import type { MeasurementGeometry } from '../engine/types';

/** Real public parcel in Oulunkylä, Helsinki (MML 91-422-6-59) with its MML building footprint. */
export const DEMO_YARD_PARCEL_CODE = '91-422-6-59';

export const DEMO_YARD_GEOMETRY: MeasurementGeometry = {
  areaPoints: [
    [24.967338, 60.229502],
    [24.967771, 60.229287],
    [24.966879, 60.228833],
    [24.966674, 60.228932],
    [24.966666, 60.228979],
    [24.966972, 60.229132],
    [24.966859, 60.229192],
    [24.966995, 60.229262],
    [24.966933, 60.229292],
  ],
  cutouts: [
    [
      [24.966797, 60.229005],
      [24.967161, 60.229196],
      [24.96735, 60.229106],
      [24.966985, 60.228916],
    ],
  ],
  activeCutout: [],
  linePoints: [],
};
