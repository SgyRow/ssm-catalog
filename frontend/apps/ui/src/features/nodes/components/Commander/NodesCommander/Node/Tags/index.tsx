import type {NodeType} from "@/types"
import {Stack, Text} from "@mantine/core"
import classes from "./Tags.module.css"

type Args = {
  names: Array<string>
  maxItems?: number
  node?: NodeType
}

export default function Tags({maxItems, names}: Args) {
  if (!names.length) {
    return <Stack></Stack>
  }

  const limit = maxItems ?? 4
  const visible = names.slice(0, limit)
  const truncated = names.length > limit

  return (
    <Stack gap="xs" className={classes.tags}>
      {visible.map(name => (
        <Text key={name} size="sm">
          {name}
        </Text>
      ))}
      {truncated ? <Text size="sm">...</Text> : null}
    </Stack>
  )
}
