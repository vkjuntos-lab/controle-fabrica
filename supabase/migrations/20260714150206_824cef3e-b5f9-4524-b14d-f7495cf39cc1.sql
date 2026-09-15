UPDATE auth.users
SET encrypted_password = crypt('KsAdmin', gen_salt('bf')),
    updated_at = now()
WHERE email = 'admin@ksmultimake.local';