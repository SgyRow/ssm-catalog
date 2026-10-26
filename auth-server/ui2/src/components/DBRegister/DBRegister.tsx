import { useEffect, useState } from 'react';

import { Anchor, Button, PasswordInput, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  get_register_endpoint,
  get_register_profile_endpoint,
  get_redirect_endpoint,
} from '@/api';

type RegisterStep = 'credentials' | 'profile';

export default function DBRegister() {
  const { t } = useTranslation();
  const [step, setStep] = useState<RegisterStep>('credentials');
  const [error, setError] = useState<string>();
  const [accessToken, setAccessToken] = useState<string>();

  const credentialsForm = useForm({
    mode: 'uncontrolled',
    initialValues: { username: '', password: '', password_confirm: '' },
    validate: {
      password_confirm: (value, values) =>
        value !== values.password ? t('passwords do not match') : null,
    },
  });

  const profileForm = useForm({
    mode: 'uncontrolled',
    initialValues: { first_name: '', last_name: '', email: '' },
  });

  const [submittedCredentials, setSubmittedCredentials] = useState<
    typeof credentialsForm.values | null
  >(null);
  const [submittedProfile, setSubmittedProfile] = useState<
    typeof profileForm.values | null
  >(null);

  useEffect(() => {
    if (!submittedCredentials?.username || !submittedCredentials?.password) {
      return;
    }

    setError(undefined);
    fetch(get_register_endpoint(), {
      method: 'POST',
      body: JSON.stringify({
        username: submittedCredentials.username,
        password: submittedCredentials.password,
        password_confirm: submittedCredentials.password_confirm,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const detail = payload?.detail;
          setError(
            typeof detail === 'string'
              ? t(detail)
              : t('registration failed'),
          );
          return;
        }

        const payload = await response.json();
        setAccessToken(payload.access_token);
        setStep('profile');
      })
      .catch(() => {
        setError(t('registration failed'));
      });
  }, [submittedCredentials, t]);

  useEffect(() => {
    if (!submittedProfile?.first_name || !submittedProfile?.last_name || !submittedProfile?.email || !accessToken) {
      return;
    }

    setError(undefined);
    fetch(get_register_profile_endpoint(), {
      method: 'PATCH',
      body: JSON.stringify({
        first_name: submittedProfile.first_name,
        last_name: submittedProfile.last_name,
        email: submittedProfile.email,
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const detail = payload?.detail;
          setError(
            typeof detail === 'string'
              ? t(detail)
              : t('profile update failed'),
          );
          return;
        }

        const anchor = document.createElement('a');
        anchor.href = get_redirect_endpoint();
        anchor.click();
      })
      .catch(() => {
        setError(t('profile update failed'));
      });
  }, [submittedProfile, accessToken, t]);

  if (step === 'profile') {
    return (
      <form onSubmit={profileForm.onSubmit(setSubmittedProfile)}>
        <Text size="sm" c="dimmed" mb="md">
          {t('complete your profile')}
        </Text>
        <TextInput
          {...profileForm.getInputProps('first_name')}
          key={profileForm.key('first_name')}
          label={t('name')}
          placeholder={t('name')}
          required
        />
        <TextInput
          {...profileForm.getInputProps('last_name')}
          key={profileForm.key('last_name')}
          label={t('last name')}
          placeholder={t('last name')}
          required
          mt="md"
        />
        <TextInput
          {...profileForm.getInputProps('email')}
          key={profileForm.key('email')}
          label={t('email')}
          placeholder={t('email')}
          type="email"
          required
          mt="md"
        />
        <Button fullWidth mt="xl" type="submit">
          {t('continue')}
        </Button>
        <Text my="md" c="red">
          {error}
        </Text>
      </form>
    );
  }

  return (
    <form onSubmit={credentialsForm.onSubmit(setSubmittedCredentials)}>
      <TextInput
        {...credentialsForm.getInputProps('username')}
        key={credentialsForm.key('username')}
        label={t('username')}
        placeholder={t('username')}
        required
      />
      <PasswordInput
        {...credentialsForm.getInputProps('password')}
        key={credentialsForm.key('password')}
        label={t('password')}
        placeholder={t('your password')}
        required
        mt="md"
      />
      <PasswordInput
        {...credentialsForm.getInputProps('password_confirm')}
        key={credentialsForm.key('password_confirm')}
        label={t('confirm password')}
        placeholder={t('confirm password')}
        required
        mt="md"
      />
      <Button fullWidth mt="xl" type="submit">
        {t('register')}
      </Button>
      <Text ta="center" mt="md" size="sm">
        <Anchor component={Link} to="/">
          {t('already have account')}
        </Anchor>
      </Text>
      <Text my="md" c="red">
        {error}
      </Text>
    </form>
  );
}
