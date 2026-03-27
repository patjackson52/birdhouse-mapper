'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import {
  getAccessConfigs,
  updateAccessConfig,
  getTokens,
  createToken,
  revokeToken,
  getGrants,
  createGrant,
  revokeGrant,
} from './actions';

// ---------------------------------------------------------------------------
// Types (matching what the server actions return)
// ---------------------------------------------------------------------------

type ConfigRow = {
  property_id: string;
  property_name: string;
  property_slug: string;
  config_id: string | null;
  anon_access_enabled: boolean;
  anon_can_view_map: boolean;
  anon_can_view_items: boolean;
  anon_can_view_item_details: boolean;
  anon_can_submit_forms: boolean;
  password_protected: boolean;
  password_hash: string | null;
  allow_embed: boolean;
  embed_allowed_origins: string[];
  anon_visible_field_keys: string[];
};

type TokenRow = {
  id: string;
  token: string;
  label: string;
  property_id: string;
  property_name: string;
  property_slug: string;
  can_view_map: boolean;
  can_view_items: boolean;
  can_submit_forms: boolean;
  expires_at: string | null;
  use_count: number;
  last_used_at: string | null;
  is_active: boolean;
  status: 'active' | 'expired' | 'revoked';
};

type GrantRow = {
  id: string;
  property_id: string;
  property_name: string;
  property_slug: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  granted_email: string | null;
  role_id: string;
  role_name: string;
  role_base_role: string;
  valid_from: string;
  valid_until: string;
  status: string;
  revoked_at: string | null;
  revoked_by: string | null;
  granted_by: string;
  note: string | null;
};

// ---------------------------------------------------------------------------
// Toggle Switch Component
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-forest peer-disabled:opacity-50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
    </label>
  );
}

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Access Config Editor (inline expand per property)
// ---------------------------------------------------------------------------

function AccessConfigEditor({
  config,
  onSaved,
}: {
  config: ConfigRow;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(config.anon_access_enabled);
  const [canViewMap, setCanViewMap] = useState(config.anon_can_view_map);
  const [canViewItems, setCanViewItems] = useState(config.anon_can_view_items);
  const [canViewDetails, setCanViewDetails] = useState(config.anon_can_view_item_details);
  const [canSubmitForms, setCanSubmitForms] = useState(config.anon_can_submit_forms);
  const [passwordProtected, setPasswordProtected] = useState(config.password_protected);
  const [password, setPassword] = useState('');
  const [allowEmbed, setAllowEmbed] = useState(config.allow_embed);
  const [embedOrigins, setEmbedOrigins] = useState(config.embed_allowed_origins.join('\n'));
  const [visibleFieldKeys, setVisibleFieldKeys] = useState(config.anon_visible_field_keys.join(', '));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function handleMasterToggle(val: boolean) {
    setEnabled(val);
    if (!val) {
      setCanViewMap(false);
      setCanViewItems(false);
      setCanViewDetails(false);
      setCanSubmitForms(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);

    const origins = embedOrigins
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const fieldKeys = visibleFieldKeys
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      anon_access_enabled: enabled,
      anon_can_view_map: canViewMap,
      anon_can_view_items: canViewItems,
      anon_can_view_item_details: canViewDetails,
      anon_can_submit_forms: canSubmitForms,
      password_protected: passwordProtected,
      allow_embed: allowEmbed,
      embed_allowed_origins: origins,
      anon_visible_field_keys: fieldKeys,
    };

    if (passwordProtected && password) {
      payload.password_hash = password;
    }

    const result = await updateAccessConfig(config.property_id, payload);
    setSaving(false);

    if (result.error) {
      setFeedback({ type: 'error', message: result.error });
    } else {
      setFeedback({ type: 'success', message: 'Access config saved.' });
      onSaved();
    }
  }

  return (
    <div className="px-4 py-4 bg-sage-light/30 space-y-4">
      {/* Master switch */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-forest-dark">Anonymous access enabled</span>
        <Toggle checked={enabled} onChange={handleMasterToggle} />
      </div>

      {/* Sub-toggles */}
      <div className="space-y-3 pl-4 border-l-2 border-sage-light">
        <div className="flex items-center justify-between">
          <span className="text-sm text-forest-dark">Can view map</span>
          <Toggle checked={canViewMap} onChange={setCanViewMap} disabled={!enabled} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-forest-dark">Can view items</span>
          <Toggle checked={canViewItems} onChange={setCanViewItems} disabled={!enabled} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-forest-dark">Can view item details</span>
          <Toggle checked={canViewDetails} onChange={setCanViewDetails} disabled={!enabled} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-forest-dark">Can submit forms</span>
          <Toggle checked={canSubmitForms} onChange={setCanSubmitForms} disabled={!enabled} />
        </div>
      </div>

      {/* Password protection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-forest-dark">Password protection</span>
          <Toggle checked={passwordProtected} onChange={setPasswordProtected} />
        </div>
        {passwordProtected && (
          <input
            type="password"
            className="input-field text-sm"
            placeholder="Enter password (leave blank to keep existing)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </div>

      {/* Embed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-forest-dark">Allow embed</span>
          <Toggle checked={allowEmbed} onChange={setAllowEmbed} />
        </div>
        {allowEmbed && (
          <div>
            <label className="label text-xs">Allowed origins (one per line)</label>
            <textarea
              className="input-field text-sm font-mono"
              rows={3}
              placeholder="https://example.com"
              value={embedOrigins}
              onChange={(e) => setEmbedOrigins(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Visible field keys */}
      <div>
        <label className="label text-xs">Visible field keys (comma-separated)</label>
        <input
          type="text"
          className="input-field text-sm font-mono"
          placeholder="name, description, status"
          value={visibleFieldKeys}
          onChange={(e) => setVisibleFieldKeys(e.target.value)}
        />
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {feedback && (
          <span
            className={`text-sm ${feedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
          >
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AccessPage() {
  const [activeTab, setActiveTab] = useState<'config' | 'tokens'>('config');
  const [loading, setLoading] = useState(true);

  // Access configs
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  // Tokens
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [tokenPropertyId, setTokenPropertyId] = useState('');
  const [tokenLabel, setTokenLabel] = useState('');
  const [tokenExpires, setTokenExpires] = useState('');
  const [tokenCreating, setTokenCreating] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [confirmRevokeToken, setConfirmRevokeToken] = useState<string | null>(null);

  // Grants
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [showCreateGrant, setShowCreateGrant] = useState(false);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantPropertyId, setGrantPropertyId] = useState('');
  const [grantRoleId, setGrantRoleId] = useState('');
  const [grantFrom, setGrantFrom] = useState('');
  const [grantUntil, setGrantUntil] = useState('');
  const [grantCreating, setGrantCreating] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [confirmRevokeGrant, setConfirmRevokeGrant] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    const result = await getAccessConfigs();
    setConfigs(result.configs as ConfigRow[]);
  }, []);

  const loadTokens = useCallback(async () => {
    const result = await getTokens();
    setTokens(result.tokens as TokenRow[]);
  }, []);

  const loadGrants = useCallback(async () => {
    const result = await getGrants();
    setGrants(result.grants as GrantRow[]);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadConfigs(), loadTokens(), loadGrants()]);
    setLoading(false);
  }, [loadConfigs, loadTokens, loadGrants]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // -- Token actions --

  async function handleCreateToken(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenPropertyId || !tokenLabel.trim()) return;

    setTokenCreating(true);
    setTokenError(null);
    setCreatedToken(null);

    const result = await createToken(
      tokenPropertyId,
      tokenLabel.trim(),
      tokenExpires || undefined,
    );

    setTokenCreating(false);

    if (result.error) {
      setTokenError(result.error);
      return;
    }

    if (result.token) {
      setCreatedToken(result.token.token);
    }

    setTokenLabel('');
    setTokenExpires('');
    await loadTokens();
  }

  async function handleRevokeToken(tokenId: string) {
    await revokeToken(tokenId);
    setConfirmRevokeToken(null);
    await loadTokens();
  }

  // -- Grant actions --

  async function handleCreateGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!grantUserId.trim() || !grantPropertyId || !grantRoleId || !grantFrom || !grantUntil) return;

    setGrantCreating(true);
    setGrantError(null);

    const result = await createGrant({
      userId: grantUserId.trim(),
      propertyId: grantPropertyId,
      roleId: grantRoleId,
      validFrom: grantFrom,
      validUntil: grantUntil,
    });

    setGrantCreating(false);

    if (result.error) {
      setGrantError(result.error);
      return;
    }

    setShowCreateGrant(false);
    setGrantUserId('');
    setGrantPropertyId('');
    setGrantRoleId('');
    setGrantFrom('');
    setGrantUntil('');
    await loadGrants();
  }

  async function handleRevokeGrant(grantId: string) {
    await revokeGrant(grantId);
    setConfirmRevokeGrant(null);
    await loadGrants();
  }

  // -- Render --

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
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">Access</h1>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-sage-light mb-6">
        <button
          onClick={() => setActiveTab('config')}
          className={`pb-2 text-sm font-medium transition-colors ${
            activeTab === 'config'
              ? 'border-b-2 border-forest text-forest-dark'
              : 'text-sage hover:text-forest-dark'
          }`}
        >
          Access Config
        </button>
        <button
          onClick={() => setActiveTab('tokens')}
          className={`pb-2 text-sm font-medium transition-colors ${
            activeTab === 'tokens'
              ? 'border-b-2 border-forest text-forest-dark'
              : 'text-sage hover:text-forest-dark'
          }`}
        >
          Tokens & Grants
        </button>
      </div>

      {/* ============================================================= */}
      {/* ACCESS CONFIG TAB                                              */}
      {/* ============================================================= */}
      {activeTab === 'config' && (
        <section>
          {configs.length === 0 ? (
            <EmptyState
              title="No properties"
              description="Create a property first to configure access."
            />
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-sage-light bg-sage-light">
                    <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Property</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Slug</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Anonymous Access</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage-light">
                  {configs.map((cfg) => (
                    <ConfigTableRow
                      key={cfg.property_id}
                      config={cfg}
                      isExpanded={expandedProperty === cfg.property_id}
                      onToggle={() =>
                        setExpandedProperty(
                          expandedProperty === cfg.property_id ? null : cfg.property_id,
                        )
                      }
                      onSaved={loadConfigs}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============================================================= */}
      {/* TOKENS & GRANTS TAB                                            */}
      {/* ============================================================= */}
      {activeTab === 'tokens' && (
        <div className="space-y-10">
          {/* ----- Anonymous Access Tokens ----- */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-lg font-semibold text-forest-dark">
                Anonymous Access Tokens
              </h2>
              <button
                onClick={() => {
                  setShowCreateToken((v) => !v);
                  setCreatedToken(null);
                  setTokenError(null);
                }}
                className="btn-primary text-sm"
              >
                {showCreateToken ? 'Cancel' : '+ Create Token'}
              </button>
            </div>

            {/* Create token form */}
            {showCreateToken && (
              <div className="card mb-4 border border-sage-light bg-sage-light/30">
                <h3 className="font-heading text-base font-semibold text-forest-dark mb-4">
                  Create Token
                </h3>

                {createdToken ? (
                  <div className="space-y-3">
                    <p className="text-sm text-forest-dark font-medium">
                      Token created! Copy it now -- it will not be shown again.
                    </p>
                    <div className="flex items-center gap-2 bg-white border border-sage-light rounded px-3 py-2">
                      <code className="text-sm font-mono text-forest-dark break-all flex-1">
                        {createdToken}
                      </code>
                      <CopyButton text={createdToken} />
                    </div>
                    <button
                      className="btn-secondary text-sm"
                      onClick={() => {
                        setShowCreateToken(false);
                        setCreatedToken(null);
                        setTokenPropertyId('');
                      }}
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateToken} className="space-y-4">
                    <div>
                      <label className="label">Property</label>
                      <select
                        className="input-field"
                        value={tokenPropertyId}
                        onChange={(e) => setTokenPropertyId(e.target.value)}
                        required
                      >
                        <option value="">Select a property...</option>
                        {configs.map((c) => (
                          <option key={c.property_id} value={c.property_id}>
                            {c.property_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Label</label>
                      <input
                        type="text"
                        className="input-field"
                        value={tokenLabel}
                        onChange={(e) => setTokenLabel(e.target.value)}
                        placeholder="e.g. Public Map Widget"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Expiration date (optional)</label>
                      <input
                        type="date"
                        className="input-field"
                        value={tokenExpires}
                        onChange={(e) => setTokenExpires(e.target.value)}
                      />
                    </div>
                    {tokenError && (
                      <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{tokenError}</p>
                    )}
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        className="btn-primary text-sm"
                        disabled={tokenCreating || !tokenPropertyId || !tokenLabel.trim()}
                      >
                        {tokenCreating ? 'Creating...' : 'Create Token'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={() => {
                          setShowCreateToken(false);
                          setTokenError(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Tokens table */}
            {tokens.length === 0 ? (
              <EmptyState
                title="No tokens"
                description="Create an anonymous access token to allow public access to properties."
              />
            ) : (
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-sage-light bg-sage-light">
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Token</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Property</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">Label</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden lg:table-cell">Uses</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden lg:table-cell">Expires</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sage-light">
                    {tokens.map((tok) => (
                      <tr key={tok.id} className="hover:bg-sage-light transition-colors">
                        <td className="px-4 py-3 text-sm font-mono text-forest-dark">
                          {tok.token.substring(0, 12)}...
                        </td>
                        <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                          {tok.property_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-sage hidden md:table-cell">
                          {tok.label}
                        </td>
                        <td className="px-4 py-3 text-sm text-sage hidden lg:table-cell">
                          {tok.use_count}
                        </td>
                        <td className="px-4 py-3 text-sm text-sage hidden lg:table-cell">
                          {tok.expires_at
                            ? new Date(tok.expires_at).toLocaleDateString()
                            : 'Never'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={tok.status} />
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <CopyButton text={tok.token} />
                          {tok.status === 'active' && (
                            <>
                              {confirmRevokeToken === tok.id ? (
                                <>
                                  <button
                                    onClick={() => handleRevokeToken(tok.id)}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmRevokeToken(null)}
                                    className="text-xs text-sage hover:text-forest-dark transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setConfirmRevokeToken(tok.id)}
                                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                                >
                                  Revoke
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </section>

          {/* ----- Temporary Access Grants ----- */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-lg font-semibold text-forest-dark">
                Temporary Access Grants
              </h2>
              <button
                onClick={() => {
                  setShowCreateGrant((v) => !v);
                  setGrantError(null);
                }}
                className="btn-primary text-sm"
              >
                {showCreateGrant ? 'Cancel' : '+ Create Grant'}
              </button>
            </div>

            {/* Create grant form */}
            {showCreateGrant && (
              <div className="card mb-4 border border-sage-light bg-sage-light/30">
                <h3 className="font-heading text-base font-semibold text-forest-dark mb-4">
                  Create Grant
                </h3>
                <form onSubmit={handleCreateGrant} className="space-y-4">
                  <div>
                    <label className="label">User ID</label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      value={grantUserId}
                      onChange={(e) => setGrantUserId(e.target.value)}
                      placeholder="Enter user ID"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Property</label>
                    <select
                      className="input-field"
                      value={grantPropertyId}
                      onChange={(e) => setGrantPropertyId(e.target.value)}
                      required
                    >
                      <option value="">Select a property...</option>
                      {configs.map((c) => (
                        <option key={c.property_id} value={c.property_id}>
                          {c.property_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Role ID</label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      value={grantRoleId}
                      onChange={(e) => setGrantRoleId(e.target.value)}
                      placeholder="Enter role ID"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Valid from</label>
                      <input
                        type="date"
                        className="input-field"
                        value={grantFrom}
                        onChange={(e) => setGrantFrom(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Valid until</label>
                      <input
                        type="date"
                        className="input-field"
                        value={grantUntil}
                        onChange={(e) => setGrantUntil(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  {grantError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{grantError}</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="btn-primary text-sm"
                      disabled={
                        grantCreating ||
                        !grantUserId.trim() ||
                        !grantPropertyId ||
                        !grantRoleId.trim() ||
                        !grantFrom ||
                        !grantUntil
                      }
                    >
                      {grantCreating ? 'Creating...' : 'Create Grant'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      onClick={() => {
                        setShowCreateGrant(false);
                        setGrantError(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Grants table */}
            {grants.length === 0 ? (
              <EmptyState
                title="No grants"
                description="Create a temporary access grant to give time-limited access to a user."
              />
            ) : (
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-sage-light bg-sage-light">
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">User</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Property</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">Role</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden lg:table-cell">Valid From</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden lg:table-cell">Valid Until</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sage-light">
                    {grants.map((grant) => (
                      <tr key={grant.id} className="hover:bg-sage-light transition-colors">
                        <td className="px-4 py-3 text-sm text-forest-dark">
                          {grant.user_display_name || grant.user_email || grant.user_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                          {grant.property_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-sage hidden md:table-cell">
                          {grant.role_name || grant.role_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-sage hidden lg:table-cell">
                          {new Date(grant.valid_from).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-sage hidden lg:table-cell">
                          {new Date(grant.valid_until).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={grant.status} />
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {grant.status === 'active' && (
                            <>
                              {confirmRevokeGrant === grant.id ? (
                                <>
                                  <button
                                    onClick={() => handleRevokeGrant(grant.id)}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmRevokeGrant(null)}
                                    className="text-xs text-sage hover:text-forest-dark transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setConfirmRevokeGrant(grant.id)}
                                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                                >
                                  Revoke
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config Table Row (with expandable editor)
// ---------------------------------------------------------------------------

function ConfigTableRow({
  config,
  isExpanded,
  onToggle,
  onSaved,
}: {
  config: ConfigRow;
  isExpanded: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="hover:bg-sage-light transition-colors cursor-pointer"
      >
        <td className="px-4 py-3 text-sm font-medium text-forest-dark">
          {config.property_name}
        </td>
        <td className="px-4 py-3 text-sm font-mono text-sage hidden sm:table-cell">
          {config.property_slug}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={config.anon_access_enabled ? 'active' : 'disabled'} />
        </td>
        <td className="px-4 py-3 text-right">
          <button className="text-xs text-sage hover:text-forest-dark transition-colors">
            {isExpanded ? 'Collapse' : 'Edit'}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={4}>
            <AccessConfigEditor config={config} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}
