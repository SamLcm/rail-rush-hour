# Rail Rush Hour — v0.29 Release Safety Notes

Deze notitie vult `RELEASE_SAFETY.md` aan voor v0.29.

| Onderdeel | Status | Actie vóór release |
|---|---|---|
| AppV29.js balans-, progression- en simulatiecode | 🟢 RELEASE SAFE | Eigen implementatie; technisch bruikbaar als basis. |
| Rustigere parkingbalans waarbij upgrade vooral capaciteit/afvoer verhoogt | 🟢 RELEASE SAFE | Eigen balanskeuze; later met playtestdata verfijnen. |
| 15 levels per facility | 🟢 RELEASE SAFE | Generieke progression; pacing later verfijnen. |
| Milestone-unlocks op Lv 3/6/9/12/15 | 🟡 REFERENCE | Idle-tycoonconventie; namen, rewards en presentatie voor release duidelijk Rail Rush Hour-eigen maken. |
| Development XP naar volgende station level | 🟡 REFERENCE | Generieke progressionconventie; definitieve UI en balans eigen maken. |
| Entrance, Signage en Cleaning als extra upgrade-categorieën | 🟢 RELEASE SAFE | Eigen stationsmanagementlaag; mag blijven. |
| Goal/claim-beloningen | 🟡 REFERENCE | Definitieve doelen, teksten en beloningen eigen ontwerpen. |
| Huidige HUD, horizontale upgradecards en servicecards | 🟡 REFERENCE | Definitieve vormgeving verder onderscheiden. |
| Northbridge / Seabright / Emberfall / Harbor Point / Grand City | 🔴 REPLACE BEFORE RELEASE | Tijdelijke developer-routes vervangen. |
| NORTHVALE STATION | 🔴 REPLACE BEFORE RELEASE | Tijdelijke developernaam vervangen. |
| Emoji/tekens als iconen | 🔴 REPLACE BEFORE RELEASE | Vervangen door eigen productie-iconenset. |
| Developer level selector | 🔴 REPLACE BEFORE RELEASE | Alleen testfunctie; verwijderen uit releasebuild. |
| Huidige View-gebaseerde tijdelijke station-, trein- en reizigersgraphics | 🟡 REFERENCE | Zijn eigen tijdelijke graphics, maar art direction voor release nog definitief maken. |

## Balansdoel v0.29

Parking mag niet meer automatisch de eerste permanente bottleneck zijn. De reizigersvraag groeit primair met station level; Parking-upgrades verhogen vooral capaciteit en afvoersnelheid. Rush Hour is verlaagd naar +60% en komt in een langere cyclus. Daardoor moeten knelpunten vaker verschuiven tussen Entrance, Tickets, Security, Waiting, Platforms en Trains.
