// Diagnosi: stato ed errori degli ultimi post per canale, scritti in coda/diagnosi.json
import fs from "node:fs";
const KEY = process.env.BUFFER_API_KEY;
async function gql(query) {
  const r = await fetch("https://api.buffer.com", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ query }) });
  const b = await r.json().catch(() => ({})); if (!r.ok || b.errors) throw new Error(JSON.stringify(b.errors || b).slice(0, 1500)); return b.data;
}
const out = {};
try {
  const t = await gql(`query { p: __type(name: "Post") { fields { name type { kind name ofType { kind name ofType { name } } } } } s: __type(name: "PostStatus") { enumValues { name } } }`);
  out.statiPossibili = (t.s?.enumValues || []).map((e) => e.name);
  const nome = (f) => f.type.name || f.type.ofType?.name || f.type.ofType?.ofType?.name;
  const tipiOgg = {};
  for (const f of t.p.fields) {
    const n = nome(f);
    if (["error", "metadata", "notificationStatus", "shareMode", "status", "via", "schedulingType"].includes(f.name)) tipiOgg[f.name] = n;
  }
  out.tipi = tipiOgg;
  const sotto = {};
  for (const [campo, tipo] of Object.entries(tipiOgg)) {
    const d = await gql(`query { x: __type(name: "${tipo}") { kind fields { name type { kind name ofType { name } } } enumValues { name } possibleTypes { name } } }`);
    sotto[campo] = d.x;
  }
  out.sottotipi = sotto;
  const sel = (campo) => {
    const x = sotto[campo]; if (!x || x.kind === "ENUM" || x.kind === "SCALAR") return campo;
    if (x.kind === "OBJECT") return `${campo} { ${x.fields.filter((f) => ["SCALAR", "ENUM"].includes(f.type.kind) || ["SCALAR", "ENUM"].includes(f.type.ofType?.kind)).map((f) => f.name).join(" ") || "__typename"} }`;
    return `${campo} { __typename }`;
  };
  const acc = await gql(`query { account { organizations { id } } }`);
  const org = acc.account.organizations[0].id;
  const ch = await gql(`query { channels(input: { organizationId: "${org}" }) { id name service isDisconnected isLocked } }`);
  out.canali = ch.channels;
  const campi = ["id", "dueAt", "sentAt", "text", "channelService", ...Object.keys(tipiOgg).filter((c) => c !== "metadata").map(sel)].join(" ");
  out.post = {};
  for (const stato of out.statiPossibili.length ? out.statiPossibili : ["scheduled", "sent", "error"]) {
    try {
      const d = await gql(`query { posts(first: 30, input: { organizationId: "${org}", filter: { status: [${stato}] } }) { edges { node { ${campi} } } } }`);
      out.post[stato] = d.posts.edges.map((e) => e.node).filter((p) => !p.dueAt || p.dueAt > "2026-10-05").map((p) => ({ ...p, text: (p.text || "").slice(0, 60) }));
    } catch (e) { out.post[stato] = "ERR " + e.message.slice(0, 300); }
  }
} catch (e) { out.errore = e.message; }
out.link = {};
for (const u of ["media/reel/R06b.mp4", "media/reel/R02.mp4", "media/reel/R07.mp4", "index.html"]) {
  try { const r = await fetch("https://lorenzolambertini.github.io/dieci-bottega-piano-editoriale/" + u, { method: "HEAD" }); out.link[u] = r.status + " " + (r.headers.get("last-modified") || "") + " " + (r.headers.get("content-length") || ""); }
  catch (e) { out.link[u] = "ERR " + e.message; }
}
fs.writeFileSync("coda/diagnosi.json", JSON.stringify(out, null, 2));
console.log("diagnosi scritta");
