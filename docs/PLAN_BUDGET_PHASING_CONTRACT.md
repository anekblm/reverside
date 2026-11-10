# ReverSide PLAN — fastställt kravkontrakt för budgetgranularitet och Revenue Phasing

**Beslutsdatum:** 2026-11-06.
**Status:** Accepterat som den regeluppsättning användaren uttryckligen har hänvisat till med "exakt så här vill vi ha det".
**Primärkälla:** [Ordagrann, oförändrad trådsammanställning](source-thread-budget-phasing-2026-11-06.md).
**Omfattning:** Nyförsäljning, New Contracted ARR, budget-/visningsgranularitet, Revenue Phasing, månadsallokering och TRACK. Dokumentet ersätter motstridiga tekniska antaganden på *dessa områden* i tidigare implementation och dokumentation. Det avgör inte andra ospecificerade affärsregler.

**Nuvarande PLAN.** Prognosen räknas per månad. New CARR är ett
beräknat utfall från slutmålet och fördelas med separata vikter.
Churn Period anger vad churnprocenten avser och nykundsreglaget
styr intäkt i första månaden. Beskrivningen nedan gäller den tidigare
periodbaserade vyn och motoranrop med de tidigare parametrarna.
Se [nuvarande finansiella regler](FINANCIAL_MODEL.md).

Kohort A har en separat [finansiell regel för årsbaserad churn, expansion
och intäkt](FINANCIAL_MODEL.md#a-customers-present-at-the-start-of-the-year).
Budgetnivån nedan gäller nykundernas beräkning.

Matrisen redovisar nykundens första månads intäkt i C och efterföljande
månaders intäkt i B inom samma år. Phasing följer fortfarande
anskaffningsperioden. Om den omfattar flera månader kan dess intäktseffekt
finnas i både B och C. Referensfallet 100 i ny CARR med 25 % phasing och
jämn signering ger 3,125 i B och 3,125 i C för Q1, totalt 6,25.

## Implementation på utvecklingsgrenen (denna iteration)

**Implementerat och regressionstestat:** Separat FRONT/EVEN/BACK för kontrakterad New ARR mellan kvartalen och inom deras månader; dessa två nivåer ändrar inte varandras periodtotaler. Revenue Phasing styr separat redovisad intäkt från NYA kohorter på exakt vald inputnivå (Year/Quarter/Month), appliceras en gång och lagras per månad. Acceptansfallet 100 New CARR Q1, 25 % kvartalsphasing är nu 6,25 / 25 / 25 / 25 = 81,25 för året. I B visas phasingeffekten separat. I C ingår den i Recognized Revenue. Visning på en annan nivå räknar aldrig om phasing.

**Preliminärt, INTE godkänd procentsats:** Källan anger FRONT/EVEN/BACK för kvartalen (35/30/20/15, 25/25/25/25, 15/20/25/40) men inga exakta månadsprocent för FRONT/BACK. Provisoriska standardmönster för val nummer två är **FRONT 50/30/20, EVEN 1/3–1/3–1/3, BACK 20/30/50**. Dessa ska endast betraktas som implementationsexempel till dess att användaren har fastställt dem.

**UI-begränsning:** Fördelningen inom kvartal gäller alla kvartal som grupp.
Motorn kan läsa `monthlyPatternsByQuarter` för separata kvartalsmönster.
Individuell UI-inställning och CUSTOM återstår.

**Ändring av budget eller fördelning:** Ett fördelningsbyte behåller explicit
phasing så länge värdet ryms inom den nya fördelningens intervall. Om det
överskrider gränsen visar vyn maxvärdet och väntar på att användaren sänker
phasingen före bytet. Byte av budgetnivå kräver bekräftelse när manuella
New ARR-belopp eller explicit phasing återställs.

**Intäktsallokeringens status:** Periodens phasing ger en explicit intäktsjustering för kohorter som kontrakterats under samma inputbudgetperiod, med månatlig fördelning som inte kan uppstå före kontraktet. Eventuellt tidigarelagd intäkt som inte går att förena med de valda kontraktsmånaderna avvisas i stället för att justera kontraktssiffrorna. Dessa allokerade intäkter är **inte en full kontraktsspecifik faktureringskalender**. En fryst TRACK-baseline och faktisk fakturering/aktiveringsschema återstår.

## Beslutade funktionella regler

### 1. Budgetnivå är beräkningsnivå. Visningsnivå är aldrig beräkningsnivå.

- Välj **Year / Quarter / Month** för budgetens ekonomiska beräkning, inklusive Revenue Phasing.
- **Year**: phasing gäller hela anskaffningsåret.
- **Quarter**: phasing gäller anskaffningskvartalet.
- **Month**: phasing gäller anskaffningsmånaden, inte automatiskt 100 %.
- Byte av budgetnivå är ett aktivt nytt budgetantagande och **får** ändra prognosutfallet.
- Att expandera samma budget till år/kvartal/månad är endast presentation och **får aldrig** ändra modellen eller dess periodtotaler.
- En mer detaljerad månadsvis visning av års-/kvartalsbudget är **allokerad**, inte en ny oberoende månadsberäkning.

### 2. New Contracted ARR Distribution består av två oberoende nivåer

**Nivå 1, mellan årets kvartal:**

| Kvartal | FRONT | EVEN | BACK |
|---|---:|---:|---:|
| Q1 | 35 % | 25 % | 15 % |
| Q2 | 30 % | 25 % | 20 % |
| Q3 | 20 % | 25 % | 25 % |
| Q4 | 15 % | 25 % | 40 % |
| Summa | 100 % | 100 % | 100 % |

**Nivå 2, inom varje kvartal:**

- Standard **EVEN**, **oavsett** valet för nivå 1.
- Möjlighet att välja separat FRONT / EVEN / BACK **för varje kvartal**, utan att tvinga samma mönster som årsnivån.
- Möjlighet att skriva över månadsvärden med **Custom**.
- Exempel: 100 New CARR under året och årsmönster FRONT ger kvartalsvärden 35/30/20/15. Med EVEN inom Q1 fördelas 35 över januari/februari/mars ≈ 11,67/11,67/11,66, med avrundningsrest i sista månaden. De fyra kvartalstotalerna och helårstotalen ska vara exakta.
- **Front / Even / Back fördelar nyförsäljningen. Revenue Phasing avgör när den blir Recognized Revenue.** De två mekanismerna får inte sammanblandas.

### 3. Revenue Phasing definieras på vald budgetperiod, aldrig två gånger

Phasing är andelen av den **nya kohortens maximala Recognized Revenue i anskaffningsperioden** som faktiskt ska redovisas under samma period. Den styr alltså intäktsrealisering, inte i sig hur mycket ny ARR som kontrakteras.

**Uttryckligt exempel från källan:**
- 100 New Contracted ARR tillkommer under Q1.
- Maximal kvartalsomsättning från denna ARR är 100/4 = 25.
- **Quarter phasing 25 %** innebär **Recognized Revenue i Q1 = 25 × 25 % = 6,25**.
- Efter startkvartalet visar illustrationens Q2/Q3/Q4 25/25/25; **Year 1 = 81,25**.
- Vid månadsvis VISNING av exakt samma kvartalsbudget måste de allokerade månadsintäkterna summera till 6,25 i Q1, och årets total måste förbli 81,25.
- **Inget andra phasingavdrag** på de allokerade månadsbeloppen.
- Om användaren aktivt byter BUDGETnivå till månad kan hen ange månatlig New CARR och månatlig Revenue Phasing; detta är en *annan* prognos.

Anmärkning: Dessa exempel fastställer periodresultatet, inte en dold kontrakts-, aktiverings- eller faktureringskalender. En konsekvent allokering krävs som respekterar både intäktsstart och beloppen. Om valda signerings- och aktiveringstidpunkter inte går att förena ska inkonsistensen **flag­gas**, inte lösas genom att tyst ändra värden. Ingen implementation får på egen hand införa "minst 33,33 % kvartalsphasing" eller "alltid 100 % månadsphasing" som generella regler och därigenom förbjuda det godkända exemplet.

### 4. Alltid ett härlett och spårbart månadsunderlag för TRACK

PLAN skapar alltid en månadsbudget (12, 24, 36 ... månader), även när budgetinput är Year eller Quarter.

Följande avstämningar är invarianta:
- Flöden: Summa månader = respektive kvartal = respektive år för Recognized Revenue, S&M, Cash Collections och övriga periodflöden.
- Stockar: Periodens Closing CARR = sista månadens CARR, **aldrig** summan av månadsstockar. Ingående nästa period = föregående Closing.
- Kohorter: A, B och C följer den månadsbaserade klassificeringen även i kvartals- och årsvisning. Ingen fantomnyförsäljning eller extra månadsphasing vid visning.
- En allokeringsmetod och dess härledning lagras spårbart. Skillnaden **Budgeted monthly** / **Allocated monthly** syns vid behov.
- När en budget fastställs måste dess månadsallokering **frysas**. TRACK jämför med den frysta **Budget**. **Actual** får inte skriva om ursprungsbudgeten. Ny **Actual + Forecast** är separat.

### 5. Två nivåer av detaljering betyder INTE två beräkningsmotorer

- Den valda budgetperiodens antaganden och fastställda totalsiffror är styrande.
- Underliggande månadsunderlag är en reproducerbar, exakt avstämd allokering för presentation och TRACK.
- Att bara visa månader får inte trigga en ny månadsbudget med egen phasing.
- Flera reglage som påverkar samma mått måste ha synlig prioritet; inkompatibla antaganden ska upptäckas explicit.
- Matrisens layout får ingen egen finansiell modell.

## Tidigare identifierade kodavvikelser (före rättningen, arkiverade för spårbarhet)

| Källkrav | Nuvarande kod | Korrektionskrav |
|---|---|---|
| 25 % **kvartalsphasing** kan ge 6,25 på 100 New CARR | `tiltToPhasing` avvisar under 33,33 % för kvartal | Separera kontraktering från intäktsrealisering; implementera periodens tillåtna 25 %-utfall utan dubbelräkning |
| Phasing även på **månadsbudget** | `firstInvoiceWeights` ignorerar phasing när `granularity==="month"`; UI inaktiverar reglaget | Stöd månadsphasing som eget budgetantagande |
| Två distributionsnivåer | Förvalda FRONT/EVEN/BACK på års-/kvartalsnivå, men ingen separat per-kvartals-FRONT/EVEN/BACK och CUSTOM för varje månad | Inför frikopplade nivå 1 och nivå 2 utan att flytta matrisen |
| Fast periodtotal med möjlig allokering | Modellens "new ARR" sammanblandas med `firstInvoiceMonth` och aktiv fakturering | Låt periodbudget styra total, och härled månadsprofiler med explicit intäktsstart och spårbar allokering |
| Fryst månadsversion för TRACK | Ingen persistens/frysning av godkänd PLAN-baseline | Skilj budgetversion från Actual och Forecast |

**Arkitekturkrav:** rätta dessa brister genom separerad input/engine/result/presentation. Skriv först referens-/acceptanstester från detta kontrakt, sedan implementering. Ändra inte andra finansiella regler av misstag. Behåll originalets drill-down-matris. Ändra endast utvecklingsgrenen tills finansiella och visuella acceptansprov passerar.

Den bifogade primärkällan beskriver nyförsäljning, Revenue Phasing,
fördelning och TRACK. A:s referensscenario och tidsfördelning finns i den
separata finansiella regeln som länkas ovan.
