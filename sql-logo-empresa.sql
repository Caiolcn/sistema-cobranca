-- =============================================
-- LOGO DA EMPRESA - Migração
-- Rodar no Supabase SQL Editor
-- =============================================

-- 1. Adicionar coluna logo_url na tabela usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Criar bucket de storage para logos (rodar via Supabase Dashboard > Storage > New Bucket)
-- Nome: logos
-- Public: SIM
-- Ou via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Política para upload: apenas usuario autenticado pode fazer upload na sua pasta
CREATE POLICY "Usuarios podem fazer upload de logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Política para update/upsert: apenas usuario autenticado pode atualizar na sua pasta
CREATE POLICY "Usuarios podem atualizar logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Política para leitura pública (logo aparece no portal público)
CREATE POLICY "Logos sao publicas para leitura"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'logos');

-- 6. Política para delete: usuario pode deletar sua logo
CREATE POLICY "Usuarios podem deletar logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
