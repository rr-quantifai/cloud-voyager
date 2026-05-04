'use strict';

// ============================================================
// netlify/functions/analyze-status.js
//
// Lightweight polling endpoint. The browser calls this every
// 4 seconds after triggering analyze-background.
// Reads from Netlify Blobs and returns whatever is there.
// ============================================================

const { getStore } = require('@netlify/blobs');

const BLOB_STORE = 'cv-analyses';

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { Allow: 'GET', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const customerId    = event.queryStringParameters?.customerId?.trim();
  const netlifyToken  = event.queryStringParameters?.netlifyToken?.trim();

  if (!customerId || !netlifyToken) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'customerId and netlifyToken query parameters are required' }),
    };
  }

  try {
    const store = getStore({ name: BLOB_STORE, consistency: 'strong', siteID: process.env.SITE_ID, token: netlifyToken });
    const raw   = await store.get(customerId);

    // Not ready yet — background function still running
    if (raw === null) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      };
    }

    // Delete the blob now that the client has collected it
    await store.delete(customerId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'error', error: 'Something went wrong — could not read analysis result, try again' }),
    };
  }
};