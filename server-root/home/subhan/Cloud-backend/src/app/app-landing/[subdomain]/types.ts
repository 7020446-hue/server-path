export interface SubdomainConfig {
  subdomain: string;
  name: string;
  headline: string;
  tagline: string;
  themeColor: string;
  ctaUrl: string;
  features: Array<{
    title: string;
    description: string;
    icon: string;
  }>;
  tiers: Array<{
    name: string;
    price: number;
    billingPeriod: 'monthly' | 'yearly';
    features: string[];
    isPopular?: boolean;
  }>;
}

export interface TenantDomainResolution {
  isValid: boolean;
  tenantId?: string;
  customHost?: string;
  rewriteDestination?: string;
}
