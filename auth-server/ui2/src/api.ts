export function get_api_base_url(): string {
  return import.meta.env.VITE_TOKEN_BASE_URL ?? '';
}

export function get_token_endpoint(): string {
  const base_url = get_api_base_url();
  if (base_url) {
    return `${base_url}/api/token`;
  }
  return '/api/token';
}

export function get_register_endpoint(): string {
  const base_url = get_api_base_url();
  if (base_url) {
    return `${base_url}/api/register`;
  }
  return '/api/register';
}

export function get_register_profile_endpoint(): string {
  const base_url = get_api_base_url();
  if (base_url) {
    return `${base_url}/api/register/profile`;
  }
  return '/api/register/profile';
}

export function get_redirect_endpoint(): string {
  const base_url = import.meta.env.VITE_REDIRECT_BASE_URL;
  if (base_url) {
    return `${base_url}/home`;
  }
  return '/home';
}
