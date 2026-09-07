import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet, Switch } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { supabase } from './lib/supabase';

const BRAND = '#ff6a2b';
const INK = '#0b0b0c';
const CARD = '#151517';
const LINE = '#232327';
const MUTED = '#a1a1aa';

// Web API base for gateway-backed endpoints (settlement). Override per build via
// EXPO_PUBLIC_API_BASE; defaults to production.
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://resturant-and-delivery.vercel.app';

type Driver = { id: string; status: string; is_online: boolean; rating_avg: number; rating_count: number };
type Offer = { id: string; request_id: string; pickup: string | null; dest: string | null; fee: number; earnings: number; item: string };
type Active = { id: string; status: string; dest_address: string | null; driver_earnings: number };

export default function App() {
  const [session, setSession] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      {session ? <Home /> : <Login />}
    </View>
  );
}

function Login() {
  const [email, setEmail] = useState('driver@demo.cm');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) Alert.alert('Sign in failed', error.message);
  }
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>Driver sign in</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={MUTED} />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor={MUTED} />
      <TouchableOpacity style={styles.primary} onPress={signIn} disabled={busy}><Text style={styles.primaryText}>{busy ? '…' : 'Sign in'}</Text></TouchableOpacity>
    </View>
  );
}

function Home() {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [online, setOnline] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [balance, setBalance] = useState(0);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState<'mtn' | 'orange'>('mtn');
  const [settling, setSettling] = useState(false);
  const watch = useRef<Location.LocationSubscription | null>(null);

  const loadDriver = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: d } = await supabase.from('platform_drivers').select('id,status,is_online,rating_avg,rating_count').eq('profile_id', user.id).maybeSingle();
    if (d) { setDriver(d as Driver); setOnline((d as Driver).is_online); const { data: bal } = await supabase.rpc('driver_balance', { p_driver_id: (d as Driver).id }); setBalance(Number(bal ?? 0)); }
  }, []);

  const poll = useCallback(async () => {
    if (!driver) return;
    // active delivery?
    const { data: act } = await supabase.from('delivery_requests').select('id,status,dest_address,driver_earnings')
      .eq('assigned_driver_id', driver.id).in('status', ['assigned', 'arriving', 'picked_up', 'in_transit', 'arrived']).limit(1).maybeSingle();
    setActive((act as Active) ?? null);
    if (!act) {
      // pending offer?
      const { data: a } = await supabase.from('delivery_assignments').select('id,request_id,status').eq('driver_id', driver.id).eq('status', 'offered').order('offered_at', { ascending: false }).limit(1).maybeSingle();
      if (a) {
        const { data: r } = await supabase.from('delivery_requests').select('pickup_address,dest_address,price,driver_earnings,item_type').eq('id', (a as any).request_id).maybeSingle();
        if (r) setOffer({ id: (a as any).id, request_id: (a as any).request_id, pickup: (r as any).pickup_address, dest: (r as any).dest_address, fee: Number((r as any).price), earnings: Number((r as any).driver_earnings), item: (r as any).item_type });
      } else setOffer(null);
    } else setOffer(null);
  }, [driver]);

  useEffect(() => { loadDriver(); }, [loadDriver]);
  useEffect(() => { const t = setInterval(poll, 5000); poll(); return () => clearInterval(t); }, [poll]);

  async function toggleOnline(v: boolean) {
    setOnline(v);
    if (!driver) return;
    await supabase.from('platform_drivers').update({ is_online: v }).eq('id', driver.id);
    if (v) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location needed', 'Enable location to receive deliveries.'); return; }
      watch.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 25 },
        (loc) => { supabase.rpc('driver_update_location', { p_lat: loc.coords.latitude, p_lng: loc.coords.longitude }); });
    } else { watch.current?.remove(); watch.current = null; }
  }

  async function respond(accept: boolean) {
    if (!offer) return;
    const { data } = await supabase.rpc('respond_to_offer', { p_assignment_id: offer.id, p_accept: accept });
    if ((data as any)?.error === 'subscription_inactive') Alert.alert('Subscription inactive', 'Renew your subscription to accept deliveries.');
    else if ((data as any)?.error === 'settlement_required') Alert.alert('Settle first', 'Pay your outstanding balance to accept deliveries.');
    setOffer(null); poll();
  }

  async function advance(status: string) { if (!active) return; await supabase.rpc('update_delivery_status', { p_request_id: active.id, p_status: status }); poll(); }
  async function complete() {
    if (!active || code.length < 4) return;
    const { data } = await supabase.rpc('verify_delivery_code', { p_request_id: active.id, p_code: code });
    if ((data as any)?.ok) { Alert.alert('Delivered', 'Delivery completed.'); setCode(''); loadDriver(); poll(); }
    else Alert.alert('Wrong code', 'The code does not match. Ask the customer again.');
  }
  async function settle() {
    if (balance <= 0 || settling) return;
    if (phone.trim().length < 6) { Alert.alert('Phone required', 'Enter your mobile money number.'); return; }
    setSettling(true);
    try {
      // Route through the gateway endpoint (real MoMo collect) like the web app,
      // authenticating with the driver's bearer token instead of cookies.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { Alert.alert('Session expired', 'Please sign in again.'); return; }
      const res = await fetch(`${API_BASE}/api/driver/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: balance, phone: phone.trim(), provider }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; live?: boolean };
      if (res.ok && data.ok) {
        Alert.alert('Settlement', data.live ? 'Submitted — approve the prompt on your phone.' : 'Recorded (test mode).');
        setPhone('');
        loadDriver();
      } else {
        Alert.alert('Could not settle', data.error === 'gateway_declined' ? 'Payment was declined.' : 'Please try again.');
      }
    } catch {
      Alert.alert('Network error', 'Please try again.');
    } finally {
      setSettling(false);
    }
  }

  const nextStatus: Record<string, { s: string; label: string }> = {
    assigned: { s: 'picked_up', label: 'Picked up' }, arriving: { s: 'picked_up', label: 'Picked up' },
    picked_up: { s: 'in_transit', label: 'Start transit' }, in_transit: { s: 'arrived', label: "I've arrived" },
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.h1}>Driver</Text>
          {driver && <Text style={styles.muted}>★ {driver.rating_avg} ({driver.rating_count}) · {driver.status}</Text>}
        </View>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}><Text style={styles.muted}>Sign out</Text></TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.bold}>{online ? 'Online' : 'Offline'}</Text>
          <Switch value={online} onValueChange={toggleOnline} trackColor={{ true: BRAND }} />
        </View>
        <Text style={styles.muted}>{online ? 'You will receive delivery offers.' : 'Go online to receive offers.'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.muted}>Owed to platform</Text>
        <Text style={styles.balance}>{balance} XAF</Text>
        {balance > 0 && (
          <View style={{ gap: 10, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['mtn', 'orange'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setProvider(p)}
                  style={[styles.provider, provider === p && styles.providerActive]}
                >
                  <Text style={{ color: provider === p ? BRAND : MUTED, fontWeight: '600' }}>
                    {p === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Mobile money number"
              placeholderTextColor={MUTED}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <TouchableOpacity style={styles.outline} onPress={settle} disabled={settling}>
              <Text style={styles.outlineText}>{settling ? 'Processing…' : `Settle ${balance} XAF`}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {offer && !active && (
        <View style={[styles.card, { borderColor: BRAND }]}>
          <Text style={styles.bold}>New delivery offer</Text>
          <Text style={styles.muted}>Pickup: {offer.pickup ?? '—'}</Text>
          <Text style={styles.muted}>Drop-off: {offer.dest ?? '—'}</Text>
          <Text style={[styles.bold, { color: BRAND, marginTop: 6 }]}>You earn {offer.earnings} XAF · {offer.item}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.primary, { flex: 1 }]} onPress={() => respond(true)}><Text style={styles.primaryText}>Accept</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.outline, { flex: 1 }]} onPress={() => respond(false)}><Text style={styles.outlineText}>Decline</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {active && (
        <View style={styles.card}>
          <Text style={styles.bold}>Active delivery</Text>
          <Text style={styles.muted}>To: {active.dest_address ?? '—'} · {active.status.replace('_', ' ')}</Text>
          {nextStatus[active.status] && (
            <TouchableOpacity style={styles.primary} onPress={() => advance(nextStatus[active.status].s)}><Text style={styles.primaryText}>{nextStatus[active.status].label}</Text></TouchableOpacity>
          )}
          {(active.status === 'in_transit' || active.status === 'arrived') && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.muted}>Enter the 4-digit code from the customer</Text>
              <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} placeholder="0000" placeholderTextColor={MUTED} />
              <TouchableOpacity style={styles.primary} onPress={complete}><Text style={styles.primaryText}>Complete delivery</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: INK },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  scroll: { padding: 20, paddingTop: 64, gap: 14 },
  h1: { color: '#f4f4f5', fontSize: 24, fontWeight: '700' },
  bold: { color: '#f4f4f5', fontWeight: '700' },
  muted: { color: MUTED, marginTop: 4 },
  balance: { color: '#f4f4f5', fontSize: 28, fontWeight: '700', marginTop: 2 },
  input: { backgroundColor: CARD, borderColor: LINE, borderWidth: 1, borderRadius: 12, color: '#f4f4f5', padding: 14, marginTop: 10 },
  primary: { backgroundColor: BRAND, borderRadius: 999, padding: 14, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#000', fontWeight: '700' },
  outline: { borderColor: LINE, borderWidth: 1, borderRadius: 999, padding: 14, alignItems: 'center', marginTop: 12 },
  outlineText: { color: '#f4f4f5', fontWeight: '600' },
  provider: { flex: 1, borderColor: LINE, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  providerActive: { borderColor: BRAND, backgroundColor: 'rgba(255,106,43,0.1)' },
  card: { backgroundColor: CARD, borderColor: LINE, borderWidth: 1, borderRadius: 18, padding: 16 },
  row: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
