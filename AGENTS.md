# Ontwikkelafspraak — gericht werken, minder contextverbruik

Repo-overstijgende standaard: beperk onnodig AI-inleeswerk en hergeneratie, zonder functionaliteit, juistheid, brongegevens of vereiste controles op te offeren. Bestaande projectspecifieke afspraken blijven behouden.

## Gericht uitvoeren
- Controleer de actuele branch, wijzigingen en relevante projectinstructies. Behoud werk van anderen; neem de architectuur of ontwikkelfocus van een andere repository niet over.
- Werk naar het volledige gevraagde resultaat in samenhangende, toetsbare stappen. Geen ongevraagde projectbrede herbouw, herhaald planwerk of extra documentatie zonder nut.
- Bepaal eerst relevante bestanden via namen, groottes, symbolen en gerichte zoekopdrachten. Lees vervolgens kleine codefragmenten, schema's en geselecteerde records; niet standaard alle code, oude versies, documentatie of datasets.
- Richtwaarde: maximaal 8.000 tekens per toolresultaat. Verklein te brede resultaten; lees gericht verder wanneer afhankelijkheden, bewijs of correctheid dat vereisen. Afkapping is geen bewijs van afwezigheid.
- Verwerk grote datasets met bestaande lokale scripts of gerichte queries. Geef de AI alleen relevante records, aantallen en afwijkingen; geen volledige JSON-, CSV-, GTFS-, log- of repositorydumps.

## Bestanden en hergebruik
- Lees caches, builds, back-ups, binaire bestanden en uitgebreide logs alleen voor een concrete diagnose. Houd nieuwe tijdelijke uitvoer buiten Git met projectspecifieke uitsluitingen. Lees nooit geheimen als ontwikkelcontext.
- Hergebruik bestaande generators en geldige output. Genereer alleen opnieuw wanneer relevante brongegevens, configuratie, generator of noodzakelijke validatie dat vereisen; oude output is geen nieuw testbewijs.
- Een gegenereerd, groot, dubbel of oud bestand is niet automatisch overbodig. Behoud runtimebestanden, bronmateriaal, historische toestanden, licenties, bronstatus en tests.
- Verwijder of verplaats uitsluitend na controle van verwijzingen, runtimegebruik en reproduceerbaarheid of herstelbaarheid, gevolgd door passende controles. Geen generieke bulkverwijdering, `git clean -fdx` of herschrijving van Git-historie.
- `.gitignore` en editorzoekuitsluitingen zijn geen harde AI-leesblokkade; een instructiebestand is geen gegarandeerde creditlimiet.

## Toetsen en afronden
- Voer gerichte tests en alle toepasselijke verplichte regressie-, acceptatie- en CI-controles uit. Herhaal of verbreed alleen bij nieuwe wijzigingen, fouten of resterende risico's; schakel geen controles uit voor credits.
- Bewaar uitgebreide logs lokaal. Rapporteer kort het resultaat, gewijzigde bestanden, uitgevoerde controles en resterende blokkades; claim geen tests of besparing die niet gemeten zijn.
- Werk bestaande voortgang en documentatie compact bij. Deze werkinstructie start geen automatische opruiming en wijzigt geen spelregels.
