import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantConfig } from '@/lib/tenant-resolver';
import TenantHero from '@/components/tenant/TenantHero';
import FeatureGrid from '@/components/tenant/FeatureGrid';
import PricingSection from '@/components/tenant/PricingSection';

interface PageProps {
  params: {
    subdomain: string;
  };
}

export async function generateMetadata({ params }: PageProps) {
  const tenant = await getTenantConfig(params.subdomain);
  if (!tenant) return { title: 'Workspace Not Found' };

  return {
    title: `${tenant.name} | Powered by Cloud-Backend`,
    description: tenant.tagline || 'Next-generation cloud infrastructure platform.',
  };
}

export default async function SubdomainLandingPage({ params }: PageProps) {
  const { subdomain } = params;
  const config = await getTenantConfig(subdomain);

  if (!config) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white selection:bg-indigo-500 selection:text-white">
      {/* Dynamic Subdomain Banner */}
      <div className="border-b border-indigo-500/20 bg-indigo-950/30 px-6 py-2.5 text-center text-xs font-mono text-indigo-300 flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        Multi-Tenant Active Instance: <strong className="text-white underline">{subdomain}.cloud-backend.io</strong>
      </div>

      {/* Hero Section */}
      <TenantHero 
        name={config.name} 
        headline={config.headline} 
        ctaUrl={config.ctaUrl}
        accentColor={config.themeColor || '#6366f1'} 
      />

      {/* Dynamic Features Grid */}
      <FeatureGrid features={config.features} />

      {/* Pricing & Plan Details */}
      <PricingSection tiers={config.tiers} />
    </main>
  );
}
