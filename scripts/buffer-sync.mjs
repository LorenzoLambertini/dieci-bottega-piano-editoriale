// Dieci Bottega · sincronizzazione coda -> Buffer
// Legge coda/coda.json, guarda quanti post sono già programmati su ogni canale Buffer
// e riempie gli slot liberi con i prossimi contenuti, in ordine di data.
// Richiede il secret BUFFER_API_KEY. DRY_RUN=1 per vedere cosa farebbe senza toccare Buffer.

import fs from "node:fs";

const API = "https://api.buffer.com";
const KEY = process.env.BUFFER_API_KEY;
const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const CODA = "coda/coda.json";
const MARGINE_MS = 2 * 60 * 1000; // non programma nulla che esce tra meno di 2 minuti
const MAX_TENTATIVI = 3;

if (!KEY) {
  fs.mkdirSync("coda", { recursive: true });
  fs.writeFileSync("coda/STATO.md", `# Stato coda social\n\nUltimo controllo: ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}\n\n**Manca il secret BUFFER_API_KEY** nelle impostazioni del repo: non ho potuto parlare con Buffer.\n`);
  console.error("Manca BUFFER_API_KEY"); process.exit(0);
}

const coda = JSON.parse(fs.readFileSync(CODA, "utf8"));
const BASE = coda.baseUrl.replace(/\/?$/, "/");
const LIMITE = Number(process.env.SLOT_PER_CANALE || coda.slotPerCanale || 10);
const url = (p) => BASE + p.split("/").map(encodeURIComponent).join("/");
const log = (...a) => console.log(...a);

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) {
    throw new Error(`Buffer ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 800)}`);
  }
  return body.data;
}

// ---------- schema: legge i campi reali per non mandare campi che Buffer non conosce
const TIPI = ["Post", "PostInputMetaData", "InstagramPostMetadataInput", "FacebookPostMetadataInput",
  "LinkedInPostMetadataInput", "VideoAssetInput", "DocumentAssetInput", "ImageAssetInput", "PostType", "Channel"];
async function leggiSchema() {
  const q = "query {" + TIPI.map((t, i) => `t${i}: __type(name: "${t}") { name kind fields { name } inputFields { name type { kind name ofType { kind name ofType { name } } } } enumValues { name } }`).join(" ") + "}";
  try {
    const d = await gql(q);
    const s = {};
    TIPI.forEach((t, i) => { s[t] = d[`t${i}`]; });
    fs.mkdirSync("coda", { recursive: true });
    fs.writeFileSync("coda/buffer-schema.json", JSON.stringify(s, null, 2));
    return s;
  } catch (e) { log("Schema non leggibile, vado con i default:", e.message); return {}; }
}
const campi = (s, t) => new Set((s[t]?.inputFields || s[t]?.fields || []).map((f) => f.name));
const enumv = (s, t) => new Set((s[t]?.enumValues || []).map((v) => v.name));
function pota(obj, ammessi) { // toglie le chiavi che lo schema non prevede
  if (!ammessi || ammessi.size === 0) return obj;
  return Object.fromEntries(Object.entries(obj).filter(([k]) => ammessi.has(k)));
}

// ---------- utilità data
const giornoRoma = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

async function main() {
  const schema = await leggiSchema();
  const postFields = campi(schema, "Post");
  const chFieldFromPost = postFields.has("channelId") ? "channelId" : "channel { id }";

  const acc = await gql("query { account { organizations { id name } } }");
  const orgs = acc.account.organizations;
  if (!orgs.length) throw new Error("Nessuna organizzazione Buffer");
  const org = orgs[0];
  log(`Organizzazione: ${org.name} (${org.id})`);

  const chd = await gql(`query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name service isDisconnected isLocked } }`);
  const canali = {};
  for (const c of chd.channels) {
    if (c.isDisconnected || c.isLocked) continue;
    if (!canali[c.service]) canali[c.service] = c; // instagram, facebook, linkedin
  }
  fs.writeFileSync("coda/canali-buffer.json", JSON.stringify(chd.channels, null, 2));
  log("Canali:", Object.entries(canali).map(([s, c]) => `${s}=${c.name}`).join(", "));

  // pulizia una tantum: elimina da Buffer i post elencati in coda/da-eliminare.json
  if (fs.existsSync("coda/da-eliminare.json") && !DRY) {
    const lista = JSON.parse(fs.readFileSync("coda/da-eliminare.json", "utf8"));
    const rimasti = [];
    for (const e of lista) {
      try {
        await gql(`mutation { deletePost(input: { id: ${JSON.stringify(e.id)} }) { __typename } }`);
        log(`🗑 eliminato ${e.canale} ${e.dueAt}`);
      } catch (err) { log(`✗ eliminazione ${e.id}: ${err.message}`); rimasti.push({ ...e, errore: err.message.slice(0, 300) }); }
    }
    if (rimasti.length) fs.writeFileSync("coda/da-eliminare.json", JSON.stringify(rimasti, null, 2));
    else fs.unlinkSync("coda/da-eliminare.json");
  }

  // testi cambiati dopo la programmazione: elimina il vecchio post, verrà ricreato con il testo nuovo
  if (!DRY) for (const item of coda.contenuti) for (const [servizio, c] of Object.entries(item.canali)) {
    if (!c.daAggiornare || !c.bufferId) continue;
    try {
      await gql(`mutation { deletePost(input: { id: ${JSON.stringify(c.bufferId)} }) { __typename } }`);
      log(`↻ ${item.id} ${servizio}: vecchio testo rimosso, lo riprogrammo`);
      c.stato = "da_programmare"; delete c.bufferId; delete c.programmatoIl; delete c.daAggiornare;
    } catch (e) { log(`✗ aggiornamento ${item.id} ${servizio}: ${e.message}`); }
  }

  // post già programmati
  const programmati = {}; // channelId -> [{id, dueAt}]
  let after = null;
  for (let pagina = 0; pagina < 10; pagina++) {
    const d = await gql(`query { posts(first: 100${after ? `, after: ${JSON.stringify(after)}` : ""}, input: { organizationId: ${JSON.stringify(org.id)}, filter: { status: [scheduled] } }) { edges { node { id dueAt text ${chFieldFromPost} ${postFields.has('assets') ? 'assets { source mimeType }' : ''} } } pageInfo { hasNextPage endCursor } } }`);
    for (const { node } of d.posts.edges) {
      const cid = node.channelId || node.channel?.id;
      (programmati[cid] ||= []).push({ id: node.id, dueAt: node.dueAt, text: node.text || "", assets: (node.assets || []).map((a) => ({ src: a.source, tipo: a.mimeType })) });
    }
    if (!d.posts.pageInfo?.hasNextPage) break;
    after = d.posts.pageInfo.endCursor;
  }
  fs.writeFileSync("coda/buffer-programmati.json", JSON.stringify(Object.fromEntries(Object.entries(canali).map(([s, c]) => [s, (programmati[c.id] || []).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))])), null, 2));
  const liberi = {};
  for (const [s, c] of Object.entries(canali)) {
    const n = (programmati[c.id] || []).length;
    liberi[s] = Math.max(0, LIMITE - n);
    log(`${s}: ${n} programmati, ${liberi[s]} slot liberi`);
  }

  // ordine della coda: se un contenuto pronto esce PRIMA dell'ultimo post già su Buffer e il canale è pieno,
  // tolgo il post più lontano (tornerà in coda) così Buffer contiene sempre le prossime uscite in ordine di data
  {
    const adesso = Date.now();
    for (const [s, canale] of Object.entries(canali)) {
      const lista = (programmati[canale.id] ||= []);
      const attesa = coda.contenuti.filter((i) => i.canali[s]?.stato === "da_programmare" && !i.canali[s]?.ultimoErrore &&
        new Date(i.dueAt).getTime() > adesso + MARGINE_MS).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      for (const it of attesa) {
        if (liberi[s] > 0) { liberi[s]--; continue; }
        const lontano = [...lista].sort((a, b) => String(b.dueAt).localeCompare(String(a.dueAt)))[0];
        if (!lontano || String(lontano.dueAt) <= it.dueAt) break;
        if (!DRY) {
          try { await gql(`mutation { deletePost(input: { id: ${JSON.stringify(lontano.id)} }) { __typename } }`); }
          catch (e) { log(`✗ non riesco a liberare uno slot su ${s}: ${e.message}`); break; }
        }
        lista.splice(lista.indexOf(lontano), 1);
        for (const i of coda.contenuti) {
          const c = i.canali[s];
          if (c && (c.bufferId === lontano.id || (c.stato === "gia_in_buffer" && giornoRoma(i.dueAt) === giornoRoma(lontano.dueAt)))) {
            c.stato = "da_programmare"; delete c.bufferId; delete c.programmatoIl;
          }
        }
        log(`↧ ${s}: tolto il post del ${giornoRoma(lontano.dueAt)} per far posto a ${it.id} (${it.quando}), tornerà in coda`);
      }
      liberi[s] = Math.max(0, LIMITE - lista.length);
    }
  }


  const ora = Date.now();
  const ig = campi(schema, "InstagramPostMetadataInput");
  const fb = campi(schema, "FacebookPostMetadataInput");
  const meta = campi(schema, "PostInputMetaData");
  const vid = campi(schema, "VideoAssetInput");
  const doc = campi(schema, "DocumentAssetInput");
  const tipiPost = enumv(schema, "PostType");
  const tipo = (t) => (tipiPost.size === 0 || tipiPost.has(t) ? t : undefined);

  function costruisci(item, servizio, c) {
    const assets = [];
    if (c.video) assets.push({ video: pota({ url: url(c.video), metadata: { thumbnailOffset: 1500 } }, vid) });
    if (c.immagini) for (const p of c.immagini) assets.push({ image: { url: url(p) } });
    if (c.documento) assets.push({ document: pota({ url: url(c.documento), title: c.titoloDocumento || item.titolo, thumbnailUrl: c.copertina ? url(c.copertina) : undefined }, doc) });
    const input = { channelId: canali[servizio].id, text: c.testo, schedulingType: "automatic", mode: "customScheduled", dueAt: item.dueAt, assets };
    const isReel = !!c.video;
    let m;
    if (servizio === "instagram") m = { instagram: pota({ type: tipo(isReel ? "reel" : "post"), shouldShareToFeed: true }, ig) };
    if (servizio === "facebook") m = { facebook: pota({ type: tipo(isReel ? "reel" : "post") }, fb) };
    if (m) {
      const pulito = pota(m, meta);
      if (Object.keys(pulito).length) input.metadata = JSON.parse(JSON.stringify(pulito));
    }
    return JSON.parse(JSON.stringify(input)); // toglie gli undefined
  }

  const MUT = `mutation($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`;
  let creati = 0, cambiato = false;

  for (const item of coda.contenuti) {
    for (const [servizio, c] of Object.entries(item.canali)) {
      if (c.stato !== "da_programmare") continue;
      const canale = canali[servizio];
      if (!canale) continue;
      const due = new Date(item.dueAt).getTime();
      if (due < ora + MARGINE_MS) { c.stato = "scaduto"; cambiato = true; log(`· ${item.id} ${servizio}: data passata, segnato scaduto`); continue; }
      const stessoGiorno = (programmati[canale.id] || []).find((p) => p.dueAt && giornoRoma(p.dueAt) === giornoRoma(item.dueAt));
      if (stessoGiorno) { c.stato = "gia_in_buffer"; c.bufferId = stessoGiorno.id; cambiato = true; log(`· ${item.id} ${servizio}: c'è già un post quel giorno, lo considero fatto`); continue; }
      if (liberi[servizio] <= 0) continue;

      const input = costruisci(item, servizio, c);
      if (DRY) { log(`[prova] ${item.id} ${servizio} ${item.quando}`, JSON.stringify(input).slice(0, 300)); liberi[servizio]--; continue; }
      try {
        const r = await gql(MUT, { input });
        const out = r.createPost;
        if (out.__typename === "PostActionSuccess" || out.post) {
          c.stato = "programmato"; c.bufferId = out.post.id; c.programmatoIl = new Date().toISOString();
          delete c.ultimoErrore; delete c.tentativi;
          (programmati[canale.id] ||= []).push({ id: out.post.id, dueAt: item.dueAt });
          liberi[servizio]--; creati++; log(`✓ ${item.id} ${servizio} ${item.quando}`);
        } else {
          throw new Error(out.message || out.__typename);
        }
      } catch (e) {
        c.tentativi = (c.tentativi || 0) + 1; c.ultimoErrore = e.message.slice(0, 500);
        if (c.tentativi >= MAX_TENTATIVI) c.stato = "errore";
        log(`✗ ${item.id} ${servizio}: ${c.ultimoErrore}`);
      }
      cambiato = true;
    }
  }

  // metriche dei post usciti (Buffer le aggiorna una volta al giorno)
  try {
    const perId = {};
    for (const it of coda.contenuti) for (const [sv, c] of Object.entries(it.canali)) if (c.bufferId) perId[c.bufferId] = { id: it.id, titolo: it.titolo, tipo: it.tipo };
    const righeM = [];
    for (const [servizio, canale] of Object.entries(canali)) {
      const d = await gql(`query { posts(first: 100, input: { organizationId: ${JSON.stringify(org.id)}, filter: { status: [sent], channelIds: [${JSON.stringify(canale.id)}] } }) { edges { node { id text dueAt sentAt metrics { type name value unit } metricsUpdatedAt } } } }`);
      for (const { node } of d.posts.edges) {
        const m = Object.fromEntries((node.metrics || []).map((x) => [x.type, x.value]));
        righeM.push({ canale: servizio, bufferId: node.id, contenuto: perId[node.id]?.id || null, titolo: perId[node.id]?.titolo || (node.text || "").slice(0, 60), uscito: node.sentAt || node.dueAt, aggiornato: node.metricsUpdatedAt, metriche: m });
      }
    }
    fs.mkdirSync("crescita/storico", { recursive: true });
    fs.writeFileSync("crescita/metriche-post.json", JSON.stringify(righeM, null, 2));
    if (!DRY) fs.writeFileSync(`crescita/storico/${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(righeM, null, 2));
    log(`Metriche: ${righeM.length} post usciti letti`);
  } catch (e) { log("Metriche non disponibili:", e.message); fs.mkdirSync("crescita", { recursive: true }); fs.writeFileSync("crescita/metriche-errore.txt", e.message); }

  // riepilogo leggibile
  const righe = ["# Stato coda social", "", `Ultimo controllo: ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}${DRY ? " (prova, niente inviato)" : ""}`, "",
    "| Canale | Programmati su Buffer | Slot liberi |", "|---|---|---|",
    ...Object.keys(canali).map((s) => `| ${s} | ${(programmati[canali[s].id] || []).length} | ${liberi[s]} |`), "",
    "## Prossimi in coda", "", "| Quando | ID | Titolo | Instagram | Facebook | LinkedIn |", "|---|---|---|---|---|---|"];
  const prossimi = coda.contenuti.filter((i) => Object.values(i.canali).some((c) => ["da_programmare", "programmato", "manca_video", "errore"].includes(c.stato)) && new Date(i.dueAt).getTime() > ora).slice(0, 25);
  for (const i of prossimi) righe.push(`| ${i.quando} | ${i.id} | ${i.titolo} | ${i.canali.instagram?.stato || "–"} | ${i.canali.facebook?.stato || "–"} | ${i.canali.linkedin?.stato || "–"} |`);
  righe.push("", "## Cosa c'è su Buffer adesso", "");
  for (const [s, c] of Object.entries(canali)) {
    righe.push(`### ${s}`, "");
    for (const p of [...(programmati[c.id] || [])].sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))))
      righe.push(`- ${new Date(p.dueAt).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })} · ${(p.text || "").replace(/\s+/g, " ").slice(0, 70)}`);
    righe.push("");
  }
  const errori = coda.contenuti.flatMap((i) => Object.entries(i.canali).filter(([, c]) => c.ultimoErrore).map(([s, c]) => `- ${i.id} ${s}: ${c.ultimoErrore}`));
  if (errori.length) righe.push("", "## Errori", "", ...errori);
  if (fs.existsSync("coda/sostituzioni.md")) {
    const ultime = fs.readFileSync("coda/sostituzioni.md", "utf8").split("\n").filter((r) => r.startsWith("- ")).slice(-5);
    if (ultime.length) righe.push("", "## Ultime sostituzioni automatiche", "", ...ultime);
  }
  fs.writeFileSync("coda/STATO.md", righe.join("\n") + "\n");

  if (!DRY) fs.writeFileSync(CODA, JSON.stringify(coda, null, 2) + "\n");
  log(`Fatto: ${creati} nuovi post su Buffer.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
