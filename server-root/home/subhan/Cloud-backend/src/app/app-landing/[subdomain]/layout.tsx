import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
};

export default function SubdomainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { subdomain: string };
}) {
  return (
    <div className="tenant-wrapper" data-subdomain={params.subdomain}>
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/40 border-b border-white/10 px-8 py-4 flex justify-between items-center">
        <div className="font-bold tracking-tight text-lg text-white flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-mono text-sm font-black shadow-lg shadow-indigo-500/30">
            {params.subdomain.charAt(0).toUpperCase()}
          </div>
          <span className="capitalize">{params.subdomain}</span>
        </div>
        <nav className="flex gap-6 text-sm text-zinc-300">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#docs" className="hover:text-white transition-colors">Documentation</a>
          <button className="px-4 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-md">
            Sign In
          </button>
        </nav>
      </header>
      {children}
    </div>
  );
}
