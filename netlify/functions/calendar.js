// Netlify serverless function to proxy the OSM iCal feed
// This avoids CORS issues when fetching from the browser

export default async (req) => {
  const ICAL_URL = 'https://www.onlinescoutmanager.co.uk/ext/cal/?f=308716.NzM0YWQxYmU1YmI4YWVmZjg3NTdkMTc1NjdkMDI4MTdkZTBhNzU1YjRkNzFlZGJiOTFhNzYwMjk0NDMyNDg1NGQzNTY2NmFlZTUzODY2MWVhNDg2OGVjZjJlNjllZjZlMmQ4NmM0ZGJkNzM4YzgzMzAwMzgwOGQxYjc5MzVhYWU%3D.K6K061eQr9';

  try {
    const response = await fetch(ICAL_URL);
    const icalData = await response.text();

    return new Response(icalData, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch calendar' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
