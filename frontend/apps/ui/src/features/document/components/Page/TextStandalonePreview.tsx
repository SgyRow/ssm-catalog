import {Box, ScrollArea} from "@mantine/core"

import classes from "./TextStandalonePreview.module.css"

export type TextStandalonePreviewMode = "pane" | "modal" | "embed"

interface Props {
  children: string
  mode: TextStandalonePreviewMode
}

/** TXT blob preview styling: pane = standalone viewer; modal = same look + inner scroll; embed = page list (plain pre + scroll). */
export function TextStandalonePreview({children, mode}: Props) {
  if (mode === "pane") {
    return (
      <Box component="pre" className={classes.textStandalone}>
        {children}
      </Box>
    )
  }
  if (mode === "modal") {
    return (
      <Box className={classes.modalScrollShell}>
        <Box component="pre" className={classes.textStandalone}>
          {children}
        </Box>
      </Box>
    )
  }
  const pre = (
    <Box
      component="pre"
      style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0}}
    >
      {children}
    </Box>
  )
  return (
    <ScrollArea style={{maxHeight: "80vh", width: "100%"}} type="auto">
      {pre}
    </ScrollArea>
  )
}
