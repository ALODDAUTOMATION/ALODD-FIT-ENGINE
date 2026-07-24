// TEMPORARY endpoint used once to complete the OAuth handshake for the
// "ALODD Fit Engine Backend" custom app and retrieve a static Admin API
// access token. Safe to delete after the token has been copied.
//
// Flow:
//   1. Merchant installs the app in the Dev Dashboard.
//   2. Shopify redirects the browser here with ?code=...&shop=...&hmac=...
//   3. This function exchanges the code for a permanent access token by
//      calling https://{shop}/admin/oauth/access_token
//   4. It prints the token on screen (plain text) so it can be copied once.

exports.handler = async (event) => {
  const { code, shop } = event.queryStringParameters || {};

  if (!code || !shop) {
    return {
      statusCode: 400,
      body: "Missing 'code' or 'shop' query parameter. This page should only be hit by Shopify's OAuth redirect.",
    };
  }

  const clientId = process.env.SHOPIFY_APP_CLIENT_ID || "d22d57f3b1df68deb91c214e3d4c9fdd";
  const clientSecret = process.env.SHOPIFY_APP_CLIENT_SECRET;

  if (!clientSecret) {
    return {
      statusCode: 500,
      body: "Server misconfigured: SHOPIFY_APP_CLIENT_SECRET env var not set.",
    };
  }

  try {
    const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: `Token exchange failed: ${JSON.stringify(data)}`,
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body:
        "SUCCESS — copy this token now, it will not be shown again:\n\n" +
        data.access_token +
        "\n\nScopes granted: " +
        data.scope,
    };
  } catch (err) {
    return { statusCode: 500, body: `Unexpected error: ${String(err)}` };
  }
};
