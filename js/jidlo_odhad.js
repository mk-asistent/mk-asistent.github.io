// Odhad jídla z textu (psaného i diktovaného česky): „3 vejce a chleba s máslem“ → bílkoviny a kcal hned při psaní.
// Doplňky z režimu („elektrolyty“, „kreatin a omega“) se poznají zvlášť – odškrtnou se, do jídla se nepočítají.
// Den z textu („včera“, „v pátek ráno“, „8. 10.“) – denJidla(), rozbor dne z js/rozbor.js (Michal 10. 10.: jídlo ze včerejška
// se zapsalo do dneška). Jen odhad (Claude ho později upřesní). Čisté funkce bez DOM; tabulka se předzpracuje jednou při načtení.
// Porovnává se na slovech bez diakritiky a velkých písmen, skloňování pokrývají kmeny (začátky slov), ne seznam tvarů.

import { denZpet } from './rozbor.js';

const bez = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------- den jídla

export const JIDLO_ZPET_DNI = 14; // jako motor (pitiJidlo): zpátky nejvýš 14 dní, do budoucna nic

/**
 * Na který den jídlo z textu patří – ms půlnoci, nebo null (den v textu není, je v budoucnu nebo víc než 14 dní zpátky).
 * „včera“, „předevčírem“, „v pátek“ = poslední uplynulý pátek (řečeno v pátek = před týdnem), „8. 10.“, „dnes ráno“ = dnes.
 */
export function denJidla(text, ted) {
  const t = ted || Date.now();
  const d = denZpet(text, t);
  const dnes = new Date(t);
  dnes.setHours(0, 0, 0, 0);
  const nejdal = new Date(dnes.getTime());
  nejdal.setDate(nejdal.getDate() - JIDLO_ZPET_DNI);
  return d != null && d <= dnes.getTime() && d >= nejdal.getTime() ? d : null;
}

// ---------------------------------------------------------------- množství, jednotky, slova bez významu

const CISLOVKY = { jeden: 1, jedna: 1, jedno: 1, jednu: 1, jednoho: 1, dva: 2, dve: 2, dvou: 2, dvema: 2, oba: 2, obe: 2, tri: 3, trech: 3,
  ctyri: 4, ctyrech: 4, pet: 5, sest: 6, sedm: 7, osm: 8, devet: 9, deset: 10, pul: 0.5, pulka: 0.5, pulku: 0.5, pulky: 0.5,
  ctvrt: 0.25, ctvrtku: 0.25, par: 2, paru: 2, nekolik: 3 };
const VELIKOST = { velky: 1.5, velka: 1.5, velke: 1.5, velkou: 1.5, velkeho: 1.5, velkym: 1.5, velkych: 1.5, velikou: 1.5, obri: 2,
  vetsi: 1.3, mensi: 0.8, maly: 0.6, mala: 0.6, male: 0.6, malou: 0.6, maleho: 0.6, malym: 0.6, malych: 0.6 };

const JEDNOTKY = {}; // tvar slova → jednotka
[['g', 'g gr gram gramu gramy'], ['dkg', 'dkg deka dek'], ['kg', 'kg kilo kila kil'], ['ml', 'ml'], ['dl', 'dl deci decka decko'],
  ['l', 'l litr litru litry'], ['ks', 'ks kus kusy kusu x krat'], ['krajic', 'krajic krajice krajicu krajicek krajicky krajicku'],
  ['platek', 'platek platky platku platkem'], ['kousek', 'kousek kousky kousku kousicek kousicky'],
  ['hrnek', 'hrnek hrnku hrnky hrnicek hrnicku hrnicky salek salku salky salecek'],
  ['sklenice', 'sklenice sklenici sklenic sklenicka sklenicku sklenicky sklenka sklenku sklenky'], ['talir', 'talir talire taliru talirek talirku'],
  ['miska', 'miska misku misky misek'], ['porce', 'porce porci'], ['lzice', 'lzice lzici lzic'], ['lzicka', 'lzicka lzicku lzicky lzicek'],
  ['kelimek', 'kelimek kelimku kelimky'], ['plechovka', 'plechovka plechovku plechovky plechovek'],
  ['lahev', 'lahev lahve lahvi lahvicka lahvicku flaska flasku flasky'], ['hrst', 'hrst hrsti hrstka hrstku hrsticka hrsticku'],
  ['tabulka', 'tabulka tabulku tabulky'], ['baleni', 'baleni balicek balicku konzerva konzervu konzervy vanicka vanicku'],
  ['pullitr', 'pullitr pullitru pullitry'], ['kopecek', 'kopecek kopecky kopecku'],
  ['davka', 'davka davku davky odmerka odmerku odmerky kapsle kapsli tableta tabletu tablety tablet scoop']
].forEach(([id, tvary]) => tvary.split(' ').forEach((t) => { JEDNOTKY[t] = id; }));
const VAHA = { g: 1, dkg: 10, kg: 1000, ml: 1, dl: 100, l: 1000 }; // přesné jednotky (1 ml ≈ 1 g)

/** Kolik gramů je jedna jednotka u daného jídla (krajíc chleba, plátek šunky, sklenice vína…). */
function gramyJednotky(j, z) {
  if (VAHA[j]) return VAHA[j];
  switch (j) {
    case 'ks': return z.ks || z.porce;
    case 'krajic': return z.pl || 50;
    case 'platek': return z.pl || z.ks || 20;
    case 'kousek': return z.pl || z.ks || 30;
    case 'hrnek': return 250;
    case 'sklenice': return z.sk || 250;
    case 'talir': return z.porce >= 200 ? z.porce : 300;
    case 'miska': return z.mi || 250;
    case 'lzice': return 15;
    case 'lzicka': return 5;
    case 'kelimek': return z.porce <= 300 ? z.porce : 150;
    case 'plechovka': return z.porce >= 500 ? 500 : 330;
    case 'lahev': return z.lah || 500;
    case 'hrst': return 30;
    case 'tabulka': return 100;
    case 'pullitr': return 500;
    case 'kopecek': return 50;
    case 'baleni': return z.bal || z.porce;
    default: return z.porce; // porce, dávka
  }
}

// spojky dělí jídla („chleba s máslem“ = chléb + máslo); hotová jídla se spojkou v názvu jsou v tabulce celá („káva s mlékem“)
const SPOJKY = new Set(['a', 'i', 's', 'se', 'plus', 'pak', 'potom', 'nebo', 'ani', 'and', 'with']);
const KONEC_VETY = new Set(['.', '!', '?', ';', '\n']);
// po předložce následuje popis, ne jídlo: „od babičky“, „k obědu“, „po tréninku“, „do kávy“, „vejce na tvrdo“
const PREDLOZKY = new Set(['od', 'u', 'pro', 'po', 'pred', 'na', 'v', 've', 'do', 'o', 'k', 'ke', 'pri', 'za', 'behem', 'misto', 'krom', 'mimo']);
// slova, která nejsou jídlo ani množství (jak se o jídle mluví)
const NIC = new Set(('dal dala dali dat jsem sem si jsi jsme je jsou byl byla bylo byly mel mela meli mam mame snedl snedla snist jedl jedla jim ' +
  'sezral sezrala spapal vypil vypila pil pila vzal vzala koupil davam dnes dneska vcera rano dopoledne poledne odpoledne vecer noc ' +
  'obed obeda obedu obede obedem snidane snidani snidan svacina svacinu svacine vecere veceri jidlo jidla jidlem jako taky take tez ' +
  'jeste nakonec tomu to ten ta tu tim tech toho nejaky nejaka nejake nejakou nejakeho nejakych neco trochu trosku moc hodne malo cca asi ' +
  'zhruba priblizne kolem skoro aspon jen jenom pouze celkem cely cela cele celou celeho domaci cerstvy cerstva cerstve vlastni dobry ' +
  'dobra dobre super fakt mnam treninku treninkem zapase zapasu praci prace skole doma venku hodin hodiny hodinu hod minut kc korun ' +
  'mi me muj moje moji syrovy syrova syrove syrovou natvrdo namekko ' +
  // den jídla („v pátek ráno“, „předevčírem“, „8. října“) – určí denJidla(), do jídla se nepočítá
  'predevcirem predvcirem vcerejsek vcerejsi vcerejsiho dnesek dnesni dnesniho pondeli utery streda stredu ctvrtek patek sobota sobotu ' +
  'nedele nedeli minuly minulou minule minuleho minulem tyden tydne den dne dni ledna unora brezna dubna kvetna cervna cervence srpna ' +
  'zari rijna listopadu prosince').split(' '));
// doplňky a léky – nikdy jídlo (když nejsou v režimu, jen se přeskočí)
const NEJIDLO = ['elektrolyt', 'kreatin', 'creatin', 'omeg', 'horcik', 'magnes', 'magnez', 'vitamin', 'zinek', 'zinku', 'selen', 'kolagen',
  'probiotik', 'ashwagand', 'melatonin', 'kofein', 'doplnk', 'doplnek', 'pilul', 'prasek', 'madmonq', 'champion', 'kloubn', 'jodid', 'ibalgin', 'paralen'];

// jak se doplňky říkají: vzory v textu → slova, která má doplněk v názvu nebo id (porovnává se začátek slova)
const DOPLNKY_JINAK = [
  ['omeg,rybi olej|tuk,fish oil', 'omeg'],
  ['horcik,magnes,magnez,mg$', 'horcik|magnes|magnez'],
  ['whey,protein$|proteinu$|proteinem$|proteiny$,proteinak,protak,proteinov napoj|drink|shake|koktejl,protein shake|drink,syrovatkov protein', 'whey|protein'],
  ['smoothie,smoothi,smuti', 'smooth'],
  ['kloubn vyziv,kloub,joint,kolagen', 'joint|kloub|kolagen'],
  ['madmonq,madmonk,champion', 'madmonq|champion'],
  ['elektrolyt,iontak,iontov napoj|drink,ionty$,isoton', 'elektrolyt|iont|isoton'],
  ['kreatin,creatin', 'kreatin|creatin'],
  ['vitamin,vit$', 'vitamin'],
  ['zinek,zinku,zinc', 'zinek|zinc'],
  ['kofein,caffein', 'kofein|caffein']
];
// slova z názvu doplňku, která samotná nestačí (jen upřesní: „Joint Complex“, „Vitamín D“)
const OBECNA = new Set(['complex', 'komplex', 'forte', 'plus', 'max', 'extra', 'super', 'premium', 'denni', 'tablety', 'kapsle', 'prasek']);

// tvary přídavných jmen (bez diakritiky): zeleninový, vepřová, čokoládové, jablečný, hovězí, kuřecí, krůtí
const PRIDAVNE = /(ov|sk|ck|cn|zn)(y|a|e|ou|eho|emu|ym|ych|ymi)$|(ec|ez|ut|ehn)(i|iho|imu|im|ich|imi)$/;

// neznámé jídlo – obecný odhad jako sladké pečivo (Claude upřesní)
const NEZNAME = { porce: 100, ks: 100, b: 7, kcal: 300 };

// ---------------------------------------------------------------- tabulka jídel
// [id, název, vzory, typická porce v g (ml), bílkoviny na 100 g, kcal na 100 g, volby]
// vzory: čárka = další vzor, mezera = další slovo, | = varianta, $ = celé slovo (jinak začátek slova = kmen)
// volby: ks = g na kus, pl = g na plátek/krajíc, sk = g na sklenici, mi = g na misku, lah = g na láhev, bal = g na balení,
//   typ 'p' = příloha (nahradí přílohu hotového jídla), pr = [příloha, g, název] výchozí příloha hotového jídla,
//   z = jídlo z přísad („omeleta ze 3 vajec“ – počítají se přísady), vel = násobek pro „velký“, nic = nepočítá se (voda)
// Hodnoty podle běžných nutričních tabulek (USDA, české tabulky), zaokrouhlené – jde o odhad ±20 %.
const JIDLA = [
  // pečivo
  ['chleb', 'Chléb', 'chleb', 50, 8.5, 245, { pl: 50, ks: 50, typ: 'p' }],
  ['toust', 'Toustový chléb', 'toust,toast', 56, 8, 270, { ks: 28, pl: 28 }],
  ['pecivo', 'Pečivo', 'pecivo|peciva|pecivem', 50, 9, 285, { ks: 50 }],
  ['rohlik', 'Rohlík', 'rohl', 43, 9, 290, { ks: 43, typ: 'p' }],
  ['celozrnne', 'Celozrnné pečivo', 'graham|dalaman|kornspitz|vicezrn', 60, 10, 260, { ks: 60 }],
  ['houska', 'Houska', 'housk|housc|bulk|kaiser', 55, 9, 285, { ks: 55, typ: 'p' }],
  ['bageta', 'Bageta obložená', 'baget', 200, 11, 245, { ks: 200 }],
  ['sendvic', 'Sendvič', 'sendvic|sandwich|sandvic', 180, 11, 240, { ks: 180 }],
  ['veka', 'Veka', 'veka$|veky$|veku$|vekou$', 60, 8.5, 265, { pl: 30 }],
  ['krehky', 'Křehký chléb', 'knackebrot|racio,krehk chleb|chlebic,ryzov|kukuric chlebic|plack', 20, 9, 375, { ks: 10 }],
  ['tortilla', 'Tortilla', 'tortil', 60, 8.5, 310, { ks: 60 }],
  ['wrap', 'Wrap', 'wrap|burrit|quesadil', 250, 11, 220, { ks: 250 }],
  ['pita', 'Pita', 'pita$|pitu$|pity$|pitou$', 60, 9, 275, { ks: 60 }],
  ['chlebicek', 'Chlebíček', 'chlebic', 70, 8, 220, { ks: 70 }],
  ['croissant', 'Croissant', 'croissant|croisant|kroasan|krosan', 60, 8, 406, { ks: 60 }],
  ['loupak', 'Loupák', 'loupak|loupac', 60, 8, 340, { ks: 60 }],
  ['kolac', 'Koláč', 'kolac|kolack', 70, 7, 340, { ks: 70 }],
  ['kobliha', 'Kobliha', 'kobli|donut|donat', 65, 6, 380, { ks: 65 }],
  ['vanocka', 'Vánočka', 'vanock|mazanec|mazanc', 50, 8, 330, { pl: 50 }],
  ['babovka', 'Bábovka', 'babovk|babovic', 60, 6, 370, { pl: 60 }],
  ['satecek', 'Šáteček', 'satec', 60, 6, 360, { ks: 60 }],
  ['muffin', 'Muffin', 'muffin|mufin|mafin|cupcake', 80, 5, 380, { ks: 80 }],
  ['strudl', 'Štrúdl', 'strudl|zavin', 120, 4, 260, { pl: 120 }],
  ['zakusek', 'Zákusek', 'zakus|venec|vetrnik|kremrol|rakvick|indianek|laskonk|eclair|ekler|cheesecake|tiramisu|pannacott', 90, 5, 340, { ks: 90 }],
  ['dort', 'Dort', 'dort', 100, 5, 360, { pl: 100, ks: 100 }],
  ['pernik', 'Perník', 'pernik|pernic', 60, 6, 360, { ks: 60, pl: 60 }],
  ['sladke_pecivo', 'Sladké pečivo', 'sladk peciv', 70, 7, 340, { ks: 70 }],
  ['vafle', 'Vafle', 'vafl|waffl', 140, 7, 300, { ks: 70 }],
  ['palacinky', 'Palačinky', 'palacin|pancake', 210, 6, 230, { ks: 70 }],
  ['livance', 'Lívance', 'livan', 160, 7, 230, { ks: 40 }],
  // snídaně
  ['vejce', 'Vejce', 'vejc|vajic|vajec|vajco|vajca', 100, 12.6, 143, { ks: 50 }],
  ['michana', 'Míchaná vejce', 'michan vejc|vajic|vajec,michanic,smazenic', 150, 10, 165, { z: 1 }],
  ['omeleta', 'Omeleta', 'omelet', 150, 10, 160, { z: 1 }],
  ['volske', 'Volské oko', 'volsk ok|oc', 50, 13.5, 195, { ks: 50 }],
  ['hemenex', 'Hemenex', 'hemenex', 150, 14, 200],
  ['vlocky', 'Ovesné vločky', 'vlock|vlocek', 60, 13, 370, { mi: 60 }],
  ['ovesna_kase', 'Ovesná kaše', 'ovesn kas,kase$|kasi$ z$|ze$ vlocek,porridge,overnight', 300, 4.5, 115],
  ['musli', 'Müsli', 'musli|muesli|granol|cereal|cornflak,kukuric lupin', 60, 9, 410, { mi: 60 }],
  ['krupicova', 'Krupicová kaše', 'krupic,ryzov kas', 300, 3.5, 115],
  // mléčné
  ['mleko', 'Mléko', 'mlek|mlik|mlicko|mlecko', 250, 3.4, 47],
  ['kefir', 'Kefír', 'kefir|acidof|acidko|podmasl|zakys|ayran|biokys,kysel mlek', 250, 3.3, 50],
  ['jogurt', 'Jogurt bílý', 'jogurt|jogobel', 150, 4.5, 70],
  ['jogurt_ovocny', 'Ovocný jogurt', 'ovocn|jahodov|vanilkov|smetanov|cokoladov|boruvkov|merunkov|broskvov|kokosov|stracciatel jogurt', 150, 3.5, 100],
  ['jogurt_recky', 'Řecký jogurt', 'reck jogurt,recky$|reckeho$|reckym$|reckou$', 150, 7, 110],
  ['skyr', 'Skyr', 'skyr|skir', 140, 11, 63],
  ['protein_jogurt', 'Proteinový jogurt', 'protein|proteinov jogurt,high$ protein jogurt', 180, 10, 70],
  ['protein_pudink', 'Proteinový pudink', 'protein|proteinov pudin|puding|dezert|krem,high$ protein pudin|puding', 200, 10, 75],
  ['pudink', 'Pudink', 'pudin|puding', 125, 3, 110],
  ['tvaroh', 'Tvaroh polotučný', 'tvaroh', 250, 11, 105, { bal: 250 }],
  ['tvaroh_nizko', 'Tvaroh nízkotučný', 'nizkotucn|odtucnen|libov|light$ tvaroh,tvaroh nizkotucn|odtucnen|libov', 250, 12, 70, { bal: 250 }],
  ['tvarohovy_dezert', 'Tvarohový dezert', 'pribinac|lipanek|lipank|termix,tvarohov dezert|krem|pohar', 100, 6, 160],
  ['tvaruzky', 'Tvarůžky', 'tvaruz', 50, 29, 125],
  ['cottage', 'Cottage', 'cottag|cotage|cotag|kotedz', 150, 12, 100, { bal: 150 }],
  ['syr', 'Sýr', 'syr|eidam|edam|gouda|ementa|cedar|cheddar|maasdam|tylzit', 30, 26, 330, { pl: 20 }],
  ['hermelin', 'Hermelín', 'hermel|camembert|kamember|brie$|niva$|nivy$|nivou$|gorgonzol|plisnov|romadur', 60, 20, 300, { ks: 120 }],
  ['mozzarella', 'Mozzarella', 'mozzarel|mozarel|mocarel|burrat', 125, 18, 250, { ks: 125 }],
  ['taveny', 'Tavený sýr', 'taven|lucin|zervik|philadelph|apetit$,cream$ cheese,smetanov syr', 30, 10, 260],
  ['parmazan', 'Parmazán', 'parmaz|parmez|grana$|parmigian|pecorin', 15, 33, 400],
  ['feta', 'Balkánský sýr', 'balkan|feta$|fetu$|fety$|fetou$|halloum|haloum|encian|brynz', 50, 17, 260],
  ['smetana', 'Smetana', 'smetan', 30, 3, 200],
  ['smetanka', 'Smetana do kávy', 'smetank,smetan do$ kav|kafe', 10, 3, 120],
  ['slehacka', 'Šlehačka', 'slehac', 30, 2.5, 300],
  ['maslo', 'Máslo', 'masl', 10, 0.7, 745],
  ['arasidove', 'Arašídové máslo', 'arasidov|burakov|orechov|mandlov|kesu masl|krem,peanut$ butter', 20, 25, 600],
  ['margarin', 'Margarín', 'margarin|rama$|ramu$|ramou$|flora$', 10, 0.2, 540],
  ['pomazanka', 'Pomazánka', 'pomaz', 40, 8, 250],
  ['majoneza', 'Majonéza', 'majonez|majolk|dresink|dressing|dresing|aioli', 15, 1, 650],
  ['tatarka', 'Tatarská omáčka', 'tatark|tatarsk', 40, 1, 420],
  ['kecup', 'Kečup', 'kecup|ketchup|kecap', 20, 1.5, 110],
  ['horcice', 'Hořčice', 'horcic|mustard', 10, 6, 90],
  ['omacka', 'Omáčka', 'omack|omacek', 100, 2, 100],
  // maso a uzeniny
  ['kure', 'Kuře', 'kure|kurat|kurec|kuretin,kurec mas', 150, 25, 190, { pl: 100 }],
  ['kureci_prsa', 'Kuřecí prsa', 'kurec|kure prs|filet|file$|platk|steak|kousk,prsa$|prsou$|prsick', 150, 23.5, 115, { pl: 120, ks: 150 }],
  ['kureci_stehno', 'Kuřecí stehno', 'kurec|kure steh|palick|paliculk|horn|spodn,stehn|stehyn', 150, 21, 210, { ks: 150 }],
  ['kureci_rizek', 'Kuřecí řízek', 'kurec|kure rizek|rizk|rizecek|rizeck', 150, 22, 240, { ks: 150, pr: ['brambory', 200, 'Kuřecí řízek s bramborem'] }],
  ['rizek', 'Řízek', 'rizek|rizk|rizecek|rizeck|schnitzel,vidensk|veprov rizek|rizk|rizeck', 150, 20, 270, { ks: 150, pr: ['brambory', 200, 'Řízek s bramborem'] }],
  ['nugety', 'Kuřecí nugety', 'nuget|nugget|strips|stripsy|stripy', 120, 15, 280, { ks: 17 }],
  ['kridla', 'Kuřecí křídla', 'kridl|kridel|wings', 250, 18, 250, { ks: 50 }],
  ['krut', 'Krůtí maso', 'krut|kroc', 150, 24, 140, { pl: 100 }],
  ['kachna', 'Kachna', 'kachn|kachen|kacen|husa$|husu$|husy$|husi$', 200, 19, 340],
  ['veprove', 'Vepřové maso', 'vepr|krkovic|plec|kyta$|kytu$|kyty$|kytou$|bucek|bucku', 150, 24, 250, { pl: 120 }],
  ['panenka', 'Vepřová panenka', 'panenk,veprov panenk', 150, 27, 160],
  ['kotleta', 'Kotleta', 'kotlet', 150, 25, 230, { ks: 150 }],
  ['zebra', 'Žebra', 'zebir|zebra$|zebrick|zebirk|ribs$|spare', 300, 18, 290],
  ['koleno', 'Vepřové koleno', 'koleno|kolena|kolinko|kolenem|kolinka', 400, 18, 260],
  ['hovezi', 'Hovězí maso', 'hovez|hovad|rostenk|rostenec|rostenc|rostbif|roastbeef', 150, 27, 220, { pl: 100 }],
  ['steak', 'Steak', 'steak|stejk|biftek|biftk|ribeye', 200, 27, 220, { ks: 200 }],
  ['mlete', 'Mleté maso', 'mlet mas,mlete$|mleteho$', 125, 18, 250],
  ['karbanatek', 'Karbanátek', 'karbanat|fasir|cufty|cufta|frikadel|polpet,masov kul|kouli', 120, 16, 260, { ks: 100 }],
  ['sekana', 'Sekaná', 'sekan', 150, 15, 250, { pl: 120 }],
  ['cevapcici', 'Čevapčiči', 'cevap|cevab', 150, 17, 260, { ks: 30 }],
  ['jatra', 'Játra', 'jatr|jater|jatyrk', 150, 20, 150],
  ['kralik', 'Králík', 'kralik|kralic', 200, 21, 170],
  ['maso', 'Maso', 'maso|masa$|masem|masicko|masu$|masick', 150, 24, 220, { pl: 100 }],
  ['sunka', 'Šunka', 'sunk', 50, 19, 115, { pl: 15 }],
  ['kruti_sunka', 'Krůtí šunka', 'krut|kroc|krocan|kurec|kure sunk', 50, 18, 100, { pl: 15 }],
  ['salam', 'Salám', 'salam|vysocin|herkules|cabajk|pepperon|peperon|chorizo|uherak|polican', 40, 18, 380, { pl: 10 }],
  ['mekky_salam', 'Šunkový salám', 'sunkov salam,junior|gothaj|mortadel,mekk salam', 50, 12, 250, { pl: 15 }],
  ['parky', 'Párky', 'park|parek|parecek|parecky|vursti', 100, 12, 280, { ks: 50 }],
  ['parek_v_rohliku', 'Párek v rohlíku', 'park|parek|parecek v$ rohl,hotdog,hot$ dog|dogu|dogy', 130, 10.5, 280, { ks: 130 }],
  ['klobasa', 'Klobása', 'klobas|klobac|burt|spekac|bratwurst|debrecin|jitrnic|jelit', 120, 13, 320, { ks: 120 }],
  ['tlacenka', 'Tlačenka', 'tlacenk', 100, 15, 250],
  ['slanina', 'Slanina', 'slanin|bacon|spek$|speku$|spekem$', 30, 15, 450, { pl: 10 }],
  ['pastika', 'Paštika', 'pastik|pastet|pate$|majka$|majky$|majku$', 50, 11, 300],
  ['vlassky', 'Vlašský salát', 'vlassk|vlassak|pochoutkov', 100, 6, 250],
  // ryby
  ['tunak', 'Tuňák', 'tunak|tuna$|tunu$', 120, 25, 130, { bal: 120 }],
  ['tunakovy_salat', 'Tuňákový salát', 'tunakov salat|pomaz', 150, 12, 160],
  ['losos', 'Losos', 'losos|salmon', 150, 21, 210, { pl: 100 }],
  ['losos_uzeny', 'Uzený losos', 'uzen losos', 70, 22, 180, { pl: 25 }],
  ['ryba', 'Ryba', 'ryb|tresk|pangas|aljask|tilapi|candat|hejk|kapr|pstruh|dorad|okoun|stik|siven', 150, 18, 120, { pl: 150, ks: 150 }],
  ['ryba_smazena', 'Smažená ryba', 'smazen kapr|ryb|tresk|filet|file', 150, 15, 260],
  ['rybi_prsty', 'Rybí prsty', 'rybi|rybich prst', 140, 12, 230, { ks: 28 }],
  ['makrela', 'Makrela', 'makrel|sled|sledi|slanec|zavinac|rolmops|sardin', 100, 19, 250, { bal: 100 }],
  ['krevety', 'Krevety', 'krevet|garnat|prawn|shrimp|scamp|chobotnic|kalamar|kalmar,morsk plod', 120, 18, 95],
  ['sushi', 'Sushi', 'sushi|susi|maki$|nigiri|onigiri', 240, 6, 150, { ks: 30 }],
  ['poke', 'Poke bowl', 'poke$|pokebowl|bowl$|bowlu$', 450, 8, 140],
  // luštěniny a rostlinné bílkoviny
  ['cocka', 'Čočka', 'cock', 300, 8, 125],
  ['fazole', 'Fazole', 'fazol|beans', 200, 7, 110],
  ['cizrna', 'Cizrna', 'cizrn|chickpea', 150, 8.5, 165],
  ['hrach', 'Hrachová kaše', 'hrach', 250, 6, 115],
  ['hummus', 'Hummus', 'humus|hummus', 60, 8, 220],
  ['tofu', 'Tofu', 'tofu|tofa$|tofem|tempeh|seitan|robi$,sojov mas|kostk|platk|granul', 150, 15, 150],
  ['falafel', 'Falafel', 'falafel', 120, 13, 330, { ks: 20 }],
  // hotová jídla (porce jako v jídelně; pr = výchozí příloha, když text jinou nezmíní)
  ['svickova', 'Svíčková', 'svickov|svicka$', 300, 10, 145, { pr: ['knedlik', 180, 'Svíčková s knedlíkem'] }],
  ['gulas', 'Guláš', 'gulas|perkelt', 280, 10, 150, { pr: ['knedlik', 180, 'Guláš s knedlíkem'] }],
  ['segedin', 'Segedínský guláš', 'segedin', 300, 8, 140, { pr: ['knedlik', 180, 'Segedínský guláš s knedlíkem'] }],
  ['rajska', 'Rajská omáčka s masem', 'rajsk', 300, 7, 130, { pr: ['knedlik', 180, 'Rajská s knedlíkem'] }],
  ['koprovka', 'Koprovka', 'koprov', 300, 4, 110, { pr: ['brambory', 200, 'Koprovka s bramborem'] }],
  ['papriky_plnene', 'Plněné papriky', 'plnen papri|paprik', 350, 7, 130, { pr: ['knedlik', 180, 'Plněné papriky s knedlíkem'] }],
  ['kure_paprika', 'Kuře na paprice', 'kure|kurec|kurat na$ papric|paprik,paprikas', 300, 11, 140, { pr: ['knedlik', 180, 'Kuře na paprice s knedlíkem'] }],
  ['ptacek', 'Španělský ptáček', 'spanelsk ptac|ptak,ptacek|ptacky|ptacku$', 200, 14, 200, { pr: ['ryze', 200, 'Španělský ptáček s rýží'] }],
  ['vepro_knedlo', 'Vepřo knedlo zelo', 'vepro knedl,knedlo zel', 450, 11, 190],
  ['smazeny_syr', 'Smažený sýr', 'smazen syr|hermel,smazak', 150, 18, 320, { ks: 75, pr: ['hranolky', 150, 'Smažený sýr s hranolky'] }],
  ['smazeny_kvetak', 'Smažený květák', 'smazen kvetak', 200, 6, 220],
  ['pizza', 'Pizza', 'pizz|pica$|pici$|picu$|picy$|picou$', 400, 11, 250, { ks: 400, pl: 100 }],
  ['hamburger', 'Hamburger', 'hamburg|burger|burgr', 280, 13, 250, { ks: 280 }],
  ['bigmac', 'Big Mac', 'big mac|mak|macu|macem,bigmac|bigmak', 215, 12, 236, { ks: 215 }],
  ['cheeseburger', 'Cheeseburger', 'cheeseburg|cheesburg|cizburg|cizbur', 115, 13, 260, { ks: 115 }],
  ['hranolky', 'Hranolky', 'hranol|fries|pommes', 150, 3.4, 300, { typ: 'p' }],
  ['kebab', 'Kebab', 'kebab|kebap|gyros|doner|durum|dyrum|shawarm|savarm', 350, 12, 220, { ks: 350 }],
  ['langos', 'Langoš', 'langos', 200, 7, 320, { ks: 200 }],
  ['trdelnik', 'Trdelník', 'trdeln', 120, 6, 380, { ks: 120 }],
  ['bramborak', 'Bramborák', 'bramborak|bramborac|cmund|vosouch', 120, 4, 260, { ks: 120 }],
  ['halusky', 'Halušky', 'halusk|strapack', 350, 8, 210],
  ['noky', 'Noky', 'noky$|noku$|nok$|gnocch|nocky', 250, 4, 150, { typ: 'p' }],
  ['spagety', 'Špagety s omáčkou', 'spaget|spaghet', 350, 6, 150],
  ['bolognese', 'Špagety bolognese', 'bolog|bolon,spaget|spaghet bolog|bolon,spaget|spaghet s$ mas|masovou', 400, 8, 150],
  ['carbonara', 'Carbonara', 'carbonar|karbonar,spaget|spaghet carbonar|karbonar', 350, 10, 210],
  ['lasagne', 'Lasagne', 'lasagn|lazan|lasan', 350, 9, 150],
  ['rizoto', 'Rizoto', 'rizot|risott', 350, 6, 150],
  ['testovinovy_salat', 'Těstovinový salát', 'testovinov|cestovinov salat', 250, 5, 180],
  ['zapecene', 'Zapečené těstoviny', 'zapecen testovin|cestovin|brambor,zapekan', 350, 9, 180],
  ['francouzske', 'Francouzské brambory', 'francouzsk brambor', 350, 7, 160],
  ['cina', 'Čína', 'cin$|cinu$|cina$|ciny$|cinsk|asijsk|thajsk|padthai,pad$ thai', 400, 8, 160],
  ['kung_pao', 'Kung pao', 'kung pao,kungpao', 300, 13, 160, { pr: ['ryze', 200, 'Kung pao s rýží'] }],
  ['buchticky', 'Buchtičky se šodó', 'buchtic|dukatov|sodo$', 300, 6.5, 220],
  ['ovocne_knedliky', 'Ovocné knedlíky', 'ovocn|svestkov|merunkov|jahodov|boruvkov|tvarohov knedl', 280, 6, 230, { ks: 70 }],
  ['knedlik', 'Knedlík', 'knedl,houskov knedl', 180, 7, 225, { ks: 45, pl: 45, typ: 'p' }],
  ['bramborovy_knedlik', 'Bramborový knedlík', 'bramborov knedl', 150, 3.5, 160, { ks: 50, pl: 50, typ: 'p' }],
  ['salat', 'Zeleninový salát', 'salat', 200, 1.5, 60],
  ['recky_salat', 'Řecký salát', 'reck|sopsk|balkan salat,salat s$ balkan|feta|syrem', 250, 4.5, 120],
  ['caesar', 'Caesar salát', 'caesar|cesar|cezar', 300, 9, 160],
  ['bramborovy_salat', 'Bramborový salát', 'bramborov salat', 200, 2.5, 160, { typ: 'p' }],
  ['ovocny_salat', 'Ovocný salát', 'ovocn salat', 200, 0.8, 60],
  // polévky
  ['polevka', 'Polévka', 'polevk|polivk', 300, 2.5, 50],
  ['vyvar', 'Vývar', 'vyvar|bujon,kurec|slepic|hovez|nudlov|drubez polevk|polivk', 300, 3, 35],
  ['bramboracka', 'Bramboračka', 'bramborack,bramborov polevk|polivk', 300, 2, 60],
  ['gulasovka', 'Gulášová polévka', 'gulasovk,gulasov polevk|polivk', 300, 5, 75],
  ['lusteninova', 'Luštěninová polévka', 'cockovk|fazolack|hrachovk,cockov|fazolov|hrachov polevk|polivk', 300, 5, 85],
  ['cesnecka', 'Česnečka', 'cesneck,cesnekov|cesnek polevk|polivk', 300, 2.5, 60],
  ['kulajda', 'Kulajda', 'kulajd', 300, 3, 80],
  ['zelnacka', 'Zelňačka', 'zelnack|kyselic|kyselo$,zeln polevk|polivk', 300, 3.5, 60],
  ['drstkova', 'Dršťková polévka', 'drstk', 300, 6, 70],
  ['krem_polevka', 'Krémová polévka', 'krem|kremov|rajsk|rajcat|rajcatov|dynov|brokolicov|zeleninov|houbov|cibulov polevk|polivk', 300, 2, 60],
  // přílohy
  ['ryze', 'Rýže', 'ryz|basmat|jasminov', 200, 2.7, 130, { typ: 'p' }],
  ['brambory', 'Brambory', 'brambor|zemak|kartof', 200, 2, 80, { ks: 100, typ: 'p' }],
  ['kase', 'Bramborová kaše', 'bramborov kas,kase$|kasi$|kasicka|kasicku|kasickou|pyre$|pure$', 200, 2, 100, { typ: 'p' }],
  ['opekane', 'Opékané brambory', 'opekan|americk|pecen|grilovan|rozmarynov brambor,steakov hranol,rosti|grenail|brambork', 200, 2.5, 160, { typ: 'p' }],
  ['krokety', 'Krokety', 'kroket', 150, 4, 230, { ks: 25, typ: 'p' }],
  ['testoviny', 'Těstoviny', 'testovin|cestovin|makaron|penne|fusill|vrtul|kolink|nudl|tagliatell|farfall|tortellin|ravioli|spatzle|specl', 200, 5.5, 155, { typ: 'p' }],
  ['kuskus', 'Kuskus', 'kuskus|couscous|bulgur|quinoa|quinoi|kinoa|kinoj|pohank|jahl|jahel|kroup|amarant', 200, 4, 120, { typ: 'p' }],
  ['zeli', 'Zelí', 'zeli$|zelim$|zelick|zelo$|kapust', 150, 1.5, 70, { typ: 'p' }],
  // zelenina
  ['zelenina', 'Zelenina', 'zelenin', 150, 1.5, 30],
  ['okurka', 'Okurka', 'okurk|okurek|okurc', 100, 0.7, 15],
  ['rajce', 'Rajče', 'rajc|cherry', 100, 0.9, 18, { ks: 100 }],
  ['paprika', 'Paprika', 'paprik|papric', 100, 1, 30, { ks: 150 }],
  ['mrkev', 'Mrkev', 'mrkev|mrkv|karotk', 80, 0.9, 41, { ks: 80 }],
  ['brokolice', 'Brokolice', 'brokol', 150, 2.8, 34],
  ['kvetak', 'Květák', 'kvetak|kvetac|karfiol', 150, 2, 25],
  ['spenat', 'Špenát', 'spenat', 150, 3, 70],
  ['avokado', 'Avokádo', 'avokad|avocad|guacamol|guakamol', 70, 2, 160, { ks: 140 }],
  ['kukurice', 'Kukuřice', 'kukuric', 100, 3.3, 90],
  ['fazolky', 'Fazolky a hrášek', 'fazolk|lusk|hrasek|hrask|edamam', 150, 3.5, 60],
  ['houby', 'Houby', 'zampion|houb|hrib|hliv', 100, 3, 22],
  ['cibule', 'Cibule', 'cibul|porek|pork$', 50, 1.1, 40],
  ['dalsi_zelenina', 'Zelenina', 'cuket|lilek|lilk|redkv|kedlub|celer|dyne$|dyni$|rukol|polnick|cervena repa|cervenou repu', 150, 1.2, 25],
  // ovoce
  ['banan', 'Banán', 'banan', 120, 1.1, 89, { ks: 120 }],
  ['jablko', 'Jablko', 'jabl|jabk', 170, 0.3, 52, { ks: 170 }],
  ['hruska', 'Hruška', 'hrusk|hrusen', 170, 0.4, 57, { ks: 170 }],
  ['pomeranc', 'Pomeranč', 'pomeranc|grapefruit|grep', 180, 0.9, 47, { ks: 180 }],
  ['mandarinka', 'Mandarinka', 'mandarin|klementin', 160, 0.8, 53, { ks: 80 }],
  ['kiwi', 'Kiwi', 'kiwi|kivi', 75, 1.1, 61, { ks: 75 }],
  ['jahody', 'Jahody', 'jahod', 150, 0.7, 32],
  ['boruvky', 'Borůvky a maliny', 'boruv|blueberr|malin|ostruzin|rybiz|angrest|brusinek', 100, 1, 50],
  ['hrozny', 'Hroznové víno', 'hrozn,hroznov vin,vinn hrozn', 150, 0.7, 69],
  ['meloun', 'Meloun', 'meloun', 300, 0.6, 30, { pl: 300 }],
  ['ananas', 'Ananas', 'ananas', 150, 0.5, 50],
  ['mango', 'Mango', 'mango|manga$|mangem|papaj|marakuj|granatov', 200, 0.8, 60, { ks: 200 }],
  ['broskev', 'Broskev', 'broskev|broskv|nektarin|merunk|merunek', 150, 0.9, 42, { ks: 150 }],
  ['svestky', 'Švestky a třešně', 'svest|slivk|tresn|tresen|visn|visen|fiky|fik$', 150, 0.8, 55],
  ['ovoce', 'Ovoce', 'ovoce|ovocem|ovoci', 150, 0.8, 55],
  ['susene_ovoce', 'Sušené ovoce', 'rozink|datl|brusink,susen ovoc|svestk|merunk|banan|jablk|mang', 40, 2.5, 300],
  ['kompot', 'Kompot', 'kompot|presnidavk|kapsick,ovocn pyre|kapsick', 150, 0.5, 70],
  // ořechy a semínka
  ['orechy', 'Ořechy', 'orech|orisk|mandl|kesu|pistac|arasid|burak|vlasak|para$|pekan|makadam|kokos', 30, 20, 600],
  ['seminka', 'Semínka', 'semin|chia|lnen|slunecnic', 15, 20, 550],
  // sladkosti a slané pochutiny
  ['cokolada', 'Čokoláda', 'cokol|milka$|orion|kinder|lindt|merci', 25, 6, 540, { ks: 25, pl: 10 }],
  ['tycinka', 'Čokoládová tyčinka', 'tycink|tycinek|mars$|snickers|twix|bounty|kitkat|lion$|margot|deli$|fidorka|kofila', 50, 6, 480, { ks: 50 }],
  ['protein_tycinka', 'Proteinová tyčinka', 'protein|proteinov|proteinac tycink|tycinek|bar$|bary$,proteinovk,protein bar', 55, 33, 360, { ks: 55 }],
  ['musli_tycinka', 'Müsli tyčinka', 'musli|muesli|cerealn|ovesn|corny tycink|tycinek,corny$', 30, 6, 420, { ks: 30 }],
  ['susenky', 'Sušenky', 'susen|keks|biskvit|cookie|cukrovi', 50, 6, 480, { ks: 12 }],
  ['oplatky', 'Oplatky', 'oplatk|oplatek|horalk|tatrank|banik|kavenk|mila$|milu$', 50, 6, 520, { ks: 50 }],
  ['bonbony', 'Bonbony', 'bonbon|lizat|zelatin|gumov|haribo|lentilk', 50, 3, 350],
  ['zmrzlina', 'Zmrzlina', 'zmrzl|nanuk|magnum$|gelato|kornout|sorbet', 100, 3.5, 210, { ks: 70 }],
  ['chipsy', 'Chipsy', 'chips|cips|brambur|nachos', 50, 6, 540],
  ['tycky', 'Slané tyčinky', 'tyck|precl|krekr|crackers,slan tycink,bake$ rolls', 40, 10, 400],
  ['med', 'Med', 'med$|medu$|medem$|medik', 20, 0.3, 304],
  ['dzem', 'Džem', 'dzem|marmelad|povidl', 20, 0.4, 250],
  ['nutella', 'Nutella', 'nutel|nugeta|liskoorisk,lisk|cokoladov krem|pomaz', 20, 6, 540],
  ['cukr', 'Cukr', 'cukr', 5, 0, 400],
  // nápoje
  ['pivo', 'Pivo', 'piv|lezak|desitk|dvanact|plzen|plzn|gambrinus|kozel|radegast|branik|staropramen|budvar|ipa$', 500, 0.3, 40, { ks: 500, sk: 500, vel: 1 }],
  ['nealko', 'Nealkoholické pivo', 'nealko|birell,nealko|nealkoholick piv', 500, 0.3, 26, { ks: 500, sk: 500, vel: 1 }],
  ['radler', 'Radler', 'radler,ochucen piv', 500, 0.2, 40, { ks: 500, vel: 1 }],
  ['vino', 'Víno', 'vino|vina$|vinem|vinka|vinko|vinku|vinecko|ryzlink|frankovk|svatovav|veltlin|muller|sauvignon|chardonnay|merlot|cabernet|rulandsk|sekt|prosecc|champagn|sampan', 200, 0.1, 83, { sk: 200, lah: 750 }],
  ['strik', 'Střik', 'strik|spritz|aperol', 300, 0.1, 50],
  ['panak', 'Panák', 'panak|slivovic|vodk|rum$|rumu$|whisk|becher|fernet|tequil|gin$|ginu$|jager|borovick|griotk|liker|absint|tuzemak|metax|brandy|koniak|konak|hruskovic|merunkovic', 40, 0, 230, { ks: 40 }],
  ['koktejl', 'Míchaný drink', 'koktejl|cocktail|mojito|mixovan,pina$ colad,cuba$ libre,gin$ tonic', 250, 0.2, 90],
  ['cola', 'Cola', 'cola$|coly$|colu$|colou$|kola$|koly$|kolu$|kolou$|coca|pepsi|kofol', 330, 0, 42, { ks: 330 }],
  ['cola_zero', 'Cola zero', 'cola|coly|colu|kola$|koly$|kolu$|coca|pepsi|kofol zero|light|max,kofol|cola|coca bez$ cukru', 330, 0, 0.5, { ks: 330 }],
  ['limonada', 'Limonáda', 'limonad|sprite|fanta|tonic|tonik|mirind|nestea|fuze|rauch|sirup|caprio,ledov caj,ice$ tea', 330, 0, 40, { ks: 330 }],
  ['energy', 'Energetický nápoj', 'energy|energetick|redbull|monster|semtex|bigshock,red$ bull,big$ shock', 250, 0, 46, { ks: 250 }],
  ['iontak', 'Iontový nápoj', 'iontak|isoton|powerade|gatorade|isostar,iontov napoj|drink', 500, 0, 25, { ks: 500 }],
  ['dzus', 'Džus', 'dzus|juice|fresh$,jablecn|pomeranc|ovocn dzus|stav', 250, 0.7, 45],
  ['smoothie_jidlo', 'Smoothie', 'smoothie|smoothi|smuti,ovocn smooth', 300, 1, 60],
  ['kakao', 'Kakao', 'kakao|granko|nesquik|ovomaltin,hork|horkou cokolad,cokoladov mlek|napoj', 250, 3.5, 80],
  ['kava', 'Káva', 'kav|kafe|kafi|kafic|espress|presso|americano|lungo|ristrett|turek|turka', 150, 0.1, 2],
  ['kava_mleko', 'Káva s mlékem', 'kav|kaf s$|se$ mlek|mlik|mlic|mlec|smetan,bil kav|kaf,kav|kaf mlek', 250, 0.8, 13],
  ['latte', 'Latte', 'latte|late$|cappucc|capucc|kapucin|capuccin|flatwhite|mocha|macchiat|frappe|frappuccin,flat$ white,ledov kav', 300, 2.5, 45],
  ['caj', 'Čaj', 'caj|caje|caji|cajem|cajik|cajicek', 250, 0, 1],
  ['voda', 'Voda', 'voda|vody|vodu|vodou|vodick|mineralk|mattoni|sodovk|perlivk|neperlivk', 250, 0, 0, { nic: 1 }],
  // proteinové výrobky (Clear Whey a další doplňky z režimu se poznají jako doplněk – tady jen, když v režimu nejsou)
  ['protein_napoj', 'Proteinový nápoj', 'protein$|proteinu$|proteinem$|proteiny$|proteinak|protak|whey,proteinov napoj|drink|shake|koktejl,protein shake|drink,syrovatkov protein', 30, 80, 380],
  ['protein_hotovy', 'Proteinový drink', 'high$ protein drink|napoj|mlek|milk,proteinov mlek|mleko', 250, 10, 65],
  ['protein_pecivo', 'Proteinové pečivo', 'protein|proteinov chleb|rohl|peciv|bulk|housk', 60, 20, 260, { ks: 60 }],
  ['protein_kase', 'Proteinová kaše', 'protein|proteinov kas|kasi|ovesn', 60, 20, 380],
  ['protein_palacinky', 'Proteinové palačinky', 'protein|proteinov palacin|livan|pancake', 150, 15, 220]
];

// ---------------------------------------------------------------- předzpracování (jednou při načtení modulu)

/** Vzory jídla nebo doplňku → index podle prvních dvou písmen prvního slova. */
function indexuj(vzory, cil, index) {
  vzory.split(',').forEach((vzor) => {
    const kroky = vzor.trim().split(/\s+/).map((k) => k.split('|').filter(Boolean)
      .map((s) => (s.endsWith('$') ? { s: s.slice(0, -1), cele: true } : { s, cele: false })));
    const v = { cil, kroky };
    new Set(kroky[0].map((a) => a.s.slice(0, 2))).forEach((k) => (index[k] = index[k] || []).push(v));
  });
}

const PODLE_ID = {}, INDEX_JIDEL = {}, INDEX_JINAK = {};
JIDLA.forEach(([id, nazev, vzory, porce, b, kcal, volby]) => {
  const z = Object.assign({ id, nazev, porce, b, kcal }, volby);
  PODLE_ID[id] = z;
  indexuj(vzory, z, INDEX_JIDEL);
});
DOPLNKY_JINAK.forEach(([vzory, cil]) => indexuj(vzory, cil.split('|'), INDEX_JINAK));

/** Nejdelší vzor (nejvíc slov, pak nejdelší kmeny), který začíná slovem i → { cil, delka } nebo null. */
function najdi(tok, i, index) {
  const t = tok[i];
  const kandidati = t && t.druh === 's' && index[t.t.slice(0, 2)];
  if (!kandidati) return null;
  let nej = null;
  for (const v of kandidati) {
    let znaku = 0, k = 0;
    for (; k < v.kroky.length; k++) {
      const x = tok[i + k];
      if (!x || x.druh !== 's') break;
      let d = -1;
      for (const a of v.kroky[k]) if (a.s.length > d && (a.cele ? x.t === a.s : x.t.startsWith(a.s))) d = a.s.length;
      if (d < 0) break;
      znaku += d;
    }
    if (k === v.kroky.length && (!nej || k > nej.delka || (k === nej.delka && znaku > nej.znaku))) nej = { cil: v.cil, delka: k, znaku };
  }
  return nej;
}

// ---------------------------------------------------------------- doplňky z režimu

const kmen = (s) => { const k = s.replace(/(ami|ech|em|ou|um|[aeiouy])+$/, ''); return k.length >= 4 ? k : s; };
let mezipamet = { klic: null, seznam: [] };

/** Položky režimu → slova, podle kterých se poznají (předzpracuje se znovu jen při změně seznamu). */
function pripravDoplnky(doplnky) {
  const klic = doplnky.map((d) => (d ? [d.id, d.nazev, d.jen, d.kdy].join('|') : '')).join('\n');
  if (klic === mezipamet.klic) return mezipamet.seznam;
  const seznam = doplnky.filter((d) => d && d.id != null && d.id !== '').map((d) => {
    const nazev = bez(d.nazev);
    const slova = (bez(d.id) + ' ' + nazev).replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
      .split(/[^a-z0-9]+/).filter(Boolean);
    const kmeny = [], kratke = new Set(), vypln = new Set(), cisla = new Set();
    slova.forEach((s) => {
      if (/^\d+$/.test(s)) cisla.add(s);
      else if (SPOJKY.has(s) || PREDLOZKY.has(s)) vypln.add(s);
      else if (s.length < 3 || OBECNA.has(s)) kratke.add(s);
      else if (kmeny.indexOf(kmen(s)) < 0) kmeny.push(kmen(s));
    });
    return {
      id: String(d.id), kmeny, kratke, vypln, cisla,
      varianta: /\s(s|se|bez|with)\s/.test(' ' + nazev + ' '), // „MADMONQ s kofeinem“ = varianta základního
      zapasova: d.jen === 'zapas' || d.kdy === 'zapas' || kmeny.indexOf('kofein') >= 0
    };
  });
  mezipamet = { klic, seznam };
  return seznam;
}

/**
 * Doplněk na slově i → { ids, delka } nebo null. Když sedí víc doplňků stejně dobře (dva MADMONQ), rozhodne zápas
 * v textu (→ zápasová varianta, s kofeinem), jinak základní (bez „s …“ v názvu).
 */
function najdiDoplnek(tok, i, seznam, zapas) {
  if (!seznam.length) return null;
  const jinak = najdi(tok, i, INDEX_JINAK);
  const jeKlic = (d, x) => !!x && x.druh === 's' && d.kmeny.some((k) => x.t.startsWith(k));
  let nej = 0, kandidati = [];
  for (const d of seznam) {
    let j;
    if (jinak && d.kmeny.some((k) => jinak.cil.some((c) => k.startsWith(c) || c.startsWith(k)))) j = i + jinak.delka;
    else if (jeKlic(d, tok[i])) j = i + 1;
    else continue;
    // další slova názvu: „Clear Whey“, „Omega 3“, „MADMONQ s kofeinem“
    for (;;) {
      const x = tok[j];
      if (x && (x.druh === 'c' ? d.cisla.has(x.t) : x.druh === 's' && (d.kratke.has(x.t) || jeKlic(d, x)))) { j++; continue; }
      if (x && x.druh === 's' && d.vypln.has(x.t) && jeKlic(d, tok[j + 1])) { j += 2; continue; }
      break;
    }
    if (j - i > nej) { nej = j - i; kandidati = [d]; } else if (j - i === nej) kandidati.push(d);
  }
  if (!nej) return null;
  if (kandidati.length > 1) {
    const vyber = kandidati.filter((d) => (zapas ? d.zapasova : !d.varianta));
    if (vyber.length) kandidati = vyber;
  }
  return { ids: kandidati.map((d) => d.id), delka: nej };
}

// ---------------------------------------------------------------- rozbor textu

const SLOVO = /\d+(?:[.,]\d+)?|\p{L}+|[,;+&\/.!?()\n]/gu;

/** Text → slova (s), čísla (c) a oddělovače (o) s pozicí v textu. */
function rozdel(text) {
  const tok = [];
  for (const m of text.matchAll(SLOVO)) {
    const o = m[0];
    const druh = /\d/.test(o[0]) ? 'c' : /\p{L}/u.test(o[0]) ? 's' : 'o';
    tok.push({ o, t: druh === 's' ? bez(o) : o, od: m.index, do: m.index + o.length, druh });
  }
  return tok;
}

/** Text bez vyjmutých slov: spojky a čárky jen mezi slovy (z několika po vyjmutém doplňku zbude jedna), mezery jednou. */
function uklid(tok, pryc, text) {
  if (!pryc.size) return text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  const spoj = (n) => (tok[n].druh === 'o' && tok[n].o !== '(' && tok[n].o !== ')') || SPOJKY.has(tok[n].t);
  const zbyle = [];
  tok.forEach((x, n) => { if (!pryc.has(n)) zbyle.push(n); });
  const vysl = [];
  for (let k = 0; k < zbyle.length;) {
    if (!spoj(zbyle[k])) { vysl.push(zbyle[k++]); continue; }
    let e = k;
    while (e < zbyle.length && spoj(zbyle[e])) e++;
    if (k > 0 && e < zbyle.length) { // na začátku a na konci pryč, mezi slovy celé, nebo jedna (nový řádek má přednost)
      const beh = zbyle.slice(k, e);
      vysl.push(...(zbyle[e] - zbyle[k - 1] === e - k + 1 ? beh : [beh.find((n) => tok[n].o === '\n') || beh[beh.length - 1]]));
    }
    k = e;
  }
  let s = '';
  vysl.forEach((n, k) => {
    const x = tok[n], p = vysl[k - 1];
    if (k > 0 && x.o !== '\n' && tok[p].o !== '\n') s += p === n - 1 ? text.slice(tok[p].do, x.od).replace(/\s+/g, ' ') : /^[,.;!?)]$/.test(x.o) ? '' : ' ';
    s += x.o;
  });
  return s.trim();
}

/**
 * text → odhad; doplnky = položky režimu [{ id, nazev }] (např. { id: 'elektrolyty', nazev: 'Elektrolyty' })
 * vrací { polozky: [{ co, g, bilkoviny, kcal, znamo }], bilkoviny, kcal, doplnky: [id], text, jisty }
 *   polozky – rozpoznaná jídla (co = hezký český název, g = odhad hmotnosti porce v g, bilkoviny a kcal zaokrouhlené na celé)
 *   doplnky – id doplňků z předaného seznamu, které text zmiňuje (bez duplicit)
 *   text    – text bez doplňků (to, co se uloží jako jídlo), uklizený (čárky, „a“, mezery); '' = byly jen doplňky
 *   jisty   – true, když se rozpoznala všechna jídla (žádné neznámé slovo, které vypadá jako jídlo)
 */
export function odhadniJidlo(text, doplnky = []) {
  const puvodni = String(text == null ? '' : text).normalize('NFC');
  const tok = rozdel(puvodni);
  const seznam = pripravDoplnky(Array.isArray(doplnky) ? doplnky : []);
  const zapas = tok.some((x) => x.druh === 's' && x.t.startsWith('zapas'));
  const polozky = [], ids = [], pryc = new Set();
  let veta = 0, cekajici = null, posledni = null;
  let usek = { jidel: 0, doplnek: false, nezname: [], mnozstvi: null }; // úsek mezi spojkami a čárkami

  // množství na slově i: číslo nebo číslovka (+ „a půl“) (+ jednotka) → { n, j, ti, konec }
  const mnozstvi = (i) => {
    const x = tok[i];
    if (!x) return null;
    let n = x.druh === 'c' ? parseFloat(x.o.replace(',', '.')) : x.druh === 's' && CISLOVKY[x.t] != null ? CISLOVKY[x.t] : null;
    if (n == null || !(n > 0)) return null;
    let k = i + 1;
    if (n >= 1 && tok[k] && tok[k].t === 'a' && tok[k + 1] && tok[k + 1].t === 'pul') { n += 0.5; k += 2; }
    const j = tok[k] && tok[k].druh === 's' && JEDNOTKY[tok[k].t];
    return { n, j: j || null, ti: i, konec: j ? k + 1 : k };
  };
  const gramy = (z, m) => {
    let g = z.porce;
    if (m && m.n != null) g = m.n * (m.j ? gramyJednotky(m.j, z) : z.ks || z.porce);
    if (m && m.nasob) g *= m.nasob > 1 && z.vel ? z.vel : m.nasob;
    return g;
  };
  const pridej = (z, m) => {
    posledni = { z, g: gramy(z, m), veta };
    polozky.push(posledni);
    usek.jidel++;
  };
  const zavriUsek = () => {
    if (cekajici && cekajici.j === 'krajic') pridej(PODLE_ID.chleb, cekajici); // „2 krajíce s máslem“ = chleba
    if (!usek.jidel && !usek.doplnek && usek.nezname.length) {
      const nazev = usek.nezname.map((x) => x.o).join(' ');
      polozky.push({ z: null, nazev: nazev.charAt(0).toUpperCase() + nazev.slice(1), g: gramy(NEZNAME, usek.mnozstvi), veta });
    }
    usek = { jidel: 0, doplnek: false, nezname: [], mnozstvi: null };
    cekajici = null;
  };
  // přeskočí popis („od babičky“, „do kávy“, „bez cukru a mléka“, „z pomerančů“) → index za ním
  const preskoc = (k, iDalsi) => {
    for (;;) {
      const q = mnozstvi(k);
      if (q) k = q.konec;
      const f = najdi(tok, k, INDEX_JIDEL);
      if (!f) return tok[k] && tok[k].druh === 's' && !SPOJKY.has(tok[k].t) ? k + 1 : k;
      k += f.delka;
      const za = mnozstvi(k);
      if (za && za.j) k = za.konec;
      // další jídlo ve 2. pádě za „a“ patří do popisu taky („bez cukru a mléka“, „z banánu a jahod“)
      const a = tok[k], y = tok[k + 1];
      if (!iDalsi || !a || !y || !/^(a|i|ani|nebo)$/.test(a.t) || y.druh !== 's' || !/[auyei]$/.test(y.t) || !najdi(tok, k + 1, INDEX_JIDEL)) return k;
      k++;
    }
  };

  let i = 0;
  while (i < tok.length) {
    const x = tok[i];
    if (x.druh === 'o') {
      zavriUsek();
      posledni = null;
      if (KONEC_VETY.has(x.o)) veta++;
      i++;
      continue;
    }
    const jedn = x.druh === 's' && JEDNOTKY[x.t];
    const m = mnozstvi(i) || (jedn && !VAHA[jedn] && jedn !== 'ks' ? { n: 1, j: jedn, ti: i, konec: i + 1 } : null); // „hrnek kávy“
    if (m) {
      cekajici = Object.assign({ nasob: cekajici && cekajici.nasob }, m, { ti: cekajici ? cekajici.ti : m.ti });
      i = m.konec;
      continue;
    }
    if (x.druh === 'c') { i++; continue; }
    if (VELIKOST[x.t]) { cekajici = Object.assign(cekajici || { ti: i }, { nasob: VELIKOST[x.t] }); i++; continue; }
    if (SPOJKY.has(x.t)) { zavriUsek(); posledni = null; i++; continue; }
    if (x.t === 'z' || x.t === 'ze') {
      const q = mnozstvi(i + 1);
      const f = najdi(tok, q ? q.konec : i + 1, INDEX_JIDEL);
      if (f && posledni && posledni.z && posledni.z.z) { // „omeleta ze 3 vajec“ – počítají se přísady
        posledni.zrusena = true;
        usek.jidel--;
        posledni = null;
        i++;
      } else if (f && !posledni) i++;                     // „ze 3 vajec omeleta“ – přísady jako jídla
      else i = preskoc(i + 1, true);                      // „džus z pomerančů“, „smoothie z banánu“, „z pekárny“ – jen popis
      continue;
    }
    if (PREDLOZKY.has(x.t) || x.t === 'bez') { i = preskoc(i + 1, x.t === 'bez'); continue; }
    if (NIC.has(x.t)) { i++; continue; }

    const d = najdiDoplnek(tok, i, seznam, zapas);
    const f = najdi(tok, i, INDEX_JIDEL);
    if (d && (!f || d.delka >= f.delka)) {
      let k = i + d.delka;
      const za = mnozstvi(k); // „kreatin 5 g“, „omega 2 kapsle“
      if (za && !najdi(tok, za.konec, INDEX_JIDEL)) k = za.konec;
      d.ids.forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
      // z textu pryč i s množstvím před ním a s „dal jsem si“ / „ráno“ na začátku úseku
      let od = cekajici ? cekajici.ti : i, b = od - 1;
      while (b >= 0 && tok[b].druh === 's' && (NIC.has(tok[b].t) || PREDLOZKY.has(tok[b].t))) b--;
      if (b < 0 || tok[b].druh === 'o' || SPOJKY.has(tok[b].t)) od = b + 1;
      for (let n = od; n < k; n++) pryc.add(n);
      usek.doplnek = true;
      cekajici = null;
      posledni = { doplnek: true };
      i = k;
      continue;
    }
    // přídavné jméno před jiným jídlem jen upřesňuje („hovězí guláš“, „zeleninový salát“, „tvarohový koláč“)
    if (f && f.delka === 1 && PRIDAVNE.test(x.t) && najdi(tok, i + 1, INDEX_JIDEL)) { i++; continue; }
    if (f) {
      let k = i + f.delka, mm = cekajici;
      if (!mm || mm.n == null) {
        // množství za jídlem: „tvaroh 250g“, „vejce 3“, „rohlík 2x“; číslo bez jednotky před dalším jídlem patří k němu
        const za = mnozstvi(k);
        if (za && (VAHA[za.j] || !najdi(tok, za.konec, INDEX_JIDEL))) { mm = Object.assign({}, mm, za); k = za.konec; }
      }
      pridej(f.cil, mm);
      cekajici = null;
      i = k;
      continue;
    }
    if (!NEJIDLO.some((s) => x.t.startsWith(s)) && x.t.length >= 2) {
      if (!usek.nezname.length) usek.mnozstvi = cekajici;
      usek.nezname.push(x);
    }
    i++;
  }
  zavriUsek();

  // hotové jídlo s přílohou: příloha zmíněná hned vedle (ve stejné větě) nahradí výchozí („svíčková s 6 knedlíky“)
  const jidla = polozky.filter((p) => !p.zrusena);
  jidla.forEach((p, n) => {
    if (!p.z || !p.z.pr) return;
    const q = [jidla[n + 1], jidla[n - 1]].find((q) => q && q.veta === p.veta && q.z && q.z.typ === 'p' && !q.kJidlu);
    if (q) q.kJidlu = true;
    else if (PODLE_ID[p.z.pr[0]]) p.sPrilohou = { z: PODLE_ID[p.z.pr[0]], g: p.z.pr[1], nazev: p.z.pr[2] };
  });
  const vysledek = jidla.filter((p) => !(p.z && p.z.nic)).map((p) => {
    const z = p.z || NEZNAME, s = p.sPrilohou;
    const g = p.g + (s ? s.g : 0);
    const b = (p.g * z.b + (s ? s.g * s.z.b : 0)) / 100;
    const kcal = (p.g * z.kcal + (s ? s.g * s.z.kcal : 0)) / 100;
    return { co: s ? s.nazev : p.z ? z.nazev : p.nazev, g: Math.round(g), bilkoviny: Math.round(b), kcal: Math.round(kcal), znamo: !!p.z };
  });
  return {
    polozky: vysledek,
    bilkoviny: vysledek.reduce((s, p) => s + p.bilkoviny, 0),
    kcal: vysledek.reduce((s, p) => s + p.kcal, 0),
    doplnky: ids,
    text: ids.length && !jidla.length ? '' : uklid(tok, pryc, puvodni),
    jisty: !jidla.some((p) => !p.z)
  };
}

export const _test = { pocetJidel: JIDLA.length, PODLE_ID };
