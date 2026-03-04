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

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired token' }) };
    }

    // Parse request body for payment intent ID
    const { paymentIntentId } = JSON.parse(event.body || '{}');
    if (!paymentIntentId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing paymentIntentId' }) };
    }

    // Verify the payment intent with Stripe server-side
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Verify the payment actually succeeded and belongs to this user
    if (paymentIntent.status !== 'succeeded') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Payment not completed' }) };
    }

    if (paymentIntent.metadata?.supabase_user_id !== user.id) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Payment does not belong to this user' }) };
    }

    // Update profile
    const { error } = await supabase
      .from('profiles')
      .update({
        has_paid: true,
        stripe_customer_id: paymentIntent.customer,
      })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to update profile:', error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database update failed' }) };
    }

    console.log(`Payment confirmed for user ${user.id}. Profile updated.`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Confirm payment error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Payment confirmation failed' }),
    };
  }
};
