Jag håller med dig. FRONT på kvartalsnivå ska inte automatiskt betyda FRONT även inom kvartalet. Det skulle bli en dubbel front-loading som kan ge en ganska missvisande intäktsprognos.

Jag tycker att din idé om två nivåer är rätt, men att vi gör den andra nivån valfri så att modellen förblir enkel att använda.

## Mitt förslag: Fördelning i två nivåer

Nivå 1 – Fördelning mellan kvartalen

Vi börjar med ett helårsmål på 100 i New Contracted ARR.

|        | FRONT | EVEN | BACK |
| ------ | ----- | ---- | ---- |
| Q1     | 35    | 25   | 15   |
| Q2     | 30    | 25   | 20   |
| Q3     | 20    | 25   | 25   |
| Q4     | 15    | 25   | 40   |
| Totalt | 100   | 100  | 100  |

Nivå 2 – Fördelning inom respektive kvartal

Standardinställningen är alltid EVEN, oavsett vad man valt på nivå 1.

Om användaren väljer FRONT för helåret blir månadsfördelningen alltså:

|    | Januari | Februari | Mars  | Kvartal |
| -- | ------- | -------- | ----- | ------- |
| Q1 | 11,67   | 11,67    | 11,66 | 35      |
| Q2 | 10      | 10       | 10    | 30      |
| Q3 | 6,67    | 6,67     | 6,66  | 20      |
| Q4 | 5       | 5        | 5     | 15      |

Q2–Q4 följer samma mönster i sina respektive tre månader. Värdena avrundas så att kvartals- och årssummorna stämmer exakt.

Då får vi ett front-loaded år, men en jämn fördelning inom varje kvartal.

## Så skulle jag vilja att användaren arbetar

New Contracted ARR Distribution

1\. Distribution between quarters

FrontEvenBack

Q1

## 35

Q2

## 30

Q3

## 20

Q4

## 15

Customize distribution within quarters

Monthly allocation

| Month | New ARR | Cumulative ARR |
| ----- | ------- | -------------- |
| Jan   | 11,67   | 11,67          |
| Feb   | 11,67   | 23,33          |
| Mar   | 11,67   | 35,00          |
| Apr   | 10,00   | 45,00          |
| Maj   | 10,00   | 55,00          |
| Jun   | 10,00   | 65,00          |
| Jul   | 6,67    | 71,67          |
| Aug   | 6,67    | 78,33          |
| Sep   | 6,67    | 85,00          |
| Okt   | 5,00    | 90,00          |
| Nov   | 5,00    | 95,00          |
| Dec   | 5,00    | 100,00         |

Illustrativ interaktion för att jämföra de två fördelningsnivåerna. Inga intäkts- eller phasingberäkningar ingår i denna tabell.

Det fina är att användaren kan börja med FRONT för året och låta varje kvartal vara EVEN. Sedan kan hen exempelvis välja BACK enbart inom Q3, eftersom hen vet att många affärer förväntas stängas i september.

Vi bör också tillåta en Custom-fördelning, där man skriver över månadsvärdena direkt.

## En viktig konsekvens för Revenue Phasing

Här måste vi vara extra noggranna.

Om användaren har valt 25 % Revenue Phasing på kvartalsnivå, betyder det att 25 % av den nya kohortens maximala kvartalsomsättning realiseras under startkvartalet.

Om vi sedan fördelar samma nya avtal jämnt på tre månader får vi inte automatiskt applicera 25 % på första månaden också. Då förändrar vi antagandet.

Vi måste antingen fördela kvartalets beräknade intäkter på månader enligt en konsekvent metod, eller låta användaren förfina aktiveringstidpunkterna på månadsnivå. Om den senare detaljeringen ändrar prognosen ska det vara ett medvetet resultat av nya antaganden.

Det är en viktig skillnad mellan att bryta ned en befintlig budget och att förfina budgetens beräkningar.

### Min rekommendation

Jag skulle bygga detta med följande standard:

- FRONT / EVEN / BACK mellan kvartal.
- EVEN som standard inom respektive kvartal.
- Möjlighet att aktivera separata Front / Even / Back-mönster eller manuella värden inom varje kvartal.
- Revenue Phasing beräknas därefter utifrån den valda planeringsnivån och aktiveringstidpunkterna, utan dubbelräkning.

Då får ReverSide en snabb, lättförståelig standardmodell som samtidigt kan bli så detaljerad som användaren behöver.

Och framför allt: Front / Even / Back fördelar nyförsäljningen. Revenue Phasing avgör när den blir omsättning. De ska samverka, men aldrig förväxlas.

min take på "revenue phasing"-frågan du ställer är att jag anser att om du väljer att budgetera på kvartalsbasis så appliceras den på kvartalet och sen kan du välja att view månadsutfall som då är skapat för att på kvartalstotalen gå ihop med kvartalsphasing MEN om du väljer att budgetera på månadsbasis så skall phasingen gälla per månad. M a o ska det vara möjligt att välja budgetgranuläritet, i teorin bör man även kunna välja årsbudget om man inte vill ha en granulär vy. är du med på hur jag tänker? Sen oavsett vilken nivå du valt kan du sedan titta på den på en mer granulär vy men då är den mer eller mindre utsmetad så att total blir korrekt. är du med mig?

Ja, helt med dig. Och jag tycker att vi nu har landat rätt i hur Revenue Phasing och budgetgranularitet ska fungera.

Det du beskriver är egentligen en mycket tydlig princip:

Budgetgranulariteten styr beräkningen. Vygranulariteten styr endast presentationen.

Det är två oberoende inställningar.

## 1. Budgetgranularitet – hur beräkningen görs

Användaren väljer hur detaljerat hen vill budgetera:

| Budgetnivå | Revenue Phasing appliceras på | Vad det innebär                                                     |
| ---------- | ----------------------------- | ------------------------------------------------------------------- |
| År         | Helåret                       | En andel av ny ARR realiseras som omsättning under anskaffningsåret |
| Kvartal    | Kvartalet                     | En andel av ny ARR realiseras under anskaffningskvartalet           |
| Månad      | Månaden                       | En andel av ny ARR realiseras under anskaffningsmånaden             |

Det här är tre olika prognosantaganden och kan därför ge olika ekonomiska utfall, även med exakt samma totala New Contracted ARR.

Däremot ska de alltid använda samma grundläggande matematik.

## 2. Vygranularitet – hur resultatet visas

Om man väljer att budgetera per kvartal, till exempel, ska man kunna visa resultatet så här:

Revenue Bridge

Budget: Quarterly · Phasing: 25 %

ÅrKvartalMånad

| Period       | Recognized Revenue |
| ------------ | ------------------ |
| Q1           | 6,25               |
| Q2           | 25                 |
| Q3           | 25                 |
| Q4           | 25                 |
| Year 1 total | 81,25              |

Ren illustration av vyväxling: 100 i ny ARR tillkommer i Q1, ger 6,25 i Q1-omsättning vid 25 % phasing och därefter 25 per kvartal. Månadsbeloppen fördelas jämnt som presentation, utan ny phasing-beräkning.

Det avgörande är att 81,25 förblir 81,25 oavsett vilken vy man väljer.

Om vi visar den kvartalsberäknade budgeten månadsvis fördelar vi kvartalets resultat med en överenskommen metod, exempelvis jämnt. Vi kör inte om beräkningen med månadsphasing.

## 3. Om man däremot byter budgetnivå ...

Då är det en annan sak.

Anta att man börjar med kvartalsbudgetering men bestämmer sig för att bygga en mer exakt månadsbudget.

Då kan användaren ange hur mycket New Contracted ARR som tillkommer i januari, februari och mars, samt tillämpa Revenue Phasing på respektive månad.

Nu får årsprognosen förändras, eftersom vi inte längre använder de grova kvartalsantagandena.

Det ska vara ett aktivt val att förfina budgetmodellen, inte en konsekvens av att man klickar på en annan presentationsflik.

## 4. En teknisk detalj vi måste få rätt

När vi bryter ned en kvartalsbudget till månadsvy behöver vi säkerställa tre saker:

- Flöden såsom Recognized Revenue, S&M Spend och Cash Collections ska summera exakt till kvartalets belopp.
- Stockar såsom Opening ARR och Closing ARR ska överföras mellan perioderna, inte summeras.
- Kundkohorterna ska bibehålla sin logik. Om vi visar en kvartalsbudget per månad får vi inte behandla de uppskattade månadsvärdena som nya, oberoende signeringar och applicera ytterligare phasing.

Det betyder också att vissa månadsbelopp är härledda budgetvärden, inte resultat av en faktisk månadsvis kohortprognos.

Jag skulle vilja märka det diskret i gränssnittet, exempelvis med Allocated from quarterly plan, så att användaren förstår precisionen i siffrorna.

## 5. Det här blir vår fastställda princip

Budget: Year / Quarter / Month – avgör beräkning och phasing.

View: Year / Quarter / Month – avgör endast hur resultaten presenteras.

Front / Even / Back – fördelar New Contracted ARR på vald budgetnivå, med möjlighet att förfina och skriva över värden.

Revenue Bridge – samma logiska rader oavsett budgetnivå.

Och årsbudgetering ska absolut finnas med. Det är ett enkelt och snabbt sätt att börja simulera utan att behöva bygga 12 månader eller 4 kvartal.

En sak jag särskilt gillar med detta: Vi kan låta användaren börja med en enkel årsbudget och sedan bygga upp precisionen gradvis när behovet uppstår. Samtidigt ska alla kunna förstå vad modellen faktiskt har räknat ut och på vilken detaljnivå.

Det är precis rätt filosofi för ReverSide: en modell som kan vara enkel att börja med, men finansiellt stringent när man går på djupet.

kommentar på 4an är att vi måste kunna i track sedan följa upp på månadsbasis oavsett granuläritet på budgeten, dvs. vi måste automatiskt ha fyllt i en metodik mellan månaderna som resulterar i korrekt total på kvartals och årsbasis eller tror vi att det blir ett problem?

Ja, absolut. Och jag tycker faktiskt att det här ska vara ett grundkrav i ReverSide från första början, inte något vi löser när vi bygger TRACK.

Det är inget principiellt problem att göra det. Däremot finns det en viktig skillnad mellan att fördela en budget matematiskt korrekt och att förutsäga exakt när under perioden intäkterna uppstår.

Vi kan garantera det första. Det andra måste bygga på antaganden när användaren inte har budgeterat på månadsnivå.

## Så ska det fungera

Oavsett om man budgeterar på år, kvartal eller månad ska ReverSide alltid skapa en underliggande månadsbudget.

PLAN – Vald budgetgranularitet

År

Kvartal

Månad

Gemensam månadsbudget

12, 24, 36 ... månader med ARR, kohorter, intäkter och kassaflöde

TRACK – Månadsvis uppföljning

Budget · Actual · Variance · Forecast

## Exempel – en budget gjord på kvartalsnivå

Anta att vi har budgeterat följande för Q1:

| Revenue Bridge                           | Q1 Budget |
| ---------------------------------------- | --------- |
| Recognized Revenue – Original Base       | 125       |
| Recognized Revenue – Earlier New Cohorts | 0         |
| Recognized Revenue – Current Period      | 6,25      |
| Total Recognized Revenue                 | 131,25    |

ReverSide behöver då skapa en fördelning mellan januari, februari och mars.

För den ursprungliga kundbasen är det enkelt att fördela 125 jämnt om vi antar stabil ARR utan churn eller expansion.

För nya kunder måste vi däremot använda en månadsfördelningsregel som respekterar signeringar och intäktsstart. Vi kan inte nödvändigtvis fördela 6,25 jämnt, eftersom kunder som ännu inte är aktiva inte kan generera abonnemangsintäkter.

Men oavsett vilken månadsprofil modellen härleder måste den uppfylla:

\\[ Jan + Feb + Mar = 131,25 \\]

Och motsvarande avstämning ska gälla för varje intäktskomponent.

## De fem regler jag vill bygga in

1\. Periodtotaler är låsta. Om budgeten har beräknat 131,25 i Q1 får månadsfördelningen inte förändra den summan.

2\. ARR behandlas som ett stockmått. Closing ARR i mars är Closing ARR för Q1. Vi summerar aldrig januari, februari och mars ARR.

3\. Revenue Phasing appliceras bara på budgetens ursprungliga beräkningsnivå. Om kvartalsbudgeten beräknades med 25 % phasing får vi inte applicera ytterligare månadsphasing när vi fördelar resultatet.

4\. Kundkohorterna ska stämma av. Vi måste bevara vilka kunder som tillhör ursprunglig bas, tidigare nya kohorter och den aktuella budgetperiodens nya kunder.

5\. Månadsfördelningen ska vara spårbar. Om månadsbudgeten har härletts från kvartalsantaganden ska vi kunna visa vilken fördelningsmetod som användes.

En konsekvens är att vissa kombinationer av signeringstidpunkter och phasing kan vara omöjliga att uppfylla samtidigt. Då ska ReverSide flagga en inkonsekvens, inte dölja den genom att ändra totalerna.

## Det här blir särskilt viktigt i TRACK

Tänk att vi har en kvartalsbudget på 131,25 som ReverSide fördelat på tre månader.

När januari är avslutad fyller användaren i det faktiska utfallet för januari.

Då ska vi kunna jämföra:

|          | Januari     | Februari | Mars    | Q1       |
| -------- | ----------- | -------- | ------- | -------- |
| Budget   | Härledd     | Härledd  | Härledd | 131,25   |
| Actual   | Registrerat | –        | –       | Hittills |
| Variance | Beräknad    | –        | –       | Hittills |

Originalbudgeten får inte förändras av Actual.

Däremot kan användaren skapa en uppdaterad forecast för februari och mars baserat på januarins utfall. Då får vi en separat Actual + Forecast, samtidigt som den ursprungliga Q1-budgeten ligger kvar som jämförelse.

Det är viktigt att den ursprungliga månadsfördelningen finns sparad när budgeten fastställs. Den ska inte räknas om i efterhand.

## En detalj som vi behöver vara medvetna om

Om man har valt årsbudgetering med väldigt grova antaganden kan månadsbudgeten bli mindre träffsäker. Det är naturligt.

Vi bör därför tydligt skilja mellan:

- Budgeted monthly – användaren har budgeterat direkt på månadsnivå.
- Allocated monthly – ReverSide har härlett månadsbudgeten från ett kvartals- eller årsantagande.

Båda fungerar lika bra för TRACK, men precisionen i själva budgetantagandet skiljer sig.

### Min rekommendation

Vi bygger alltså en månadsbaserad datamodell som alltid existerar, oavsett hur användaren valt att budgetera.

Men vi låter användarens budgetgranularitet bestämma hur modellen räknar fram periodens ekonomiska utfall. Därefter fördelar vi det utfallet till månader på ett konsekvent, avstämningsbart sätt.

Det innebär att vi redan nu förbereder för TRACK utan att behöva bygga TRACK.

Och jag vill särskilt betona en sak: varje värde som visas i års-, kvartals- eller månadsmatrisen ska kunna härledas till exakt samma underliggande budget. Ingen omräkning bara för att användaren byter vy.

Då får vi en modell där siffrorna är pålitliga även när användaren granskar dem på detaljnivå. Det är betydligt viktigare än att bygga snygga diagram.