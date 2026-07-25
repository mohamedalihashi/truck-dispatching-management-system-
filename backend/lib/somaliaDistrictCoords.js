/**
 * Approximate district centroids for Somalia (WGS84).
 * Used for pricing distance when bookings include region + district.
 */
export const DISTRICT_COORDS = Object.freeze({
  // Awdal
  baki: { lat: 10.0, lng: 43.78 },
  boorama: { lat: 9.9382, lng: 43.1828 },
  lughaya: { lat: 10.6833, lng: 43.9333 },
  saylac: { lat: 11.3539, lng: 43.4731 },

  // Bakool
  "ceel barde": { lat: 4.7, lng: 43.95 },
  "rab dhuure": { lat: 4.2, lng: 43.85 },
  tayeeglow: { lat: 4.0167, lng: 44.5167 },
  waajid: { lat: 3.8167, lng: 43.25 },
  xudur: { lat: 4.121, lng: 43.888 },

  // Banaadir (Mogadishu districts — offsets around city center)
  cabdicasiis: { lat: 2.045, lng: 45.34 },
  boondheere: { lat: 2.04, lng: 45.33 },
  dayniile: { lat: 2.08, lng: 45.3 },
  dharkeenley: { lat: 2.02, lng: 45.3 },
  garasbaaley: { lat: 2.01, lng: 45.27 },
  heliwaa: { lat: 2.07, lng: 45.35 },
  hodan: { lat: 2.04, lng: 45.31 },
  howlwadaag: { lat: 2.035, lng: 45.325 },
  kaaraan: { lat: 2.055, lng: 45.355 },
  kaxda: { lat: 2.0, lng: 45.28 },
  shangaani: { lat: 2.038, lng: 45.342 },
  shibis: { lat: 2.05, lng: 45.348 },
  waaberi: { lat: 2.03, lng: 45.32 },
  wadajir: { lat: 2.015, lng: 45.31 },
  "warta nabadda": { lat: 2.025, lng: 45.315 },
  "xamar jajab": { lat: 2.033, lng: 45.338 },
  "xamar weyne": { lat: 2.037, lng: 45.335 },
  yaaqshiid: { lat: 2.065, lng: 45.36 },

  // Bari
  bandarbayla: { lat: 9.5, lng: 50.81 },
  boosaaso: { lat: 11.2842, lng: 49.1816 },
  bosaso: { lat: 11.2842, lng: 49.1816 },
  caluula: { lat: 11.9667, lng: 50.75 },
  iskushuban: { lat: 10.2833, lng: 50.2333 },
  qandala: { lat: 11.4667, lng: 49.8667 },
  qardho: { lat: 9.5167, lng: 49.0833 },

  // Bay
  baydhabo: { lat: 3.1167, lng: 43.65 },
  baidoa: { lat: 3.1167, lng: 43.65 },
  berdale: { lat: 2.75, lng: 43.7 },
  "buur hakaba": { lat: 2.7833, lng: 44.0833 },
  diinsoor: { lat: 2.4, lng: 42.9833 },
  "qansax dheere": { lat: 3.0, lng: 43.0 },

  // Galgaduud
  cabudwaaq: { lat: 6.25, lng: 46.2167 },
  cadaado: { lat: 6.15, lng: 46.6333 },
  "ceel buur": { lat: 4.6833, lng: 46.6167 },
  "ceel dheer": { lat: 3.85, lng: 47.1833 },
  dhuusamareeb: { lat: 5.535, lng: 46.386 },

  // Gedo
  baardheere: { lat: 2.35, lng: 42.2833 },
  "beled xaawo": { lat: 3.9333, lng: 41.8667 },
  "ceel waaq": { lat: 2.6333, lng: 41.0167 },
  doolow: { lat: 4.1667, lng: 42.0833 },
  garbahaarey: { lat: 3.3333, lng: 42.2167 },
  luuq: { lat: 3.8, lng: 42.55 },

  // Hiiraan
  beledweyne: { lat: 4.736, lng: 45.203 },
  "buulo burte": { lat: 3.85, lng: 45.5667 },
  jalalaqsi: { lat: 3.3833, lng: 45.6 },
  matabaan: { lat: 5.2, lng: 45.4 },
  maxaas: { lat: 4.4, lng: 45.5 },

  // Jubbada Dhexe
  "bu'aale": { lat: 1.0833, lng: 42.5833 },
  buaale: { lat: 1.0833, lng: 42.5833 },
  jilib: { lat: 0.4833, lng: 42.7833 },
  saakow: { lat: 1.6333, lng: 42.45 },

  // Jubbada Hoose
  afmadow: { lat: 0.5167, lng: 42.0667 },
  badhaadhe: { lat: -0.85, lng: 41.85 },
  jamaame: { lat: 0.0667, lng: 42.75 },
  kismaayo: { lat: -0.3557, lng: 42.5457 },
  kismayo: { lat: -0.3557, lng: 42.5457 },

  // Mudug
  gaalkacyo: { lat: 6.7697, lng: 47.4308 },
  galkayo: { lat: 6.7697, lng: 47.4308 },
  galdogob: { lat: 7.0333, lng: 47.0 },
  hobyo: { lat: 5.35, lng: 48.5167 },
  jariiban: { lat: 7.2167, lng: 48.85 },
  xarardheere: { lat: 4.65, lng: 47.8667 },

  // Nugaal
  burtinle: { lat: 7.9, lng: 48.0 },
  eyl: { lat: 7.9833, lng: 49.8167 },
  garoowe: { lat: 8.4021, lng: 48.4847 },
  garowe: { lat: 8.4021, lng: 48.4847 },

  // Sanaag
  badhan: { lat: 10.7167, lng: 48.3333 },
  "ceel afweyn": { lat: 9.95, lng: 47.2167 },
  ceerigaabo: { lat: 10.6167, lng: 47.3667 },
  erigavo: { lat: 10.6167, lng: 47.3667 },
  dhahar: { lat: 9.7667, lng: 48.8 },
  laasqoray: { lat: 11.1833, lng: 48.2 },

  // Shabeellaha Dhexe
  "aadan yabaal": { lat: 3.55, lng: 46.3167 },
  balcad: { lat: 2.3167, lng: 45.55 },
  cadale: { lat: 2.75, lng: 46.3167 },
  jowhar: { lat: 2.7809, lng: 45.5005 },
  mahadaay: { lat: 2.9667, lng: 45.5333 },
  "raage ceele": { lat: 2.5, lng: 45.9 },
  warsheekh: { lat: 2.3, lng: 45.8 },

  // Shabeellaha Hoose
  afgooye: { lat: 2.1381, lng: 45.1212 },
  baraawe: { lat: 1.1167, lng: 44.0333 },
  kurtunwaarey: { lat: 1.6, lng: 44.35 },
  marka: { lat: 1.7159, lng: 44.7717 },
  qoryooley: { lat: 1.7833, lng: 44.5333 },
  sablaale: { lat: 1.4, lng: 43.85 },
  wanlaweyn: { lat: 2.6167, lng: 44.9 },

  // Sool
  caynabo: { lat: 8.95, lng: 46.85 },
  laascaanood: { lat: 8.4774, lng: 47.3597 },
  lasanod: { lat: 8.4774, lng: 47.3597 },
  taleex: { lat: 9.15, lng: 48.4167 },
  xudun: { lat: 9.1, lng: 47.45 },

  // Togdheer
  burco: { lat: 9.5221, lng: 45.5336 },
  burao: { lat: 9.5221, lng: 45.5336 },
  buuhoodle: { lat: 8.25, lng: 46.3333 },
  oodweyne: { lat: 9.4167, lng: 45.0667 },
  sheekh: { lat: 9.9333, lng: 45.1833 },

  // Woqooyi Galbeed
  berbera: { lat: 10.4396, lng: 45.0143 },
  gabiley: { lat: 9.7, lng: 43.6333 },
  hargeysa: { lat: 9.5624, lng: 44.077 },
  hargeisa: { lat: 9.5624, lng: 44.077 }
});

/** Region-level fallbacks (admin capital / centroid). */
export const REGION_COORDS = Object.freeze({
  awdal: { lat: 9.9382, lng: 43.1828 },
  bakool: { lat: 4.121, lng: 43.888 },
  banaadir: { lat: 2.0469, lng: 45.3182 },
  bari: { lat: 11.2842, lng: 49.1816 },
  bay: { lat: 3.1167, lng: 43.65 },
  galgaduud: { lat: 5.535, lng: 46.386 },
  gedo: { lat: 3.3333, lng: 42.2167 },
  hiiraan: { lat: 4.736, lng: 45.203 },
  "jubbada dhexe": { lat: 1.0833, lng: 42.5833 },
  "jubbada hoose": { lat: -0.3557, lng: 42.5457 },
  mudug: { lat: 6.7697, lng: 47.4308 },
  nugaal: { lat: 8.4021, lng: 48.4847 },
  sanaag: { lat: 10.6167, lng: 47.3667 },
  "shabeellaha dhexe": { lat: 2.7809, lng: 45.5005 },
  "shabeellaha hoose": { lat: 1.7159, lng: 44.7717 },
  sool: { lat: 8.4774, lng: 47.3597 },
  togdheer: { lat: 9.5221, lng: 45.5336 },
  "woqooyi galbeed": { lat: 9.5624, lng: 44.077 }
});
