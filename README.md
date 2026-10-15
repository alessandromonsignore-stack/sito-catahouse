# Sito CataHouse group Arredamenti

Sito del negozio di arredamento CataHouse group, Viale Mazzini 154/B, Alba Adriatica (TE).

- `public/`: la pagina del sito (`index.html`), i caratteri e le immagini.
- `netlify/functions/progetta.mjs`: il progettista di cucine con l'intelligenza artificiale (indirizzo `/api/progetta`).
- `netlify.toml`: le impostazioni di pubblicazione su Netlify.

Ogni modifica caricata su questo repository viene pubblicata da Netlify in automatico.

Limiti del progettista AI, per non esaurire i crediti del piano gratuito di Netlify:
- al massimo 80 proposte al mese per tutto il sito (si cambia con la variabile `AI_MONTHLY_LIMIT` nelle impostazioni di Netlify);
- al massimo 3 proposte al giorno per visitatore e 3 ogni 3 minuti per indirizzo.
