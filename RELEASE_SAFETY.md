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
