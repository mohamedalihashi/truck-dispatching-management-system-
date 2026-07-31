export const somaliaLocations = Object.freeze({
  Awdal: ["Baki", "Boorama", "Lughaya", "Saylac"],
  Bakool: ["Ceel Barde", "Rab Dhuure", "Tayeeglow", "Waajid", "Xudur"],
  Banaadir: [
    "Cabdicasiis", "Boondheere", "Dayniile", "Dharkeenley", "Garasbaaley",
    "Heliwaa", "Hodan", "Howlwadaag", "Kaaraan", "Kaxda", "Shangaani",
    "Shibis", "Waaberi", "Wadajir", "Warta Nabadda", "Xamar Jajab",
    "Xamar Weyne", "Yaaqshiid"
  ],
  Bari: ["Bandarbayla", "Boosaaso", "Caluula", "Iskushuban", "Qandala", "Qardho"],
  Bay: ["Baydhabo", "Berdale", "Buur Hakaba", "Diinsoor", "Qansax Dheere"],
  Galgaduud: ["Cabudwaaq", "Cadaado", "Ceel Buur", "Ceel Dheer", "Dhuusamareeb", "Guriceel"],
  Gedo: ["Baardheere", "Beled Xaawo", "Ceel Waaq", "Doolow", "Garbahaarey", "Luuq"],
  Hiiraan: ["Beledweyne", "Buulo Burte", "Jalalaqsi", "Matabaan", "Maxaas"],
  "Jubbada Dhexe": ["Bu'aale", "Jilib", "Saakow"],
  "Jubbada Hoose": ["Afmadow", "Badhaadhe", "Jamaame", "Kismaayo"],
  Mudug: ["Gaalkacyo", "Galdogob", "Hobyo", "Jariiban", "Xarardheere"],
  Nugaal: ["Burtinle", "Eyl", "Garoowe"],
  Sanaag: ["Badhan", "Ceel Afweyn", "Ceerigaabo", "Dhahar", "Laasqoray"],
  "Shabeellaha Dhexe": ["Aadan Yabaal", "Balcad", "Cadale", "Jowhar", "Mahadaay", "Raage Ceele", "Warsheekh"],
  "Shabeellaha Hoose": ["Afgooye", "Baraawe", "Kurtunwaarey", "Marka", "Qoryooley", "Sablaale", "Wanlaweyn"],
  Sool: ["Caynabo", "Laascaanood", "Taleex", "Xudun"],
  Togdheer: ["Burco", "Buuhoodle", "Oodweyne", "Sheekh"],
  "Woqooyi Galbeed": ["Berbera", "Gabiley", "Hargeysa"]
});

export const somaliaRegions = Object.freeze(Object.keys(somaliaLocations));

export function formatSomaliaLocation(neighborhood, district, region) {
  return [neighborhood, district, region].filter(Boolean).join(", ");
}
