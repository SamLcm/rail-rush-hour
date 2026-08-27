# Rail Rush Hour — Release Safety Register

Dit document is verplicht onderdeel van de developerfase. Alles met 🟡 of 🔴 moet vóór een publieke App Store / Play Store release opnieuw worden beoordeeld.

## Statuslabels

- 🟢 RELEASE SAFE — eigen code, eigen naamgeving, eigen graphics of generieke spelmechaniek.
- 🟡 REFERENCE — bewust sterk gebaseerd op conventies uit bestaande idle-station games; vóór release opnieuw ontwerpen of voldoende eigen identiteit geven.
- 🔴 REPLACE BEFORE RELEASE — mag niet ongewijzigd naar een publieke release.

## v0.20 Reference Tycoon Build

| Onderdeel | Status | Actie vóór release |
|---|---|---|
| React Native broncode in AppV20.js | 🟢 | Eigen implementatie; mag technisch blijven. |
| Reizigerspipeline Entry → Ticket → Security → Gate → Platform → Train | 🟡 | Generieke gameplaystructuur, maar in release sterker verweven met Rail Rush Hour-bestemmingen, dienstregeling en overstappen. |
| Bottleneck-detectie en upgrades | 🟢 | Generieke tycoonmechaniek. |
| Grote vertrekuitbetaling bij volle trein | 🟡 | Mechaniek mag blijven; balans, presentatie en effecten eigen maken. |
| Manager / automatisering | 🟢 | Generieke idle-mechaniek; Rail Rush Hour-specifieke taken toevoegen. |
| Missies / claim-beloningen | 🟡 | Eigen teksten, doelen en beloningsstructuur verder uitwerken. |
| Huidige station-layout | 🟡 | Tijdelijke reference-compositie; later eigen architectonische identiteit en uitbreidingslogica ontwerpen. |
| Huidige tijdelijke stationgraphics | 🔴 | Voor release vervangen door definitieve Rail Rush Hour-art direction/assets. |
| Huidige tijdelijke treinweergave | 🔴 | Voor release vervangen door eigen consistente treinsets/sprites. |
| Huidige tijdelijke iconen/emoji in UI | 🔴 | Vervangen door eigen iconenset. |
| Huidige kleur-/kaartpresentatie van upgradebalk | 🟡 | Definitieve UI-stijl ontwerpen en consistent maken met Rail Rush Hour. |
| Namen Noorddam / Havenstad / Oostpoort / Luchthaven | 🟢 | Eigen fictieve bestemmingen. |
| Rail Rush Hour-naam en operationele vertrekbeslissing | 🟢 | Kernidentiteit behouden en verder uitbouwen. |

## v0.22 Level One Reference Build

| Onderdeel | Status | Actie vóór release |
|---|---|---|
| AppV22.js broncode en simulatie | 🟢 | Volledig eigen implementatie. |
| Start met klein station + één trein + één spoor | 🟡 | Generiek tycoonconcept; later eigen Rail Rush Hour-progression vastleggen. |
| Ticket Office → Security → Waiting Hall → Platform → Train flow | 🟡 | Bewust dicht op reference-gameplay; voor release aanpassen naar eigen stationslogica. |
| Missievolgorde en claim-beloningen | 🟡 | Eigen progression, teksten en balans ontwerpen. |
| Zijmenu Missions / Routes / Schedule / Trains / Tech | 🟡 | Functies mogen blijven, definitieve UI en informatiearchitectuur opnieuw ontwerpen. |
| Automatische treincyclus en route-unlocks | 🟡 | Gameplay opnieuw balanceren en koppelen aan Rail Rush Hour-dienstregeling. |
| Ticketmachines, metaaldetectors, wachtruimte, café en perron als level-1 opbouw | 🟡 | Generieke faciliteiten; uiteindelijke plaatsing, volgorde en uiterlijk eigen maken. |
| Alle tijdelijke level-1 graphics/geometrie | 🔴 | Volledig vervangen door definitieve Rail Rush Hour art direction/assets. |
| Huidige treinplaceholder | 🔴 | Vervangen door eigen consistente treinsprites/modellen. |
| Emoji/iconen in navigatie | 🔴 | Vervangen door eigen iconenset. |
| Namen Central Valley / Greenfield / Lakeside / Airport | 🔴 | Tijdelijke developer-namen; vóór release eigen wereld/naamgeving kiezen. |

## v0.23 Full Progression Reference Build

| Onderdeel | Status | Actie vóór release |
|---|---|---|
| AppV23.js broncode | 🟢 | Volledig eigen React Native-implementatie. |
| Parking → Entrance → Tickets → Security → Waiting → Platform → Train | 🟡 | Bewust als reference-progression gebruikt; later koppelen aan eigen Rail Rush Hour-stationsflow. |
| Station Levels 1–10 en unlockvolgorde | 🟡 | Developer-progressie; definitieve volgorde, namen, balans en pacing vóór release opnieuw ontwerpen. |
| Café, Shop, Toilets, Restaurant, VIP Lounge, Manager | 🟡 | Generieke stationfaciliteiten; definitieve uitvoering en unlocklogica eigen maken. |
| Platform 2 op Lv 4 en Platform 3 op Lv 8 | 🟡 | Tijdelijke progression voor gameplaytest. |
| Route-unlocks Greenfield/Lakeside/Airport/Harbor/Capital | 🔴 | Tijdelijke developer-routes en namen volledig vervangen. |
| Developer level selector | 🔴 | Alleen voor testen; verwijderen uit releasebuild. |
| Huidige parkeerterrein-, station-, perron- en treinvisuals | 🔴 | Volledig vervangen door definitieve Rail Rush Hour-art direction/assets. |
| Huidige missievolgorde en beloningen | 🟡 | Testpacing; opnieuw balanceren en eigen missies ontwerpen. |
| Emoji/iconen in navigatie en upgradebubbels | 🔴 | Vervangen door eigen iconenset. |

## Verboden bronmateriaal

Niet importeren of bundelen in de repository zonder expliciete gebruiksrechten:
- originele graphics, textures, screenshots of sprites uit andere games;
- originele audio/muziek;
- gedecompileerde of gekopieerde broncode;
- logo's, handelsmerken of originele UI-assets van andere titels.

## Release gate

Een releasecandidate mag pas worden gepubliceerd wanneer:
1. alle 🔴 items zijn vervangen;
2. alle 🟡 items opnieuw zijn beoordeeld en aantoonbaar een eigen Rail Rush Hour-uitvoering hebben;
3. naamgeving, graphics, audio, UI, iconen en teksten release-safe zijn;
4. de operationele Rail Rush Hour-laag duidelijk de eigen spelidentiteit bepaalt.
