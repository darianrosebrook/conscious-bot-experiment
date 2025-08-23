import React from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Conscious Minecraft Bot - Dashboard',
  description: 'Real-time dashboard for monitoring the conscious Minecraft bot',
  authors: [{ name: '@darianrosebrook' }],
};

/**
 * Root layout for the Conscious Minecraft Bot Dashboard
 * Provides the base HTML structure and global styles
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
