const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    const sig = event.headers['stripe-signature'];
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'payment_intent.succeeded') {
    const paymentIntent = stripeEvent.data.object;
    const userId = paymentIntent.metadata?.supabase_user_id;

    if (!userId) {
      console.error('No supabase_user_id in payment metadata');
      return { statusCode: 400, body: 'Missing user ID in metadata' };
    }

    // Update profile in Supabase using service role key (bypasses RLS)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { error } = await supabase
      .from('profiles')
      .update({
        has_paid: true,
        stripe_customer_id: paymentIntent.customer,
      })
      .eq('id', userId);

    if (error) {
      console.error('Failed to update profile:', error.message);
      return { statusCode: 500, body: 'Database update failed' };
    }

    console.log(`Payment successful for user ${userId}. Profile updated.`);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
