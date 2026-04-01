'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import {
  addCustomDomain,
  removeCustomDomain,
  checkDomainStatus,
} from '@/lib/domains/actions';

type OrgDomain = {
  id: string;
  domain: string;
  domain_type: string;
  status: string;
  ssl_status: string | null;
  is_primary: boolean;
  property_id: string | null;
  property_name: string | null;
  verified_at: string | null;
  created_at: string;
  verification_token: string | null;
};

type PropertyInfo = {
  id: string;
  name: string;
  slug: string;
  primary_custom_domain_id: string | null;
};

function parseVerificationRecords(token: string | null): { type: string; domain: string; value: string }[] {
  if (!token) return [];
  try {
    const parsed = JSON.parse(token);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-sage hover:text-forest-dark transition-colors ml-2"
      title="Copy to clipboard"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function DnsInfoPanel({ domain }: { domain: OrgDomain }) {
  const records = parseVerificationRecords(domain.verification_token);

  if (records.length === 0) {
    return (
      <div className="px-4 py-3 bg-sage-light/30 text-sm text-sage">
        No DNS verification records available for this domain.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-sage-light/30 space-y-3">
      <p className="text-xs font-medium text-forest-dark uppercase">DNS Records Required</p>
      {records.map((rec, i) => (
        <div key={i} className="text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-white px-1.5 py-0.5 rounded text-sage">{rec.type}</span>
          </div>
          <div className="flex items-center">
            <span className="text-xs text-sage">Name:</span>
            <code className="ml-2 text-xs font-mono text-forest-dark bg-white px-1.5 py-0.5 rounded break-all">{rec.domain}</code>
            <CopyButton text={rec.domain} />
          </div>
          <div className="flex items-center">
            <span className="text-xs text-sage">Value:</span>
            <code className="ml-2 text-xs font-mono text-forest-dark bg-white px-1.5 py-0.5 rounded break-all">{rec.value}</code>
            <CopyButton text={rec.value} />
          </div>
        </div>
      ))}
      <p className="text-xs text-sage italic">
        DNS changes can take up to 72 hours to propagate. Use &quot;Check Now&quot; to re-verify.
      </p>
    </div>
  );
}

export default function DomainsPage() {
  const queryClient = useQueryClient();

  // Add domain form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formDomain, setFormDomain] = useState('');
  const [formScope, setFormScope] = useState<'org' | string>('org');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addedDomainRecords, setAddedDomainRecords] = useState<{ type: string; domain: string; value: string }[] | null>(null);

  // UI state
  const [expandedDns, setExpandedDns] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [checkingDomain, setCheckingDomain] = useState<string | null>(null);
  const [addingSubdomain, setAddingSubdomain] = useState<string | null>(null);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin', 'domains'],
    queryFn: async () => {
      const supabase = createClient();

      // Get org context from the current user's membership
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { orgDomains: [], propertyDomains: [], properties: [], orgId: null };

      const { data: membership } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) return { orgDomains: [], propertyDomains: [], properties: [], orgId: null };

      const orgId = membership.org_id;

      // Fetch domains with property join
      const { data: domainsData } = await supabase
        .from('custom_domains')
        .select(`
          id,
          domain,
          domain_type,
          status,
          ssl_status,
          is_primary,
          property_id,
          verified_at,
          created_at,
          verification_token,
          properties ( name )
        `)
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

      const rows: OrgDomain[] = (domainsData || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        domain: d.domain as string,
        domain_type: (d.domain_type as string) || 'subdomain',
        status: d.status as string,
        ssl_status: (d.ssl_status as string) ?? null,
        is_primary: d.is_primary as boolean,
        property_id: (d.property_id as string) ?? null,
        property_name: (d.properties as { name: string } | null)?.name ?? null,
        verified_at: (d.verified_at as string) ?? null,
        created_at: d.created_at as string,
        verification_token: (d.verification_token as string) ?? null,
      }));

      const orgDomains = rows.filter((r) => r.property_id === null);
      const propertyDomains = rows.filter((r) => r.property_id !== null);

      // Fetch properties
      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name, slug, primary_custom_domain_id')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('name', { ascending: true });

      const properties = (propsData || []) as PropertyInfo[];

      return { orgDomains, propertyDomains, properties, orgId };
    },
  });

  const orgDomains = data?.orgDomains ?? [];
  const propertyDomains = data?.propertyDomains ?? [];
  const properties = data?.properties ?? [];
  const orgId = data?.orgId ?? null;

  const primaryOrgDomain = orgDomains.find((d) => d.is_primary && d.property_id === null);

  function toggleDns(domainId: string) {
    setExpandedDns((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) {
        next.delete(domainId);
      } else {
        next.add(domainId);
      }
      return next;
    });
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!formDomain.trim() || !orgId) return;

    setFormLoading(true);
    setFormError(null);
    setAddedDomainRecords(null);

    const propertyId = formScope === 'org' ? undefined : formScope;
    const result = await addCustomDomain(orgId, formDomain.trim(), propertyId);

    setFormLoading(false);

    if (!result.success) {
      setFormError(result.error || 'Failed to add domain');
      return;
    }

    if (result.verificationRecords && result.verificationRecords.length > 0) {
      setAddedDomainRecords(result.verificationRecords);
    } else {
      setShowAddForm(false);
      setFormDomain('');
      setFormScope('org');
    }

    await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
  }

  async function handleRemove(domainId: string) {
    const result = await removeCustomDomain(domainId);
    setConfirmRemove(null);
    if (result.success) {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
    }
  }

  async function handleCheckStatus(domainId: string) {
    setCheckingDomain(domainId);
    await checkDomainStatus(domainId);
    await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
    setCheckingDomain(null);
  }

  async function handleAddSubdomain(property: PropertyInfo) {
    if (!primaryOrgDomain || !orgId) return;
    setAddingSubdomain(property.id);

    const subdomain = `${property.slug}.${primaryOrgDomain.domain}`;
    const result = await addCustomDomain(orgId, subdomain, property.id);

    if (result.success) {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
    }
    setAddingSubdomain(null);
  }

  // Separate property domains into subdomains of org domain vs custom
  const orgPrimaryDomain = primaryOrgDomain?.domain;
  const propertySubdomains = orgPrimaryDomain
    ? propertyDomains.filter((d) => d.domain.endsWith(`.${orgPrimaryDomain}`))
    : [];
  const propertyCustomDomains = orgPrimaryDomain
    ? propertyDomains.filter((d) => !d.domain.endsWith(`.${orgPrimaryDomain}`))
    : propertyDomains;

  // Properties that don't have a subdomain under the org domain
  const propertiesWithSubdomain = new Set(propertySubdomains.map((d) => d.property_id));
  const propertiesWithoutSubdomain = properties.filter((p) => !propertiesWithSubdomain.has(p.id));

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-48 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Domains</h1>
        <button
          onClick={() => {
            setShowAddForm((v) => !v);
            setAddedDomainRecords(null);
            setFormError(null);
          }}
          className="btn-primary text-sm"
        >
          {showAddForm ? 'Cancel' : '+ Add Domain'}
        </button>
      </div>

      {/* Add domain form */}
      {showAddForm && (
        <div className="card mb-6 border border-sage-light bg-sage-light/30">
          <h2 className="font-heading text-base font-semibold text-forest-dark mb-4">
            Add Domain
          </h2>
          <form onSubmit={handleAddDomain} className="space-y-4">
            <div>
              <label className="label">Domain</label>
              <input
                type="text"
                className="input-field font-mono"
                value={formDomain}
                onChange={(e) => setFormDomain(e.target.value)}
                placeholder="example.com or sub.example.com"
                required
              />
            </div>
            <div>
              <label className="label">Scope</label>
              <select
                className="input-field"
                value={formScope}
                onChange={(e) => setFormScope(e.target.value)}
              >
                <option value="org">Organization</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    Property: {p.name}
                  </option>
                ))}
              </select>
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{formError}</p>
            )}
            {addedDomainRecords && (
              <div className="space-y-3 bg-white rounded border border-sage-light p-4">
                <p className="text-sm font-medium text-forest-dark">
                  Domain added. Configure these DNS records:
                </p>
                {addedDomainRecords.map((rec, i) => (
                  <div key={i} className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-sage-light px-1.5 py-0.5 rounded text-sage">{rec.type}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs text-sage">Name:</span>
                      <code className="ml-2 text-xs font-mono text-forest-dark bg-sage-light px-1.5 py-0.5 rounded break-all">{rec.domain}</code>
                      <CopyButton text={rec.domain} />
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs text-sage">Value:</span>
                      <code className="ml-2 text-xs font-mono text-forest-dark bg-sage-light px-1.5 py-0.5 rounded break-all">{rec.value}</code>
                      <CopyButton text={rec.value} />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-sage italic">
                  DNS changes can take up to 72 hours to propagate.
                </p>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormDomain('');
                    setFormScope('org');
                    setAddedDomainRecords(null);
                  }}
                >
                  Done
                </button>
              </div>
            )}
            {!addedDomainRecords && (
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="btn-primary text-sm"
                  disabled={formLoading || !formDomain.trim()}
                >
                  {formLoading ? 'Adding...' : 'Add Domain'}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormDomain('');
                    setFormScope('org');
                    setFormError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Section 1: Organization Domains */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-forest-dark mb-3">
          Organization Domains
        </h2>
        {orgDomains.length === 0 ? (
          <EmptyState
            title="No organization domains"
            description="Add a domain to get started with custom URLs."
            actionLabel="+ Add Domain"
            onAction={() => {
              setShowAddForm(true);
              setFormScope('org');
            }}
          />
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-sage-light bg-sage-light">
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Domain</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">SSL</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-light">
                {orgDomains.map((domain) => (
                  <DomainRow
                    key={domain.id}
                    domain={domain}
                    expandedDns={expandedDns}
                    toggleDns={toggleDns}
                    confirmRemove={confirmRemove}
                    setConfirmRemove={setConfirmRemove}
                    handleRemove={handleRemove}
                    handleCheckStatus={handleCheckStatus}
                    checkingDomain={checkingDomain}
                  />
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Property Subdomains (under org domain) */}
      {primaryOrgDomain && (
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-forest-dark mb-1">
            Property Subdomains
          </h2>
          <p className="text-sm text-sage mb-3">
            Subdomains of <span className="font-mono">{primaryOrgDomain.domain}</span>
          </p>
          {propertySubdomains.length === 0 && propertiesWithoutSubdomain.length === 0 ? (
            <EmptyState
              title="No property subdomains"
              description="Properties can have subdomains under your org domain."
            />
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-sage-light bg-sage-light">
                    <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Domain</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Property</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage-light">
                  {propertySubdomains.map((domain) => (
                    <DomainRow
                      key={domain.id}
                      domain={domain}
                      expandedDns={expandedDns}
                      toggleDns={toggleDns}
                      confirmRemove={confirmRemove}
                      setConfirmRemove={setConfirmRemove}
                      handleRemove={handleRemove}
                      handleCheckStatus={handleCheckStatus}
                      checkingDomain={checkingDomain}
                      showProperty
                    />
                  ))}
                  {propertiesWithoutSubdomain.map((property) => (
                    <tr key={property.id} className="opacity-50 hover:opacity-100 transition-opacity">
                      <td className="px-4 py-3 text-sm font-mono text-sage">
                        {property.slug}.{primaryOrgDomain.domain}
                      </td>
                      <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                        {property.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-sage italic">Not configured</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleAddSubdomain(property)}
                          disabled={addingSubdomain === property.id}
                          className="text-xs text-forest hover:text-forest-dark transition-colors disabled:opacity-50"
                        >
                          {addingSubdomain === property.id ? 'Adding...' : '+ Add Subdomain'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Section 3: Property Custom Domains */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-forest-dark mb-3">
          Property Custom Domains
        </h2>
        {propertyCustomDomains.length === 0 ? (
          <EmptyState
            title="No property custom domains"
            description="Properties can have their own custom domains."
          />
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-sage-light bg-sage-light">
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Domain</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Property</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-light">
                {propertyCustomDomains.map((domain) => (
                  <DomainRow
                    key={domain.id}
                    domain={domain}
                    expandedDns={expandedDns}
                    toggleDns={toggleDns}
                    confirmRemove={confirmRemove}
                    setConfirmRemove={setConfirmRemove}
                    handleRemove={handleRemove}
                    handleCheckStatus={handleCheckStatus}
                    checkingDomain={checkingDomain}
                    showProperty
                  />
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DomainRow({
  domain,
  expandedDns,
  toggleDns,
  confirmRemove,
  setConfirmRemove,
  handleRemove,
  handleCheckStatus,
  checkingDomain,
  showProperty,
}: {
  domain: OrgDomain;
  expandedDns: Set<string>;
  toggleDns: (id: string) => void;
  confirmRemove: string | null;
  setConfirmRemove: (id: string | null) => void;
  handleRemove: (id: string) => void;
  handleCheckStatus: (id: string) => void;
  checkingDomain: string | null;
  showProperty?: boolean;
}) {
  const isPendingOrVerifying = domain.status === 'pending' || domain.status === 'verifying';
  const isExpanded = expandedDns.has(domain.id);
  const isConfirmingRemove = confirmRemove === domain.id;

  return (
    <>
      <tr className="hover:bg-sage-light transition-colors">
        <td className="px-4 py-3 text-sm font-mono text-forest-dark">
          {domain.domain}
          {domain.is_primary && (
            <span className="ml-2 text-xs bg-forest/10 text-forest px-1.5 py-0.5 rounded">Primary</span>
          )}
        </td>
        {showProperty ? (
          <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
            {domain.property_name || '--'}
          </td>
        ) : (
          <td className="px-4 py-3 text-sm text-sage capitalize hidden sm:table-cell">
            {domain.domain_type === 'apex' ? 'Apex' : 'Subdomain'}
          </td>
        )}
        <td className="px-4 py-3">
          <StatusBadge status={domain.status} />
          {domain.status === 'active' && domain.ssl_status && (
            <span className="ml-1">
              <StatusBadge status={domain.ssl_status === 'active' ? 'active' : domain.ssl_status} />
            </span>
          )}
        </td>
        {!showProperty && (
          <td className="px-4 py-3 hidden md:table-cell">
            {domain.status === 'active' && (
              <span className="text-xs text-green-700">SSL Active</span>
            )}
          </td>
        )}
        <td className="px-4 py-3 text-right space-x-2">
          {isPendingOrVerifying && (
            <button
              onClick={() => handleCheckStatus(domain.id)}
              disabled={checkingDomain === domain.id}
              className="text-xs text-forest hover:text-forest-dark transition-colors disabled:opacity-50"
            >
              {checkingDomain === domain.id ? 'Checking...' : 'Check Now'}
            </button>
          )}
          <button
            onClick={() => toggleDns(domain.id)}
            className="text-xs text-sage hover:text-forest-dark transition-colors"
          >
            {isExpanded ? 'Hide DNS' : 'DNS Info'}
          </button>
          {isConfirmingRemove ? (
            <>
              <button
                onClick={() => handleRemove(domain.id)}
                className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmRemove(null)}
                className="text-xs text-sage hover:text-forest-dark transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmRemove(domain.id)}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Remove
            </button>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={showProperty ? 4 : 5}>
            <DnsInfoPanel domain={domain} />
          </td>
        </tr>
      )}
    </>
  );
}
