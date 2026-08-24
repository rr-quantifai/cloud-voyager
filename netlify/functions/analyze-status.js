'use strict';

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

    if (raw === null) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      };
    }

    let parsedStatus;
    try { parsedStatus = JSON.parse(raw)?.status; } catch { parsedStatus = null; }
    if (parsedStatus === 'complete' || parsedStatus === 'error' || !parsedStatus) {
      await store.delete(customerId);
    }

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