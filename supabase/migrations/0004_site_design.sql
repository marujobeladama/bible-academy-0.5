create table if not exists public.site_design_settings (
  id boolean primary key default true check (id),
  brand_name text not null default 'Bible Academy' check (char_length(brand_name) between 2 and 60),
  accent_color text not null default '#24483a' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_secondary text not null default '#d6b36a' check (accent_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  hero_title text not null default 'Estude a Bíblia com profundidade e propósito.' check (char_length(hero_title) between 3 and 140),
  hero_description text not null default 'Uma plataforma moderna para cursos bíblicos, aulas em vídeo, materiais escritos e acompanhamento do seu progresso em um só lugar.' check (char_length(hero_description) <= 500),
  hero_image_url text,
  updated_at timestamptz not null default now()
);

alter table public.site_design_settings enable row level security;

drop policy if exists "public site design read" on public.site_design_settings;
create policy "public site design read" on public.site_design_settings
  for select to anon, authenticated using (true);

drop policy if exists "admin site design insert" on public.site_design_settings;
create policy "admin site design insert" on public.site_design_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin site design update" on public.site_design_settings;
create policy "admin site design update" on public.site_design_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.site_design_settings to anon, authenticated;
grant insert, update on public.site_design_settings to authenticated;

insert into public.site_design_settings (id)
values (true)
on conflict (id) do nothing;