-- =============================================
-- Recto — Schéma de signaling WebRTC
-- À exécuter dans l'éditeur SQL de Supabase
-- =============================================

create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  host_id     uuid references auth.users on delete set null,
  offer       jsonb,
  answer      jsonb,
  status      text not null default 'waiting'
                check (status in ('waiting', 'connected', 'ended')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '15 minutes')
);

-- Index pour chercher par code rapidement
create index if not exists sessions_code_idx on public.sessions (code);
-- Index pour nettoyer les sessions expirées
create index if not exists sessions_expires_idx on public.sessions (expires_at);

-- Grants explicites pour les rôles (requis avec les nouvelles API keys Supabase)
grant select, insert, update on public.sessions to anon;
grant select, insert, update on public.sessions to authenticated;

-- Row Level Security
alter table public.sessions enable row level security;

-- N'importe qui peut créer une session (hôte anonyme ou connecté)
create policy "create_session" on public.sessions
  for insert with check (true);

-- N'importe qui peut lire une session waiting par son code (pour rejoindre)
create policy "read_waiting_session" on public.sessions
  for select using (status = 'waiting' or status = 'connected');

-- Mettre à jour la session (soumettre l'answer, changer le status)
create policy "update_session" on public.sessions
  for update using (true);

-- Activer Realtime sur la table sessions
alter publication supabase_realtime add table public.sessions;

-- =============================================
-- Fonction de nettoyage automatique (cron)
-- Appeler via pg_cron ou Supabase Edge Function scheduled
-- =============================================
create or replace function public.cleanup_expired_sessions()
returns void language sql security definer as $$
  delete from public.sessions where expires_at < now();
$$;
