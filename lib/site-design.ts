import { cache } from 'react';
import { getSupabaseServer } from '@/lib/supabase-server';

const DEFAULT_SITE_DESIGN = {
  brand_name: 'Bible Academy',
  accent_color: '#24483a',
  accent_secondary: '#d6b36a',
  hero_title: 'Estude a Bíblia com profundidade e propósito.',
  hero_description:
    'Uma plataforma moderna para cursos bíblicos, aulas em vídeo, materiais escritos e acompanhamento do seu progresso em um só lugar.',
  hero_image_url: null as string | null,
};

export type SiteDesignSettings = typeof DEFAULT_SITE_DESIGN;

export const getSiteDesign = cache(async () => {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('site_design_settings')
    .select('brand_name, accent_color, accent_secondary, hero_title, hero_description, hero_image_url')
    .eq('id', true)
    .maybeSingle();

  return { ...DEFAULT_SITE_DESIGN, ...data };
});