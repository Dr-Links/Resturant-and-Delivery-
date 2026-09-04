import { supabase } from '@/lib/supabase';

type FoodEvent = 'view' | 'ar_open' | 'ar_interact' | 'add_to_cart' | 'order';

// Fire-and-forget; analytics must never block or break the customer flow.
export function logEvent(restaurantId: string, itemId: string | null, event: FoodEvent, sessionId?: string | null) {
  try {
    supabase
      .rpc('log_food_event', {
        p_restaurant_id: restaurantId,
        p_item_id: itemId,
        p_event: event,
        p_session_id: sessionId ?? null,
      })
      .then(() => {}, () => {});
  } catch {
    /* ignore */
  }
}
