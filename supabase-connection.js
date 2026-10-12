/* Supabase browser client. Only use the project's public anon/publishable key here. */
(function () {
  const SUPABASE_URL = "https://qscgehyemmvflcxdishc.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_3qrWTSX3plJXy7U-WXgrJA_pGgJu6kk";

  const clientReady = import("https://esm.sh/@supabase/supabase-js@2")
    .then(({createClient}) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    }));

  function profileToDoctor(profile) {
    return {
      name: profile.full_name,
      username: profile.username,
      id: profile.doctor_id,
      role: profile.role,
      authId: profile.id
    };
  }

  async function getDoctorProfile(client, user) {
    const {data, error} = await client
      .from("doctor_profiles")
      .select("id, full_name, username, doctor_id, role")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    return profileToDoctor(data);
  }

  async function setDisplaySession(doctor) {
    let loginAt = Date.now();
    const previous = localStorage.getItem("fiq_session");
    if (previous) {
      try {
        const previousSession = JSON.parse(previous);
        if (previousSession.authId === doctor.authId && Number.isFinite(previousSession.loginAt)) {
          loginAt = previousSession.loginAt;
        }
      } catch (error) {
        console.warn("Se reemplazará un perfil local de sesión con formato inválido.", error);
      }
    }
    localStorage.setItem("fiq_session", JSON.stringify({...doctor, loginAt}));
    sessionStorage.removeItem("fiq_session");
  }

  window.supabaseApp = {
    ready: () => clientReady,

    async signUpDoctor({password, fullName, username, doctorId}) {
      const client = await clientReady;
      const {data, error} = await client.functions.invoke("register-doctor", {
        body: {
          password,
          fullName,
          username: username.trim().toLowerCase(),
          doctorId: doctorId.trim()
        }
      });
      if (error) {
        let message = "No se pudo crear la cuenta.";
        try {
          const response = await error.context?.json();
          if (response?.error) message = response.error;
        } catch (parseError) {
          console.warn("No se pudo leer el detalle del error de registro.", parseError);
        }
        throw new Error(message);
      }
      if (!data?.session?.access_token || !data?.session?.refresh_token || !data?.user) {
        throw new Error(data?.error || "El servidor no devolvió una sesión válida.");
      }
      const {error: sessionError} = await client.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
      if (sessionError) throw sessionError;
      const doctor = await getDoctorProfile(client, data.user);
      await setDisplaySession(doctor);
      return {session: data.session, user: data.user};
    },

    async signInDoctor(username, password) {
      const client = await clientReady;
      const {data, error} = await client.functions.invoke("login-by-username", {
        body: {username: username.trim().toLowerCase(), password}
      });
      if (error) {
        let message = data?.error || "No se pudo iniciar sesión. Verifica el usuario y la contraseña.";
        try {
          const response = await error.context?.json();
          if (response?.error) message = response.error;
        } catch (parseError) {
          console.warn("No se pudo leer el detalle del error de inicio de sesión.", parseError);
        }
        throw new Error(message);
      }
      if (!data?.session || !data?.user) {
        throw new Error("No se pudo iniciar sesión. Verifica el usuario y la contraseña.");
      }
      const {error: sessionError} = await client.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
      if (sessionError) throw sessionError;
      const doctor = await getDoctorProfile(client, data.user);
      await setDisplaySession(doctor);
      return doctor;
    },

    async currentDoctor() {
      const client = await clientReady;
      const {data: sessionData, error: sessionError} = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) return null;
      const {data, error} = await client.auth.getUser();
      if (error) throw error;
      if (!data.user) return null;
      const doctor = await getDoctorProfile(client, data.user);
      await setDisplaySession(doctor);
      return doctor;
    },

    async requireDoctor() {
      const doctor = await this.currentDoctor();
      if (!doctor) {
        location.replace("login.html");
        return null;
      }
      return doctor;
    },

    async signOut() {
      const client = await clientReady;
      const {error} = await client.auth.signOut();
      if (error) throw error;
      localStorage.removeItem("fiq_session");
      sessionStorage.removeItem("fiq_session");
      location.replace("login.html");
    },

    async getPatients() {
      const client = await clientReady;
      const {data, error} = await client
        .from("patients")
        .select("*, clinical_assessments(*), patient_observations(*, doctor_profiles!patient_observations_author_id_fkey(full_name)), patient_images(*)")
        .order("full_name");
      if (error) throw error;
      return data;
    },

    async getAppointments() {
      const client = await clientReady;
      const {data, error} = await client
        .from("appointments")
        .select("id, patient_id, appointment_date, appointment_time, reason")
        .order("appointment_date")
        .order("appointment_time");
      if (error) throw error;
      return data.map(item => ({
        id: item.id,
        patientId: item.patient_id || "",
        date: item.appointment_date,
        time: String(item.appointment_time).slice(0, 5),
        reason: item.reason || ""
      }));
    },

    async saveAppointment(appointment) {
      const client = await clientReady;
      const {data: userData, error: userError} = await client.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Inicia sesión para guardar citas.");

      const row = {
        doctor_id: userData.user.id,
        patient_id: appointment.patientId || null,
        appointment_date: appointment.date,
        appointment_time: appointment.time,
        reason: appointment.reason || null
      };
      const query = appointment.id
        ? client.from("appointments").update(row).eq("id", appointment.id)
        : client.from("appointments").insert(row);
      const {error} = await query;
      if (error) throw error;
    },

    async deleteAppointment(id) {
      const client = await clientReady;
      const {error} = await client.from("appointments").delete().eq("id", id);
      if (error) throw error;
    }
  };

  // Update public.doctor_profiles
  // set role = 'Administrator'
  // where username = 'TU_USUARIO';
  // select p.username, p.role, u.email_confirmed_at
  // from public.doctor_profiles p
  // left join auth.users u on u.id = p.id
  // where lower(p.username) = lower('TU_USUARIO');
})();
