const Stripe = require('stripe');

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Verify auth token exists
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const { userId, email } = JSON.parse(event.body);
    if (!userId || !email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing userId or email' }) };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const amount = parseInt(process.env.STRIPE_PRICE_AMOUNT || '49700'); // $497.00 in cents

    // Create or retrieve customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId },
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'cad',
      customer: customer.id,
      metadata: {
        supabase_user_id: userId,
        product: 'gym-to-web-portal',
      },
      description: 'Gym-to-Web Sync Portal — One-Time Setup',
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        customerId: customer.id,
      }),
    };
  } catch (err) {
    console.error('Stripe error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Payment setup failed. Please try again.' }),
    };
  }
};
