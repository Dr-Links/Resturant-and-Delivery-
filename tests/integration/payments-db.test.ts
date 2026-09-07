import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Real end-to-end DB integration for the payment RPCs. Skipped unless a TEST
// Supabase project is provided (never point this at production). Run with:
//   SUPABASE_TEST_URL=... SUPABASE_TEST_SERVICE_KEY=... \
//   TEST_SESSION_ID=<open dining session> TEST_MENU_ITEM_ID=<available item> \
//   npm test
const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_SERVICE_KEY;
const SESSION = process.env.TEST_SESSION_ID;
const ITEM = process.env.TEST_MENU_ITEM_ID;
const ready = Boolean(URL && KEY && SESSION && ITEM);

describe.skipIf(!ready)('payments DB integration', () => {
  it('places an order, opens an intent, marks it paid, and is idempotent', async () => {
    const db = createClient(URL!, KEY!, { auth: { persistSession: false } });

    const { data: order } = await db.rpc('place_order', {
      p_session_id: SESSION,
      p_items: [{ menu_item_id: ITEM, quantity: 1 }],
    });
    const orderId = (order as { order_id: string }).order_id;
    expect(orderId).toBeTruthy();

    const { data: intent } = await db.rpc('create_order_payment', {
      p_order_id: orderId,
      p_provider: 'mtn',
      p_phone: '650000000',
    });
    const ref = (intent as { external_ref: string; amount: number }).external_ref;
    expect((intent as { amount: number }).amount).toBeGreaterThan(0);

    await db.rpc('mark_order_payment', { p_external_ref: ref, p_status: 'succeeded', p_provider_ref: 'IT-TEST' });

    const { data: paid } = await db.from('orders').select('payment_status').eq('id', orderId).maybeSingle();
    expect((paid as { payment_status: string }).payment_status).toBe('paid');

    // idempotency: a later 'failed' must not override a succeeded payment
    const { data: again } = await db.rpc('mark_order_payment', { p_external_ref: ref, p_status: 'failed' });
    expect((again as { status: string }).status).toBe('succeeded');

    // cleanup
    await db.from('order_payments').delete().eq('order_id', orderId);
    await db.from('order_items').delete().eq('order_id', orderId);
    await db.from('orders').delete().eq('id', orderId);
  });
});
