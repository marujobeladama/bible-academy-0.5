'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ADMIN_ONLY_LINKS = [
  { href: '/', label: 'Voltar ao site' },
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/cursos', label: 'Cursos' },
  { href: '/admin/preview', label: 'Ver como aluno' },
  { href: '/admin/design', label: 'Design do site' },
  { href: '/admin/alunos', label: 'Alunos' },
];

// Professor (role=teacher) só gerencia conteúdo dos cursos atribuídos a
// ele — sem alunos, sem design do site, sem preview global. Cada um desses
// links também é bloqueado na própria página caso alguém tente acessar a
// URL direto (ver app/admin/alunos/page.tsx e app/admin/design/page.tsx).
const TEACHER_LINKS = [
  { href: '/', label: 'Voltar ao site' },
  { href: '/admin', label: 'Meus cursos' },
];

export function AdminNav({ role }: { role?: string | null }) {
  const pathname = usePathname();
  const links = role === 'admin' ? ADMIN_ONLY_LINKS : TEACHER_LINKS;
  return (
    <aside className="sidebar">
      {links.map((link) => {
        const active = link.href === '/admin' ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link key={link.href} className={`side-link${active ? ' active' : ''}`} href={link.href}>
            {link.label}
          </Link>
        );
      })}
    </aside>
  );
}
