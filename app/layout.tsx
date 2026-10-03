import './globals.css';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getSiteDesign } from '@/lib/site-design';

export const metadata: Metadata = { title: 'Bible Academy', description: 'Plataforma de ensino bíblico.' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	const design = await getSiteDesign();
	const themeStyle = {
		'--accent': design.accent_color,
		'--accent2': design.accent_secondary,
	} as CSSProperties;

	return (
		<html lang="pt-BR">
			<body style={themeStyle}>{children}</body>
		</html>
	);
}
