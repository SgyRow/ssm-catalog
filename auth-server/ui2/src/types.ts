
export type TAuthTokenPayload = {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope: string;
  refresh_token: string;
};

export type TResponseTypeBasedProps<T> =
  | {
      responseType: 'code';
      onSuccess?: (payload: T) => void;
      // TODO Adjust payload type
    }
  | {
      responseType: 'token';
      onSuccess?: (payload: T) => void;
    };


export type LoginProvider = 'db' | 'ldap'

export type TOauth2Props<T = TAuthTokenPayload> = {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  extraQueryParameters?: Record<string, any>;
  onError?: (error: string) => void;
} & TResponseTypeBasedProps<T>;


export type RuntimeConfig = {
  oidc: OIDCProviderType;
  /*
  There are two types of buttons to sign in:
  1. OIDC
  2. default login button
  When signing in via default login button - backend can authenticate via
  DB or via LDAP. `login_provider` attribute is there to distinguish between
  DB or LDAP authentication.
  */
  login_provider: LoginProvider
  registration_enabled?: boolean
}

declare global {

  type OIDCProviderType = {
    redirect_url: string,
    authorize_url: string,
    client_id: string,
    scope: string
  }

  interface Window {
    __PAPERMERGE_RUNTIME_CONFIG__: RuntimeConfig;
  }
}
