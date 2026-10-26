import {Anchor, Breadcrumbs, Stack, Text} from "@mantine/core"
import {Link, useParams} from "react-router-dom"
import {useTranslation} from "react-i18next"

import classes from "@/components/ViewportPage.module.css"
import CitizenCategoryFoldersList from "@/features/citizen_categories/components/CitizenCategoryFoldersList"
import {useGetCitizenCategoriesQuery} from "@/features/citizen_categories/citizenCategoriesApiSlice"

export default function CitizenCategoryDetailPage() {
  const {t} = useTranslation()
  const {categoryId} = useParams<{categoryId: string}>()
  const {data: categories} = useGetCitizenCategoriesQuery()
  const category = categories?.find(c => c.id === categoryId)

  if (!categoryId) {
    return null
  }

  return (
    <div className={classes.page}>
    <Stack className={classes.scroll} gap="md" p="md">
      <Breadcrumbs separator="›">
        <Anchor component={Link} to="/citizen-categories" size="sm">
          {t("citizen_categories.nav")}
        </Anchor>
        <Text size="sm" fw={600}>
          {category?.name ?? "…"}
        </Text>
      </Breadcrumbs>
      {category?.description ? (
        <Text c="dimmed" size="sm">
          {category.description}
        </Text>
      ) : null}
      <CitizenCategoryFoldersList categoryId={categoryId} />
    </Stack>
    </div>
  )
}
