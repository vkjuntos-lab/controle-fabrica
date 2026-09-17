-- Bucket de avatares (storage). Leitura pública (bucket público), escrita e
-- remoção restritas ao dono do arquivo (caminho `<user_id>/...`).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 1572864, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública: qualquer um pode baixar avatares (não contém dados sensíveis).
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

-- Inserção: apenas autenticado e apenas dentro da própria pasta.
CREATE POLICY "avatars insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Atualização (upsert): apenas autenticado e na própria pasta.
CREATE POLICY "avatars update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Remoção: apenas o dono da pasta.
CREATE POLICY "avatars delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);