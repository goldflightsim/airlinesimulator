// Embedded game data.
// These mirror the CSV files in /data — edit either, but if you edit the CSV
// files, also paste the updated contents in here, since the game reads from
// these strings (avoids browser fetch/CORS issues when opening index.html
// directly as a local file).

const AIRPORTS_CSV = `iata,icao,name,city,country,country_code,lat,lon,population,gdp_index,runway_m,size
GRU,SBGR,São Paulo-Guarulhos International Airport,São Paulo,Brazil,BR,-23.4356,-46.4731,12330000,1.1,3700,major
CGH,SBSP,Congonhas Airport,São Paulo,Brazil,BR,-23.6261,-46.6564,12330000,1,1940,major
GIG,SBGL,Galeão International Airport,Rio de Janeiro,Brazil,BR,-22.81,-43.2506,6748000,1,4000,major
SDU,SBRJ,Santos Dumont Airport,Rio de Janeiro,Brazil,BR,-22.9102,-43.1631,6748000,1,1323,large
BSB,SBBR,Brasília International Airport,Brasília,Brazil,BR,-15.8697,-47.9172,3055000,1,3300,major
VCP,SBKP,Viracopos International Airport,Campinas,Brazil,BR,-23.0074,-47.1344,1214000,1,3240,major
CNF,SBCF,Belo Horizonte-Confins International Airport,Belo Horizonte,Brazil,BR,-19.6244,-43.9719,2722000,1,3600,major
CWB,SBCT,Afonso Pena International Airport,Curitiba,Brazil,BR,-25.5317,-49.1761,1964000,1,2218,large
POA,SBPA,Salgado Filho International Airport,Porto Alegre,Brazil,BR,-29.9939,-51.1711,1488000,1,3200,large
REC,SBRF,Recife/Guararapes International Airport,Recife,Brazil,BR,-8.1264,-34.9228,1653000,1,3007,major
SSA,SBSV,Salvador International Airport,Salvador,Brazil,BR,-12.9086,-38.3225,2886000,1,3005,large
FOR,SBFZ,Fortaleza International Airport,Fortaleza,Brazil,BR,-3.7761,-38.5325,2687000,1,2755,large
MAO,SBEG,Eduardo Gomes International Airport,Manaus,Brazil,BR,-3.0386,-60.0506,2219000,1,2700,large
BEL,SBBE,Val-de-Cans International Airport,Belém,Brazil,BR,-1.3792,-48.4762,1500000,1,2800,large
GYN,SBGO,Goiânia International Airport,Goiânia,Brazil,BR,-16.6325,-49.2211,1536000,1,2500,large
VIX,SBVT,Eurico de Aguiar Salles Airport,Vitória,Brazil,BR,-20.2581,-40.2864,365855,1,2058,large
FLN,SBFL,Florianópolis International Airport,Florianópolis,Brazil,BR,-27.6703,-48.5461,508826,1,2400,large
CGB,SBCY,Marechal Rondon International Airport,Cuiabá,Brazil,BR,-15.6528,-56.1167,618124,1,2300,large
CGR,SBCG,Campo Grande International Airport,Campo Grande,Brazil,BR,-20.4686,-54.6725,897938,1,2600,large
MCZ,SBMO,Zumbi dos Palmares International Airport,Maceió,Brazil,BR,-9.5108,-35.7917,1025360,1,2601,large
NAT,SBSG,Natal International Airport,Natal,Brazil,BR,-5.7689,-35.3664,890480,1,3000,large
SLZ,SBSL,Marechal Cunha Machado International Airport,São Luís,Brazil,BR,-2.5869,-44.2361,1108975,1,2340,large
SJK,SBSJ,São José dos Campos Airport,São José dos Campos,Brazil,BR,-23.2289,-45.8711,729737,1,2676,regional
JOI,SBJV,Joinville-Lauro Carneiro de Loyola Airport,Joinville,Brazil,BR,-26.2231,-48.7978,597658,1.2,1640,regional
NVT,SBNF,Ministro Victor Konder International Airport,Navegantes,Brazil,BR,-26.8786,-48.6514,83626,1,1701,regional
RAO,SBRP,Ribeirão Preto State Airport,Ribeirão Preto,Brazil,BR,-21.1364,-47.7767,711825,1,2100,regional
UDI,SBUL,Uberlândia Airport,Uberlândia,Brazil,BR,-18.8836,-48.2253,699097,1,2100,regional
LDB,SBLO,Londrina Airport,Londrina,Brazil,BR,-23.3303,-51.1303,575377,1,2100,regional
IGU,SBFI,Foz do Iguaçu International Airport,Foz do Iguaçu,Brazil,BR,-25.5978,-54.4858,258248,1,2195,regional
BVB,SBBV,Boa Vista International Airport,Boa Vista,Brazil,BR,2.8414,-60.6922,419659,1,2700,regional
PMW,SBPJ,Palmas Brigadeiro Lysias Rodrigues Airport,Palmas,Brazil,BR,-10.29,-48.3578,306296,1,2500,regional
RBR,SBRB,Rio Branco International Airport,Rio Branco,Brazil,BR,-9.9522,-67.8944,413417,1,2158,regional
PVH,SBPV,Porto Velho International Airport,Porto Velho,Brazil,BR,-8.7094,-63.9025,539354,1,2400,regional
MCP,SBMQ,Macapá International Airport,Macapá,Brazil,BR,0.0508,-51.0703,512902,1,2100,regional
AJU,SBAR,Aracaju-Santa Maria Airport,Aracaju,Brazil,BR,-10.9847,-37.0733,664908,1,2200,regional
THE,SBTE,Teresina Airport,Teresina,Brazil,BR,-5.0606,-42.8244,868075,1,2200,regional
JPA,SBJP,João Pessoa Airport,João Pessoa,Brazil,BR,-7.1483,-34.9503,817511,1,2515,regional
BPS,SBPS,Porto Seguro Airport,Porto Seguro,Brazil,BR,-16.4378,-39.0778,150658,1,2000,regional
IOS,SBIL,Ilhéus Jorge Amado Airport,Ilhéus,Brazil,BR,-14.8153,-39.0331,159923,1,1577,regional
JDO,SBJU,Juazeiro do Norte Airport,Juazeiro do Norte,Brazil,BR,-7.2186,-39.2703,276264,1,1800,regional
CPV,SBKG,Campina Grande Airport,Campina Grande,Brazil,BR,-7.2694,-35.8892,411807,1,1600,regional
MOC,SBMK,Montes Claros Airport,Montes Claros,Brazil,BR,-16.7061,-43.8219,413487,1,2100,regional
SJP,SBSR,São José do Rio Preto Airport,São José do Rio Preto,Brazil,BR,-20.8161,-49.4056,464983,1,1640,regional
PMG,SBPP,Ponta Porã International Airport,Ponta Porã,Brazil,BR,-22.5494,-55.7033,92526,1,2000,regional
STM,SBSN,Santarém International Airport,Santarém,Brazil,BR,-2.4247,-54.7869,306480,1,2400,regional
MAB,SBMA,Marabá Airport,Marabá,Brazil,BR,-5.3686,-49.1381,283542,1,2000,regional
CZS,SBCZ,Cruzeiro do Sul International Airport,Cruzeiro do Sul,Brazil,BR,-7.5994,-72.7686,89072,1,2400,regional
PHB,SBPI,Parnaíba International Airport,Parnaíba,Brazil,BR,-2.8933,-41.7317,153075,1,2500,regional
PET,SBPK,Pelotas International Airport,Pelotas,Brazil,BR,-31.7178,-52.3283,343132,1,1980,regional
CXJ,SBCX,Hugo Cantergiani Regional Airport,Caxias do Sul,Brazil,BR,-29.1956,-51.1889,517451,1,1670,regional
XAP,SBCH,Chapecó Airport,Chapecó,Brazil,BR,-27.1339,-52.6564,224013,1,2063,regional
JJG,SBJA,Humberto Ghizzo Bortoluzzi Regional Airport,Jaguaruna,Brazil,BR,-28.6739,-49.0667,20235,1,2500,regional
SMG,SBSM,Santa Maria Airport,Santa Maria,Brazil,BR,-29.7114,-53.6881,283677,1,2700,regional
URG,SBUG,Ruben Berta International Airport,Uruguaiana,Brazil,BR,-29.7825,-57.0367,126866,1,1500,regional
IMP,SBIZ,Imperatriz Airport,Imperatriz,Brazil,BR,-5.5306,-47.4586,259980,1,1796,regional
MGF,SBMG,Maringá Regional Airport,Maringá,Brazil,BR,-23.4794,-52.0122,430154,1,2100,regional
CAC,SBCA,Cascavel Airport,Cascavel,Brazil,BR,-24.9892,-53.5008,332333,1,1780,regional
IPN,SBIP,Usiminas Airport,Ipatinga,Brazil,BR,-19.4697,-42.4878,265409,1,2004,regional
JTC,SBBU,Bauru-Arealva State Airport,Bauru,Brazil,BR,-22.1578,-49.0683,379297,15,2100,regional
VAG,SBVG,Varginha Major Brigadeiro Trompowsky Airport,Varginha,Brazil,BR,-21.5903,-45.4731,136602,1,2100,regional
JFK,KJFK,John F. Kennedy International Airport,New York,United States,US,40.6398,-73.7789,8336000,1,4423,major
LHR,EGLL,London Heathrow Airport,London,United Kingdom,GB,51.47,-0.4543,8982000,1,3902,major
CDG,LFPG,Charles de Gaulle Airport,Paris,France,FR,49.0097,2.5479,2148000,1,4215,major
EZE,SAEZ,Ministro Pistarini International Airport,Buenos Aires,Argentina,AR,-34.8222,-58.5358,3008000,1,3300,large
MIA,KMIA,Miami International Airport,Miami,United States,US,25.7933,-80.2906,442241,1,3962,major`;

const AIRPLANES_CSV = `manufacturer,family,model,category,max_capacity,range_km,cruise_kmh,fuel_burn_kgph,min_runway_m,price_new_usd
Airbus,A220,A220-100,large,133,5460,830,1900,1463,42000000
Airbus,A220,A220-300,large,160,6300,830,2100,1690,48000000
Airbus,A320,A319,narrowbody,156,6850,828,2400,1850,50000000
Airbus,A320,A320,narrowbody,195,6300,828,2500,2100,58000000
Airbus,A320,A320neo,narrowbody,195,6500,833,2200,1600,68000000
Airbus,A320,A321neo,narrowbody,244,7400,833,2500,2210,78000000
Airbus,A330,A330-200,widebody,247,13450,871,5800,2500,145000000
Airbus,A330,A330-300,widebody,277,11750,871,6200,2770,155000000
Airbus,A330,A330-900neo,widebody,287,13334,871,5400,2770,185000000
Airbus,A340,A340-300,widebody,295,13350,880,7200,2900,120000000
Airbus,A340,A340-600,widebody,380,13900,880,9500,3300,135000000
Airbus,A350,A350-900,widebody,325,15000,903,6000,2600,240000000
Airbus,A350,A350-1000,widebody,366,16100,903,6700,2800,275000000
Airbus,A380,A380-800,widebody,555,14800,903,11000,3000,400000000
Boeing,737,737-700,narrowbody,149,6370,842,2200,1830,52000000
Boeing,737,737-800,narrowbody,189,5765,842,2500,2000,63000000
Boeing,737,737 MAX 8,narrowbody,210,6570,839,2300,2000,75000000
Boeing,747,747-400,widebody,416,13450,920,11500,3000,150000000
Boeing,747,747-8,widebody,467,14310,920,11000,3100,310000000
Boeing,757,757-200,narrowbody,200,7250,850,3600,2200,80000000
Boeing,757,757-300,narrowbody,243,6295,850,3900,2470,85000000
Boeing,767,767-300ER,widebody,269,11070,851,5300,2600,135000000
Boeing,767,767-400ER,widebody,304,10415,851,5600,2900,150000000
Boeing,777,777-200ER,widebody,314,13080,905,6800,2600,230000000
Boeing,777,777-300ER,widebody,396,13650,905,7700,3000,290000000
Boeing,777,777-9,widebody,426,13550,905,7400,3100,370000000
Boeing,787,787-8,widebody,242,13530,903,5400,2600,200000000
Boeing,787,787-9,widebody,290,14140,903,5700,2800,230000000
Boeing,787,787-10,widebody,330,11750,903,6000,2800,260000000
Embraer,ERJ,ERJ145,large,50,2800,750,1200,1600,18000000
Embraer,E1,E175,large,88,3700,828,1700,1450,30000000
Embraer,E1,E190,large,106,4537,829,1900,1600,38000000
Embraer,E1,E195,large,124,4260,829,2000,1650,42000000
Embraer,E2,E175-E2,large,90,3735,833,1600,1370,40000000
Embraer,E2,E190-E2,large,114,5278,833,1750,1450,48000000
Embraer,E2,E195-E2,large,146,4800,833,1850,1600,54000000
Comac,ARJ21,ARJ21-700,large,90,3700,828,1900,1700,35000000
Comac,C919,C919,narrowbody,158,5555,834,2400,1700,60000000
Bombardier,CRJ,CRJ700,large,78,3045,828,1700,1453,25000000
Bombardier,CRJ,CRJ900,large,90,2956,870,1850,1719,32000000
Bombardier,CRJ,CRJ1000,large,104,3004,870,2000,1850,36000000`;
