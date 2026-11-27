import type { MaterialPreset } from '../engine/types';
import type { Locale } from '../i18n/types';

/** Suomen vakio-ALV 25,5 % */
export const DEFAULT_VAT_RATE_PCT = 25.5;

const FINLAND_PRESETS: MaterialPreset[] = [
  {
    id: 'murske',
    name: 'Murske / sora',
    shortDesc: 'm³, tonnit ja kuormat',
    basis: 'area',
    defaultUnitPriceEur: 28,
    unitPriceLabel: 'Hinta / tonni (alv 0 %)',
    parameters: [
      {
        key: 'depthCm',
        label: 'Kerrospaksuus',
        unit: 'cm',
        defaultValue: 15,
        min: 2,
        max: 100,
        step: 1,
      },
      {
        key: 'densityTPerM3',
        label: 'Tiheys',
        unit: 't/m³',
        defaultValue: 1.7,
        min: 1.2,
        max: 2.2,
        step: 0.05,
      },
      {
        key: 'wastePct',
        label: 'Hukka / tiivistymä',
        unit: '%',
        defaultValue: 10,
        min: 0,
        max: 40,
        step: 1,
      },
      {
        key: 'truckLoadT',
        label: 'Kuormakoko',
        unit: 't',
        defaultValue: 12,
        min: 3,
        max: 40,
        step: 1,
      },
    ],
  },
  {
    id: 'multa',
    name: 'Multa / kuorikate',
    shortDesc: 'Kuutiot ja 1 m³ suursäkit',
    basis: 'area',
    defaultUnitPriceEur: 42,
    unitPriceLabel: 'Hinta / m³ (alv 0 %)',
    parameters: [
      {
        key: 'depthCm',
        label: 'Kerrospaksuus',
        unit: 'cm',
        defaultValue: 10,
        min: 2,
        max: 60,
        step: 1,
      },
      {
        key: 'wastePct',
        label: 'Tiivistymävara',
        unit: '%',
        defaultValue: 15,
        min: 0,
        max: 40,
        step: 1,
      },
    ],
  },
  {
    id: 'kiveys',
    name: 'Pihakiveys',
    shortDesc: 'Kivet, lavat, hiekka & reunat',
    basis: 'area',
    defaultUnitPriceEur: 38,
    unitPriceLabel: 'Hinta / m² (alv 0 %)',
    parameters: [
      {
        key: 'wastePct',
        label: 'Leikkausvara',
        unit: '%',
        defaultValue: 8,
        min: 0,
        max: 30,
        step: 1,
      },
      {
        key: 'sandCm',
        label: 'Asennushiekka',
        unit: 'cm',
        defaultValue: 4,
        min: 2,
        max: 15,
        step: 1,
      },
      {
        key: 'palletSqm',
        label: 'Kiviä / lava',
        unit: 'm²',
        defaultValue: 10,
        min: 4,
        max: 20,
        step: 1,
      },
    ],
  },
  {
    id: 'pihakivi',
    name: 'Siirtonurmi',
    shortDesc: 'Neliöt + leikkausvara',
    basis: 'area',
    defaultUnitPriceEur: 14,
    unitPriceLabel: 'Hinta / m² (alv 0 %)',
    parameters: [
      {
        key: 'wastePct',
        label: 'Hukka / leikkausvara',
        unit: '%',
        defaultValue: 8,
        min: 0,
        max: 30,
        step: 1,
      },
    ],
  },
  {
    id: 'asfaltti',
    name: 'Asfaltointi',
    shortDesc: 'Paksuus, tonnit ja kuormat',
    basis: 'area',
    defaultUnitPriceEur: 26,
    unitPriceLabel: 'Hinta / m² (alv 0 %)',
    parameters: [
      {
        key: 'thicknessMm',
        label: 'Paksuus',
        unit: 'mm',
        defaultValue: 50,
        min: 25,
        max: 150,
        step: 5,
      },
      {
        key: 'wastePct',
        label: 'Hukka',
        unit: '%',
        defaultValue: 5,
        min: 0,
        max: 20,
        step: 1,
      },
    ],
  },
  {
    id: 'kaivanto',
    name: 'Kaivanto / maansiirto',
    shortDesc: 'Irtokuutiot ja poisajot',
    basis: 'area',
    defaultUnitPriceEur: 18,
    unitPriceLabel: 'Hinta / m³ (alv 0 %)',
    parameters: [
      {
        key: 'depthCm',
        label: 'Kaivusyvyys',
        unit: 'cm',
        defaultValue: 40,
        min: 10,
        max: 300,
        step: 5,
      },
      {
        key: 'swellFactor',
        label: 'Paisuntakerroin',
        unit: '×',
        defaultValue: 1.3,
        min: 1.0,
        max: 1.6,
        step: 0.05,
      },
      {
        key: 'truckLoadM3',
        label: 'Lavan tilavuus',
        unit: 'm³',
        defaultValue: 12,
        min: 4,
        max: 30,
        step: 1,
      },
    ],
  },
  {
    id: 'metsa',
    name: 'Metsä / pelto',
    shortDesc: 'Hehtaarit ja taimimäärä',
    basis: 'area',
    defaultUnitPriceEur: 650,
    unitPriceLabel: 'Hinta / ha (alv 0 %)',
    parameters: [
      {
        key: 'seedlingsPerHa',
        label: 'Taimitiheys',
        unit: 'kpl/ha',
        defaultValue: 1800,
        min: 500,
        max: 4000,
        step: 100,
      },
    ],
  },
  {
    id: 'aita',
    name: 'Aita / rajalinja',
    shortDesc: 'Juoksumetrit ja tolpat',
    basis: 'line',
    defaultUnitPriceEur: 45,
    unitPriceLabel: 'Hinta / m (alv 0 %)',
    parameters: [
      {
        key: 'postSpacingM',
        label: 'Tolppaväli',
        unit: 'm',
        defaultValue: 2.5,
        min: 1,
        max: 5,
        step: 0.1,
      },
      {
        key: 'wastePct',
        label: 'Materiaalivara',
        unit: '%',
        defaultValue: 5,
        min: 0,
        max: 25,
        step: 1,
      },
    ],
  },
  {
    id: 'kunnossapito',
    name: 'Auraus / nurmikonleikkuu',
    shortDesc: 'Neliöpohjainen kausiarvio',
    basis: 'area',
    defaultUnitPriceEur: 0.35,
    unitPriceLabel: 'Hinta / m² / kerta',
    parameters: [
      {
        key: 'visits',
        label: 'Käyntikerrat / kausi',
        unit: 'kpl',
        defaultValue: 15,
        min: 1,
        max: 60,
        step: 1,
      },
    ],
  },
];

const EN_PRESET_TEXT: Record<
  string,
  {
    name: string;
    shortDesc: string;
    unitPriceLabel: string;
    params: Record<string, { label: string; unit?: string }>;
  }
> = {
  murske: {
    name: 'Gravel / stone',
    shortDesc: 'm³, tonnes & loads',
    unitPriceLabel: 'Price / tonne (excl. VAT)',
    params: {
      depthCm: { label: 'Layer depth' },
      densityTPerM3: { label: 'Density' },
      wastePct: { label: 'Waste / compaction' },
      truckLoadT: { label: 'Truck load size' },
    },
  },
  multa: {
    name: 'Topsoil / mulch',
    shortDesc: 'm³ & 1 m³ bulk bags',
    unitPriceLabel: 'Price / m³ (excl. VAT)',
    params: {
      depthCm: { label: 'Layer depth' },
      wastePct: { label: 'Compaction' },
    },
  },
  kiveys: {
    name: 'Stone paving',
    shortDesc: 'Pavers, pallets, sand & edging',
    unitPriceLabel: 'Price / m² (excl. VAT)',
    params: {
      wastePct: { label: 'Cutting allowance' },
      sandCm: { label: 'Bedding sand' },
      palletSqm: { label: 'Area / pallet' },
    },
  },
  pihakivi: {
    name: 'Sod / lawn',
    shortDesc: 'Area + cutting allowance',
    unitPriceLabel: 'Price / m² (excl. VAT)',
    params: {
      wastePct: { label: 'Cutting allowance' },
    },
  },
  asfaltti: {
    name: 'Asphalt paving',
    shortDesc: 'Thickness, tonnes & loads',
    unitPriceLabel: 'Price / m² (excl. VAT)',
    params: {
      thicknessMm: { label: 'Thickness' },
      wastePct: { label: 'Waste' },
    },
  },
  kaivanto: {
    name: 'Excavation / haul',
    shortDesc: 'Loose m³ & haul loads',
    unitPriceLabel: 'Price / m³ (excl. VAT)',
    params: {
      depthCm: { label: 'Dig depth' },
      swellFactor: { label: 'Swell factor' },
      truckLoadM3: { label: 'Truck capacity' },
    },
  },
  metsa: {
    name: 'Forest / field',
    shortDesc: 'Hectares & seedlings',
    unitPriceLabel: 'Price / ha (excl. VAT)',
    params: {
      seedlingsPerHa: { label: 'Seedlings / ha', unit: '/ha' },
    },
  },
  aita: {
    name: 'Fencing / boundary',
    shortDesc: 'Running meters & posts',
    unitPriceLabel: 'Price / m (excl. VAT)',
    params: {
      postSpacingM: { label: 'Post spacing' },
      wastePct: { label: 'Material allowance' },
    },
  },
  kunnossapito: {
    name: 'Snow plowing / mowing',
    shortDesc: 'Seasonal area contract',
    unitPriceLabel: 'Price / m² / visit',
    params: {
      visits: { label: 'Visits / season', unit: '×' },
    },
  },
};

export function getPresets(locale: Locale = 'fi'): MaterialPreset[] {
  if (locale === 'fi') return FINLAND_PRESETS;
  return FINLAND_PRESETS.map((preset) => {
    const tr = EN_PRESET_TEXT[preset.id];
    if (!tr) return preset;
    return {
      ...preset,
      name: tr.name,
      shortDesc: tr.shortDesc,
      unitPriceLabel: tr.unitPriceLabel,
      parameters: preset.parameters.map((p) => ({
        ...p,
        label: tr.params[p.key]?.label ?? p.label,
        unit: tr.params[p.key]?.unit ?? p.unit,
      })),
    };
  });
}

export function getPresetById(id: string, locale: Locale = 'fi'): MaterialPreset {
  const list = getPresets(locale);
  return list.find((preset) => preset.id === id) ?? list[0]!;
}

export function getDefaultParamValues(
  preset: MaterialPreset
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const param of preset.parameters) {
    values[param.key] = param.defaultValue;
  }
  return values;
}
