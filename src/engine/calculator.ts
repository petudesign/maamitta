import { getMessages, type Locale } from '../i18n';
import { formatEur, formatNumber } from './format';
import { getAccuracyMeta } from './geometry';
import type {
  CalculationLine,
  CalculationResult,
  GeometrySource,
  MaterialPreset,
  MeasurementSummary,
} from './types';

export interface CalculatorInput {
  preset: MaterialPreset;
  summary: MeasurementSummary;
  params: Record<string, number>;
  unitPriceEur: number;
  vatRatePct: number;
  /** Optional contractor margin % (0–30), folded into client-facing subtotal */
  marginPct?: number;
  geometrySource?: GeometrySource;
  locale?: Locale;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function readParam(
  params: Record<string, number>,
  preset: MaterialPreset,
  key: string
): number {
  const def = preset.parameters.find((p) => p.key === key);
  const min = def?.min ?? 0;
  const max = def?.max ?? 10_000;
  const val = params[key];
  if (typeof val === 'number' && Number.isFinite(val)) {
    return clamp(val, min, max);
  }
  return clamp(def?.defaultValue ?? 0, min, max);
}

export function calculateEstimate(input: CalculatorInput): CalculationResult {
  const {
    preset,
    summary,
    params,
    unitPriceEur,
    vatRatePct,
    marginPct = 0,
    geometrySource = 'manual',
    locale = 'fi',
  } = input;
  const msg = getMessages(locale).calc;
  const safePrice = clamp(unitPriceEur, 0, 100_000);
  const safeMargin = clamp(marginPct, 0, 30);
  const effectiveUnitPrice = safePrice * (1 + safeMargin / 100);
  const safeVat = clamp(vatRatePct, 0, 50);
  const accuracy = getAccuracyMeta(geometrySource, locale);

  const basisValue =
    preset.basis === 'area' ? summary.effectiveAreaSqm : summary.lineLengthM;
  const basisUnit: 'm²' | 'm' = preset.basis === 'area' ? 'm²' : 'm';

  const lines: CalculationLine[] = [];
  let billableQuantity = 0;
  let billableUnit = msg.pcsUnit;

  switch (preset.id) {
    case 'murske': {
      const depthCm = readParam(params, preset, 'depthCm');
      const density = readParam(params, preset, 'densityTPerM3');
      const wastePct = readParam(params, preset, 'wastePct');
      const truckLoadT = Math.max(1, readParam(params, preset, 'truckLoadT'));

      const rawM3 = basisValue * (depthCm / 100);
      const totalM3 = rawM3 * (1 + wastePct / 100);
      const totalTonnes = totalM3 * density;
      const loads = totalTonnes > 0 ? Math.ceil(totalTonnes / truckLoadT) : 0;

      billableQuantity = totalTonnes;
      billableUnit = 't';

      lines.push(
        {
          label: msg.volumeInclWaste,
          value: `${formatNumber(totalM3, 1, locale)} m³`,
        },
        {
          label: msg.totalWeight,
          value: `${formatNumber(totalTonnes, 1, locale)} t`,
        },
        {
          label: msg.loads(formatNumber(truckLoadT, 0, locale)),
          value: `${loads} ${msg.pcsUnit}`,
        }
      );
      break;
    }

    case 'multa': {
      const depthCm = readParam(params, preset, 'depthCm');
      const wastePct = readParam(params, preset, 'wastePct');
      const totalM3 = basisValue * (depthCm / 100) * (1 + wastePct / 100);
      const bigBags = totalM3 > 0 ? Math.ceil(totalM3) : 0;

      billableQuantity = totalM3;
      billableUnit = 'm³';

      lines.push(
        {
          label: msg.volumeInclCompaction,
          value: `${formatNumber(totalM3, 1, locale)} m³`,
        },
        { label: msg.bigBags, value: `${bigBags} ${msg.pcsUnit}` }
      );
      break;
    }

    case 'kiveys': {
      const wastePct = readParam(params, preset, 'wastePct');
      const sandCm = readParam(params, preset, 'sandCm');
      const palletSqm = Math.max(1, readParam(params, preset, 'palletSqm'));
      const totalSqm = basisValue * (1 + wastePct / 100);
      const pallets = totalSqm > 0 ? Math.ceil(totalSqm / palletSqm) : 0;
      const sandM3 = basisValue * (sandCm / 100) * 1.1;
      const sandTonnes = sandM3 * 1.6;
      const edgingM = summary.perimeterM;

      billableQuantity = totalSqm;
      billableUnit = 'm²';

      lines.push(
        {
          label: msg.paversInclWaste,
          value: `${formatNumber(totalSqm, 1, locale)} m²`,
        },
        {
          label: msg.pallets(formatNumber(palletSqm, 0, locale)),
          value: `${pallets} ${msg.pcsUnit}`,
        },
        {
          label: msg.beddingSand(formatNumber(sandCm, 0, locale)),
          value: `${formatNumber(sandM3, 1, locale)} m³ (${formatNumber(sandTonnes, 1, locale)} t)`,
        },
        {
          label: msg.edgingPerimeter,
          value: `${formatNumber(edgingM, 1, locale)} m`,
        }
      );
      break;
    }

    case 'pihakivi': {
      const wastePct = readParam(params, preset, 'wastePct');
      const totalSqm = basisValue * (1 + wastePct / 100);

      billableQuantity = totalSqm;
      billableUnit = 'm²';

      lines.push(
        { label: msg.netArea, value: `${formatNumber(basisValue, 1, locale)} m²` },
        { label: msg.orderQty, value: `${formatNumber(totalSqm, 1, locale)} m²` }
      );
      break;
    }

    case 'asfaltti': {
      const thicknessMm = readParam(params, preset, 'thicknessMm');
      const wastePct = readParam(params, preset, 'wastePct');
      const totalM3 = basisValue * (thicknessMm / 1000) * (1 + wastePct / 100);
      const totalTonnes = totalM3 * 2.4;
      const loads = totalTonnes > 0 ? Math.ceil(totalTonnes / 15) : 0;

      billableQuantity = basisValue;
      billableUnit = 'm²';

      lines.push(
        { label: msg.netArea, value: `${formatNumber(basisValue, 1, locale)} m²` },
        {
          label: msg.asphaltMass,
          value: `${formatNumber(totalTonnes, 1, locale)} t`,
        },
        {
          label: msg.asphaltLoads15t,
          value: `${loads} ${msg.pcsUnit}`,
        }
      );
      break;
    }

    case 'kaivanto': {
      const depthCm = readParam(params, preset, 'depthCm');
      const swellFactor = readParam(params, preset, 'swellFactor');
      const truckLoadM3 = Math.max(1, readParam(params, preset, 'truckLoadM3'));
      const bankM3 = basisValue * (depthCm / 100);
      const looseM3 = bankM3 * swellFactor;
      const loads = looseM3 > 0 ? Math.ceil(looseM3 / truckLoadM3) : 0;

      billableQuantity = looseM3;
      billableUnit = 'm³';

      lines.push(
        {
          label: msg.inSituVolume,
          value: `${formatNumber(bankM3, 1, locale)} m³`,
        },
        {
          label: msg.looseVolumeSwell,
          value: `${formatNumber(looseM3, 1, locale)} m³`,
        },
        {
          label: msg.haulLoads(formatNumber(truckLoadM3, 0, locale)),
          value: `${loads} ${msg.pcsUnit}`,
        }
      );
      break;
    }

    case 'metsa': {
      const seedlingsPerHa = readParam(params, preset, 'seedlingsPerHa');
      const ha = basisValue / 10_000;
      const seedlings = ha > 0 ? Math.ceil(ha * seedlingsPerHa) : 0;

      billableQuantity = ha;
      billableUnit = 'ha';

      lines.push(
        {
          label: msg.areaHectares,
          value: `${formatNumber(ha, 2, locale)} ha`,
        },
        {
          label: msg.estimatedSeedlings,
          value: `${formatNumber(seedlings, 0, locale)} ${msg.pcsUnit}`,
        }
      );
      break;
    }

    case 'aita': {
      const postSpacingM = Math.max(0.5, readParam(params, preset, 'postSpacingM'));
      const wastePct = readParam(params, preset, 'wastePct');
      const totalLength = basisValue * (1 + wastePct / 100);
      const posts = basisValue > 0 ? Math.ceil(basisValue / postSpacingM) + 1 : 0;

      billableQuantity = totalLength;
      billableUnit = 'm';

      lines.push(
        {
          label: msg.lineLength,
          value: `${formatNumber(basisValue, 1, locale)} m`,
        },
        {
          label: msg.materialInclWaste,
          value: `${formatNumber(totalLength, 1, locale)} m`,
        },
        { label: msg.postsEstimate, value: `${posts} ${msg.pcsUnit}` }
      );
      break;
    }

    case 'kunnossapito': {
      const visits = Math.max(1, readParam(params, preset, 'visits'));
      const perVisitEur = basisValue * effectiveUnitPrice;

      billableQuantity = basisValue * visits;
      billableUnit = 'm²·kerta';

      lines.push(
        {
          label: msg.maintainedArea,
          value: `${formatNumber(basisValue, 0, locale)} m²`,
        },
        {
          label: msg.perVisitExclVat,
          value: formatEur(perVisitEur, locale),
        },
        {
          label: msg.visitsCount,
          value: `${formatNumber(visits, 0, locale)} ${msg.pcsUnit}`,
        }
      );
      break;
    }

    default: {
      billableQuantity = basisValue;
      billableUnit = basisUnit;
      lines.push({
        label: msg.measuredQty,
        value: `${formatNumber(basisValue, 1, locale)} ${basisUnit}`,
      });
    }
  }

  const baseSubtotalEur = billableQuantity * safePrice;
  const subtotalEur = billableQuantity * effectiveUnitPrice;
  const marginEur = subtotalEur - baseSubtotalEur;
  const vatEur = subtotalEur * (safeVat / 100);
  const totalEur = subtotalEur + vatEur;
  const marginRatio = accuracy.marginPct / 100;

  return {
    presetId: preset.id,
    presetName: preset.name,
    basisValue,
    basisUnit,
    billableQuantity,
    billableUnit,
    lines,
    baseSubtotalEur,
    marginPct: safeMargin,
    marginEur,
    subtotalEur,
    vatRatePct: safeVat,
    vatEur,
    totalEur,
    totalMinEur: totalEur * (1 - marginRatio),
    totalMaxEur: totalEur * (1 + marginRatio),
    accuracy,
  };
}
