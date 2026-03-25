const VERCEL_API = 'https://api.vercel.com';

function vercelHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function projectId() {
  const id = process.env.VERCEL_PROJECT_ID;
  if (!id) throw new Error('VERCEL_PROJECT_ID is not set');
  return id;
}

export interface VercelDomainResponse {
  name: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
  misconfigured: boolean;
}

/**
 * Add a custom domain to the Vercel project.
 * Vercel returns verification requirements (DNS records the org must set).
 */
export async function addDomainToVercel(domain: string): Promise<VercelDomainResponse> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId()}/domains`,
    {
      method: 'POST',
      headers: vercelHeaders(),
      body: JSON.stringify({ name: domain }),
    }
  );
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message ?? `Vercel API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Remove a custom domain from the Vercel project.
 * Silently succeeds if domain was already removed (404).
 */
export async function removeDomainFromVercel(domain: string): Promise<void> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId()}/domains/${domain}`,
    {
      method: 'DELETE',
      headers: vercelHeaders(),
    }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to remove domain from Vercel: ${res.status}`);
  }
}

/**
 * Check a domain's verification status on Vercel.
 * Returns null if domain not found (already removed).
 */
export async function checkDomainOnVercel(domain: string): Promise<VercelDomainResponse | null> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId()}/domains/${domain}`,
    {
      headers: vercelHeaders(),
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Vercel API error: ${res.status}`);
  return res.json();
}
