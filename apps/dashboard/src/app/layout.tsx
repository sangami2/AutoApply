import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Job Application Copilot',
  description: 'Discover, evaluate, and submit job applications intelligently',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <nav className="bg-gray-900 text-white p-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold">Job Copilot</h1>
            <div className="flex gap-6">
              <a href="/dashboard" className="hover:text-gray-300">Dashboard</a>
              <a href="/jobs" className="hover:text-gray-300">Jobs</a>
              <a href="/applications" className="hover:text-gray-300">Applications</a>
              <a href="/interventions" className="hover:text-gray-300">Interventions</a>
              <a href="/logs" className="hover:text-gray-300">Logs</a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto p-4">
          {children}
        </main>
      </body>
    </html>
  );
}
