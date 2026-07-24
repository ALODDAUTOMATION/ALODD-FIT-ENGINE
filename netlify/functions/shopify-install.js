// TEMPORARY: this is the "App URL" target for the ALODD Fit Engine Backend
// custom app. Shopify loads this URL when the merchant opens/installs the
// app, passing ?shop=xxx.myshopify.com in the query string. Since we have no
// real embedded app UI, this function's only job is to kick off the classic
// OAuth handshake by redirecting the browser to Shopify's authorize screen.
// Shopify will then redirect back to our shopify-oauth-callback function
// with a code we can exchange for a permanent Admin API token.

exports.handler = async (event) => {
  const { shop } = event.queryStringParameters || {};

  if (!shop) {
    return {
      statusCode: 400,
      body: "Missing 'shop' query parameter.",
    };
  }

  // Netlify env vars weren't propagating reliably, so this falls back to a
  // hardcoded value. TEMPORARY — remove once the token has been retrieved.
  const clientId = process.env.SHOPIFY_APP_CLIENT_ID || "d22d57f3b1df68deb91c214e3d4c9fdd";

  const redirectUri = "https://alodd-fit-engine.netlify.app/.netlify/functions/shopify-oauth-callback";
  const scopes = "write_customers";
  const state = Math.random().toString(36).slice(2);

  const authorizeUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return {
    statusCode: 302,
    headers: { Location: authorizeUrl },
    body: "",
  };
};
