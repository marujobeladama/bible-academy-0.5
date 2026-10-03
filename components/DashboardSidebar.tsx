'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Meus cursos' },
  { href: '/dashboard/aulas-ao-vivo', label: 'Aulas ao vivo' },
  { href: '/dashboard/materiais', label: 'Materiais' },
  { href: '/dashboard/perfil', label: 'Perfil' },
];

export function DashboardSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, { href: '/admin/cursos', label: 'Admin' }] : LINKS;
  return (
    <aside className="sidebar">
      {links.map((link) => {
        const active = link.href === '/dashboard' ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link key={link.href} className={`side-link${active ? ' active' : ''}`} href={link.href}>
            {link.label}
          </Link>
        );
      })}
    </aside>
  );
}
