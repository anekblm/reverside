# ReverSide PLAN — fastställt kravkontrakt för budgetgranularitet och Revenue Phasing

**Beslutsdatum:** 2026-11-06.
**Status:** Accepterat som den regeluppsättning användaren uttryckligen har hänvisat till med "exakt så här vill vi ha det".
**Primärkälla:** [Ordagrann, oförändrad trådsammanställning](source-thread-budget-phasing-2026-11-06.md).
**Omfattning:** Nyförsäljning, New Contracted ARR, budget-/visningsgranularitet, Revenue Phasing, månadsallokering och TRACK. Dokumentet ersätter motstridiga tekniska antaganden på *dessa områden* i tidigare implementation och dokumentation. Det avgör inte andra ospecificerade affärsregler.

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
- Kohorter: Original base, earlier new cohorts, current period new cohorts är konsekventa och behåller sina rätta ursprung. Ingen fantomnyförsäljning eller extra månadsphasing vid visning.
- En allokeringsmetod och dess härledning lagras spårbart. Skillnaden **Budgeted monthly** / **Allocated monthly** syns vid behov.
- När en budget fastställs måste dess månadsallokering **frysas**. TRACK jämför med den frysta **Budget**. **Actual** får inte skriva om ursprungsbudgeten. Ny **Actual + Forecast** är separat.

### 5. Två nivåer av detaljering betyder INTE två beräkningsmotorer

- Den valda budgetperiodens antaganden och fastställda totalsiffror är styrande.
- Underliggande månadsunderlag är en reproducerbar, exakt avstämd allokering för presentation och TRACK.
- Att bara visa månader får inte trigga en ny månadsbudget med egen phasing.
- Flera reglage som påverkar samma mått måste ha synlig prioritet; inkompatibla antaganden ska upptäckas explicit.
- Matrisens layout får ingen egen finansiell modell.

## Konkreta avvikelser i den nuvarande koden (kontrollerade 2026-11-06)

| Källkrav | Nuvarande kod | Korrektionskrav |
|---|---|---|
| 25 % **kvartalsphasing** kan ge 6,25 på 100 New CARR | `tiltToPhasing` avvisar under 33,33 % för kvartal | Separera kontraktering från intäktsrealisering; implementera periodens tillåtna 25 %-utfall utan dubbelräkning |
| Phasing även på **månadsbudget** | `firstInvoiceWeights` ignorerar phasing när `granularity==="month"`; UI inaktiverar reglaget | Stöd månadsphasing som eget budgetantagande |
| Två distributionsnivåer | Förvalda FRONT/EVEN/BACK på års-/kvartalsnivå, men ingen separat per-kvartals-FRONT/EVEN/BACK och CUSTOM för varje månad | Inför frikopplade nivå 1 och nivå 2 utan att flytta matrisen |
| Fast periodtotal med möjlig allokering | Modellens "new ARR" sammanblandas med `firstInvoiceMonth` och aktiv fakturering | Låt periodbudget styra total, och härled månadsprofiler med explicit intäktsstart och spårbar allokering |
| Fryst månadsversion för TRACK | Ingen persistens/frysning av godkänd PLAN-baseline | Skilj budgetversion från Actual och Forecast |

**Arkitekturkrav:** rätta dessa brister genom separerad input/engine/result/presentation. Skriv först referens-/acceptanstester från detta kontrakt, sedan implementering. Ändra inte andra finansiella regler av misstag. Behåll originalets drill-down-matris. Ändra endast utvecklingsgrenen tills finansiella och visuella acceptansprov passerar.

**Viktig avgränsning:** Den bifogade primärkällan avser främst nyförsäljning, Revenue Phasing, fördelning och TRACK. Den innehåller inte ett självständigt fullständigt facit för tidsfördelning av churn och expansion i A; sådana regler ska hämtas från övriga uttryckliga beslut, inte antas härifrån.
