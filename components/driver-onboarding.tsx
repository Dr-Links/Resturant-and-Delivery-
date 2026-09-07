'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const KYC_BUCKET = 'kyc';

function extOf(file: File): string {
  const fromName = file.name.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

// Become-a-driver + KYC submission. Creates the platform_drivers row, uploads
// documents to the PRIVATE kyc bucket under the driver's own uid folder (RLS:
// "kyc owner insert"), and records the object PATHS on driver_kyc for the admin
// to review via signed URLs. Driver starts 'pending' until an admin approves.
export function DriverOnboarding({ userId, onDone, onSignOut }: { userId: string; onDone: () => void; onSignOut: () => void }) {
  const supabase = createClient();
  const [vehicle, setVehicle] = useState('Motorbike');
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [license, setLicense] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File, kind: string): Promise<string> {
    const path = `${userId}/${kind}-${Date.now()}.${extOf(file)}`;
    const { error } = await supabase.storage.from(KYC_BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) throw error;
    return path;
  }

  async function submit() {
    if (busy) return;
    if (!fullName.trim() || !idNumber.trim()) { setErr('Enter your full name and ID number.'); return; }
    if (!idDoc || !selfie) { setErr('An ID document and a selfie are required.'); return; }
    setBusy(true); setErr(null);
    try {
      // 1) Create the platform_drivers row (RLS: profile_id = auth.uid()).
      const { data: drv, error: drvErr } = await supabase
        .from('platform_drivers')
        .insert({ profile_id: userId, vehicle })
        .select('id')
        .single();
      if (drvErr || !drv) throw drvErr ?? new Error('Could not create driver profile.');

      // 2) Upload documents to the private bucket under this driver's folder.
      const idDocPath = await upload(idDoc, 'id_doc');
      const selfiePath = await upload(selfie, 'selfie');
      const licensePath = license ? await upload(license, 'license') : null;

      // 3) Record KYC with the object PATHS (admin views them via signed URLs).
      const { error: kycErr } = await supabase.from('driver_kyc').insert({
        driver_id: (drv as { id: string }).id,
        full_name: fullName.trim(),
        id_number: idNumber.trim(),
        id_doc_url: idDocPath,
        license_url: licensePath,
        selfie_url: selfiePath,
      });
      if (kycErr) throw kycErr;

      onDone();
    } catch (e) {
      setErr((e as { message?: string })?.message ?? 'Submission failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const FileRow = ({ label, required, file, onPick }: { label: string; required?: boolean; file: File | null; onPick: (f: File | null) => void }) => (
    <label className="block">
      <span className="text-sm text-muted">{label}{required && ' *'}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-1.5 file:text-black file:font-semibold"
      />
      {file && <span className="text-xs text-brand">{file.name}</span>}
    </label>
  );

  return (
    <main className="min-h-screen max-w-lg mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Become a driver</h1>
        <button onClick={onSignOut} className="text-xs text-muted">Sign out</button>
      </div>
      <p className="text-sm text-muted mb-4">Submit your details and documents. An admin reviews your KYC before you can accept deliveries.</p>

      <div className="rounded-2xl border border-line bg-card p-4 space-y-4">
        <label className="block">
          <span className="text-sm text-muted">Vehicle</span>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-1 w-full rounded-xl bg-ink border border-line px-3 py-2 outline-none focus:border-brand">
            {['Motorbike', 'Bicycle', 'Car', 'Van', 'On foot'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-muted">Full name *</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full rounded-xl bg-ink border border-line px-4 py-2.5 outline-none focus:border-brand" />
        </label>
        <label className="block">
          <span className="text-sm text-muted">ID number *</span>
          <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className="mt-1 w-full rounded-xl bg-ink border border-line px-4 py-2.5 outline-none focus:border-brand" />
        </label>

        <FileRow label="ID document" required file={idDoc} onPick={setIdDoc} />
        <FileRow label="Driver's licence" file={license} onPick={setLicense} />
        <FileRow label="Selfie" required file={selfie} onPick={setSelfie} />

        {err && <p className="text-sm text-red-400">{err}</p>}
        <button onClick={submit} disabled={busy} className="w-full rounded-full bg-brand text-black py-3 font-semibold disabled:opacity-60">
          {busy ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>
    </main>
  );
}
