const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const ALLOWED_ORIGINS = [
    'https://gymtoweb.netlify.app',
    'http://localhost:8888',
  ];

  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
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
    // Extract and validate auth token
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const token = authHeader.replace('Bearer ', '');

    // Verify token with Supabase — this confirms the user is real
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired token' }) };
    }

    // Verify user is a trainer who hasn't paid yet
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, has_paid')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Profile not found' }) };
    }

    if (profile.role !== 'trainer') {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only trainers can purchase' }) };
    }

    if (profile.has_paid) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Already paid' }) };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const amount = parseInt(process.env.STRIPE_PRICE_AMOUNT || '49700');

    // Create or retrieve Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'cad',
      customer: customer.id,
      metadata: {
        supabase_user_id: user.id,
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
