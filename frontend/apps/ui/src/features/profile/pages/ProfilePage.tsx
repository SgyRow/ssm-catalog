import ChangeOwnPasswordButton from "@/features/profile/components/ChangeOwnPasswordButton"
import {updateCurrentUserProfile} from "@/slices/currentUser"
import {
  selectCurrentUser,
  selectCurrentUserStatus
} from "@/slices/currentUser"
import type {AppDispatch} from "@/app/types"
import type {UserDetails} from "@/types"
import {Button, Loader, Paper, Stack, TextInput, Title} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {useEffect, useState} from "react"
import {useTranslation} from "react-i18next"
import {useDispatch, useSelector} from "react-redux"

export default function ProfilePage() {
  const {t} = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const status = useSelector(selectCurrentUserStatus)
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) {
      return
    }
    setEmail(user.email)
    setFirstName(user.first_name ?? "")
    setLastName(user.last_name ?? "")
  }, [user])

  if (status === "loading" || !user) {
    return <Loader />
  }

  const roleNames = user.roles?.map(r => r.name).join(", ") ?? ""

  const isDirty =
    email !== user.email ||
    firstName !== (user.first_name ?? "") ||
    lastName !== (user.last_name ?? "")

  const onSave = async () => {
    setSaving(true)
    try {
      await dispatch(
        updateCurrentUserProfile({
          email,
          first_name: firstName,
          last_name: lastName
        })
      ).unwrap()
      notifications.show({
        title: t("profile.saved"),
        color: "green"
      })
    } catch {
      notifications.show({
        title: t("profile.save_error"),
        color: "red"
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack p="md" gap="md" maw={480}>
      <Title order={3}>{t("profile.title")}</Title>
      <Paper withBorder p="md">
        <Stack>
          <TextInput
            label={t("users.form.username")}
            value={user.username}
            readOnly
          />
          <TextInput
            label={t("users.form.email")}
            value={email}
            onChange={e => setEmail(e.currentTarget.value)}
            type="email"
            required
          />
          <TextInput
            label={t("users.form.first_name")}
            value={firstName}
            onChange={e => setFirstName(e.currentTarget.value)}
          />
          <TextInput
            label={t("users.form.last_name")}
            value={lastName}
            onChange={e => setLastName(e.currentTarget.value)}
          />
          <TextInput
            label={t("users.form.roles")}
            value={roleNames}
            readOnly
          />
          <Button
            onClick={onSave}
            loading={saving}
            disabled={!isDirty || !email.trim()}
          >
            {t("common.save")}
          </Button>
          <ChangeOwnPasswordButton />
        </Stack>
      </Paper>
    </Stack>
  )
}
