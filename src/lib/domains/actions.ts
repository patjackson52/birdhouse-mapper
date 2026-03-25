'use server';

import { createClient } from '@/lib/supabase/server';
import { addDomainToVercel, removeDomainFromVercel, checkDomainOnVercel } from './vercel';

interface AddDomainResult {
  success: boolean;
  domainId?: string;
  verificationRecords?: { type: string; domain: string; value: string }[];
  error?: string;
}

/**
 * Add a custom domain to an org (and optionally a specific property).
 * Calls Vercel API to register the domain, stores verification requirements.
 */
export async function addCustomDomain(
  orgId: string,
  domain: string,
  propertyId?: string
): Promise<AddDomainResult> {
  const supabase = await createClient();

  // Validate caller is org admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Register with Vercel
  let vercelResponse;
  try {
    vercelResponse = await addDomainToVercel(domain);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // Determine domain type from the domain string
  const parts = domain.split('.');
  const domainType = parts.length <= 2 ? 'apex' : 'subdomain';

  // Store in database
  const { data, error } = await supabase
    .from('custom_domains')
    .insert({
      org_id: orgId,
      property_id: propertyId ?? null,
      domain,
      status: vercelResponse.verified ? 'active' : 'verifying',
      verification_token: vercelResponse.verification
        ? JSON.stringify(vercelResponse.verification)
        : null,
      verified_at: vercelResponse.verified ? new Date().toISOString() : null,
      domain_type: domainType,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    domainId: data.id,
    verificationRecords: vercelResponse.verification?.map(v => ({
      type: v.type,
      domain: v.domain,
      value: v.value,
    })),
  };
}

/**
 * Remove a custom domain from an org.
 * Removes from Vercel and deletes from database.
 */
export async function removeCustomDomain(domainId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Fetch the domain
  const { data: domainRow, error: fetchError } = await supabase
    .from('custom_domains')
    .select('domain')
    .eq('id', domainId)
    .single();

  if (fetchError || !domainRow) return { success: false, error: 'Domain not found' };

  // Remove from Vercel (silently succeeds if already removed)
  try {
    await removeDomainFromVercel(domainRow.domain);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // Delete from database
  const { error } = await supabase
    .from('custom_domains')
    .delete()
    .eq('id', domainId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Check the current verification status of a domain.
 * Polls Vercel API and updates the database if status changed.
 */
export async function checkDomainStatus(domainId: string): Promise<{
  status: string;
  verified: boolean;
  verificationRecords?: { type: string; domain: string; value: string }[];
  error?: string;
}> {
  const supabase = await createClient();

  const { data: domainRow } = await supabase
    .from('custom_domains')
    .select('domain, status')
    .eq('id', domainId)
    .single();

  if (!domainRow) return { status: 'not_found', verified: false, error: 'Domain not found' };

  const vercelStatus = await checkDomainOnVercel(domainRow.domain);

  if (!vercelStatus) {
    // Domain not on Vercel — mark as failed
    await supabase.from('custom_domains')
      .update({ status: 'failed', last_checked_at: new Date().toISOString() })
      .eq('id', domainId);
    return { status: 'failed', verified: false };
  }

  // Update status if it changed
  const newStatus = vercelStatus.verified ? 'active' : 'verifying';
  if (newStatus !== domainRow.status) {
    await supabase.from('custom_domains')
      .update({
        status: newStatus,
        verified_at: vercelStatus.verified ? new Date().toISOString() : null,
        last_checked_at: new Date().toISOString(),
      })
      .eq('id', domainId);
  } else {
    await supabase.from('custom_domains')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', domainId);
  }

  return {
    status: newStatus,
    verified: vercelStatus.verified,
    verificationRecords: vercelStatus.verification?.map(v => ({
      type: v.type, domain: v.domain, value: v.value,
    })),
  };
}
