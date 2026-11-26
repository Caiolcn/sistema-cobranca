-- Foto do aluno: "new row violates row-level security policy" — 26/11/2026
-- ---------------------------------------------------------------------------
-- O bucket "avatars" (onde a ficha do aluno guarda a foto) foi criado sem
-- nenhuma regra de acesso. Com RLS ligado no storage, sem regra = ninguém
-- grava. Por isso o bucket está com 0 arquivos: a foto nunca funcionou.
--
-- Correção: mesma regra do bucket "logos" — cada conta só mexe na própria
-- pasta (avatars/<user_id>/...). Admin também pode (modo "ver como").
-- O bucket continua público para LEITURA pela URL (a foto aparece na lista).
--
-- Rode tudo de uma vez no SQL Editor.

-- Limite de 2 MB e só imagem (o front já barra acima de 2 MB).
UPDATE storage.buckets
   SET file_size_limit = 2097152,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
 WHERE id = 'avatars';

DROP POLICY IF EXISTS "avatars_dono_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_dono_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_dono_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_dono_delete" ON storage.objects;

-- SELECT é necessário para o upsert (trocar a foto de quem já tem uma).
CREATE POLICY "avatars_dono_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

CREATE POLICY "avatars_dono_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

CREATE POLICY "avatars_dono_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()))
  WITH CHECK (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

CREATE POLICY "avatars_dono_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

-- Conferência: deve voltar 4
SELECT count(*) AS regras_avatars
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'avatars_dono_%';
