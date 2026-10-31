-- =========================================================================
-- LRSYS - SRI LANKA CUSTOMS (CUSDEC) TERMINAL: SUPABASE DATABASE & STORAGE SCHEMA
-- Run this script in your Supabase project's SQL Editor (Dashboard > SQL Editor)
-- =========================================================================

-- 1. CusDec Declarations Table
CREATE TABLE IF NOT EXISTS public.cusdec_records (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  image_url TEXT NOT NULL,
  original_name TEXT,
  file_hash TEXT,
  green_stamp_number TEXT NOT NULL DEFAULT '000000',
  customs_ref_number TEXT NOT NULL DEFAULT 'UNKNOWN',
  customs_date TEXT,
  consignee_name TEXT NOT NULL DEFAULT 'UNKNOWN',
  consignee_tin TEXT,
  declarant_name TEXT NOT NULL DEFAULT 'NOT SPECIFIED',
  declarant_tin TEXT,
  bl_number TEXT,
  packages_count TEXT,
  goods_description TEXT,
  confidence NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'NEEDS_REVIEW',
  issues JSONB DEFAULT '[]'::jsonb,
  bounding_boxes JSONB,
  manual_correction BOOLEAN DEFAULT FALSE,
  macro_zoom_applied BOOLEAN DEFAULT FALSE,
  matched_master_name TEXT,
  merge_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup indexes for deduplication & search
CREATE INDEX IF NOT EXISTS idx_cusdec_stamp_ref ON public.cusdec_records (green_stamp_number, customs_ref_number);
CREATE INDEX IF NOT EXISTS idx_cusdec_hash ON public.cusdec_records (file_hash);
CREATE INDEX IF NOT EXISTS idx_cusdec_created_at ON public.cusdec_records (created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.cusdec_records ENABLE ROW LEVEL SECURITY;

-- Allow public/authenticated read and write (Service role automatically bypasses RLS)
CREATE POLICY "Allow public read on cusdec_records" 
ON public.cusdec_records FOR SELECT USING (true);

CREATE POLICY "Allow public write on cusdec_records" 
ON public.cusdec_records FOR ALL USING (true);


-- 2. Application Settings Table
CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  gemini_api_key TEXT,
  gemini_backup_api_key TEXT,
  gemini_model TEXT DEFAULT 'gemini-3.5-flash-lite',
  auto_verify_threshold INTEGER DEFAULT 90,
  worker_concurrency INTEGER DEFAULT 4,
  consignor_consignee_mode TEXT DEFAULT 'both',
  preserve_leading_zeros BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO public.app_settings (id, gemini_model, auto_verify_threshold, worker_concurrency)
VALUES ('default', 'gemini-3.5-flash-lite', 90, 4)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on app_settings" 
ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Allow public write on app_settings" 
ON public.app_settings FOR ALL USING (true);


-- 3. Supabase Storage Bucket for Document Scans
-- Create bucket 'cusdec-documents' with public access
INSERT INTO storage.buckets (id, name, public) 
VALUES ('cusdec-documents', 'cusdec-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policy for document images
CREATE POLICY "Public Document Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'cusdec-documents');

-- Insert policy for uploading declarations
CREATE POLICY "Allow Document Uploads" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'cusdec-documents');

-- Update policy
CREATE POLICY "Allow Document Updates" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'cusdec-documents');

-- Delete policy
CREATE POLICY "Allow Document Deletes" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'cusdec-documents');

