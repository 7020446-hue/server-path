import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  const { subdomain } = params;

  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: subdomain.toLowerCase() },
      include: {
        domainSettings: true,
        customTheme: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant record not found', code: 'TENANT_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      subdomain,
      tenantId: tenant.id,
      name: tenant.name,
      verified: tenant.isVerified,
      customDomain: tenant.domainSettings?.customDomain || null,
      sslStatus: tenant.domainSettings?.sslActive ? 'active' : 'pending',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}
