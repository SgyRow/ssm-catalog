import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import {Loader, Text} from "@mantine/core"
import {Navigate} from "react-router-dom"
import {useTranslation} from "react-i18next"

/** Redirect `/portal` to the root folder listing. */
export default function PortalHomeRedirect() {
  const {t} = useTranslation()
  const {data, isLoading, error} = useGetPortalRootQuery()

  if (isLoading) {
    return <Loader />
  }

  if (error || !data) {
    return (
      <Text p="md" c="dimmed">
        {t("portal.unavailable_bootstrap")}
      </Text>
    )
  }

  return <Navigate to={`/portal/folder/${data.id}`} replace />
}
