import Link from 'next/link';

type MobileSiteMenuProps = {
  links: Array<{ href: string; label: string }>;
  action?: { href: string; label: string };
};

export function MobileSiteMenu({ links, action }: MobileSiteMenuProps) {
  return (
    <details className="mobile-site-menu">
      <summary className="mobile-site-menu-trigger" aria-label="Abrir menu">
        <span className="mobile-site-menu-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </summary>
      <nav className="mobile-site-menu-panel" aria-label="Navegação móvel">
        {links.map((link) => (
          <Link key={`${link.href}-${link.label}`} href={link.href}>{link.label}</Link>
        ))}
        {action && <Link className="mobile-site-menu-action" href={action.href}>{action.label}</Link>}
      </nav>
    </details>
  );
}