'use strict';

window.PeopleFlowCloud = (() => {
  let client;

  function initialize() {
    const config = window.PEOPLEFLOW_CONFIG || {};
    if (!config.url || !config.publishableKey) {
      throw new Error('Supabase setup required: add your Project URL and publishable key in supabase-config.js.');
    }
    if (!/^https:\/\/[^/]+\/?$/.test(config.url)) {
      throw new Error('Use the HTTPS Supabase Project URL without a path.');
    }
    if (config.publishableKey.startsWith('sb_secret_')) {
      throw new Error('Use a publishable key, never a secret key in this file.');
    }
    if (config.publishableKey.startsWith('eyJ')) {
      try {
        const payload = JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.role !== 'anon') throw new Error('unsafe-key');
      } catch {
        throw new Error('Use a valid anon/publishable key. Service-role keys are not allowed.');
      }
    }
    if (!window.supabase) throw new Error('The Supabase library could not load. Check your internet connection.');
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return client;
  }

  async function rpc(name, params = {}) {
    if (!client) throw new Error('Supabase is not configured.');
    const { data, error } = await client.rpc(name, params);
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    initialize,
    rpc,
    async session() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async login(email, password) {
      if (!client) initialize();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session;
    },
    async logout() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
    onAuthChange(callback) {
      return client.auth.onAuthStateChange(callback);
    }
  };
})();
