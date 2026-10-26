import { useEffect, useState } from 'react';

import { Anchor, Button, PasswordInput, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Link } from 'react-router-dom';

import { get_runtime_config } from '@/RuntimeConfig';
import { RuntimeConfig } from '@/types';
import { useTranslation } from "react-i18next";

import { get_token_endpoint, get_redirect_endpoint } from '@/api';
export default function Login() {
  const {t} = useTranslation()
  const [error, setError] = useState<string>()
  const config: RuntimeConfig | undefined = get_runtime_config();
  const registrationEnabled = config?.registration_enabled !== false;
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { username: '', password: '' },
  });
  const [submittedValues, setSubmittedValues] = useState<typeof form.values | null>(null);

  useEffect(() => {
    if (submittedValues?.password && submittedValues.username) {
       // only if both username and password are provided and not empty
      let config: RuntimeConfig | undefined = get_runtime_config();
      let provider = 'db';
      const username = submittedValues?.username
      const password = submittedValues?.password

      if (config) {
        provider = config.login_provider;
      }

      let body = JSON.stringify({username, password, provider});
      fetch(
        get_token_endpoint(),
        {
          method:'POST',
          body: body,
          headers: {
            "Content-Type": "application/json",
          }
        },
      )
      .then(response => {
          if (response.status == 401) {
            setError("Username or password incorrect");
          } else if (response.status != 200) {
            setError(`Error: status code ${response.status}`);
          } else {
            const target = get_redirect_endpoint()
            const here = window.location.pathname
            // Already on /home: a same-URL link click does not replace the
            // login document nginx served after a rejected cookie.
            if (here === "/home" || here.indexOf("/home/") === 0) {
              window.location.reload()
            } else {
              window.location.assign(target)
            }
          }
        }
      ).catch(error => {
        console.log(`There was an error ==='${error}'===`);
      });
    }
  }, [submittedValues?.username, submittedValues?.password])

  return (
    <form onSubmit={form.onSubmit(setSubmittedValues)}>
        <TextInput
          {...form.getInputProps('username')}
          key={form.key('username')}
          label={t("username")}
          placeholder={t("username")}
          required />
        <PasswordInput
          {...form.getInputProps('password')}
          key={form.key('password')}
          label={t("password")}
          placeholder={t("your password")}
          required mt="md" />
        <Button fullWidth mt="xl" type="submit">
          {t("signin")}
        </Button>
        {registrationEnabled && (
          <Text ta="center" mt="md" size="sm">
            <Anchor component={Link} to="/register">
              {t("create account")}
            </Anchor>
          </Text>
        )}
        <Text my={"md"} c="red">
          {error}
        </Text>
    </form>
  );
}