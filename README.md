# NeuroSTEP IA con Supabase

GitHub Pages publica la interfaz estática. Supabase proporciona autenticación, base de datos y las funciones de registro e inicio de sesión.

## Configurar Supabase

1. Ejecuta `database.sql` una vez en **Supabase → SQL Editor**.
2. Despliega las funciones de Edge desde esta carpeta:

   ```powershell
   supabase login
   supabase link --project-ref qscgehyemmvflcxdishc
   supabase functions deploy register-doctor
   supabase functions deploy login-by-username
   ```

3. En **Supabase → Project Settings → Edge Functions → Secrets**, verifica `SUPABASE_URL` y configura `SUPABASE_PUBLISHABLE_KEY` con la clave publicable del proyecto y `SUPABASE_SECRET_KEY` con una clave secreta nueva. Las funciones aceptan las variables heredadas `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` como alternativa. La clave secreta es solo para Edge Functions: nunca la pongas en archivos del sitio, GitHub Pages o GitHub.
4. El registro crea una cuenta confirmada automáticamente mediante `email_confirm: true`; el acceso de la aplicación usa nombre de usuario y contraseña y no requiere verificación ni correo real.
5. Para dar rol administrador a una cuenta, registra primero al doctor y luego ejecuta en SQL Editor:

   ```sql
   update public.doctor_profiles
   set role = 'Administrator'
   where username = 'TU_USUARIO';
   ```

   Cierra la sesión y vuelve a iniciar sesión para que se actualice el rol.

## Publicar en GitHub Pages

1. Sube los archivos del proyecto a la raíz de un repositorio de GitHub.
2. En **Settings → Pages**, publica desde la rama principal y la carpeta raíz (`/root`).
3. Abre la URL `https://TU_USUARIO.github.io/TU_REPOSITORIO/`.

La página usa la URL y la clave pública/publishable de Supabase desde `supabase-connection.js`. Esas credenciales públicas se protegen con las políticas RLS de `database.sql`; nunca agregues una clave secreta al frontend. El paquete `@supabase/server` no se instala porque GitHub Pages no ejecuta código Node del servidor; la conexión privilegiada corre en las funciones de Supabase.
