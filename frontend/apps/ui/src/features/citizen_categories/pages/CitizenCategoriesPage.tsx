import {Stack, Text} from "@mantine/core"
import {useTranslation} from "react-i18next"

import classes from "@/components/ViewportPage.module.css"
import CitizenCategoriesList from "@/features/citizen_categories/components/CitizenCategoriesList"
import ManageCitizenCategoriesToolbar from "@/features/citizen_categories/components/ManageCitizenCategories"

export default function CitizenCategoriesPage() {
  const {t} = useTranslation()

  return (
    <div className={classes.page}>
      <Stack className={classes.scroll} gap="md" p="md">
        <ManageCitizenCategoriesToolbar />
        <Text c="dimmed" size="sm">
          {t("citizen_categories.hint")}
        </Text>
        <CitizenCategoriesList />
      </Stack>
    </div>
  )
}
