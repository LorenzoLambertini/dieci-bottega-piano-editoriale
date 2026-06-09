-- ═══════════════════════════════════════════════════════════════
-- DIECI BOTTEGA · Setup database Supabase per sincronizzazione
-- ═══════════════════════════════════════════════════════════════
-- Esegui questo nello SQL Editor di Supabase (Dashboard → SQL Editor → New query)
-- Crea due tabelle: una per i task della coda, una per gli script generati.
-- ───────────────────────────────────────────────────────────────

-- 1) Tabella stato task della coda produzione
--    Una riga per ogni task spuntato/despuntato. La chiave è l'id deterministico del task.
create table if not exists public.db_queue_state (
  task_id     text primary key,
  done        boolean not null default false,
  updated_by  text,                                   -- "lorenzo" | "tommaso" | "insieme"
  updated_at  timestamptz not null default now()
);

-- 2) Tabella script generati condivisi (opzionale ma utile)
--    Conserva l'ultimo set di script generato + il relativo stato checklist.
create table if not exists public.db_scripts_state (
  id          text primary key default 'shared',      -- riga singola condivisa
  payload     jsonb not null default '[]'::jsonb,      -- array di video con checklist
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- 3) Tabella contenuti editoriali condivisi
--    Conserva TUTTI i contenuti modificabili dell'app (strategia, pilastri,
--    rubriche, calendario, script, carousel, LinkedIn, visuale) in un'unica
--    riga "shared". Quando Lorenzo o Tommaso modifica/aggiunge/elimina un
--    contenuto, l'altro lo vede al refresh successivo.
create table if not exists public.db_content_state (
  id          text primary key default 'shared',      -- riga singola condivisa
  payload     jsonb not null default '{}'::jsonb,      -- oggetto con tutti gli array di contenuti
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- Row Level Security
-- ───────────────────────────────────────────────────────────────
alter table public.db_queue_state   enable row level security;
alter table public.db_scripts_state enable row level security;
alter table public.db_content_state enable row level security;

-- Policy: consenti lettura e scrittura a chiunque abbia la publishable/anon key.
-- (Il sito è già protetto da password lato client; questo è uno strumento
--  interno a 2 persone, non un'app pubblica con dati sensibili.)
drop policy if exists "queue_all" on public.db_queue_state;
create policy "queue_all" on public.db_queue_state
  for all using (true) with check (true);

drop policy if exists "scripts_all" on public.db_scripts_state;
create policy "scripts_all" on public.db_scripts_state
  for all using (true) with check (true);

drop policy if exists "content_all" on public.db_content_state;
create policy "content_all" on public.db_content_state
  for all using (true) with check (true);

-- ───────────────────────────────────────────────────────────────
-- Realtime (opzionale): consente aggiornamenti live senza polling.
-- Il codice usa comunque un polling di sicurezza, quindi questo è un extra.
-- ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.db_queue_state;
alter publication supabase_realtime add table public.db_content_state;

-- Fatto. Torna nell'app e inserisci URL + publishable key nel pannello Sync.
