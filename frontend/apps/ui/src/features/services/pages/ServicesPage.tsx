import classes from "@/components/ViewportPage.module.css"
import GosuslugiLogo from "@/features/services/GosuslugiLogo"
import tileClasses from "@/features/services/Services.module.css"
import {
  useCreateExternalServiceMutation,
  useDeleteExternalServiceMutation,
  useGetExternalServicesQuery,
  type ExternalService
} from "@/features/services/servicesApiSlice"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton
} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {IconPlus, IconTrash} from "@tabler/icons-react"
import {useState} from "react"
import {useTranslation} from "react-i18next"
import {useSelector} from "react-redux"

function openService(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}

function ServiceLogo({service}: {service: ExternalService}) {
  if (service.slug === "gosuslugi") {
    return <GosuslugiLogo size={56} />
  }
  if (service.logo_url) {
    return (
      <img
        className={tileClasses.logo}
        src={service.logo_url}
        alt=""
        referrerPolicy="no-referrer"
      />
    )
  }
  const letter = (service.title.trim()[0] || "?").toUpperCase()
  return <div className={tileClasses.fallback}>{letter}</div>
}

export default function ServicesPage() {
  const {t} = useTranslation()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const isAdmin = Boolean(user?.is_superuser)
  const {data, isLoading, isError} = useGetExternalServicesQuery()
  const [createService, createState] = useCreateExternalServiceMutation()
  const [deleteService, deleteState] = useDeleteExternalServiceMutation()
  const [opened, {open, close}] = useDisclosure(false)
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const onCreate = async () => {
    setFormError(null)
    try {
      await createService({
        title: title.trim(),
        url: url.trim(),
        logo_url: logoUrl.trim() || null
      }).unwrap()
      setTitle("")
      setUrl("")
      setLogoUrl("")
      close()
    } catch {
      setFormError(t("services.save_error"))
    }
  }

  if (isLoading) {
    return <Loader />
  }

  if (isError) {
    return (
      <Text p="md" c="red">
        {t("services.load_error")}
      </Text>
    )
  }

  const rows = data ?? []

  return (
    <div className={classes.page}>
      <Stack className={classes.scroll} p="md" gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>{t("services.title")}</Title>
          {isAdmin ? (
            <Button leftSection={<IconPlus size={16} />} onClick={open}>
              {t("services.add")}
            </Button>
          ) : null}
        </Group>
        {rows.length === 0 ? (
          <Text c="dimmed">{t("services.empty")}</Text>
        ) : (
          <div className={tileClasses.grid}>
            {rows.map(service => (
              <div key={service.id} className={tileClasses.tileWrap}>
                {isAdmin && !service.builtin ? (
                  <ActionIcon
                    className={tileClasses.remove}
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label={t("common.delete")}
                    loading={deleteState.isLoading}
                    onClick={() => {
                      if (window.confirm(t("services.delete_confirm"))) {
                        void deleteService(service.id)
                      }
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                ) : null}
                <UnstyledButton
                  className={tileClasses.tile}
                  onClick={() => openService(service.url)}
                >
                  <ServiceLogo service={service} />
                  <Text fw={650} size="sm">
                    {service.title}
                  </Text>
                </UnstyledButton>
              </div>
            ))}
          </div>
        )}
      </Stack>
      <Modal opened={opened} onClose={close} title={t("services.add")}>
        <Stack>
          <TextInput
            label={t("services.field_title")}
            value={title}
            onChange={e => setTitle(e.currentTarget.value)}
            required
          />
          <TextInput
            label={t("services.field_url")}
            placeholder="https://"
            value={url}
            onChange={e => setUrl(e.currentTarget.value)}
            required
          />
          <TextInput
            label={t("services.field_logo")}
            placeholder="https://"
            value={logoUrl}
            onChange={e => setLogoUrl(e.currentTarget.value)}
          />
          {formError ? (
            <Text size="sm" c="red">
              {formError}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void onCreate()}
              loading={createState.isLoading}
              disabled={!title.trim() || !url.trim()}
            >
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  )
}
