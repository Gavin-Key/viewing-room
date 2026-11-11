import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Viewing Room', description: 'A WebXR image and video gallery viewer for Meta Quest.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en" className="dark"><body>{children}</body></html>; }

