import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'QuimicDraw - Adivinhe o Hidrocarboneto!',
  description: 'Jogo educativo de adivinhação de hidrocarbonetos em tempo real',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
