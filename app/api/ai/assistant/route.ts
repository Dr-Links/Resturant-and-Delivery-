import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

const SYSTEM = `You are a concise restaurant analytics assistant. You are given a restaurant's own data.
Answer the owner's question specifically using that data. Recommend; never claim to have made changes.
If the owner asks to change the menu (price, availability, category, or add an item), DO NOT say it is done.
Instead return a "proposal" describing ONE change; it will require the owner's explicit confirmation before anything is applied.
Only reference items that exist, using their item_id.
Respond with ONLY a JSON object, no prose around it:
{"answer": string, "proposal": null | {"type": "change_price"|"mark_sold_out"|"mark_available"|"hide_item"|"change_category"|"add_item", "item_id"?: string, "name"?: string, "price"?: number, "category_id"?: string, "description"?: string, "summary": string}}`;

export async function POST(req: Request) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const restaurant = await getActiveRestaurant(supabase);
  if (!restaurant) return Response.json({ error: 'no_restaurant' }, { status: 403 });

  const { question } = await req.json().catch(() => ({ question: '' }));
  if (!question) return Response.json({ error: 'empty' }, { status: 400 });

  const [{ data: items }, { data: categories }, { data: funnel }] = await Promise.all([
    supabase.from('menu_items').select('id,name,price,status,category_id').eq('restaurant_id', restaurant.id),
    supabase.from('menu_categories').select('id,name').eq('restaurant_id', restaurant.id),
    supabase.rpc('get_food_funnel', { p_restaurant_id: restaurant.id }),
  ]);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({
      answer: 'The AI assistant is not configured yet. Add an ANTHROPIC_API_KEY environment variable in Vercel to enable it. (The confirm-before-apply flow is already wired up.)',
      proposal: null, action_id: null,
    });
  }

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest';
  const context = JSON.stringify({ restaurant: { name: restaurant.name, currency: restaurant.currency }, categories, items, funnel });

  let answer = ''; let proposal: any = null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM, messages: [{ role: 'user', content: `Data:\n${context}\n\nQuestion: ${question}` }] }),
    });
    const data = await res.json();
    const text = (data?.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim();
    try { const parsed = JSON.parse(text); answer = parsed.answer ?? text; proposal = parsed.proposal ?? null; }
    catch { answer = text || 'No answer.'; }
  } catch {
    return Response.json({ answer: 'The AI request failed. Check the API key and try again.', proposal: null, action_id: null });
  }

  const { data: action } = await supabase.from('ai_actions').insert({
    restaurant_id: restaurant.id, actor_id: user.id,
    kind: proposal ? 'menu_proposal' : 'assistant_query',
    question, answer, proposal, status: 'proposed',
  }).select('id').single();

  return Response.json({ answer, proposal, action_id: action?.id ?? null });
}
