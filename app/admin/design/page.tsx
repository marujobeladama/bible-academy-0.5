import { getSiteDesign } from '@/lib/site-design';
import { resolvePublicImageUrl } from '@/lib/imgur';
import { requireAdminPage } from '@/lib/require-admin-page';
import { SiteDesignForm } from '@/components/admin/SiteDesignForm';

export default async function AdminSiteDesign() {
  await requireAdminPage();
  const design = await getSiteDesign();
  const resolvedHeroImage = await resolvePublicImageUrl(design.hero_image_url);

  return (
    <div className="panel">
      <div className="eyebrow">Personalização global</div>
      <h1 style={{ margin: '4px 0' }}>Design do site.</h1>
      <p className="muted">Ajuste a identidade e os destaques em uma única tela.</p>
      <SiteDesignForm key={JSON.stringify(design)} initial={design} resolvedHeroImage={resolvedHeroImage} />
    </div>
  );
}