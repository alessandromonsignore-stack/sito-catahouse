// Progettista cucine AI per CataHouse group Arredamenti.
// Gira come Netlify Function: le credenziali arrivano dall'AI Gateway di Netlify
// (ANTHROPIC_API_KEY e ANTHROPIC_BASE_URL vengono impostate da Netlify in automatico).
// Per non consumare tutti i crediti del piano gratuito:
// - al massimo AI_MONTHLY_LIMIT proposte al mese per tutto il sito (predefinito 80), contate in Netlify Blobs;
// - al massimo 3 richieste ogni 3 minuti per visitatore (rateLimit qui sotto).

import { getStore } from '@netlify/blobs';

const PROMPT = "Sei il progettista di cucine dello showroom CataHouse group Arredamenti ad Alba Adriatica (Teramo). Proponi UNA composizione di cucina realistica per questo cliente, usando moduli di misure commerciali italiane.\n\nDati del cliente:\n- Lunghezza della parete principale: {LEN}\n- Forma desiderata: {FORMA}\n- Descrizione del cliente: {DESC}\n\nRegole del mestiere (indicative, non rigide; adattale al caso):\n- Basi profonde 60 cm. Larghezze comuni delle basi: 15, 20, 30, 40, 45, 50, 60, 80, 90, 100, 120 cm. Estraibili e portabottiglie da 15 a 40 cm.\n- Colonne alte da 60 cm (frigo, forno); dispensa anche da 30, 45 o 60 cm.\n- Negli spazi piccoli: frigo sottotop da 60, forno sotto il piano cottura, lavastoviglie da 45, meno colonne. Non esiste una lunghezza minima: anche con 120-200 cm proponi una soluzione compatta sensata.\n- Lavello su base da 60 a 120 cm, con la lavastoviglie accanto. Piano cottura su base da 60 o 90 con la cappa sopra, possibilmente a 30-40 cm da colonne e pareti.\n- In una cucina ad angolo usa un modulo \"angolo\" (90 o 110 cm) all'inizio della seconda parete o alla fine della prima.\n- Per ogni parete la somma delle larghezze dei moduli deve essere uguale alla lunghezza della parete; se avanzano meno di 15 cm usa un modulo \"raccordo\".\n- Penisola o isola: da 90 a 240 cm, con basi o cassettiere; possono avere il lavello o il piano cottura.\n- Se il cliente non indica la forma, scegli tu la più adatta. Se non indica misure, proponi misure plausibili.\n- Nel titolo, nella spiegazione e nei consigli non scrivere misure né numeri in centimetri: le misure il cliente le riceve con il progetto completo.\n- Scrivi titolo, spiegazione e consigli in {LINGUA}.\n\nRispondi solo con un oggetto JSON in questo formato, senza altro testo:\n{\"titolo\": \"titolo breve della proposta\", \"pareti\": [{\"nome\": \"Parete A\", \"lunghezza\": 360, \"moduli\": [{\"tipo\": \"lavello\", \"larghezza\": 80}]}], \"penisola\": null, \"isola\": null, \"spiegazione\": \"2-3 frasi, tono cordiale\", \"consigli\": [\"al massimo 3 consigli brevi\"]}\n\nRegole del JSON:\n- \"tipo\" è sempre uno di: lavello, lavastoviglie, piano_cottura, forno_sotto, base, cassettiera, estraibile, angolo, frigo_sottotop, colonna_frigo, colonna_forno, colonna_dispensa, raccordo.\n- I moduli di ogni parete vanno elencati da sinistra a destra. Al massimo 2 pareti.\n- \"penisola\" e \"isola\", se presenti, hanno la forma {\"lunghezza\": 150, \"moduli\": [...]}, altrimenti null.\n- Le larghezze sono numeri interi in centimetri.";
const MODELS = (process.env.AI_MODEL ? [process.env.AI_MODEL] : []).concat(['claude-haiku-5-5', 'claude-haiku-4-5', 'claude-sonnet-4-5']);

const LINGUE = {
  it: 'italiano, dando del tu al cliente',
  ro: 'rumeno, dando del tu al cliente',
  en: 'inglese (britannico)',
  fr: 'francese, dando del voi (vous) al cliente',
  de: 'tedesco, dando del lei (Sie) al cliente'
};
const MONTHLY_LIMIT = Number(process.env.AI_MONTHLY_LIMIT) || 80;
const monthKey = () => 'proposte-' + new Date().toISOString().slice(0, 7);
const openStore = () => getStore({ name: 'progettista', consistency: 'strong' });

async function takeFromMonthlyBudget(store) {
  const used = Number(await store.get(monthKey())) || 0;
  if (used >= MONTHLY_LIMIT) return false;
  await store.set(monthKey(), String(used + 1));
  return true;
}

// Annota l'ultimo problema (senza chiavi né dati del cliente), per capire cosa non va.
async function noteError(store, info) {
  try { if (store) await store.setJSON('ultimo-errore', { ...info, quando: new Date().toISOString() }); } catch {}
}

// Claude Haiku 5.5 di base "ragiona" prima di rispondere e il ragionamento consuma max_tokens:
// qui lo spegniamo, per avere subito il JSON. I modelli di riserva non hanno bisogno di altro.
function requestBody(model, prompt) {
  const body = { model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] };
  if (/^claude-haiku-5/.test(model)) body.thinking = { type: 'disabled' };
  return body;
}

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function extractJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no json');
  return JSON.parse(text.slice(a, b + 1));
}

// GET /api/progetta: stato della funzione (solo sì/no, nessun segreto).
async function status() {
  const out = {
    funzione: 'ok',
    chiaveAI: !!process.env.ANTHROPIC_API_KEY,
    indirizzoAI: !!process.env.ANTHROPIC_BASE_URL,
    chiaveGateway: !!process.env.NETLIFY_AI_GATEWAY_KEY,
    limiteMensile: MONTHLY_LIMIT
  };
  try {
    const store = openStore();
    out.proposteQuestoMese = Number(await store.get(monthKey())) || 0;
    out.ultimoErrore = await store.get('ultimo-errore', { type: 'json' });
    out.archivio = 'ok';
  } catch (e) {
    out.archivio = 'errore: ' + String((e && e.message) || e).slice(0, 160);
  }
  return reply(200, out);
}

export default async (req) => {
  if (req.method === 'GET') return status();
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  let body;
  try { body = await req.json(); } catch { return reply(400, { error: 'bad_request' }); }
  const len = Number(body.lunghezza) >= 60 && Number(body.lunghezza) <= 1500 ? Math.round(Number(body.lunghezza)) : 0;
  const forma = String(body.forma || 'Consigliami tu').slice(0, 40);
  const desc = String(body.descrizione || '').slice(0, 1500);
  if (!len && desc.trim().length < 8) return reply(400, { error: 'bad_request' });
  const lingua = LINGUE[String(body.lingua || 'it')] || LINGUE.it;
  const prompt = PROMPT.replace('{LEN}', len ? len + ' cm' : 'non indicata').replace('{FORMA}', forma).replace('{LINGUA}', lingua).replace('{DESC}', () => desc || 'nessuna descrizione');
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const key = process.env.ANTHROPIC_API_KEY;
  let store = null;
  try { store = openStore(); } catch {}
  if (!key) { await noteError(store, { fase: 'chiave', dettaglio: 'ANTHROPIC_API_KEY assente' }); return reply(503, { error: 'ai_not_configured' }); }
  if (!store) return reply(503, { error: 'counter_unavailable' });
  let allowed;
  try { allowed = await takeFromMonthlyBudget(store); }
  catch (e) { await noteError(store, { fase: 'contatore', dettaglio: String((e && e.message) || e).slice(0, 200) }); return reply(503, { error: 'counter_unavailable' }); }
  if (!allowed) return reply(503, { error: 'monthly_limit' });
  for (const model of MODELS) {
    let r;
    try {
      r = await fetch(base + '/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(requestBody(model, prompt))
      });
    } catch (e) {
      await noteError(store, { fase: 'rete', modello: model, dettaglio: String((e && e.message) || e).slice(0, 200) });
      return reply(502, { error: 'upstream' });
    }
    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 300);
      await noteError(store, { fase: 'AI', modello: model, stato: r.status, dettaglio: detail });
      if (r.status === 404 || r.status === 400) continue;
      if (r.status === 429) return reply(429, { error: 'rate_limited' });
      return reply(502, { error: 'upstream' });
    }
    const data = await r.json().catch(() => ({}));
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter((c) => c && c.type === 'text').map((c) => c.text || '').join('');
    if (!text.trim()) {
      // risposta senza testo (per esempio finita nel ragionamento): annota e prova il modello successivo
      await noteError(store, { fase: 'risposta vuota', modello: model, fine: data.stop_reason || null, blocchi: blocks.map((c) => c && c.type).join(',') });
      continue;
    }
    try { return reply(200, extractJson(text)); }
    catch { await noteError(store, { fase: 'risposta', modello: model, fine: data.stop_reason || null, dettaglio: text.slice(0, 200) }); return reply(502, { error: 'invalid_json' }); }
  }
  return reply(502, { error: 'no_model' });
};

export const config = {
  path: '/api/progetta',
  rateLimit: { windowLimit: 3, windowSize: 180, aggregateBy: ['ip', 'domain'] }
};
