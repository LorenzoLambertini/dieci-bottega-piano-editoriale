# Crescita · sistema di misura Dieci Bottega

Ciclo: PUBBLICA → MISURA → ANALIZZA → IMPARA → MODIFICA → RIPUBBLICA.

## Da dove arrivano i dati
- **Automatico, ogni giorno** (`metriche-post.json`, storico in `storico/`): per ogni post uscito su Instagram, Facebook, LinkedIn → views, reach, impression, reazioni, commenti, condivisioni, salvataggi, follow (IG), click (FB). Fonte: API Buffer, aggiornata dai social una volta al giorno.
- **Manuale, ogni lunedì** (`profilo.csv`): dati che Buffer non dà → follower per canale, visite al profilo, % non follower raggiunti, tempo medio di visione dei Reel, DM/lead. Basta mandare a Claude gli screenshot di Instagram Insights, Meta Business Suite e LinkedIn Analytics.

## KPI per fase
- Fase 1, crescita organica: reach, % non follower, follower nuovi, visite profilo, visite→follow.
- Fase 2, ottimizzazione: retention e completamento, share/save rate, follower per contenuto, DM per contenuto.
- Fase 3, sponsorizzazioni: solo quando un contenuto organico supera la mediana su reach non follower **e** genera visite/follow/DM.

## Regole
- Mai un numero da solo: sempre contro media 7 giorni, media 30 giorni, stesso format.
- Una variabile per test. Ogni test in `esperimenti.md`: ipotesi → esperimento → risultato → insight → azione.
- Nessun dato inventato: se manca, si scrive cosa manca.
