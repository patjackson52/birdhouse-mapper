interface NotificationEmailProps {
  orgName: string;
  orgLogoUrl: string | null;
  title: string;
  body: string;
  ctaUrl: string | null;
  unsubscribeUrl: string;
}

export function renderNotificationEmail(props: NotificationEmailProps): string {
  const { orgName, orgLogoUrl, title, body, ctaUrl, unsubscribeUrl } = props;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#1a3a1a;padding:20px 24px;text-align:center;">
              ${orgLogoUrl
                ? `<img src="${escapeHtml(orgLogoUrl)}" alt="${escapeHtml(orgName)}" height="40" style="height:40px;max-width:200px;" />`
                : `<span style="color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(orgName)}</span>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">${escapeHtml(title)}</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#444444;">${escapeHtml(body)}</p>
              ${ctaUrl
                ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 24px;background:#2d6a2d;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Learn More</a>`
                : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #eeeeee;text-align:center;">
              <p style="margin:0;font-size:12px;color:#999999;">
                You received this because you subscribed to updates from ${escapeHtml(orgName)}.
                <br />
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:#999999;text-decoration:underline;">Unsubscribe</a>
                &nbsp;|&nbsp;
                <a href="${escapeHtml(unsubscribeUrl)}&all=true" style="color:#999999;text-decoration:underline;">Unsubscribe from all</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
